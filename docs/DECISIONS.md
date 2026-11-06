# Decisions

The choices that shaped the product, with the reasoning that made them. If you are about to change one of
these, read the entry first — most of them are load-bearing.

---

**D1 · Linux only in v1.**
The host is the only OS-specific layer, and "control the machine" on Linux means files, shell and the
X session — all reachable without a screen-recording permission. Windows and macOS are honest ports later,
not conditionals now.

**D2 · Native messaging, not a local HTTP server.**
A server on `127.0.0.1` is reachable by every page the user visits, needs port management, and is the
usual way this idea becomes a vulnerability. Native messaging makes the browser spawn the host and speak
over a pipe: no socket, no port, no discovery. The cost is one manifest file per browser, which
`install.sh` writes.

**D3 · Read the reply from the page's own network stream, not the DOM.**
The DOM shows what the site chose to display; the stream shows what the model produced. Reading the stream
also gives a reliable completion signal — the terminal frame — instead of guessing from a spinner. The DOM
is kept for the composer and the send button, where it is the only interface available.

**D4 · The page tap lives in the MAIN world; everything else is isolated.**
`fetch` can only be wrapped from the page's own JavaScript world, and the extension's API can only be
called from the isolated world. Putting each piece where it must live, and letting them meet only through
a namespaced `postMessage`, means page scripts cannot invoke the extension even if they know its name.

**D5 · The tap copies; it never proxies.**
A wrapper that changes the caller's promise, the response body or the timing is a bug report waiting to
happen. The tap clones the request, reads from the clone, and hands the page exactly what it asked for. If
the tap throws, the page never finds out.

**D6 · One tool call per message, in a JSON envelope.**
Agents in text-only chat have no function-calling channel, so the envelope *is* the API. One call per
message keeps the state machine honest: a result always maps to exactly one request, and a second call
cannot be half-executed. Two calls in one reply execute nothing and the model is told to send one.

**D7 · Coerce arguments in the parser; validate them again in the host.**
Models write `"limit": "20"` and mean the number. Schema-driven coercion makes that work. It stays
conservative — a string that is not a number stays a string — and the host validates before it touches the
filesystem, because the extension is not a trusted boundary.

**D8 · No API key, ever.**
The model is the web UI the user is already signed into. That is the product, not a shortcut: no billing,
no provider config, no key to leak, and the free tier is the user's own account.

**D9 · Plain scripts, one global namespace, no bundler.**
Manifest V2-style load order is enough for this codebase, and it means the browser runs exactly what the
repository contains — no build output to distrust, no toolchain to age out. Each module attaches to
`globalThis.MDH`; the manifest is the dependency graph.

**D10 · Eight platforms, one adapter each.**
ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen, GLM/z.ai, Grok. Each adapter is data: hosts, read mode,
network signature, selectors, pacing. When a site changes, one file changes and the other seven keep
working. Shared adapter logic would make every site's quirk everyone's problem.

**D11 · English interface and prompt in v1.**
Clear English instructions measurably reduce malformed calls with small models. Other languages are a
translation of the prompt and the UI strings, and they will come with their own testing rather than as a
half-checked setting.

**D12 · Three browsers, two artifacts.**
Chrome and Brave share an artifact and an extension ID. Firefox gets its own because Firefox has no
service worker in MV3 and no `chrome.debugger` — which is exactly why the biggest tools in this space
cannot run there. The build fails rather than emitting a manifest with the wrong background model.

**D13 · Governed sending and a refusal ladder.**
Free tiers punish bursts, and the account belongs to the user. Sends are spaced and capped; a refusal
stops the loop and walks a ladder — reload, wait longer, fresh chat, pause with a Resume card — instead of
retrying into a ban. When the site says no, the answer is patience, not speed.

**D14 · A hidden tab is slow, not paused.**
Browsers throttle timers in background tabs, so timers look dead while the page is fine. The read path
stretches its idle and stability windows in a hidden tab rather than pausing the work — pausing would make
"keep it in another tab" a lie.

**D15 · A small builtin set, then MCP.**
The builtins are the minimum a person needs to get work done on a Linux box: list, read, write, edit, run,
search, inspect, one GUI launch, plus three conversation-level tools. Everything else — databases, git,
browser control, GUI automation — is better served by the MCP servers the user already runs than by a
reinvented tool inside this repository.

**D16 · Writes and commands ask; reads may be pre-approved.**
Reading a file inside the allowlist is cheap to allow. Writing and executing are not, so they default to
`ask` — and a command asks even if a policy file says otherwise, because a command can do anything with
one call.

