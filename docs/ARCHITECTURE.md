# Architecture (v1 — our implementation)

> The imported MIT base lives in `app/` and is **temporary**; it is kept only until this implementation
> reaches parity (milestone M10). Everything described here is written by us.

## 1. Process model

```
browser                          native host (python)                children
──────────────────────────────   ─────────────────────────────────   ──────────────────────
page  ── content script           stdin/stdout (4-byte framing)       MCP servers (stdio)
        └─ background  ─────────▶  dispatcher ── policy ── audit        · builtin linux tools
                                                                    · DesktopCommander, etc.
```

- **No listening port.** Native messaging means the browser *spawns* the host and talks over pipes.
  Nothing on `127.0.0.1` to attack.
- **One host process per browser**, lazily started on the first tool call, kept alive by the extension.
- **Host restarts the child, never the browser.**

## 2. Layers

| Layer | File(s) | Responsibility | Must never |
|---|---|---|---|
| Page adapter | ~~`src/platforms/<site>.js`~~ | host pattern, stream signature, extractor, composer I/O | touch the filesystem or the transport |
| Interceptor | `src/core/interceptor.js` | wrap `fetch`/XHR/WebSocket, tee responses, reassemble chunks | alter what the page receives |
| Parser | `src/core/parser.js` | find + repair the call envelope, coerce args, explain failures | throw into page code |
| Prompt | `src/core/prompt.js` | build the tool catalogue, reminders, re-injection | assume a fixed tool list |
| Agent loop | `src/core/agent.js` | state machine, dedup, refusal rule, delivery | retry after a refusal |
| UI | `src/ui/panel.js` | status chip, approval card, history | render remote HTML |
| Transport | `src/transport/native.js` | port lifecycle, framing, reconnect | hold conversation state |
| Host | `host/mdh_host.py` | MCP client, policy, audit, builtin tools | trust the extension |
| Guard | `host/policy.py` | allowlist, path resolution, approvals | trust model-supplied paths |
| Build | `tools/build.mjs` | two manifests, one source | diverge code between browsers |

## 3. The reply-reading ladder

For each new assistant turn we try, in order:

1. **Text SSE** — chunk is JSON with a text delta → append to a buffer.
2. **Binary frames** — Connect-RPC sites (Kimi): 5-byte header, brace-depth JSON extraction.
3. **WebSocket** — wrapper on the `WebSocket` constructor, same extraction.
4. **DOM** — the rendered message text. Last resort, most fragile.

A turn is complete when: the stream ends, **or** the stop button disappears, **or** the buffer has been
stable for `STABLE_MS` while not streaming. The parser then looks for a complete envelope in the buffer.

## 4. Call lifecycle (the state machine)

```
IDLE ──inject──▶ ARMED ──user sends──▶ OBSERVING ──envelope seen──▶ PARSING
                                                                            │
        ┌───────────────────────────────────────────────────────────────────┤
        │ invalid                                                            │ valid
        ▼                                                                    ▼
   FEEDBACK (tell the model why, once)                              DECIDING
                                                                           │
                                          deny ────────────────────────────┤
                                            │                              │ allow / approved
                                            ▼                              ▼
                                     DELIVERED (rejected)               EXECUTING
                                                                           │
                                              timeout / error ─────────────┤
                                                    │                      │ ok
                                                    ▼                      ▼
                                              DELIVERED (error) ─────▶ DELIVERED (result)
                                                                           │
                                                                           ▼
                                                                      OBSERVING
```

Terminal states that must **never** silently continue: `REFUSED` (rate limit), `STALE` (extension
reloaded), `OFFLINE` (host not answering). Each tells the user in one line and stops.

## 5. Invariants

1. **Exactly one call per message** is executed. Extra calls are reported, not run.
2. **One active driver tab per site.** A second tab goes read-only until it takes the lease.
3. **Every call produces a reply** — result, rejection or structured error. Nothing hangs.
4. **Nothing runs without passing policy** — even in `allow` mode the allowlist applies.
5. **State that must survive suspension** lives in `storage.local`: `pendingCall`, `lease`, `turnsSinceInject`.
6. **No remote code, ever.** No `eval`, no fetched scripts, no remote `innerHTML`.
7. **The page is never mutated** beyond the composer text and our own panel.

## 6. Browser differences, isolated in one shim

| Concern | Chromium | Firefox |
|---|---|---|
| Background | `service_worker` (module), dies after 30 s | `scripts` event page, also suspends |
| API promises | `chrome.*` returns promises | `chrome.*` is a callback alias → **point it at `browser`** |
| Native host allowlist | `allowed_origins: ["chrome-extension://<id>/"]` | `allowed_extensions: ["mdh@…"]` |
| Host manifest path | `~/.config/{google-chrome,BraveSoftware/Brave-Browser,chromium}/NativeMessagingHosts/` | `~/.mozilla/native-messaging-hosts/` |
| MAIN-world injection | `content_scripts[].world` (111+) | `world` (128+) |
| Min version | 116 | 140 |

`src/shared/compat.js` is the only file allowed to contain a browser conditional.

## 7. Failure handling

| Failure | Detection | Behaviour |
|---|---|---|
| Host not installed | `connectNative` throws | "run ./install.sh" + copyable command |
| Host crashed | port `onDisconnect` + `lastError` | restart once, then surface the reason |
| MCP server hung | per-call timeout (60 s default, 20 s Luau-style tools) | reply with timeout error, keep server alive |
| MCP server died | child exit | restart it, retry the call **once**, then report |
| Extension reloaded | runtime id gone / message fails | one-line notice, stop the loop |
| Tab closed mid-call | lease lost | host finishes, result goes to the audit log |
| Rate-limit refusal | platform text match | stop, ladder up, resume on next user action |
| Model refuses ("I can't access…") | denial regex per language | re-inject once with a firmer preamble |

## 8. Why this beats every existing repo

| | ZeroScript | ai-tool-agent | web-mcp-bridge | **ours** |
|---|---|---|---|---|
| Read path | DOM | SSE | DOM | **SSE + binary + WS + DOM** |
| Firefox | ✗ | ✗ | ✗ | **✓** |
| Native messaging | ✗ | ✓ | ✗ | **✓** |
| MCP tool boundary | ✓ | ✗ | ✓ | **✓** |
| Approval per tool | ✗ | partial | ✓ | **✓ + attached card** |
| Rate-limit rule | partial | ✗ | ✗ | **✓ never-resend** |
| Tests shipped | ✗ | ✓ | ✓ | **✓** |
