/**
 * platforms/qwen.js
 * Two hosts, one product: `chat.qwen.ai` speaks the international shape, the domestic hosts speak a
 * slightly different one. Same selectors, different endpoint — which is the cheapest kind of divergence. — Qwen, international build (chat.qwen.ai).
 *
 * Stream: POST /api/v2/chat/completions (SSE). The domestic product has a different DOM but the same
 * stream shape, so it lives in qwen-domestic.js and shares this parser's expectations.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const { pickString, deepStrings } = MDH.platforms?.util ?? {};

  MDH.platforms.register({
    id: 'qwen',
    name: 'Qwen',
    host: /(^|\.)chat\.qwen\.ai$/,
    home: 'https://chat.qwen.ai/',
    sse: {
      apiPattern: /(\/api\/v2\/chat\/completions|\/chat\/completions)/,
      mode: 'sse',
      extract(json) {
        return (
          pickString(json, ['choices.0.delta.content', 'choices.0.message.content', 'data.delta.content']) ||
          (deepStrings(json, 'content').pop() ?? '')
        );
      },
      end(json) {
        return json?.choices?.[0]?.finish_reason != null || json?.done === true;
      },
      refusal: /(rate|limit|too many|frequent|稍后)/i,
    },
    dom: {
      composer: ['.message-input-wrapper textarea', '.chat-message-input-fixed-container textarea', 'textarea'],
      send: ['.message-input-wrapper button:not([disabled])', 'button[aria-label*="Send" i]', 'button:has(svg)'],
      messages: ['.qwen-chat-message-assistant .response-message-content', '.response-message-content', '.qwen-chat-message'],
      stop: ['button[aria-label*="Stop" i]', '.stop-btn'],
    },
    pace: { minGapMs: 3000, perMinute: 8 },
    timings: { idleMs: 2500, stableMs: 3500, warmupMs: 45000, timeoutMs: 300000 },
  });
})();
