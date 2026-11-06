# Lessons — what the second survey changed

Every line here is a change to a document we had already written. If a lesson did not change anything,
it was not a lesson.

Legend: **✓ confirmed** (we had it right, now with evidence) · **✎ changed** · **＋ added** · **✗ removed**

---

## A. The loop

| # | Lesson | Source | Effect |
|---|---|---|---|
| L1 | **Sending must be paced** — one governor, min gap + per-minute cap, ratio raised after a hit | LuauPilot `core/agent.js` | ✎ `specs/04 §4` gains a governor table (3 s / 8 per min default; DeepSeek 6 s / 5) |
| L2 | **The ladder is reload → wait more → reload → new chat → stop**, with the pending message saved before the wait | LuauPilot `onRate` | ✎ ladder rewritten, jitter added, 200 s at hit 3, stop at 4 |
| L3 | **A wait is a visible countdown**, not a toast | LuauPilot `banner({until})` | ＋ `specs/09 §3` countdown bar |
| L4 | A refusal is terminal for that message — never re-send without the ladder's wait | LuauPilot `send()` | ✓ our rule held; now with the exact regex |
| L5 | **Do not pause on a hidden tab.** Hidden tabs throttle timers; pausing throws away answered turns | LuauPilot `HIDDEN {20000,30000}` + `visibilitychange` | ✗ removed "pause when `document.hidden`"; replaced with a hidden timing profile |
| L6 | **A turn is finished only when the page says so**; an unexplained end is `unknown`, never "the model refused" | CoS `chatgpt-turn-signals.md` | ＋ outcome enum `completed/failed/stopped/interrupted/stalled/unknown` |
| L7 | **Answer each turn at most once**, across reloads | LuauPilot `answered` / `lpExec` sets | ＋ `answered` set persisted in `storage.local` |
| L8 | **First prose ≠ answer.** A turn has interim commentary; parse the *last* block | CoS `answerText` vs `finalAnswerText` | ✎ `specs/02` chooses the last closed block, not the first |
| L9 | Guard rails are numeric: same-call ×4, errors ×3, continuations ×4, output 60 KB | LuauPilot `MAX_SAME/MAX_ERR/MAX_CONT/MAX_OUT` | ✓ ours were 4/3/4; output raised (L15) |
| L10 | A reply that already contains **one closed block** can be acted on after a *short* calm period | LuauPilot `FAST` | ＋ per-adapter `timings.fast` |

## B. Reading and parsing

| # | Lesson | Source | Effect |
|---|---|---|---|
| L11 | **Do not loosen matching to make metrics look better** — fail closed on unknown shapes | CoS `tool-error-rate-2026-08-24.md` | ✓ `specs/02` keeps `multi → none`; explicitly documented as a principle |
| L12 | Argument normalisation is a real feature: quoting and glob shapes caused most non-zero exits | CoS (16.8 % of exec calls were errors) | ＋ `specs/02 §6` normalisation rules (quotes, `~`, trailing slash), each with a test |
| L13 | Binary frames: a brace-depth scanner is the only general decoder | ai-tool-agent `binaryStream` (Kimi) | ✓ `specs/01` keeps it |

## C. Tools

| # | Lesson | Source | Effect |
|---|---|---|---|
| L14 | **Batch commands in one call** (`cmds[]`, one shell, labelled sections, exit = first non-zero) | CoS `exec_command` | ＋ `run_command` gains `cmds` |
| L15 | **Long runs must be continuable**: return a `session_id`, feed it with `write_stdin` | CoS `exec_command` / `write_stdin` | ＋ `send_stdin` tool, `run_command({bg:true})` |
| L16 | **Result budget should be generous**: 256 KB/file, 512 KB aggregate — "the round trip costs far more than the bytes" | CoS `read` | ✎ our 48 KB cap raised to **128 KB per result / 256 KB per call**, 512 KB with explicit `full:true` |
| L17 | **Give the model a way to ask the human** instead of guessing | CoS `ask_user_to_run` | ＋ `ask_user(question, options?)` builtin |
| L18 | **A visible plan** keeps a long task legible | CoS `update_plan` | ＋ `update_plan(steps)` builtin (renders a checklist card) |
| L19 | **An explicit finish** ends the loop cleanly instead of relying on prose | CoS `session_finish` | ＋ `finish(summary)` builtin; replaces the rejected `[MDH_DONE]` text marker |
| L20 | Do **not** expose overlapping tools at once (`find` xor `exec_command`) | CoS `tool-surface.md` | ✓ our surface has one search tool and one runner |

