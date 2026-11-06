# MDH_AI

**Your chatbot gets a terminal.**

Install one script and one browser extension, keep chatting with the AI you already use, and it can
actually work on your Linux machine: read and write files, run shell commands, search a codebase, and
open applications — with your approval on every step.

No API key. No account, no provider setup, no model picker, no billing. The model is the web chat you are
already signed into, running in your browser, with your session.

### What you do not have to bring

| | |
|---|---|
| **No API key** | the chat you are signed into is the model — nothing to paste, nothing to bill |
| **No daemon** | no gateway, no bot token, no port to keep open; close the browser and it is gone |
| **No `npm install`** | zero dependencies: the host is Node's standard library and this repository |
| **No NASA PC** | 139 KB zipped extension, ~60 ms to a ready host, 55 MB resident, measured by `npm run weigh` — and the budget breaks a build, not a paragraph |
| **No hidden calls** | loopback only, hash-chained audit on your disk, approvals before anything runs |

The full comparison against API-key agents, CLI coding agents and self-hosted gateways — including what they do
better — is in [`docs/WHY.md`](docs/WHY.md). Ideas for what comes next live in
[`docs/V2-NOTES.md`](docs/V2-NOTES.md), clearly marked as notes rather than promises.

```bash
git clone https://github.com/MDHojayfa/MDH_AI && cd MDH_AI
./install.sh                 # flags: --dry-run --uninstall --no-fun --barbos
```

Then load the extension once (Chrome/Brave: `dist/chrome`; Firefox: `dist/firefox`). Full walkthrough:
[`docs/MANUAL.md`](docs/MANUAL.md).

---

## What you get

**Eight AI platforms**, the free web UIs, no plugin from any of them required:

| | | | |
|---|---|---|---|
| ChatGPT | Claude | Gemini | DeepSeek |
| Kimi | Qwen | GLM · z.ai | Grok |

**Three browsers, one codebase, two artifacts:** Chrome 116+, Brave (same artifact), **Firefox 140+**
as a first-class target — not a port of last resort.

**Linux only in v1.** The host is the only OS-specific layer, and it is small.

**Plus the things that make it usable on a bad day:** a completion code so a task cannot "finish" by accident
(`docs/PLUG.md`), *Plan first* read-only mode, skills you write once (`## build`, `## deploy`), notes sent with
every run, remembered approvals with three lifetimes, a page check that tells you when a site changed, a runs
view in the local log, and one **Copy handoff** button that moves a stuck task to another chat.

### Fifteen builtin tools

| Tool | What it does |
|---|---|
| `list_dir` | directory tree, skipping `node_modules` and `.git` |
| `read_file` | line-numbered text, by range |
| `write_file` | create or overwrite, atomically |
| `edit_file` | replace the one exact match — refuses when ambiguous |
| `run_command` | one command or up to twenty in one shell, with cwd and timeout |
| `send_stdin` | reserved for persistent sessions |
| `search_files` | `ripgrep` when present, `grep` otherwise |
| `file_info` | type, size, mode, mtime |
| `sys_info` | distro, kernel, session, CPU, memory, disk |
| `open_app` | launch a GUI app in your session |
| `ask_user` | ask you a question and wait |
| `update_plan` | show progress as a checklist |
| `finish` | end the task with a summary |

### And every MCP server you already have

Point `~/.config/mdh/servers.json` at any stdio MCP server — filesystem, git, databases, browser control,
GUI automation — and its tools appear to the model under a server prefix. The host speaks the protocol
directly; nothing needs to be bridged or rewritten.

### The pill on the chat box, and the log page behind it

- **A control where the work happens.** A small pill anchors above the composer on any of the eight sites:
  click to start, click to pause, click to continue, drag it out of the way. It remembers your last task and
  your last position, and it lives in a shadow root so eight different global stylesheets cannot bend it.
- **A local log page.** `mdh-log` renders the audit chain as one self-contained HTML file — totals, p50/p95 per
  tool, every call newest-first with its hash, and the last failure with its hypotheses. `--serve` gives a live
  view on `127.0.0.1` with a per-process token; nothing is reachable from anywhere else, and the page has no
  script in it at all.
