# Interfaces

If the code disagrees with this file, one of them is a bug.

## 1. Repository layout

```
src/
  manifest.base.json            shared manifest; overlays/{chrome,firefox}.json merge onto it
  extension-id.json             the pinned identity, generated from the key
  shared/compat.js              MDH namespace, storage/ports/timers, hashing, small helpers
  core/
    log.js  state.js  policy.js  parser.js  prompt.js
    fun-corpus.js  fun.js  ui.js  transport.js  interceptor.js  agent.js
  platforms/
    base.js                     registry: pick(), pickString(), deepStrings()
    chatgpt.js claude.js gemini.js deepseek.js kimi.js
    qwen.js qwen-domestic.js glm.js grok.js
  content/
    injected.js                 MAIN world: fetch/XHR/WebSocket tap
    main.js                     ISOLATED world: entry point, messages, lease
  background/background.js      non-module worker (Chromium) / event page (Firefox)
  popup/                        popup.html, popup.css, popup.js
host/
  mdh-host.mjs                  framing, dispatch, MCP lifecycle
  mcp_client.mjs                stdio MCP client
  tools/linux.mjs               the builtin tools and the canonical path guard
  config.mjs  audit.mjs  servers.example.json
tools/
  build.mjs  make-icons.mjs  make-og.mjs  package.mjs  selfcheck.mjs
site/
  index.html  og.png            one file, no dependencies, no tracking
.github/workflows/ci.yml        tests · build+lint+package · host self-check
install.sh  tests/  docs/
```

## 2. Namespace

Every module is an IIFE that attaches exactly one object:

| Module | Surface |
|---|---|
| `MDH.log` | `debug/info/warn/error`, `buffer()`, `export()` |
| `MDH.state` | `get/set/patch`, `session`, `reset` |
| `MDH.skills` | `parse(text)`, `render(skills)`, `names(skills)`, `find(skills, name)`, `promptLine(skills)` |
| `MDH.grants` | `empty()`, `expire(store, boot)`, `isGranted(store, key, {site, boot})`, `add(store, {key, command, scope, site, boot})`, `forget(store, key, {site})`, `list(store, {site, boot})`, `describe(scope)` |
| `MDH.policy` | `normalize`, `isInside`, `pathsIn`, `check(call, policy)`, `describe(call, policy)` |
| `MDH.parser` | `parse(text, ctx)`, `explain(reason)`, `repair(text)`, `coerceArguments()` |
| `MDH.prompt` | `renderPrompt({tools, phoenix, memory, skills})`, `wrapFirstMessage(prompt, text)`, `reminder(mode, {phoenix})`, `continuation(n, {phoenix})`, `handoff({task, plan, results, next, phoenix})`, `BUDGET_CHARS` |
| `MDH.policy` | `check(call, policy)`, `describe(call, policy)`, `pathsIn`, `isInside`, `normalize`, `commandSignature(call)`, `grantable(call)` |
| `MDH.probe` | `probe(adapter, root)`, `report(result)` → `{ok, platform, fields, missing, sse, summary}` |
| `MDH.phoenix` | `make()`, `matches(given, code)`, `block(code)`, `banner(code)`, `call(code)`, `rejection(code)`, `size()` |
| `MDH.platforms` | `register(adapter)`, `current(location)`, `get(id)` |
| `MDH.transport` | `connect()`, `ping()`, `listTools()`, `callTool(name, args, opts)`, `hostDiag(op, extra)`, `openViewer()`, `writeSnapshot()`, `close()` |
| `MDH.diag` | `collect(opts)`, `hypotheses(diag)`, `issueBody(diag)`, `issueUrl(diag)`, `factsTable()`, `summary()`, `bundle()`, `redact()` |
| `MDH.dock` | `mount(adapter)`, `sync()`, `destroy()`, `stateFor(status)` |
| `MDH.interceptor` | `begin/end/finalize`, event emitter |
| `MDH.fun` | `MISSION`, `QUOTES`, `missionAt/quoteAt/tagAt`, `chip(index)`, `rotate(node, opts)` |
| `MDH.agent` | `start/stop/resume/status`, `_internals` for tests |
| `MDH.ui` | `mount()`, `showApproval(desc, {grant})`, `approvePlan(steps)`, `askQuestion`, `showPlan`, `notice`, `countdown`, `mission`, `issue`, `drift`, `done` |

## 3. Runtime messages

| Direction | Message | Meaning |
|---|---|---|
| popup → content | `mdh:start`, `mdh:stop`, `mdh:resume`, `mdh:status` | session control |
| popup → content | `mdh:ping-host` | is the native host alive |
| popup → content | `mdh:set-policy`, `mdh:save-settings` | user changed settings |
| popup → background | `mdh:viewer`, `mdh:snapshot`, `mdh:diagnose` | log viewer URL, HTML snapshot, machine facts |
| content → background | `mdh:badge`, `mdh:hello`, `mdh:open-home` | badge, install handshake, website link |
| content → page | `mdh:injected` `{kind, payload}` | interceptor events from the MAIN world |
| page → content | `mdh:injected-ready`, `mdh:injected-send` | tap handshake |

