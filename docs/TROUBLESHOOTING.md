# Nothing works. Start here.

```bash
cd MDH_AI
./install.sh --doctor
```

That prints one line per thing that can be wrong, and under every `FAIL` the single command that fixes it. It is
read-only, it writes nothing, and it is happy to be run when everything is fine.

If you would rather read the decision tree than run a command, it is below. Every branch names the symptom you can
actually see, the cause, and the fix — in the order a person hits them.

---

## 1. "There is no pill on the chat page"

The pill is the whole interface. No pill means one of four things, in roughly this order of likelihood.

**a. The extension is not loaded.** This is the one step no script can do: browsers have no command-line for
"load unpacked".

```
chrome://extensions  (or brave://extensions)
→ Developer mode (top right)
→ Load unpacked → choose MDH_AI/dist/chrome
→ the extension appears in the list, no red "Errors" button
```

Firefox: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → pick `dist/firefox/manifest.json`.
A temporary add-on disappears when Firefox closes; that is Firefox's rule, not this project's.

**b. You are on a page that is not one of the eight.** `docs/PLATFORMS.md` lists them. The pill only appears on a
supported site and only after the page has finished loading. If the site redirected you to a login screen, the pill
appears once you are back on the chat itself.

**c. The pill is hidden for that site.** You (or a stray click) hid it: the pill has a ✕ that remembers the choice
per site. The popup lists hidden sites and has *Show it again*.

**d. The extension is loaded but broken.** `chrome://extensions` shows an **Errors** button on the extension card
when its service worker threw. Click it; the first line is the real one. `./install.sh --doctor` covers the rest.

## 2. "There is a pill, but pressing Start does nothing"

**a. The host is not registered.** Start asks the local host for the tool list before it sends anything. Doctor's
*the native host is registered* line is the check; the fix is `./install.sh`, then reload the page.

**b. The extension id changed.** It cannot, if you loaded `dist/chrome` from this repository — the id is pinned by
the key in `src/overlays/chrome.json`, not by where the folder sits. If you edited that file, the host manifest no
longer matches: run `./install.sh` again.

**c. The composer was not found.** The platform changed its page. Nothing can be sent into a composer that does not
exist, so the agent stops with *composer not found* and offers *Copy handoff*. This is the failure
`docs/PLATFORMS.md` tracks per platform, and the one worth reporting — the report includes the selector list it
tried.

## 3. "It works, then stops: `[NO_HOST]`"

The native port closed. In order: the host crashed (check `mdh-log`, or run `node host/mdh-host.mjs` by hand and
read stderr), the browser was not restarted after `./install.sh` (native manifests are read at browser start), or
the host file moved and the wrapper points at nothing (doctor checks exactly that).

## 4. "npm: command not found" / "should I use sudo?"

**You do not need npm at all.** It is not used to install, build, run or test this project. `install.sh` calls
`node tools/build.mjs`; every script has a `node tools/*.mjs` equivalent. If a guide — including an old version of
this one — told you to run `npm something`, that guide was wrong.

**Sudo is only for installing Node itself**, and only on distributions that install it from a package manager:

| Distribution | Command |
|---|---|
| Debian, Ubuntu, Mint | `sudo apt install nodejs` |
| Fedora | `sudo dnf install nodejs` |
| Arch, Manjaro | `sudo pacman -S nodejs` |
| none of the above | `nvm install 22` (no sudo, installs under your home) |

Nothing else here needs root. If you ever end up with root-owned files inside this repository — usually after
`sudo npm install` — reclaim them with `sudo chown -R "$USER:" .` and never run npm here again.

## 5. "The browser says *Invalid native messaging host name*"

The manifest is missing, malformed, or names a path the browser refuses. Doctor prints the exact file it looked at
and what it found. Common causes: a Firefox profile that had never been opened when you ran the installer (open
Firefox once, run `./install.sh` again), and an `allowed_origins` entry that no longer matches the extension id.

## 6. "It says the message was not accepted by the page"

The composer took the text and the page refused to send it. Usually the site is mid-stream from its last answer:
wait, or press Start again. It is also what you see if the send button is disabled because the model is answering —
the agent waits up to five seconds for that, and gives up rather than clicking a button that currently means *Stop*.

## 7. "The conversation is too long" (ChatGPT) / "It forgot everything"

Different problem, with its own answer: `docs/SCENARIOS.md` §19 and the *Continue in a new chat* button. Claude
compacts automatically; ChatGPT refuses, so the run has to move.

## 8. "I want to know what it did"

```bash
~/.local/share/mdh/mdh-log --serve     # a local page, filters, hide/show, never deletes
~/.local/share/mdh/mdh-log --json      # one object, for a bug report
```

Every call is in `~/.local/state/mdh/audit.jsonl`, hash-chained, with the tool, the arguments, the decision and who
made it (`auto`, `approval`, or a named grant).

## 9. Reporting something that is still broken

```bash
./install.sh --diagnose        # machine facts, no file contents
node tools/doctor.mjs --json   # check results
```

Both are written to be pasteable: no home paths beyond what is needed to explain the problem, no file contents, no
conversation text. If a platform adapter is the problem, `docs/PLATFORMS.md` says which platforms are marked tested
and where to send the selector list that failed.
