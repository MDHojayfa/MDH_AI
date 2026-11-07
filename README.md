<div align="center">

<img src="assets/hero.gif" width="860" alt="The MDH_AI pill on a chat page: Start, Working, an approval card for one exact command, Paused, Done.">

<h1>MDH_AI</h1>

<p><b>Your chatbot gets a terminal.</b><br>
The chat you are already signed into can read, write, run and search on your Linux machine —<br>
one approval per step, one hash-chained log, no API key anywhere.</p>

<p>
<img alt="tests" src="https://img.shields.io/badge/tests-305%20passing-34d399?style=flat-square">
<img alt="runtime dependencies" src="https://img.shields.io/badge/runtime%20dependencies-0-6d5efc?style=flat-square">
<img alt="extension size" src="https://img.shields.io/badge/extension-140%20KB-8b5cf6?style=flat-square">
<img alt="Chrome and Brave" src="https://img.shields.io/badge/Chrome%20%7C%20Brave-116%2B-4285F4?style=flat-square">
<img alt="Firefox" src="https://img.shields.io/badge/Firefox-140%2B-FF7139?style=flat-square">
<img alt="Linux" src="https://img.shields.io/badge/Linux-v1-0b0b12?style=flat-square">
<img alt="licence" src="https://img.shields.io/badge/licence-MIT-c0c6d6?style=flat-square">
</p>

