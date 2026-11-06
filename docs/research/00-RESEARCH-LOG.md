# Research log — internal

> ⚠️ **DELETE THIS DIRECTORY BEFORE v1 SHIPS.** (`PLAN.md §5`). It exists only so findings survive
> between work sessions. The shipped repo carries none of it.

Method: clone, read the source, extract by parser (not by grep), verify claims against the platform's own
documentation where one exists. Numbers and paths below are from source, not from READMEs.

---

## 1. The prior-art question, answered

Could v1 be an adapter on top of something that already exists? **No.** The survey divided into five
families, and each fails one hard requirement:

| Family | Examples | Fails on |
|---|---|---|
| Web-UI chat → local tools, single app | ZeroScript (Roblox Studio) | not the desktop |
| Web-UI chat → local tools, generic, browser-automation | AI-tool-agent style projects | needs Playwright + a server; no logged-in browser |
| MCP bridge extensions | web-mcp-bridge | 4 platforms, no Firefox background, no loop recovery |
| API-key agents | Hermes Agent, free-claude-code, codex-chatgpt-web | **requires a key** — the one thing we cannot have |
| Hosted browser services | Browserless, Clearcote | Chromium only, paid, "hosted browsers don't load extensions" |

**Conclusion: the architecture exists in pieces; the product does not.** We build it, we do not resell it.

## 2. What each source contributed

### `lsy200409/ai-tool-agent` — the only generalised SSE interceptor found
Gave us the format of the problem: per-platform `apiPattern` + `hostPattern` + stream extraction, one file
per site, `binaryStream` flag for non-SSE replies. Extracted data now lives in `PLATFORMS.md`.
Its weakness is the whole reason for our design: it drives a **Playwright-controlled browser**, so the
user's real session and extensions are absent. We move the same idea into the user's own tab.

### `sebattfg/ZeroScript-Free` — the UX benchmark
Proves the loop users actually like: the chat is the console; the model emits a call; the extension
executes it; the result goes back as a user message; repeat. Selector-driven, DOM-only, per-provider
files. **GPL-3.0** — behaviour read, no code copied. Its provider list (arena, chatgpt, chatgpt-cm,
deepseek, gemini, glm, kimi, meta, qwen, qwen-net) is a useful confirmation of which sites matter.

### `AstraxOf/web-mcp-bridge` — the Firefox lesson and the selector corpus
Gave us verified composer/send/stop/message selectors for Claude (ProseMirror) and Gemini (Quill), and the
ChatGPT 371-line cautionary tale. Its manifest declares `background.service_worker` only — it cannot run
in Firefox at all. **That single key is the whole Firefox story** (see §4).

### `LuauPilot/extension/providers/deepseek.js` — the ban mechanism
```js
if (rateShown()) throw new Error("rate limited");
```
Written as a refusal guard, it also documents the failure mode: a client that re-sends after a refusal is
what turns a soft throttle into an account action. Our loop's rule #2 exists because of this line.

### `vercel-labs/agent-browser` issue #640 — the tooling trap
"Extensions not loading, content scripts not injected." Reported workaround: bypass the wrapper and drive
Playwright directly. Lesson: **test the extension in the artifact it ships as**, not in a convenient
automation harness.

## 3. Platform data extraction (the part that must be redone at M8)

Parsed with `python3 re` over each `src/platforms/*.js` — `grep -oE` truncates regex literals and produced
unusable output on the first attempt. Results are tabulated in `PLATFORMS.md`.

Coverage reality check: **ChatGPT, DeepSeek, Kimi, Qwen, GLM** have an SSE/RPC signature in a reference
repo. **Claude, Gemini, Grok** have none — every surveyed project handles them by DOM only. Those three
must be discovered live in DevTools during M8, which is also why the DOM fallback is not optional.

## 4. Browser facts, verified

| Claim | Verdict | Source |
|---|---|---|
| Firefox lacks `background.service_worker` | **true**, bug 1573659; use `background.scripts` | MDN manifest reference |
| Declaring both `service_worker` and `scripts` | works Chrome 121+ *and* Firefox 121+ | MDN + porting guides |
| `browser.*` promise API on Firefox | yes; `chrome.*` is a callback alias | extension platform notes |
| `chrome.*` promise API | Chrome 148+ partial, 152+ full — **unreliable**, hence our `compat.js` | same |
| Host permissions auto-granted | Firefox ≤139: no, revocable, must `permissions.contains()` | porting guides |
| `connectNative` | Firefox 50+, `allowed_extensions` key (not `allowed_origins`) | MDN |
| `content_scripts.world` | Firefox 128+ | BCD 8.1.8 |
| AMO signing | mandatory for permanent install; `about:debugging` bypasses until restart | AMO docs |
| Chrome rejects `browser_specific_settings` | true → strip it in the Chrome build | porting guides |
| Playwright can load extensions | Chromium via `launchPersistentContext` + `--load-extension`; Firefox experimental; WebKit no | Playwright docs |
| Branded Chrome side-load flags | removed | Playwright issue tracker |
| Hosted browsers load extensions | **no** | Clearcote docs |

BCD audit performed locally against `@mdn/browser-compat-data@8.1.8`; only `background.service_worker`
came back unsupported. That is why `strict_min_version` is **140**, not the 128 the manifest could claim.

## 5. Decisions this log caused

- intercept the network, fall back to the DOM — never automate the page (D1)
- native messaging, no socket (D2)
- loop in the content script, durable state in `storage.local` (D4)
- never re-send after a refusal (D-rules in `specs/04-agent-loop.md`)
- one source, two manifests, FF ≥140, no polyfill (D11)
- no bundler (D9)

## 6. Re-survey queue (M8)

1. Claude completion endpoint + whether the reply is SSE or a JSON snapshot.
2. Gemini Batchexecute framing — is there any parseable delta at all?
3. Grok transport (WebSocket is the guess; we already wrap the constructor).
4. Exact free-tier refusal strings per platform, captured verbatim per language.
5. Kimi Connect-RPC frame layout, to confirm the 5-byte prefix assumption.
