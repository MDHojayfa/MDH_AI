# Spec 01 — Stream interceptor

**File:** `src/core/interceptor.js` · **Runs in:** MAIN world, `document_start` · **Milestone:** M2

## Responsibility
Watch the page's network traffic, and hand every chunk of an assistant reply to the agent loop —
without the page noticing and without ever breaking the page.

## Public interface

```js
MDH.interceptor.attach({ patterns, onTurnStart, onText, onTurnEnd });
MDH.interceptor.detach();
MDH.interceptor.debug();   // { wrappedFetch, wrappedXhr, wrappedWs, matched, chunks }
```

- `patterns` — array of `RegExp` (per-platform `sse.apiPattern`).
- `onText(text)` — incremental text of the reply (may be called many times).
- `onTurnStart()` / `onTurnEnd(reason)` — boundaries. `reason ∈ 'eof'|'stop'|'error'|'idle'`.

## What gets wrapped

| Target | How | Why it is safe |
|---|---|---|
| `window.fetch` | replace with a wrapper; call original; if URL matches, `response.clone()` and read the clone | the page keeps the untouched original stream |
| `XMLHttpRequest` | wrap `open` (record URL) + `send` (attach `readystatechange`/`progress`) | we only observe; we never call `send` ourselves |
| `WebSocket` | wrap the constructor, add a passive listener on `message` | passive; no frames are dropped or delayed |
| DOM | `MutationObserver` on the message container, debounced | last resort only |

## Chunk → text extraction

```js
extract(chunkText) -> string|null   // implemented per platform
```
1. If the chunk is not parseable JSON, treat it as a raw delta (some sites send plain text).
2. Try `sse.extractContent(chunk)` from the adapter.
3. Handle `data:` prefix + `[DONE]` sentinel.
4. Binary path: 5-byte frame header, then brace-depth JSON scan (`parseBinaryFrame`).

## Invariants
1. The wrapped function **always** returns exactly what the original returned (or rethrows the same error).
2. Wrapping is idempotent — a second `attach()` must not double-wrap (guard with a symbol).
3. A throw inside our handler must never propagate into page code (`try/catch` around every callback).
4. We never call `preventDefault`, never mutate `init`, never touch `response.body` of the page's copy.

## Edge cases to handle
- Chunk split across a JSON boundary → buffer and scan for complete objects (brace depth, string-aware).
- Multiple replies in one page session → a new `onTurnStart` when the page issues a new matching request.
- Duplicate requests (retries) within 2 s → dedup by `url + body hash`.
- `fetch` already wrapped by the page or another extension → chain, don't replace blindly.
- Page navigates (SPA) → `detach`, re-`attach`, reset buffers.

## Acceptance criteria
- [ ] Synthetic SSE fixtures for 8 platforms parse to the exact expected text.
- [ ] Fuzz: 10,000 random chunk splits produce identical concatenated output.
- [ ] A wrapped page with an unrelated request is byte-identical in behaviour (test with a local fixture server).
- [ ] No uncaught exception with `patterns = []`.

---

## Revision — three read modes, not one

The second survey (`research/09-WEB-CLIENT-ENDPOINTS.md`) found that not every platform streams. The
interceptor therefore exposes one accumulator with three modes, chosen by adapter data:

| mode | pairs with | completion |
|---|---|---|
| `sse` | `text/event-stream` bodies split on `\n\n`, each `data:` line JSON-parsed | the adapter's terminal frame (`[DONE]`, `stop_reason:"stop_sequence"`, `{event:"all_done"}`) |
| `binary` | framed responses (Kimi's `moonshot.cn` generation) | the frame carrying the finish flag, or stream end |
| `body` | Gemini's `StreamGenerate` RPC: **no deltas at all** | the `fetch` promise resolving with the whole body |

Consequences:
- the wrapper must also capture **`response.text()` / `response.json()`** for `body` mode, not just the
  stream reader — the same wrapper, one extra branch;
- `body` mode has no partial text, so the UI must show "working" rather than a growing transcript, and
  `timings.idleMs` is meaningless there (only `timeoutMs` applies);
- `body` mode pairs with a **DOM cross-check** instead of a DOM fallback: if extracted text and rendered
  text differ by >20 % in length, prefer the DOM and log `FIDELITY` (never silently choose the shorter one).
