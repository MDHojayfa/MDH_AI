# Survey — 18 repositories, read at source level

Second pass, deeper than the first. Every repo was cloned at the commit below and read; findings live in
`02`…`07`. **Nothing here is code we may reuse** — the licence column is why.

> ⚠️ Internal. Delete `docs/research/` before v1 ships (`PLAN.md §5`).

| # | Repo | Commit | Updated | Licence | ★ | What it is |
|---|---|---|---|---|---|---|
| 1 | `totec448-spec/chat-on-steroids` | `a5e145c` | 2026-11-05 | MIT | 5.1k | Electron app + extension, ChatGPT → local MCP |
| 2 | `BrowserMCP/mcp` | `ba7a268` | 2026-11-03 | Apache-2.0 | 7.3k | daemon + extension over `chrome.debugger` |
| 3 | `stloendays/Superpower` | `101ca21` | 2026-09-22 | MIT | 177 | 17 site adapters + MCP, remote selector config |
| 4 | `zhu1090093659/deepseek-pp` | `0a02c72` | 2026-08-14 | Apache-2.0 | 1.8k | DeepSeek client reimplementation + shell host |
| 5 | `Eshaan-Nair/ArcRift` | `5424ea1` | 2026-07-07 | MIT | 246 | memory layer, 7 platforms, native MCP host |
| 6 | `Endokelp/Endoplexity` | `315e0d8` | 2026-08-14 | Apache-2.0 | 416 | side panel driven by `claude`/`cursor-agent` CLI |
| 7 | `AIPexStudio/AIPex` | `4173fa8` | 2026-08-26 | MIT | 1.2k | browser agent + skills runtime |
| 8 | `Hacker-Valley-Media/Interceptor` | `0ce4254` | 2026-11-05 | Elastic-2.0 | 606 | agent browser control, native host + WS |
| 9 | `noemica-io/open-claude-in-chrome` | `6a37c29` | 2026-09-22 | PolyForm-NC | 271 | reverse-engineered Claude-in-Chrome |
| 10 | `alibaba/qz-browser-agent` | `1aaa6ee` | 2026-10-30 | Apache-2.0 | 209 | local-first Chrome agent |
| 11 | `eyalzh/browser-control-mcp` | `e53f0e5` | 2026-08-23 | MIT | 341 | MV2 extension + MCP server |
| 12 | `k3d3/firefox_mcpbridge` | `b4b6b5a` | 2025-03-20 | **none** | 6 | Firefox ↔ Claude, native messaging |
| 13 | `A9T9/RPA` | `17b6302` | 2026-09-21 | proprietary | 2.1k | macro recorder + MCP bridge |
| 14 | `sebattfg/ZeroScript-Free` | `32dd846` | 2026-09-10 | **GPL-3.0** | 407 | Roblox Studio + 10 web providers |
| 15 | `lsy200409/ai-tool-agent` | `c168ce2` | 2026-06-25 | MIT | 4 | native launcher → local HTTP tool server |
| 16 | `AstraxOf/web-mcp-bridge` | `1026dfe` | 2026-11-03 | MIT | 10 | the `app/` snapshot in this repo |
| 17 | `MaciekGos/LuauPilot` | `54ea7d9` | 2026-11-03 | MIT | 8 | Roblox + one web provider, **best loop engineering** |
| 18 | `k3d3/mcpbridge` | `5d5e6b9` | 2025-03-20 | **none** | 3 | server half of #12 |

**Three licence walls:** #12/#18 have **no licence at all** (all rights reserved — read only, not even
inspiration we may paraphrase closely); #9 is **non-commercial**; #14 is **GPL-3.0**; #8 is
**Elastic-2.0** (no competing service). None of them may contribute a line to an MIT project.

---

## What each one actually proves

### 1 · chat-on-steroids — the most mature design in the field
Electron desktop app on Windows/macOS/Linux + a ChatGPT-only extension. Not our architecture (it needs
an app install and a paid plan), but its *documentation of failures* is the best available: `docs/`
contains bug audits, tool error-rate measurements, a turn-signal inventory, and recovery specs.
Contributes: turn-completion vocabulary (`03`), tool-surface lessons (`04`), timestamp/clock UI (`07`),
the "request the user run it" tool pattern (`04`), batch commands and `write_stdin` continuation.
Linux is explicitly second-class for it: native input is **masked off at runtime**, only an opt-in
read-only screenshot on GNOME Wayland. That is independent confirmation that GUI control on Linux is a
trap in 2026, and our `open_app`-only v1 stance is right.

### 2 · BrowserMCP — the strongest evidence about Firefox
7.3k★, Apache-2.0. Extension is a thin `chrome.debugger` relay; a per-user daemon drives tabs with
Playwright; pairing by a six-digit code the user compares. **The README states plainly: "Firefox has no
`debugger` API, so Browser MCP doesn't work there."** Everything built on `chrome.debugger` is
Chromium-only by definition. Our design never touches it — we read network streams and DOM — which is
exactly why Firefox parity is possible at all. Also confirms fixed extension IDs via `key`
(`apps/extension/extension-key.ts`) and a server-side allowlist of IDs.

### 3 · Superpower — the adapter corpus, and remote config
17 adapters (`chatgpt`, `gemini`, `deepseek`, `kimi`, `qwenchat`, `z`, `grok`, `perplexity`, `mistral`,
`aistudio`, `openrouter`, `t3chat`, `ghcopilot`, `default`, `example-forum`…). Two transferable ideas:
- **selectors shipped as config**, overridden by **Firebase Remote Config** at runtime — a broken
  selector is fixed without an extension release (`defaultConfigs/config-manager.ts`);
