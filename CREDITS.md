# Credits & provenance

This project stands on other people's work. Attribution is a licence condition, not a courtesy —
the MIT licence in `LICENSE` **must not be stripped**, and the upstream notice in `app/LICENSE`
must stay with the code it covers.

## Code included

| Source | Licence | What we took | Where |
|---|---|---|---|
| [`AstraxOf/web-mcp-bridge`](https://github.com/AstraxOf/web-mcp-bridge) | **MIT** © 2026 AstraxOf | The whole base: MV3 extension (adapters for ChatGPT / Gemini / Claude / DeepSeek), the agentic loop, the tolerant JSON parser, the approval widget, the Python WebSocket↔stdio MCP bridge, the systemd/launchd installer, and the test suite | `app/` |

**What that means:** the base is MIT, so this repository may be published, modified and even sold.
The single obligation is that the copyright notice and the licence text travel with the code. That is
why `LICENSE` carries the upstream line and `app/LICENSE` is untouched.

## Behaviour referenced, no code copied

| Source | Licence | How it was used |
|---|---|---|
| [`sebattfg/ZeroScript-Free`](https://github.com/sebattfg/ZeroScript-Free) | **GPL-3.0** | Read only, to understand the architecture: extension → local WebSocket bridge → MCP stdio child processes, and the agentic loop that pastes results back into the chat. No file, function or identifier from it was copied into this repository. **Copying even one function from it would force this whole project to GPL-3.0.** |

## Downstream tools this project drives (not bundled)

| Tool | Licence | Role |
|---|---|---|
| [`wonderwhy-er/DesktopCommanderMCP`](https://github.com/wonderwhy-er/DesktopCommanderMCP) | MIT | Terminal, filesystem, process control — the "executor" MCP server |
| [`agent-sh/computer-use-linux`](https://github.com/agent-sh/computer-use-linux) | MIT | Real desktop GUI control on Linux (AT-SPI), optional second server |

## Original work in this repository

- `app/content_scripts/prompt_builder.js` — system prompt rewritten in English (was Spanish)
- `app/content_scripts/mcp_parser.js` — model-facing error diagnostics rewritten in English
- `app/tests/test_prompt.mjs`, `app/tests/test_parser.mjs` — updated assertions + a regression guard
  that fails if Spanish text leaks back into the prompt
- `Workspace/Research/` — the research that produced these decisions
- `docs/` — architecture and roadmap

Everything else listed in `docs/ROADMAP.md` is still to be written and will be ours.
