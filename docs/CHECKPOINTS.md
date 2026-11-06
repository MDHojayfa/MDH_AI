# Checkpoints

A checkpoint is a commit + an entry here. They exist so a long run can be paused or handed over
without losing the thread. Each entry records: what is done, what is deliberately left, and what the
next action is.

---

## CP-000 · 2026-11-06 · base imported (superseded)
`d708d75` — MIT base in `app/`, English prompt, tests green, scaffolding.
Kept only as reference until M10.

## CP-001 · 2026-11-06 · Firefox build proven
`88a2af1` — `dist/{chrome,firefox}`, compat shim, `web-ext lint` 0 errors, upstream trailing-comma bug fixed.

## CP-002 · 2026-11-06 · research closed
`MDH_work/Research/00–06` (outside the repo): 15 repos cloned and read, Firefox API matrix verified
against MDN compat data v8.1.8.

## CP-003 · 2026-11-06 · plan locked
`docs/PLAN.md` · `docs/ARCHITECTURE.md` · `docs/DECISIONS.md` · `docs/specs/**` · `docs/PLATFORMS.md`
· `docs/SECURITY.md` · `docs/TESTPLAN.md`

**Done:** scope locked (Chrome/Brave/Firefox, Linux, 8 platforms), architecture, decision log with
rejected alternatives, per-module specs, threat model, test matrix.

**Not done (by design):** no v1 code yet. `app/` remains the only runnable artifact.

**Next action:** M1 — scaffold `src/` + `tools/build.mjs` producing `dist/{chrome,firefox}`, then M2
interceptor with synthetic-stream unit tests.

## CP-004 · 2026-11-06 · design complete
`docs/INTERFACES.md` · `docs/prompt/SYSTEM.md` · `docs/prompt/FRAMING.md` · `docs/specs/09-ui.md`
· `docs/REVIEW.md` · `docs/research/00-RESEARCH-LOG.md` · `docs/PLAN.md §8` · `docs/ROADMAP.md`

**Done:** the model-facing prompt in final wording; every frame and notice we send; the code contract
(names, signatures, storage keys, error codes); the UI with all three approval states; an adversarial
review that changed three things (Chrome ID pinning, `strict_min_version` 140 confirmed, loop stays in
the content script). Research findings now live *inside* the repo so a reset cannot destroy them.

**Deliberately absent:** still no v1 code — by instruction. Everything a coder needs is written down.

**Next action:** M1 scaffold — `src/manifest.base.json`, both overlays, `tools/build.mjs`, empty module
skeletons that satisfy `INTERFACES.md`, and a `dist/` that loads clean in all three browsers.

## CP-005 · 2026-11-06 · second research pass, design revised
`docs/research/**` (8 files) · `docs/DECISIONS.md` D13–D19 · `docs/specs/02,04,06,09` · `docs/PLATFORMS.md`
· `docs/prompt/SYSTEM.md` · `docs/PLAN.md §9` · `docs/INTERFACES.md`

**Done:** 18 repositories cloned at pinned commits and read at source level (1.3 GB, of which nothing is
kept). Findings archived *inside* the repo so a sandbox reset cannot destroy them. The pass changed the
design in seven places — governed sending + a four-rung ladder (D13), hidden ≠ paused (D14), an outcome
vocabulary where only `completed` advances (D15), thirteen builtins including `ask_user`/`update_plan`/
`finish`/`send_stdin` (D16), 128/256/512 KB result budgets (D17), the countdown clock + pipeline strip +
timestamps (D18), and no remote selector config in v1 (D19). Four errors from the first pass are corrected
in `research/00 §Corrections`.

**Not done (by instruction):** still no v1 code.

**Next action:** M1 — scaffold `src/` + `tools/build.mjs` so `dist/{chrome,firefox}` loads clean, with the
thirteen tool names and the thirteen error codes from `INTERFACES.md` stubbed.

## CP-006 · 2026-11-06 · matrix complete, injection verified ← **you are here**
`docs/research/09` · `docs/research/10` · `docs/DECISIONS.md` D20–D21 · `docs/PLATFORMS.md`
· `docs/specs/01` · `docs/M8-PLAYBOOK.md` · `docs/MANUAL.md` · `docs/FAQ.md` · `CONTRIBUTING.md`

**Done:** the round-2 pass continued until every one of the eight platforms had a **named transport** —
Claude `/chat_conversations/…/completion` (SSE, `stop_reason`), Gemini `BardChatUi/StreamGenerate` (whole-body
RPC), Kimi `/api/chat/{id}/completion/stream` (`all_done`), Grok `/rest/app-chat/conversations/…` (SSE,
`[DONE]`). The interceptor therefore gains three read modes (`sse` / `binary` / `body`). MAIN-world
injection was verified against BCD 8.1.8 (Chrome 111, Firefox 128 — under our minimums) and pinned as D20;
the worker blind spot is documented with a detection rule (D21). Archived: 19 repositories, 11 research
files, ~1,500 lines, all inside the repo so a sandbox reset cannot destroy them.

**Not done (by instruction):** no v1 code. `app/` is still the only runnable artifact.

**Next action:** M1 scaffold — manifests (with the MAIN-world entry), `tools/build.mjs`, module skeletons
matching `INTERFACES.md`, a `dist/` that loads clean in Chrome, Brave and Firefox, and a test that asserts
the built Firefox manifest has `background.scripts` and no `service_worker`.

---

## Checkpoint protocol

Before pausing, the running agent must:
1. `git commit` with a message naming the milestone (e.g. `M4: agent loop skeleton`).
2. Append an entry here with the commit hash.
3. Update the affected spec if reality diverged from it (specs are living documents).
4. State the single next action in one sentence.
