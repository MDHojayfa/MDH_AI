# Testing

Five layers. The first four run without a browser or a signed-in account; the fifth is a checklist a human
runs before a release.

## 1. Units — `npm test`

88 tests against the shipped files, loaded into a `vm` sandbox with a fake storage and a fake page. No
copies of the logic, so a green run means something about the extension itself.

| Area | File | What it pins |
|---|---|---|
| parser | `tests/parser.test.mjs` | last closed fence wins, two calls execute nothing, repairs, unclosed/truncated, foreign syntax is named not quoted, conservative coercion |
| policy | `tests/policy.test.mjs` | allow/deny, traversal, deny-over-allow, unknown tools ask, commands always ask, card describes the *request* |
| prompt | `tests/prompt.test.mjs` | signatures not JSON Schema, budget respected with dropped tools named, verbatim task, credit present exactly once |
| guard | `tests/guard.test.mjs` | realpath check, symlink escape, missing-path creation, empty input |
| audit | `tests/audit.test.mjs` | chain verifies, silent edit detected, no file contents stored, only the first command line kept |
| fun | `tests/fun.test.mjs` | pools are long enough, lines are short, no joke claims success, mentions data or credentials, rotation is deterministic |
| site | `tests/site.test.mjs` | one h1, ordered headings, JSON-LD parses (SoftwareApplication/HowTo/FAQPage), no external resources, credit spelled once |
| package | `tests/package.test.mjs` | the ZIP writer is structurally valid, stores tiny files, deflates big ones, artifacts carry a root manifest |
| installer | `tests/installer.test.mjs` | `--help`, `--dry-run` writes nothing, `--no-fun` removes every ☾ line, `--barbos` echoes commands, unknown flags fail |
| host | `tests/host.test.mjs` | real `run_command` output, batched shell, timeout kill, atomic write, ambiguous edit, binary refusal, truncation |
| manifests | `tests/manifest.test.mjs` | eight platforms, MAIN/ISOLATED split, module order, Firefox event page, Chrome key → stable ID, no `http://` |

## 2. Build invariants — `npm run build`

The build refuses to emit a manifest that would fail in the field: wrong world for the tap, missing
`nativeMessaging`, a Firefox service worker, an absent Gecko ID, a Chromium-only field in the Firefox
artifact, an insecure origin, a key that does not derive the documented extension ID.

`npx web-ext lint --source-dir dist/firefox` must stay at **0 errors**. One warning about Firefox for
Android is expected and irrelevant: this product is desktop only.

## 3. Host — `node tools/selfcheck.mjs`

The same three-checks-in-one-minute sequence runs in CI (`.github/workflows/ci.yml`): tests on Node 20 and
22, then build + package + `web-ext lint`, then a real spawn of the host. No `npm install` anywhere, so a
registry outage cannot stop a release.

Spawns the host exactly as a browser does — length-prefixed frames on stdin — and waits for a real pong.
`install.sh` ends here, because "the manifest is written" is not the same claim as "the host answers".

Beyond the ping, the host is exercised by hand for the risky paths:

| Case | Expected |
|---|---|
| `read_file ~/projects/x` | content, line-numbered |
| `read_file ~/.ssh/id_rsa` | `PATH_DENIED`, nothing read |
| `write_file` outside the allowlist | `PATH_DENIED` |
| `edit_file` with text that appears twice | `AMBIGUOUS_MATCH` |
| `run_command` with 20 commands, one failing | first non-zero exit, all output |
| `run_command` past the timeout | killed, `exit_code: 124` |
| an MCP server that never starts | `TOOL_MISSING` for its tools; host stays alive |
| kill the host mid-call | extension reports `NO_HOST` and offers Retry |

## 3b. Report and share — `tests/report.test.mjs`

Twelve tests, and four of them exist because the alternative is a support tool that damages trust:

| Case | Expected |
|---|---|
| `ISSUES.length` | between 15 and 30; every line contains a call to action |
| mission corpus | never merged into the issue or share pools |
| joke safety | no line claims a success or mentions a credential, key or passphrase |
| `issueUrl()` | `issues/new?template=bug_report.yml`, title and body encoded, stage/platform/browser present |
| redaction | a home path and an internal URL in `detail` arrive as `<path>` / `<url>`, never verbatim |
| `ideaUrl()` | `feature_request.yml` |
| `shareLinks()` | ten endpoints, each on its documented host; X and Reddit carry the repo URL |
| honest limits | Instagram and TikTok carry no repo URL (they have no intent), and the sheet says so |
| rotation | deterministic per seed, and two seeds do not collide |
| popup wiring | nine platform labels, `#share-copy`, `#report-bug`, `#report-idea`, `navigator.clipboard`, `navigator.share` |
| ask-once | `sharePrompted` is read, written, and guards the auto-open |

