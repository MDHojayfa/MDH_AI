# Architecture

One extension, one host process, no server. The interesting part is not the plumbing — it is that the
model is a web page we do not control, so everything here is about reading that page honestly and acting
on your machine safely.

## 1. Process model

```
browser tab                                    native host (node)                children
───────────                                    ──────────────────                ────────
page  ── MAIN-world tap (injected.js)
     ── isolated content script (main.js)  ──▶  stdin/stdout, 4-byte framing  ──▶  builtin tools
        └─ background (service worker /             policy · audit                   MCP servers
           event page) ── nativeMessaging                                             (stdio)
```

- **No listening port.** The browser spawns the host as a child process and speaks length-prefixed JSON
  over its stdin/stdout. A web page cannot reach a pipe, which removes an entire class of attack.
- **One host per browser**, started on the first tool call, kept alive while the port is open, exits when
  the browser closes the port.
- **The extension is the driver; the host is the hands.** The host never decides what to do next and never
  talks to a model.

## 2. Layers

| Layer | File(s) | Responsibility | Must never |
|---|---|---|---|
| Page tap | `src/content/injected.js` (MAIN world) | wrap `fetch`, `XHR` and `WebSocket`, copy replies, reassemble chunks | change what the page receives |
| Interceptor | `src/core/interceptor.js` | turn copies into one stream shape: SSE, byte-framed, whole-body | parse tool calls |
| Platform adapter | `src/platforms/<site>.js` | host pattern, read mode, composer and send selectors, timings | touch the filesystem or the transport |
| Parser | `src/core/parser.js` | find the call envelope, repair almost-JSON, coerce arguments, explain failure | execute anything |
| Prompt | `src/core/prompt.js` | tool catalogue, first-message wrapper, per-turn reminder | assume a fixed tool list |
| Agent loop | `src/core/agent.js` | state machine, send governor, reply wait, refusal ladder, delivery, dedup | re-send after a refusal |
| Policy | `src/core/policy.js` | lexical path check and approval verdict for the card | be the only guard |
| Transport | `src/core/transport.js` | one native port, request/response by id, progress frames, disconnect → `NO_HOST` | log to stdout |
| UI | `src/core/ui.js` + `src/popup/*` | status, approval card, mission card, history, popup | render remote HTML |
| Decoration | `src/core/fun.js` | rotating lines that make a wait visible, always tagged `fun` | claim a status, mention data, or run when `--no-fun` |
| Host | `host/*.mjs` | framing, tool dispatch, real path guard, audit chain, MCP lifecycle | trust the extension's policy copy |

A layer may only call the layer below it. The tap and the adapter never meet: the tap knows nothing about
tool calls, the adapter knows nothing about frames.

## 3. Reading a reply without being the page

The page's own code has already asked for the reply; we only need a copy.

| Mode | Used by | How completion is known |
|---|---|---|
| `sse` | ChatGPT, Claude, DeepSeek, Kimi (web), Qwen, GLM, Grok | the terminal frame — `[DONE]`, `end_turn`, `stop_sequence` — or a quiet window |
| `binary` | Kimi on `moonshot.cn` | byte-framed records with a JSON body, reassembled by brace depth |
| `body` | Gemini | the whole response resolves; there is no stream to watch |

Three rules keep this honest:

1. **The tap is a copy, never a proxy.** It clones the `Request` (or observes the XHR), reads from the
   clone, and returns the original promise untouched. If the tap throws, the page never notices.
2. **Isolation is structural.** Reading the stream is MAIN-world work (page `fetch`). Parsing, prompting
   and acting are isolated-world work. The two meet only through a `postMessage` channel with a namespaced
   envelope, so page scripts cannot call the extension's API even if they know its name.
3. **Nothing is inferred from the DOM that the stream can answer.** The DOM is the fallback and the
   composer/send interface, not the source of truth for text.

## 4. The loop

```
idle ──task──▶ compose ──▶ send ──▶ wait ──▶ parse ──┬─ no call ─▶ deliver answer, idle
  ▲                            │                     ├─ call ────▶ policy ─▶ approval ─▶ host ─▶ result
  │                            │                     └─ unreadable ─▶ explain + one retry
  └──────────── resume ◀── paused (refusal ladder) ◀── refused
```

Invariants, each of which exists because breaking it produces a specific, observed failure:

- **one call per message.** Two calls in one reply execute nothing; the model is told to send one.
- **never re-send after a refusal.** Re-sending is how accounts get rate-limited into a ban. The ladder
  reloads, waits longer, opens a fresh chat, then pauses and offers Resume.
- **at most one answer per turn.** A reload or an SPA navigation must not turn one answer into two
  executions; the answered-turn marker is written before delivery.
- **dedup with a cap.** The same `tool + arguments` may run four times in fifteen minutes — enough for a
  legitimate retry, not enough for a loop.
- **bounded turns and errors.** Sixty turns, three consecutive tool errors, then it stops and says so.

## 5. The host

Native messaging framing is four bytes of length, little-endian, then UTF-8 JSON. Getting that wrong is
the classic bug in this ecosystem, and it fails silently — which is why `./install.sh` finishes by
actually pinging the host.

Frames: `ping → pong`, `list → tools`, `call → reply|error`, plus `progress` which resets the 120 s
timeout on a long call. The host writes protocol to stdout and logs to stderr, always.

Tools are resolved in one order: builtins on this machine, then `server.tool` for a configured MCP server,
then a bare tool name if exactly one server owns it. Everything is audited before the reply is written.

## 6. Guards

| Guard | Where | What it catches |
|---|---|---|
| lexical path check | extension, `policy.js` | obvious mistakes and `~/.ssh`, instantly, so the card can explain |
| canonical path check | host, `tools/linux.mjs` | symlinks, `..`, and a policy file the extension does not control |
| approval | extension UI | anything the policy marks `ask`; write and execute always ask |
| audit chain | host | after the fact: what ran, and whether the log was edited |
| pacing + ladder | extension, `agent.js` | your account's survival on free tiers |

The two path guards are deliberately not the same code. A bug in one is not automatically a way past the
other, and the one that actually opens the file is the one that resolves symlinks.

## 7. Timing

A reply is "done" when the stream ends and the text stops changing. The default profile waits for 2.5 s
of quiet, requires 3.5 s of stability, allows 45 s of warm-up and gives up at 300 s. Hidden tabs get a
longer profile (20 s / 30 s) because browsers throttle timers there — a hidden tab is slow, not paused.

Sends are governed: a minimum gap and a per-minute cap, multiplied by a pace factor that rises when the
site pushes back (×1.6, capped at ×4). DeepSeek ships with a measured 6 s / 5-per-minute profile; the rest
start at the default.

## 8. Build

No bundler. `node tools/build.mjs` merges `manifest.base.json` with a per-browser overlay, strips a
`null` key as a deletion (so Firefox can drop Chromium-only fields), copies the tree, derives the Chrome
extension ID from the pinned key, and refuses to emit a manifest that violates an invariant — wrong world,
missing `nativeMessaging`, an `http://` origin, a Firefox service worker, a missing Gecko ID.

`npm test` loads the same classic scripts the browser loads into a `vm` sandbox, so the tests exercise
shipped code rather than a copy of it.

`node tools/package.mjs` writes both store ZIPs using only `node:zlib` — no `zip`, no `7z`, no Python. The
release step is therefore the same command on every machine that can run the product at all.

`site/index.html` is the landing page: one file, inline CSS, three JSON-LD blocks, no network resources.
`tools/make-og.mjs` draws its social card from arithmetic, which is why the artwork is reviewable in a diff.