- **stalled-stream handling**: an incomplete tool block gets a *clock* icon if it predates page load, a
  *warning* icon if it stalled while streaming (`render_prescript/observer/stalledStreamHandler.ts`).
Its weakness is per-adapter weight (~50 KB each, largely its own popover UI). Ours must stay data-only.

### 4 · deepseek-pp — the other school: reimplement the client
Instead of intercepting, it *is* the client: `core/deepseek/{request-codec,stream-codec,pow,official-api}.ts`.
The existence of `pow.ts` (proof-of-work) is the argument against this school — DeepSeek's client
computes a PoW header, so any reimplementation inherits that maintenance forever. **We let the page
compute it.** Its `packages/shell-host/lib/installer-locations.mjs` is still the best small reference
for native-host registration on three OSes (`06`).

### 5 · ArcRift — memory, not tools
Extension (7 platforms) + native MCP host + local backend, MIT. Proves the demand for "browser chat
becomes a first-class tool" and gives a clean example of a *native* MCP transport (`core/mcp/transports/native`).
Its product is memory injection, not desktop control — no overlap with our loop.

### 6 · Endoplexity — the closest philosophical cousin
"Driven by the AI subscription you already pay for": a side panel that runs `claude` or `cursor-agent`
CLI. No API key — but it requires a paid CLI login and an HTTP bridge on localhost. Rejected for us:
it needs a subscription and a second credential, and it controls the *browser*, not the machine.
Useful evidence: DOM/accessibility snapshots alone can drive real tasks; 156 tests for a bridge of this
size is a sane ratio.

### 7 · AIPex — skills as a first-class artifact
Browser agent with a skill runtime, MIT. Relevant to our v1.2 "skills" idea: a skill is a markdown
procedure + a tool allowlist. Nothing to copy, but it validates the shape.

### 8 · Interceptor — the native-host detail we had already decided
Elastic-2.0 (cannot use). Its `ARCHITECTURE.md`:
> "The extension has one identity for both install paths: `extension/manifest.json#key` carries the Chrome
> Web Store item public key, so an unpacked load … derives the same extension ID as the store install."

That is our D2 decision (pin the key), independently derived and shipped. It also runs native messaging
**and** a localhost WebSocket, and documents that a copy missing from `allowed_origins` still works over
the socket — a good argument for us to have *only* native messaging (`02-LESSONS` L9).

### 9 · open-claude-in-chrome — installer evidence
PolyForm-NC. Its `install.sh` builds `allowed_origins` from every extension ID it can find, which is the
awkward shape our installer avoids by pinning one ID.

### 10 · qz-browser-agent — local-first framing
Alibaba, Apache-2.0, 12 manifests (multi-target build). Mostly confirms build-overlay practice.

### 11 · browser-control-mcp — MV2 that still works
MIT, MV2 with `background.scripts` — evidence that the FF-style event page is a viable production shape,
not a legacy hack.

### 12/18 · k3d3 Firefox bridges — the only Firefox-native prior art
No licence. Its manifest is nonetheless instructive: two content scripts on `claude.ai`, one
`world: "MAIN"` at `document_start`, and native messaging. That is the same two-world split we specified
(`src/content/injected.js` in MAIN). 6 stars and no licence means nobody can build on it — which is part
of why Firefox has no real product in this space.

### 13 · A9T9/RPA — the macro-recorder path
2.1k★, closed. Records clicks and replays them; its MCP bridge exposes recorded macros as tools.
A different product (deterministic replay, no model loop) and a reminder of what we are not.

### 14 · ZeroScript — the UX benchmark, GPL
Roblox Studio executor with 10 web providers. Confirms the loop and the provider list. Grepping it for
rate-limit handling returns **nothing** — the loop simply stops when the site refuses. That gap is one of
our main differentiators (`02`).

### 15 · ai-tool-agent — the hybrid launcher
MV3 with `nativeMessaging` used as a **launcher**: the host starts `server/launcher.js` and proxies to a
local HTTP tool server on `127.0.0.1:3002`, which is also whitelisted in `host_permissions`. It is the
source of our eight `apiPattern`s (`05`). Its weakness is the port: two processes, an HTTP surface, and a
browser permission for `localhost`.

### 16 · web-mcp-bridge — the honest baseline
MIT, the snapshot in `app/`. MV3 with only `background.service_worker` — it cannot run on Firefox. Its
`claude.js` / `gemini.js` selector tables are the cleanest selector reference in the survey (`05`).

### 17 · LuauPilot — the best loop engineering found anywhere
One product (Roblox), one web provider (DeepSeek), MIT, active (2026-11-03). Its `core/agent.js` opens
with the design goals that are the answer to the industry's worst failure mode:

> * One watcher decides when a reply is finished; history is never executed.
> * Every assistant turn is answered at most once (`answered`), and executed commands are remembered
>   across reloads (`lpExec`), so a reload can never repeat a command.
> * Every message LuauPilot injects goes through ONE governor: serialized, spaced, capped per minute,
>   and slowed down further after a rate-limit hit.
> * Loops … are stopped.
> * If the site still says "too frequent": reload → longer wait + reload → fresh chat, then back →
>   stop with a visible countdown.

And `providers/deepseek.js`:
> "DeepSeek answers message bursts with 'Messages too frequent': 6 s between sends and at most 5 per
> minute."
```js
rate: { minGapMs: 6000, perMinute: 5 },
rate: /messages?\s+too\s+frequent|too\s+many\s+(messages|requests)\s*[.,]?\s*try\s+again\s+later/i
```

**This is the "clock"**: a banner with `until: now() + ms` that counts down, then says "You can try again
now." (`UI().banner("rate", { text, until, tone })`). Our UI had a static notice; it now has a countdown.