- **A report that is actually diagnostic.** On failure the extension merges what the page knows, what the
  browser knows and what the host can measure — kernel, clock skew, free disk, tunnel interfaces, MTU — then
  ranks a table of real-world signatures (`cf-ban`, `rate-limit`, `clock-skew`, `mtu-vpn`, `dom-drift`…) and
  hands you a pre-filled GitHub form. It never posts anything itself, and your public IP is behind a checkbox
  that starts unticked. [`docs/DIAGNOSTICS.md`](docs/DIAGNOSTICS.md) is the full field list.

### The parts that make it survive real use

- **Approval card** on anything that writes or executes: the parsed request is shown, never the model's
  prose. Deny / Allow once / Allow for this session.
- **Two independent path guards.** One lexical check in the extension for an instant answer, one in the
  host that resolves symlinks before it opens the file. Default allowlist: `~/projects`, `~/mdh`,
  `/tmp/mdh`. `~/.ssh`, `~/.gnupg`, keyrings and browser profiles are denied by name.
- **Pacing and refusal recovery.** A governor spaces sends and caps them per minute; a refusal triggers
  a backoff ladder (reload → longer reload → fresh chat → pause) instead of hammering the site, because
  the account is yours and free tiers punish hammering.
- **Hash-chained audit log** of every call under `~/.local/state/mdh/audit.jsonl`.
- **Optional container mode** for commands: rootless podman, no network, only allowlisted folders mounted.
- **One-driver-tab lease**, so two open tabs cannot race the same chat.
- **A mission log that is honest about being a joke.** While a reply is pending you get one real sentence
  ("waiting for the reply") and one rotating space-programme line, tagged `fun` — *contacting the aliens on
  the Moon*, *taking data from Mars*, *setting up the laser weapon on Pluto*. The pool is **1,365 lines**
  (`src/core/fun-corpus.js`), so a long session never hears the same one twice. In the popup there is
  **BARBOS MODE**, a boot-log panel where real events are tagged `sys`/`host` and everything else is tagged
  with a planet. Turn it all off with `./install.sh --no-fun`; it is decoration, not diagnostics.
- **A single-file landing page** in `site/` (with a generated social card) whose claims are the same claims
  as this README — no tracking, no fonts from a CDN, no cookie banner because there are no cookies.

## How it works

```
your chat tab                    extension                         your machine
─────────────                    ─────────                         ────────────
you type a task   ──▶  prompt injected into the message
                       the page sends it, exactly as usual
model replies     ──▶  injected.js copies the reply stream   ──▶  parsed into one call
                       (it never changes what the page gets)       │
                                                                   ▼
                                                              approval card
                                                                   │
                                                              native host (no port)
                                                              ├─ builtin tools
                                                              └─ your MCP servers
result inserted as the next user message  ◀────────────────────────┘
```

There is no local server listening on a port. The browser starts the host as a child process and talks to
it over a pipe, which is why a web page cannot reach it. Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Requirements

| | |
|---|---|
| OS | Linux, x86_64 or aarch64 |
| Node | 20 or newer |
| Browser | Chrome 116+, Brave, or Firefox 140+ |
| Chat | a free account on any of the eight platforms, already signed in |

## Honest limits

- The free web UIs change. When a site changes its internals, that one adapter needs an update; the other
  seven keep working. Each adapter is one small file.
- A chat tab must stay open while a task runs. It may be in the background.
- Rate limits are real. The tool waits and backs off; it does not pretend a limit did not happen.
- Not a sandbox: everything runs as you, with your permissions. The safeguards are the allowlist, the
  approval card and the audit log — read [`docs/SECURITY.md`](docs/SECURITY.md) before pointing it at
  anything you care about.
- Linux only. Windows and macOS are not promised by v1.

## Documentation

