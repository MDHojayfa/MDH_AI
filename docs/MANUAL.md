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

## 2b · The pill on the chat box

On any of the eight platforms a small pill appears above the composer. It is the main control:

| The pill | Clicking it |
|---|---|
| **▶ Start** | opens a one-field panel; type a task, press Enter |
| **⏳ Waiting** | pauses the loop (it can always be resumed) |
| **⚙ Working** | pauses after the current tool returns — never mid-write |
| **↻ Resume** | continues from the last pending call |
| **↻ Again** | re-runs the last task verbatim |
| **! Report** | opens the failure card with the diagnostics already collected |

Drag it anywhere; the position is remembered per profile. `Esc` closes the panel. The task you typed last is
remembered too, so **Start** after a refresh is one click and no retyping.

## 4c · Turning the chatter off

`Advanced → Mission chatter → hide the jokes` stops the ticker and hides **BARBOS MODE**. The choice is
remembered per profile. What does **not** change: the issue strip, **Report a bug**, **Send an idea**, the
**Share** button, every real status line and the failure cards. `./install.sh --no-fun` does the same for the
installer's own output; the popup switch is the one that lives in the browser.

## 5c · The local log page

```
./install.sh --diagnose   # the machine facts a report would carry, printed for pasting
mdh-log             # writes ~/.local/state/mdh/log.html and prints the path
mdh-log --open      # …and opens it in your browser
mdh-log --serve     # live view on 127.0.0.1, random port, token in the URL
mdh-log --json      # summary for a script or a paste
```

From the UI: **popup → Advanced → Log viewer**, or **Log viewer** on the failure card. The served page
refreshes itself every five seconds; the saved file does not, because a page that reloads on disk is a page
that cannot be read. The page shows totals,
p50/p95 per tool, every call newest-first with its chain hash, and the last failure with its hypotheses. It is
one file with inline CSS and **no script at all** — it works with the network unplugged. The live mode binds
loopback only and refuses every request without the token printed next to the URL.

## 5b · Reporting a problem, and sharing the project

The popup opens with one line about reporting problems — a different one each run, from a pool of twenty —
and three buttons under it:

| Button | What it does |
|---|---|
| **Report a bug** | opens the GitHub bug form with the stage, platform and browser filled in. Add the log. |
| **Send an idea** | opens the feature form. No template required, one sentence is enough. |
| **Share** | opens the share sheet; copies the link, or opens a pre-filled post |

When the loop fails, a card appears **inside the page**, directly under the real error, because that is the
moment you have the information and the motivation at the same time. It carries the browser, OS, page, log
trail and — through the host — the kernel, clock skew, free disk, tunnel interfaces and MTU. It labels the top
hypothesis (`Likely: the plan is rate-limited right now`) and the fix. Nothing is uploaded: the card shows
exactly what will be sent, then opens GitHub's form pre-filled.

Two things the bug form will never contain, by design: your file paths and the URLs you visited. They are
replaced with `<path>` and `<url>` before the link is built. If the path matters, type it yourself.

Your **public IP** is the opposite case: it can be the actual cause (a blocked address looks exactly like a
broken extension), so the card offers it behind a checkbox that starts unticked. Ticking it makes one request
to a documented IP-echo endpoint and adds the result to the report. Nothing is stored, and the next report
starts unticked again. Full detail: [`docs/DIAGNOSTICS.md`](DIAGNOSTICS.md).

The share sheet opens itself **once per profile** and then stays a button. Instagram and TikTok cannot accept
a pre-filled post from a URL, so those two copy the link and open the app — the sheet labels them that way
rather than pretending.

## 6 · Habits that keep you out of trouble

1. Start with a fresh chat per task. A 40-turn chat with tools is hard for the model to keep straight.
2. Keep the allowlist narrower than you think you need.
3. Never approve `curl … | sh`, `sudo`, or anything you cannot read in one glance.
4. If a task needs more than ~25 tool calls, split it.
5. Put throwaway work in `/tmp/mdh`, not in a real project.
6. If you want a hard boundary, run in container mode (Policy → **Container**) — no network, only the
   mounted folder.
