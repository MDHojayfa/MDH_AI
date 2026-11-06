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
    // Counts consecutive prose-only replies. A model that describes the next step instead of taking it is
    // the single most common way a long task dies at turn 2, so it is nudged automatically, not silently.
    prose: 0,
    pauseReason: null,
    // The completion code for this session. Nothing else can end the task (see core/phoenix.js).
    phoenix: null,
    badFinish: 0,
  };

  const LIMITS = {
    maxTurns: 60,
    maxSameCall: 4,
    maxErrors: 3,
    // Two nudges is enough to recover the usual "here is what I would do next" reply, and few enough that a
    // model which genuinely has nothing to say is not talked to until it invents work.
    maxNudges: 2,
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
    if (!el) {
      // Not a generic failure: this is the product's most likely breakage and the one report that can be
      // fixed in a single commit, so the card carries the exact selectors and a one-click form.
      lastIssueAt = Date.now();
      MDH.ui.drift?.({
        platform: adapter.id,
        selectors: adapter.dom?.composer ?? [],
        reason: 'composer not found',
      });
      throw Object.assign(new Error('composer not found'), { code: 'SEND_FAILED', reported: true });
    }

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
      if (!finishAccepts(call.arguments)) {
        // Not an error the user should see as a crash: the task simply is not over. The loop answers the
        // model itself, once, with the exact shape it needs.
        return {
          status: 'error',
          phoenixMismatch: true,
          body: 'finish rejected: the completion code is missing or wrong, so the task is still running.',
        };
      }
      const summary = String(call.arguments?.summary ?? '').trim();
      S.outcome = 'completed';
      S.phase = 'done';
      MDH.dock?.sync?.();
      S.running = false;
      MDH.ui.notice(summary ? `Finished: ${MDH.util.truncate(summary, 140)}` : 'Finished.', { ms: 8000 });
      MDH.ui.done?.({
        summary: summary ? MDH.util.truncate(summary, 600) : '',
        turns: S.turn,
        ms: Date.now() - (S.startedAt || Date.now()),
        platform: S.adapter?.id ?? '',
        onAgain: () => start(S.task, S.adapter),
      });
      await MDH.state.patch('session', { phase: 'done', outcome: 'completed' });
      return { status: 'ok', body: 'finished', finish: true };
    }

    const reply = await MDH.transport.callTool(tool, call.arguments, { timeout: 130000 });
    const status = reply?.status ?? (reply?.ok === false ? 'error' : 'ok');
    return { status, body: reply?.body ?? reply?.result ?? '', meta: reply };
  }

  /**
   * The gate that decides whether a finish call is real. Kept as a tiny named function because it is the most
   * consequential comparison in the product: true ends the session, false keeps it running.
   */
  function finishAccepts(args = {}) {
    const given = args?.phoenix ?? args?.code ?? '';
    return Boolean(MDH.phoenix?.matches?.(given, S.phoenix ?? ''));
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
    MDH.dock?.sync?.();
    if (S.turn > LIMITS.maxTurns) {
      return stop('turn limit reached');
    }

    const adapter = S.adapter;
    const first = S.turn === 1;
    let message;

    if (first) {
      await ensureTools().catch((e) => log()?.warn('tool list failed', e));
      const prompt = MDH.prompt.renderPrompt({ tools: S.tools, phoenix: S.phoenix });
      message = MDH.prompt.wrapFirstMessage(prompt, S.task);
    } else {
      message = S.pendingText ?? '';
    }

    S.phase = 'injecting';
    await deliver(message, { first });
    S.phase = 'waiting-reply';
    MDH.dock?.sync?.();

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
              reportCard(`No reply arrived after ${Math.round(ms / 1000)} s on ${adapter.id}.`);
            },
          },
        ],
      });
      return pause('no reply arrived', {
        detail: `Nothing arrived for ${Math.round(ms / 1000)} s on ${adapter.id}. The tab may have lost the stream, the plan may be rate-limited, or the page may simply have gone quiet.`,
        allowFinish: false,
      });
    }

    const parsed = MDH.parser.parse(text, { tools: S.tools.map((t) => t.name), schemas: S.schemas });
    if (!parsed.call) {
      if (parsed.reason === 'none') {
        /*
         * Prose with no tool call. This used to end the run, which looked, from the outside, exactly like a
         * bug: "it worked once, then it stopped and I had to press Start again". It was not a bug in the
         * transport — it was the model doing the very human thing of saying "next I would…" instead of
         * doing it, and the loop treating a sentence as a completion signal.
         *
         * The completion signal is `finish`, and only `finish`. So: nudge, twice, with the exact shape it
         * needs to reply in; then pause in plain sight, with Continue on the screen. Never a silent stop.
         */
        S.prose += 1;
        if (S.prose <= LIMITS.maxNudges) {
          log()?.info('prose without a call — nudging', S.prose);
          MDH.ui.notice(
            `The model described the next step instead of taking it. Asking again (${S.prose}/${LIMITS.maxNudges}).`,
            { tone: 'warn', ms: 5500 },
          );
          S.pendingText = `${MDH.prompt.continuation(S.prose, { phoenix: S.phoenix })}\n\n${MDH.prompt.reminder('result', { phoenix: S.phoenix })}`;
          return turn();
        }
        return pause('the model stopped calling tools', {
          detail: 'It answered ' + `${S.prose} times with text and no tool call. The task may be done — or it may ` +
            'have got stuck in prose. Continue to ask once more, or mark it finished if the last answer said so.',
          allowFinish: true,
        });
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
    S.prose = 0;
    const call = parsed.call;

    const dup = await dedupCheck(call);
    if (dup.blocked) {
      S.pendingText = `[MDH_NOTE] ${dup.reason}. Stop and explain the situation to the user instead. [/MDH_NOTE]`;
      return turn();
    }

    const decision = await gate(call);
    if (decision === 'deny') {
      S.pendingText = frame({ tool: call.tool, status: 'denied', body: 'The user denied this call. Do not retry it.' }) +
        '\n\n' + MDH.prompt.reminder('result', { phoenix: S.phoenix });
      return turn();
    }

    S.phase = 'executing';
    MDH.dock?.sync?.();
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

    if (result.phoenixMismatch) {
      /*
       * A finish without the code. The task is not over, so the loop answers the model instead of the user:
       * once with the exact shape, then — if it still cannot manage it — a pause with "Mark as finished",
       * because at that point the model is the problem and the human should decide.
       */
      S.badFinish += 1;
      if (S.badFinish <= 1) {
        log()?.warn('finish without the completion code; correcting');
        MDH.ui.notice('A finish call arrived without the completion code — asking again.', { tone: 'warn', ms: 5000 });
        S.pendingText = `${MDH.phoenix.rejection(S.phoenix)}\n\n${MDH.prompt.reminder('result', { phoenix: S.phoenix })}`;
        return turn();
      }
      return pause('the model could not produce the completion code', {
        detail: `It called finish twice without ${S.phoenix}. The work may well be done — the model just cannot follow the one rule that ends the session.`,
        allowFinish: true,
      });
    }

    if (result.finish) return;

    await MDH.state.set('pending', null);
    S.pendingText = `${frame({ tool: call.tool, status: result.status, body: result.body })}\n\n${MDH.prompt.reminder('result', { phoenix: S.phoenix })}`;

    if (S.errors >= LIMITS.maxErrors) return stop('tool-errors');
    return turn();
  }

  // ────────────────────────────────────────────────────────────── lifecycle

  /** Failures a user can actually report, and the reason we only show the card once per minute. */
  const REPORTABLE = new Set(['stalled', 'failed', 'error', 'timeout', 'NO_HOST', 'NO_TAB', 'SEND_FAILED']);
  let lastIssueAt = 0;

  /**
   * Everything we can honestly know at failure time, in one object the report builder understands.
   *
   * The browser half comes from `core/diag.js`; the machine half comes from the host over the same pipe the
   * tools use, on a frame type the model cannot reach. If the host is down, that is itself a fact and gets
   * reported as `host: null` rather than quietly omitted.
   */
  async function diagnostics(error, { stage = null } = {}) {
    const trail = MDH.log?.tail?.(60) ?? [];
    let host = null;

    if (MDH.transport?.connected) {
      try {
        const [sys, clock] = await Promise.all([
          MDH.transport.hostDiag('system', {}, { timeout: 4000 }),
          MDH.transport.hostDiag('clock', {}, { timeout: 4000 }),
        ]);
        host = {
          version: sys?.facts?.hostVersion ?? null,
          pid: sys?.facts?.pid ?? null,
          node: sys?.facts?.node ?? null,
          kernel: sys?.facts ? `${sys.facts.platform} ${sys.facts.release}` : null,
          diskFreeGB: sys?.disk?.freeGB ?? null,
          diskOk: sys?.disk?.ok ?? null,
          tunnels: sys?.facts?.tunnels ?? [],
          smallMtu: sys?.facts?.smallMtu ?? [],
          clockSkewMs: clock?.ok ? clock.clockSkewMs : null,
        };
      } catch (e) {
        host = { error: String(e.message ?? e) };
      }
    }

    const collected = MDH.diag.collect({
      stage: stage ?? S.phase,
      platform: S.adapter,
      error,
      logTrail: trail,
      host,
    });

    const bundle = MDH.diag.bundle(collected);

    // Keep the last report on disk so the log viewer can show it after the tab is gone. Best effort: a
    // failed save must never make a failure worse.
    if (MDH.transport?.connected) {
      MDH.transport
        .hostDiag('system', { save: true, summary: MDH.diag.summary(collected), hypotheses: bundle.hypotheses, diag: collected }, { timeout: 6000 })
        .catch(() => {});
    }

    return bundle;
  }

  /**
   * One failure, one card. The loop can fail in two places (the throw, then `stop`), and a user who sees the
   * same form twice learns to dismiss both without reading. 60 s is long enough to cover a single failure
   * and short enough that a second, genuinely new one still gets through.
   */
  async function reportCard(detail, { error = null, stage = null } = {}) {
    if (Date.now() - lastIssueAt < 60000) return;
    lastIssueAt = Date.now();
    let bundle = null;
    try {
      bundle = await diagnostics(error ?? new Error(String(detail)), { stage });
    } catch (e) {
      log()?.warn('could not build the report', e);
    }
    try {
      MDH.ui.issue?.({ reason: String(detail), detail: String(detail), bundle });
    } catch (e) {
      // A card that fails to render must not take the failure handler down with it.
      log()?.error('could not render the report card', e);
      MDH.ui.notice?.('MDH stopped. The report card could not be drawn; use the popup to report it.', { tone: 'err', ms: 8000 });
    }
  }

  /**
   * A pause is not a stop. The work is still there, the pending call is still saved, and the only thing
   * missing is one click. It exists because a loop that can only run or die has no way to say "your turn".
   */
  async function pause(reason, { detail = '', allowFinish = false } = {}) {
    S.running = false;
    S.stopped = false;
    S.phase = 'paused';
    S.outcome = 'paused';
    S.pauseReason = reason;
    log()?.warn('loop paused:', reason);
    MDH.dock?.sync?.();
    await MDH.state.patch('session', { phase: 'paused', outcome: 'paused', reason }).catch(() => {});

    const actions = [
      { label: 'Continue', primary: true, fn: (close) => { close(); resume(); } },
    ];
    if (allowFinish) {
      actions.push({
        label: 'Mark as finished',
        fn: (close) => {
          close();
          S.phase = 'done';
          S.outcome = 'completed';
          S.pauseReason = null;
          MDH.ui.notice('Marked as finished by the user.', { ms: 5000 });
          MDH.dock?.sync?.();
          MDH.state.patch('session', { phase: 'done', outcome: 'completed' }).catch(() => {});
        },
      });
    }
    actions.push(
      { label: 'Stop', fn: (close) => { close(); stop(reason); } },
      { label: 'Report it', fn: (close) => { close(); reportCard(`${reason}\n\n${detail}`, { stage: 'paused' }); } },
    );

    MDH.ui.countdown({
      title: 'Paused — your turn',
      text: `${detail || reason} Nothing is lost: the task and the pending call are saved.`,
      until: Date.now(),
      actions,
    });
    return { paused: true, reason };
  }

  function stop(reason) {
    const stage = S.phase;
    S.running = false;
    S.stopped = true;
    S.phase = 'stopped';
    log()?.warn('loop stopped:', reason);
    MDH.ui.notice(`MDH stopped: ${reason}`, { tone: 'warn', ms: 6000 });
    if (REPORTABLE.has(String(reason))) {
      reportCard(`The loop stopped (${reason}) after ${S.turn} turn${S.turn === 1 ? '' : 's'}.\nStage: ${stage}`, {
        stage,
        error: Object.assign(new Error(String(reason)), { code: String(reason) }),
      });
    }
    MDH.dock?.sync?.();
    MDH.state.patch('session', { phase: 'stopped', outcome: reason }).catch(() => {});
  }

  async function resume() {
    if (S.running) return;
    const pending = await MDH.state.get('pending');
    if (!S.phoenix) {
      const session = await MDH.state.get('session');
      S.phoenix = session?.phoenix ?? MDH.phoenix?.make?.() ?? null;
    }
    S.stopped = false;
    S.running = true;
    S.pauseReason = null;
    S.phase = 'resuming';
    if (pending?.call) {
      S.pendingText = `${frame({ tool: pending.call.tool, status: 'error', body: 'The page reloaded before this call finished. It was not completed — decide whether to call it again.' })}\n\n${MDH.prompt.reminder('result', { phoenix: S.phoenix })}`;
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
    S.prose = 0;
    S.badFinish = 0;
    S.pauseReason = null;
    S.phoenix = MDH.phoenix?.make?.() ?? null;
    S.startedAt = Date.now();
    S.phase = 'starting';
    S.tools = [];

    await MDH.state.set('session', {
      tabId: null,
      platform: S.adapter.id,
      startedAt: S.startedAt,
      phase: 'running',
      outcome: null,
      phoenix: S.phoenix,
    });
    MDH.ui.mount();
    MDH.dock?.sync?.();

    turn().catch((e) => {
      log()?.error('loop failed', e);
      // A failure is the one moment a user might actually file an issue, so it is the one moment we hand
      // them the form. The joke is labelled; the reason is not.
      if (!e.reported) reportCard(`The loop stopped: ${e.message}\n\nStage: ${S.phase} · turn ${S.turn}`, { error: e, stage: S.phase });
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
    pauseReason: S.pauseReason,
    prose: S.prose,
    phoenix: S.phoenix,
  });

  MDH.agent = {
    start,
    stop,
    resume,
    pause,
    status,
    diagnostics,
    _internals: { setComposerText, composerText, isStreaming, assistantText, governorWait, dedupCheck, finishAccepts },
  };
})();