**D17 · Two path guards, written twice on purpose.**
The extension performs a fast lexical check so the card can explain itself; the host resolves symlinks and
checks again before it opens anything. Different code, different failure modes: a bug in one is not
automatically a way past the other.

**D18 · The host is spawned, never installed as a daemon.**
It exists while a browser port is open. Nothing to start at boot, nothing listening, nothing to remember
to kill. 24/7 operation is the browser's job, not a background service's.

**D19 · Audit by hash chain, summarised.**
Every call appends a line with tool, a summary of arguments, status, duration and a chained hash. It
answers "what ran" and reveals a silent edit. It never stores file contents, because the log must not
become the leak.

**D20 · Container mode is optional, not the default.**
Rootless podman with `--network=none` is the right answer for running untrusted commands, and the wrong
default for a tool whose job is to operate the user's actual machine. Available in config, off by default.

**D21 · One driver tab holds a lease.**
Two tabs on the same platform would race the same session: duplicated sends, crossed replies, two answers
to one turn. The first tab that starts a session holds a lease; the rest observe and say so.

**D22 · Credit is part of the product: the GitHub profile opens once, on first run.**
The extension opens `https://github.com/MDHojayfa` once — on install, or on the first page handshake — and
the popup footer links the profile and the site permanently. This is deliberate: the work has an author
and the author has a profile. It is one navigation the user can close, not telemetry; nothing about the
user is sent.

GitHub has **no URL that follows an account**. The endpoint (`POST /users/follow?target=…`) was retired
years ago and always needed a session and a CSRF token, and YouTube's `?sub_confirmation=1` has no GitHub
equivalent. A "follow" that happened silently from a redirect would be a dark pattern anyway, so the
product does the honest version: open the profile, put the button one click away, and say so.

**D23 · One copyright: MDHojayfa, MIT.**
No third-party notice, no upstream credit line, no borrowed header comment. Every file in this repository
was written for this repository. If that ever changes, the licence and `CREDITS.md` change in the same
commit — and until then, there is nothing else to attribute.

**D26 · The landing page is one file, and the release needs no dependencies.**
`site/index.html` is a single static file with inline CSS and three JSON-LD blocks; its social card is
drawn by `tools/make-og.mjs` with the same PNG writer as the icons. `tools/package.mjs` writes both store
ZIPs with `node:zlib` alone. The reason is the same in both cases: a product whose pitch is "two commands
and no accounts" cannot have a release process that requires a package manager, a design tool or a cloud
service. Everything the project ships can be rebuilt offline by anyone with Node.

**D25 · Humour is labelled, and never carries a status.**
A tool that waits a lot needs to look alive, and a 90-second silence reads as a crash. So the waiting
state shows one real sentence plus one rotating joke, and the popup's BARBOS MODE log tags every real
event `sys`/`host` and every joke with a planet. Three rules are enforced by tests rather than good
intentions: no joke may claim a success, mention the user's data, or reference credentials or the audit
log. `--no-fun` turns it off entirely. A joke that can be mistaken for a progress report is a bug with a
punchline.

**D24 · No remote configuration.**
The extension never fetches a config, a selector list, an update manifest or a font. A site change is a new
release, reviewed like any other code. Remote config is a backdoor with a friendly name.

**D27 · The help desk is part of the interface, and the jokes live somewhere else.**
A product that cannot be fully tested — this one is written on one laptop against eight websites that ship
on their own schedule — has an obligation to make reporting trivial. So the popup's first element is an
issue line and two real buttons, the failure card carries the same form next to the actual error, and every
run shows a different line from a pool of twenty. That pool is deliberately **separate** from the mission
corpus: a user asking for help must never be answered with a punchline, and a punchline must never look like
an error. The pre-filled body is limited to stage, platform and browser; paths and URLs are redacted before
the URL is built, because a public form is not the place to discover what else the extension knows.

**D28 · Ask once, then stay quiet. Share links are honest about their limits.**
The share sheet opens automatically on the first run of a profile and never again; afterwards it is a button.
The flag lives in `mdh:settings.sharePrompted`, next to the other settings, so the promise survives reloads.
Eight of the ten destinations have a real web intent that pre-fills the text. Instagram and TikTok do not —
there is no URL that opens their composer with a caption — so the sheet copies the link first and opens the
site, and says so. Faking a share endpoint would produce a button that appears to work and silently does
nothing, which is worse than a button that explains itself.

