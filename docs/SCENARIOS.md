# Ten failures, walked through

The signature table in [`DIAGNOSTICS.md`](DIAGNOSTICS.md) lists what *can* go wrong. This file is what it
looks like when it actually does — the screen, the words, the log entry, and the thing the user does next.
Written from real failure classes, not from imagination: every scenario here has a support thread behind it,
usually in somebody else's project.

---

## 1 · "It works on my other laptop" — a blocked IP

**What they did.** Started a task on DeepSeek on hotel Wi-Fi. The composer filled, the send arrow was clicked,
nothing appeared.

**What they see.** The pill flips to amber **Waiting**, then after 90 s to red **! Report**. The card says:

> `The loop stopped (stalled) after 3 turns.` — Stage: waiting-reply
> **Likely: The provider is refusing this network, not this code**
> Try: another network (a phone hotspot is the fastest test).

**Why that card and not "unknown error".** The log trail held `POST …/completion → 403` plus the interstitial's
title, which matched `cf-challenge` *and* `cf-ban`, and both outrank `no-reply`.

**What they do.** Tethers to the phone. The same task runs. The report was never sent — the hypothesis was
enough — which is the best outcome a support tool can have.

## 2 · "Half my answers are cut off" — MTU on a VPN

**What they did.** WireGuard up, a long code review task. Every reply truncated after ~40 KB.

**What they see.** `unclosed fence at line 412`, then the parser's single repair attempt, then the card with
**Likely: MTU / VPN path problem** and the `smallMtu: ["wg0:1380"]` fact from the host.

**What they do.** `mtu 1380` on the tunnel, or switch it off for one run. Nothing in the extension changes.

## 3 · "It thinks it is 2019" — clock skew

**What they did.** Laptop resumed from suspend with a dead CMOS battery. Signed requests fail, TLS complains.

**What they see.** `clockSkewMs: 3_782_004` in the facts, and the top hypothesis is not a guess but a
measurement: *the system clock is 3782 s off the network*.

**What they do.** `sudo timedatectl set-ntp true`. Every other row in the report becomes irrelevant.

## 4 · "Free tier, midnight" — rate limit

**What they did.** A 40-turn task at 23:50.

**What they see.** The governor's own countdown card first (`waiting 4 min 20 s`), with **Keep waiting**,
**Stop**, and **Report it**. If they press Stop, the report card offers the hypothesis *the plan is
rate-limited right now* and reminds them that a fresh model on the same account shares the quota.

**What they do.** Nothing. That is the correct action and the card says so.

## 5 · "It broke after I updated the extension" — orphaned content script

**What they did.** Reloaded the extension in `chrome://extensions` with the chat tab open.

**What they see.** `Extension context invalidated` in the card, and *this tab is talking to an old copy* with
the fix: reload the tab.

**Why it matters.** This is the single most common false bug report in browser-extension projects. Naming it
costs one regex.

## 6 · "The site moved a div" — adapter drift

**What they did.** Opened ChatGPT after a redesign. The adapter's composer selectors match nothing.

**What they see.** A card titled **Page changed**, listing the selectors that were tried, with
**Report this selector** — which opens the bug form with the platform and the selector list already in it.

**What the maintainer sees.** A report that can be fixed in one commit, with no back-and-forth.

## 6b · "It stopped after one tool" — prose read as completion

**What they did.** Started a 20-minute task. The model called `read_file` once, then replied "I will now check
the tests" — as text, without a call.

**What they saw before 1.0.0.** The loop treated that sentence as a finished task and stopped. No error, no
message; the user had to press Start again and hope.

**What they see now.** A warn line: *the model described the next step instead of taking it — asking again
(1/2)*, then either the next tool call or a purple pill reading **Continue** with a card offering *Continue /
Mark as finished / Stop / Report*.

**Why it is a design rule, not a patch.** Text is never an action. A task ends when the model calls `finish`.

## 7 · "Two tabs, one task" — the lease

**What they did.** Started a task in one tab, then opened the same platform in another to "check".

**What they see.** The second tab's popup says `another tab is driving MDH`. The first tab's pill stays amber.
Nothing is said to the model, because a second voice in the same chat is a corrupted conversation.

## 8 · "The disk filled up" — silent audit failures

**What they did.** A `run_command` that wrote 40 GB into `/tmp` and filled the volume mid-task.

**What they see.** The host keeps working — an audit write that fails is swallowed and logged to stderr — but
`diskFreeGB: 0.1` appears in the next report, with the hypothesis that disk exhaustion explains the tool
failures, not the extension.

## 9 · "It stopped and I closed the tab" — recovery

**What they did.** Closed the laptop. The tab reloaded to a new chat.

**What they see.** On the next visit, a notice: *a call was interrupted by the reload; press Resume*. The
pending call was saved before it was sent, so Resume re-sends exactly once — never automatically, because an
automatic re-send after a rate-limit rejection is how accounts get flagged.

## 10 · "I didn't install the host"

**What they did.** Loaded the extension only.

**What they see.** The popup: `host offline` with the exact command, and the pill still appears — because the
page control is useful for one thing even without a host: it can open the report. The card's top hypothesis is
`no-host`, and the report records `host: null` rather than pretending the machine said nothing.

