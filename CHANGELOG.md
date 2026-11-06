# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [1.0.0] — 2026-11-06

First release. One script, one extension, eight platforms, no API key.

### Added

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
- **117 tests**, a build that fails on manifest invariants, and `web-ext lint` at zero errors.

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
