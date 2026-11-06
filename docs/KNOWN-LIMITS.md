# Known limits — what one laptop cannot test

This file exists because the alternative is a support inbox full of "it does not work" with no way to tell
whether the product is broken or the promise was too large. Every claim below is about **verification**, not
about intent: the code may well be correct in the cases marked *never tested* — nobody has watched it be
correct yet.

Written and maintained by **[MDHojayfa](https://github.com/MDHojayfa)**, on one Linux machine, without a
staging cluster, a device farm, a paid CI matrix or a second pair of eyes. That is the whole constraint, and
it is why the popup opens with a line about reporting problems instead of a line about the roadmap.

## The verification ladder

| Level | Meaning |
|---|---|
| **automated** | a test in `tests/` fails if this breaks; it runs on every push, on Node 20 and 22 |
| **by hand, once** | it was performed during development and the result was written down here |
| **never** | nobody has executed this path end to end. Treat it as unproven. |

## What is automated

- Manifest invariants: worlds, host permissions, Gecko ID, no service worker in the Firefox build, no
  Chromium-only fields leaking into it, the pinned extension ID deriving from the key.
- The parser, including almost-JSON repair, coercion by schema, unclosed fences and foreign tool markers.
- Policy: the path guard, the deny list, approval defaults, and the fact that a deny is the default on
  timeout.
- Prompt rendering and its token budget.
- The report and share layer: pool sizes, call-to-action, no fake success, no credential words, URL
  construction, redaction of paths and URLs, ten share endpoints, and honest handling of the two that have no
  web intent.
- The host: framing, the tool registry, the audit chain, a real spawn with a real ping/pong.
- The packaging step: both ZIPs, file counts, and the extension ID inside the built manifests.

## What was checked by hand, once

- **Chrome/Brave on Linux**, eight platforms: starting a task, one tool call round trip, an approval, a
  denial, and a stop/resume.
- **Firefox 140+**, temporary add-on: the same loop, plus the MAIN-world tap degrading to DOM reading on a
  page where injection is blocked.
- The host under `run_command` timeouts, a denied path, an ambiguous `edit_file`, and an MCP server that
  refuses to start.
- `install.sh` on a clean home directory, including `--dry-run` and `--uninstall`.

## What has never been tested

| Untested | Why | What would prove it |
|---|---|---|
| Every platform, **simultaneously signed in**, in one browser | logging into eight services by hand takes longer than writing the feature | one volunteer per platform, one report each |
| Free-tier rate limits on a real account, repeatedly | hitting a limit on purpose is slow and looks like abuse | a recorded ladder session, played back against the governor |
| A 60-turn task that finishes | it costs an hour of real quota | a long-task run log attached to an issue |
| Encrypted home directory, Wayland-only session, Flatpak browser | one machine, one setup | a report that names the setup |
| Non-English locales in the page UI | selectors are structural, but button *labels* are used in two places | one screenshot per locale that fails |
| MCP servers other than the reference one | each server is its own dialect | a config file and the tool list it produced |
| Windows and macOS | not in v1, not claimed | — |
| Firefox for Android | explicitly out of scope; `web-ext lint` warns about it | — |
| Screen readers over the injected cards | no screen reader on this machine | an accessibility audit |
| A store review of either package | neither is submitted yet | the listing file |

## The three limits that are not about testing

1. **A chat tab must stay open.** The model answers in the page, so the page has to exist. A closed tab stops
   the loop; the pending call survives and Resume picks it up.
2. **The free tier is the ceiling.** The governor waits instead of working around a limit, which means a task
   can take an hour and produce nothing but patience.
3. **The UI is the API.** All eight platforms change their markup without asking. The product handles this the
   only honest way available: the adapter is a data file, the failure is detected at the composer, and the
   card names the exact selector that stopped matching so a report can name it too.

## How to turn one of these into a test

If you hit something in the *never tested* table, the fastest path is a report that contains the three things
the bug form asks for: **platform**, **stage** and **log**. With those, a failing case usually becomes a
fixture in `tests/fixtures/` in one commit — and a fixture is a test that runs forever.

```
popup → Advanced → Copy log → paste into the bug form
```

Do not sanitise the log beyond what the extension already does; it contains tool names and timings, never
file contents.

## The short version

Assume this product has been tested as far as one person on one machine can test it, and no further. That is
not a disclaimer bolted onto the bottom — it is the reason the issue button is the first thing in the popup,
the reason the failure card carries the form, and the reason every line about bugs mentions the same thing:

> There is no NASA PC here. There is a laptop, an issue tracker, and a person who reads it.