[Quickstart](#sixty-seconds) · [What it does](#what-it-does) · [Security](#security-in-three-sentences) · [Numbers](#the-numbers-measured) · [Docs](#docs) · [Credits](#credits)

<sub>v1.0.0 — the code is finished and the zips are built; what has and has not been proven is listed in
[`docs/VERIFICATION.md`](docs/VERIFICATION.md), including the browser check that has not been run yet and the eight
live sites nobody has pointed this at. Store submission is a person's next step, not a claim. What changed, and
when: [`CHANGELOG.md`](CHANGELOG.md).</sub>

</div>

---

## Why this exists

Every "AI agent for your computer" asks for the same three things first: an API key, a card, and trust in a
gateway you have never read. MDH_AI asks for none of them. The model is the web chat already open in your
browser, running with the session you already paid for or got for free. The only new component is a small host
on your own machine, and it will not touch anything you have not approved.

| | |
|---|---|
| **No API key** | the chat you are signed into *is* the model — nothing to paste, nothing to bill |
| **No account, no daemon** | no gateway, no bot token, no port to keep open; close the browser and it is gone |
| **No `npm install`** | zero dependencies: the host is Node's standard library and this repository |
| **No hidden calls** | loopback only, hash-chained audit on your disk, an approval before anything runs |
| **No heavyweight setup** | 140 KB zipped extension · ~70 ms to a ready host · 55 MB resident — `npm run weigh` measures it, and a budget breaks the build, not a paragraph |

The full comparison against API-key agents, CLI coding agents and self-hosted gateways — **including the things
they do better** — is [`docs/WHY.md`](docs/WHY.md). What comes next is [`docs/V2-NOTES.md`](docs/V2-NOTES.md),
marked as notes, not promises.

## Sixty seconds

**What you need:** Linux, [Node.js 20+](https://nodejs.org) (the only thing that may need `sudo`, and only to
install Node itself), and Chrome 116+/Brave/Firefox 140+. **Not** npm — it is not used to install, build or run
anything here.

```bash
git clone https://github.com/MDHojayfa/MDH_AI && cd MDH_AI
./install.sh                    # builds both browsers, registers the host, checks itself
```

Then one manual step, because no browser has a command for it: open `chrome://extensions` → *Developer mode* →
*Load unpacked* → pick `dist/chrome` (Firefox: `about:debugging` → *Load Temporary Add-on* → `dist/firefox/manifest.json`).
Open any of the eight chats and press **Start** on the pill above the composer.

**If anything is wrong, in any of the above:**

```bash
./install.sh --doctor           # one line per part, with the fix under every line that failed
```

[`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) is the same information as a decision tree — no pill, pill does
nothing, `NO_HOST`, "should I use sudo?", "invalid native messaging host name", and the rest. Full walkthrough,
including the uninstall: [`docs/MANUAL.md`](docs/MANUAL.md).

<img src="assets/terminal.gif" width="820" alt="Terminal: clone, install, three checks pass, then mdh-log --runs lists a run.">

## What it does

You type a sentence. The model answers with a call — not prose — and the call is what runs:

```text
you   find every file over 100 MB in ~/projects

model {"mdh_call":{"tool":"run_command","arguments":{"cmd":"du -ah ~/projects | sort -h | tail -20","cwd":"~/projects"}}}

you   ⬛ Allow this command?  du -ah ~/projects | sort -h | tail -20
      Allow once · Deny · remember for this run / this session / this site

host  [MDH_RESULT tool="run_command" status="ok"] … 3 files over 100 MB · 1.2 GB total
```

### Press Start: what actually happens

There is no wizard and no account. Three pieces, and you can point at each one:

1. **The extension** is `dist/chrome`, built by `./install.sh` and loaded unpacked from that folder. It is the only
   thing that talks to the page and to your machine; everything else in the repo is source for it.
2. **The host** is `host/mdh-host.mjs`, registered as a native-messaging app (`dev.mdhojayfa.mdh`) by the same
   script. That registration is the whole "setup": a JSON file in `~/.config/*/NativeMessagingHosts` that names the
   extension id it is allowed to answer.
3. **The pill** appears on the chat page above the composer — `▶ Start` — the moment the page loads on a supported
   site. Nothing runs before you press it.

Then: you press Start → the extension types a kickoff prompt into the composer you can see and sends it → the model
replies with a tool call instead of prose → the approval card appears *on the chat page* → you allow it → the host
runs the command → the result is typed back into the same chat as `[MDH_RESULT]`. The chat is the interface. There
is no second window to keep in sync.

 · Claude · Gemini · DeepSeek · Kimi · Qwen · GLM (z.ai) · Grok — the free
web UIs, with no plugin from any of them. Chrome 116+, Brave (same artifact), and Firefox 140+ as a first-class
target, not a port of last resort. **Linux only in v1**; the host is the only OS-specific layer and it is small.

**Fifteen builtin tools.** `list_dir` `read_file` `write_file` `edit_file` `run_command` `send_stdin`
`search_files` `file_info` `sys_info` `open_app` `ask_user` `update_plan` `finish`, plus `read_skill` and
`propose_plan`. Every one of them is described to the model and refused outside the allowlist.

**And every MCP server you already have.** Point `~/.config/mdh/servers.json` at any stdio MCP server —
filesystem, git, databases, browser control — and its tools appear under a server prefix. The host speaks the
protocol itself; nothing is bridged or rewritten.

### The parts that make it usable on a bad day

| | |
|---|---|
| **Approval card** | the parsed request is shown, never the model's prose: exact command, folder, why, and how many times you have already approved it in this run |
| **Three lifetimes of "yes"** | *this run* (in memory) · *this session* (ends when the browser restarts, by boot stamp) · *this site* (listed in the popup, removable with ✕). A grant never overrides the policy — it only answers "you already approved this exact command" |
| **A completion code** | every run gets `PHX-XXXXXX`, and only a `finish` carrying it ends the task. A sentence cannot complete a run — [`docs/PLUG.md`](docs/PLUG.md) |
| **Plan first** | read-only mode: investigate, propose a plan, get told yes, then act ([`docs/MANUAL.md`](docs/MANUAL.md) §3a1) |
| **Skills** | write `## deploy` once in your own words; the model sees the names and opens the one it needs |
| **Notes for every run** | up to 1,200 characters of your own instructions — package manager, Python name, folders to leave alone |
| **Runs in the log** | every call carries a run id, so "what did that session actually do?" is a URL (`?run=…`) or `mdh-log --run <id>` |
| **Copy handoff** | a stuck run turns into a prompt you paste into another chat — task, plan, last three results, next step, completion code |
| **Honest failure hints** | a refusal or an error comes with one next action appended as `[MDH_HINT]`, under the untouched error text |
| **Screen-reader audible** | the pill announces its phase through a polite live region; cards move focus and give it back |

<img src="assets/approval-card.png" width="820" alt="The approval card: exact command, folder, reason, times approved, Allow once, Deny, and three remembered-grant lifetimes.">

## Security in three sentences

**Deny by default.** Paths outside `~/projects`, `~/mdh` and `/tmp/mdh` are refused by two independent guards —
one lexical in the extension, one in the host that resolves symlinks before it opens anything — and `~/.ssh`,
`~/.gnupg`, keyrings and browser profiles are denied by name. **Nothing runs unapproved.** The policy decides,
the card asks, and a timeout is a deny, because silence is not consent. **Everything is recorded.** Every call
lands in `~/.local/state/mdh/audit.jsonl`, hash-chained and carrying *who allowed it* — `auto`, `approval`, or a
named grant — with a checkpoint beside the chain so a shortened log is noticed rather than trusted.

Read the whole threat model, including the residual risk: [`docs/SECURITY.md`](docs/SECURITY.md). The gap list is
not marketing: [`docs/KNOWN-LIMITS.md`](docs/KNOWN-LIMITS.md).

## The numbers, measured

| | |
|---|---|
| extension | **140 KB** zipped · 404 KB unpacked · 40 files |
| host | **~70 ms** to ready · **55 MB** resident · 0 npm dependencies |
| source | 11,395 lines, tests included |
| tests | **305**, run with `node --test tests/*.test.mjs` |
| budgets | 300 KB zip · 80 MB RSS · 1,500 ms startup · 0 dependencies — a build fails when one is crossed |

`npm run weigh` prints that table on your machine, compares the prose in the docs against the real artifact, and
exits non-zero if the two disagree. [`docs/WHY.md`](docs/WHY.md) explains why these numbers are the whole
argument rather than a footnote.

## What it does not do

Linux only in v1 — no Windows, no macOS. It cannot make a free tier generous, so it paces itself and backs off
on refusals instead of hammering your account. A chat site redesign can break an adapter until it is updated
(the page check tells you when that happens, instead of failing silently). It never auto-submits a GitHub issue;
it pre-fills one and stops. And it cannot promise the model is right — only that you see every command before it
runs.

## Docs

| | |
|---|---|
| [`docs/MANUAL.md`](docs/MANUAL.md) | install, first run, approvals, recovery, troubleshooting |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | the five layers and why each exists |
| [`docs/PLATFORMS.md`](docs/PLATFORMS.md) | per-platform read mode, selectors, quirks |
| [`docs/PLUG.md`](docs/PLUG.md) | the completion code: what ends a task, and why a sentence cannot |
| [`docs/WHY.md`](docs/WHY.md) | the honest comparison, and the measured numbers behind "lightweight" |
| [`docs/RESEARCH.md`](docs/RESEARCH.md) | the sources behind the safety story, and what each one changed |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | why it is built this way, decision by decision |
| [`docs/TESTPLAN.md`](docs/TESTPLAN.md) | what is tested and how to reproduce it |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | it does not work: the decision tree, and the one-command doctor |
| [`docs/RUN-STATES.md`](docs/RUN-STATES.md) | every way a run can end, every pause reason, and what survives a reload |
| [`docs/REMOTE-TESTING.md`](docs/REMOTE-TESTING.md) | testing this on a machine that is not the author's, and what to send back |
| [`docs/VERIFICATION.md`](docs/VERIFICATION.md) | what is proven, by which test, and the list of what is not |
| [`docs/PROVENANCE.md`](docs/PROVENANCE.md) | where the author's name is written, and what that can and cannot prevent |
| [`docs/RELEASE.md`](docs/RELEASE.md) | the shipping checklist: verify, the version in seven places, stores |
| [`docs/SECURITY.md`](docs/SECURITY.md) | threat model, controls, residual risk |
| [`docs/DIAGNOSTICS.md`](docs/DIAGNOSTICS.md) | what a failure collects, what it refuses to, the signature table |
| [`docs/SCENARIOS.md`](docs/SCENARIOS.md) | fifteen real failures, walked through from screen to fix |
| [`docs/KNOWN-LIMITS.md`](docs/KNOWN-LIMITS.md) | what one laptop cannot test — the honest version |
| [`CHANGELOG.md`](CHANGELOG.md) | every change, in the order it happened |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | the ground rules a patch has to meet |
| [`CREDITS.md`](CREDITS.md) | who made it, and who gets named for a bug that ships a fix |
| [`docs/V2-NOTES.md`](docs/V2-NOTES.md) | platform rotation and a messaging bridge, written up, not promised |

## Credits

<a href="https://github.com/MDHojayfa"><img src="https://github.com/MDHojayfa.png" width="76" align="right" alt="MDHojayfa"></a>

**MDH_AI** is designed and written by **[MDHojayfa](https://mdhojayfa.github.io/)** — extension, host,
installers, docs, the approvals, the 305 tests that argue with him, the lot. One person, one potato PC that
wheezes when Firefox is open, and a rule that nothing ships until the tests and the numbers agree. The 140 KB
budget is not a marketing figure; it is what the machine could build without catching fire.

If you report a bug that leads to a fix, or suggest something that ships, [`CREDITS.md`](CREDITS.md) names you
permanently; that is the deal behind every *Send an idea* button in the product.

The author line is in every file — 90 of them, plus the built artifact, the host's handshake and the comment field
of each release zip — and `npm test` fails if it goes missing from one. MIT still lets anyone fork this; see
[`docs/PROVENANCE.md`](docs/PROVENANCE.md) for what that actually buys, and [`NOTICE`](NOTICE) for the short
version.

The images at the top are **illustrations, not recordings**: they are generated by
[`tools/make-readme-art.mjs`](tools/make-readme-art.mjs) from the same labels, states and buttons the extension
renders, and every frame says so, because a mock passed off as a screenshot is a lie with good typography.

## Licence

MIT. See [`LICENSE`](LICENSE).
