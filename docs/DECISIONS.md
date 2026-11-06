# Decision log

Every entry: the decision, the alternatives I rejected, and why. This is the self-questioning record —
if a choice looks wrong later, the reasoning (and what it traded away) is here.

---

## D1 — How we read the model's reply

**Chosen: stream interception first, DOM fallback second, never automation.**

| Option | Why rejected |
|---|---|
| DOM scraping only | the entire reason `chatgpt.js` is 371 lines of `repairBackslashes()` / `stripCodeChrome()` / detached-code-viewer handling. Markdown mutates the JSON. |
| Playwright automation | needs a separate browser profile; loses your real session; slow; heavy. It solves a different problem. |
| **SSE/XHR interception + DOM fallback** | raw stream, nothing mangled; DOM fallback keeps one platform from being a blocker |

**Trade accepted:** we must hook `window.fetch` and `XMLHttpRequest` in the MAIN world, which means
site code could notice. Mitigation: wrap without changing behaviour, `tee()` the response, never
mutate the page's objects.

## D2 — Transport

**Chosen: native messaging primary, WebSocket for development only.**

| Option | Why rejected / kept |
|---|---|
| Localhost WebSocket only | every repo does this. It is an unauthenticated port that any page on the machine can reach. |
| HTTP + token | same exposure, plus CORS |
| **Native messaging** | no listening port at all; the browser spawns the host; the OS enforces the allowlist |
| ws dev fallback | needed because native messaging needs a registration step per browser |

**Trade accepted:** changing `tools.json` requires restarting the host instead of hot-reload.
Mitigation: the host reloads its own config on each call, and the extension has a Restart button.

## D3 — Tool boundary

**Chosen: MCP stdio servers + a small builtin Linux toolset.**

| Option | Why rejected |
|---|---|
| Fixed builtin tools only (ZeroCode) | dead end: every new capability is a code change |
| MCP only | an empty install does nothing; first-run UX dies |
| **MCP + builtin** | works out of the box, grows forever |

**Trade accepted:** an extra process. Mitigation: the host *is* the MCP client; nothing extra to install.

## D4 — Where the loop lives

**Chosen: content script owns the conversation; background owns transport and state.**

Rejected: background-owns-everything — impossible, the DOM and the stream are in the page.
Rejected: background-owns-state only — MV3 workers die in 30 s; Firefox event pages suspend too.
**Consequence:** state that must survive suspension (`pendingCall`, `lease`, `auditBuffer`) lives in
`storage.local`, never only in a module variable.

## D5 — Tool-call format

**Chosen: one JSON envelope per message, in a ```json fence, single call enforced.**

Considered: `###MCP_TOOL###` markers (ZeroScript), XML-ish tags, native function-call emulation.

| Why the fence+JSON wins | Why the others lose |
|---|---|
| survives copy/markdown better than bespoke markers | custom markers get eaten by markdown (`###LUA###` → `### LUA ###`) |
| every model writes JSON well | tag dialects vary per model (DeepSeek emits its own DSML) |
| one call per message = deterministic state machine | multi-call replies make approval ambiguous |

**Trade accepted:** one round-trip per tool call. Mitigation: batch-friendly tools (`run_script`) and
a compact prompt so context does not explode.

## D6 — Approval model

**Chosen: three-state per tool (`allow` / `ask` / `deny`) + a confirmation card attached to the exact call.**

Rejected: per-server only (too coarse — `run_command` and `list_dir` in the same server).
Rejected: modal dialog (blocks the page, no context).
**Borrowed idea:** `browser2terminal`'s Run button attached to the code block — consent shown *at* the thing.

## D7 — Build system

**Chosen: no bundler. Vanilla ES modules + a `build.mjs` that copies and rewrites manifests.**

Rejected: webpack/vite/esbuild — 40+ transitive deps for a 3 k-line extension, and a supply chain
nobody audits. Rejected: WXT/Plasmo frameworks — magic, and they own your manifest.
**Trade accepted:** no TypeScript. Mitigation: JSDoc types + `node --check` in CI.

## D8 — Sandbox level

**Chosen: refuse-by-default path allowlist + optional container mode, not mandatory containerisation.**

Rejected: mandatory Docker — first-run friction, and MCP servers inside a container cannot see the
user's project. Rejected: none at all (ZeroCode) — unacceptable.
**Trade accepted:** a determined injection inside the allowlist is still dangerous. Documented in `SECURITY.md`.

## D9 — Firefox support approach

**Chosen: one source, two manifests, one API shim. Minimum Firefox 140.**

Rejected: minimum 121 + runtime permission prompts — 40 extra lines and a worse first run for a
shrinking set of users. Rejected: separate fork — two codebases, guaranteed drift.
**Trade accepted:** users below Firefox 140 are excluded. Revisit in v2 if real users ask.

## D10 — Brave handling

**Chosen: same artifact as Chrome, only the native-host registration path differs.**

