/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * platforms/claude.js — Claude (claude.ai).
 *
 * Stream: POST /api/organizations/{org}/chat_conversations/{id}/completion — SSE whose terminal frame is
 * `stop_reason: "stop_sequence"`, not `[DONE]` (`docs/PLATFORMS.md` §Claude). Editor is ProseMirror.
 *
 * The editor is the hard part, not the stream: ProseMirror ignores a plain `value = …` and a synthetic
 * `input` event, so the composer is written with `execCommand('insertText')` — deprecated by everyone,
 * supported by everyone, and the only thing that works across all eight sites.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const { pickString } = MDH.platforms?.util ?? {};

  MDH.platforms.register({
    id: 'claude',
    name: 'Claude',
    host: /(^|\.)claude\.ai$/,
    home: 'https://claude.ai/new',
    sse: {
      apiPattern: /\/chat_conversations\/[^/]+\/(completion|retry_completion)/,
      mode: 'sse',
      extract(json) {
        return (
          pickString(json, ['completion', 'delta.text', 'content_block.text', 'delta.text_delta.text']) ||
          (json?.error ? '' : '')
        );
      },
      end(json) {
        return json?.stop_reason === 'stop_sequence' || json?.type === 'message_stop' || json?.type === 'completion';
      },
      refusal: /(rate.?limit|too many|usage limit|out of (free )?messages)/i,
    },
    dom: {
      composer: [
        'div[contenteditable="true"].ProseMirror',
        '[data-testid="chat-input"]',
        'div[contenteditable="true"][role="textbox"]',
        'fieldset div[contenteditable="true"]',
      ],
      send: ['button[aria-label="Send message"]', 'button[aria-label*="Send" i]', 'button[type="submit"]'],
      messages: ['.font-claude-response', '.font-claude-message', '[data-testid="assistant-message"]', 'div[data-is-streaming]'],
      stop: ['button[aria-label="Stop response"]', 'button[aria-label*="Stop" i]', 'div[data-is-streaming="true"]'],
    },
    pace: { minGapMs: 3000, perMinute: 8 },
    timings: { idleMs: 2500, stableMs: 3500, warmupMs: 60000, timeoutMs: 300000 },
  });
})();
