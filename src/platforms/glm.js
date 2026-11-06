/**
 * platforms/glm.js — GLM / Z.ai (chat.z.ai, z.ai, chatglm.cn).
 *
 * Two products, two streams (`/api/chat/completion` on z.ai, `/backend-api/assistant/stream` on
 * chatglm.cn) and one selector vocabulary — the closest pair in the set (`docs/PLATFORMS.md` §GLM).
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const { pickString, deepStrings } = MDH.platforms?.util ?? {};

  MDH.platforms.register({
    id: 'glm',
    name: 'GLM / Z.ai',
    host: /(^|\.)(chat\.z\.ai|z\.ai|chatglm\.cn|chat\.glm\.cn)$/,
    home: 'https://chat.z.ai/',
    sse: {
      apiPattern: /(\/chat\/completion|\/api\/chat\/completion|assistant\/stream)/,
      mode: 'sse',
      extract(json) {
        return (
          pickString(json, ['choices.0.delta.content', 'data.delta.content', 'delta.content', 'content']) ||
          (deepStrings(json, 'content').pop() ?? '')
        );
      },
      end(json) {
        return json?.choices?.[0]?.finish_reason != null || json?.done === true || json?.status === 'finished';
      },
      refusal: /(rate|limit|too many|frequent|稍后|频繁)/i,
    },
    dom: {
      composer: ['#chat-input', 'textarea#chat-input', '.ds-textarea', 'div[contenteditable="true"]'],
      send: ['#send-message-button', 'button[type="submit"]', 'button[aria-label*="Send" i]'],
      messages: ['.chat-assistant .markdown-prose', '.chat-assistant', '.markdown-prose', '.thinking-chain-container'],
      stop: ['#send-message-button[disabled]', '.stop-button', 'button[aria-label*="Stop" i]'],
    },
    pace: { minGapMs: 3000, perMinute: 8 },
    timings: { idleMs: 2500, stableMs: 3500, warmupMs: 45000, timeoutMs: 300000 },
  });
})();
