# Platforms — adapter contract & reference data

Every value below was **extracted from source**, not guessed. Source repos are named per row so we can
re-derive them when a site changes. **All of it is unverified until the M8 live checklist** — these are
reference patterns for writing our own adapters, not facts about today's sites.

## Adapter contract (data only — no logic)

```js
export default {
  id: 'deepseek',
  host: /chat\.deepseek\.com/,            // must match location.hostname exactly
  sse: {                                  // primary read path
    apiPattern: /chat\/completion/,        // network URL signature
    binary: false,                        // true -> 5-byte frames + brace-depth JSON
    extract(chunk) {},                    // -> string | null
    refusal: /too frequent|稍后重试/i,     // text that means "the message was REFUSED"
  },
  dom: {                                  // fallback read path + composer I/O
    composer: [...], send: [...], messages: [...], streaming: [...],
  },
  inject: { strategy: 'prepend' | 'send' },
};
```

Rules: no imports, no side effects, no timers. A platform file that needs anything else is a design bug.

---

## v1 platform matrix

| # | Platform | Host(s) | Stream signature (reference) | Format | Reference source |
|---|---|---|---|---|---|
| 1 | ChatGPT | `chatgpt.com`, `chat.openai.com` | `/backend-api\/conversation/` | SSE | ai-tool-agent `chatgpt.js` |
| 2 | Claude | `claude.ai` | *(none found — hypothesis: `/chat_conversations/.*/completion`)* | SSE | **to discover** |
| 3 | Gemini | `gemini.google.com` | *(none found — hypothesis: Batchexecute RPC)* | RPC/JSON | **to discover** |
| 4 | DeepSeek | `chat.deepseek.com` | `/chat\/completion/` | SSE | ai-tool-agent `deepseek.js` |
| 5 | Kimi | `kimi.com`, `kimi.ai`, `moonshot.cn` | `/kimi\.gateway\.chat|ChatService\/Chat/` | **binary (Connect-RPC)** | ai-tool-agent `kimi.js` |
| 6 | Qwen | `chat.qwen.ai`, `tongyi.aliyun.com`, `qianwen.com` | `/\/api\/v2\/chat\/completions|chat\/completions/` | SSE | ai-tool-agent `qwen*.js` |
| 7 | GLM / z.ai | `chat.z.ai`, `z.ai`, `chatglm.cn` | `/chat\/completions|\/api\/chat\/completion|\/backend-api\/assistant\/stream/` | SSE | ai-tool-agent `zai.js`, `chatglm.js` |
| 8 | Grok | `grok.com`, `x.com/i/grok` | *(no reference in any surveyed repo)* | ? | **to discover** |

**Three of eight have no reference implementation in any of the 15 repos.** That is the honest state of
the art: everyone covers the Chinese free tier and ChatGPT; Claude/Gemini/Grok adapters elsewhere are
DOM-only. Our SSE-first approach means we must discover their endpoints ourselves at M8.

---

## Reference selectors (DOM fallback / composer I/O)

### Claude — `claude.ai` *(from web-mcp-bridge `adapters/claude.js`)*
```
composer : div[contenteditable="true"].ProseMirror · [data-testid="chat-input"]
send     : button[aria-label="Send message"] · button[aria-label*="Send" i]
messages : .font-claude-response · .font-claude-message · [data-testid="assistant-message"] · div[data-is-streaming]
streaming: button[aria-label="Stop response"] · div[data-is-streaming="true"]
```
Editor is **ProseMirror** → typing must use `InputEvent`/`beforeinput`, not `value=`.

### Gemini — `gemini.google.com` *(from web-mcp-bridge `adapters/gemini.js`)*
```
composer : rich-textarea .ql-editor[contenteditable="true"] · div.ql-editor · textarea
send     : button.send-button:not(.stop)
messages : model-response message-content · .model-response-text
streaming: button.send-button.stop
```
Editor is **Quill** → `document.execCommand('insertText')` or a synthetic paste works better than
assignment. Note ZeroScript's gemini provider also uses `.ql-editor[contenteditable='true']`, independently
confirming the editor — one of the few cross-repo agreements.

### ChatGPT — `chatgpt.com` *(from web-mcp-bridge `adapters/chatgpt.js`, 371 lines)*
Known-quirky: messages detach into a code viewer, markdown mangles backslashes, code blocks carry a
"Copy" label that bleeds into extracted text. **Our interceptor path makes ~80 % of that file unnecessary.**

### DeepSeek — `chat.deepseek.com` *(from web-mcp-bridge `adapters/deepseek.js`)*
Assistant messages are `.ds-markdown`; composer is a textarea with a React value setter.

---

## Per-platform notes (what will bite us)

| Platform | Quirk | Mitigation |
|---|---|---|
| **Kimi** | binary Connect-RPC frames, not SSE | `binary:true` + brace-depth scanner; DOM fallback mandatory |
| **Gemini** | Batchexecute RPC — replies may not be a clean stream | treat as "DOM-first" platform until proven otherwise |
| **Claude** | ProseMirror editor ignores `.value =` | dispatch `beforeinput` + `InputEvent` |
| **ChatGPT** | reply may be rendered in a detached code viewer | interceptor reads the stream, so this stops mattering |
| **Qwen** | two different backends (`chat.qwen.ai` international vs `tongyi.aliyun.com` domestic) | two adapter files sharing one stream parser |
| **GLM** | `chat.z.ai` and `chatglm.cn` are separate products | two host patterns, one file |
| **Grok** | unknown; may be WebSocket | we already wrap the `WebSocket` constructor |
| **All** | free-tier refusal wording is per-site and in the site's language | capture exact strings during M8; store in the adapter |

---

## Adding platform #9 later (the test of this design)

1. Open the site, DevTools → Network → send a message.
2. Copy the request URL into `sse.apiPattern`.
3. Copy the JSON path to the text delta into `extract()` (usually `choices[0].delta.content`).
4. Copy four selectors from the Elements panel into `dom`.
5. Add the host regex. Rebuild. Test.

Target: **30 minutes, one file, no core changes.** If adding a platform ever requires touching `src/core/`,
the adapter contract has failed and must be fixed before adding #10.
