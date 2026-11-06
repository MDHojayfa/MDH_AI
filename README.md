# MDH_AI

**Give any web chatbot — ChatGPT, Claude, Gemini, DeepSeek — real control of your Linux machine.
No API key. No subscription beyond the one you already have. Approval on every action.**

Run one script, install one browser extension, keep chatting. The bot gets a terminal, real files,
and (optionally) a whole desktop.

---

## Why this exists

Every other route wants something from you:

- an **API key** (money, another account, rate-limit roulette)
- a **local model** (VRAM, weaker tool-calling)
- a **cloud agent** (their server, not your machine)

Your browser is already logged in to a frontier model. This project turns that session into an
agent with a shell — the same trick ZeroScript did for Roblox Studio, generalised to the desktop.

## How it works

```
chat UI  ──▶  browser extension  ──▶  local WebSocket  ──▶  Python bridge  ──▶  MCP stdio servers
(ChatGPT)     (reads the reply,       127.0.0.1 only       (spawns children,     (shell, files,
               injects the prompt,                          routes by name)       GUI, anything)
               asks you first)
```

1. The extension injects a compact tool catalogue into the chat.
2. The model replies with `{"mcp_call":{...}}`.
3. The extension shows you an **Allow / Ask / Deny** card.
4. The bridge runs the tool, the result is pasted back, the loop continues.

## Quick start (Linux)

```bash
# 1 · dependencies
sudo apt install -y nodejs npm python3 python3-venv
python3 -m venv .venv && . .venv/bin/activate
pip install websockets

# 2 · tell the bridge which tools exist
cat > app/server/servers.json <<'EOF'
{ "control_port": 8099,
  "servers": [ { "name": "desktop", "port": 8090,
                 "command": ["npx", "-y", "@wonderwhy-er/desktop-commander"] } ] }
EOF

# 3 · start it
python app/server/mcp_ws_bridge.py --config app/server/servers.json

# 4 · build both browser artifacts
cd app && npm run build && cd ..
```

Then load the extension:

| Browser | Load from | How |
|---|---|---|
| Chrome · Brave · Edge · Vivaldi · Opera | `app/dist/chrome/` | `chrome://extensions` → Developer mode → **Load unpacked** |
| **Firefox 140+** | `app/dist/firefox/` | `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json` |

Firefox needs no signing for a temporary load; it disappears on restart. For a permanent install,
`web-ext sign` with an AMO account.

Open a chat, and ask it to `list the files in my home directory`.

## Status

| Area | State |
|---|---|
| Core loop, 4 platforms, approval, systemd | ✅ working (upstream, tested) |
| English system prompt | ✅ done — see `CREDITS.md` |
| Firefox support | 🟡 build + shim + lint done (`dist/firefox`, 0 errors) — needs a live test in Firefox |
| Kimi / Qwen / GLM / Arena / Meta | ⛔ not yet |
| Rate-limit recovery | ⛔ not yet |
| Linux-first installer & docs | ⛔ not yet |

Full plan and effort estimates: [`docs/ROADMAP.md`](docs/ROADMAP.md)
Architecture and file map: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
Research trail: [`Workspace/Research/`](Workspace/Research/)

## ⚠️ Security, in plain words

This hands a language model a shell on your computer. The model's output is **untrusted input** —
any file or web page it reads can contain instructions that hijack it.

- default every server to **Ask every time**
- run the executor in its **Docker mode**, not on your home directory
- never point it at `~/.ssh`, `~/.config`, or your browser profile
- the bridge binds `127.0.0.1` only, with an Origin allowlist and an optional `--token` — keep it that way

## Licence

MIT. The base is MIT © 2026 AstraxOf; see [`CREDITS.md`](CREDITS.md). The notice must stay.
