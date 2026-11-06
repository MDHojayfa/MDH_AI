# Notes for v2 and beyond

**These are notes, not a promise.** No dates, no guarantees, no half-built flags in v1. The roadmap
(`docs/ROADMAP.md`) stays the list of things that ship; this file is where ideas live until they either earn a
place there or get rejected with a reason.

Order inside each section: what it is, why it is hard here specifically, what would have to be true to ship it.

---

## 1. Platform rotation — "keep working when this chat fills up"

The idea, in the user's words: load two or three chat URLs, and when one hits a limit, move the work to the next.

### What it looks like

1. **Popup → Rotation**: three slots. Paste a chat URL into each (must be a live conversation on one of the eight
   supported platforms, in this browser, signed in). Order = priority. Each slot shows a green dot after a
   successful **Check this page** probe.
2. A run starts on slot 1 as it does today. The pill shows `1/3`.
3. If slot 1 reports a limit, MDH finishes the call it is in (never leaves a half-written file), writes a
   **handoff**, opens slot 2, pastes it, and continues. Pill: `2/3`, one line in the log, one entry in the audit.
4. If slot 2 fails too, slot 3. Then it stops and pauses with options: wait, finish manually, or add another URL.

### The handoff (the part that decides whether this works)

A handoff is a prompt, not a memory dump — every token in it costs context in the new chat:

```
# Continuing a task started in another chat
Task: <the original request, verbatim>
Done so far: <plan steps with a status each>
Touched: <files changed, one per line>
Last results: <up to 3 tool results, truncated to 400 chars each>
Next step: <the single next action>
Rules: <the same rules block a normal run gets>
Plug: <a fresh completion code for THIS chat>
```

Open questions: how much of the transcript is worth keeping (probably none — results, not conversation), whether
the new platform needs a differently shaped prompt, and how to avoid the model redoing work it can no longer see.

### Detecting "hit a limit" — evidence, not vibes

Rotate only on a signal that is already in the diagnostics vocabulary:

| Signal | Source | Rotate? |
|---|---|---|
| HTTP 429 / "rate limited" / "too many requests" | interceptor + page text | **wait 30 s, retry once, then rotate** — a throttle is not a full context |
| "conversation too long", "context length", 413 | interceptor + page text | rotate |
| reply truncated mid-sentence, twice | parser + `truncated` signature | rotate |
| no text for the stall window | timer | **no** — that is a pause, not a rotation |
| the model says "I can't continue" | text | **no** — text is not an action, and it may be a refusal, not a limit |

### Guardrails that must exist on day one

- **Max rotations per run** (default 2). A loop that hops forever is a way to burn three accounts in an afternoon.
- **Never rotate into a tab the user is typing in.** Test for focus and for draft text in the composer.
- **One rotation at a time**, announced in the pill and the log — silent hopping is how people lose trust.
- **Deduplicate tool calls across tabs** with the existing call fingerprint; a model that re-runs `rm -rf` because
  it forgot is the failure mode that matters.
- **The plug is per chat**: a new code for the new tab, or a completed task could be "completed" twice.
- **The TOU warning is not optional.** Rotating between chats you own to dodge a rate limit is a grey area in
  most providers' terms. It should be stated in the UI, not buried in a policy page.

### Why it is not v1

Three unknowns, in order of how much they could sink it: (a) how to detect a *context* limit reliably across eight
different UIs without false positives, (b) how much context has to move for a task to survive the trip, (c) whether
the platforms behave the same way when a URL is opened in a background tab. None of that can be answered from one
laptop, which is the same reason `docs/KNOWN-LIMITS.md` exists.

---

## 2. A messaging bridge (v3, or v2 if rotation goes smoothly)

Talk to the agent from your phone: Telegram, Matrix, or a local web chat. Researched: this is OpenClaw's core
strength — a gateway process with channel adapters, bot tokens, per-channel routing, and voice-message handling.

What it would take here: the host already runs locally and can long-poll a bot API outbound (no inbound port, no
public URL, no webhook). The hard parts are not technical:

- **Approvals from a phone are a security decision.** A tap on a Telegram inline button is weaker than a click on a
  local card. Options: a per-run confirmation code shown only in the popup, or a two-step `approve <id> <code>`.
- **The browser is still the model.** A phone message must reach a chat tab on the desktop — if the laptop is
  asleep, the message waits. That is a real limitation, and it should be said in the first sentence of the docs.
- **Bot tokens are not API keys**, but they are still credentials: stored in the host config, never in the extension
  storage, never in the audit log.

---

## 3. Capabilities other agent platforms have, and what they mean here

Researched against Claude Code (hooks, skills, subagents, compaction, MCP) and OpenClaw (channels, heartbeat,
skills hub, routing). Sorted by "would this actually help *this* product".

| Capability | What it is there | What it could be here | Verdict |
|---|---|---|---|
| **Hooks** | deterministic scripts on lifecycle events; enforce rules without asking the model | our host *is* a hook: every call passes through `policy` + `runBuiltin`. A user-supplied hook script would be a second, weaker policy layer | **partially exists** — document it instead of building it |
| **Skills** | Markdown playbooks the model loads on demand | `~/.config/mdh/skills/*.md`, offered as `read_file` targets and named in the prompt. Zero code, zero context until used | **cheap, likely v1.x** |
| **Subagents** | isolated contexts for parallel research | two tabs, two models, one task — expensive and hard to keep honest. A read-only "research tab" is the only version that feels safe | **not worth it yet** |
| **Compaction** | summarise history when context fills | we do not own the context — the platform does. Our equivalent is the handoff prompt (see rotation) | **subset via handoff** |
| **MCP** | connect external tools | **already shipped**: `host/mcp_client.mjs`, servers from `~/.config/mdh/servers.json` | **exists** |
| **Heartbeat / cron** | wake every 30 min and decide whether to act | needs a daemon running without a browser; the whole point here is that nothing runs when the tab is closed | **rejected for now** |
| **Model routing** | send each task to the cheapest capable model | the user picks the tab; a router would need API keys, which we do not have | **no** |
| **Messaging channels** | 15+ adapters | see §2 | **v3** |
| **DM safety / pairing** | allowlists for unknown senders | relevant the moment §2 exists | **required with §2** |

---

## 4. Smaller things worth keeping on the list

- **Session replay**: the runs journal already stores outcome, turns and reason; a "reopen that run's transcript"
  view is a viewer change, not an architecture change.
- **Per-site layout watch**: run the probe on a schedule per platform and warn *before* a redesign bites. Cheap:
  the probe exists, the schedule is a `setInterval` in the background script.
- **Copy handoff**: a button on the pause card that puts the handoff prompt on the clipboard, so a stuck run can be
  moved by hand today — the rotation feature without the automation.
- **A real cost clock**: elapsed time and turns are already tracked; adding "this run has used 24 minutes of your
  daily limit" needs per-platform knowledge we do not have, so it would be a guess. Only ship it if it can be
  measured.

---

## Rules for adding anything to this file

1. It must say what breaks if it is built badly.
2. It must say what has to be true before it can ship.
3. It must not appear in the README until it is in the roadmap, and not in the roadmap until it has a test plan.
