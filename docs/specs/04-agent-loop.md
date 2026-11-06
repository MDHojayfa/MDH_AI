# Spec 04 — Agent loop

**File:** `src/core/agent.js` · **Milestone:** M4

## Responsibility
Own the state machine from `ARCHITECTURE.md §4`. It is the only module allowed to decide that something
will run.

## State (persisted in `storage.local` where marked)

```js
{
  phase: 'idle',                // §4 states
  tools: [], sig: '',           // PERSIST: catalogue + hash
  pendingCall: null,            // PERSIST: survives suspension / reload
  turnsSinceInject: 0,          // PERSIST
  recentCalls: Map<hash, {count, at}>,   // memory only, 15-min window
  lease: { tabId, at }          // PERSIST: one driver tab per site
}
```

## Hard rules

1. **One call per message.** Second call in the same reply → refuse, explain.
2. **Never re-send after a refusal.** A rate-limit notice means the message was rejected; sending again
   is what turns a throttle into a ban. Transition to `REFUSED`, show the ladder, resume on user action.
3. **Never retry a delivered call.** Dedup by `hash(server, tool, args)` with a 15-min window and a
   repeat cap of 4, so a model looping on the same call cannot spin forever.
4. **Never run while the tab is hidden *if* the platform throttles timers** — instead pause and resume
   on visibility, because half-executed DOM writes are worse than a delay.
5. **Always deliver something.** Success, rejection, or a structured error — in that order of preference.

## Rate-limit ladder

| Hit | Wait | Action |
|---|---|---|
| 1 | 8 s + jitter | pause the loop, one-line notice, reload the chat |
| 2 | 40 s + jitter | same, longer |
| 3 | 5 min, then 15 min | stop; require the user to resume manually |
| >3 | — | disable the session for this tab until reload |

Per-platform refusal detection is adapter data (`refusal: /too frequent|稍后重试|发送过于频繁/i`).

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