---

## 11 · "It says it's done and nothing finishes" — the plug

**What they did.** Asked for a long install. The model replied "All done! Everything is set up." — as text.

**What they see.** A warn line: *a finish call arrived without the completion code — asking again*, and the run
continues. If the model tries twice without the code, the pause card appears with **Mark as finished**, which
ends it on the human's word.

**Why.** Completion is a checkable code (`docs/PLUG.md`), not a sentence. A summary in prose is a summary, and a
task that ends on a sentence ends by accident sooner or later.

## 12 · "The site changed and I found out mid-task" — layout watch

**What they did.** Updated the browser, opened Claude, pressed Start. Nothing typed.

**What they see.** A card within a few seconds of the page loading: *Claude looks different since your last
visit: composer not found. It may still work — press Check this page.* The popup's **Last page check** says the
same thing with a time, before any task is involved. A `dom-drift` signature appears in the next report.

**Why.** A regression is only reported once — a page that was already broken has been reported once before, and
warnings that repeat get muted.

## 13 · "I approved the same command forty times" — grants

**What they did.** A long build loop: `npm test`, approve; `npm test`, approve; …

**What they see.** From the third card onward, a caret beside **Allow once** offering *for this run* / *for this
session* / *always on this site*. Choosing one writes `granted for this run` to the log, and every later use
writes `grant used`. The popup lists site grants with a ✕.

**What it deliberately does not do.** Grant anything containing `&&`, a pipe, a redirect, `$(…)`, backticks or
globs. Those are approved one at a time, forever, because they can hide a second command.

## 14 · "It ran something I don't remember approving" — runs in the log

**What they did.** Came back to a finished task and did not recognise a `write_file` in the log.

**What they see.** The log page groups every call into a **run** — id, calls, failures — and one click narrows
the table to that run (`?run=…`). Each row carries the tool, the status, the time and the detail; the run id is
also in the popup's *Last run* line. If a call was approved, the approval is in the same run, in order.

**Why.** "Show me everything that run did" is the first question after a surprise, and it should be a URL, not an
argument.

## 15 · "The chat filled up in the middle of the task" — handoff

**What they did.** A 40-turn refactor on a free plan. The chat hit its context limit; the model started repeating
itself.

**What they see.** Press **Copy handoff** on the pause card: task, plan with statuses, the last three real
results, next step and a fresh completion code. Paste it into any other chat, press Start there. Nothing is
re-transcribed, because a summary of what was *said* is worth less than what actually *ran*.

**What is not here yet.** Doing that automatically across three chats — platform rotation — is written up in
`docs/V2-NOTES.md` with its failure modes and is explicitly not promised.

## What this list is for

Every scenario above is a row the product can *name*. That is the entire design goal of the diagnostics
layer: not to fix the world, but to make each of these fifteen sentences appear at the right moment, in the
right place, with the right next action — and to make the eleventh one report itself with enough context to
become a test.

If you hit one that is not here, the failure card is already holding the form.

## 16. A result too large to send

**What happened.** `read_file` on a 400 KB log, or `search_files` across a monorepo, returns more text than a chat
message can carry. The old path sent up to 128 KB in one message. ChatGPT accepted it, answered once, and then
refused the conversation (`You've reached the maximum length for this conversation`) — so a run that was working
died three turns later, with an error that blamed the conversation rather than the 128 KB the tool had just posted.

**What happens now.** Above 24,000 characters the host writes the full text to `/tmp/mdh/spill/<run>/` (0600,
folder 0700, cleared after a day) and the block carries the head, the tail, the character and line counts, and the
path — with the exact `read_file` call to use. The model reads the range it needs. Nothing is lost, and the
conversation keeps its budget.

**How to check it.** `npm test` → "a large result is spilled to a file, and the file is readable through the same
host". The second half matters as much as the first: a spilled file the model cannot read is worse than no spill.

## 17. The message that arrives in pieces

**What happened.** A 30 KB tool result, or a handoff pasted into an empty chat, goes into the composer in one go.
Some layouts take it and slow to a crawl; others silently drop the tail — and the model then answers a question
that was cut in half, which reads as the model being stupid rather than the message being truncated.

**What happens now.** Anything over 6,000 characters is delivered as `(part 1/3)` … at paragraph boundaries, each
part waiting for the composer to accept the previous one. The prompt tells the model that only the last part
completes the message, so it does not act on the first third of a result.

## 18. A file that tries to end the block

**What happened.** The result envelope ended with the fixed string `[/MDH_RESULT]`. A file — a README from a cloned
repository, a log line, a web page saved to disk — could contain that string, end the block early, and have every
following line arrive looking like output from the host, including a `finish` the user never saw.

**What happens now.** The closing tag is eight hex characters derived from the run's completion code, the turn and
the platform, and it changes every turn. Any occurrence of the current tag inside tool output is replaced with
`········`. A file can no longer close a block, and the model is told in the prompt that text outside the real tag
was not written by the host.

**What it is not.** A defence against prompt injection. Delimiters are a speed bump that an adaptive attacker walks
over (`docs/RESEARCH.md`). What stops an injected instruction from doing damage is that every write and every
command still stops at an approval card.
