/**
 * core/dock.js — the start button that lives on the chat box.
 *
 * A popup is a fine place to configure something and a terrible place to *operate* it: it closes the moment
 * you click into the page, which is exactly when you want to watch what is happening. So the primary control
 * lives where the work happens — a small pill anchored to the composer of whichever chat you are on. Click it
 * to start, click again to pause, click again to continue. The popup becomes what it should have been: the
 * settings drawer.
 *
 * Why a shadow root: the eight platforms all ship aggressive global CSS (`* { font-family: … !important }`),
 * and an injected button that inherits it looks broken on exactly one of them, in a way nobody can reproduce.
 * Inside a shadow root the pill keeps its own styles and the page keeps its own layout.
 *
 * Why drag: on some layouts the composer moves, or the right edge is under a scrollbar. A control you cannot
 * move is a control that is sometimes unusable, and "sometimes" is how a feature gets turned off.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;

  const SIZE = 38;
  const GAP = 10;
  const Z = 2147483000;

  /** What the pill says in each phase. Pure data: the same table drives the label, the title and the click. */
  const PHASES = {
    idle: { icon: '▶', label: 'Start', action: 'start', title: 'Start MDH on this page' },
    starting: { icon: '◌', label: 'Starting', action: 'none', title: 'Starting — filling the composer' },
    running: { icon: '⏸', label: 'Pause', action: 'stop', title: 'Pause the loop (it can be resumed)' },
    'waiting-reply': { icon: '⏳', label: 'Waiting', action: 'stop', title: 'Waiting for the model — click to pause' },
    injecting: { icon: '✎', label: 'Sending', action: 'stop', title: 'Filling the composer and pressing send' },
    resuming: { icon: '◌', label: 'Resuming', action: 'none', title: 'Picking the task back up' },
    paused: { icon: '▶', label: 'Continue', action: 'resume', title: 'Paused — nothing lost, click to continue' },
    executing: { icon: '⚙', label: 'Working', action: 'stop', title: 'Running a tool — click to pause after it returns' },
    done: { icon: '✓', label: 'Done', action: 'resume', title: 'Finished — click to run the same task again' },
    stopped: { icon: '↻', label: 'Resume', action: 'resume', title: 'Continue where it stopped' },
    error: { icon: '!', label: 'Report', action: 'report', title: 'Something failed — open the report card' },
  };

  /**
   * A phase survives the loop stopping only if it means something to the user. `paused` and `done` are the
   * two that do: one is waiting for a click, the other is an outcome. Everything else collapses to idle,
   * because "stopped in the middle of injecting" is not a state a button should advertise.
   */
  const STICKY = new Set(['done', 'stopped', 'paused', 'error']);

  function stateFor(status) {
    const agent = status?.agent ?? status ?? {};
    const running = Boolean(agent.running);
    const raw = agent.phase ?? 'idle';
    const phase = running ? (PHASES[raw] ? raw : 'running') : STICKY.has(raw) ? raw : 'idle';
    const known = PHASES[phase] ? phase : 'idle';
    return {
      phase: known,
      ...PHASES[known],
      turn: agent.turn ?? 0,
      paused: known === 'paused',
      pauseReason: agent.pauseReason ?? null,
    };
  }

  /**
   * The tooltip is the answer to "why is it like this?" without opening anything: the phase's own sentence, plus
   * the reason when there is one, plus the turn number when it is running. Hovering a paused pill and reading
   * "Paused — nothing lost, click to continue — the model could not produce the completion code" is worth more
   * than a prettier pill.
   */
  function explain(state) {
    const base = state?.title ?? 'MDH';
    const reason = state?.pauseReason ? String(state.pauseReason) : '';
    const turn = state?.turn ? `turn ${state.turn}` : '';
    if (reason) return `${base} — ${reason}${turn ? ` · ${turn}` : ''}`;
    return turn ? `${base} · ${turn}` : base;
  }

  /** Keep a floating control inside the viewport, whatever the saved position or the window size. */
  function clampPos(pos, size, viewport) {
    const maxLeft = Math.max(0, (viewport?.width ?? 0) - size.width);
    const maxTop = Math.max(0, (viewport?.height ?? 0) - size.height);
    return {
      left: Math.min(Math.max(0, Math.round(pos.left)), maxLeft),
      top: Math.min(Math.max(0, Math.round(pos.top)), maxTop),
    };
  }

  /**
   * Default placement: just above the composer, flush with its right edge. Above, not inside — a button that
   * overlaps the send arrow is a button that steals a click meant for the model.
   */
  function anchorFor(rect, size = { width: SIZE, height: SIZE }, viewport = null) {
    if (!rect) return { left: 18, top: 18 };
    const view = viewport ?? { width: rect.right + 40, height: rect.bottom + 40 };
    return clampPos({ left: rect.right - size.width, top: rect.top - size.height - GAP }, size, view);
  }

  const CSS = `
    :host { all: initial; }
    /*
   * Fixed, and measured against the composer's rectangle — never placed *inside* the composer's layout.
   * Putting a control in a React textarea's flex row is a documented way to give someone a 0-width input on
   * a Tuesday. The pill floats above the page like a sticker on a laptop lid; the lid does not care.
   */
  .pill { position: fixed; z-index: ${Z}; display: flex; align-items: center; gap: 7px; height: ${SIZE}px;
      padding: 0 12px 0 10px; border-radius: 999px; border: 1px solid #3b3663; background: #12111c;
      color: #e5e7eb; font: 600 12.5px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,.45); cursor: pointer; user-select: none; touch-action: none;
      transition: transform .12s ease, border-color .12s ease, background .12s ease; }
    .pill:hover { border-color: #6d5efc; background: #171627; }
    .pill:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 2px; }
    .pill[data-phase="running"] .icon, .pill[data-phase="waiting-reply"] .icon, .pill[data-phase="executing"] .icon { color: #fbbf24; }
    .pill[data-phase="error"] { border-color: #7f1d1d; }
    .pill[data-phase="error"] .icon { color: #f87171; }
    .pill[data-phase="done"] .icon { color: #34d399; }
    .pill[data-phase="paused"] { border-color: #6d5efc; }
    .pill[data-phase="paused"] .icon { color: #a5b4fc; }
    .icon { font-size: 13px; line-height: 1; width: 13px; text-align: center; }
    .turn { color: #8b90a5; font-weight: 500; font-variant-numeric: tabular-nums; }
    .panel { position: fixed; z-index: ${Z}; width: 300px; padding: 10px; border-radius: 12px;
      border: 1px solid #2a2547; background: #0e0d18; box-shadow: 0 18px 46px rgba(0,0,0,.55);
      font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #d7d9e3; }
    .panel[hidden] { display: none; }
    .panel label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: #8b90a5; margin-bottom: 5px; }
    .panel textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 58px; padding: 8px 9px;
      border-radius: 8px; border: 1px solid #2a2547; background: #12111c; color: #e5e7eb; font: inherit; }
    .panel textarea:focus { outline: none; border-color: #6d5efc; }
    .row { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
    .row button { border-radius: 8px; border: 1px solid #2a2547; background: #171627; color: #e5e7eb;
      font: inherit; font-weight: 600; padding: 6px 12px; cursor: pointer; }
    .row button.primary { background: #4c3fd6; border-color: #6d5efc; }
    .row button:disabled { opacity: .5; cursor: not-allowed; }
    .hint { flex: 1; color: #7c8298; font-size: 11px; }
    .hide-link { background: none; border: 0; padding: 0; color: #6b7280; font: inherit; font-size: 11px;
      text-decoration: underline; cursor: pointer; }
    .dot { width: 6px; height: 6px; border-radius: 999px; background: #34d399; }
    .dot.busy { background: #fbbf24; }
    .dot.bad { background: #f87171; }
    .dot.paused { background: #a78bfa; }
    @media (prefers-reduced-motion: reduce) { .pill { transition: none; } }
  `;

  let host = null;
  let shadow = null;
  let pill = null;
  let panel = null;
  let input = null;
  let adapter = null;
  let manual = null; // {left, top} once dragged
  let raf = 0;
  let poll = 0;
  let lastPhase = null;
  let hiddenHere = false;

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.startsWith('aria-') || k === 'title') node.setAttribute(k, v);
      else node[k] = v;
    }
    for (const child of children) if (child) node.append(child);
    return node;
  }

  function composerRect() {
    for (const selector of adapter?.dom?.composer ?? []) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width > 60 && rect.height > 10) return rect;
    }
    return null;
  }

  function place() {
    if (!pill) return;
    const size = { width: pill.offsetWidth || 96, height: SIZE };
    const pos = manual ?? anchorFor(composerRect(), size, { width: innerWidth, height: innerHeight });
    const clamped = clampPos(pos, size, { width: innerWidth, height: innerHeight });
    pill.style.left = `${clamped.left}px`;
    pill.style.top = `${clamped.top}px`;
    if (panel && !panel.hidden) {
      const width = 300;
      panel.style.left = `${clampPos({ left: clamped.left - (width - size.width), top: 0 }, { width, height: 0 }, { width: innerWidth, height: innerHeight }).left}px`;
      const below = clamped.top + SIZE + 8;
      const top = below + panel.offsetHeight > innerHeight ? Math.max(8, clamped.top - panel.offsetHeight - 8) : below;
      panel.style.top = `${top}px`;
    }
  }

  function queuePlace() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      place();
    });
  }

  async function savePos(pos) {
    try {
      const settings = (await MDH.state?.get?.('settings')) ?? {};
      await MDH.state.set('settings', { ...settings, dockPos: pos });
    } catch {
      /* a lost position is not a reason to lose the button */
    }
  }

  async function startWithTask(text) {
    const task = String(text ?? '').trim();
    if (!task) {
      togglePanel(true);
      return;
    }
    try {
      const settings = (await MDH.state?.get?.('settings')) ?? {};
      await MDH.state.set('settings', { ...settings, lastTask: task, dockPos: manual ?? settings.dockPos ?? null });
    } catch {
      /* preferences are nice, not required */
    }
    togglePanel(false);
    MDH.ui?.notice?.('Starting from the page. The pill turns amber while it works.', { tone: 'info', ms: 3500 });
    await MDH.agent?.start?.(task, adapter);
    sync();
  }

  function togglePanel(open) {
    if (!panel) return;
    panel.hidden = !open;
    if (open) {
      panel.querySelector('textarea').value = input?.value ?? panel.dataset.lastTask ?? '';
      place();
      panel.querySelector('textarea').focus({ preventScroll: true });
    }
  }

  function build() {
    host = document.createElement('div');
    host.id = 'mdh-dock';
    host.style.cssText = `all: initial; position: fixed; inset: 0; z-index: ${Z}; pointer-events: none;`;
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.append(style);

    pill = el('button', { class: 'pill', type: 'button', 'aria-label': 'Start MDH' },
      el('span', { class: 'dot', id: 'dot' }),
      el('span', { class: 'icon', text: '▶' }),
      el('span', { class: 'label', text: 'Start' }),
      el('span', { class: 'turn', text: '' }),
    );
    pill.style.pointerEvents = 'auto';
    pill.addEventListener('click', onClick);
    pill.addEventListener('pointerdown', onPointerDown);
    pill.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && panel && !panel.hidden) {
        event.preventDefault();
        togglePanel(false);
      }
    });

    panel = el('div', { class: 'panel', role: 'dialog', 'aria-label': 'Start MDH' });
    panel.hidden = true;
    panel.style.pointerEvents = 'auto';

    const label = el('label', { text: 'Task (one instruction, no essay)' });
    label.htmlFor = 'mdh-dock-task';
    input = el('textarea', { id: 'mdh-dock-task', rows: 2, placeholder: 'find every file over 100 MB in ~/projects' });
    input.value = '';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        startWithTask(input.value);
      }
      if (event.key === 'Escape') togglePanel(false);
    });

    const hideLink = el('button', { class: 'hide-link', type: 'button', text: 'Hide on this site' });
    hideLink.addEventListener('click', () => setHidden(true));

    const startBtn = el('button', { class: 'primary', type: 'button', text: 'Start' });
    startBtn.addEventListener('click', () => startWithTask(input.value));
    const cancel = el('button', { type: 'button', text: 'Close' });
    cancel.addEventListener('click', () => togglePanel(false));

    panel.append(
      label,
      input,
      el('div', { class: 'row' }, startBtn, cancel, el('span', { class: 'hint', text: 'Enter to start · Esc to close' })),
      el('div', { class: 'row' }, hideLink),
    );
    shadow.append(pill, panel);
    document.documentElement.append(host);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { left: parseFloat(pill.style.left) || 0, top: parseFloat(pill.style.top) || 0 };
    let moved = false;

    const move = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      manual = clampPos({ left: origin.left + dx, top: origin.top + dy }, { width: pill.offsetWidth, height: SIZE }, { width: innerWidth, height: innerHeight });
      place();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) savePos(manual);
      // A drag must not also count as a click on the button.
      pill.dataset.dragged = moved ? '1' : '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  async function onClick(event) {
    if (pill.dataset.dragged === '1') {
      pill.dataset.dragged = '';
      return;
    }
    event.preventDefault();
    const state = stateFor(MDH.agent?.status?.());
    if (state.action === 'start') {
      const settings = (await MDH.state?.get?.('settings')) ?? {};
      const last = String(settings.lastTask ?? '').trim();
      if (last && !(panel && !panel.hidden)) return startWithTask(last);
      togglePanel(true);
      return;
    }
    if (state.action === 'stop') {
      MDH.agent?.stop?.('paused from the page');
      sync();
      return;
    }
    if (state.action === 'resume') {
      await MDH.agent?.resume?.();
      sync();
      return;
    }
    if (state.action === 'report') {
      MDH.ui?.issue?.({ reason: 'stopped after a failure', detail: 'Opened from the page control.' });
    }
  }

  /** Reflect the agent without asking it to cooperate: poll cheaply, and let the agent call this too. */
  function sync() {
    if (!pill) return;
    const state = stateFor(MDH.agent?.status?.());
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      const icon = pill.querySelector('.icon');
      const label = pill.querySelector('.label');
      const dot = pill.querySelector('.dot');
      if (icon) icon.textContent = state.icon;
      if (label) label.textContent = state.label;
      if (dot) {
        dot.className =
          'dot' +
          (['running', 'waiting-reply', 'executing', 'starting', 'injecting', 'resuming'].includes(state.phase) ? ' busy' : '') +
          (state.phase === 'error' ? ' bad' : '') +
          (state.phase === 'paused' ? ' paused' : '');
      }
      pill.dataset.phase = state.phase;
      pill.dataset.phase = state.phase;
    }
    // Title and aria-label are refreshed with the reason and the turn, not only on a phase change: the reason is
    // attached while the phase (paused) stays the same, and a stale tooltip is worse than none.
    const title = explain(state);
    if (pill.title !== title) {
      pill.title = title;
      pill.setAttribute('aria-label', title);
    }
    const turn = pill.querySelector('.turn');
    if (turn) turn.textContent = state.turn > 0 ? `turn ${state.turn}` : '';
  }

  async function mount(nextAdapter) {
    adapter = nextAdapter ?? MDH.platforms?.match?.(location.hostname);
    if (!adapter || host) return;
    try {
      const settings = (await MDH.state?.get?.('settings')) ?? {};
      manual = settings.dockPos ?? null;
      hiddenHere = Boolean(settings.dockHidden?.[location.hostname]);
    } catch {
      manual = null;
    }
    // Some layouts put their send button exactly where the pill wants to live. Hidden is a per-site choice,
    // remembered, and reversible from the popup — never a state the user cannot get out of.
    if (hiddenHere) return;
    build();
    sync();
    place();
    window.addEventListener('resize', queuePlace, { passive: true });
    window.addEventListener('scroll', queuePlace, { passive: true, capture: true });
    poll = setInterval(sync, 1200);
    queuePlace();
  }

  /**
   * Hide or show the pill for this host, remembered in settings. The popup owns the switch as well, so a pill
   * hidden by accident is one click from coming back — the classic way a feature disappears forever.
   */
  async function setHidden(hidden, nextAdapter = null) {
    hiddenHere = Boolean(hidden);
    if (nextAdapter) adapter = nextAdapter;
    try {
      const settings = (await MDH.state?.get?.('settings')) ?? {};
      const map = { ...(settings.dockHidden ?? {}) };
      const key = location.hostname;
      if (hidden) map[key] = true;
      else delete map[key];
      await MDH.state.set('settings', { ...settings, dockHidden: map });
    } catch {
      /* the choice still applies for this page */
    }
    if (hidden) destroy();
    else await mount(adapter ?? undefined);
    return { hidden: hiddenHere };
  }

  function destroy() {
    if (poll) clearInterval(poll);
    poll = 0;
    window.removeEventListener('resize', queuePlace);
    window.removeEventListener('scroll', queuePlace, { capture: true });
    host?.remove();
    host = shadow = pill = panel = input = null;
  }

  MDH.dock = {
    mount,
    sync,
    destroy,
    setHidden,
    stateFor,
    get mounted() {
      return Boolean(host);
    },
    get hidden() {
      return hiddenHere;
    },
    _internals: {
      explain, clampPos, anchorFor, PHASES },
  };
})();
