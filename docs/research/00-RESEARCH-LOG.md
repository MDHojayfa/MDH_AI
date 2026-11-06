# Research archive — index and corrections

> ⚠️ **DELETE THIS DIRECTORY BEFORE v1 SHIPS** (`PLAN.md §5`). It is kept in the repo, rather than on
> the desktop, because the repo is the only thing that survives between work sessions.

Method: clone every candidate at a recorded commit, read the source, extract with a parser (never with
`grep -oE`, which truncates regex literals), and verify browser claims against the platform's own
documentation. Numbers and paths below come from code, not from README claims.

| File | Contents |
|---|---|
| `01-SURVEY.md` | 18 repositories: commit, date, licence, what each proves, what we take |
| `02-RATE-LIMITS.md` | the refusal mechanism, measured pacing, the ladder, the countdown clock |
| `03-TURN-DETECTION.md` | when a reply is finished, the outcome vocabulary, timings, stalls |
| `04-SEND-MECHANICS.md` | editors per site, send-is-stop, acceptance detection, attachments |
| `05-PLATFORM-INTEL.md` | per-platform hosts, stream signatures, selectors, confidence |
| `06-TRANSPORT-AND-INSTALL.md` | native messaging, ID pinning, Firefox limits, rejected transports |
| `07-UI-INTEL.md` | popup/overlay/banner patterns, the clock, stalls |
| `08-LESSONS.md` | the 34 lessons and exactly which document each one changed |
| `09-WEB-CLIENT-ENDPOINTS.md` | Claude / Gemini / Kimi / Grok endpoints, from clients we do not use |
| `10-MAIN-WORLD-AND-CSP.md` | how the page realm is entered, and the worker blind spot |

## The prior-art answer, unchanged

Could v1 be an adapter on something that already exists? **No.** Five families, each fails a hard
requirement:

| Family | Example | Fails on |
|---|---|---|
| Web-chat → local tools, one app | ZeroScript (Roblox Studio) | not the desktop |
| Desktop app + extension | chat-on-steroids | needs an app install and a paid plan |
| Browser-automation + MCP | Superpower, BrowserMCP, Interceptor | Chromium-only, drives the user's browser, no Firefox |
| API-key agents | Hermes Agent, free-claude-code | **requires a key** |
| CLI-subscription agents | Endoplexity | requires a paid CLI login; controls the browser, not the machine |

**Conclusion stands: the architecture exists in pieces; the product does not.**

## Corrections to the first pass (kept visible on purpose)

1. **`lsy200409/ai-tool-agent` does not use Playwright.** It uses `nativeMessaging` as a *launcher* that
   spawns a local HTTP tool server on `127.0.0.1:3002`. The first pass got this wrong; the corrected
   reading is in `01-SURVEY.md` and it changes the argument (it is a second attack surface, not a
   different architecture).
2. **`sebattfg/ZeroScript-Free` has no rate-limit handling at all.** The `rateShown()` evidence came from
   `MaciekGos/LuauPilot`, a different (MIT) project with one provider. Correct attribution matters because
   ZeroScript's silence is itself the finding: the most-starred tool in this space simply stops when the
   site refuses.
3. **Kimi, Qwen and GLM had no measured pacing in the first pass.** They still have none — only DeepSeek
   does. Everything else starts at the conservative default (`3 s / 8 per min`) and adapts from hits.
4. **Claude, Gemini and Kimi are no longer unknown transports.** A 19th repo (`ChatGPTBox-dev/chatGPTBox`,
   MIT) reimplements the web clients; reading it gave us Claude's `completion` SSE (terminal
   `stop_reason: stop_sequence`), Gemini's `StreamGenerate` RPC (body-complete, **not** SSE) and Kimi's
   `all_done` SSE on `www.kimi.com`. Details and the reason we still do not use that approach:
   `09-WEB-CLIENT-ENDPOINTS.md`.
5. **The "clock" is two different things**, and we now have both: a *timestamps* toggle (chat-on-steroids)
   and a *countdown banner* during a rate-limit wait (LuauPilot). `specs/09-ui.md §8` implements both.

## Browser facts, verified (unchanged by round 2)

| Claim | Verdict | Source |
|---|---|---|
| Firefox lacks `background.service_worker` | true (bug 1573659) → `background.scripts` | MDN |
| Declaring both keys | works Chrome 121+ and Firefox 121+ | MDN + porting guides |
| Firefox `browser.*` promises; `chrome.*` is a callback alias | true | extension platform notes |
| `chrome.*` promises | Chrome 148+ partial, 152+ full → we keep `compat.js` | same |
| Host permissions auto-granted below FF 139 | no, revocable | porting guides |
| `connectNative` | Firefox 50+, `allowed_extensions` key | MDN |
| `content_scripts.world` | Firefox 128+ | BCD 8.1.8 |
| AMO signing | mandatory for permanent install | AMO docs |
| Chrome rejects `browser_specific_settings` | true → strip in the Chrome overlay | porting guides |
| **Firefox has no `chrome.debugger`** | true → every debugger-based competitor is Chromium-only | BrowserMCP README |
| Playwright extension loading | Chromium only in practice; Firefox experimental | Playwright docs |
| Hosted browsers load extensions | no | Clearcote docs |

BCD audit run locally against `@mdn/browser-compat-data@8.1.8`: only `background.service_worker` is
unsupported — hence `strict_min_version: 140`.

## Decisions this archive caused (round 2)

Governed sending + ladder (D13) · hidden ≠ paused (D14) · outcome vocabulary (D15) · 13 builtins (D16) ·
128/256/512 KB budgets (D17) · countdown/pipeline/timestamps (D18) · no remote config in v1 (D19).

## Re-survey queue (M8) — the part reading cannot finish

1. ~~Claude completion endpoint~~ — found: SSE, `stop_reason: stop_sequence` (verify live).
2. ~~Gemini framing~~ — found: RPC, body-complete. Verify the text path and the DOM cross-check.
3. ~~Grok transport~~ — found: SSE on `/rest/app-chat/conversations/...`, terminal `[DONE]`, delta
   `result.response.token`. **Selectors still unknown** — Superpower's are a utility-class chain.
4. Verbatim refusal strings per platform, in the site's locale.
5. ~~Kimi frame layout~~ — two reports: SSE `{event:'cmpl'}` on kimi.com, binary frames on
   kimi.moonshot.cn. Ship both paths; confirm per host during M8.
6. Measured pacing for each platform (start conservative, record what the first hits teach).
