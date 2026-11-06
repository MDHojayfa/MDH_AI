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
  tools/linux.mjs               the thirteen builtins and the canonical path guard
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
| `MDH.policy` | `normalize`, `isInside`, `pathsIn`, `check(call, policy)`, `describe(call, policy)` |
| `MDH.parser` | `parse(text, ctx)`, `explain(reason)`, `repair(text)`, `coerceArguments()` |
| `MDH.prompt` | `renderPrompt({tools})`, `wrapFirstMessage(prompt, text)`, `reminder(mode)`, `BUDGET_CHARS` |
| `MDH.platforms` | `register(adapter)`, `current(location)`, `get(id)` |
| `MDH.transport` | `connect()`, `ping()`, `listTools()`, `callTool(name, args, opts)`, `close()` |
| `MDH.interceptor` | `begin/end/finalize`, event emitter |
| `MDH.fun` | `MISSION`, `QUOTES`, `missionAt/quoteAt/tagAt`, `chip(index)`, `rotate(node, opts)` |
| `MDH.agent` | `start/stop/resume/status`, `_internals` for tests |
| `MDH.ui` | `mount()`, `status()`, `card()`, `history()` |

## 3. Runtime messages

| Direction | Message | Meaning |
|---|---|---|
| popup → content | `mdh:start`, `mdh:stop`, `mdh:resume`, `mdh:status` | session control |
| popup → content | `mdh:ping-host` | is the native host alive |
| popup → content | `mdh:set-policy`, `mdh:save-settings` | user changed settings |
| content → background | `mdh:badge`, `mdh:hello`, `mdh:open-home` | badge, install handshake, website link |
| content → page | `mdh:injected` `{kind, payload}` | interceptor events from the MAIN world |
| page → content | `mdh:injected-ready`, `mdh:injected-send` | tap handshake |

Storage keys: `mdh:settings`, `mdh:policy`, `mdh:pace`, `mdh:rate`, `mdh:pending`, `mdh:answered`,
`mdh:history`, `mdh:session`, `mdh:lease`.

## 4. Host protocol

Four-byte little-endian length, then UTF-8 JSON. One frame in, one frame out.

```
{t:'ping'}                          → {t:'pong', host, version, pid, audit}
{t:'list'}                          → {t:'tools', tools:[{server,name,description,inputSchema,local}]}
{t:'call', name, arguments}         → {t:'reply', status, body, ms} | {t:'error', code, message}
{t:'progress', id, message}         → resets the pending timeout
{t:'audit'}                         → {t:'audit', ok, lines, brokenAt?}
{t:'config'}                        → {t:'config', config, paths}
```

Error codes: `TOOL_MISSING`, `TOOL_FAILED`, `NOT_FOUND`, `PATH_DENIED`, `AMBIGUOUS_MATCH`, `PROTO`,
`TIMEOUT`. The extension adds `NO_HOST`, `NO_TAB`, `SEND_FAILED`, `TIMEOUT` for its own failures.

## 5. Result envelope

Everything the model sees from a tool arrives as one bounded block:

```
[MDH_RESULT tool="read_file" status="ok"]
1│ # notes
2│ …
[/MDH_RESULT]
```

`status` is `ok`, `error` or `denied`. The prompt declares this block as data, never as instructions, and
the host truncates to 128 KB per result so a large file cannot eat the context window.

## 6. Tool call shape

The only accepted envelope, inside a json fence:

```json
{"mdh_call":{"tool":"run_command","arguments":{"cmd":"git status","cwd":"~/projects/app"}}}
```

Two of them in one reply execute nothing. A bare object in prose is accepted only when it is call-shaped,
so an example quoted in an answer is never executed.
