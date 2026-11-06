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

## CP-003 · 2026-11-06 · plan locked ← **you are here**
`docs/PLAN.md` · `docs/ARCHITECTURE.md` · `docs/DECISIONS.md` · `docs/specs/**` · `docs/PLATFORMS.md`
· `docs/SECURITY.md` · `docs/TESTPLAN.md`

**Done:** scope locked (Chrome/Brave/Firefox, Linux, 8 platforms), architecture, decision log with
rejected alternatives, per-module specs, threat model, test matrix.

**Not done (by design):** no v1 code yet. `app/` remains the only runnable artifact.

**Next action:** M1 — scaffold `src/` + `tools/build.mjs` producing `dist/{chrome,firefox}`, then M2
interceptor with synthetic-stream unit tests.

---

## Checkpoint protocol

Before pausing, the running agent must:
1. `git commit` with a message naming the milestone (e.g. `M4: agent loop skeleton`).
2. Append an entry here with the commit hash.
3. Update the affected spec if reality diverged from it (specs are living documents).
4. State the single next action in one sentence.
