/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * platforms/qwen-domestic.js
 * The domestic host is a separate file because its URL signature and its permission entries are separate.
 * A shared file would have needed a runtime branch on the hostname, which is how adapters start leaking
 * logic into each other. — 通义千问 / Qwen, domestic build (tongyi.aliyun.com, qianwen.com).
 *
 * Same stream, different chrome: an Angular-ish DOM with `.message-input-container-area`. Two files
 * sharing one parser beats one file full of host checks (docs/PLATFORMS.md §per-platform notes).
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const { pickString, deepStrings } = MDH.platforms?.util ?? {};

  MDH.platforms.register({
    id: 'qwen-domestic',
    name: 'Qwen (通义千问)',
    host: /(^|\.)(tongyi\.aliyun\.com|qianwen\.aliyun\.com|qianwen\.com|chat2\.qianwen\.com)$/,
    // Where to continue when this conversation refuses another message (see docs/SCENARIOS.md §19).
    newChat: 'https://tongyi.aliyun.com/qianwen/',
    home: 'https://tongyi.aliyun.com/qianwen/',
    sse: {
      apiPattern: /(chat2-api|chat\/completions|\/api\/v[12]\/chat\/completion)/,
      mode: 'sse',
      extract(json) {
        return (
          pickString(json, ['choices.0.delta.content', 'data.content', 'contents.0.content']) ||
          (deepStrings(json, 'content').pop() ?? '')
        );
      },
      end(json) {
        return json?.choices?.[0]?.finish_reason != null || json?.done === true;
      },
      refusal: /(rate|limit|too many|frequent|稍后|频繁)/i,
    },
    dom: {
      composer: ['.message-input-container-area textarea', '.chat-input textarea', 'textarea'],
      send: ['.message-input-wrapper button', '.send-btn', 'div[role="button"][class*="send"]'],
      messages: ['.qwen-chat-message-assistant', '.qwen-chat-message', '.response-message-box'],
      stop: ['div[role="button"][class*="stop"]', '.stop-btn'],
    },
    pace: { minGapMs: 3000, perMinute: 8 },
    timings: { idleMs: 2500, stableMs: 3500, warmupMs: 45000, timeoutMs: 300000 },
  });
})();
