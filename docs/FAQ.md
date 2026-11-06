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

**What if a site changes and it breaks?**
That adapter breaks; the others do not, and the popup says which platform is unsupported instead of
silently doing nothing. Every adapter has two independent read paths (stream, then DOM), so one change
rarely takes a platform out completely.

**How do I uninstall?**
`./install.sh --uninstall`, then remove the extension from the browser. The audit log and your policy file
are left in place deliberately; delete `~/.local/state/mdh` if you want them gone.

**Can I add a ninth platform?**
Yes — one data file, about 30 minutes with `M8-PLAYBOOK.md`. If adding a platform ever requires touching
the core, that is a bug in the design.

**Why is the prompt in English only?**
One canonical language keeps prompt behaviour testable. Bangla arrives in v1.1 as a translation file, not
a fork.
