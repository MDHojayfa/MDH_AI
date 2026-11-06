# Turn completion — when is a reply actually finished?

Our loop must answer one question after every message: *did the assistant finish, and what did it say?*
Getting this wrong produces the two classic bugs — acting on half a reply, or waiting forever.

---

## 1. The rule from the most battle-tested project

chat-on-steroids records it as a doctrine (`docs/chatgpt-turn-signals.md`):

> **"A turn is finished only when the page says so. Silence is not completion."**

Its decision table:

| Question | Authority | Where |
|---|---|---|
| Did the model finish? | Fiber `end_turn === true && status === 'finished_successfully'` | `extension/fiber.js:525` |
| Did the *user* stop it? | a real click inside the Stop button | `extension/content.js:8311` |
| Did it fail? | a visible `role="alert"` banner, or transport-failure prose | `extension/chatgpt-dom.js:1064` |
| Did the conversation go away mid-turn? | the browser released the tab's claim | `background.js` → `closeConversation()` |

and the outcome vocabulary, each value load-bearing:

| Outcome | Meaning | Safe to continue the loop? |
|---|---|---|
| `completed` | the page said so (Fiber bit, or the degraded DOM rule) | **yes — the only one** |
| `failed` | a visible error belonging to *this* turn | no |
| `stopped` | the user clicked Stop | no — **and never retried** |
| `interrupted` | the site marked the turn interrupted | no |
| `stalled` | no visible progress for `STALL_MS` (10 min) | no |
| `unknown` | the conversation was released mid-turn, or stopped for a reason it did not give | no — **this is the reload shape** |

Their mark of quality is in what they refuse to do: an unexplained stop stays `unknown`, and is **never**
rendered as "the model hit its limit".

## 2. First prose vs last prose — the subtle one

> "`answerText()` returns the *first* assistant prose in a turn; `finalAnswerText()` returns the *last*.
> They are not interchangeable … One logical turn routinely exposes several assistant-authored messages:
> interim commentary while it works, then the answer."

Consequences for us, in both read paths:
- **Stream path**: take the *cumulative* text of the turn (all deltas until the terminal frame), not the
  first delta.
- **DOM path**: parse the **last** `mdh_call` block in the turn's text, and prefer the message node whose
  text is longest/newest when the site splits a turn into several bubbles.
- **Never** treat the appearance of prose as completion. `completed` comes from a stream terminator
  (`[DONE]`, `message_stop`, the adapter's `end()` predicate) or the DOM rule below.

## 3. Stall handling, and the clock/warning icons

Superpower's `stalledStreamHandler.ts`:
- an incomplete tool block that **predates the page load** gets a **clock** icon ("this was already
  broken when you arrived");
- an incomplete block that **stalled while streaming** gets a **warning** icon, and is retried a bounded
  number of times (`_stalledStreamRetryCount`).

The icon distinction is worth copying because it tells the user whether *their* action can fix it.

## 4. Timings that are known to work (LuauPilot)

```js
const T = { idleMs: 1500, stableMs: 2500, warmupMs: 45000, timeoutMs: 300000 };   // default
const FAST   = { idleMs: 1500, stableMs: 2000 };                                  // one complete call block
const HIDDEN = { idleMs: 20000, stableMs: 30000 };                                // tab hidden
// provider override, DeepSeek:
timings: { idleMs: 6000, stableMs: 9000, warmupMs: 45000, timeoutMs: 420000 }
```

- `idleMs` — no new characters for this long ⇒ the stream has stopped producing;
- `stableMs` — text unchanged for this long ⇒ treat as settled;
- `warmupMs` — a reasoning model may think for 45 s without emitting a single character; **do not**
  conclude anything before this;
- `FAST` — a reply that already contains one *closed* call block cannot grow into a valid new one, so it
  can be acted on after a short calm period;
- `HIDDEN` — hidden tabs get 20 s/30 s instead of 1.5 s/2.5 s.

## 5. What this changes in our design

1. **Do not pause when the tab is hidden.** Spec 04 said "pause when `document.hidden`". The evidence is
   the opposite: hidden tabs *throttle timers*, they do not stop the page. Pausing throws away a turn the
   model already answered, and a user who switches tabs mid-task gets a dead session. Replace with the
   `HIDDEN` timing profile and a visibility listener that re-bases timestamps on return (LuauPilot does
   exactly this in its `visibilitychange` handler).
2. **Add an outcome enum** to the loop: `completed | failed | stopped | interrupted | stalled | unknown`
   (`INTERFACES §5` gains `outcome`). Only `completed` advances. `stopped` is terminal. `unknown` is
   presented to the user as *"the page reloaded or the reply ended without a signal"*, never as a model
   error.
3. **Answer each turn at most once.** LuauPilot keeps an `answered` set and an `lpExec` set that survive
   reloads. Ours: `mdh:history` already records `turnId`; add an explicit `answered: Set<turnId>` mirrored
   to `storage.local`, and refuse to send twice for the same turn id even after a reload.
4. **Per-adapter timings.** `PLATFORMS.md` gains `timings` and `pace` fields; DeepSeek starts at
   `idle 6 000 / stable 9 000 / timeout 420 000`, everything else at the default.
5. **Warmup is mandatory for reasoning models.** Our 120 s transport timeout stays, but the *reply*
   timeout must be ≥ 300 s (DeepSeek 420 s), because a thinking model is silent for a minute and a half
   and a naive timeout kills a working turn.
6. **Stall = 10 min with no new characters** ⇒ outcome `stalled`, loop pauses, card says
   "no progress for 10 minutes — the model may be thinking, or the page lost the stream", with
   `Keep waiting` / `Stop`.

## 6. How we detect completion on each of the 8 platforms

| Platform | Primary terminal signal | Fallback |
|---|---|---|
| ChatGPT | stream: `data: [DONE]` on `/backend-api/conversation` | Fiber `end_turn` (optional) → DOM stop-button absent |
| Claude | `message_stop` event in the SSE frame | stop button disappears |
| Gemini | RPC chunk with the finish flag / stream close | `model-response` stops changing |
| DeepSeek | `data: [DONE]`, or JSON `finished` flag | stop button → send button |
| Kimi | last binary frame of the Connect-RPC response | DOM idle |
| Qwen | `data: [DONE]` | DOM idle |
| GLM | `data: [DONE]` | DOM idle |
| Grok | stream close or `finished` frame | DOM idle |

Where the format is unverified (Claude, Gemini, Grok), the **DOM stop-button → idle** path is the
contract, and the SSE path is an optimisation that must fail open to it. That is why the ladder in
`ARCHITECTURE.md` ends at DOM, not at "give up".
