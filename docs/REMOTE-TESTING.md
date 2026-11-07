# Testing on a machine that is not this one

The awkward part, said plainly: **the machine that builds this repository has no browser and no route to another
one.** It can pull from npm, PyPI and GitHub. It cannot accept an SSH connection, cannot reach a laptop, and cannot
be handed a login. So temporary access to your Debian 13 box would not put a browser in front of this code — the
running has to happen where the browser is, and the report has to travel by copy and paste.

`tools/selftest.mjs` exists to make that one step short. It is written to be run by somebody who is not a developer,
on a machine they intend to delete afterwards.

> The expanded, beginner-level version of this page — every command explained, plus what to do with the
> screenshots and how to delete the account completely — is [`docs/TEMP-USER.md`](TEMP-USER.md).

## 1. The throwaway user, as you described it

```bash
sudo adduser mdh-test          # a throwaway password is fine
sudo -iu mdh-test              # everything below runs as this user
```

Nothing here needs root. The extension, the host, the audit log and the config all live inside that user's home, so
`sudo deluser --remove-home mdh-test` removes every trace of it. You need `node` 20+ on the PATH and Firefox 140+
(Debian 13 ships a newer one) or a Chromium-family browser.

## 2. What to run

```bash
git clone https://github.com/MDHojayfa/MDH_AI && cd MDH_AI
./install.sh --doctor               # what is installed, what is missing, the fix under each failure
node tools/selftest.mjs --browser   # the checks that need no window … and drive a real browser if there is one
./install.sh                        # if the doctor asked for it; then load the extension as it prints
```

The selftest writes `~/.local/state/mdh/selftest-<timestamp>.md` and prints the path. That file is the report: check
results, versions, and home paths only where they explain a failure. No file contents, no conversation text, no
commands the agent ran, no environment variables. Read it before it goes anywhere — it is written to be read.

## 3. The browser half, by hand

`--browser` can only drive a Chromium-family browser, because the DevTools protocol is the only one this project
speaks without a dependency. Firefox is driven by a person, with this table:

| Step | What "working" looks like |
|---|---|
| load `dist/firefox/manifest.json` via `about:debugging` | the add-on appears with no red error |
| open any of the eight chats | a small `▶ Start` pill sits above the composer, at its right edge |
| click it | the pill says *Starting*, the composer fills with a long prompt and sends itself |
| the model replies with a `{"mdh_call": …}` block | a card appears asking to allow the command, showing the *exact command* |
| press *Allow once* | the command runs and its result is typed back into the chat as `[MDH_RESULT#…]` |
| ask for something long | the result comes back with a `/tmp/mdh/spill/…` path instead of 40 KB of text |
| `~/.local/share/mdh/mdh-log --serve` | the local page opens, lists the run, and the chain says ok |

## 4. What to send back

1. `selftest-<timestamp>.md`.
2. `./install.sh --diagnose` — machine facts, no contents.
3. `mdh-log --json`, if a run misbehaved.
4. One sentence: which row above failed, and what the screen showed instead. That sentence is worth more than a log
   file, because it names the stage.

Screenshots are welcome and need no care taken: the audit log is the record, not the picture.

## 5. What this is not

Not a remote session, and not a promise of a same-day fix. It is the shortest path from a fresh user account to the
one thing this repository cannot produce by itself: evidence from a real browser, on a real distribution, with a
real signed-in chat.
