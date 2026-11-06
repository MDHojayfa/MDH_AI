/**
 * core/ui.js — everything the user sees inside the chat page.
 *
 * Shadow DOM, no framework, text-node-only for anything the model produced. The one rule that matters:
 * **the card renders the parsed request, never the model's prose** (`docs/SECURITY.md` §3).
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;

  const STYLE = `
    :host { all: initial; }
    .root {
      position: fixed; inset: auto 0 92px 0; display: flex; flex-direction: column;
      align-items: center; gap: 8px; z-index: 2147483000; pointer-events: none;
      font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #e6edf3;
    }
    .card {
      pointer-events: auto; width: min(520px, calc(100vw - 32px));
      background: #0f1418; border: 1px solid #26313a; border-radius: 12px;
      box-shadow: 0 18px 48px rgba(0,0,0,.45); overflow: hidden;
    }
    .hd { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #131a20; border-bottom: 1px solid #26313a; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; flex: none; }
    .dot.warn { background: #fbbf24; }
    .dot.err { background: #f87171; }
    .title { font-weight: 600; font-size: 13px; letter-spacing: .01em; }
    .clock { margin-left: auto; font-variant-numeric: tabular-nums; font-size: 12px; color: #93a3b1; }
    .bd { padding: 12px 14px; }
    .tool { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: #93a3b1; margin-bottom: 8px; }
    .cmd, .path {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
      background: #0b0f13; border: 1px solid #1e2830; border-radius: 8px;
      padding: 8px 10px; white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto;
    }
    .meta { margin-top: 8px; font-size: 12px; color: #7d8b98; }
    .why { margin-top: 8px; font-size: 12px; color: #fbbf24; }
    .ft { display: flex; gap: 8px; padding: 10px 14px; background: #131a20; border-top: 1px solid #26313a; }
    button {
      font: inherit; font-size: 13px; border-radius: 8px; padding: 7px 12px; cursor: pointer;
      border: 1px solid #2c3a45; background: #18222b; color: #e6edf3;
    }
    button:hover { background: #1e2a34; }
    button.primary { background: #14532d; border-color: #166534; }
    button.primary:hover { background: #166534; }
    button.danger { background: #2a1215; border-color: #4c1d24; color: #fca5a5; }
    button:focus-visible { outline: 2px solid #4ade80; outline-offset: 2px; }
    .spacer { flex: 1; }
    .bar { height: 3px; background: #1e2830; }
    .bar > i { display: block; height: 100%; background: #fbbf24; width: 0%; transition: width .25s linear; }
    .steps { margin: 0; padding-left: 18px; }
    .steps li { margin: 2px 0; }
    .steps li.done { color: #7d8b98; text-decoration: line-through; }
    .toast {
      pointer-events: none; background: #0f1418; border: 1px solid #26313a; border-radius: 10px;
      padding: 8px 12px; font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,.4);
      animation: in .18s ease-out;
    }
    @keyframes in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    .fun-tag {
      display: inline-block; font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
      color: #7dd3fc; border: 1px solid #1e3a4a; border-radius: 5px; padding: 1px 5px;
      margin-right: 6px; vertical-align: 1px;
    }
    .mission .line { font-size: 13px; color: #93a3b1; min-height: 1.4em; }
    .mission .real { font-size: 12px; color: #7d8b98; margin-top: 6px; }
    .quip { margin-top: 8px; font-size: 12.5px; color: #a78bfa; font-style: italic; }
    .row-btns { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .shimmer { height: 2px; background: #1e2830; overflow: hidden; }
    .shimmer > i {
      display: block; height: 100%; width: 30%; background: linear-gradient(90deg, transparent, #7dd3fc, transparent);
      animation: sweep 1.6s ease-in-out infinite;
    }
    @keyframes sweep { from { transform: translateX(-100%); } to { transform: translateX(400%); } }
    @media (prefers-reduced-motion: reduce) { .shimmer > i { animation: none; width: 100%; opacity: .4; } }
    input[type=text] {
      width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; color: #e6edf3;
      background: #0b0f13; border: 1px solid #1e2830; border-radius: 8px; padding: 8px 10px;
    }
  `;

  let host = null;
  let root = null;
  let stack = [];

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
    for (const child of children) if (child) node.append(child);
    return node;
  }

  function mount() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement('mdh-root');
    host.style.cssText = 'all: initial; position: fixed; z-index: 2147483000;';
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const layer = el('div', { class: 'root' });
    layer.id = 'layer';
    root.append(style, layer);
    document.documentElement.append(host);
  }

  const layer = () => root?.getElementById('layer');

  function addCard(card) {
    mount();
    layer().append(card);
    stack.push(card);
    return card;
  }

  function removeCard(card) {
    stack = stack.filter((c) => c !== card);
    card?.remove();
  }

  /**
   * Approval. Resolves `deny|once|always` and never rejects; the timeout is a deny, because silence is
   * not consent (docs/SECURITY.md §3).
   */
  function showApproval(desc, { timeoutMs = 120000 } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (decision) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        document.removeEventListener('keydown', onKey, true);
        removeCard(card);
        resolve(decision);
      };

      const title =
        desc.verdict.decision === 'deny'
          ? 'MDH blocked this'
          : desc.command
            ? 'MDH wants to run a command'
            : `MDH wants to use ${desc.tool}`;

      const body = el('div', { class: 'bd' });
      body.append(el('div', { class: 'tool', text: desc.tool }));

      if (desc.command) body.append(el('div', { class: 'cmd', text: desc.command }));
      else if (desc.paths?.length) body.append(el('div', { class: 'path', text: desc.paths.join('\n') }));
      else if (desc.preview?.kind === 'content') {
        const lines = String(desc.preview.text).split('\n');
        const shown = lines.slice(0, 6).join('\n');
        body.append(el('div', { class: 'cmd', text: shown }));
        if (lines.length > 6) body.append(el('div', { class: 'meta', text: `+${lines.length - 6} more lines` }));
      } else if (desc.preview?.kind === 'edit') {
        body.append(el('div', { class: 'cmd', text: `- ${desc.preview.find}\n+ ${desc.preview.replace}` }));
      }

      if (desc.verdict.decision === 'deny') {
        body.append(el('div', { class: 'why', text: desc.verdict.reason ?? 'not allowed by policy' }));
      }

      const footer = el('div', { class: 'ft' });
      const deny = el('button', { class: 'danger', text: 'Deny', onclick: () => finish('deny') });
      footer.append(deny, el('div', { class: 'spacer' }));

      if (desc.verdict.decision !== 'deny') {
        footer.append(
          el('button', { text: 'Allow once', onclick: () => finish('once') }),
          el('button', { class: 'primary', text: 'Always', title: 'Always for this exact call, this tab', onclick: () => finish('always') }),
        );
      } else {
        footer.append(el('button', { text: 'OK', onclick: () => finish('deny') }));
      }

      const card = el('div', { class: 'card', role: 'dialog', 'aria-modal': 'false', 'aria-label': title },
        el('div', { class: 'hd' }, el('span', { class: `dot${desc.verdict.decision === 'deny' ? ' err' : ' warn'}` }), el('span', { class: 'title', text: title })),
        body,
        footer,
      );

      const onKey = (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          finish('deny');
        } else if (ev.key === 'Enter' && document.activeElement?.tagName !== 'INPUT') {
          ev.preventDefault();
          ev.stopPropagation();
          finish(desc.verdict.decision === 'deny' ? 'deny' : 'once');
        }
      };
      // Focus the card, not a button: a keystroke must never mean "allow" by accident.
      card.tabIndex = -1;
      document.addEventListener('keydown', onKey, true);
      const timer = setTimeout(() => finish('deny'), timeoutMs);

      addCard(card);
      card.focus({ preventScroll: true });
    });
  }

  /** `ask_user`, rendered as a small form. Resolves null if dismissed or timed out. */
  function askQuestion(question, options = [], { timeoutMs = 300000 } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        removeCard(card);
        resolve(value);
      };

      const body = el('div', { class: 'bd' }, el('div', { class: 'cmd', text: String(question ?? '').slice(0, 800) }));
      const footer = el('div', { class: 'ft' });
      let input = null;

      if (Array.isArray(options) && options.length) {
        for (const opt of options.slice(0, 6)) {
          footer.append(el('button', { text: String(opt), onclick: () => finish(String(opt)) }));
        }
      } else {
        input = el('input', { type: 'text', placeholder: 'Type your answer…' });
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') finish(input.value);
          if (ev.key === 'Escape') finish(null);
        });
        body.append(input);
        footer.append(el('button', { class: 'primary', text: 'Send', onclick: () => finish(input.value) }));
      }
      footer.append(el('div', { class: 'spacer' }), el('button', { text: 'Skip', onclick: () => finish(null) }));

      const card = el('div', { class: 'card' }, el('div', { class: 'hd' }, el('span', { class: 'dot warn' }), el('span', { class: 'title', text: 'The model asked you' })), body, footer);
      const timer = setTimeout(() => finish(null), timeoutMs);
      addCard(card);
      input?.focus();
    });
  }

  /** Checklist card for `update_plan`. */
  function showPlan(steps, { title = 'Plan' } = {}) {
    const body = el('div', { class: 'bd' });
    const list = el('ol', { class: 'steps' });
    for (const step of steps ?? []) {
      const text = typeof step === 'string' ? step : step?.step ?? String(step);
      const done = typeof step === 'object' && step?.status === 'done';
      list.append(el('li', { class: done ? 'done' : '', text }));
    }
    body.append(list);
    const card = el('div', { class: 'card' }, el('div', { class: 'hd' }, el('span', { class: 'dot' }), el('span', { class: 'title', text: title })), body);
    card.id = 'mdh-plan';
    root?.getElementById('mdh-plan')?.remove();
    addCard(card);
    return card;
  }

  /** One-shot toast. It disappears on its own; the audit log does not, which is the right way round. */
  /** One-shot toast. */
  function notice(text, { tone = 'info', ms = 5000 } = {}) {
    mount();
    const node = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }, el('span', { text: String(text) }));
    if (tone === 'warn') node.style.borderColor = '#6b4a12';
    if (tone === 'err') node.style.borderColor = '#5c1f26';
    layer().append(node);
    setTimeout(() => node.remove(), ms);
    return node;
  }

  /**
   * Countdown card (rate limits, stalls). `until` is a wall-clock timestamp, never a tick count —
   * background tabs throttle timers (hidden tabs throttle timers — `docs/ARCHITECTURE.md` §7).
   */
  function countdown({ title, text, until, tone = 'warn', actions = [], doneText = 'You can try again now.' }) {
    mount();
    const clock = el('span', { class: 'clock' });
    const bar = el('div', { class: 'bar' }, el('i'));
    const body = el('div', { class: 'bd' }, el('div', { class: 'cmd', text: text ?? '' }));
    const footer = el('div', { class: 'ft' });

    const card = el('div', { class: 'card' },
      el('div', { class: 'hd' }, el('span', { class: `dot ${tone === 'error' ? 'err' : 'warn'}` }), el('span', { class: 'title', text: title }), clock),
      body, bar, footer,
    );

    const start = Date.now();
    const total = Math.max(1, until - start);
    let timer = null;

    const tick = () => {
      const left = until - Date.now();
      if (left <= 0) {
        clock.textContent = doneText;
        bar.firstChild.style.width = '100%';
        clearInterval(timer);
        return;
      }
      clock.textContent = MDH.util.clock(left);
      bar.firstChild.style.width = `${Math.min(100, ((total - left) / total) * 100).toFixed(1)}%`;
    };

    const close = () => {
      clearInterval(timer);
      removeCard(card);
    };

    for (const action of actions) {
      footer.append(el('button', { text: action.label, class: action.primary ? 'primary' : '', onclick: () => action.fn(close) }));
    }
    footer.append(el('div', { class: 'spacer' }));

    addCard(card);
    tick();
    timer = setInterval(tick, 500);
    return { close, card };
  }

  /**
   * The waiting card. One real sentence ("waiting for the reply") plus one rotating joke, labelled `fun`
   * so nobody mistakes the Pluto laser for a progress report. Returns `{ close }`.
   */
  function mission({ title = 'Working', real = 'Waiting for the reply — the mission log below is decorative.' } = {}) {
    mount();
    const line = el('div', { class: 'line', 'aria-hidden': 'true' });
    line.append(el('span', { class: 'fun-tag', text: 'fun' }), el('span', { text: '' }));
    const joke = line.lastChild;
    const body = el('div', { class: 'bd' },
      line,
      el('div', { class: 'real', role: 'status', 'aria-live': 'polite', text: real }),
    );
    const card = el('div', { class: 'card mission' },
      el('div', { class: 'hd' }, el('span', { class: 'dot warn' }), el('span', { class: 'title', text: title })),
      body,
      el('div', { class: 'shimmer' }, el('i')),
    );
    card.id = 'mdh-mission';
    root?.getElementById('mdh-mission')?.remove();
    addCard(card);

    const stop = MDH.fun?.rotate ? MDH.fun.rotate(joke, { everyMs: 2600 }) : () => {};
    return {
      close() {
        stop();
        removeCard(card);
      },
      setReal(text) {
        body.querySelector('.real').textContent = text;
      },
    };
  }

  /**
   * The failure card. Three things, in this order: what broke (true), a line about the developer having no
   * NASA PC (labelled as a joke), and a button that opens the bug form with the context already filled.
   * A dead end with a door in it is the whole idea.
   */
  function issue({ reason = 'Something went wrong', detail = '', seed = Date.now() } = {}) {
    mount();
    const quip = MDH.report?.issueLine(seed) ?? 'If you found a bug, the issue tracker is the QA team.';
    const body = el('div', { class: 'bd' },
      el('div', { class: 'cmd', text: String(detail || reason) }),
      el('div', { class: 'quip', text: quip }),
    );
    const copyBtn = el('button', {
      text: 'Copy log',
      onclick: async () => {
        const lines = (MDH.log?.tail?.(60) ?? []).map(
          (entry) => `${new Date(entry.at).toISOString()} ${entry.level} ${entry.text}`,
        );
        const text = [`MDH_AI ${MDH.VERSION ?? 'dev'} · in-page log`, '', ...lines].join('\n');
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = 'Copied';
          setTimeout(() => (copyBtn.textContent = 'Copy log'), 1400);
        } catch {
          copyBtn.textContent = 'Copy failed';
        }
      },
    });
    const open = el('button', {
      class: 'primary',
      text: 'Open an issue',
      onclick: () => {
        const url = MDH.report?.issueUrl({
          title: '[bug] ',
          stage: 'agent',
          platform: globalThis.MDH?.platforms?.match?.(location.hostname)?.id ?? 'unknown',
          browser: navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Chrome',
          detail: String(detail || reason).slice(0, 600),
        });
        if (url) globalThis.open?.(url, '_blank', 'noopener');
        close();
      },
    });
    const footer = el('div', { class: 'ft' }, open, copyBtn, el('div', { class: 'spacer' }));
    const closeBtn = el('button', { text: 'Dismiss', onclick: () => close() });
    footer.append(closeBtn);

    const card = el('div', { class: 'card' },
      el('div', { class: 'hd' }, el('span', { class: 'dot err' }), el('span', { class: 'title', text: 'MDH stopped' })),
      body,
      footer,
    );
    card.id = 'mdh-issue';
    root?.getElementById('mdh-issue')?.remove();
    addCard(card);
    const close = () => removeCard(card);
    return { close };
  }

  /**
   * Adapter drift: the page is still one of the eight, but the button it used to have is gone. That is the
   * single most likely breakage in this product's life, and it is the one case where the extension knows
   * exactly which selector failed — so it says the selector out loud and puts it in the report.
   */
  function drift({ platform = 'unknown', selectors = [], reason = 'not found', seed = Date.now() } = {}) {
    mount();
    const list = selectors.length ? selectors.join('\n· ') : '(no selectors configured)';
    const body = el('div', { class: 'bd' },
      el('div', { class: 'cmd', text: `${platform}: ${reason} — the site probably changed its markup.` }),
      el('div', { class: 'quip', text: 'Selectors tried:' }),
      el('div', { class: 'cmd', text: `· ${list}` }),
      el('div', { class: 'quip', text: MDH.report?.issueLine(seed) ?? '' }),
    );
    const open = el('button', {
      class: 'primary',
      text: 'Report this selector',
      onclick: () => {
        const url = MDH.report?.issueUrl({
          title: `[bug] ${platform}: selector no longer matches`,
          stage: 'send',
          platform,
          browser: navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Chrome',
          detail: `Selector no longer matches on ${platform}.\nTried:\n${list}`,
        });
        if (url) globalThis.open?.(url, '_blank', 'noopener');
        close();
      },
    });
    const card = el('div', { class: 'card' },
      el('div', { class: 'hd' }, el('span', { class: 'dot err' }), el('span', { class: 'title', text: 'Page changed' })),
      body,
      el('div', { class: 'ft' }, open, el('div', { class: 'spacer' }), el('button', { text: 'Dismiss', onclick: () => close() })),
    );
    card.id = 'mdh-drift';
    root?.getElementById('mdh-drift')?.remove();
    addCard(card);
    const close = () => removeCard(card);
    return { close };
  }

  function clear() {
    for (const card of [...stack]) card.remove();
    stack = [];
  }

  MDH.ui = { mount, showApproval, askQuestion, showPlan, notice, countdown, mission, issue, drift, clear, el, removeCard };
})();
