/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * platforms/kimi.js — Kimi (kimi.com, kimi.moonshot.cn).
 *
 * Two generations of the same product:
 *   · kimi.com         → POST /api/chat/{id}/completion/stream, SSE, `{event:"cmpl", text}` → `all_done`
 *   · kimi.moonshot.cn → framed (binary) Connect-RPC, decoded by the brace-depth scanner
 * The mode is therefore a *function of the URL*, not of the account (`docs/PLATFORMS.md` §Kimi).
 *
 * Two backends, one brand, no warning in advance. The URL is the only honest signal available, so the
 * adapter reads it before anything else and never asks the account what it is.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const { pickString } = MDH.platforms?.util ?? {};

  MDH.platforms.register({
    id: 'kimi',
    name: 'Kimi',
    host: /(^|\.)(kimi\.com|kimi\.moonshot\.cn|moonshot\.cn)$/,
    home: 'https://www.kimi.com/',
    sse: {
      apiPattern: /(completion\/stream|ChatService\/Chat|kimi\.gateway\.chat)/,
      mode: (url) => (/moonshot\.cn/.test(String(url)) ? 'binary' : 'sse'),
      extract(json) {
        return pickString(json, ['text', 'delta', 'choices.0.delta.content', 'result.content']) || '';
      },
      end(json) {
        return json?.event === 'all_done' || json?.event === 'done' || json?.done === true;
      },
      refusal: /(rate|limit|too many|frequent)/i,
    },
    dom: {
      composer: ['.chat-input-editor[contenteditable="true"]', '.chat-input-editor', 'div[contenteditable="true"]'],
      send: ['.send-button-container', '.send-button', 'svg.send-icon'],
      messages: ['.segment-assistant .segment-content', '.segment-assistant', '.segment-content'],
      stop: ['.send-button-container.stop', '.stop-button'],
    },
    pace: { minGapMs: 3000, perMinute: 8 },
    timings: { idleMs: 3000, stableMs: 4000, warmupMs: 60000, timeoutMs: 300000 },
  });
})();
