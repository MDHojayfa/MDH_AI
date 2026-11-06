# FAQ

**Do I need an API key?**
No. There is no key, no provider setting and no model picker anywhere in the product. The model is the
chat you are already signed into.

**Which AI platforms work?**
Eight, in v1: ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen, GLM/z.ai, Grok. Arena, Meta AI, Perplexity,
Copilot and Doubao are planned for v3 — their behaviour is already documented internally, but each needs
its own adapter and its own testing.

**Which browsers?**
Chrome 116+, Brave (same build as Chrome) and Firefox 140+. Firefox is first-class, not a port of last
resort — the whole design avoids the one API Firefox lacks (`chrome.debugger`), which is why the biggest
competitors cannot run there at all.

**Windows or macOS?**
Not in v1. The host is the only OS-specific layer, so a port is real work, not a conditional. Linux first
because that is where the requirement came from.

**Will I get banned?**
You might get rate-limited, and you might get a temporary block. Automation of a web UI may violate a
provider's terms, and this tool does not hide that. What we do about it: sending is paced (6 s between
messages on DeepSeek, where the limit is known), a refusal is never re-sent, and the loop stops after four
hits instead of hammering. Read `SECURITY.md §4.4` before deciding.

**What happens when the free tier runs out mid-task?**
The loop stops, the pending call is saved, a countdown is shown, and you press **Resume** when it clears.
Nothing is silently retried, and nothing is lost.

**Can it control my desktop — click, type into other apps?**
Not in v1. It has a shell, real files, and can *launch* GUI applications (`open_app`). Pixel-level control
is available through an MCP server if you install one (`computer-use-linux`), and even the 5k-star desktop
agent masks native input off on Linux because it is unreliable there.

**Why not publish it on the extension stores?**
Stream interception is exactly the kind of thing store review rejects, and a store build could not
guarantee "no network". `install.sh` plus *Load unpacked* is one command and two clicks.

**What does a bug report actually contain?**
Browser and version, OS hint, timezone, cores/memory/screen, page host and stage, the log trail, and — via the
host — kernel, node version, load, free disk, interfaces, MTU and a *measured* clock skew. No file paths, no
visited URLs, no cookies, no DOM snapshots. [`docs/DIAGNOSTICS.md`](DIAGNOSTICS.md) lists every field and the
redaction rules, and the card shows you the exact text before opening GitHub.

**Does it send my IP address?**
Only if you tick a box that starts unticked. It exists because a blocked IP is the classic "works for
everyone else" bug: three months of debugging in somebody's case. One request to one documented endpoint, the
result goes into the form, nothing is stored.

**Why is there a website running on my machine?**
Only when you click **Log viewer**, or run `mdh-log --serve`. It binds `127.0.0.1`, needs a token printed in
the URL, serves one read-only page with no script, and dies with the process. `mdh-log` with no arguments
writes a file instead and starts nothing at all.

**Does it phone home?**
There is no telemetry and no update check. The only network traffic is the browser you already have open,
plus whatever MCP servers you configure. You can verify this: the built extension is unminified vanilla JS
with no remote fetches in it.

**Where do my files go?**
Nowhere. Nothing is uploaded except what you type into the chat, and tool results are pasted back into
that same chat — which is the provider's business, not ours. The audit log stays on your machine.

**Which folders can it touch?**
`~/projects`, `~/mdh`, `/tmp/mdh` by default. `~/.ssh`, `~/.gnupg`, `~/.aws`, your browser profile and the
shadow file are unreachable even if you ask. Symlinks are resolved before the check, so a link into a
denied folder is refused.

**Can it delete my home directory?**
Only if you approve a command that does it. Approval is on by default for `run_command`, and the card
shows the exact command with no truncation — that is deliberate.

**What is MCP and do I need it?**
Model Context Protocol: a standard way to expose tools to a model. You do not need it — 13 tools are
built in. If you already run MCP servers, they appear automatically in the tool list.

**Does it work if I have two tabs open on the same platform?**
Only one tab drives a session at a time (a lease). The second tab tells you so instead of racing the
first.

**Does it keep working if I switch tabs?**
Yes. A hidden tab is slower, not paused: browsers throttle timers in background tabs, so the extension
waits longer rather than declaring the reply dead.

**Can I start a task without opening the popup?**
Yes — that is what the pill on the chat box is for. Click **Start**, type, Enter. Click again to pause, again
to continue. The popup is for settings and history now.

**What if a site changes and it breaks?**
That adapter breaks; the others do not, and the popup says which platform is unsupported instead of
silently doing nothing. Every adapter has two independent read paths (stream, then DOM), so one change
rarely takes a platform out completely.

**How do I uninstall?**
`./install.sh --uninstall`, then remove the extension from the browser. The audit log and your policy file
are left in place deliberately; delete `~/.local/state/mdh` if you want them gone.

**Can I add a ninth platform?**
Yes — one data file, following the shape in `docs/PLATFORMS.md`. If adding a platform ever requires
touching the core, that is a bug in the design.

**Found a bug. Is the developer going to fix it?**
He will try, because the alternative is watching a stranger be sad in an issue tracker. Be warned: he
does not own a NASA PC, so the bug was not caught by a fleet of test machines — it was caught by you, on
one laptop, at the worst possible moment. Give him the popup's **Copy log**, the platform and the stage,
and the odds get very good. Vague reports still get read; they just get read twice.

**It keeps telling me to report bugs. Is it nagging?**
It is one line, on every run, in a place you already look, with two buttons that do something. The
alternative — a footer link nobody reads — is how a tool with one developer ends up with zero reports and a
reputation for being broken. The silly lines are a separate pool, so help never sounds like a joke.

**What has not been tested at all?**
[`docs/KNOWN-LIMITS.md`](KNOWN-LIMITS.md) lists it, table by table: what is automated, what was checked by
hand once, and what nobody has ever run. The short version is that one person on one Linux machine tested as
far as that allows, which is not the same as tested everywhere.

**Why does it say the developer has no NASA PC?**
Because it is true and it is the reason bug reports are worth more than donations. One laptop, eight sites
that redesign on a Tuesday, no staging cluster. Assume the code was tested as far as one machine allows and
no further; that is the honest description.

**It asked me to share it. Was that a dark pattern?**
It asks once, on the first run of a profile, and never again. There is no tracking parameter on the link and
nothing is counted. Instagram and TikTok have no way to accept a pre-filled post, so the sheet copies the
link and opens the site and says so, instead of showing a button that quietly does nothing.

**Why does it not just follow you on GitHub when it opens the profile?**
Because GitHub has no URL for that. The old endpoint died years ago and required a logged-in POST with a
CSRF token; arranging one silently would be a dark pattern wearing a marketing hat. The profile opens
once, the button is one click away, and both are free.

**Why does it keep talking about aliens on the Moon?**
Because a tool that says "waiting" for ninety seconds looks broken, and a tool that says
"contacting the aliens on the Moon…" looks alive. Every line is tagged `fun`, the real status is printed
next to it, and `./install.sh --no-fun` removes the lot. The rule is simple: decoration may be silly,
diagnostics may not. There is a test that stops a joke from claiming a success or mentioning your data.

**Is the missile real?**
No. The shell command is real, which is why it has an approval card, and the missile is a paper plane
addressed to Jupiter. Do not confuse the two; that is the entire safety model in one sentence.

**Why is the prompt in English only?**
One canonical language keeps prompt behaviour testable. Bangla arrives in v1.1 as a translation file, not
a fork.
