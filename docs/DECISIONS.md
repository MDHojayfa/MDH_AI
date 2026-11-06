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

**D15 · Thirteen builtins, then MCP.**
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
