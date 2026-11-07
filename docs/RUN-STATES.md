# Every way a run can end, and what you see

A run is a small state machine with more exits than a README suggests. This is all of them. If you are looking at a
pill that does not say `Start`, find its label here.

## The phases on the pill

| Pill | Phase | What is actually happening |
|---|---|---|
| `▶ Start` | `idle` | nothing has been sent |
| `◌ Starting` | `starting` | building the first message: tool list from the host, your notes, your skills, the completion code |
| `✎ Sending` | `injecting` | writing into the composer and pressing send — then waiting to see whether the page accepted it |
| `⏳ 3` | `waiting-reply` | waiting for the model; the number is the real turn count |
| `⚙` | `executing` | a call was approved (or auto-approved) and the host is running it |
| `⏸ Paused` | `paused` | stopped at a decision or a wall; the card names which |
| `▶ Continue` | `stopped` or `paused` | one click restarts from the saved state |
| `✔ Done` | `done` | the model called `finish` with the code it was given |
| `✕ Stopped` | `stopped` | stopped by you, by a limit, or by repeated failures |

## Every pause reason

| Reason | What caused it | What the card offers | What to do |
|---|---|---|---|
| `approval` | a call needs a yes | Allow once · Deny · remember for run/session/site | read the command, not the prose around it |
| `no reply arrived` | nothing came back inside the timeout | Keep waiting · Stop · Report it | if the tab was in the background the browser throttled it; bring it forward and Continue |
| `context-full` | the chat hit the platform's length limit | **Continue in a new chat** | one click: the brief carries task, plan, results and the same completion code |
| `stalled` | the stream went quiet mid-reply | Keep waiting · Stop · Report it | wait once; a second stall in one run is a pattern, not a glitch |
| `composer not found` | the platform changed its page | Copy handoff · Report it | report it — the report carries the selectors, which is one commit to fix |
| `message not accepted` | the composer took the text and the page refused to send | Continue · Copy handoff | usually mid-stream; Continue once, then report |
| `turn limit reached` | 60 turns | — | read the plan; nearly always a model looping on one call |
| `same call four times` | one call with identical arguments, four times | Continue | take the task smaller, or say what to do differently in Notes |
| `tool errors` | three failed calls in a row | Continue · Report it | the `[MDH_HINT]` line under each error names the next action |
| `bad finish` | `finish` without the completion code | Continue | it is told the code again; a second miss is a real bug |
| `login` / `blocked` | a wall or a refusal from the site | Resume | sign in to that chat in the same tab, then Resume |
| `no host` | the native port is closed | — | `./install.sh --doctor`, then reload the page |

## The four things that are not pauses

- **Denied.** You said no. The model is told the call was denied, with the reason, and told not to retry it. A denial
  is a first-class outcome, in the audit chain as `via=denial`.
- **A timeout on the approval card.** Silence is not consent. It resolves as `denied`, is logged as `timeout`, and
  the model is told the user did not answer.
- **A stop during a send.** Honoured after the send completes or fails, never in the middle: a half-written composer
  is how one message becomes two.
- **A reload.** The pending call is *offered*, never re-run automatically — `maybeResume()` puts a Resume button in
  the popup and does not touch the page.

## What survives a reload

| Survives | Where it lives |
|---|---|
| the task, the plan, the completion code, the recent results | `chrome.storage.local`, key `session` |
| the pending call and whether it was approved | `pending` |
| approved grants (run/session/site) | `grants`, with the session boot stamp |
| the parked brief for a continuation | `kickoff`, dropped after fifteen minutes |
| the audit chain | `~/.local/state/mdh/audit.jsonl`, hash-chained |

| Does not survive | Why |
|---|---|
| turn counters and per-run grants | a reload is a new run; a grant that outlived its run is a quiet "yes" |
| the old chat's scroll position | not ours to keep |
