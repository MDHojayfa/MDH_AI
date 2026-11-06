# The plug

The plug is the one thing that ends a task. It is a short code, and only a `finish` call carrying that exact code
stops the loop. Everything else — "done", "I have finished", a tidy summary, a row of ✅ — is prose, and prose
does not end anything.

## What the model is told

Every run gets a fresh code, and the prompt says, in these words:

> The plug is **PHX-7KQ2MD**. Nothing else ends this task: not "done", not a summary, not a friendly sign-off.

And the only legal use of it:

```json
{"mdh_call":{"tool":"finish","arguments":{"summary":"installed and tested","phoenix":"PHX-7KQ2MD"}}}
```

That is the whole plug: one JSON object, one field, six characters. No new syntax, nothing to learn, nothing to
misremember — the shape is the same shape as every other call MDH already accepts.

## Why it is a code and not a keyword

| If the rule were… | what goes wrong |
|---|---|
| the word "done" | the model writes "done" mid-task, or the site's own UI says it |
| a sentence like "task complete" | ten paraphrases, none of them checkable |
| the absence of a tool call | a truncated or refused reply is read as success |
| the model's own judgement | that *is* the bug: it believes it finished, which is the thing we are checking |

A code has one property the others cannot have: it can be **retrieved and compared**. The comparison lives in one
function (`finishAccepts`), is tested, and a wrong code can never reach the completion path.

## What happens, precisely

| The model sends | MDH does |
|---|---|
| `finish` with the right code | the task ends: `✓ Done`, finish card, run recorded |
| `finish` with no code or a wrong one | rejected, one correction showing the exact JSON, loop continues |
| a second `finish` without it | pause card: *Continue* · *Mark as finished* · *Stop* · *Report* |
| a polite sentence instead of a call | nudge ×2, then pause (this is the older loop rule, unchanged) |
| nothing at all | stalled → "no reply arrived" with the hidden-tab explanation |

You can always override: **Mark as finished** ends a run the model could not close.

## Where to see it

- **Popup → Advanced → Completion code**: the code, and the exact call the model must make.
- The audit log: `finish` appears as a normal tool call with its summary.
- The prompt itself (`docs/prompt/SYSTEM.md` shows the shape).

## If it misbehaves

A model that keeps failing to produce the code is usually being asked to do two things at once (chat *and*
tools), or has been fed a long context where the rule scrolled away. MDH repeats the code in **every** reminder
and nudge for that reason. If it still fails twice, the loop pauses rather than guessing — a human decision is
cheaper than a wrong completion.

The code is regenerated per run and is not a secret: the model is *supposed* to read it. It is a deliberateness
check, not a security control (see `docs/DECISIONS.md` D42–D43).
