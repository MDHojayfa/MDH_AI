# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [1.0.0] — 2026-11-06

First release. One script, one extension, eight platforms, no API key.

**What ships:** 300 tests · `release/mdh-ai-{chrome,firefox}-1.0.0.zip` · 0 runtime dependencies ·
`docs/RELEASE.md` is the checklist that was followed.

### Added

- **`npm run live-check`: the check that uses a real browser.** Nothing in `tests/` runs inside Chrome — a `vm`
  context is not a browser, and four things (service worker registration, `connectNative`, shadow-DOM layout, and
  the pill's position above a live composer) can only be checked in one. `tools/live-check.mjs` drives the browser
  you already have over the DevTools protocol with no npm packages: it loads `dist/chrome`, waits for the worker,
  pings the real native host, and — with `--page` — checks that `#mdh-dock` mounted with a `.pill` in its shadow
  root. `--click` presses Start. It is not part of `npm test`: a suite that needs a browser and a signed-in account
  is a suite people learn to skip.
- **`docs/VERIFICATION.md` says what is proven and what is not.** A table mapping each README claim to the test
  that backs it, the six browser-only checks with the command for each, and a plain list of what has never been
  done: no browser has run this repository's tests, the eight adapters have never been fired at the eight live
  sites from here, no store has reviewed it, and Firefox is built but never driven.
- **The author's name is in every file, and a test keeps it there.** 90 source files open with one line; the build
  writes it into every emitted script, the host answers with `by` in its `pong`, and `tools/package.mjs` puts it in
  the zip comment, where `unzip -z` prints it. `npm run stamp` adds a missing line, `npm run stamp --check` fails
  the build without one, and `tests/credit.test.mjs` runs the same audit. MIT still permits a fork; the trail means
  a fork cannot be a *silent* one. See `docs/PROVENANCE.md`.
- **The landing page carries the same art, from its own folder.** `npm run art` now also writes `site/hero.gif`
  (760 px, 88 KB), `site/approval-card.png` and `site/og.png`, so the page never requests an image from another
  host. The loop sits under the headline with a caption saying what it is, and the approval card's copy on the page
  lists all three lifetimes instead of only the session.
- **The link preview was the wrong shape.** `assets/social.png` was 1200×605 — resized to fit the width and then
  asked to crop to a 630-tall box it could not fill — so every scraper re-cropped it from wherever it liked. It is
  generated at exactly 1200×630 now, and both art tests and the site test check the size.
- **`npm run verify` works from a clean checkout.** It weighed the source before building the zip, so the
  README's KB quote had nothing to compare against and the whole run failed with "A budget is broken". The order
  is now build → package → weigh → test, and an unbuilt bundle is reported as unmeasured rather than over budget.
- **One version, in every place it is shown** — manifest, package.json, three host modules, the MCP client
  handshake and the site; `tests/version.test.mjs` fails the build when any of them drifts, because a bug report
  that quotes a version the artifact does not have costs an hour of everyone's time.
- **CI is green again.** `tools/package.mjs` ran its packager on import, so the test that imports `makeZip` failed
  on any machine without a `dist/` — which is every fresh clone and every CI run. The packager is now guarded like
  the other tools, and a test proves an import writes no zip.
- **A README with something to look at**: a five-frame loop of the pill (Start → Working → approval → Paused →
  Done), a terminal loop of the install and `mdh-log --runs`, and a still of the approval card. All three are
  drawn by `npm run art` (`tools/make-readme-art.mjs`) from the real labels and buttons, and every frame says
  *illustration, not a recording* — the store-screenshot rule in `docs/MEDIA.md` is unchanged.

- **The pill is audible.** Its phase changes are announced through a polite live region — the same word the pill
  shows, once per change — and cards move focus to their primary action on open and hand it back on close. A
  control you have to look at to understand is a control some people cannot use.
- **The log now notices when its end has been deleted.** A hash chain cannot see its own tail — remove the last
  ten lines and every remaining link still verifies. A checkpoint beside the chain (`{lines, lost, lastHash}`)
  fixes the honest cases: a shorter file, a deleted file, and a tail replaced by new entries are each reported
  with a count, and the page prints *"N entries missing from the end"* instead of a badge reading `verified`.
  Archiving resets the count. It is not tamper-proofing against someone who can write both files, and the docs
  say so.
- **Every audit entry says who allowed the call**: `auto` (the policy allowed it, nobody was asked), `approval`
  (a person clicked *Allow once*), `grant:run` / `grant:session` / `grant:site` (a remembered approval answered,
  scope named) or `always-allow`. Previously a policy allow and a click both came back as `once`, which meant a
  log could say a call happened but not whether a human had ever seen it. The field is sanitised by the host,
  recorded inside the chain hash, shown on every row of the log page and printed by `mdh-log --run <id>`.
- **`docs/RESEARCH.md`**: a research log with the sources behind the v1 safety story — Saltzer & Schroeder (1975),
  Bishop's *Computer Science* ch. 13, OWASP LLM06:2025, WAI-ARIA / WCAG 4.1.3, Bellare & Yee via Ma & Tsudik, two
  conference talks, and Cline's auto-approve docs — each entry saying what it changed or why it did not.
- **`mdh-log --runs` and `mdh-log --run <id>`** print the log page's run view to the terminal — one line per
  run (id, calls, failures, first→last, tools), or every call of one run in order. Same grouping as the page,
  because both call the same function; a run that is not in the audit exits 1 with a sentence.
- **`mdh-log --watch [sec]`** re-renders the snapshot on a timer for people who would rather not open a socket;
  **a finish card** with the summary, turn count, elapsed time, *Run again* and *Report a problem*; and a
  per-site **Hide the pill** switch (in the pill's panel, restored from the popup).
- **Log page controls**: `ok`/`denied`/`error` and `debug`/`info`/`warn`/`error` filters, free-text filter,
  *Hide log* / *Show log*, and **Archive & clear** — a confirm card over a token-bound POST that renames the
  chain and starts a fresh one instead of deleting anything. No script; one CSP relaxation for the form.
- **A completion code ("phoenix")**: every session gets `PHX-XXXXXX`, and only a `finish` call carrying it ends
  a task. A wrong or missing code gets one correction, then a pause with *Mark as finished*. Printed in the
  prompt, every reminder, the tool schema and the popup's Advanced panel.
- **Notes for every run**: up to 1,200 characters of your own instructions (package manager, Python name,
  folders to leave alone) sent at the top of every task — the `CLAUDE.md` idea without a file to remember.
  Saved on blur, stored locally, quoted verbatim.
- **Copy handoff**: a pause card button that copies a short, useful continuation prompt — task, plan, the last
  three real results, next step, the completion code — so a stuck run can move to another chat by hand today.
- **The numbers behind "lightweight"**: `npm run weigh` measures the extension, the host's startup and memory,
  and the dependency count — and fails the build when a budget is crossed. 140 KB zipped · 51 ms to ready ·
  55 MB resident · **0 npm dependencies**. `docs/WHY.md` is the honest comparison against API-key agents, CLI
  coding agents and self-hosted gateways, including the things they do better.
- **`docs/V2-NOTES.md`**: platform rotation (three chat URLs, a handoff prompt, evidence-based triggers, hard
  caps) and a messaging bridge — written up with their failure modes, explicitly not promised.
- **Fewer lame comments**: the ones that survive are about consequences (a 0-width composer, a page that
  notices it is watched), not about vibes.
- **The allow drop-down**: one big *Allow once*, plus a caret offering *for this run*, *for this session* (ends
  when the browser restarts, by boot stamp) and *always on this site* (listed in the popup with a ✕). Still one
  exact command, still after the policy check — the menu exists because four loud buttons teach people to click
  the leftmost one.
- **The plug, written down**: [`docs/PLUG.md`](docs/PLUG.md) — the code, the exact call, the five outcomes, and
  why "done" cannot be a keyword. The prompt now defines the plug in one sentence before any rule.
- **The log filters say what they are doing**: every box is independent (two statuses, one level, none at all),
  each carries a count, and the page states whether it is filtering or showing everything — with a one-click
  *Show all*.: approve the same exact command twice and the approval card stops bothering you for
  the rest of the run. Run-scoped, never saved, refused for anything with `&&`, pipes, redirects, `$(…)`,
  backticks, globs or `~` — approval fatigue is a safety bug, not a convenience target.
- **The build checks the prose**: `npm run weigh` now compares the KB figures quoted in the README, WHY and MANUAL
  with the zip it just measured, and fails when they drift. Claims that are not enforced become folklore.
- **Plan first**: an optional read-only start. The loop allows only look-around tools until the model proposes a
  plan and you press *Approve and continue* — enforced as an allowlist in the agent, so a new tool cannot quietly
  gain write access to a plan-mode run.
- **Skills (playbooks)**: write `## build` / `## deploy` blocks in the popup; the model sees the *names* and opens
  a body with `read_skill` only when it needs one. No folder, no `~/.config` edit, no context cost until used.
- **Failure hints**: a known host error (path denied, missing file, timeout, denied call, no host) now carries one
  line telling the model what to do next, appended below the untouched error text.
- **"Why is the pill like that?"**: the pill's tooltip and `aria-label` carry the phase, the turn and the reason a
  run paused — the same sentence the card would give you, without opening it.
- **Session replay in the log**: every row opens to its record (arguments, full hash, run id), and selecting a run
  shows it end to end — start, end, tools, failures, and the sequence in order. Still no script: `<details>` is HTML.
- **Runs in the log**: every call now carries the run that made it, and the log page groups them — id, calls,
  failures, one click to `?run=…`. The id is inside the audit hash, so it cannot be edited after the fact.
- **Layout watch**: the page probes its own adapter after it loads and remembers the verdict per site. **Only a
  regression is announced** (worked last visit, broken now), and the popup shows *Last page check* with the time —
  so "the site changed" can be told apart from "the model is being difficult" at a glance.
- **"Check this page"**: the popup runs the platform adapter's own selectors against the live DOM and says what
  matched, so a renamed composer stops looking like a mysterious silence. Missing send/stop buttons are drawn as
  hints, never failures — they only exist at certain moments.
- **It can tell you why it stopped**: every finished, stopped or paused run is recorded (turns, elapsed,
  outcome, reason, code) and the popup shows the last one. A stalled run on a background tab now says so, because
  browsers throttle timers there and a healthy run can look frozen.
- **A deal, not an ask**: every report form asks for a GitHub handle and promises a line in `CREDITS.md`'s
  community section when the report leads to a fix or the idea ships (anonymous accepted). The failure card
  carries **Send an idea ↗**; the popup strip carries the promise on every normal run and a nudge after a
  failure.
- **Continuity protocol**: text no longer ends a task. A prose-only reply gets two nudges, then the loop
  **pauses** with Continue / Mark as finished / Stop / Report. `finish` is the only completion signal, and the
  pill shows Sending / Waiting / Working / Paused / Done.
- **Network advice that survives being half right**: another Wi-Fi first, then a hotspot, and a hotspot result
  is a hint rather than proof.
- **A control on the composer** (`src/core/dock.js`): a shadow-DOM pill anchored above the chat box — start,
  pause, continue, drag, remembered task and position. The popup is now the settings drawer rather than the
  only way in.
- **Diagnostics that explain, not just describe** (`src/core/diag.js`): 13 ranked failure signatures with
  what/why/fix, a measured clock-skew rule, redaction of paths, emails and foreign URLs, and a report body that
  leads with hypotheses before facts.
- **Machine facts from the host** (`host/diag.mjs`): kernel, node, load, RAM, disk, interfaces, tunnels, MTU —
  read from Node APIs and `/proc`/`/sys`, never from a shell. `probe` targets are an explicit nine-entry
  allowlist and the frames are **not** in the model's tool catalogue.
- **A local log page** (`host/viewer.mjs`, `host/mdh-log.mjs`, `mdh-log` wrapper): self-contained HTML, no
  script, totals and p50/p95 per tool, newest calls first with chain hashes, last failure with hypotheses.
  `--serve` binds `127.0.0.1` only and gates on a per-process token.
- **A failure card you can read and audit**: real error, top hypothesis with its fix, a collapsed "what will be
  sent" preview, Open issue with report, Copy report, Log viewer, Copy log, and a public-IP checkbox that
  starts unticked.
- **`docs/SCENARIOS.md`** — ten real failure classes walked through end to end, from the blocked IP to the
  filled disk, with the exact card and the next action.
- **`./install.sh --diagnose`** — prints the machine facts a report would carry, for pasting, with the IP
  explicitly left out, plus a CI job that proves `mdh-log` and the probe layer still run.
- **Live viewer refresh** via `<meta http-equiv="refresh">`, so the served page updates without a single line
  of script; the saved snapshot deliberately does not refresh itself.
- **Save .md** on the failure card, for people who would rather attach a file than open a tab.
- **`docs/DIAGNOSTICS.md`** — every field, every exclusion, the signature table and the three honest limits.
- **Eight platform adapters** — ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen, GLM/z.ai, Grok — each a
  small data file: hosts, read mode, network signature, composer and send selectors, pacing, timing.
- **Three read modes** in one interceptor: SSE with a terminal-frame check, byte-framed binary with brace
  depth scanning, and whole-body for Gemini's RPC.
- **MAIN-world tap** on `fetch`, XHR and WebSocket that copies a reply without altering what the page
  receives, re-injection safe, and degrades to DOM reading rather than breaking the page.
- **Agent loop** with a send governor, warm-up/idle/stable reply windows, a hidden-tab profile, a
  three-step refusal ladder ending in a paused state with Resume, one-answer-per-turn marking, call
  deduplication, and hard limits on turns and consecutive tool errors.
- **Parser** that takes the last closed fence, repairs almost-JSON, coerces arguments by schema,
  distinguishes unclosed from unreadable from foreign markup, and never quotes a foreign tool marker back
  at the model.
- **Prompt renderer** with a token budget that names any tools it had to omit, a per-turn reminder, and a
  first-message wrapper that keeps the user's text verbatim.
- **Native-messaging host** (`host/`) with 32-bit little-endian framing, thirteen builtin Linux tools, an
  MCP stdio client, a canonical path guard, and a hash-chained audit log.
- **A mission log** (`src/core/fun.js`): a rotating, clearly-tagged space-programme line while a reply is
  pending (*contacting the aliens on the Moon*, *taking data from Mars*, *laser weapon on Pluto*), a
  `BARBOS MODE` boot-log panel in the popup where real events are `sys`/`host`, and a mission log in
  `install.sh` — with `--no-fun` and `--barbos` flags. Three rules are enforced by tests: no joke claims a
  success, mentions user data, or touches credentials.
- **Approval card** built from the parsed request only — Deny / Allow once / Always (this session) — with
  a 120 s timeout that means deny.
- **Popup** with a four-stage pipeline strip, session counters, history, advanced policy controls, log
  copy and retry.
- **First run** opens the author's GitHub profile once (`background/welcomeOnce`), with the profile and
  site linked in the popup footer. No auto-follow: GitHub has no URL for it and faking one would be a
  dark pattern.
- **A 1,365-line mission corpus** (`src/core/fun-corpus.js`): Moon aliens, Mars latency, a polite missile to
  Jupiter, a laser on Pluto nobody authorised, and the machines that left and never wrote back. Merged
  round-robin so consecutive lines come from different places, with a test that stops a joke from claiming a
  success or hinting at a credential.
- **`tools/package.mjs`** — both store-ready ZIPs written with `node:zlib` alone, so the release step needs
  no `zip`, no `7z` and no Python. **`site/`** — a one-file landing page plus a generated 1200×640 social
  card drawn in arithmetic. **CI** — tests on Node 20 and 22, build + lint + package, and a real host
  self-check, with nothing to `npm install`.
- **`install.sh`** that finds every installed browser, writes the host manifests with the pinned extension
  ID, builds both artifacts, and finishes with a live ping/pong self-check. `--dry-run` and `--uninstall`
  included.
- **A help desk in the UI** (`src/core/report.js`): twenty issue lines, twelve share lines, a bug-form and
  idea-form URL builder that pre-fills stage, platform and browser while redacting paths and URLs, and share
  endpoints for ten destinations. The popup shows an issue line first on every run, with **Report a bug**,
  **Send an idea** and **Share** buttons; a failed loop opens the same form in a card inside the page.
- **The share sheet**, opened automatically once per profile and available as a permanent button after that,
  with copy-to-clipboard and a native share fallback on browsers that have one. Instagram and TikTok are
  labelled honestly: neither has a web intent, so the sheet copies the link first.
- **`docs/KNOWN-LIMITS.md`** — an explicit verification ladder (automated / by hand once / never) so "it
  works" can be checked rather than believed.
- **A popup that cannot break quietly** — ids, CSP, tag balance, share wiring, dialog focus and copy are all
  tested, because CI here has no browser to notice a blank popup.
- **A mission patch per release** in `site/index.html`: inline SVG, drawn by hand, eight stars for eight
  platforms and a prompt in the middle. No stock art, no borrowed logo, nothing fetched.
- **`docs/MEDIA.md`** — the six screenshots worth taking, their alt text, store copy for Chrome/Brave and
  Firefox, the permission justification table a reviewer asks for, and a list of claims not to publish.
- **A runtime switch for the chatter** (`Advanced → Mission chatter`) that persists per profile and hides
  only the jokes — the issue strip, the share button and every real status line stay put.
- **300 tests**, a build that fails on manifest invariants, and `web-ext lint` at zero errors.

### Security

- No listening socket anywhere: the browser spawns the host and speaks over a pipe.
- Two independent path guards; symlinks resolved in the host before a file is opened.
- `~/.ssh`, `~/.gnupg`, `~/.aws`, keyrings and browser profiles denied by name.
- No remote code, no remote config, no telemetry, no fonts from a CDN.
- Audit log summarises arguments and never stores file contents.

### Known limits

- Linux only; Windows and macOS are not in this release.
- A chat tab must stay open while a task runs.
- Free-tier rate limits are real, and the tool waits rather than working around them.

## [0.1.0] — internal

Scaffolding, design and unit tests. Never released.
