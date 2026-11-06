# The other school — clients that call the web API themselves

`ChatGPTBox-dev/chatGPTBox` (MIT, `78c54db`, 2026-11-02) does not intercept: it **is** the client. It sends
the site's own private API requests from the extension, with the user's cookie or bearer token, and parses
the stream itself. We reject that approach — but its source is the only place we found the endpoint shapes
for Claude, Gemini and Kimi, so it is worth recording precisely.

> **What this changes:** Claude, Gemini and Kimi move from "unknown" to "known transport, unverified live"
> in `05-PLATFORM-INTEL.md`. Nothing else.

---

## 1 · Claude — SSE, and it was in front of us

```js
// src/services/clients/claude/index.mjs:591
await fetchSSE(
  `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}/${retry ? 'retry_completion' : 'completion'}`,
  { method: 'POST',
    headers: { accept: 'text/event-stream,text/event-stream',
               'content-type': 'application/json',
               cookie: `sessionKey=${sessionKey}` },
    body: JSON.stringify({ prompt, attachments, timezone }),
    onMessage(message) { … } })
```

Frame handling (`:612`–`:624`):

```js
if (parsed.error) throw new Error(message);
if (parsed.completion) fullResponse += parsed.completion;
if (parsed.stop_reason === 'stop_sequence') { done(); resolve(); }
```

| Field | Value |
|---|---|
| endpoint | `/api/organizations/{org}/chat_conversations/{id}/completion` |
| terminal | a frame with `stop_reason === 'stop_sequence'` (**not** `[DONE]`) |
| delta | `parsed.completion` |
| error | a frame carrying `error` — must be treated as a refusal/failure, not text |

## 2 · Gemini — not SSE at all

```js
// src/services/clients/bard/index.mjs:102
const response = await fetch(
  'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?'
    + new URLSearchParams({ bl, rt: 'c', _reqid: 0 }),
  { method: 'POST',
    body: new URLSearchParams({ at, 'f.req': JSON.stringify([...]) }),
    headers: { Cookie: cookies } })
const data = await response.text()          // ← the whole body, then parse
```

and the parse (`:10`–`:40`) flattens nested arrays, tagging strings that start with `c_` / `r_` / `rc_`
(conversation ids) and collecting the rest; the answer is `responses[3]`.

| Field | Value |
|---|---|
| endpoint | `/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=…&rt=c&_reqid=0` |
| transport | **form-encoded RPC, JSON-array response** — no `data:` lines, no `[DONE]` |
| terminal | **the response ends.** There is no per-token signal |
| text | a nested array element; the flat positions are fragile |

**Consequence for us:** Gemini is *body-complete*, not streaming. Our adapter accumulates the intercepted
response, extracts text heuristically, and treats "fetch resolved" as `completed`. The DOM is not a
fallback here, it is a **cross-check**: if the extracted text and the rendered message disagree in length
by more than 20 %, we log a fidelity warning and prefer the DOM (which is what the user sees).

## 3 · Kimi — SSE on `kimi.com` (and a conflicting report)

```js
// src/services/apis/moonshot-web.mjs:397
await fetchSSE(`https://www.kimi.com/api/chat/${this.conversationId}/completion/stream`, {
  method: 'POST',
  headers: { accept: '*/*', 'content-type': 'application/json',
             Authorization: `Bearer ${accessToken}` },
  body: JSON.stringify({ model, refs: [], use_search: true, … }),
  onMessage(message) {
    if (parsed.event === 'cmpl' && parsed.text) fullResponse += parsed.text;
    if (parsed.event === 'all_done') { done(); resolve(); }
  }})
```

| Field | Value |
|---|---|
| endpoint | `/api/chat/{id}/completion/stream` on `www.kimi.com` |
| delta | `{event:'cmpl', text}` |
| terminal | `{event:'all_done'}` |
| auth | `Authorization: Bearer …` |

`lsy200409/ai-tool-agent` flags Kimi as **binary** (`binaryStream: true`) against
`kimi.moonshot.cn` / `ChatService/Chat`. Both can be true: two hosts, two generations. Adapter ships
`binary` as a per-host flag and the brace-depth scanner stays, because we do not know which one the user's
account gets.

## 3b · Grok — SSE, despite the request header

`justlovemaki/AIClient2API` (`src/providers/grok/grok-core.js`) implements Grok's web chat:

```js
this.chatApi = `${this.baseUrl}/rest/app-chat/conversations/new`;            // :66
url = `${this.baseUrl}/rest/app-chat/conversations/${conversationId}/responses`; // :1303
headers['content-type'] = 'application/grpc-web+proto'; headers['x-grpc-web'] = '1'; // :158
for await (const line of rl) {                        // :1317
  const dataStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
  if (dataStr === '[DONE]') break;
  const json = JSON.parse(dataStr);
  const resp = json.result.response;                  // resp.token = the text delta
```

| Field | Value |
|---|---|
| endpoint | `/rest/app-chat/conversations/new`, then `/rest/app-chat/conversations/{id}/responses` |
| transport | **SSE JSON**, terminal `[DONE]` |
| delta | `result.response.token`; `isThinking` / `messageStepId` mark reasoning frames |
| trap | the request advertises `application/grpc-web+proto`; the response is *not* protobuf. Never infer the read path from the request header |
| bonus | `GET /rest/rate-limits` returns the account's quota window |

## 4 · Why we still do not do it this way

| Requirement of the reimplementation approach | Ours |
|---|---|
| read the session cookie / bearer token from the page | none — the page sends its own request |
| keep up with private request shapes (`f.req`, `bl`, `at`, PoW) | zero maintenance: the page computes all of it |
| reimplement conversation-state ids (`c_`, `r_`, `rc_`, `conversationId`) | the page owns its own state |
| detect auth expiry and re-auth | the page already does |
| one client per platform, ~600 lines each | one data file, ~40 lines |

The cost of our approach is that we must **drive the UI to send** (`04-SEND-MECHANICS.md`), which is the
hardest part of the project and the part most likely to break. That trade was made in D1 and this survey
does not overturn it — but it does mean the *endpoint knowledge* above is still valuable: it tells us what
to look for in the interceptor, and it gives every adapter a terminal signal to test against.

## 5 · Legal note

These are private, undocumented endpoints of services whose terms restrict automated access. We do not
call them; the user's browser does, exactly as it would when the user types. The extension observes the
response and types into the composer. `SECURITY.md §4.4` states the residual risk, and the README states
it again, because a user should not learn it from a ban notice.
