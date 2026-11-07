/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * platforms/gemini.js — Gemini (gemini.google.com).
 *
 * There is no SSE here: the page calls `BardChatUi/…/StreamGenerate` and receives a JSON-array body.
 * So the read mode is `body` — "the fetch resolved" *is* completion (`docs/PLATFORMS.md` §Gemini) — and the DOM is a
 * cross-check rather than a fallback, because the RPC's array positions are fragile.
 *
 * Reading a whole body means no terminal frame and no streaming cursor: patience is a fixed wait, not a
 * heuristic. It is the least elegant adapter and the least likely to break.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;

  /** Pull the most plausible answer string out of the nested-array payload. */
  function extractBody(raw) {
    const text = String(raw ?? '');
    const cleaned = text.replace(/^\)\]\}'?\s*/, '').trim();

    const candidates = [];
    const collect = (node) => {
      if (typeof node === 'string') {
        if (node.length >= 12 && !/^(https?:|\/\/|[a-zA-Z0-9_-]{1,3}$)/.test(node)) candidates.push(node);
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (node && typeof node === 'object') Object.values(node).forEach(collect);
    };

    // Batchexecute wraps each chunk as `[["wrb.fr", null, "<json string>"]]`.
    const jsonStrings = cleaned.match(/"((?:[^"\\]|\\.){40,})"/g) ?? [];
    for (const quoted of jsonStrings) {
      try {
        collect(JSON.parse(JSON.parse(quoted)));
      } catch {
        /* not JSON inside the string */
      }
    }
    if (!candidates.length) {
      try {
        collect(JSON.parse(cleaned));
      } catch {
        collect(cleaned.split(/\s{2,}/));
      }
    }
    candidates.sort((a, b) => b.length - a.length);
    return (candidates[0] ?? '').replace(/\\n/g, '\n').trim();
  }

  MDH.platforms.register({
    id: 'gemini',
    name: 'Gemini',
    host: /(^|\.)gemini\.google\.com$/,
    // Where to continue when this conversation refuses another message (see docs/SCENARIOS.md §19).
    newChat: 'https://gemini.google.com/app',
    home: 'https://gemini.google.com/app',
    sse: {
      apiPattern: /(BardChatUi|StreamGenerate|batchexecute)/,
      mode: 'body',
      extract(frame) {
        return extractBody(frame?.raw ?? '');
      },
    },
    dom: {
      composer: [
        'rich-textarea .ql-editor[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        'div.ql-editor.textarea.new-input-ui p',
        'div[role="textbox"][contenteditable="true"]',
        'textarea',
      ],
      send: ['button.send-button:not(.stop)', 'button.mat-mdc-icon-button.send-button', 'button[aria-label*="Send" i]'],
      messages: ['model-response message-content', '.model-response-text', 'model-response', 'message-content'],
      stop: ['button.send-button.stop', 'button[aria-label*="Stop" i]'],
    },
    pace: { minGapMs: 3000, perMinute: 8 },
    timings: { idleMs: 3000, stableMs: 4000, warmupMs: 45000, timeoutMs: 300000 },
  });
})();
