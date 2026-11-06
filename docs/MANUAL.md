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

The popup's **Advanced** panel shows **Last page check** — a verdict the page itself produces a few seconds after
loading, with the time. If it says `✘ composer`, the site changed; if it says `✔ matches`, the page is fine and the
problem is somewhere else.

Press **Check this page** in the same panel. It asks the page which of the platform adapter's
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

## 2b2 · "Why is the pill like that?"

Hover it. The pill's tooltip carries the phase, the turn and — when there is one — the reason it stopped:

> Paused — nothing lost, click to continue — the model could not produce the completion code · turn 24

The same sentence is the pill's `aria-label`, so it is available to a screen reader rather than being decoration
only a mouse can reach.

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

## 3a · Notes the model gets every run

**Advanced → Notes for every run** is the closest thing here to a `CLAUDE.md`: up to 1,200 characters, typed once,
sent at the top of every new task.

```
I use pnpm, not npm. Python is python3, and there is no venv outside ~/work/api.
Never touch ~/work/legacy. Answer in Bangla if I write in Bangla.
```

Saved when the field loses focus (no Save button to forget), stored locally, quoted verbatim. It is not sent to
anyone but the chat you are already driving.

## 3a1 · Plan first (read-only until you approve)

Tick **Plan first** in Advanced and every run starts read-only. The model may look — list, read, search, inspect —
and nothing else. It must then call `propose_plan`; you get a card with the steps and two buttons:

- **Approve and continue** — the same run carries on and may now change things;
- **Keep planning** — it stays read-only and has to come back with a better plan.

A write, a command or an app launch during plan mode is refused before it reaches the host, with a message that
tells the model why. That refusal is a rule in the loop, not a note in the prompt — the prompt could be ignored.

## 3a2 · Skills (playbooks)

**Advanced → Skills** holds short playbooks, one `## name` block each:

```
## build
pnpm build && pnpm test

## deploy
only from main, and only after the tests pass
```

The model sees **only the names** — `Skills the user has written: build, deploy` — and calls `read_skill` with a
name when one matches the task. The body then arrives as a tool result. That is the whole trick: a playbook
costs nothing until it is needed, and an unused playbook for another day's task never eats the context.

There is no folder to find and no file to edit, which is deliberate: this product has no repository to keep a
`CLAUDE.md` in, and telling a potato-PC user to `mkdir -p ~/.config/mdh/skills` is a setup step, not a feature.

## 3b · The allow drop-down

The approval card has one big safe answer — **Allow once** — and a caret with the longer promises:

| Choice | Ends when | Saved? |
|---|---|---|
| Allow for this run | the task ends | no |
| Allow for this session | the browser restarts | locally, with a boot stamp |
| Always allow on this site | you remove it | locally, per chat site |

Every choice is still tied to one exact command. Anything with `&&`, `;`, a pipe, a redirect, `$(…)`, backticks,
globs or `~` gets no menu at all, because it can hide a second command — the card says so instead of offering a
button that would be a lie. Remembered approvals are listed in **Advanced → Remembered approvals**, each with a
✕; removing one takes effect at the next call. Every execution is still written to the log.

## 3d · "Runs on a potato" — the receipts

```bash
npm run weigh          # human table
npm run weigh -- --json
```

It weighs the extension you actually install, starts the host for real and times it to the first `ready` frame,
reads the host's resident memory, and counts dependencies. Current numbers on a two-core test box: **139 KB
zipped · ~60 ms to ready · 55 MB resident · 0 dependencies**. If any of those crosses its budget the script exits
non-zero, so the claim cannot quietly rot. The comparison this backs up is in
[`WHY.md`](WHY.md) — including what other tools do better.

## 3c · Moving a stuck task to another chat

When the pause card appears, one of its buttons is **Copy handoff**. It puts this on the clipboard:

```
# Continuing a task from another chat

Task: install the app and make the tests pass
Plan:
- clone the repo — done
- run npm test — in progress
Last results (most recent last):
- run_command [ok]: npm test → 208 passing
- read_file [ok]: package.json …
Next step: fix the two failing parser tests
Do not redo work that already succeeded — the results above are real.
```

Open any other chat, paste it, press Start there. It is a summary of what **ran**, not of what was said — which is
why it stays short enough to be useful. The completion code travels with it, so the new chat can finish the task
properly.

This is the manual version of rotation; `docs/V2-NOTES.md` §1 is the automatic one, with the failure modes that
have to be solved before it can ship.

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
mdh-log --runs      # one line per run: id, calls, failures, when, which tools
mdh-log --run abc123def4   # one run, call by call, in order
```

`--runs` and `--run` are the page's run view without the page: same grouping, same order, printed to your
terminal for a paste into an issue. A run that is not in the audit prints a sentence and exits 1 — no empty
table pretending the work never happened.

From the UI: **popup → Advanced → Log viewer**, or **Log viewer** on the failure card. The served page
refreshes itself every five seconds; the saved file does not, because a page that reloads on disk is a page
that cannot be read.

The page has four controls, all of them honest about being URLs:

| Control | What it does |
|---|---|
| **Show** checkboxes (`ok`, `denied`, `error`) | filters the call table server-side; **tick any number** — two, three or none. Nothing ticked means *everything*, and the page says so. Each box carries a count, and the header then says *"12 of 40 calls shown"* |
| **Log levels** (`debug`, `info`, `warn`, `error`) | the same, multi-select, with counts |
| **Hide log / Show log** | collapses the call table when you are screen-sharing; the totals stay |
| **Archive & clear…** | renames `audit.jsonl` with a timestamp and starts a new chain — a POST, with a confirm card, and it **never deletes** |

Click a run and the page opens it end to end: when it started, when it stopped, which tools it used, what
failed, and the sequence in order (`list_dir ok → run_command ok → write_file denied → finish ok`). Every row has
a **details** arrow that reveals the summarised arguments, the full hash and the run id — the audit entry itself,
not a summary of it. No script is involved: `<details>` is HTML.

Above the filters, **Runs** groups the calls by the run that made them: id, call count, failures. Click one to see
only that run (`?run=…`) — the fastest way to answer "what did it actually do in that session?", and the id is
also shown in the popup's *Last run* line if you need to quote it.

Filters live in the query string, so a narrowed view is a link you can bookmark or paste into a bug report —
`?status=error&status=denied&level=warn&q=exit` is a valid view. **Show all** clears every box at once. The
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
