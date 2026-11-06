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
| The IP probe on IPv6-only or CGNAT | one network was available | a report from each, with the address redacted |
| MTU/tunnel detection outside Linux | it reads `/sys/class/net/*/mtu` | a macOS port, if one ever exists |
| The pill on all eight layouts | four were checked by hand | a screenshot per platform that misplaces it |
| A report built while the host is down | the fallback path is tested, the *timing* is not | one report from a machine with no host |
| The live viewer after a host restart | the port is random per process | a bookmark, if you set `viewerPort` |

## The limits of the diagnostics themselves

- **A hypothesis is not a cause.** The signature table matches text and a few measurements. It is right often
  enough to be worth reading and wrong often enough that every surface calls it a guess.
- **The clock is compared to one server.** A second of error is the resolution; a badly configured endpoint is
  indistinguishable from a badly configured laptop.
- **The log page is the audit log.** If a call was not audited (a crash mid-write), the page cannot show it.

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

## Added in 1.0.0, and what is *not* proven about it

| Feature | What was tested | What was not |
|---|---|---|
| Completion code (plug) | unit tests for shape, matching and the refusal path; a wrong code cannot complete | how eight different models behave when told to remember six characters over 40 turns |
| Plan first | the allowlist, the refusal message, approve/decline in tests | a plan-mode run against a real MCP server; only builtin tools were exercised |
| Skills | parsing, limits, lookup, prompt line | very large playbooks, or a model that ignores the name and never opens one |
| Remembered approvals | lifetimes, pruning, revoke, per-site scoping | a browser crash in the middle of a grant write |
| Layout watch | regression vs recovery logic; the probe itself | whether every platform renders its composer inside the four-second window (some are slower, hence the 15 s re-check) |
| Runs in the log | grouping, `?run=` filtering, hash coverage | long histories (thousands of runs) on a slow disk |
| Weigh | budgets, the stale-prose check | other machines, other Node versions, spinning disks |
| Who said yes (`via`) | the vocabulary, the hash coverage, the page and `--run` output | a model or server that rewrites the field — the host sanitises it, but two writers to one file is still two writers |
| Deleting the end of the log | the checkpoint beside the chain: a shorter file, a deleted file, and a tail replaced by new entries are all reported with a count (`tests/truncation.test.mjs`) | someone who can write **both** files — the checkpoint is a second file in the same folder, so it raises the cost of a silent edit, it does not make one impossible. A hash chain cannot see its own tail (Bellare & Yee 1997; Ma & Tsudik 2008) |

The pattern is the same as everywhere else in this file: the logic has tests, the *behaviour of eight chat
products over a long session* does not. That is the part only real users can find.