## D. UI

| # | Lesson | Source | Effect |
|---|---|---|---|
| L21 | Show the **pipeline stages with durations**, not a status word | CoS popup | ＋ popup pipeline strip |
| L22 | **Timestamps off by default**, tabular numerals, 45 % opacity | CoS `overlay.css` | ＋ timestamps toggle (the "clock") |
| L23 | Distinguish **pre-existing** incomplete calls (clock icon) from **live stalls** (warning icon) | Superpower `stalledStreamHandler.ts` | ＋ stall card with `Keep waiting` / `Stop` |
| L24 | `Try again` only appears when there is something to retry | CoS popup | ✓ "no dead buttons" written into `specs/09 §7` |

## E. Transport & install

| # | Lesson | Source | Effect |
|---|---|---|---|
| L25 | **Pin the extension key** so the ID is stable; print the derived ID; accept extra IDs nowhere else | Interceptor, BrowserMCP, ai-tool-agent | ✓ D2 stands, now with three witnesses |
| L26 | **Self-check after install**: spawn the host, `ping`, expect `pong` | nobody does it | ＋ `install.sh` step 6 |
| L27 | One transport, one identity — running WS *and* native messaging creates a bypass | Interceptor docs | ✓ D2 stands; WS rejected again |
| L28 | Firefox has **no `chrome.debugger`** → every automation-based competitor is Chromium-only | BrowserMCP README | ✓ our Firefox parity is structural, not luck |
| L29 | A local HTTP tool server (`127.0.0.1:3002`) is a second attack surface | ai-tool-agent | ✓ rejected |

## F. Product & honesty

| # | Lesson | Source | Effect |
|---|---|---|---|
| L30 | Linux GUI input is a trap in 2026 — even a 5 k★ project masks it off at runtime | CoS `tool-surface.md` | ✓ v1 ships `open_app` only |
| L31 | Remote selector config (Firebase) fixes breakage without a release | Superpower `config-manager.ts` | ✗ rejected for v1 (no remote anything); listed for v1.1 as data-only, opt-in |
| L32 | Ship a **usage notice** that says plainly what the tool is not for | CoS README | ＋ README "responsible use" section |
| L33 | Never describe an unknown outcome as a provider limit | CoS `endOutcome()` | ＋ wording rule |
| L34 | Three repos in this space have **no licence** or a non-commercial one | k3d3 ×2, open-claude-in-chrome | ✓ nothing copied; recorded in `CREDITS.md` |

---

## The v1 tool surface after this pass (13 tools, replaces the 9)

| Tool | Signature | Why it is in v1 |
|---|---|---|
| `list_dir` | `(path, depth?)` | navigation |
| `read_file` | `(path, offset?, limit?)` | the main verb |
| `write_file` | `(path, content)` | create/overwrite |
| `edit_file` | `(path, find, replace)` | surgical edit, fails if `find` is ambiguous |
| `run_command` | `(cmd? | cmds?, cwd?, timeout_ms?, bg?)` | shell, batched (L14) |
| `send_stdin` | `(session_id, input)` | continue a background process (L15) |
| `search_files` | `(pattern, path?, glob?)` | find before read |
| `file_info` | `(path)` | size/type/mode/mtime without reading |
| `sys_info` | `()` | OS, session, cwd, disk — the "where am I" |
| `open_app` | `(name_or_command)` | the only GUI action in v1 |
| `ask_user` | `(question, options?)` | resolve ambiguity instead of guessing (L17) |
| `update_plan` | `(steps[])` | legibility for long tasks (L18) |
| `finish` | `(summary)` | deterministic loop end (L19) |

Prompt budget rises from ~700 to ~820 tokens; the ceiling in `SYSTEM.md §2` moves from 1,600 to 1,800.
