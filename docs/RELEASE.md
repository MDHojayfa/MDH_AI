# Releasing 1.0.0

Everything below is a step someone can follow without reading the source. If a step needs a decision, the
decision is written next to it.

## 0. Before you tag

```bash
npm run verify     # build → package → weigh → test; fails on any broken budget, test or manifest rule
```

`weigh` also re-reads the KB numbers quoted in `README.md`, `docs/WHY.md` and `docs/MANUAL.md` and fails if they
are more than 15% away from the zip it just built. Update the prose when the bundle grows; that is the whole point.

`verify` builds and packages before it weighs, because the thing worth weighing is the zip a user would download,
not the source tree it came from — and because the quote check needs an artifact to disagree with. It still runs
before any upload, so a 4 MB bundle fails here rather than in a store review.

The README art is optional and needs ImageMagick, so it is not in `verify`:

```bash
npm run art        # assets/hero.gif, terminal.gif, approval-card.png, social.png
                   # + site/hero.gif, site/approval-card.png, site/og.png
```

Regenerate it when the pill's labels or the install output change, so the illustrations keep matching the product
they claim to be drawn from. `tests/art.test.mjs` checks that every asset the README mentions exists and that each
one still carries its *illustration, not a recording* label.

Expected shape of a good run:

| Check | Where it comes from | Expected |
|---|---|---|
| tests | `node --test tests/*.test.mjs` | all passing, ~305 |
| tiers | `npm run build` | `dist/chrome`, `dist/firefox`, manifest rules |
| bundles | `npm run package` | `release/mdh-ai-{chrome,firefox}-1.0.0.zip` |
| lint | `npx web-ext lint` | 0 errors, 1 known warning |
| weight | `npm run weigh` | inside every budget |
| host | `./install.sh --diagnose` | `host answered … audit ok` |
| logs | `node host/mdh-log.mjs --json` | parses, `summary.calls` is a number |

## 1. Version, in seven places

Bump all of them together; a mismatch is a bug report waiting to happen, and `tests/version.test.mjs` fails the
build when one drifts, so this list is enforced rather than remembered.

1. `package.json` → `version`
2. `src/manifest.base.json` → `version`
3. `host/mdh-host.mjs` → `VERSION` (sent in every `pong`, which is what `install.sh` prints)
4. `host/mdh-log.mjs` → `VERSION` (the log page footer)
5. `host/diag.mjs` → `HOST_VERSION` (in every report a user might paste)
6. `host/mcp_client.mjs` → the `clientInfo` handshake every MCP server sees
7. `site/index.html` → `"softwareVersion"`

`release/` filenames are generated from `package.json` — nothing to edit there.

## 2. Stores

| Store | Artifact | Notes |
|---|---|---|
| Chrome Web Store | `release/mdh-ai-chrome-1.0.0.zip` | single-purpose description: "controls the user's own machine through their own chat session"; permissions justifications are in `docs/MEDIA.md` |
| Firefox AMO | `release/mdh-ai-firefox-1.0.0.zip` | listed version, `web-ext lint` clean, no remote code |
| GitHub release | both zips + `install.sh` | tag `v1.0.0`, notes from `CHANGELOG.md`, checksums printed by `sha256sum release/*.zip` |

No store listing may claim a platform works if `docs/PLATFORMS.md` says it is untested. That document is the
source of truth for support questions, and the README links it.

## 3. The post-release checklist

- [ ] `install.sh --diagnose` on a machine that never had it installed
- [ ] one full run on each platform that is marked tested
- [ ] `mdh-log --serve` opens, filters, hides, archives (never deletes)
- [ ] a deliberate failure produces a report you would be willing to paste in public
- [ ] the privacy page and `docs/SECURITY.md` still describe the same product
- [ ] `CHANGELOG.md` top section matches the tag
- [ ] the test count in the README badge, the numbers table and `CHANGELOG.md` matches what `npm test` printed —
      nothing checks this one automatically, and it has drifted twice

## 4. If something is wrong after release

Ship a patch, do not edit a tag. The audit chain is the record of what actually ran, and it is the only artifact
worth arguing about later.
