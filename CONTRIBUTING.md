# Contributing

The most useful contribution is **a filled-in adapter form** for one of the eight platforms, or a bug
report that names a stage of the pipeline (see `docs/specs/09-ui.md §8.2`).

## Ground rules

1. **Spec first.** If behaviour changes, the document changes in the same commit. `docs/specs/` is not a
   historical record; it describes the code as it is.
2. **No dependencies.** No bundler, no framework, no polyfill in v1 — vanilla ES modules, run directly by
   the browser. A PR that adds a build step is a design discussion, not a merge.
3. **Never copy code from another project.** Two of the projects in this space are GPL-3.0, one is
   non-commercial, and two have no licence at all. Reading them for behaviour is fine and encouraged;
   pasting from them is not, and one function is enough to relicense this whole repository. See
   `CREDITS.md`.
4. **No network calls from the extension.** No telemetry, no remote config, no update check, no CDN fonts.
5. **Fail closed.** When a selector, a frame or an argument shape is unrecognised, do nothing and say why.
   Never guess in a way that executes something.

## Adding a platform

Read `docs/M8-PLAYBOOK.md` and fill the YAML form. Then:

1. `src/platforms/<id>.js` — data only, following the shape in `docs/PLATFORMS.md`. No imports, no timers,
   no DOM writes outside the declared selectors.
2. Add hosts to the manifest overlay(s) and a row to `docs/PLATFORMS.md` (including the confidence dot).
3. Add a fixture: one recorded stream per platform into `tests/fixtures/<id>/`, captured through the
   playbook, with tokens and conversation ids scrubbed.
4. Verify the four selectors with the probe in the playbook, and paste the output into the PR.

If your change requires editing anything in `src/core/`, the adapter contract is wrong — open an issue
about the contract instead.

## Testing before a PR

```bash
npm test                 # unit + harness
npm run build            # both artifacts
npx web-ext lint --source-dir dist/firefox     # must be 0 errors
shellcheck install.sh
./install.sh --dry-run   # must print paths and change nothing
```

A PR that changes the loop must include a test for the failure it prevents. "It works on my machine" is
not a test; a synthetic refusal fixture is.

## Commit style

`M<milestone>: <what changed>` for milestone work, `fix(<area>): …` otherwise. One logical change per
commit. Do not rename files to make history look different — see `CREDITS.md` for why that rule exists.

## Code of conduct

Be precise, be kind, assume the other person has read the docs. Security issues go to a private advisory,
never a public issue.
