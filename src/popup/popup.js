/**
 * popup/popup.js — the control surface. It reports; it does not decide.
 *
 * The pipeline strip exists because "it's stuck" is the only bug report you get otherwise: page found →
 * host connected → tools loaded → idle/running, each with a duration or a count.
 *
 * BARBOS MODE below is the same idea with jokes: real events are tagged `sys`/`host`, decoration is
 * tagged with a planet, and the count in the corner is real, because a log that lies about its own size
 * is the first step towards a log that lies about everything.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const api = MDH.api;
  const $ = (id) => document.getElementById(id);

  /* ── BARBOS MODE ────────────────────────────────────────────────────────────────────────────────
     A log that is honest about which lines are real. `sys` and `host` come from the extension; every
     other tag is decoration from core/fun.js, rotated so a 90-second wait does not look like a crash.
     The counts are real, the aliens are not. */
  const barboRows = [];
  let barboTotal = 0;
  let barboTick = 0;
  let lastName = null;

  function barbo(tag, text) {
    barboRows.push({ at: new Date(), tag: String(tag).toLowerCase(), text: String(text) });
    if (barboRows.length > 120) barboRows.shift();
    barboTotal += 1;
    renderBarbo();
  }

  function renderBarbo() {
    const pre = $('barbos-log');
    if (!pre) return;
    const frag = document.createDocumentFragment();
    for (const row of barboRows.slice(-80)) {
      const line = document.createElement('div');
      line.className = 'row';
      const time = document.createElement('span');
      time.className = 't';
      time.textContent = row.at.toTimeString().slice(0, 8);
      const tag = document.createElement('span');
      tag.className = `tag ${row.tag}`;
      tag.textContent = row.tag;
      const text = document.createElement('span');
      text.className = 'txt';
      text.textContent = row.text;
      line.append(time, tag, text);
      frag.append(line);
    }
    pre.textContent = '';
    pre.append(frag);
    $('barbos-count').textContent = String(barboTotal);
    pre.scrollTop = pre.scrollHeight;
  }

  /* ── report + share ─────────────────────────────────────────────────────────────────────────────
     Two doors, one rule: never open a blank page. Every button here goes to a real URL with real
     context, and the share sheet appears once per profile because a permanent prompt is an advert. */
  const report = MDH.report;
  const sessionSeed = Math.floor(Date.now() / 60000); // changes per run, stable while it is open
  let sharePrompted = null;

  const openUrl = (url) => {
    if (!url) return;
    if (/^mailto:/.test(url) || /^https?:/.test(url)) api.tabs.create({ url }).catch(() => {});
  };

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function contextForIssue() {
    return {
      stage: status?.agent?.phase ?? 'popup',
      platform: status?.platform?.id ?? 'unknown',
      browser: navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Brave') ? 'Brave' : 'Chrome',
    };
  }

  /**
   * Build the report locally, show nothing, upload nothing. The popup has the page's log and the browser
   * facts; the background adds the machine's facts through a one-shot host call. Only the user's click on
   * GitHub's own Submit button moves any of it off the machine.
   */
  async function buildBundle() {
    let host = null;
    try {
      const res = await api.runtime.sendMessage({ type: 'mdh:diagnose' });
      host = res?.host ?? null;
      if (host) barbo('host', `diagnostics: ${host.node ?? 'node ?'} · skew ${host.clockSkewMs ?? '?'} ms`);
    } catch {
      barbo('sys', 'diagnostics: host not answering, report will say so');
    }

    const collected = MDH.diag.collect({
      stage: status?.agent?.phase ?? 'popup',
      platform: status?.platform ?? null,
      error: null,
      logTrail: status?.log ?? [],
      host,
    });
    return MDH.diag.bundle(collected);
  }

  async function openIssue(kind = 'bug') {
    if (kind === 'idea') {
      barbo('sys', 'opening the idea form');
      openUrl(report.ideaUrl({ title: '[idea] ', body: '' }));
      return;
    }

    const label = $('report-bug');
    const was = label.textContent;
    label.textContent = 'Building…';
    label.disabled = true;
    try {
      const bundle = await buildBundle();
      barbo('sys', `report ready · ${bundle.hypotheses.length} guesses · ${(bundle.diag.log ?? []).length} log lines`);
      openUrl(MDH.diag.issueUrl(bundle.diag, { title: `[bug] ${bundle.diag.page?.platform ?? 'unknown'} · ${bundle.diag.stage}` }));
    } catch (e) {
      barbo('sys', `report failed: ${e.message}`);
      openUrl(report.issueUrl({ ...contextForIssue(), title: '[bug] ', detail: '' }));
    } finally {
      label.textContent = was;
      label.disabled = false;
    }
  }

  /** The viewer is the host's, on loopback; the popup only asks for its URL and opens a tab. */
  async function openViewer() {
    const button = $('viewer');
    const was = button.textContent;
    button.textContent = 'Opening…';
    try {
      const res = await api.runtime.sendMessage({ type: 'mdh:viewer' });
      if (res?.ok && res.url) {
        barbo('host', `log viewer on loopback :${res.port}`);
        api.tabs.create({ url: res.url }).catch(() => {});
      } else {
        button.textContent = res?.code === 'NO_HOST' ? 'Host offline' : 'Unavailable';
        setTimeout(() => (button.textContent = was), 1800);
        return;
      }
    } catch {
      button.textContent = 'Unavailable';
      setTimeout(() => (button.textContent = was), 1800);
      return;
    }
    button.textContent = was;
  }

  function showShare(force = false) {
    $('share-line').textContent = report.shareLine(sessionSeed);
    $('share-sheet').hidden = false;
    if (force) barbo('sys', 'share sheet opened by the user');
    $('share-close').focus({ preventScroll: true });
  }

  function hideShare({ restoreFocus = true } = {}) {
    const wasOpen = !$('share-sheet').hidden;
    $('share-sheet').hidden = true;
    markSharePrompted();
    // Keyboard users land back on the button they opened, not at the top of the popup.
    if (wasOpen && restoreFocus) $('share-open').focus({ preventScroll: true });
  }

  async function markSharePrompted() {
    if (sharePrompted === true) return;
    sharePrompted = true;
    try {
      const { 'mdh:settings': stored } = await api.storage.local.get('mdh:settings');
      await api.storage.local.set({ 'mdh:settings': { ...(stored ?? {}), sharePrompted: true } });
    } catch {
      /* storage is a convenience here, never a blocker */
    }
  }

  const startedAt = Date.now();
  let tabId = null;
  let status = null;
  let elapsedBase = 0;

  const send = (tab, msg) =>
    new Promise((resolve) => {
      try {
        api.tabs.sendMessage(tab, msg, (reply) => {
          if (api.runtime.lastError) return resolve(null);
          resolve(reply ?? null);
        });
      } catch {
        resolve(null);
      }
    });

  function stage(name, state, meta) {
    const node = document.querySelector(`.stage[data-stage="${name}"]`);
    if (!node) return;
    node.classList.toggle('done', state === true);
    node.classList.toggle('fail', state === 'fail');
    node.querySelector('.tick').textContent = state === true ? '✓' : state === 'fail' ? '✕' : '·';
    node.querySelector('.meta').textContent = meta ?? '';
  }

  function setState(text, tone) {
    $('state').textContent = text;
    $('dot').className = `dot ${tone ?? ''}`.trim();
  }

  function render(s) {
    status = s;

    if (!s) {
      setState('no connection to this tab', 'err');
      stage('page', 'fail', 'reload the page');
      stage('host', false, '');
      stage('tools', false, '');
      stage('run', false, '');
      $('platform').textContent = 'This page has no MDH content script. Reload it, or open one of the 8 supported chats.';
      $('start').disabled = true;
      $('pipeline').hidden = false;
      return;
    }

    stage('page', !!s.supported, s.platform?.name ?? 'unsupported');
    stage('host', s.host === true, s.host ? '' : (s.hostError ?? 'not connected'));
    stage('tools', s.agent?.running || s.host === true, '');
    const phase = s.agent?.phase ?? 'idle';
    stage('run', phase === 'done' ? true : false, phase);

    $('platform').textContent = s.platform
      ? `${s.platform.name} · ${s.interceptor}`
      : 'Unsupported page — open one of the 8 platforms.';

    strip.host = s.host === true;
    strip.phase = s.agent?.phase ?? 'idle';
    paintIssueStrip();

    const name = `${s.platform?.id ?? 'none'}:${s.agent?.phase ?? 'idle'}:${s.host === true}`;
    if (name !== lastName) {
      lastName = name;
      barbo('sys', `platform ${s.platform?.id ?? 'none'} · phase ${s.agent?.phase ?? 'idle'} · host ${s.host === true ? 'up' : 'offline'}`);
    }

    if (!s.host) {
      setState('host offline', 'err');
      $('hint').hidden = false;
      $('hint').textContent = 'The host is not answering. It is not sulking — it is probably not installed. Run ./install.sh.';
    }
    else if (phase === 'running' || phase === 'waiting-reply' || phase === 'executing' || phase === 'injecting') setState(phase.replace('-', ' '), '');
    else if (phase === 'paused') setState(`paused — ${s.agent?.pauseReason ?? 'your turn'}`, 'warn');
    else if (phase === 'done') setState('finished', 'ok');
    else setState('ready', 'ok');

    $('start').disabled = !s.supported || s.host !== true;
    $('stop').disabled = !s.agent?.running;
    $('turn').textContent = `turn ${s.agent?.turn ?? 0}`;
    $('elapsed').textContent = MDH.util.clock(Date.now() - (s.agent?.startedAt || startedAt));
    if ((s.agent?.turn ?? 0) > 0) $('session').hidden = false;

    // The pill is the main control now, so its visibility is a first-class setting, not a hidden one.
    const dock = s.dock ?? {};
    const dockButton = $('dock-toggle');
    dockButton.textContent = dock.hidden ? 'Pill: hidden' : 'Pill: shown';
    dockButton.disabled = !s.supported;

    if (!s.host) {
      $('hint').hidden = false;
      $('hint').textContent = `Host offline — run ./install.sh again. ${s.hostError ?? ''}`.trim();
      $('retry').hidden = false;
    } else {
      $('hint').hidden = true;
      $('retry').hidden = true;
    }
  }

  async function refresh() {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    tabId = tabs[0]?.id ?? null;
    if (!tabId) return render(null);
    const res = await send(tabId, { type: 'mdh:status' });
    render(res);
    await renderStorage();
  }

  async function renderStorage() {
    const stored = await api.storage.local.get(['mdh:policy', 'mdh:history', 'mdh:rate', 'mdh:runs']);
    const policy = stored['mdh:policy'];
    if (policy) {
      $('allow').textContent = (policy.allowPaths ?? []).join('  ·  ');
      const asks = Object.entries(policy.approval ?? {}).filter(([, v]) => v === 'ask').map(([k]) => k);
      $('approval').textContent = asks.length ? asks.join(', ') : 'nothing';
    }
    const rate = stored['mdh:rate'];
    if (rate?.hits) $('ladder').textContent = `hit ${rate.hits} · ${rate.phase || 'idle'}`;
    // The code the model must echo to end the task. Shown because a hidden rule is a rule nobody can debug.
    $('phoenix').textContent = status?.agent?.phoenix ?? '—';

    const history = stored['mdh:history'] ?? [];
    strip.history = history;
    paintIssueStrip();
    const list = $('history');
    list.textContent = '';
    let denied = 0;
    for (const item of history.slice(-5).reverse()) {
      if (item.status === 'denied') denied += 1;
      const li = document.createElement('li');
      const mark = document.createElement('span');
      mark.className = `st-${item.status}`;
      mark.textContent = item.status === 'ok' ? '✓' : item.status === 'denied' ? '✕' : '!';
      const name = document.createElement('span');
      name.textContent = item.tool;
      li.append(mark, name);
      list.append(li);
    }
    // The last run, in one line: the first question in every "it stopped" report, answered before it is asked.
    const runs = stored['mdh:runs'] ?? [];
    const last = runs[runs.length - 1];
    $('last-run').textContent = last
      ? `${last.turns} turn${last.turns === 1 ? '' : 's'} · ${MDH.util.clock(last.ms)} · ${last.outcome}${last.reason ? ` (${last.reason})` : ''}`
      : 'no runs yet';

    $('calls').textContent = `${history.length} calls`;
    $('denied').textContent = `${denied} denied`;
  }

  $('start').addEventListener('click', async () => {
    const task = $('task').value.trim();
    barbo('sys', `start requested · ${task ? `${task.length} chars` : 'no task text'}`);
    $('start').disabled = true;
    const res = await send(tabId, { type: 'mdh:start', task, tabId });
    if (!res?.ok) {
      $('hint').hidden = false;
      $('hint').textContent = res?.reason === 'another tab is driving MDH'
        ? 'Another tab is driving MDH. Stop it there first.'
        : `Could not start: ${res?.reason ?? 'unknown'}`;
    }
    setTimeout(refresh, 400);
  });

  $('stop').addEventListener('click', async () => {
    barbo('sys', 'stop requested');
    await send(tabId, { type: 'mdh:stop' });
    setTimeout(refresh, 200);
  });

  $('retry').addEventListener('click', async () => {
    const res = await send(tabId, { type: 'mdh:ping-host' });
    if (res?.ok) setState('host connected', 'ok');
    setTimeout(refresh, 300);
  });

  /*
   * Ask the page to check itself: which of the adapter's selectors still match. This is the answer to
   * "it did nothing when I pressed Start", and it costs one message.
   */
  $('probe').addEventListener('click', async () => {
    const out = $('probe-out');
    out.hidden = false;
    out.textContent = 'checking…';
    const res = await send(tabId, { type: 'mdh:probe' });
    if (!res?.ok || !res.result) {
      out.textContent = res?.reason ?? 'this page has no MDH content script';
      return;
    }
    out.textContent = MDH.probe.report(res.result).join('\n');
  });

  $('copy').addEventListener('click', async () => {
    const text = (status?.log ?? []).map((e) => `${new Date(e.at).toISOString()} ${e.level} ${e.text}`).join('\n');
    const withHeader = `MDH_AI ${MDH.VERSION} · ${status?.platform?.name ?? 'n/a'} · ${navigator.userAgent}\n\n${text}`;
    try {
      await navigator.clipboard.writeText(withHeader);
      $('copy').textContent = 'Copied';
      setTimeout(() => ($('copy').textContent = 'Copy log'), 1200);
    } catch {
      $('copy').textContent = 'Copy failed';
    }
  });

  $('menu').addEventListener('click', () => {
    $('advanced').open = !$('advanced').open;
  });

  // GitHub has no "follow" URL — the profile visit is the honest version of that trick.
  $('home').addEventListener('click', (e) => {
    e.preventDefault();
    api.runtime.sendMessage({ type: 'mdh:open-home' }).catch(() => {});
  });

  $('site').addEventListener('click', (e) => {
    e.preventDefault();
    api.runtime.sendMessage({ type: 'mdh:open-site' }).catch(() => {});
  });

  setInterval(() => {
    if (status?.agent?.startedAt) $('elapsed').textContent = MDH.util.clock(Date.now() - status.agent.startedAt);
  }, 1000);

  // ── Jokes are optional; help is not. Turning the chatter off hides the ticker and BARBOS MODE and stops
  // the rotation, and nothing else changes: the issue strip, its buttons and the share sheet stay exactly
  // where they were. `--no-fun` in the installer silences the shell; this silences the popup.
  let funOff = false;
  let stopTicker = () => {};

  function applyFun() {
    $('ticker')?.closest('section')?.toggleAttribute('hidden', funOff);
    $('barbos').hidden = funOff;
    $('fun-off').checked = funOff;
    if (funOff) {
      stopTicker();
      barboRows.length = 0;
      renderBarbo();
    } else {
      stopTicker = MDH.fun?.rotate($('ticker'), { everyMs: 2600 }) ?? (() => {});
    }
  }

  $('fun-off').addEventListener('change', async (e) => {
    funOff = e.target.checked;
    applyFun();
    try {
      const { 'mdh:settings': stored } = await api.storage.local.get('mdh:settings');
      await api.storage.local.set({ 'mdh:settings': { ...(stored ?? {}), funOff } });
    } catch {
      /* the choice still applies for this session */
    }
  });

  api.storage.local
    .get('mdh:settings')
    .then(({ 'mdh:settings': stored }) => {
      funOff = stored?.funOff === true;
      applyFun();
    })
    .catch(() => applyFun());

  // The mission log keeps filling while the popup is open, so the wait has something to look at.
  setInterval(() => {
    if (funOff || document.visibilityState !== 'visible' || !MDH.fun) return;
    barboTick += 1;
    if (barboTick % 5 === 0) barbo('deep', MDH.fun.quoteAt(barboTick));
    else barbo(MDH.fun.tagAt(barboTick), MDH.fun.missionAt(barboTick));
  }, 4200);

  // Everything the strip needs to decide whether this is a routine reminder or a post-mortem.
  const strip = { host: null, phase: null, history: [] };

  /**
   * The issue strip is not decoration and it is not a notification: it is the support channel, and it has
   * to know when the last run went wrong. A host that is not answering and a session that stopped on an
   * error both promote the strip — the line stays in the same place, it just stops whispering.
   */
  function paintIssueStrip() {
    const failed = strip.history.filter((item) => item.status && item.status !== 'ok').length;
    const trouble = strip.host === false || strip.phase === 'stopped' || failed > 0;
    const seed = trouble ? sessionSeed + failed * 7 + 3 : sessionSeed;

    $('issue-line').textContent = trouble
      ? `The last run had a problem. ${report.issueLine(seed)}`
      : report.issueLine(seed);
    $('report').classList.toggle('loud', trouble);
    $('report-bug').classList.toggle('primary', trouble);
    $('credit-hint').textContent = trouble
      ? report.motivateLine(seed)
      : report.creditLine(seed);
    $('report-hint').textContent = trouble
      ? 'The form already has the stage, platform and browser. Paste the log and it is a useful report.'
      : 'A bug report is worth more than a star, and the developer reads every one.';
  }
  $('report-bug').addEventListener('click', () => openIssue('bug'));
  $('report-idea').addEventListener('click', () => openIssue('idea'));
  $('share-open').addEventListener('click', () => showShare(true));
  $('viewer').addEventListener('click', openViewer);
  $('dock-toggle').addEventListener('click', async () => {
    const button = $('dock-toggle');
    const hidden = button.textContent === 'Pill: shown';
    button.disabled = true;
    try {
      const res = await send(tabId, { type: 'mdh:dock', hidden });
      button.textContent = res?.hidden ? 'Pill: hidden' : 'Pill: shown';
      barbo('sys', `pill ${res?.hidden ? 'hidden' : 'shown'} on this site`);
    } catch {
      barbo('sys', 'could not change the pill on this page');
    } finally {
      button.disabled = false;
    }
  });
  $('share-close').addEventListener('click', hideShare);
  $('share-sheet').addEventListener('click', (e) => {
    if (e.target === $('share-sheet')) hideShare();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('share-sheet').hidden) {
      e.preventDefault();
      hideShare();
    }
  });

  const links = report.shareLinks();
  for (const button of document.querySelectorAll('[data-share]')) {
    button.addEventListener('click', async () => {
      const name = button.dataset.share;
      if (name === 'instagram' || name === 'tiktok') {
        // No web intent carries a post; copy the payload and open the app's site, honestly.
        const copied = await copy(report.clipboard());
        barbo('sys', `${name}: link ${copied ? 'copied' : 'ready to copy by hand'}`);
        button.textContent = copied ? 'Link copied' : 'Copy failed';
        openUrl(links[name]);
        return;
      }
      barbo('sys', `share → ${name}`);
      openUrl(links[name]);
    });
  }

  $('share-copy').addEventListener('click', async () => {
    const ok = await copy(report.clipboard());
    $('share-copy').textContent = ok ? 'Copied' : 'Copy failed';
    barbo('sys', `share link ${ok ? 'copied' : 'copy failed (clipboard blocked)'}`);
    setTimeout(() => ($('share-copy').textContent = 'Copy link'), 1400);
  });

  if (navigator.share) {
    $('share-native').hidden = false;
    $('share-native').addEventListener('click', async () => {
      const payload = report.shareText();
      try {
        await navigator.share({ title: payload.title, text: payload.text, url: payload.url });
        barbo('sys', 'shared through the system sheet');
      } catch {
        /* the user cancelled; not an error worth a log line */
      }
    });
  }

  barbo('sys', `MDH_AI ${MDH.VERSION} · popup opened`);
  barbo('deep', 'mission control online; no budget for an actual mission');

  refresh();

  // Once per profile, and only after the first refresh has painted: a modal over a blank popup looks
  // like a crash, which is the exact impression this product cannot afford.
  (async () => {
    try {
      const { 'mdh:settings': stored } = await api.storage.local.get('mdh:settings');
      sharePrompted = stored?.sharePrompted === true;
      if (!sharePrompted) {
        await markSharePrompted();
        showShare();
        barbo('sys', 'first run: share sheet shown once');
      }
    } catch {
      /* no storage, no prompt; the Share button still works */
    }
  })();
})();
