/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * platforms/chatgpt.js — ChatGPT (chatgpt.com, chat.openai.com).
 *
 * Stream: POST /backend-api/conversation, SSE. Each event carries the message **so far**, not a delta,
 * so the mode is `replace` (the first prose is not the answer — `docs/PLATFORMS.md` §ChatGPT).
 *
 * Fun fact with a point: this is the adapter that made the parser take the *last* closed fence. A reply
 * that narrates first and calls last is normal here, and reading the first block executed a plan instead
 * of a command exactly once, which was enough.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const { pickString, deepStrings } = MDH.platforms?.util ?? {};

  MDH.platforms.register({
    id: 'chatgpt',
    name: 'ChatGPT',
    host: /(^|\.)(chatgpt\.com|chat\.openai\.com)$/,
    home: 'https://chatgpt.com/',
    sse: {
      apiPattern: /\/backend-api\/conversation/,
      mode: 'sse',
      deltaMode: 'replace',
      extract(json) {
        return (
          pickString(json, ['message.content.parts.0', 'message.content.text']) ||
          (deepStrings(json, 'content').pop() ?? '')
        );
      },
      end(json) {
        return json?.message?.status === 'finished_successfully' && json?.message?.end_turn === true;
      },
    },
    dom: {
      composer: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'textarea[data-id]'],
      send: ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]', 'button[aria-label*="Send message" i]'],
      messages: ['[data-message-author-role="assistant"]', 'div.markdown'],
      stop: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop" i]'],
    },
    pace: { minGapMs: 3000, perMinute: 8 },
    timings: { idleMs: 2500, stableMs: 3500, warmupMs: 45000, timeoutMs: 300000 },
  });
})();
