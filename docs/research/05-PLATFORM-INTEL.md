# Platform intelligence — consolidated, per site

Union of every adapter found in the 18 repos, deduplicated, with the source named. **Hosts and network
signatures are reliable; selectors rot; confidence is stated honestly per site.**

Confidence: ● high (3+ independent sources) · ◐ medium (2 sources) · ○ low (1 source, or inference)

---

## 1 · ChatGPT — ●

| Field | Value | Source |
|---|---|---|
| hosts | `chatgpt.com`, `chat.openai.com` | 6 manifests |
| stream | `POST /backend-api/conversation` — SSE | ai-tool-agent |
| composer | `#prompt-textarea` · `div.ProseMirror[contenteditable]` · `.cm-content` | Superpower, ZeroScript |
| send | `button[data-testid="send-button"]` · `button:has(svg[data-testid="send-icon"])` | Superpower |
| messages | `[data-message-author-role]` · `.markdown` | ZeroScript, Superpower |
| stop | `button[data-testid="stop-button"]` (the same slot becomes Stop) | CoS |
| completion | `data: [DONE]`; optionally Fiber `end_turn && status=='finished_successfully'` | CoS |
| quirks | turn splits into several assistant bubbles; code blocks can open in a detached viewer; `#prompt-textarea` is ProseMirror but occasionally CodeMirror (`.cm-content`) | CoS, Superpower |

## 2 · Claude — ◐

| Field | Value | Source |
|---|---|---|
| hosts | `claude.ai` | 4 manifests |
| stream | **unknown** — hypothesis `/api/organizations/*/chat_conversations/*/completion`; **discover in M8** | — |
| composer | `div[contenteditable="true"].ProseMirror` · `[data-testid="chat-input"]` | web-mcp-bridge |
| send | `button[aria-label="Send message"]` · `button[aria-label*="Send" i]` | web-mcp-bridge |
| messages | `.font-claude-response` · `[data-testid="assistant-message"]` · `div[data-is-streaming]` | web-mcp-bridge |
| stop | `button[aria-label="Stop response"]` · `div[data-is-streaming="true"]` | web-mcp-bridge |
| quirks | ProseMirror ignores `.value=`; the streaming attribute `data-is-streaming` is a *reliable* completion flag | web-mcp-bridge |

## 3 · Gemini — ◐

| Field | Value | Source |
|---|---|---|
| hosts | `gemini.google.com` | 4 manifests |
| stream | **unknown** — Batchexecute RPC; may not expose a parseable delta. **Treat as DOM-first** | — |
| composer | `rich-textarea .ql-editor[contenteditable="true"]` · `div.ql-editor.textarea.new-input-ui p` | web-mcp-bridge, Superpower, ZeroScript |
| send | `button.mat-mdc-icon-button.send-button` · `button.send-button:not(.stop)` | Superpower, web-mcp-bridge |
| messages | `model-response message-content` · `.model-response-text` | web-mcp-bridge |
| stop | `button.send-button.stop` | web-mcp-bridge |
| quirks | Quill — type into the inner `p`; the stop button is the send button with `.stop` added, so `:not(.stop)` is not optional | Superpower |

## 4 · DeepSeek — ● *(the best-understood site in the survey)*

| Field | Value | Source |
|---|---|---|
| hosts | `chat.deepseek.com` | 6 manifests |
| stream | `POST /chat/completion` — SSE | ai-tool-agent |
| composer | `textarea.ds-textarea` (React-controlled) | ZeroScript, Superpower |
| send | `.ds-button--primary` · `.ds-toggle-button` | ZeroScript |
| messages | `.ds-message` · `.ds-markdown` · `.ds-think-content` | ZeroScript, LuauPilot |
| stop/loading | `.ds-loading` present while generating; primary button becomes Stop | ZeroScript |
| refusal | `/messages?\s+too\s+frequent|too\s+many\s+(messages|requests)\s*[.,]?\s*try\s+again\s+later/i` | LuauPilot |
| pacing | **6 s between sends, ≤5 per minute** | LuauPilot (measured) |
| timings | `idle 6 s · stable 9 s · warmup 45 s · timeout 420 s` | LuauPilot |
| quirks | proof-of-work header on requests — irrelevant to us because the page computes it; attachments need the real `input[type=file]` | deepseek-pp, LuauPilot |

## 5 · Kimi — ◐

