# MDH_AI

**Your chatbot gets a terminal.**
Run one script, load one extension, keep chatting — and the AI you are already signed into gets real
control of your Linux machine: files, shell, apps.

No API key. No account, no provider setup, no model picker, no billing. The model is the web UI you
already have open.

> **Status:** v1 — design and specifications complete, implementation in progress.
> Requirements live in [`docs/PLAN.md`](docs/PLAN.md); the shipped scope is below.

---

## What you get

**8 AI platforms**, in the browser you already use:

| | Platform | | Platform |
|---|---|---|---|
| 1 | ChatGPT | 5 | Kimi |
| 2 | Claude | 6 | Qwen |
| 3 | Gemini | 7 | GLM / z.ai |
| 4 | DeepSeek | 8 | Grok |

**3 browsers**, one source, two artifacts:

| Browser | Notes |
|---|---|
| Chrome 116+ | side-loaded |
| Brave | same artifact as Chrome |
| **Firefox 140+** | first-class, not an afterthought |

**Linux only in v1** — x86_64 and aarch64. Windows and macOS are the v2 ports (`docs/ROADMAP.md`).

And on top of the 8 platforms it gives you:

- **9 builtin tools** — `list_dir`, `read_file`, `write_file`, `edit_file`, `run_command`,
  `search_files`, `file_info`, `sys_info`, `open_app`
- **every MCP server you already have**, with no extra config
- **3-state approval** on every call — Deny / Allow once / Always (this tab)
- **a path allowlist** — `~/projects`, `~/mdh`, `/tmp/mdh` by default; `~/.ssh` and your keyring are
  unreachable by design
- **an audit log** of every call, hash-chained
- **optional container mode** — rootless podman, no network
- **rate-limit recovery** that stops instead of hammering, so your account survives

## Install

```bash
git clone https://github.com/MDHojayfa/MDH_AI && cd MDH_AI
./install.sh                 # checks deps, registers the browser host, builds both artifacts
```

Then load the extension:

| Browser | Go to | Do |
|---|---|---|
| Chrome · Brave | `chrome://extensions` | Developer mode → **Load unpacked** → `dist/chrome` |
| Firefox | `about:debugging#/runtime/this-firefox` | **Load Temporary Add-on** → `dist/firefox/manifest.json` |

Open any of the 8 platforms, click the MDH icon, type a task — or just keep chatting; the tools are
attached to the tab.

```
"find every file over 100 MB in my projects folder and tell me what they are"
"this test is failing, look at the code and fix it"
"rename the screenshots on my desktop by date"
```

## How it works

```
   your chat tab                     native host (this machine)
┌──────────────────┐   native    ┌──────────────────────────────┐
│ extension        │  messaging  │  mdh-host                    │
│ · reads the      │◀───────────▶│  · policy gate               │
│   model's reply  │  no open    │  · 9 linux tools             │
│ · shows approval │  port       │  · your MCP servers (stdio)  │
│ · returns result │             │  · audit log                 │
└──────────────────┘             └──────────────────────────────┘
```

1. The extension injects a compact tool catalogue into the chat (~700 tokens).
2. The model answers with one JSON block: `{"mdh_call":{"tool":"run_command","arguments":{…}}}`.
3. A card appears over the composer: **Deny · Allow once · Allow**.
4. The host runs it, the result goes back as a message, the loop continues until the task is done.

There is no listening port, no server to keep running, and no cloud in the middle.

## Why not just use an API key?

Because the point is that there is nothing to configure. A key means an account, a model choice, a
rate-limit negotiation, and money — and it is a different product. This one asks: *you are already
talking to a frontier model; why can't it touch your computer?*

## Safety, in plain words

This hands a language model a shell. That is the honest description, and everything below follows
from it:

- anything the model **reads** can try to hijack it (a file, a web page, a command's output)
- approval is on by default, and `run_command` never auto-approves
- the allowlist means "these folders or nothing"; symlinks are resolved before the check
- denial is final — the extension will not quietly re-send a call you refused
- the audit log tells you exactly what ran, and when

Read [`docs/SECURITY.md`](docs/SECURITY.md) before pointing this at anything you care about. It names
what is mitigated and what is not.

## Documentation

| | |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | scope, milestones, definition of done |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | layers, invariants, failure behaviour |
| [`docs/PLATFORMS.md`](docs/PLATFORMS.md) | the 8 adapters and how to add the 9th |
| [`docs/SECURITY.md`](docs/SECURITY.md) | threat model and residual risk |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | v1.x, v2, v3 — and what was rejected |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | every choice, with the alternative that lost |

## Requirements

Linux, one of the 3 browsers above, Node 20+ (for MCP servers you may already have), a free account on
at least one of the 8 platforms. Nothing else.

## Licence

MIT © 2026 MDHojayfa.
