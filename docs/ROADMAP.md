# Roadmap

This file is the shipped roadmap: what v1 is, what comes after, and why in that order.
The build sequence and gates live in `PLAN.md §4` (milestones M0–M10).

---

## v1.0 — Linux, three browsers, eight platforms

| Area | Included |
|---|---|
| Browsers | Chrome 116+, Brave (same artifact), Firefox 140+ |
| OS | Linux — x86_64 and aarch64 |
| Platforms | ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen, GLM, Grok |
| Keys | none, ever — the logged-in web session is the model |
| Tools | MCP servers the user already has + 9 builtin Linux tools |
| Safety | path allowlist, 3-state per-tool approval, audit log, optional container |
| Language | English |

**Not in v1:** Windows, macOS, stores, cloud, mobile, voice, multi-agent orchestration, Bangla.

---

## v1.1 — after the first month of real use

- **Bangla** prompt + UI (the item consciously deferred so v1 ships in English only)
- Firefox 121–139 support via `webextension-polyfill` — only if demand exists
- Domestic-China hosts end-to-end (`tongyi.aliyun.com`, `chatglm.cn`) verified in the matrix
- `--headless` host mode for 24/7 servers (no tab required)
- Per-tool policy editor in the popup, so `~/` additions do not require editing JSON

## v1.2 — depth, not breadth

- Streaming tool results back into the chat (today results arrive whole)
- Multi-tab: one driver tab per platform, leased
- `mdh-host` as a thin supervisor, so extension reloads never drop an in-flight call
- Skill files (`.mdh/skills/*.md`) — user-authored procedures the model may follow

---

## v2 — other operating systems

Windows first, then macOS. The bridge is the only OS-specific layer:
`src/host/os/linux.js` gains siblings, and the guard's deny list becomes per-OS. The extension,
parser, loop, and adapters do not change — that is the point of the layer split in `ARCHITECTURE.md`.

## v3 — more platforms

Arena, Meta AI, Perplexity, Copilot, Doubao. Each is one adapter file (~30 min by the checklist in
`PLATFORMS.md`). Order by whichever the community asks for first.

---

## Explicitly rejected, with reasons kept

| Idea | Why not |
|---|---|
| API-key mode as a fallback | breaks the single promise the project is built on |
| Bundling a headless Chromium | triples install size to save one step |
| Cloud relay for "24/7 without a PC" | hands the user's shell to someone's server |
| Auto-approve everything by default | one prompt injection = one owned machine |
| Store distribution | review delays, policy churn, and we cannot guarantee no-network |