**D29 · Publishing the verification ladder is a feature, not a disclaimer.**
`docs/KNOWN-LIMITS.md` separates "covered by a test" from "seen once, by hand" from "never executed". The
reason is practical: without it, every bug report starts with a negotiation about whether the product is
broken or the expectation was. With it, a reporter can point at a row, and a maintainer can turn that row into
a fixture. A one-person project cannot buy coverage, but it can be precise about what it lacks — and precision
is what makes a stranger's two-minute report worth reading.

**D30 · A crash gets a card with the form, not a tab that steals focus.**
The request was to redirect to the issue page on failure. A browser will not let an extension open a tab from
a background event without a user gesture — `window.open` in that path is blocked, silently, in Chrome and in
Firefox. Shipping a redirect that mostly fails would be worse than shipping nothing, because the user would
learn the help button does not work. So the crash produces a card inside the page, next to the real error,
with **Open an issue** (one click, real gesture, pre-filled) and **Copy log**, and the popup's strip promotes
itself after a failure. Same destination, one honest click, and the error text stays on screen instead of
being replaced by a GitHub tab the user did not ask for.

**D31 · The popup's markup is tested like code.**
A popup is invisible until it is broken: an id typo, an inline handler that MV3 refuses to run, an unbalanced
`<div>` that swallows the share sheet, a share button with no destination. None of those would fail a unit
test of the logic behind them, and all of them ship a blank or half-dead popup. `tests/popup.test.mjs` checks
the things a browser would have told us if this project had a browser in CI: every looked-up id exists, no
inline handlers, nothing loaded from the network, tags balanced, the sheet has an Escape key and returns
focus, the issue strip comes before the controls, and no line promises a feature that is not there.

**D32 · The humour switch is in the product, not only in the installer.**
`--no-fun` silenced the shell, which is where the developer works, not where the user works. The popup now has
`Advanced → Mission chatter → hide the jokes`, stored as `mdh:settings.funOff`, and it hides exactly two
things: the ticker and BARBOS MODE. Everything that carries information — status, history, the issue strip, the
share sheet, failure cards — ignores the switch, and a test asserts that the strip and the sheet are not
descendants of the elements the switch hides. Humour that cannot be turned off is a defect; help that can be
turned off by accident is a worse one.

**D33 · The control lives on the composer, and the popup becomes the settings drawer.**
The popup closes the instant you click into the page, which is the exact moment you want to watch a task. So
the primary control is a small pill anchored above the composer of whichever chat you are on: click to start,
click to pause, click to continue, drag it if the layout is in the way. It lives in a shadow root because all
eight platforms ship global CSS that would otherwise re-style it into uselessness on exactly one of them. The
popup still does everything — this is an addition, not a replacement.

**D34 · A report is built locally, reviewed by the user, and submitted by GitHub.**
The request was "fill the issue with everything, then don't send it until the user confirms". That is exactly
what happens: the card builds the body in the page, shows it in a `<details>` before anything is opened, and
then opens GitHub's pre-filled form. There is no code path that posts anything anywhere, so "the user
confirmed" is not a promise the extension makes about itself — it is GitHub's own Submit button.

**D35 · The loopback log viewer is the one listening socket, and it is worth the exception.**
An audit log written in JSONL is a file for a machine. A person at 11 pm needs a page: totals, percentiles,
the newest calls first, and the last failure with its hypotheses. So `mdh-log` renders one, and can serve it
live. The exception is bounded on purpose: opt-in per click, `127.0.0.1` only, a per-process 32-byte token
compared with `timingSafeEqual`, a `404` (not `403`) for anything unauthorised, no CORS headers, no write
endpoint, and a page whose CSP is `default-src 'none'`. `docs/SECURITY.md` C1b states the risk in the same
breath as the mitigation.

**D36 · Diagnostics are not tools, and the IP is not a default.**
The host can measure the machine and, on request, ask one allowlisted endpoint what address the internet sees.
None of that is in the tool catalogue: the model gets file access, and it must not be able to ask "what is
this user's IP" — a prompt that can ask for a fact can exfiltrate it. The address is behind a checkbox that
starts unticked, is used once, and is never stored. The report says `not included (the user chose not to send
it)` when it is absent, because "no IP" and "we forgot" are different reports.

