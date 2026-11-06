/**
 * platforms/deepseek.js — DeepSeek (chat.deepseek.com). The best-measured platform in the project.
 *
 * Stream: POST /chat/completion (SSE). Pacing: **6 s between sends, at most 5 per minute** — measured,
 * not guessed (`docs/PLATFORMS.md` §DeepSeek), because this site answers bursts with "Messages too frequent" and that
 * refusal is what escalates a cooldown into an account action.
 *
 * In other words: the site is quick to say "too frequent" in Chinese, and the correct reply is patience,
 * not eloquence.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const { pickString, deepStrings } = MDH.platforms?.util ?? {};

  MDH.platforms.register({
    id: 'deepseek',
    name: 'DeepSeek',
    host: /(^|\.)chat\.deepseek\.com$/,
    home: 'https://chat.deepseek.com/',
    sse: {
      apiPattern: /\/chat\/completion/,
      mode: 'sse',
      extract(json) {
        return (
          pickString(json, [
            'v.response.fragments.0.content',
            'choices.0.delta.content',
            'choices.0.message.content',
            'content',
            'text',
          ]) || (deepStrings(json, 'content').pop() ?? '')
        );
      },
      end(json) {
        return json?.v?.response?.status === 'FINISHED' || json?.p === 'response/end' || json?.finished === true;
      },
      refusal: /messages?\s+too\s+frequent|too\s+many\s+(messages|requests)|请求过于频繁|稍后重试/i,
    },
    dom: {
      composer: ['textarea.ds-textarea', 'textarea[placeholder]', '.ds-textarea'],
      send: ['.ds-button--primary', '.ds-toggle-button', 'div[role="button"][aria-disabled="false"]'],
      messages: ['.ds-message', '.ds-markdown', '.ds-think-content'],
      stop: ['.ds-loading', 'div[role="button"][aria-label*="Stop" i]'],
    },
    pace: { minGapMs: 6000, perMinute: 5 },
    timings: { idleMs: 6000, stableMs: 9000, warmupMs: 45000, timeoutMs: 420000 },
  });
})();
