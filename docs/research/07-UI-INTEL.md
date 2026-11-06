# UI intelligence — what users actually watch

Three projects have shipped interfaces for this loop. Their choices, and what we take.

---

## 1. chat-on-steroids — the popup is a *diagnostic panel*, not a settings form

Its `extension/popup.html` is organised by **stages of the pipeline**, each with a tick, a name and a
metric:

```
▸ Reaching the app            ●  [badge]  ›
    ✓ Request ID found        120 ms
    ✓ Sent to app             4 ms
    ✓ Owner confirmed         8 ms
    why: …
    calls: …
```
then two toggles:
```
🖊 Overwrite ChatGPT     [on]
🕐 Timestamps            [off]     ← the clock icon
```
and an `Advanced` disclosure with a grid of values plus **Copy** and **Try again**.

Lessons:
- **Show the pipeline, not a status word.** When it breaks, the user can say *which stage*.
- **A `Try again` button that only appears when there is something to retry.** No dead buttons.
- The **clock** here is a *timestamps* toggle: every tool call in the chat can carry the time it ran, on
  the machine's clock (`overlay.css`):
  ```css
  /* When the app ran the call, on this machine's clock. Quiet and after the result, because
     almost nobody reads a transcript for the time — but when the question is what happened
     between two calls, it is the only thing that answers it. */
  .clf-when { margin-left: .5em; font-size: .85em; font-variant-numeric: tabular-nums; opacity: .45; }
  ```
  Off by default, tabular numerals, 45 % opacity. That is the right weight for a detail nobody reads
  until something goes wrong.

## 2. LuauPilot — the countdown banner (the "clock" that matters)

`UI().banner("rate", { text, until: now() + ms, tone: "warn" })`, and when the ladder gives up:

```js
UI().banner("rate", {
  text: `DeepSeek is limiting messages right now. LuauPilot stopped on purpose - wait a few minutes.`,
  until: S.rate.blockedUntil, tone: "error", doneText: "You can try again now.",
  actions: [{ label: "Try again now", fn: () => resumeFromBlock() }],
});
```

A countdown plus **one** action. Not a modal, not a toast that vanishes: the wait is the state, and it
must be visible for its whole duration. `doneText` distinguishes "waiting" from "ready" — the banner
changes in place rather than disappearing.

## 3. Superpower — icon semantics for stalls

`stalledStreamHandler.ts`:
- **clock icon** — an incomplete tool block that was already incomplete when the page loaded;
- **warning icon** — a block that stalled while streaming (and gets bounded retries).

The icon tells the user whether reloading can help. Ours adopts the same distinction for a stalled reply
(`03 §3`).

## 4. What nobody does, and we should

| Gap | Why it matters | Our answer |
|---|---|---|
| An approval card that shows **the actual arguments** | users approve a black box otherwise | `specs/09-ui.md §2`: full command, path, 6-line preview |
| A visible **turn counter + elapsed time** | a loop that has run 40 turns must look different from one at turn 2 | popup: `turn 7 · 2 calls · 1 denied · 03:12` |
| Telling the user **which stage** is slow | "it's stuck" is the only bug report you get otherwise | popup stage list (from CoS), 4 stages only |
| A **denied-loop** guard in the UI | models ask for the same denied thing again | card: "The model asked again for something you denied. Stop it?" |
| Rate-limit **per platform** | each site limits differently; one timing profile is wrong everywhere | `PLATFORMS.md` per-adapter `pace`/`timings` |

## 5. Concrete additions to `specs/09-ui.md`

1. **Countdown bar** (rate limit): `mm:ss`, tabular numerals, changes to `Resuming…` at zero, becomes
   `Paused — press Resume` after the final stop. Wall-clock, not ticks.
2. **Pipeline strip in the popup** — four stages: `page found → host connected → tools loaded → idle|running`,
   each with a tick and a duration. Replaces the single status dot on failure only (dot stays for the
   healthy case).
3. **Timestamps toggle** (off by default) — a small time chip after each tool result in the transcript,
   `font-variant-numeric: tabular-nums; opacity: .45`. This is the "clock" the user noticed; it is worth
   having, but quiet.
4. **Stall affordances** — clock icon for pre-existing incomplete calls, warning icon + `Keep waiting` /
   `Stop` for a live stall.
5. **Copy / Try again** in the popup's Advanced area, and nothing else. Every extra button is a support
   ticket.
6. **Honest counting** — the popup shows `1 denied` in the session line, so a user who denies a lot can
   see why the model keeps asking.
