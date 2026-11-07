# Framing — every message the extension itself sends

A web UI gives us exactly one channel: *appear to be the user*. Every string below is a thing we type
into the composer. They are templates — the words are final, the values are not.

Principle: **the model must always be able to tell our text from the user's text.** Ours starts with a
`[MDH…]` marker and is wrapped in a marker where it matters. The user's own words are never rewritten.

---

## 1. Injection (the system prompt has no home, so we make one)

A web chat has no system role. Three options were considered:

| Option | Cost | Verdict |
|---|---|---|
| Send the prompt as its own first message, wait for "OK" | 1 extra model turn, every conversation | rejected — burns a daily-limit turn for nothing |
| Put the prompt in the page's memory and hope | nothing | rejected — it is not a thing web UIs support |
| **Prepend it to the user's first real message** | 0 turns | **chosen** |

So a first message looks like:

```
[MDH:{{signature}}]
<full system prompt>

---
{{the user's actual message, untouched}}
```

The `---` separator is ours; the user's text is appended verbatim. If the user's message is empty
(they pressed the toolbar button with nothing typed), we send a task stub:

```
[MDH] No task given yet. Reply with one short sentence saying you are ready, and wait.
```

Re-injection rules:
- New conversation → inject.
- Same conversation, page reloaded, `[MDH:` still in scrollback → **do not** re-inject; just re-send
  the reminder line with the next message.
- Scrollback trimmed (signature gone) → re-inject once, prefixed `[MDH] (context was trimmed; here are
  your tools again)`.

## 2. Result frame

```
[MDH_RESULT#{{tag}} tool="{{tool}}" status="{{ok|error|denied|timeout}}"]
{{body}}
[/MDH_RESULT#{{tag}}]
```

Body rules:
- `ok` → the content, verbatim. Text as text. Binaries never as text: `[attached: screenshot.png, 412 KB]`.
- `error` → the error string, plus one hint line when we know the cause (`hint: path is outside the
  allowlist`).
- `denied` → `The user denied this call. Do not retry it.` — and nothing else. No argument echo, no
  "try again with different arguments" (that is an invitation to retry).
- `timeout` → `No result after {{n}}s; the command may still be running.`

Then the reminder line (`SYSTEM.md §3`, `mode:"result"`).

Truncation: >48 KB of text is cut at a UTF-8 boundary and ends with
`[…truncated: showing 48 KB of 213 KB. Continue with offset/limit or write the output to a file.]`

## 3. The reminder line

Appended to the end of every message we send — including result frames and including the user's own
messages (in that case appended after their text, never before). Two forms, `user` and `result`, text in
`SYSTEM.md §3`. Never more than 220 characters.

## 4. Parse failure

When `parser.js` cannot find a readable call but the reply *looks* like it tried (`Reason ≠ none`):

```
[MDH_PARSE] I could not read your last reply: {{reason}}. Reply with ONLY the json block, one line,
valid JSON: {"mdh_call":{"tool":"…","arguments":{}}}
[/MDH_PARSE]
```

`reason` is a machine code expanded for humans:

| code | text shown to the model |
|---|---|
| `unclosed` | `your json block was never closed` |
| `not_json` | `your block is not valid JSON ({{detail}})` |
| `wrong_key` | `use the key "mdh_call", not "{{found}}"` |
| `missing_name` | `the call has no "tool"` |
| `multi` | `you sent more than one call; send exactly one` |
| `truncated` | `your reply was cut off before the json ended` |
| `foreign_markup` | `your reply contained tool syntax from another system; use only the json block` |

**One retry, then stop.** Two consecutive parse failures → the loop halts and tells the user in the
popup, because a third attempt is where free-tier limits start.

Critically: `explain()` must **never quote the foreign marker** it found — quoting `antml:invoke` or
`<tool_call>` back to the model makes it echo that syntax harder. See `docs/INTERFACES.md` §6.

## 5. Approval (UI-side, not a message)

The card appears in the page, anchored above the composer:

```
┌──────────────────────────────────────────────┐
│ MDH wants to run a command                   │
│                                              │
│  git status                                  │
│                                              │
│  in  ~/projects/mdh-ai                       │
│  [ Always allow git * ]                      │
│                                              │
│   Deny        Allow once        Allow ▲      │
└──────────────────────────────────────────────┘
```

Three states, exactly as `docs/INTERFACES.md` §4: `deny` (default on timeout, 120 s), `once`,
`always` (scoped to this tool signature for this tab session). Keyboard: `Esc` deny, `Enter` allow once.
The card never covers the composer — the model must stay interruptible.

## 6. Rate limit

Detected when the site refuses (`adapter.refusal` matches, or HTTP 429/403 on a send). We do **not**
send anything to the model. The popup shows:

```
Rate limited by DeepSeek. Waiting 40 s, then resuming. (attempt 2 of 3)
      Pause indefinitely        Stop the task
```

Only after the wait completes do we send:

```
[MDH_NOTE] The site rate-limited us; we waited {{n}}s and resumed. Continue the task.
```

If the wait fails 3 times: the session disables itself and the message becomes
`Rate limited 3 times. Task paused — the pending call is saved. Press Resume when the limit clears.`
The pending call is persisted, never re-sent automatically.

## 7. Reload / context loss

Page reloaded during a call:

```
[MDH_NOTE] The page reloaded, so the previous result was lost. Your last call
({{tool}}) was not completed. Decide whether to call it again.
```

Extension reloaded mid-session: the loop does **not** resume. Popup says
`Connection lost — reload the page to reconnect.` (Silently resuming is how a call gets executed twice.)

## 8. Task completion

No special message. The model answers in text, we stop. The popup gets a `Done` state with the turn
count and elapsed time. A `[MDH_DONE]` marker was considered and rejected — it trains the model to
announce completion instead of doing it.

## 9. Strings that must never appear

- `"As an AI"` / `"I cannot"` — if the model says them, the injection failed; log it as a bug.
- Any hint of an API key, model name, or provider config in anything we send.
- The user's own message, reworded. We append; we never edit.
