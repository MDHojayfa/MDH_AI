/**
 * core/agent.js — the loop.
 *
 * One message in, at most one call out, one result back. Every rule that matters is enforced *here*,
 * not in the prompt, because a prompt is a suggestion and this is not:
 *
 *   · one call per message           · never re-send after a refusal (the ladder is the only way back)
 *   · answer each turn at most once  · dedup identical calls (15 min, cap 4)      · always deliver something
 *
 * The state machine is small on purpose; the interesting part is the waiting, and the waiting is where
 * every one of these projects breaks (`docs/ARCHITECTURE.md` §4).
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const api = MDH.api;
  const log = () => MDH.log;

  const S = {
    running: false,
    phase: 'idle',
    outcome: null,
    turn: 0,
    task: '',
    adapter: null,
    tools: [],
    schemas: {},
    startedAt: 0,
    lastSendAt: 0,
    sentTimes: [],
    stopped: false,
    pendingCall: null,
    sameCall: { key: '', n: 0 },
    errors: 0,
    parseFailures: 0,
    resultSeq: 0,
  };

  const LIMITS = {
    maxTurns: 60,
    maxSameCall: 4,
    maxErrors: 3,
    dedupWindowMs: 15 * 60 * 1000,
    hiddenIdleFactor: 1,
  };

  // ─────────────────────────────────────────────────────────────── DOM I/O

  const visible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);

  function firstVisible(selectors = []) {
    for (const sel of selectors) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const node of nodes) if (visible(node)) return node;
    }
    return null;
  }

  function composer(adapter) {
    return firstVisible(adapter?.dom?.composer ?? []);
  }

  function setComposerText(el, text) {
    if (!el) return false;
    el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (el.isContentEditable) {
      // ProseMirror/Quill ignore innerHTML assignment; execCommand produces a real input event.
      const selection = document.getSelection();
      selection?.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection?.addRange(range);
      const ok = document.execCommand('insertText', false, text);
      if (!ok) {
        el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
        el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
      }
      return true;
    }
    return false;
  }

  const composerText = (el) => (el ? (el.value ?? el.innerText ?? el.textContent ?? '').trim() : '');

  const isStreaming = (adapter) => !!firstVisible(adapter?.dom?.stop ?? []);

  function clickSend(adapter) {
    const btn = firstVisible(adapter?.dom?.send ?? []);
    if (!btn) return false;
    btn.click();
    return true;
  }

  function assistantText(adapter) {
    const nodes = [];
    for (const sel of adapter?.dom?.messages ?? []) {
      try {
        for (const node of document.querySelectorAll(sel)) if (visible(node)) nodes.push(node);
      } catch {
        /* bad selector from a stale adapter: ignore */
      }
    }
    if (!nodes.length) return { count: 0, text: '' };
    const last = nodes[nodes.length - 1];
    return { count: nodes.length, text: (last.innerText ?? last.textContent ?? '').trim() };
  }

  // ─────────────────────────────────────────────────────────── the governor

  function hidden() {
    return document.visibilityState === 'hidden';
  }

  function timingFor(adapter, key) {
    const t = adapter?.timings ?? {};
    const hiddenProfile = { idleMs: 20000, stableMs: 30000, ...(t.hidden ?? {}) };
    const base = {
      idleMs: t.idleMs ?? 2500,
      stableMs: t.stableMs ?? 3500,
      warmupMs: t.warmupMs ?? 45000,
      timeoutMs: t.timeoutMs ?? 300000,
    };
    if (!hidden()) return base[key];
    // A hidden tab is slow, not stopped (D14). Only the idle/stable windows stretch.
    if (key === 'idleMs' || key === 'stableMs') return hiddenProfile[key];
    return base[key];
  }

  /**
   * Serialised, spaced, capped — `docs/ARCHITECTURE.md` §6. Every send goes through here.
   * Rushing a free tier is how a person ends up explaining a ban to their future self, who is not amused.
   */
  async function governorWait(adapter) {
    const pace = await MDH.state.get('pace');
    const minGap = adapter?.pace?.minGapMs ?? 3000;
    const perMinute = adapter?.pace?.perMinute ?? 8;
    const mult = pace.mult ?? 1;
    const now = Date.now();

    const windowStart = now - 60000;
    const recent = (pace.sentTimes ?? []).filter((t) => t > windowStart);
    const gapLeft = Math.max(0, Math.min(minGap * mult, 60000) - (now - (S.lastSendAt || 0)));
    const capLeft = recent.length >= Math.ceil(perMinute / mult) ? 60000 - (now - recent[0]) : 0;
    const wait = Math.max(gapLeft, capLeft, 0);
    if (wait > 0) {
      log()?.debug('governor waits', wait, 'ms', { mult, recent: recent.length });
      await MDH.util.sleep(wait);
    }
  }

  async function noteSend() {
    S.lastSendAt = Date.now();
    const pace = await MDH.state.get('pace');
    const sentTimes = (pace.sentTimes ?? []).filter((t) => t > Date.now() - 60000).concat([S.lastSendAt]);
    await MDH.state.patchSoon('pace', { sentTimes, lastSendAt: S.lastSendAt });
  }

  // ────────────────────────────────────────────────────────── the reply wait

  function waitForReply(adapter) {
    return new Promise((resolve) => {
      const started = Date.now();
      const before = assistantText(adapter);
      let best = '';
      let lastChangeAt = 0;
      let streamStarted = false;
      let finished = false;
      let cancelStream = null;
      let ticker = null;

      const done = (outcome) => {
        if (finished) return;
        finished = true;
        cancelStream?.();
        clearInterval(ticker);
        resolve({ text: best, outcome, ms: Date.now() - started });
      };

      cancelStream = MDH.interceptor.on((kind, payload) => {
        if (kind === 'begin') {
          streamStarted = true;
          lastChangeAt = Date.now();
        }
        if (kind === 'refusal') {
          onRefusal(String(payload?.text ?? '')).catch((e) => log()?.error('ladder failed', e));
          done('failed');
        }
        if (kind === 'chunk') {
          streamStarted = true;
          if (payload.text && payload.text.length >= best.length) {
            best = payload.text;
            lastChangeAt = Date.now();
          }
        }
        if (kind === 'end') {
          if (payload.text && payload.text.length >= best.length) best = payload.text;
          done(payload.outcome ?? 'completed');
        }
      });

      ticker = setInterval(() => {
        const now = Date.now();
        const live = assistantText(adapter);
        const grown = live.count > before.count || (live.text && live.text !== before.text);

        if (grown && (!best || live.text.length > best.length)) {
          best = live.text;
          lastChangeAt = now;
        }
        if (!best && !streamStarted) {
          if (now - started > timingFor(adapter, 'timeoutMs')) done('stalled');
          return;
        }

        const idleMs = timingFor(adapter, 'idleMs');
        const stableMs = timingFor(adapter, 'stableMs');
        const warmup = timingFor(adapter, 'warmupMs');

        // Do not judge anything during the warmup window: a reasoning model is silent for a minute.
        if (now - started < warmup) return;

        const since = lastChangeAt || started;
        const busy = isStreaming(adapter) || streamStarted;
        if (busy && now - since > idleMs) return done(best ? 'completed' : 'stalled');
        if (now - since > stableMs) return done(best ? 'completed' : 'stalled');
        if (now - started > timingFor(adapter, 'timeoutMs')) done(best ? 'unknown' : 'stalled');
      }, 400);
    });
  }

  // ────────────────────────────────────────────────────────── the rate ladder

  async function onRefusal(text) {
    const rate = await MDH.state.get('rate');
    const now = Date.now();
    const hits = now - (rate.lastHitAt ?? 0) > 10 * 60 * 1000 ? 1 : (rate.hits ?? 0) + 1;
    const pace = await MDH.state.get('pace');
    const mult = Math.min(4, Number(((pace.mult ?? 1) * 1.6).toFixed(2)));

    await MDH.state.patchSoon('pace', { mult });
    await MDH.state.patch('rate', { hits, lastHitAt: now, phase: 'ladder' });

    log()?.warn('rate limit hit', hits, text?.slice(0, 120));
    S.phase = 'paused';

    const pending = await MDH.state.get('pending');
    if (hits >= 4) {
      MDH.ui.countdown({
        title: 'Paused — rate limited',
        text: 'The site refused four times in ten minutes. Nothing will be sent until you press Resume.',
        until: now + 5 * 60 * 1000,
        tone: 'error',
        actions: [{ label: 'Resume', primary: true, fn: (close) => { MDH.state.patch('rate', { hits: 2, phase: '' }); close(); resume(); } }],
      });
      return;
    }

    const waits = { 1: 8000, 2: 40000, 3: 200000 };
    const base = waits[hits] ?? 200000;
    const until = now + base + (hits === 1 ? Math.floor(Math.random() * 3000) : 0);
    const fresh = hits === 3;

    const ui = MDH.ui.countdown({
      title: `Rate limited by ${S.adapter?.name ?? 'the site'}`,
      text: `${fresh ? 'Starting a new chat' : 'Reloading the page'} when the countdown ends. Attempt ${hits} of 3.`,
      until,
      actions: [
        { label: 'Pause', fn: () => { MDH.state.patch('rate', { phase: 'paused' }); S.phase = 'paused'; } },
        { label: 'Stop the task', fn: (close) => { close(); stop('rate-limited'); } },
      ],
    });

    await MDH.util.sleep(Math.max(0, until - Date.now()));
    ui.close();
    if (S.stopped || (await MDH.state.get('rate')).phase === 'paused') return;

    await MDH.state.patch('rate', { phase: 'reloading' });

    if (pending?.call) await MDH.state.set('pending', { ...pending, resumeAfterReload: true });
    if (fresh) {
      // A fresh chat resets the conversation-level throttle.
      location.href = S.adapter?.home ?? location.origin;
    } else {
      location.reload();
    }
  }

  // ────────────────────────────────────────────────────────────── delivery

  async function deliver(text, { first = false } = {}) {
    const adapter = S.adapter;
    if (!adapter) throw Object.assign(new Error('no adapter'), { code: 'NO_TAB' });

    await governorWait(adapter);
    if (isStreaming(adapter)) {
      // Never click a button that is currently "Stop": that cancels the model's answer.
      const until = Date.now() + 5000;
      while (isStreaming(adapter) && Date.now() < until) await MDH.util.sleep(250);
    }

    const el = composer(adapter);
    if (!el) throw Object.assign(new Error('composer not found'), { code: 'SEND_FAILED' });

    const before = assistantText(adapter).count;
    if (!setComposerText(el, text)) throw Object.assign(new Error('could not write into the composer'), { code: 'SEND_FAILED' });

    let accepted = false;
    for (let attempt = 0; attempt < 2 && !accepted; attempt++) {
      const clickOk = clickSend(adapter);
      if (!clickOk) break;
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        await MDH.util.sleep(150);
        if (composerText(el) === '' || assistantText(adapter).count > before || isStreaming(adapter)) {
          accepted = true;
          break;
        }
      }
    }

    if (!accepted) {
      if (composerText(el) === '') accepted = true;
      else {
        setComposerText(el, '');
        throw Object.assign(new Error('the message was not accepted by the page'), { code: 'SEND_FAILED' });
      }
    }

    await noteSend();
    log()?.debug('sent', first ? 'first' : 'follow-up', text.length, 'chars');
  }

  // ───────────────────────────────────────────────────────────────── turns

  function toolList() {
    return S.tools;
  }

  async function ensureTools() {
    if (S.tools.length) return S.tools;
    const tools = await MDH.transport.listTools();
    S.tools = tools;
    S.schemas = Object.fromEntries(tools.filter((t) => t.inputSchema).map((t) => [t.name, t.inputSchema]));
    return tools;
  }

  function callKey(call) {
    return `${call.tool}:${MDH.util.hash(JSON.stringify(call.arguments ?? {}))}`;
  }

  async function alreadyAnswered(turnId) {
    const answered = await MDH.state.get('answered');
    return answered.includes(turnId);
  }

  async function markAnswered(turnId) {
    await MDH.state.pushCapped('answered', turnId, 50);
  }

  async function dedupCheck(call) {
    const key = callKey(call);
    const now = Date.now();
    if (S.sameCall.key === key && now - S.sameCall.at < LIMITS.dedupWindowMs) {
      S.sameCall.n += 1;
      if (S.sameCall.n >= LIMITS.maxSameCall) return { blocked: true, reason: `the model asked for ${call.tool} with the same arguments ${S.sameCall.n} times` };
    } else {
      S.sameCall = { key, n: 1, at: now };
    }
    return { blocked: false };
  }

  async function execute(call) {
    const tool = call.tool;

    // Loop-local tools never reach the host: they are about the conversation, not the machine.
    if (tool === 'update_plan') {
      MDH.ui.showPlan(call.arguments?.steps ?? []);
      return { status: 'ok', body: 'plan shown to the user' };
    }
    if (tool === 'ask_user') {
      const answer = await MDH.ui.askQuestion(call.arguments?.question ?? '', call.arguments?.options ?? []);
      return answer === null
        ? { status: 'ok', body: 'the user skipped the question' }
        : { status: 'ok', body: `the user answered: ${answer}` };
    }
    if (tool === 'finish') {
      const summary = String(call.arguments?.summary ?? '').trim();
      S.outcome = 'completed';
      S.phase = 'done';
      S.running = false;
      MDH.ui.notice(summary ? `Finished: ${MDH.util.truncate(summary, 140)}` : 'Finished.', { ms: 8000 });
      await MDH.state.patch('session', { phase: 'done', outcome: 'completed' });
      return { status: 'ok', body: 'finished', finish: true };
    }

    const reply = await MDH.transport.callTool(tool, call.arguments, { timeout: 130000 });
    const status = reply?.status ?? (reply?.ok === false ? 'error' : 'ok');
    return { status, body: reply?.body ?? reply?.result ?? '', meta: reply };
  }

  function frame({ tool, status, body }) {
    const safe = MDH.util.truncate(String(body ?? ''), 128 * 1024);
    return `[MDH_RESULT tool="${tool}" status="${status}"]\n${safe}\n[/MDH_RESULT]`;
  }

  /** Decides whether this call may run, and returns the user's decision. */
  async function gate(call) {
    const policy = await MDH.state.get('policy');
    const desc = MDH.policy.describe(call, policy);
    if (desc.verdict.decision === 'allow') return 'once';
    if (desc.verdict.decision === 'deny') {
      MDH.ui.notice(`${call.tool}: ${desc.verdict.reason}`, { tone: 'err', ms: 6000 });
      return 'deny';
    }
    const decision = await MDH.ui.showApproval(desc, { timeoutMs: policy.approvalTimeoutMs ?? 120000 });
    if (decision === 'always') {
      policy.approval[call.tool] = 'allow';
      await MDH.state.set('policy', policy);
    }
    return decision;
  }

  async function turn() {
    S.turn += 1;
    if (S.turn > LIMITS.maxTurns) {
      return stop('turn limit reached');
    }

    const adapter = S.adapter;
    const first = S.turn === 1;
    let message;

    if (first) {
      await ensureTools().catch((e) => log()?.warn('tool list failed', e));
      const prompt = MDH.prompt.renderPrompt({ tools: S.tools });
      message = MDH.prompt.wrapFirstMessage(prompt, S.task);
    } else {
      message = S.pendingText ?? '';
    }

    S.phase = 'injecting';
    await deliver(message, { first });
    S.phase = 'waiting-reply';

    // A real sentence about the real state, plus nonsense that is visibly tagged as nonsense. The joke
    // is not the status; if the two ever disagree, the status wins and the joke is just a joke.
    const mission = MDH.ui.mission?.({
      title: 'Working',
      real: 'Waiting for the reply. The line above is decoration; the clock is not.',
    });
    const { text, outcome, ms } = await waitForReply(adapter);
    mission?.close();
    S.outcome = outcome;
    log()?.info('turn', S.turn, outcome, ms, 'chars', text.length);

    if (outcome === 'stalled' || (!text && outcome !== 'completed')) {
      MDH.ui.countdown({
        title: 'No reply arrived',
        text: 'The page is not producing text — it is either thinking hard or the stream went quiet. Waiting costs nothing; guessing costs a lot.',
        until: Date.now(),
        actions: [
          { label: 'Keep waiting', primary: true, fn: (close) => close() },
          { label: 'Stop', fn: (close) => { close(); stop('stalled'); } },
          {
            label: 'Report it',
            fn: (close) => {
              close();
              MDH.ui.issue?.({
                reason: 'stalled',
                detail: `No reply arrived after ${Math.round(ms / 1000)} s on ${adapter.id}.`,
              });
            },
          },
        ],
      });
      S.phase = 'paused';
      return;
    }

    const parsed = MDH.parser.parse(text, { tools: S.tools.map((t) => t.name), schemas: S.schemas });
    if (!parsed.call) {
      if (parsed.reason === 'none') {
        // The model answered in prose: the task is over as far as the loop is concerned.
        S.phase = 'done';
        S.running = false;
        await MDH.state.patch('session', { phase: 'done', outcome });
        return;
      }
      S.parseFailures += 1;
      if (S.parseFailures > 1) {
        MDH.ui.notice(
          `Could not read the model's call twice (${parsed.reason}). Stopping — it is not being mysterious on purpose, it is just being a model.`,
          { tone: 'err', ms: 8000 },
        );
        return stop('parse');
      }
      S.pendingText = `[MDH_PARSE] I could not read your last reply: ${MDH.parser.explain(parsed.reason, parsed.detail)}. ` +
        'Reply with ONLY the json block: {"mdh_call":{"tool":"…","arguments":{}}}. [/MDH_PARSE]';
      return turn();
    }

    S.parseFailures = 0;
    const call = parsed.call;

    const dup = await dedupCheck(call);
    if (dup.blocked) {
      S.pendingText = `[MDH_NOTE] ${dup.reason}. Stop and explain the situation to the user instead. [/MDH_NOTE]`;
      return turn();
    }

    const decision = await gate(call);
    if (decision === 'deny') {
      S.pendingText = frame({ tool: call.tool, status: 'denied', body: 'The user denied this call. Do not retry it.' }) +
        '\n\n' + MDH.prompt.reminder('result');
      return turn();
    }

    S.phase = 'executing';
    await MDH.state.set('pending', { call, pushedAt: Date.now(), turn: S.turn });

    let result;
    try {
      result = await execute(call);
    } catch (e) {
      S.errors += 1;
      result = { status: 'error', body: `${e.code ? `[${e.code}] ` : ''}${e.message}` };
      if (S.errors >= LIMITS.maxErrors) {
        MDH.ui.notice(
        'Three tool errors in a row — stopping so you can look. Nobody fixes what nobody can see.',
        { tone: 'err', ms: 8000 },
      );
      }
    }

    await MDH.state.pushCapped('history', {
      at: Date.now(), turn: S.turn, tool: call.tool, status: result.status, platform: adapter.id,
    }, 50);

    if (result.finish) return;

    await MDH.state.set('pending', null);
    S.pendingText = `${frame({ tool: call.tool, status: result.status, body: result.body })}\n\n${MDH.prompt.reminder('result')}`;

    if (S.errors >= LIMITS.maxErrors) return stop('tool-errors');
    return turn();
  }

  // ────────────────────────────────────────────────────────────── lifecycle

  /** Failures a user can actually report, and the reason we only show the card once per minute. */
  const REPORTABLE = new Set(['stalled', 'failed', 'error', 'timeout', 'NO_HOST', 'NO_TAB', 'SEND_FAILED']);
  let lastIssueAt = 0;

  function stop(reason) {
    S.running = false;
    S.stopped = true;
    S.phase = 'stopped';
    log()?.warn('loop stopped:', reason);
    MDH.ui.notice(`MDH stopped: ${reason}`, { tone: 'warn', ms: 6000 });
    if (REPORTABLE.has(String(reason)) && Date.now() - lastIssueAt > 60000) {
      lastIssueAt = Date.now();
      MDH.ui.issue?.({
        reason: String(reason),
        detail: `The loop stopped (${reason}) after ${S.turn} turn${S.turn === 1 ? '' : 's'}.\nStage: ${S.phase}`,
      });
    }
    MDH.state.patch('session', { phase: 'stopped', outcome: reason }).catch(() => {});
  }

  async function resume() {
    if (S.running) return;
    const pending = await MDH.state.get('pending');
    S.stopped = false;
    S.running = true;
    S.phase = 'resuming';
    if (pending?.call) {
      S.pendingText = `${frame({ tool: pending.call.tool, status: 'error', body: 'The page reloaded before this call finished. It was not completed — decide whether to call it again.' })}\n\n${MDH.prompt.reminder('result')}`;
    } else {
      S.pendingText = '[MDH_NOTE] The task was resumed by the user. Continue. [/MDH_NOTE]';
    }
    turn().catch((e) => {
      log()?.error('resume failed', e);
      stop(e.message ?? 'resume failed');
    });
  }

  async function start(task, adapter) {
    if (S.running) return { ok: false, reason: 'already running' };
    S.adapter = adapter ?? MDH.platforms.match(location.hostname);
    if (!S.adapter) return { ok: false, reason: 'unsupported page' };

    MDH.interceptor.attach(S.adapter);
    S.running = true;
    S.stopped = false;
    S.task = String(task ?? '').trim();
    S.turn = 0;
    S.errors = 0;
    S.parseFailures = 0;
    S.startedAt = Date.now();
    S.phase = 'starting';
    S.tools = [];

    await MDH.state.set('session', { tabId: null, platform: S.adapter.id, startedAt: S.startedAt, phase: 'running', outcome: null });
    MDH.ui.mount();

    turn().catch((e) => {
      log()?.error('loop failed', e);
      // A failure is the one moment a user might actually file an issue, so it is the one moment we hand
      // them the form. The joke is labelled; the reason is not.
      MDH.ui.issue?.({
        reason: e.code ?? 'error',
        detail: `The loop stopped: ${e.message}\n\nStage: ${S.phase} · turn ${S.turn}`,
      });
      stop(e.code ?? 'error');
    });
    return { ok: true };
  }

  const status = () => ({
    running: S.running,
    phase: S.phase,
    outcome: S.outcome,
    turn: S.turn,
    platform: S.adapter?.id ?? null,
    startedAt: S.startedAt,
  });

  MDH.agent = { start, stop, resume, status, _internals: { setComposerText, composerText, isStreaming, assistantText, governorWait, dedupCheck } };
})();
