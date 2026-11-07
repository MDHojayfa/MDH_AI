# The laptop test: a throwaway user, step by step

This is the long version of `docs/REMOTE-TESTING.md`, written for somebody who does not live in a terminal. Every
command is explained, and nothing here needs `sudo` except the two lines that create and delete the user.

Read §8 before you decide to open SSH. It is the part where I have to be straight with you about what a sandbox on
the other side can and cannot reach, because getting that wrong wastes your evening.

## 0. What this is for, and what it is not

The point of a throwaway user is that the whole test lives in one home folder you can delete in one command: the
extension, the host, the audit log, the config, the screenshots, the report. Nothing in your real account is
touched, and nothing has to be cleaned up by hand.

It is **not** a way for me to drive your machine. See §8 for why, and §5 for what replaces it.

## 1. Create the user

```bash
sudo adduser mdh-test
```

`sudo` runs one command as the administrator. `adduser` is Debian's friendly wrapper around `useradd`. It asks a
few questions:

| It asks | What to type |
|---|---|
| `New password:` | anything you will not reuse — this account exists for an hour |
| `Retype new password:` | the same |
| `Full Name`, `Room Number`, … | press Enter through all of them; they are optional |
| `Is the information correct? [Y/n]` | `Y` then Enter |

That creates `/home/mdh-test`, a group of the same name, and a shell. No sudo rights are given, which is deliberate:
a test account should not be able to change the system it is testing.

## 2. Become that user

```bash
sudo -iu mdh-test
```

`-i` means "start a login shell", so your prompt changes and you are now working entirely inside
`/home/mdh-test`. Everything after this runs as that user. To go back later: `exit`.

Check you are in the right place:

```bash
whoami        # mdh-test
echo $HOME    # /home/mdh-test
```

## 3. Check for Node

```bash
node --version
```

If that prints something like `v22.11.0`, skip to §4. If it prints `command not found`, you need Node — and this is
the only place `sudo` comes back. Press `exit` first (you are still the test user), then:

```bash
sudo apt update && sudo apt install -y nodejs
```

Debian 13 ships Node 20 or newer, which is enough. (`npm` is **not** needed and is never used by this project.)

## 4. Install and check, in four commands

Back as the test user (`sudo -iu mdh-test`):

```bash
git clone https://github.com/MDHojayfa/MDH_AI
cd MDH_AI
./install.sh --doctor
```

`--doctor` is read-only. It prints one line per part of the system with the fixing command under anything that
failed; run `./install.sh` when it tells you to, then run `--doctor` again. Expect two lines to be unhappy on a
brand-new account before `./install.sh` has run once: the native-host manifest and the wrapper.

Then the test itself:

```bash
node tools/selftest.mjs --browser --screenshots
```

- `--browser` drives a real Chrome/Brave if one is installed (it needs `dist/chrome`, which `./install.sh` built).
- `--screenshots` saves PNGs of the page after the pill mounts, and again after Start is pressed.

It finishes by printing two paths:

```
report: /home/mdh-test/.local/state/mdh/selftest-2026-11-07T14-26-55-037Z.md
screenshots: /home/mdh-test/.local/state/mdh/screenshots-2026-11-07T14-26-55-037Z/
```

## 5. Get the evidence out

The report is small and made to be pasted:

```bash
cat ~/.local/state/mdh/selftest-*.md
```

Select it in the terminal, copy, paste it into the chat. It contains check results, version numbers and home paths
only where a path explains a failure — **no file contents, no conversation text, no commands the agent ran**.

The screenshots are PNGs. Open one in your file manager (they are in the folder printed above) and attach it to the
chat. That is how a picture of the pill gets from your laptop to me: not through a tunnel, through the attachment.

If you want everything in one file to move it around:

```bash
cd ~/.local/state/mdh
tar czf /tmp/mdh-evidence.tgz selftest-*.md screenshots-*/
echo /tmp/mdh-evidence.tgz
```

`tar czf` packs a folder into one `.tgz`; `czf` is "create, gzip, file".

## 6. The browser half, by hand (Firefox)

`--browser` can only drive a Chromium-family browser, because the DevTools protocol is the only one this project
speaks without a dependency. For Firefox, do this and note which line breaks:

```text
1. about:debugging#/runtime/this-firefox  →  Load Temporary Add-on  →  pick dist/firefox/manifest.json
2. open any of the eight chats          →  a small ▶ Start pill sits above the composer
3. click it                             →  the pill says Starting, the composer fills, the message sends
4. wait for the {"mdh_call": …} block   →  an approval card appears showing the exact command
5. press Allow once                     →  the command runs, the result is typed into the chat
6. ask for something long               →  the result arrives as a /tmp/mdh/spill/… path, not 40 KB of text
7. mdh-log --serve                      →  the local page lists the run and the chain says ok
```

The first line that does **not** match is the useful part of the report. "Step 4: no card appeared, the model just
answered with prose" is worth more than a log file, because it names the stage.

## 7. Delete the whole thing

Exit the test user, then:

```bash
exit                              # back to your own account
sudo deluser --remove-home mdh-test
```

`--remove-home` deletes `/home/mdh-test` — the extension, the host, the config, the audit log, the screenshots, the
report. That is the entire footprint. If `deluser` says the user is still logged in, close that terminal first.

## 8. About SSH, and why I still cannot drive your laptop

You asked the right question, and the honest answer has two halves.

**Half one: this sandbox does not have general internet access.** It can reach `github.com`, `codeload.github.com`,
`api.github.com`, `registry.npmjs.org`, `pypi.org` and `files.pythonhosted.org`. That allowlist is how this
environment reaches the outside world, and it is not a matter of permission I can grant myself. A packet to your
laptop's IP address is not on it.

**Half two: even with an open internet, your laptop has no address for me to reach.** A home connection sits behind
NAT: it can dial out, but nothing outside can dial in unless you forward a port on your router — which is exactly
the thing you should not do for an SSH server, and which I would refuse to ask you to do.

So there is no version of this where I log in and take screenshots myself. What there is, is §5: you run one
command, and the evidence comes back through the chat — the report as text, the screenshots as attachments. That is
not a consolation prize; it is the same evidence a remote session would have produced, minus the tunnel.

**If you want SSH for yourself** — to poke at the test account from your phone, say — install it, bind it to your
LAN and never forward the port:

```bash
sudo apt install -y openssh-server
sudo systemctl enable --now ssh
ip -4 addr show | grep 'inet '     # note your LAN address, e.g. 192.168.1.42
```

Then from another machine on the same network: `ssh mdh-test@192.168.1.42`. Do not forward 22 on the router, do not
enable `PasswordAuthentication no` without keys, and delete the account (and the package, if you installed it only
for this) when you are done. This is for you; it does not change what I can reach.

## 9. Why the notes kept disappearing, and what actually fixes it

The frustration is real and the cause is mundane: this workspace is a **checkout**, not a home folder. Between
sessions it is rebuilt from the git branch, so anything that was written but not committed is gone — notes included.
The throwaway user on your laptop does not change that, because I cannot write to it.

What does fix it: **everything lives in git and is pushed.** Since that lesson landed, each unit of work ends with a
commit on the session branch and a merged pull request on `main`. Anything worth keeping — a decision, a research
note, a dead end — belongs in the repository, not in my scratch space. The three files that carry it are
`docs/DECISIONS.md` (what we chose and why), `docs/RESEARCH.md` (what we read and what it changed) and
`CHANGELOG.md` (what shipped, in order). That is why this document exists at all: it is the note I would otherwise
have lost.
