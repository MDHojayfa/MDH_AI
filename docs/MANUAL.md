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

## 2c2 · "It did nothing when I pressed Start"

Press **Check this page** in the popup's Advanced panel. It asks the page which of the platform adapter's
selectors still match and prints one line per part:

```
✔ ChatGPT wiring looks right
  ✔ composer: #prompt-textarea
  ✔ messages: [data-message-author-role="assistant"]
  ○ send: no send button matched — usually fine: most sites add it after you type
  · stream: sse/replace /backend-api/conversation
```

`✘` on **composer** or **messages** means the site changed its DOM and this build cannot drive it — report it,
that is a real bug and a quick fix. `○` on send or stop is normal: those buttons only exist at certain moments.

## 2d · What happened last time

**Advanced → Last run** shows one line: turns, elapsed, outcome and the reason if there was one (for example
`24 turns · 06:41 · paused (no reply arrived)`). The last twenty runs are kept locally. When something goes
wrong, that line plus the log page is usually the whole story.

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

## 3b · When you keep approving the same thing

Approve the same exact command twice in one run and the third card gains **Allow for this run** — no more cards
for that command until the run ends. It is deliberately narrow: pipes, `&&`, redirection, `$(…)`, backticks,
globs and `~` all disqualify it, because those can hide a second command. Nothing is saved, and the log still
records every execution.

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

## 2c · The completion code

Every session gets a six-character code, shown in **Advanced → Completion code**. It is the only thing that can
end a task: the model must call `finish` with `"phoenix":"PHX-XXXXXX"` in the arguments. A sign-off, a summary or
the word "done" does nothing — the loop answers the model, asks once more, and then pauses with **Mark as
finished** so you can overrule it.

Why it exists: a sentence cannot be checked, a code can. If a task ever ends at the wrong moment, look at that
code first — the transcript will show whether the model had it.

## 4c · Turning the chatter off

`Advanced → Mission chatter → hide the jokes` stops the ticker and hides **BARBOS MODE**. The choice is
remembered per profile. What does **not** change: the issue strip, **Report a bug**, **Send an idea**, the
**Share** button, every real status line and the failure cards. `./install.sh --no-fun` does the same for the
installer's own output; the popup switch is the one that lives in the browser.

## 5d · Getting your name in the credits

Every form the extension opens asks for a GitHub handle and says why: **if your bug report leads to a fix, or
your idea ships, the handle goes into `CREDITS.md`'s community section** — one line, permanently. You can write
"anonymous" instead and the entry stays anonymous.

The failure card also carries a **Send an idea ↗** link, because the moment something is missing is usually the
moment you are staring at a half-finished task.

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
that cannot be read.

The page has four controls, all of them honest about being URLs:

| Control | What it does |
|---|---|
| **Show** checkboxes (`ok`, `denied`, `error`) | filters the call table server-side; the header then says *"12 of 40 calls shown"* |
| **Log levels** (`debug`, `info`, `warn`, `error`) | filters the extension-log section the same way |
| **Hide log / Show log** | collapses the call table when you are screen-sharing; the totals stay |
| **Archive & clear…** | renames `audit.jsonl` with a timestamp and starts a new chain — a POST, with a confirm card, and it **never deletes** |

Filters live in the query string, so a narrowed view is a link you can bookmark or paste into a bug report. The
page still contains no script: the only CSP relaxation is `form-action 'self'`, for the filter form. The page shows totals,
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
