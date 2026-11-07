# Why this exists, and what it is not

Most "AI agent that controls your computer" projects assume three things: an API key, a machine with headroom,
and a developer who is comfortable in a terminal. This one assumes none of them.

## The honest comparison

| | MDH_AI | Claude Code / Codex CLI | OpenClaw / gateway agents | Hosted agent services |
|---|---|---|---|---|
| **API key** | **not required** — it drives the chat you are already signed into | required (or a paid plan with a CLI token) | required: you configure model providers | required, and billed per token |
| **Account** | the one you already have open in a browser tab | vendor account | vendor account + bot tokens for each channel | vendor account |
| **Setup** | unzip an extension, run `./install.sh`, click Start | install a CLI, authenticate | install a gateway daemon, configure channels, wire skills | sign up, connect, pay |
| **What runs locally** | a ~10k-line extension + a ~50 MB Node host | the CLI itself | a long-running gateway + channel adapters | nothing |
| **Hardware** | a laptop that can run a browser tab | any dev machine | a machine that can stay on 24/7 | none |
| **Where the model runs** | in the chat provider's tab, as you | provider API | provider API or local model | their servers |
| **Approval before a command** | a card, per call, with run/session/site scopes | permission modes | configurable | usually none |
| **Audit trail** | local hash-chained `audit.jsonl` + a log page | session transcript | logs | their dashboard |
| **Messaging channels** | none (planned, see V2 notes) | none | 15+ channels — its killer feature | varies |
| **Hooks / skills / subagents** | none yet | yes, and they are excellent | skills via a hub | varies |

That table is deliberately uncomfortable to read. If you want messaging integrations, subagents or a local model,
those projects are the right answer and this one is not. What MDH_AI has that they mostly do not:

1. **No API key, no per-token bill.** The chat you pay for (or use for free) does the thinking. The extension is a
   pair of hands, not a second brain.
2. **Nothing to keep running.** No daemon, no gateway, no bot token, no port to remember. Close the browser and it
   is gone; that is a feature, not a limitation.
3. **It fits on the machine you actually own.** See the numbers below, measured by `npm run weigh` on a two-core
   test box, and enforced by a test — a budget that breaks the build rather than a paragraph that breaks trust.
4. **The guardrails are the product, not an add-on.** Every command is shown before it runs, the policy has two
   independent layers, and the audit log is hash-chained and readable at `127.0.0.1`.

## The numbers, on this machine

```
$ npm run weigh
extension (unpacked)  416 KB in 40 files
extension (zip)       147 KB
source                11,702 lines
npm dependencies      0 — Node standard library only
host startup          61 ms to ready
host memory           55 MB resident
```

What that means in practice: the extension downloads faster than a web font, the host uses less memory than the
chat tab it is driving, and it is ready before you can move the mouse. Zero npm dependencies means nothing to
`npm install` — no lockfile drift, no supply chain, no post-install script from a stranger.

**The developer does not have a NASA PC.** Neither does most of the world. A tool that needs 8 GB of free RAM to
type a command into a chat window has misunderstood the job.

## What it deliberately does not do

- **No hidden network calls.** The host binds loopback only, the extension talks to it through native messaging and
  to the chat page you are on. There is no telemetry endpoint to leak to.
- **No "autonomous" mode.** It stops when the model stops behaving, asks when a decision is not its to make, and
  ends only when the model returns the session's plug (`docs/PLUG.md`).
- **No pretending a platform works.** `docs/PLATFORMS.md` lists what was tested on which platform, and
  `docs/KNOWN-LIMITS.md` says what one laptop cannot test. The popup's **Check this page** is the same honesty, in
  a button.

## The one-sentence version

If you already have a chat window open and a terminal you can copy a command into, MDH_AI turns the first into a
hands-on operator for the second — no key, no bill, no gateway, no drama.
