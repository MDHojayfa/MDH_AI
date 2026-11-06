# Credits

**MDH_AI** — MIT © 2026 MDHojayfa.

## Original work

Everything in `src/`, `host/`, `tools/`, `install.sh`, `docs/` and the extension manifests is original
work for this project: the network interceptor, the reply parser and repair ladder, the prompt
renderer, the agent loop, the native-messaging transport, the Linux bridge host, the policy engine, the
adapter format, and the build.

## Ideas studied, no code copied

Several existing projects explore parts of the same idea — a web chat driving local tools. Their
behaviour was read to understand the problem; **no file, function or identifier from any of them was
copied into this repository.** Each of them is credited by its own repository; the closest neighbours
are noted here so a reader knows where the idea came from:

- prior art for "web chat → local tools" that shaped the loop design (works in a single application)
- prior art for MCP over a browser extension (4 platforms, no Firefox)
- prior art for per-platform network interception (automated browser, not the user's tab)

Two of those are copyleft. Reading them was deliberate and their licences were respected: this project
is MIT and stays MIT precisely because nothing was lifted from them. If you are ever tempted to paste a
function from a GPL project into this one, don't — it would force the whole repository to GPL-3.0.

## Tools this project drives (not bundled, not required)

| Tool | Licence | Role |
|---|---|---|
| MCP servers of your choosing | as licensed upstream | the model's tools: shell, files, GUI, databases, anything |
| [`wonderwhy-er/DesktopCommanderMCP`](https://github.com/wonderwhy-er/DesktopCommanderMCP) | MIT | a good default executor (terminal + filesystem) |
| [`agent-sh/computer-use-linux`](https://github.com/agent-sh/computer-use-linux) | MIT | optional real GUI control on Linux (AT-SPI) |

They are started by the host as child processes; none of their code is in this repository.

## Third-party code currently present

`app/` is an **older, separately licensed snapshot** kept in this tree until version 1.0 replaces it. Its
own MIT notice is in `app/LICENSE` and travels with those files: anything redistributed from `app/` must
keep that notice. None of it is used by v1 code in `src/` and `host/`, and at 1.0 the directory is
deleted, which removes this section from the project entirely.

## Fonts, images, icons

None from third parties. The three SVG icons are drawn for this project.