`~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/` vs `~/.config/google-chrome/NativeMessagingHosts/` vs
`~/.config/chromium/NativeMessagingHosts/`. `install.sh` writes all three that exist and says which.

## D11 — Language

**Chosen: English prompt and UI for v1.** The upstream base was Spanish-first, which made models answer
in Spanish. Bangla UX comes as a separate manual + optional UI locale after v1.

## D12 — What we do with `app/`

**Chosen: keep as a working reference until `src/` reaches parity (M10), then delete.**

It is MIT, its notices are legally required while it exists, and it is the only thing the user can
actually run today. Deleting it early would leave the repo with nothing runnable.

---

## Self-questions I could not answer from reading (logged, not hidden)

1. Does any of the 8 platforms stream over WebSocket rather than fetch/XHR? If yes, we need a
   `WebSocket` constructor wrapper too — cheap, but unverified.
2. Is Firefox's event page suspended during a 150 s tool call? If yes → an `alarms` ping every 25 s.
3. Do any sites stream the *tool call* only in the DOM (e.g. as a rendered "tool use" widget) and never
   in the raw stream? DOM fallback covers it, at the cost of that platform's robustness.
4. Will the 8 adapters' recorded API patterns still match? Unknown until M8.

---

# Round 2 — decisions forced by the second survey

Source: `research/02`…`08`. Each of these replaces or sharpens an earlier decision.

## D13 · Sending is paced by a governor, and refusals follow a ladder
**Chosen:** one serialised governor per tab (`minGapMs` 3 000, `perMinute` 8; DeepSeek 6 000/5), and a
four-rung ladder — 8 s → reload, 40 s → reload, 200 s → fresh chat, then stop for 5 min.
**Rejected:** retry-on-error (burns the account), and chat-on-steroids' *unbounded* retry of retryable
refusals (defensible on a paid plan, wrong for free tiers).
**Trade accepted:** tasks get slower. A tool loop that respects 6 s between sends costs minutes, not
minutes-and-a-ban.

## D14 · A hidden tab is slow, not stopped
**Chosen:** hidden-tab timing profile (`idle 20 s`, `stable 30 s`) + re-base on `visibilitychange`.
**Rejected:** our earlier "pause while hidden" — it discards a turn the model already answered, and
browsers only throttle timers.

## D15 · Turn outcomes are a closed vocabulary
**Chosen:** `completed | failed | stopped | interrupted | stalled | unknown`; only `completed` advances;
`stopped` is terminal; `unknown` is described to the user as "the page ended the reply without a signal".
**Rejected:** inferring completion from "no new text for N seconds" alone, and describing an unknown end
as a provider limit.

## D16 · Thirteen builtins, including three that exist only for the loop
**Chosen:** the nine originals + `send_stdin` (background processes), `ask_user` (resolve ambiguity
instead of guessing), `update_plan` (legibility), `finish` (deterministic end). `run_command` accepts
`cmds[]` (≤20, one shell, exit = first non-zero).
**Rejected:** a JS `exec` composition runtime (powerful, unbounded, and a second injection surface).
**Trade accepted:** ~120 more prompt tokens, and three more tools the model can misuse — all three are
non-destructive by construction.

## D17 · Generous result budgets
**Chosen:** 128 KB per result, 256 KB per call, 512 KB on explicit `full:true`.
**Rejected:** the earlier 48 KB cap — it turns "read this file" into a three-call dance, and the round
trip costs far more than the bytes.

## D18 · The wait is visible: countdown, pipeline strip, quiet timestamps
**Chosen:** a `mm:ss` countdown driven by wall clock; a four-stage pipeline strip in the popup; an opt-in
timestamp chip per result.
**Rejected:** a pleasant "thinking…" spinner with no number — the number is the information.

## D19 · No remote configuration in v1
**Chosen:** adapters ship in the build; a selector fix needs a rebuild.
**Rejected:** Firebase-remote selector config (Superpower's approach). It fixes breakage instantly, and it
also means a remote party can redirect our extension's typing. Revisit as **v1.1, data-only, opt-in,
signed**, never as code.

## D20 · MAIN-world injection via the manifest, never a `<script>` tag
**Chosen:** a static `content_scripts` entry with `world: "MAIN"` and `run_at: "document_start"` (Chrome
111+, Firefox 128+ — both below our minimums), so the browser injects the wrapper outside the page's CSP.
**Rejected:** `createElement('script')` injection (blocked by `script-src`, racy ordering) and runtime
`executeScript` (too late for the first request).
**Trade accepted:** the wrapper is a page-realm object the site *can* see and re-wrap; it therefore holds no
secrets and no extension APIs — only text forwarding. Verified in `research/10` against BCD 8.1.8.

## D21 · The worker blind spot is documented, not built around
**Chosen:** if a reply streams from a worker (invisible to our wrapper), detect the pattern — composer busy,
no stream for 15 s, DOM producing text — and switch to DOM mode for that conversation.
**Rejected:** patching `Worker` constructors and rewriting worker sources in v1 (fragile, and a second
injection surface for a case no surveyed platform exhibits today).
