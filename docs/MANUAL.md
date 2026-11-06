# Manual — the ten-minute version

## 1 · Install (2 minutes)

```bash
git clone https://github.com/MDHojayfa/MDH_AI && cd MDH_AI
./install.sh
```

The script checks dependencies, registers the local host for every browser it finds, builds
`dist/chrome` and `dist/firefox`, and finishes with a live `ping → pong` against the host. If that last
line does not say `ok`, nothing else will work — fix it before continuing.

Then load the extension once:

| Browser | Address bar | Then |
|---|---|---|
| Chrome / Brave | `chrome://extensions` | enable **Developer mode** → **Load unpacked** → pick `dist/chrome` |
| Firefox | `about:debugging#/runtime/this-firefox` | **Load Temporary Add-on** → pick `dist/firefox/manifest.json` |

Firefox forgets a temporary add-on when it restarts; re-load it, or sign it once with `web-ext sign`.

## 2 · First run (1 minute)

On install, one background tab opens the author's GitHub profile
(<https://github.com/MDHojayfa>) — once, and it closes like any other tab. The popup footer links the
profile and the site permanently. Nothing about you is sent anywhere; there is no telemetry to send it
with.

1. Open one of the eight platforms and start any chat.
2. Click the **MDH** icon. The status should be **ready** with `host connected`.
3. Type a task in the popup, or just type it in the chat itself, and send.

The first message you send carries the tool catalogue. From then on the model knows it can act.

**Good first tasks** — small, reversible, immediately verifiable:

- `list the files in ~/projects and tell me which one looks abandoned`
- `how much disk is left, and what is the biggest folder in my home directory?`
- `read package.json in this project and tell me the scripts`

Avoid the urge to start with "clean up my downloads".

## 3 · Approvals

Every action that can change something shows a card above the composer:

```
MDH wants to run a command
  git status
  in  ~/projects/mdh-ai
  Deny        Allow once        Allow
```

- `Esc` denies, `Enter` allows once.
- **Allow once** is the default choice; **Allow** remembers the exact call signature for this tab.
- **Deny is final**: the model is told not to retry, and if it asks again you get a "stop it?" prompt.
- Silence for 2 minutes = deny.

Read commands before approving. This is the only place a human is in the loop.

## 4 · Where the knobs are

| Knob | Where | Default |
|---|---|---|
| allowed folders | popup → **Policy** | `~/projects`, `~/mdh`, `/tmp/mdh` |
| auto-approve a tool | the card's **Always** | off for everything dangerous |
| tool timeouts | `~/.config/mdh/config.json` | 60 s commands, 120 s MCP |
| MCP servers | `~/.config/mdh/servers.json` | your existing ones |
| audit log | `~/.local/state/mdh/audit.jsonl` | on, hash-chained |

Adding a folder: **Policy** → paste a path → **Add**. It is checked with `realpath`, so symlinks and `..`
tricks do not sneak past it.

## 4b · The mission log, and how to switch it off

While a reply is pending, the in-page card shows two things: a real sentence about the real state, and a
rotating line from mission control — *contacting the aliens on the Moon*, *routing packets through
Apollo 11*, *setting up the laser weapon on Pluto*. The joke is tagged `fun`; the status is not.

The popup has **BARBOS MODE**, a small boot log. Lines tagged `sys` and `host` are real events from the
extension. Lines tagged `MOON`, `MARS`, `JUPITER`, `PLUTO` or `DEEP SPACE` are decoration, rotated from
`src/core/fun.js`. The counter in the corner is real, because a log that lies about its own size is the
first step towards a log that lies about everything.

Turn all of it off:

```bash
./install.sh --no-fun      # a quiet install; nothing else changes
```

Nothing in the joke file can claim a success, mention your data, or touch credentials — there is a test
that enforces each of those three rules (`tests/fun.test.mjs`).

## 5 · When it stops working

| Symptom | Cause | Fix |
|---|---|---|
| popup: `host offline` | manifest not registered, or Node moved | `./install.sh` again; it prints the exact path |
| popup: `unsupported page` | not one of the eight | open a supported chat |
| nothing happens after sending | the model answered in prose | send `use your tools` once; the reminder line usually prevents this |
| "could not read your last reply" | malformed JSON block | it re-asks once automatically; if it repeats, stop and try a shorter task |
| countdown that never moves | provider is refusing | wait it out, or press **Stop** and resume later |
| reply never arrives | tab was closed, page reloaded | the pending call is saved; press **Resume** |
| Firefox lost the extension | temporary add-on | re-load from `about:debugging` |

## 6 · Habits that keep you out of trouble

1. Start with a fresh chat per task. A 40-turn chat with tools is hard for the model to keep straight.
2. Keep the allowlist narrower than you think you need.
3. Never approve `curl … | sh`, `sudo`, or anything you cannot read in one glance.
4. If a task needs more than ~25 tool calls, split it.
5. Put throwaway work in `/tmp/mdh`, not in a real project.
6. If you want a hard boundary, run in container mode (Policy → **Container**) — no network, only the
   mounted folder.
