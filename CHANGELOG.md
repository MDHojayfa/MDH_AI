# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased] — v1.0.0

### Added
- Scope locked: Chrome 116+ · Brave · Firefox 140+ · Linux · 8 platforms · no API keys.
- Master plan, architecture with layer invariants, decision log (D1–D19), module specs 01–09.
- Final model-facing prompt and every message the extension itself sends (`docs/prompt/`).
- Interface contract: module signatures, storage keys, error codes, repository layout.
- Platform reference: hosts, stream signatures, selectors, pacing and timing profiles per site.
- Threat model with residual risk stated plainly; 5-layer test plan; adversarial self-review.
- Installer contract including a post-install `ping → pong` self-check and pinned extension identity.
- Second research pass: 18 repositories read at pinned commits; seven design changes forced by the
  evidence (governed sending + ladder, hidden-tab timing, turn-outcome vocabulary, 13 builtins,
  128/256/512 KB result budgets, countdown/pipeline/timestamp UI, no remote config in v1).
- End-user manual, FAQ, M8 platform-discovery playbook, contributing guide.

### Changed
- Builtin tool surface grows from 9 to 13 (`send_stdin`, `ask_user`, `update_plan`, `finish`), and
  `run_command` accepts batched commands and background sessions.
- Result truncation raised from 48 KB to 128 KB per result (256 KB per call, 512 KB on request).
- A hidden tab is treated as slow, not paused.
- Product README rewritten; credits reduced to original work plus the notice that must travel with any
  third-party code still present in the tree.

### Fixed
- Installer no longer assumes registration worked.
- A turn can no longer be answered twice after a reload.

## [0.1.0] — pre-v1 milestones

- M0 — plan, architecture, decisions, checkpoints.
- M0.5 — deep research pass; design revised; research archived in-repo for deletion at release.