**D37 · The signature table is the product's memory of its own support inbox.**
Every entry in `core/diag.js` came from a class of failure that already cost somebody an evening: a Cloudflare
ban that looked like a broken selector, a rate limit that looked like a crash, a clock skew that looked like a
TLS bug, an MTU that looked like a flaky provider. The table is ordered, testable, and every row has an action.
It is also labelled as hypotheses in every surface that shows it, because a confident wrong answer is more
expensive than an honest guess.

**D38 · The pill floats; it does not live inside the composer.**
Extensions in this space usually insert a bar *into* the composer's layout slots, and that is a standing bug:
when one of the eight sites renames a slot, the bar falls into whatever container still matches, and because it
is a flex child of the composer it can squeeze the textarea to zero width — the page still loads, the input is
simply gone. This product's pill is `position: fixed`, appended to `documentElement`, and never touches the
composer's DOM or its styles. It is anchored by *measurement* (the composer's bounding rect, re-read on resize
and scroll) instead of by *structure*, so a redesign moves it rather than breaking it, and the worst case is a
pill in a silly place rather than an unusable page. When the composer disappears entirely, the pill drops to
the corner and reports the drift instead of guessing.

**D39 · Reporting is a two-way deal, and the deal is written down.**
The product asks people to spend two minutes on a report instead of closing the tab and living with the bug.
Asking that for free is how a tracker stays empty. So the ask is explicit: **if your report leads to a fix, or
your idea ships, your GitHub handle goes into `CREDITS.md`'s community section** — one line, permanently, with
an anonymous option. The bug form and the idea form both carry the field, the popup's strip carries the
promise, and `CREDITS.md` carries an empty section waiting for the first entry. An empty promise would be worse
than no promise, so the section exists before the names do.

**D40 · Text is not an action: a task ends with `finish`.**
The first real bug report about the loop was "it worked once, then it stopped and I had to press Start again".
The cause was a prose reply being read as a completed task. The fix is a protocol, not a patch: `finish` is the
only completion signal, a prose-only reply gets two automatic nudges with the exact reply shape, and after the
second nudge the loop **pauses** — visibly, with Continue / Mark as finished / Stop / Report, the pending call
still saved, and a purple pill that says Continue. Silence is never an outcome the user has to interpret.

**D41 · Network advice must survive being half right.**
"Try a phone hotspot" is the standard advice and it is unreliable: carriers serve different addresses per
region and rotate them. A hotspot that works proves the address matters; it does not prove the product is
fixed, and a hotspot that fails proves almost nothing. The signature table now says "another Wi-Fi first, then
a hotspot, and treat the result as a hint" — and a test asserts that the hedge stays in the text.

**D42 · A session ends with a code, not with a sentence.**
The Phoenix code (`PHX-XXXXXX`, `src/core/phoenix.js`) is the only completion signal. Reasons, in order of how
much they cost:

1. **Prose is ambiguous by construction.** "Done", "next I would…", "all set" are indistinguishable to a parser
   and mean three different things. A regex that guesses is a bug with a comment on top.
2. **A `finish` tool alone is not enough either**, because a model that is tired, truncated or confused will
   emit the tool call without having finished. A per-session code has to be *retrieved* rather than guessed.
3. **The vendor cannot help.** `stop_reason` / `finish_reason` describe one generation, not a task that spans
   twenty turns. Every serious loop ends on its own checkable state; this is ours.

Practicalities that matter: the code is 6 characters from a 32-symbol alphabet with no `I/L/O/0/1` (about 888
million values, so collisions are not a thing), matching tolerates case, dashes and spaces but **not** extra
characters, it is regenerated per session but reused across Resume, it appears in the prompt, in every
reminder, in the `finish` tool description, and in the popup's Advanced panel — a rule nobody can see is a rule
nobody can debug. A wrong or missing code gets **one** correction, then a pause with *Mark as finished*, because
at that point the model has failed the rule and the human should decide.

**D47 · Plan mode is an allowlist, not a prompt.**
Telling a model "please investigate first" is a wish. Plan mode instead refuses every tool that is not on a short
read-only list, in the agent, before the host is called — and the refusal message tells the model what to do
instead (`propose_plan`). An allowlist rather than a denylist because the dangerous tool is usually the one nobody
thought about yet: an MCP server someone added last week should be assumed to write until proven otherwise.

**D51 · The pill announces itself, and cards give focus back.**
The pill is a control that changes without moving focus, which is exactly the case a live region exists for: a
polite `role="status"` node, in the shadow root from the first paint, filled with the pill's own label and only
when the phase changes. Not `assertive` — a phase change is status, not an emergency — and not the turn counter,
because "turn 12" is noise that trains people to ignore the one that matters. Cards take focus on open (their
primary action, or themselves when there is none) and return it on close, because a card that appears silently is
a card a keyboard user will not find, and one that vanishes silently drops them at the top of the page. Both are
small; both were missing.