Storage keys: `mdh:settings`, `mdh:policy`, `mdh:pace`, `mdh:rate`, `mdh:pending`, `mdh:answered`,
`mdh:history`, `mdh:session`, `mdh:lease`. Inside `mdh:settings`: `enabled`, `autoResume`, `welcomed`,
`sharePrompted`, `funOff`, `dockPos`, `lastTask`.

## 4. Host protocol

Four-byte little-endian length, then UTF-8 JSON. One frame in, one frame out.

```
{t:'ping'}                          → {t:'pong', host, version, pid, audit, by}

A frame whose length prefix is zero or absurd is a framing error: the host logs it to stderr, then walks forward
through the buffer looking for the next header that parses as JSON. Dropping the whole buffer instead — the obvious
implementation — means one stray byte silently swallows everything the browser sends afterwards.
{t:'list'}                          → {t:'tools', tools:[{server,name,description,inputSchema,local}]}
{t:'call', name, arguments, run, via}    → {t:'reply', status, body, ms} | {t:'error', code, message}
{t:'progress', id, message}         → resets the pending timeout
{t:'audit'}                         → {t:'audit', ok, lines, brokenAt?}
{t:'config'}                        → {t:'config', config, paths}
{t:'grants', …}                     popup → page: list remembered approvals
{t:'forget-grant', key}             popup → page: remove one
{t:'diag', op}                      → {t:'diag', ok, facts?, disk?, ip?, clockSkewMs?, …}
{t:'viewer'}                        → {t:'viewer', url, port}   (loopback, token in the URL)
{t:'snapshot'}                      → {t:'snapshot', path}       (~/.local/state/mdh/log.html)
```

`diag` ops: `system` (kernel, node, load, RAM, disk, interfaces), `net` (DNS + TCP 443 to one of the eight
platforms or loopback), `ip` (the single allowlisted outbound request), `clock` (the same request without the
`via` is how the call was allowed, and it is the one field the model never controls: `auto` (the policy allowed
it, nobody was asked), `approval` (a person clicked *Allow once*), `grant:run` / `grant:session` / `grant:site`
(a remembered approval answered, scope named), or `always-allow` (the tool is set to always-allow). The host
sanitises it to lowercase words and colons, 24 characters, and records anything else as `other` — it goes into
the audit entry and therefore into the hash, so "who said yes" cannot be rewritten afterwards.

address), `all`. **None of these are tools**: they are absent from `{t:'list'}`, so the model cannot call
them, and `net` refuses any target outside its nine-entry allowlist before opening a socket.

Error codes: `TOOL_MISSING`, `TOOL_FAILED`, `NOT_FOUND`, `PATH_DENIED`, `AMBIGUOUS_MATCH`, `PROTO`,
`TIMEOUT`. The extension adds `NO_HOST`, `NO_TAB`, `SEND_FAILED`, `TIMEOUT` for its own failures.

## 5. Result envelope

Everything the model sees from a tool arrives as one bounded block:

```
[MDH_RESULT#<tag> tool="read_file" status="ok"]
1│ # notes
2│ …
[/MDH_RESULT#<tag>]
```

`status` is `ok`, `error` or `denied`. The prompt declares this block as data, never as instructions.

`<tag>` is eight hex characters derived from the run's completion code, the turn number and the platform, and it
**changes every turn**. It exists because the boundary used to be a fixed string: a file whose contents included
`[/MDH_RESULT]` could close the block and have the rest of its text arrive looking like the host. Any occurrence of
the current tag inside tool output is replaced with `········` before the block is built, so the content can neither
close the block nor open one. This is a boundary, not a defence: delimiters lose to an adaptive attacker (see
`docs/RESEARCH.md`), and what actually stops an injected instruction from doing damage is the approval card, not the
marker.

Above 24,000 characters the result is **not** sent in full. The host writes it to `/tmp/mdh/spill/<run>/` (mode 0600
in a 0700 folder, cleared after a day) and the block carries a head, a tail and the path:

```
[MDH_RESULT#<tag> tool="read_file" status="ok"]
<first 2000 characters>

[…488312 characters skipped. The full output is /tmp/mdh/spill/run-7kq/1699…-read_file.txt — 490312 characters,
11802 lines. Read the part you need: read_file with path="…" and offset/limit, or grep it with search_files.]

<last 500 characters>
[/MDH_RESULT#<tag>]
```

The extension also splits an outbound message over 6,000 characters (`(part 1/3)` … ) because a single 60 KB
message is accepted by the composer and then makes the *conversation* refuse the following turn. The third part is
the one that completes the message; the prompt says so.

## 6. Tool call shape

The only accepted envelope, inside a json fence:

```json
{"mdh_call":{"tool":"run_command","arguments":{"cmd":"git status","cwd":"~/projects/app"}}}

When a tool fails with a code the host is known to return, the result frame carries one extra line below the
untouched error text:

```
[MDH_RESULT#<tag> tool="read_file" status="error"]
[PATH_DENIED] /etc/shadow is on the deny list
[MDH_HINT] pick a path inside the allowed folders (or ask the user to widen the list in ~/.config/mdh/config.json)
[/MDH_RESULT#<tag>]
```

A `finish` call carries the session code, and nothing else ends a task:

```
{"mdh_call":{"tool":"finish","arguments":{"summary":"…","phoenix":"PHX-7KQ2MD"}}}
```
```

Two of them in one reply execute nothing. A bare object in prose is accepted only when it is call-shaped,
so an example quoted in an answer is never executed.
