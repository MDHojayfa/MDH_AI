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
- **Approval card** built from the parsed request only — Deny / Allow once / Always (this session) — with
  a 120 s timeout that means deny.
- **Popup** with a four-stage pipeline strip, session counters, history, advanced policy controls, log
  copy and retry.
- **First run** opens the author's GitHub profile once (`background/welcomeOnce`), with the profile and
  site linked in the popup footer. No auto-follow: GitHub has no URL for it and faking one would be a
  dark pattern.
- **`install.sh`** that finds every installed browser, writes the host manifests with the pinned extension
  ID, builds both artifacts, and finishes with a live ping/pong self-check. `--dry-run` and `--uninstall`
  included.
- **48 tests**, a build that fails on manifest invariants, and `web-ext lint` at zero errors.

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