## 3c. Popup markup — `tests/popup.test.mjs`

Eight tests, written because this project has no browser in CI and a popup fails silently:

| Case | Expected |
|---|---|
| ids | every `$('id')` in `popup.js` exists in `popup.html` |
| CSP | no inline `on*=` handlers anywhere |
| network | no `<script src="http…">`, no remote stylesheet |
| share | every `data-share` value is a key in `report.shareLinks()`, no duplicates |
| structure | `section`, `details`, `div`, `button`, `p` balanced |
| dialog | `role="dialog"`, `aria-modal`, labelled, closable by button, backdrop and Escape, focus restored |
| order | the issue strip is above the task box |
| honesty | no "guarantee", "auto-fix", "works everywhere" copy; the NASA PC sentence is present |

## 3d. Diagnostics — `tests/diag.test.mjs`, `tests/hostdiag.test.mjs`

Fifteen tests. The ones that matter are the privacy ones, because a report builder is the easiest place in a
codebase to leak something by accident.

| Case | Expected |
|---|---|
| collection | build, browser, OS, device, network, page, failure and host facts present; nothing invented |
| signatures | a 1015 ban is `cf-ban` + `external`, with a fix involving another network |
| ordering | a measured clock skew outranks every guessed signature; `onLine === false` outranks everything |
| redaction | `/home/...` → `<path>`, `me@example.com` → `<email>`, foreign URLs → `<url host>`, platform host kept |
| consent | the body says the IP is absent *because the user chose so*, and includes it only with `includeIp` |
| submission | the URL is `issues/new?template=…`; nothing in the module posts anywhere |
| degeneracy | an empty diagnostic still produces a valid body and URL |
| table health | ≥ 12 signatures, unique ids, each with what/why/fix and a valid severity |
| host allowlist | `reachProbe('evil.example.com')` refuses before opening a socket |
| not tools | no `diag`/`net_probe`/`viewer`/`snapshot` in the model's catalogue |
| probes | IP + skew in one request; clock-only returns no address; timeout and refusal are values, not throws |
| machine facts | node version, cores, load, interfaces, container hints — and disk either answers or says why not |

## 3e. The viewer — `tests/viewer.test.mjs`

| Case | Expected |
|---|---|
| page | no `<script>`, no remote reference, CSP `default-src 'none'` |
| escaping | a tool name of `<img onerror=…>` arrives escaped, not dropped |
| percentiles | missing timings are ignored, not counted as zero |
| binding | `127.0.0.1` only — asserted on the live server, not the source |
| auth | 200 with the token, 404 without and 404 for a wrong token |
| surface | `/health` and `/data.json`; `/../../etc/passwd` is a 404 |
| filters | `status`, `level`, `q`, `tool` are query parameters; a bogus value is ignored rather than emptying the page |
| counting | a filtered page says "n of m shown"; an unfiltered one does not |
| hiding | `?view=stats` collapses the table, keeps the totals, offers the way back |
| archiving | a confirm card, a POST-only endpoint, 404 without the token, 405 for GET, and a redirect that says *archived* — never *deleted* |

## 3f. The composer pill — `tests/dock.test.mjs`

| Case | Expected |
|---|---|
| load order | `dock.js` after `agent.js`, before `content/main.js`, mounted by `boot()` |
| phases | seven phases, each with icon, label, tooltip and one of five actions |
| anchoring | above-right of the composer, clamped inside the viewport |
| saved position | a position from a 4K screen is clamped, never negative, never off-screen |
| drag vs click | a 4 px threshold separates a drag from a click |
| paused | a paused loop is one click from continuing, and a stop mid-send does not advertise a strange phase |
| persistence | `dockPos` and `lastTask` are read and written |

## 3d0a. Tool-failure hints — `tests/hints.test.mjs`

| Case | Expected |
|---|---|
| known codes | PATH_DENIED, ENOENT, TIMEOUT, TOOL_MISSING, DENIED, EACCES, truncation, NO_HOST each get a next action |
| unknown | no invented advice, and a plain exit code gets none |
| framing | the hint is appended below the untouched error, and never on a successful call |
| size | the table stays short enough to read |

## 3d0b. Pill tooltip — `tests/dock.test.mjs`