**D50 · A checkpoint beside the chain, because a hash chain cannot see its own tail.**
Every link can be perfect and the last ten entries still be gone — deleting from the end never breaks a link
(Bellare & Yee 1997; Ma & Tsudik 2008 call it the truncation attack). `verifyAudit()` used to call that `ok`,
including when the file had been removed entirely. Now a small side file records how many entries the log had,
what it ended with, and — the important one — a cumulative `lost` count, because the obvious bypass is to delete
the tail and let one more call through, which would otherwise reset the total to something innocent. Archiving
writes a fresh checkpoint, since a chain put aside on purpose has lost nothing. A corrupt or missing checkpoint is
treated as no opinion rather than a broken chain: the chain is the record, the checkpoint is a smoke alarm. It
does not stop an attacker with write access to both files, and the docs say that instead of implying otherwise.

**D49 · The audit records who allowed a call, because `ok` is not a decision.**
`gate()` used to answer `'once'` both when the policy allowed a call without asking and when a person clicked
*Allow once*. The host then wrote `status: ok`, which is true and useless: reading the log you could not tell a
call the rules permitted from one a human authorised, and the approval card's value is exactly that difference.
Now a policy allow returns `auto`, and every decision maps to a name that travels with the frame (`via`) into the
audit entry, inside the hash. The host sanitises the value to lowercase words and colons, 24 characters, and
records anything else as `other` rather than dropping it — an unrecognised fact is still a fact. This is the
"who approved or denied it" line from the approval-gate talk and the complete-mediation point from OWASP LLM06,
written down where it can be checked rather than asserted.

**D48 · The terminal gets the same grouping as the page, by calling the same function.**
`mdh-log --runs` and `--run <id>` are the page's run view without a browser, and they import `groupRuns()` from
the viewer instead of re-deriving runs from timestamps in a second place. Two implementations of "what is a run"
would drift, and the drift would show up as a support question about which one is lying. The only difference is
the shape of the timestamp: audit lines carry ISO strings, `stateSnapshot()` normalises to epoch ms, so the
grouping accepts both rather than guessing which caller it has. An unknown run id exits 1 with a sentence —
a CLI that prints an empty table for a run it cannot find is a CLI that says "nothing happened" about work that
did.

**D46 · A run id, because a log is not a story until something groups it.**
Every call carries `run` — ten hex characters minted when the run starts — into the host frame, into the audit
entry, and therefore into the hash. The log page groups by it, so "show me everything that run did" is a URL
(`?run=…`) instead of an exercise in reading timestamps. Entries written before the field existed are grouped
under *earlier calls* rather than back-filled by guesswork: a log that invents its own history is worse than one
with a gap in it.

**D45 · Three scopes, because "always" is three different promises.**
A single *Always* button forces the user to mean the longest-lived thing every time. The approval card now offers
one safe answer (**Allow once**) and a caret with the rest: **for this run** (memory, dies with the task),
**for this session** (stored with a boot id, so a browser restart ends it by construction), **always on this site**
(stored per chat hostname, listed in the popup with a ✕). All three are still restricted to an exact single
command, and all three run *after* the policy check, so none of them can widen a rule. The menu exists because
the alternative — a row of four equally loud buttons — teaches people to click the leftmost one.

**D44 · Approval fatigue is a safety bug, so grants are narrow and forgetful.**
A prompt you see twenty times is a prompt you stop reading — that is how a guardrail becomes a formality. The
answer is not a quieter lock but fewer, better-earned questions: after the **same exact** command has been
approved twice in one run, the card offers *Allow for this run*. It is scoped to the run (cleared on Start,
never written to storage), keyed on tool + folder + normalised command text, and refused for anything containing
`; & | < > $ \` ( ) { } [ ] * ? ! # ~ \` — i.e. everything that can hide a second command. `run_command` still
asks even when a tool is set to "always"; the grant shortens the conversation, it does not touch the policy.

**D43 · Sentinels are a convention you enforce, not a feature you hope for.**
No vendor documents a canonical completion sentinel, and stop sequences solve a different problem (they cut a
generation, not a loop). The pattern is only worth anything if the pipeline checks it on the consuming side —
which is exactly what `finishAccepts()` does, in one place, with one comparison, and a test that asserts a wrong
code can never reach the completion path.
