# Contributing

The most useful contribution is **a bug report that names a stage**, or a fixed adapter for one of the
eight platforms. "It doesn't work" costs a day of guessing; "the reply arrives empty on Claude, after the
send was accepted" costs ten minutes.

## Ground rules

1. **Docs move with code.** If behaviour changes, the document changes in the same commit.
   `docs/ARCHITECTURE.md`, `docs/INTERFACES.md` and `docs/PLATFORMS.md` describe the code as it is.
2. **No dependencies.** No bundler, no framework, no polyfill. The browser runs the repository directly;
   a PR that adds a build step is a design discussion, not a merge.
3. **No network calls from the extension.** No telemetry, no remote config, no update check, no CDN font.
4. **Fail closed.** An unrecognised selector, frame or argument shape means *do nothing and say why* —
   never guess in a way that executes something.
5. **Write it here.** Every file in this repository was written for this repository; the licence is MIT
   and stays MIT (see `CREDITS.md`).

## Build and test

```bash
npm test                                        # 88 tests, no browser needed
npm run build                                   # dist/chrome + dist/firefox, with manifest invariants
npm run package                                 # release/*.zip, written with node:zlib only
npm run og                                      # site/og.png, drawn with arithmetic
npx web-ext lint --source-dir dist/firefox      # must stay at 0 errors
node tools/selfcheck.mjs                        # spawns the host and waits for a real pong
bash -n install.sh                              # syntax; shellcheck if you have it
./install.sh --dry-run                          # every path, nothing written
```

Tests load the same classic scripts the browser loads into a `vm` sandbox, so a passing test is a
statement about shipped code. Fixtures for the interceptor live under `tests/fixtures/` as text, never as
recordings with live tokens.

## Adding a help-desk or share line

Both pools live in `src/core/report.js` and nowhere else. Funny writing belongs in
`src/core/fun-corpus.js`; these are the lines a person reads when something is broken, so a new one must
contain a call to action, must not claim success, and must not mention credentials or keys.
`tests/report.test.mjs` checks all three, plus the redaction in `issueUrl()` — a pre-filled public form must
never carry a file path or a URL the user visited.

## Adding or fixing a platform

Adapters are data. Copy the smallest one, change values, keep logic out of it.

1. `src/platforms/<id>.js` — host pattern, read mode, network signature, selectors, pacing, timings.
2. `src/manifest.base.json` — add the host to `host_permissions` **and** to both content-script `matches`.
3. `docs/PLATFORMS.md` — add or update the row, including what its terminal frame looks like.
4. Record one real reply stream, scrub tokens and conversation ids, and add it under `tests/fixtures/`.

If your change needs to touch `src/core/`, the adapter contract is wrong: open an issue about the
contract instead of patching around it.

## Debugging a live failure

The popup has **Copy log**, which serialises the ring buffer with the current stage, platform, timings and
the last parse reason. That is the artifact to attach to an issue.

## Code style

ES2022, two-space indent, single quotes, semicolons. No `any`-shaped escape hatches in the docs; no
comment that restates the line below it. A comment explains a decision or a non-obvious constraint, and a
file starts with the one paragraph that tells a reader what it is for.
