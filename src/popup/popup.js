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
    else if (phase === 'running' || phase === 'waiting-reply' || phase === 'executing') setState(phase.replace('-', ' '), '');
    else if (phase === 'done') setState('idle', 'ok');
    else setState('ready', 'ok');

    $('start').disabled = !s.supported || s.host !== true;
    $('stop').disabled = !s.agent?.running;
    $('turn').textContent = `turn ${s.agent?.turn ?? 0}`;
    $('elapsed').textContent = MDH.util.clock(Date.now() - (s.agent?.startedAt || startedAt));
    if ((s.agent?.turn ?? 0) > 0) $('session').hidden = false;

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
    const stored = await api.storage.local.get(['mdh:policy', 'mdh:history', 'mdh:rate']);
    const policy = stored['mdh:policy'];
    if (policy) {
      $('allow').textContent = (policy.allowPaths ?? []).join('  ·  ');
      const asks = Object.entries(policy.approval ?? {}).filter(([, v]) => v === 'ask').map(([k]) => k);
      $('approval').textContent = asks.length ? asks.join(', ') : 'nothing';
    }
    const rate = stored['mdh:rate'];
    if (rate?.hits) $('ladder').textContent = `hit ${rate.hits} · ${rate.phase || 'idle'}`;

    const history = stored['mdh:history'] ?? [];
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

  // The ticker: one line at a time, clearly tagged, paused while the popup is not visible.
  MDH.fun?.rotate($('ticker'), { everyMs: 2600 });

  // The mission log keeps filling while the popup is open, so the wait has something to look at.
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !MDH.fun) return;
    barboTick += 1;
    if (barboTick % 5 === 0) barbo('deep', MDH.fun.quoteAt(barboTick));
    else barbo(MDH.fun.tagAt(barboTick), MDH.fun.missionAt(barboTick));
  }, 4200);

  barbo('sys', `MDH_AI ${MDH.VERSION} · popup opened`);
  barbo('deep', 'mission control online; no budget for an actual mission');

  refresh();
})();
