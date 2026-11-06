# Rate limits — the evidence, and the policy it forces

The single biggest reason these tools get their users' accounts restricted is a client that treats a
refusal as a transport error and retries. Two repos solved it properly. This document records their
numbers and adopts them.

---

## 1. The mechanism, stated plainly

A chat UI accepts a message, then the *server* refuses it: the message sits there, an inline notice
appears ("Messages too frequent"), and nothing streams. A naive client sees "no reply yet" and either
clicks send again or re-injects the same text. Each attempt is counted by the provider, so the client
converts a soft cooldown into a burst, and a burst into a restriction.

**Rule: a refusal is a terminal outcome for that message, never a reason to send it again.**

LuauPilot's provider forbids exactly that, in the send loop itself:

```js
// providers/deepseek.js — inside send()
// A rate-limit notice means the message was REFUSED. Never press send again: that is what
// turns one refused message into a flood of them.
if (rateShown()) throw new Error("rate limited");
```

and it detects the notice by text:

```js
rate: /messages?\s+too\s+frequent|too\s+many\s+(messages|requests)\s*[.,]?\s*try\s+again\s+later/i
```

---

## 2. Sending is governed, not free

`core/agent.js` (LuauPilot): *"Every message LuauPilot injects goes through ONE governor: serialized,
spaced, capped per minute, and slowed down further after a rate-limit hit."*

| Knob | Default | DeepSeek override | Meaning |
|---|---|---|---|
| `minGapMs` | 2 500 | **6 000** | minimum gap between two injected messages |
| `perMinute` | 10 | **5** | hard cap per rolling minute |
| `pace.mult` | 1 | — | multiplied by **1.6** on every hit, capped at **4** |
| clean-streak reset | — | — | pace relaxes after N clean turns |

> "DeepSeek answers message bursts with 'Messages too frequent': 6 s between sends and at most 5 per
> minute (reasoning replies rarely arrive faster than that anyway, so this costs nothing in normal use
> but keeps tool-result retries from forming a burst)."

That last parenthetical is the whole design argument: **pacing costs nothing** because a reasoning reply
takes longer than 6 s anyway. A tool loop is naturally slow; only a badly written client outruns it.

## 3. The ladder (verbatim behaviour)

```js
const HIT_WINDOW = 10 * 60e3;   // hits counted inside 10 minutes
const BLOCK_MS   = 5 * 60e3;    // give-up window

r.hits = now() - r.lastHitAt > HIT_WINDOW ? 1 : r.hits + 1;
S.pace.mult = Math.min(4, S.pace.mult * 1.6);
setCool(Math.min(300000, 20000 * Math.pow(2, r.hits - 1)));   // countdown: 20s,40s,80s… ≤300s

if (r.phase === "newrun" || r.hits >= 4) return block(replay, origKey);
if (r.hits === 1) return waitAndReload("reload",  8000, ...);  // "Pausing a few seconds, then reloading"
if (r.hits === 2) return waitAndReload("reload", 40000, ...);  // "Waiting about 40 s, then reloading"
/* hit 3 */       return waitAndReload("new",     4000, ...);  // new chat, then come back
```

`waitAndReload` does four things in order: **pause the loop → show a banner with a countdown
(`until: now() + ms`) → sleep → reload the page (or navigate to a fresh chat)**. The pending message is
saved before the sleep (`S.rate.replay`) so nothing is lost.

`block()` stops for 5 minutes with `UI().status("paused","limited")` and a banner that offers one action:

```js
{ text: `${P.name} is limiting messages right now. … wait a few minutes.`,
  until: S.rate.blockedUntil, tone: "error", doneText: "You can try again now.",
  actions: [{ label: "Try again now", fn: resumeFromBlock }] }
```

`resumeFromBlock()` resets `hits` to 2 — a resumed user is placed *back on the ladder*, not at the top.

### Why a reload, and why a new chat
A refused conversation keeps the refusal in context; the provider's cooldown is per conversation and per
account. Reloading re-arms the page's own request state; a fresh chat resets the conversation-level
throttle. Both are cheap and both are visible to the user.

## 4. The opposing evidence (chat-on-steroids)

CoS retries on a *retryable* refusal with a provider-directed `retryAfterMs`, bounded to one hour, and
explicitly says it has **"the same absence of an attempt limit"** for the goal-opening request, because a
single request holds a whole completion and there is no later turn to retry from.

That is defensible for a *paid* plan where refusals are transient capacity events. It is **not**
defensible on free tiers, where the refusal is a quota decision. Our case: free tiers → ladder, hard cap
at 4 hits, then stop. We keep CoS's good part (honour a provider-stated delay if one is ever exposed) and
reject the unbounded retry.

## 5. Our policy (supersedes `specs/04-agent-loop.md §4`)

**Governor** — one per tab, serialised, in `core/agent.js`:

| Knob | Default | Per-adapter override field |
|---|---|---|
| `minGapMs` | 3 000 | `pace.minGapMs` |
| `perMinute` | 8 | `pace.perMinute` |
| `maxConsecutiveSends` | 40 | — (a task that needs more is a design smell) |

Defaults sit between LuauPilot's generic (2.5 s / 10) and DeepSeek's measured (6 s / 5): conservative
without being absurd. DeepSeek's adapter ships `6 000 / 5`.

**Ladder** — hit = a refusal notice matched by `adapter.refusal`, or HTTP 429/403 on the send:

| hit | wait | then | user sees |
|---|---|---|---|
| 1 | 8 s (+0–3 s jitter) | reload the page, resend the **same** pending message | countdown banner |
| 2 | 40 s | reload, resend | countdown banner |
| 3 | 200 s | open a fresh chat, resend | "starting a new chat" |
| ≥4 | 5 min, then **stop** | nothing is sent | "paused — press Resume" |

Jitter matters: two tabs on the same account must not retry in lockstep. Note the ladder *is* allowed to
resend after a wait — a reload cycle is a new attempt with backoff, not a retry loop; the prohibition is
on resending **without** a wait or after a *denied/stopped* turn.

**Hard stops** (no ladder, immediate pause):
- the user pressed Stop → never retried, ever;
- the model's reply was `denied` by approval → never retried;
- two consecutive parse failures;
- `hits` in a 10-minute window reach 4.

**Persistence** — the pending message survives a reload in `mdh:pending` (`INTERFACES §8`), together with
`hits`, `pace.mult` and `phase`. A reload therefore continues the ladder instead of restarting it.

## 6. The clock

The user's observation is right, and it is the best UX detail in the field: a rate-limit wait is
*visible in time*. Our banner carries `until` and re-renders every second:

```
● Rate limited by DeepSeek            resuming in 00:34
  attempt 2 of 3 · 5 messages this minute
  [ Pause ]                    [ Stop the task ]
```

- `mm:ss`, tabular numerals, same position as the approval card.
- At zero it flips to `Resuming…` and disappears when the send succeeds — not when the timer ends, so a
  failed resume shows the next countdown instead of a lie.
- After the final stop the countdown is replaced by `Paused — press Resume` and stays until acted on.
- When the tab is hidden the countdown continues from wall-clock, not from ticks (browsers throttle
  timers in background tabs).
