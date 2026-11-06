# Roadmap

Status legend: ✅ done · 🔄 in progress · ⛔ not started · 🧪 needs a real browser to verify

---

## P0 — Research ✅

Everything in `Workspace/Research/`. Conclusions that changed the plan:
- The "free web chat → local tools" architecture already exists and is proven (ZeroScript, 407★).
- The generic version exists but is 8 days old with 1 commit (`AstraxOf/web-mcp-bridge`, MIT, 10★).
- Agent-browser CLIs do not run third-party extensions; Chromium/CDP stacks can.
- Hermes / FCC / codex-chatgpt-web all require a model provider → they fail the "no API key" contract.

## P1 — Base taken over ✅ (2026-11-06)

- Imported `AstraxOf/web-mcp-bridge` into `app/` (537 KB, 59 files, MIT notice retained).
- Verified the full test suite runs green **before** touching anything (8 suites, JS + Python).
- Rewrote the **model-facing system prompt** in English (was Spanish — it made models answer in Spanish).
- Rewrote **error diagnostics** the model sees when its JSON is malformed.
- Updated tests + added a regression guard that fails if Spanish leaks back into the prompt.

## P2 — Firefox support 🟡 · core done, needs a live test

The reason: **Firefox has no service workers.** `background.service_worker` is ignored
(Mozilla bug 1573659); Firefox MV3 runs an *event page* declared with `background.scripts`.

- [x] build step producing `dist/chrome` + `dist/firefox` from one source (`tools/build.mjs`)
- [x] `browser_specific_settings.gecko.id` + `strict_min_version: 140` + `gecko_android: 142`
      + required `data_collection_permissions: ['none']`
- [x] drop `minimum_chrome_version` for the Firefox build
- [ ] host-permission flow: `browser.permissions.contains()` + request prompt
      (needed only below Firefox 140, where hosts were not granted at install — we require 140+)
- [x] API shim `shared/compat.js` — points `chrome` at `browser` on Firefox; no-op on Chromium.
      Verified safe: the codebase has **zero** callback-style call sites
- [ ] build step producing `dist/chrome` + `dist/firefox` from one source
- [x] `web-ext lint`: **0 errors**, 0 notices (3 warnings = static SVG icons in `popup.js`)
- [x] fixed a real upstream bug: `server/servers.example.json` had a trailing comma → invalid JSON
- [ ] 🧪 temporary install via `about:debugging` + run the 4 adapters
- [ ] 🧪 verify all 4 adapters in Firefox against the live sites

## P3 — More platforms ⛔ · ~half a day each

Current: ChatGPT, Gemini, Claude, DeepSeek.

- [ ] Kimi · [ ] Qwen · [ ] GLM (z.ai) · [ ] Arena · [ ] Meta AI · [ ] Grok · [ ] Copilot

Each is a `selectors` object against `base_adapter` (~50 lines), or a custom observer if the site
renders calls outside the message bubble (ChatGPT needed 371 lines).

⚠️ ZeroScript has working adapters for all of these — **GPL-3.0**. Read the behaviour, write our own
selectors. Do not copy files.

## P4 — Rate-limit recovery ⛔ · ~1 day

The thing that makes free tiers usable. When the site says *"Messages too frequent"*:
detect → stop the loop → persist the pending call → wait → reload → resume, with a runaway guard.
Re-implement the behaviour; the GPL code stays untouched.

## P5 — Linux-first packaging ⛔ · ~1 day

- [ ] `install.sh` — deps, venv, `servers.json`, systemd `--user` unit, uninstall
- [ ] English README for the app (upstream is Spanish-first)
- [ ] translate remaining UI strings (`popup.html`, `ui_widget.js`)
- [ ] pre-filled `servers.json` with DesktopCommander + `"disabled": true` for the GUI server

## P6 — Hardening ⛔

- [ ] token by default, not optional
- [ ] per-tool (not per-server) permissions
- [ ] audit log written to disk, not just popup history
- [ ] prompt-injection test corpus: feed hostile file contents, assert approvals still fire

---

## Open decisions

1. **Primary browser**: Brave (best privacy, Chromium, zero port work) or Firefox (needs P2 first).
2. **Prompt language**: English now. Bangla as a toggle, or English only?
