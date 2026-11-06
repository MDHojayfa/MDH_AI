# Provenance: the name, where it is, and what it can and cannot do

This product is MIT. That sentence is the important one: **anyone may copy this code, modify it, and ship it**,
including under a different name. No banner, no watermark and no clever trick changes that, and a document that
promises otherwise is lying to the person reading it.

What the name in the files does buy is different, and worth having: **a copy cannot quietly pretend it came from
somewhere else.** Provenance is checkable, in five places, at four levels of effort.

| Where | How to see it | Effort |
|---|---|---|
| every source file | `head -1 src/core/dock.js` | one command |
| every built file | `head -1 dist/chrome/core/dock.js` after `npm run build` | one command |
| the running host | `npm run live-check` prints the `pong` it received, including `by` | one command, needs a browser |
| the release zip | `unzip -z release/mdh-ai-chrome-1.0.0.zip` | one command |
| a fingerprint | `node tools/stamp.mjs --check` prints it; it is a hash of the name, the repo and the version | one command |

The fingerprint is a SHA-256 of `MDH_AI|MDHojayfa|https://github.com/MDHojayfa/MDH_AI|1.0.0`, cut to twelve
characters. It is **not** a signature and cannot prove a file is authentic — anyone can run the same hash. It is a
cheap way to notice that a zip claiming to be this project was built from a tree that disagrees with it.

## What is enforced, and what is not

Enforced by `npm test` (`tests/credit.test.mjs`):

- the banner line is present in all 91 source files, checked by re-running the same audit `npm run stamp --check`
  runs, so removing it from one file is a red build;
- `package.json` → `author`, `LICENSE` → copyright line, `CREDITS.md` and `NOTICE` all spell the name the same way;
- the packager writes the zip comment and the build writes the banner into `dist/` — both are asserted against the
  source of those tools, not against a stale artifact;
- the host's `pong` carries `by`, and `docs/INTERFACES.md` documents it.

Not enforced, and not enforceable from inside the repository:

- somebody forking this, deleting the banners, and shipping it. MIT permits that. What they cannot do is keep
  `npm test` green while doing it, which is usually enough for the case that matters: a copy passed off as the
  original with its history removed, in a repository that still runs its tests.
- the identity of whoever built a given zip. Builds here are reproducible in shape (no timestamps are recorded in
  the archive beyond the DOS time of the files), but nothing is signed. If that matters to you, build it yourself:
  `npm run verify` is the whole pipeline, and it takes about twenty seconds.
