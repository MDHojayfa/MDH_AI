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

## CP-005 · 2026-11-06 · second research pass, design revised ← **you are here**
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

---

## Checkpoint protocol

Before pausing, the running agent must:
1. `git commit` with a message naming the milestone (e.g. `M4: agent loop skeleton`).
2. Append an entry here with the commit hash.
3. Update the affected spec if reality diverged from it (specs are living documents).
4. State the single next action in one sentence.