| Field | Value | Source |
|---|---|---|
| hosts | `kimi.com`, `www.kimi.com`, `kimi.moonshot.cn`, `moonshot.cn` | 3 manifests |
| stream | `kimi.gateway.chat` / `ChatService/Chat` — **binary Connect-RPC frames, not SSE** | ai-tool-agent (`binaryStream: true`) |
| composer | `.chat-input-editor[contenteditable]` | ZeroScript, Superpower |
| send | `.send-button-container` · `svg.send-icon` · `button[aria-label*=…]` | ZeroScript, Superpower |
| messages | `.segment-user` / `.segment-assistant` · `.segment-content` | ZeroScript |
| stop | absent in DOM; use "no new frames + segment stopped growing" | — |
| quirks | needs the brace-depth binary scanner; DOM idle is the primary completion signal | our inference |

## 6 · Qwen — ◐

| Field | Value | Source |
|---|---|---|
| hosts (intl) | `chat.qwen.ai` | ai-tool-agent |
| hosts (domestic) | `tongyi.aliyun.com`, `qianwen.aliyun.com`, `qianwen.com`, `chat2.qianwen.com` | ai-tool-agent, ZeroScript |
| stream | `/api/v2/chat/completions` · `/chat/completions` — SSE | ai-tool-agent |
| composer | `.message-input-wrapper` · `.chat-message-input-fixed-container` | ZeroScript |
| send | inside `.message-input-wrapper` (unconfirmed exact button) | — |
| messages | `.qwen-chat-message-user` / `.qwen-chat-message-assistant` · `.response-message-content` | ZeroScript |
| quirks | two products with different DOM; ship **two adapters sharing one parser** (`qwen.js`, `qwen-domestic.js`) | our decision |

## 7 · GLM / z.ai — ●

| Field | Value | Source |
|---|---|---|
| hosts | `chat.z.ai`, `z.ai`, `chatglm.cn`, `chat.glm.cn` | ai-tool-agent, ZeroScript, Superpower |
| stream (z.ai) | `/api/chat/completion` · `/chat/completions` — SSE | ai-tool-agent |
| stream (chatglm) | `/backend-api/assistant/stream` — SSE | ai-tool-agent |
| composer | `#chat-input` (both) · `.ds-textarea` on z.ai | Superpower, ZeroScript |
| send | `#send-message-button` | Superpower, ZeroScript |
| messages | `.user-message` · `.chat-assistant` · `.markdown-prose` · `.thinking-chain-container` | ZeroScript |
| quirks | two products, two streams, one selector vocabulary — closest pair in the set | — |

## 8 · Grok — ○ *(weakest, no stream evidence anywhere)*

| Field | Value | Source |
|---|---|---|
| hosts | `grok.com`; `x.com/i/grok` and `x.com/*` (matched in Superpower's manifest for "grok.com tool call parsing" and an X integration) | Superpower (only) |
| stream | **unknown** — possibly WebSocket | — |
| composer | `.chat-input-container` · `.input-area` · `textarea` · `div[contenteditable]` | Superpower (generic list) |
| send | `.ml-auto.flex.flex-row.items-end.gap-1` (utility-class chain — will rot) | Superpower |
| messages | not found | — |
| plan | DOM-first adapter; run `docs/M8-PLAYBOOK.md` before promising anything. Superpower ships a **separate content script for grok.com tool-call parsing**, which hints Grok renders calls in a structured node — worth 20 minutes to confirm | — |

---

## 9 · Platforms we are **not** shipping in v1 (evidence kept for v3)

| Platform | Evidence exists in | Note |
|---|---|---|
| Arena | ZeroScript (`arena.js`, `.prose`) | deferred by decision |
| Meta AI | ZeroScript (`meta.js`) | deferred |
| Doubao | ai-tool-agent (`doubao.js`, `/samantha/chat`) | deferred |
| Perplexity | Superpower | deferred |
| Copilot | Superpower (`ghcopilot`), ArcRift | deferred |
| Mistral / AI Studio / OpenRouter / t3chat | Superpower, ai-tool-agent | deferred |

## 10 · What M8 must capture per platform (the checklist)

For each of the 8, in DevTools, with a real message:

1. request URL → `sse.apiPattern`; response `Content-Type`;
2. transport shape: SSE lines / JSON-per-line / binary frames / WebSocket;
3. the JSON path to the text delta → `extract()`;
4. terminal frame (`[DONE]`, `message_stop`, custom flag) → completion rule;
5. refusal notice text, verbatim, in the site's locale → `refusal` regex;
6. composer/send/messages/stop selectors, each verified with `document.querySelectorAll().length === 1`;
7. measured minimum gap between two accepted sends.

That is a 20-minute job per platform with the adapter format we chose, and it is the only part of this
document that cannot be finished by reading.
