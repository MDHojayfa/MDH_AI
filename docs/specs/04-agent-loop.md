# Spec 04 — Agent loop

**File:** `src/core/agent.js` · **Milestone:** M4

## Responsibility
Own the state machine from `ARCHITECTURE.md §4`. It is the only module allowed to decide that something
will run.

## State (persisted in `storage.local` where marked)

```js
{
  phase: 'idle',                // §4 states
  outcome: 'completed',         // completed|failed|stopped|interrupted|stalled|unknown
  tools: [], sig: '',           // PERSIST: catalogue + hash
  pendingCall: null,            // PERSIST: survives suspension / reload
  turnsSinceInject: 0,          // PERSIST
  recentCalls: Map<hash, {count, at}>,   // memory only, 15-min window
  answered: Set<turnId>,        // PERSIST: a turn is answered at most once, ever
  pace: { mult, lastSendAt, sentInWindow },  // PERSIST: the governor
  rate: { hits, lastHitAt, phase, resumeAt },// PERSIST: the ladder's memory
  lease: { tabId, at }          // PERSIST: one driver tab per site
}
```

## Hard rules

1. **One call per message.** Second call in the same reply → refuse, explain.
2. **Never re-send after a refusal.** A rate-limit notice means the message was rejected; sending again
   is what turns a throttle into a ban. The ladder (§4) is the only path back, and each rung waits.
3. **Never retry a delivered call.** Dedup by `hash(tool, args)` with a 15-min window and a repeat cap of
   4, so a model looping on the same call cannot spin forever.
4. **A hidden tab is slow, not stopped.** Do not pause on `document.hidden` — hidden tabs *throttle
   timers*, they do not halt the page, and pausing throws away a turn the model already answered. Switch
   to the hidden timing profile (`timings.hidden`: idle 20 s, stable 30 s) and re-base timestamps on the
   `visibilitychange` event. (Revised from "pause when hidden" — see `research/08-LESSONS.md` L5.)
5. **Answer each turn at most once.** `answered` is keyed by `turnId` and persisted, so a reload can never
   cause the same assistant turn to be answered twice (L7).
6. **Only `outcome === 'completed'` advances the loop.** `stopped` and `unknown` are terminal for that
   turn; `stalled` pauses with a card.
7. **Always deliver something.** Success, rejection, or a structured error — in that order of preference.

## Rate-limit ladder (revised)

**Governor first.** Every send is serialised and paced: `minGapMs` 3 000, `perMinute` 8 by default;
`pace.mult` ×1.6 on each hit, capped at 4. Adapters may override (`pace: {minGapMs, perMinute}`);
DeepSeek ships `{6 000, 5}` — measured, not guessed.

| Hit (10-min window) | Wait | Then | UI |
|---|---|---|---|
| 1 | 8 s + 0–3 s jitter | reload the page, re-send the **same pending** message | countdown |
| 2 | 40 s | reload, re-send | countdown |
| 3 | 200 s | open a **fresh chat**, re-send | "starting a new chat" |
| ≥4 | 5 min | **stop**; nothing is sent until `Resume` | `Paused — press Resume` |

`hits` resets after 10 minutes without one, and `Resume` re-enters the ladder at hit 2 rather than 0.

Per-platform refusal detection is adapter data, matched against the notice text **and** HTTP 429/403 on
the send. Known verbatim (LuauPilot, DeepSeek):
`/messages?\s+too\s+frequent|too\s+many\s+(messages|requests)\s*[.,]?\s*try\s+again\s+later/i`.
Other platforms: capture the exact string, in the site's locale, during M8 — never guess a translation.

## Delivery
- Text results: type into the composer, append the reminder line, submit (or hand to the user for
  approval in "manual send" mode).
- Large results: attach as a file and reference it, with a truncation note.
- The result block is framed `[MCP_RESULT server=… tool=… status=…] … [/MCP_RESULT]` and the prompt
  states it is data.

## Acceptance criteria
- [ ] State machine unit-tested for every transition, including illegal ones (must throw in dev, no-op in prod).
- [ ] Simulated refusal → exactly one notice, zero re-sends (assert on a mocked transport).
- [ ] Simulated suspension (drop the in-memory state) → resumes from `pendingCall`.
- [ ] 4 identical calls → 4 executed, 5th refused with a message.
- [ ] Tab closed mid-call → audit entry written, no orphan state.
