# Spec 02 — Call parser

**File:** `src/core/parser.js` · **Pure functions, no DOM** · **Milestone:** M3

## Responsibility
Turn a pile of assistant text into exactly one `{server, tool, args}` — or a precise reason why not.

## Envelope (ours, and the model is told this)

````
```json
{"mcp_call":{"server":"desktop","name":"file_read","arguments":{"path":"/home/me/x"}}}
```
````

## Interface

```js
MDH.parser.find(text) -> { calls: Call[], partial: boolean }
MDH.parser.repair(raw) -> { ok: boolean, call?: Call, reason?: Reason }
MDH.parser.explain(reason, ctx) -> string   // the message we send back to the model
```

`Reason ∈ 'none' | 'unclosed' | 'not_json' | 'wrong_key' | 'missing_name' | 'multi' | 'truncated' | 'foreign_markup'`

## Repair ladder (in order)

1. Strip code fences and surrounding prose.
2. Extract balanced `{...}` objects (string- and escape-aware).
3. Repair common damage: smart quotes, trailing commas, raw newlines in strings, `C:\Users` backslashes, `\n` inside strings, JS `//` comments.
4. If `mcp_call` is missing but a lone object has `server`+`name`, lift it into the envelope.
5. If the key is wrong (`tool`, `name`, `function`, `action`), rename it and *tell the model what it did wrong*.
6. If multiple calls are present: **execute none**, return `reason='multi'` with the list of names.
7. If the object is incomplete (`partial`), return `truncated` and wait for the stream to finish before responding.

## Argument coercion
Types are coerced **against the tool's JSON schema**, not guessed: `"5"`→`5` when `number`, `"true"`→`true`,
comma-string→array when `array`. Unknown keys are dropped and reported once.

## Foreign markup
Some models emit their own tool dialect (e.g. DeepSeek DSML tags, XML-ish `<invoke>`). Detect and
respond with a *description* of the mistake that never quotes the marker literally — quoting it makes
the model re-emit it and loops forever. (Learned from the upstream base's bug.)

## Invariants
1. Deterministic: same input → same output, no timers, no globals.
2. Never executes anything. Parsing and execution are separated by the approval gate.
3. Every failure produces a human-readable `explain()` that names the *specific* fix.

## Acceptance criteria
- [ ] Corpus of 200 real malformed replies (collected during M8) repairs or explains correctly.
- [ ] `multi` never executes a partial subset.
- [ ] `explain()` output contains no literal marker strings that could re-trigger detection.
- [ ] 100 % coverage of the ladder steps.
