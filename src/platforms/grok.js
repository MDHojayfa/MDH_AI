/**
 * platforms/grok.js — Grok (grok.com, x.com/i/grok).
 *
 * Stream: POST /rest/app-chat/conversations/new (or /{id}/responses) — SSE with a plain `[DONE]`, and
 * the text delta at `result.response.token` (`docs/PLATFORMS.md` §Grok). The request advertises
 * `grpc-web+proto`; the response is JSON. We only read the response, so the header is irrelevant.
 *
 * Lowest confidence adapters in the set: selectors are a community guess, so the DOM path is expected
 * to be the real one until M8 fills in docs/M8-PLAYBOOK.md.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const { pickString } = MDH.platforms?.util ?? {};

  MDH.platforms.register({
    id: 'grok',
    name: 'Grok',
    host: /(^|\.)grok\.com$/,
    match: (hostname, pathname) => /(^|\.)grok\.com$/.test(hostname) || (/^(\/i\/grok|.*\/grok)$/.test(pathname ?? '') && /(^|\.)x\.com$/.test(hostname)),
    home: 'https://grok.com/',
    sse: {
      apiPattern: /\/rest\/app-chat\/conversations\//,
      mode: 'sse',
      extract(json) {
        return pickString(json, ['result.response.token', 'result.response.message', 'token']) || '';
      },
      end(json) {
        return json?.result?.response?.isFinal === true || json?.result?.response?.final === true;
      },
      refusal: /(rate|limit|too many|try again)/i,
    },
    dom: {
      composer: ['.chat-input-container textarea', '.input-area textarea', 'textarea[aria-label*="Ask" i]', 'div[contenteditable="true"]'],
      send: ['button[type="submit"]', 'button[aria-label*="Submit" i]', '.ml-auto.flex.flex-row.items-end.gap-1 button'],
      messages: ['div.message-bubble', '.prose', '[data-testid="message"]'],
      stop: ['button[aria-label*="Stop" i]', '.stop-button'],
    },
    pace: { minGapMs: 3500, perMinute: 6 },
    timings: { idleMs: 3500, stableMs: 5000, warmupMs: 60000, timeoutMs: 300000 },
  });
})();
