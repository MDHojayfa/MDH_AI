# Interfaces — the contract the code must satisfy

Written so that implementing v1 is transcription, not design. Every name here is binding: if the code
disagrees with this file, one of them is a bug.

---

## 1. Repository layout

```
src/
  manifest.base.json          shared manifest fields
  overlays/{chrome,firefox}.json
  core/
    interceptor.js   parser.js   prompt.js   agent.js   policy.js   state.js
    transport.js     ui.js       log.js
  content/
    main.js                    entry: world=ISOLATED, wires the above
    injected.js                world=MAIN, the fetch/XHR/WS wrapper (no imports)
  platforms/
    index.js  chatgpt.js  claude.js  gemini.js  deepseek.js
    kimi.js   qwen.js     qwen-domestic.js  glm.js  grok.js
  popup/  popup.html popup.js popup.css
  shared/ compat.js
host/
  mdh-host.mjs   mcp_client.mjs   tools/linux.mjs   audit.mjs   config.mjs
  servers.example.json
tools/build.mjs   install.sh   tests/
```

`content/injected.js` is the only file that may not import anything — it is serialised into the page.

## 2. `core/interceptor.js`

```js
attach(tabId) -> void          // idempotent; symbol guard on window
detach() -> void
on(event, handler)             // event: 'stream:begin' | 'stream:chunk' | 'stream:end'
status() -> 'idle' | 'attached' | 'degraded'
```
Emits `{url, requestId, text}` on chunk. `degraded` = the page re-wrapped our wrapper; we chain and mark
it, because that means the site changed.

## 3. `core/parser.js`

```js
parse(replyText, {tools, schemas}) -> {call|null, reason, detail, foreign?}
explain(reason, detail) -> string            // model-facing English, see FRAMING.md §4
```
`call = {tool, arguments}` with arguments already coerced (string→number where the schema says number,
`"true"`→`true` where it says boolean). Returns `call: null` for every failure; `reason` ∈
`none|unclosed|not_json|wrong_key|missing_name|multi|truncated|foreign_markup`.

`multi` **always** yields `call: null`. Two calls are never partially executed.

## 4. `core/prompt.js`

```js
renderPrompt({tools, servers}) -> string     // SYSTEM.md §1, placeholders filled
signature(tools) -> string                   // 8-char hash of sorted tool ids
reminder(mode) -> string                     // mode: 'user' | 'result'
```
Budget assertions live here: throws in dev if `renderPrompt` exceeds 1,600 tokens (≈6,400 chars).

## 5. `core/agent.js`

```js
start(task) -> void
step() -> void                       // one turn
state() -> {phase, outcome, turn, pendingCall, counter}
pause() / resume() / stop() -> void
on('need-approval'|'turn-end'|'notice', handler)
```
`phase` ∈ `idle|injecting|waiting-reply|parsing|awaiting-approval|executing|delivering|paused|done|failed`.
`outcome` ∈ `completed|failed|stopped|interrupted|stalled|unknown`; **only `completed` advances**
(`specs/04 §3`). Illegal transitions throw in dev, log-and-ignore in prod (a thrown error inside the loop
kills the tab).

Hard rules enforced *in this module*, not in the prompt: one call per message · never re-send after
refusal (the ladder is the only way back, and each rung waits) · dedup hash 15-min window, cap 4 ·
answer each turn at most once · hidden tab switches to the slow timing profile, it does **not** pause ·
always deliver something.

## 6. `core/policy.js`

```js
check(call) -> {decision:'allow'|'ask'|'deny', rule}     // pure, no I/O
realpath(p) -> string                                    // resolves symlinks before check
```
Reads `policy.json` from `storage.local`; defaults in `specs/07-guard-policy.md §3`. Pure so the unit
tests can hammer it without a browser.

## 7. `core/transport.js`

```js
connect() -> Promise<void>
send(frame) -> Promise<reply>        // frame: {t:'call'|'list'|'ping', id, …}
close() -> void
on('closed'|'error', handler)
```
Frame shapes are canonical in `specs/05-transport.md`. `send` rejects with `{code:'NO_HOST'|'TIMEOUT'|'PROTO'}`.
Timeout 120 s default; long tools stream `{t:'progress'}` frames that reset the timer but never resolve.

## 8. `core/state.js`

All keys under `mdh:` in `storage.local`:

| key | type | survives reload |
|---|---|---|
| `mdh:session` | `{tabId, platform, startedAt, phase}` | yes |
| `mdh:turn` | `{call, result, ts}` | yes |
| `mdh:pending` | `{call, queuedAt, attempts}` | yes |
| `mdh:policy` | rules object | yes |
| `mdh:history` | ring buffer, 50 turns | yes |
| `mdh:answered` | `Set<turnId>` — a turn is answered at most once, ever | yes |
| `mdh:pace` | `{mult, lastSendAt, sentInWindow}` — the send governor | yes |
| `mdh:rate` | `{hits, lastHitAt, phase, resumeAt}` — the ladder's memory | yes |
| `mdh:leases` | platform → tabId | yes |

`storage.session` is deliberately unused: Firefox clears it on extension restart and we need the pending
call to survive exactly that.

## 9. `core/ui.js`

```js
mount() -> void
showApproval(call, meta) -> Promise<'deny'|'once'|'always'>   // never rejects
showNotice(kind, text, opts) -> void
clear() -> void
```
Shadow DOM, `z-index: 2147483000`, no framework. Approval resolves `deny` on 120 s timeout.
See `specs/09-ui.md`.

## 10. Platform adapter

Data only (shape in `PLATFORMS.md`). No functions except `extract(chunk)`. `index.js` exports
`match(hostname) -> adapter|null`.

## 11. Host

```js
// mdh-host.mjs
main()                          // reads length-prefixed frames from stdin, writes to stdout
// mcp_client.mjs
start(serverCfg) -> {listTools(), callTool(name, args)}   // one child process per server
// tools/linux.mjs
registry -> Map<name, {schema, run(args, ctx)}>           // the 13 builtins (specs/06)
// audit.mjs
append(entry) -> void   verify() -> {ok, brokenAt}        // hash chain
```
Frames in `specs/05-transport.md §3`. stdout is protocol-only; **all logging goes to stderr** — this is
the single most common native-messaging bug in the wild.

## 12. Error codes (single namespace, used by every layer)

`NO_HOST` `TIMEOUT` `PROTO` `PATH_DENIED` `NOT_FOUND` `PERM` `TOOL_MISSING` `TOOL_FAILED`
`PARSE` `REFUSED` `RATE_LIMIT` `RELOADED` `NO_TAB` `CANCELLED` `SEND_FAILED` `STALLED` `AMBIGUOUS_MATCH`

Anything else is a bug and must be wrapped before it reaches the model.

## 13. Build

```js
// tools/build.mjs
build('chrome'|'firefox', {out='dist', minify=false}) -> void
```
Merges `manifest.base.json` + overlay, copies `src/` minus overlays and `*.test.mjs`, emits
`dist/<browser>/`. No bundler, no transpile, no source maps (see D9).
