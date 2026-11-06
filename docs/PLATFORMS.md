# Platform reference

Eight platforms, one adapter each. An adapter is data: a host pattern, a read mode, a network signature,
a handful of selectors for the composer and the send button, pacing and timing. No logic, no imports, no
timers — a platform file that needs more than this is a design bug.

```js
MDH.platforms.register({
  id: 'deepseek',
  host: /chat\.deepseek\.com/,               // matched against location.hostname
  sse: {
    apiPattern: /chat\/completion/,
    mode: 'sse',                             // 'sse' | 'binary' | 'body'
    extract(chunk) {},                       // -> string | null
    refusal: /too frequent|稍后重试/i,        // text that means the message was NOT accepted
  },
  dom: { composer: [...], send: [...], messages: [...], streaming: [...] },
  pace: { minGapMs: 6000, perMinute: 5 },
  timings: { idleMs, stableMs, warmupMs, timeoutMs, hidden: { idleMs, stableMs } },
});
```

## The eight

| # | Platform | Hosts | Read mode | Network signature |
|---|---|---|---|---|
| 1 | ChatGPT | `chatgpt.com`, `chat.openai.com` | SSE, replace | `/backend-api/conversation` |
| 2 | Claude | `claude.ai` | SSE, append | `/chat_conversations/*/completion` — terminal `stop_sequence` |
| 3 | Gemini | `gemini.google.com` | whole body | `BardChatUi/…/StreamGenerate` |
| 4 | DeepSeek | `chat.deepseek.com` | SSE, append | `/chat/completion` |
| 5 | Kimi | `kimi.com`, `www.kimi.com`, `kimi.moonshot.cn` | SSE on the web host, byte-framed on `moonshot.cn` | `/api/chat/*/completion/stream`, `/ChatService/Chat/` |
| 6 | Qwen | `chat.qwen.ai`, `tongyi.aliyun.com`, `qianwen.com` | SSE, append | `/api/v2/chat/completions` |
| 7 | GLM · z.ai | `chat.z.ai`, `z.ai`, `chatglm.cn` | SSE, append | `/chat/completions`, `/backend-api/assistant/stream` |
| 8 | Grok | `grok.com`, `x.com/i/grok` | SSE, replace | `/rest/app-chat/conversations/…/responses` — terminal `[DONE]` |

**replace vs append.** ChatGPT and Grok re-send the whole message on every frame, so the reader replaces
the text rather than appending; appending there would duplicate the reply. Kimi's mode is a *function of
the URL*, not of the account, because the same product runs on two backends.

**Gemini has no stream to watch.** Its RPC resolves once with the finished answer, so completion is "the
fetch resolved" — which is also why Gemini has no streaming cursor to wait for.

## Pacing and timing

Defaults are deliberately conservative: it is better to be slow than to be refused.

| Platform | min gap / per minute | idle / stable | warm-up / timeout |
|---|---|---|---|
| DeepSeek | **6 s / 5** | 6 s / 9 s | 45 s / 420 s |
| everything else | 3 s / 8 | 2.5 s / 3.5 s | 45 s / 300 s |
| hidden tab (all) | — | 20 s / 30 s | unchanged |

The governor multiplies both gap and cap by a pace factor that rises when a site pushes back, and the
refusal ladder is per-platform because the sites say no in different words.

## When a site changes

Symptoms are specific and worth recognising:

| Symptom | Likely cause | Fix in the adapter |
|---|---|---|
| prompt never appears in the composer | ProseMirror replaced its DOM | update `dom.composer` |
| task is typed but nothing is sent | send button renamed or moved | update `dom.send` |
| reply arrives but is empty | signature changed | update `sse.apiPattern` or `extract` |
| reply is truncated at the first frame | append/replace mode wrong | flip `mode`, or the terminal check |
| "message refused" instead of an answer | site-side limit | check `refusal`, fixtures |

Only that one platform breaks. The other seven share no adapter code, which is the point of keeping the
adapter to data.

## Adding a ninth

1. Copy the smallest adapter and change values — never fork `src/core/`.
2. Add the host to `src/manifest.base.json` (`host_permissions` **and** both content-script `matches`).
3. Record one real stream with tokens and conversation ids scrubbed, and add it under `tests/fixtures/`.
4. Add the row above and a line in `docs/DECISIONS.md` if the read mode is new.