| | |
|---|---|
| [`docs/MANUAL.md`](docs/MANUAL.md) | install, first run, approvals, recovery, troubleshooting |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | the five layers and why each exists |
| [`docs/PLATFORMS.md`](docs/PLATFORMS.md) | per-platform read mode, selectors, quirks |
| [`docs/PLUG.md`](docs/PLUG.md) | the completion code: what ends a task, and why a sentence cannot |
| [`docs/WHY.md`](docs/WHY.md) | the honest comparison, and the measured numbers behind "lightweight" |
| [`docs/V2-NOTES.md`](docs/V2-NOTES.md) | platform rotation, a messaging bridge, and the ideas that did not earn a place yet |
| [`docs/RELEASE.md`](docs/RELEASE.md) | the shipping checklist: verify, version in four places, stores, post-release |
| [`docs/SECURITY.md`](docs/SECURITY.md) | threat model, controls, residual risk |
| [`docs/FAQ.md`](docs/FAQ.md) | the questions people actually ask |
| [`docs/DIAGNOSTICS.md`](docs/DIAGNOSTICS.md) | what a failure collects, what it refuses to, the signature table |
| [`docs/SCENARIOS.md`](docs/SCENARIOS.md) | fifteen real failures, walked through from screen to fix |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | why it is built this way |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | the sources behind the safety story, and what each one changed |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | what comes after v1 |
| [`docs/TESTPLAN.md`](docs/TESTPLAN.md) | what is tested and how to reproduce it |
| [`docs/KNOWN-LIMITS.md`](docs/KNOWN-LIMITS.md) | what one laptop cannot test — the honest version |
| [`docs/SEO-AND-LAUNCH.md`](docs/SEO-AND-LAUNCH.md) | positioning, search and launch plan |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | build, test, package, add an adapter |
| [`docs/MEDIA.md`](docs/MEDIA.md) | screenshots, alt text and store listing copy |
| [`site/index.html`](site/index.html) | the landing page — one file, no dependencies, one mission patch |

## Found a bug? Read this first (it is short, like the developer's budget)

**The developer does not have a NASA PC.**

That is not a joke, it is the release process. One machine, eight websites that redesign themselves on a
Tuesday, and a test suite that runs in three seconds because there is nothing faster to rent. So when
something breaks, it is almost never "the developer was careless" and almost always "nobody could have
seen that coming on a laptop with 8 GB of RAM and a cat".

Which means: **open an issue.** It is genuinely the most useful thing you can do, and it costs you two
minutes. The product tries to make that obvious instead of hiding it in a footer:

- **Every run starts with one line** about reporting a problem, picked at random from twenty. It sits in
  the popup above everything else, next to two real buttons — **Report a bug** and **Send an idea** — that
  open the GitHub form with the stage, platform and browser already filled in.
- **When the loop fails, the failure card carries the form.** A crash is the one moment you might actually
  file a report, so it is the one moment the button appears inside the page, next to the real error.
- **The jokes are a separate pool.** Twenty help-desk lines and twelve share lines live in
  `src/core/report.js`; the 1,365-line mission corpus in `src/core/fun-corpus.js` never gets mixed in, so
  asking for help never reads like a punchline and a punchline never reads like an error.
- **Nothing is pre-filled that could embarrass you.** The bug form gets the stage, platform and browser —
  never a filesystem path, never a URL you visited. Both are redacted before the URL is built, and a test
  holds that door shut.

- Use the [bug form](https://github.com/MDHojayfa/MDH_AI/issues/new?template=bug_report.yml) — it asks
  for the stage, the platform and the log, which is 90 % of the diagnosis.
- Include the popup's **Copy log**. It knows things you do not, like which frame arrived last.
- Vague reports are still read. They just take longer to become fixes, and the developer has to guess,
  and guessing is how features become folklore.

> "It works on my machine" — every developer, moments before the issue tracker proves otherwise.

> "Have you tried reloading?" — the developer, not being lazy, but because SPA navigation genuinely
> breaks more things than it fixes.

> "We do not have a QA team. We have users with opinions, which is better and louder."

If you are here to report that the ninth platform is missing: yes, it is. It is on the
[roadmap](docs/ROADMAP.md), right below "sleep".

## Tell someone, if it earned it

The popup has a **Share** button, and it opens the sheet automatically **once per profile** — after that it
stays a button, because a product that asks every launch is a product people uninstall.

| Where | What happens |
|---|---|
| X, Facebook, WhatsApp, Telegram, Reddit, LinkedIn, Bluesky, Email | a pre-filled post, link and one line included |
| Instagram, TikTok | **no web intent exists that pre-fills a post** — the sheet copies the link and opens the site, labelled as exactly that |
| Copy link | one sentence plus the repo URL, ready for anywhere |

No tracking parameters, no referral code, no "shared by" watermark. The link is the plain repository URL,
because the point is that someone else can install it in two minutes, not that it can be counted.

## Credit

Built by **[MDHojayfa](https://github.com/MDHojayfa)** — <https://mdhojayfa.github.io/>

- GitHub: <https://github.com/MDHojayfa> — the follow button is free; a NASA PC is not.
- Site: <https://mdhojayfa.github.io/>

MIT licensed. See [`LICENSE`](LICENSE) and [`CREDITS.md`](CREDITS.md).