| Case | Expected |
|---|---|
| running | phase sentence plus the turn number |
| paused | phase sentence, the reason, and the turn — in that order |
| stopped | the reason, without a turn if unknown |
| nothing | says "MDH" rather than an empty tooltip |
| refresh | the title updates when the reason changes, not only on a phase change |

## 3d1. Plan mode — `tests/planmode.test.mjs`

| Case | Expected |
|---|---|
| prompt | the read-only promise is stated, and only when the setting is on |
| enforcement | every non-allowlisted tool is refused inside the agent, never reaching `transport` |
| exit | only `approvePlan` returning true clears the flag |
| decline | "keep planning" leaves it read-only and says so |
| card | a direction, not an action: nothing has been changed yet |
| setting | persisted, default off, declared to the model as a local tool |

## 3d2. Skills — `tests/skills.test.mjs`

| Case | Expected |
|---|---|
| parsing | `#`, `###`, `####` all start a playbook; a heading with no body is dropped |
| limits | at most 12 playbooks; names clipped to 40 characters |
| prompt | names only — a body must never appear in the first prompt |
| lookup | exact, case-insensitive, then prefix; unknown names are answered with the list |
| execution | `read_skill` is declared to the model and answered in the browser, not the host |
| editing | popup textarea, saved on blur, stored locally as `[{name, body}]` |

## 3e0. Per-run notes — `tests/memory.test.mjs`

| Case | Expected |
|---|---|
| injected | `# Notes from the user` appears in the first prompt, verbatim |
| empty | no empty section when the field is blank or whitespace |
| bounded | clipped at 1,200 characters, never padded |
| persistence | saved on blur via the content script; read at the start of every run |
| promise | the UI says "saved locally" because it is |

## 3e1. Handoff — `tests/handoff.test.mjs`

| Case | Expected |
|---|---|
| content | task, plan with statuses, up to three results, next step, the "do not redo" rule |
| no transcript | no `User:` / `Assistant:` lines — results, not conversation |
| clipping | a 1000-char result is trimmed; the oldest results fall off the list |
| empty state | says "no task recorded" and invents no plan |
| plug | a handoff can carry a fresh completion code for the receiving chat |
| wiring | the pause card offers Copy handoff; `recentResults` is bounded to three |

## 3e2. Weight and claims — `tests/weigh.test.mjs`

| Case | Expected |
|---|---|
| budgets | zip ≤ 300 KB, host RSS ≤ 80 MB, startup ≤ 1500 ms, dependencies = 0 |
| verdict | a fabricated over-budget metric fails `evaluate()`; an in-budget one passes |
| dependencies | `package.json` declares no dependencies, optional or dev |
| honesty | `weigh.mjs` exits non-zero over budget; `docs/WHY.md` tells the reader to run it |
| stale prose | a quoted KB figure more than 15% from the built zip fails the run |
| v2 notes | rotation and messaging are named, and marked as notes rather than promises |

## 3e2b. Documentation coverage — `tests/docs.test.mjs`

The docs are part of the product, so the late-v1 features have to exist in them:

| Doc | Expected |
|---|---|
| SCENARIOS | plug, layout watch, grants, runs, handoff — and the closing count matches |
| FAQ | completion code, plan first, skills, remembered approvals, the weigh numbers |
| KNOWN-LIMITS | a 1.0.0 table saying what was tested and what was not |
| README | links to WHY, PLUG, V2-NOTES, RELEASE, TESTPLAN and `npm run weigh` |

## 3e3. Runs and replay — `tests/viewer.test.mjs`

| Case | Expected |
|---|---|
| row details | arguments, the full hash and the run id are all in the page, behind `<details>` |
| no script | the interactive part is HTML, so the CSP stays `default-src 'none'` |
| run view | selecting a run shows calls, failures, tools, start→end and the ordered sequence |
| empty | no run selected, no header |

## 3e4. Runs in the log — `tests/audit.test.mjs`, `tests/viewer.test.mjs`

| Case | Expected |
|---|---|
| audit | `run` is stored, clipped to 40 chars, and inside the chain hash |
| absent | entries without a run stay valid and verifiable |
| grouping | calls group by run; pre-run entries land under "earlier calls" |
| filter | `?run=` narrows the table; an unknown id shows nothing; empty means all |
| links | the token and the run both survive Hide/Show and Archive |

## 3e5. Layout watch — `tests/probe.test.mjs`

| Case | Expected |
|---|---|
| first visit | no warning: there is nothing to compare against yet |
| steady | fine → fine is not news; broken → broken is not news either |
| regression | fine → broken announces the missing fields, once |
| recovery | broken → fine is a log line, never a card |
| timing | checked at 4 s and 15 s, because sites paint late |

## 3e6. The log command line — `tests/logcli.test.mjs`

| Case | Expected |
|---|---|
| grouping | runs stay apart, tools listed once, newest first, and entries from before run ids still get a row |
| timestamps | ISO strings and epoch ms both work — the page reads one, the CLI is handed the other |
| `--runs` | one line per run: id, calls, failures, first→last, tools; a readable header |
| `--run <id>` | every call in order with status and duration; another run's calls are not in it |
| unknown run | exit 1 and a sentence, not an empty table |
| help | both flags are in `--help` |

## 3e7. Who said yes — `tests/via.test.mjs`

| Case | Expected |
|---|---|
| record | `auto` and `grant:session` reach the audit line, and the chain verifies |
| hash | rewriting `via` afterwards breaks verification at that line |
| vocabulary | unrecognisable or over-long values become `other`, never vanish |
| absent | an entry written without `via` stays valid and has no empty field |
| the loop | a policy allow returns `auto`; the old `return 'once'` is gone; every decision maps to a name |
| transport | the frame carries `via`; the host forwards it to the audit |
| page | every row shows who allowed it, and `?run=` keeps it in sequence |
| terminal | `mdh-log --run` prints `allowed by: …` and the per-call column |

## 3f1. Run grants — `tests/grant.test.mjs`

| Case | Expected |
|---|---|
| plain command | grantable, key carries folder + normalised text (whitespace collapsed) |
| same command, other folder | a different key — not the same grant |
| `&&`, `;`, pipe, redirect, `$(…)`, backticks, glob, `~` | refused, with a reason a human can read |
| non-command tool / empty command | refused |
| lifetime | a new run clears grants; a granted command skips the card; the block never calls `state.set` |
| the card | one big "Allow once" plus a caret offering run / session / site |
| policy | `run_command` still asks even when the tool is set to allow |

## 3f2. Page probe — `tests/probe.test.mjs`

| Case | Expected |
|---|---|
| full match | `ok: true`, `missing: []`, the stream pattern is exposed |
| renamed composer | `ok: false`, `missing: ['composer']`, note says Start cannot type |
| missing send/stop | `ok: true` — drawn as `○`, never as a failure |
| invalid selector | listed as the adapter's bug, the valid sibling still counts |
| no adapter | fails loudly, no invented result |
| bus | `mdh:probe` answered by the content script; module loads before `content/main.js` |

## 3g. Completion code — `tests/phoenix.test.mjs`

Nine tests around the one comparison that ends a session:

| Case | Expected |
|---|---|
| shape | `PHX-` + six symbols, alphabet excludes I, L, O, 0, 1 |
| determinism | an injected random source yields the same code; real draws differ |
| matching | case, dashes and spaces forgiven; `7KQ2MDX`, `DONE`, empty and wrong codes rejected |
| prompt | the block shows the code, the exact JSON call, and says a sentence cannot finish |
| rejection | `[MDH_PHOENIX] … [/MDH_PHOENIX]`, names the code, says the task is still running |
| wiring | the module loads before prompt and agent; `finishAccepts` guards the completion path |
| schema | the `finish` tool advertises the field, so the model is told twice |
| reminders | every `reminder()` and `continuation()` accepts and prints the code |

## 4. Loop — deterministic parts

The agent's `_internals` are exported for exactly this. The cases that decide whether the product is safe:

- one call in, one result out; the result is a single bounded block
- the same call four times in fifteen minutes is refused on the fifth, and the model is told why
- a refusal never re-sends: it walks the ladder and stops
- a reload after a denial offers resume; it does not re-send the call
- a second tab cannot take the lease while the first is driving
- sixty turns, or three consecutive tool errors, ends the session with a stated reason

## 5. Release checklist — a human, one platform at a time

For each of the eight, in the two browsers the maintainer has:

1. Fresh chat, ask for a small task ("list `~/projects` and tell me the newest folder").
2. Accept the approval card; confirm the result appears in the chat and the popup counters move.
3. Deny a write; confirm the model is told and does not retry it verbatim.
4. Send two tasks back to back; confirm pacing held and no duplicate execution occurred.
5. Switch tabs mid-reply; confirm the hidden-tab timing still completes.
6. Reload the page mid-reply; confirm the turn is not executed twice.
7. Copy the log and check the stage names read sensibly.

Anything that fails becomes a fixture plus a test, or an adapter change — in that order.
