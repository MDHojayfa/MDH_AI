# Sending — how to actually get a message into the composer

Reading the reply is the easy half. Writing into an editor that was built to resist automation is the
other half, and it is where most of the "it didn't send" bug reports live.

---

## 1. The editor matrix

| Site | Editor | What breaks naive code | Working approach (evidence) |
|---|---|---|---|
| ChatGPT | ProseMirror `div#prompt-textarea[contenteditable]`, or CodeMirror `.cm-content` | `value =` does nothing; ProseMirror re-renders on input | focus, then `document.execCommand('insertText')` or a synthetic `paste`; Superpower types char-by-char with `characterDelay` (config `typing.{minDelay,maxDelay,characterDelay}`) |
| Claude | ProseMirror (`div.ProseMirror`) | same, plus send button is `aria-label`-driven | `beforeinput` + `InputEvent('insertText')` |
| Gemini | Quill `div.ql-editor` — **type into the inner `p`**, not the div | Quill ignores direct child insertion | Superpower: `div.ql-editor.textarea.new-input-ui p`; ZeroScript also uses `.ql-editor[contenteditable='true']` |
| DeepSeek | `textarea.ds-textarea` (React-controlled) | React ignores `el.value =` | the native value setter: `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set` then `dispatchEvent(new Event('input',{bubbles:true}))` |
| Kimi | `.chat-input-editor` contenteditable | rich editor | paste event + verification |
| Qwen | `.message-input-wrapper` / `.chat-message-input-fixed-container` | rich editor | paste event |
| GLM / z.ai | `#chat-input` (both `chat.z.ai` and `chatglm.cn`) | plain input, but send button is gated | value setter + `input` event, then verify `#send-message-button` enables |
| Grok | `textarea` or `div[contenteditable]` (unverified) | — | try setter, fall back to paste |

**Two implementations cover all of them**: a `setText(el, text)` that branches on `textarea` vs
`contenteditable`, and a `verify()` that reads the text back. If `verify()` fails, fall back once to
character-typing with a 15–30 ms delay, then give up loudly (`SEND_FAILED`), never silently.

## 2. The send button is also the stop button

DeepSeek, ChatGPT, Claude, Gemini and Kimi all morph the primary button into **Stop** while streaming.
LuauPilot's provider encodes the rule:

```js
// the send button is also STOP: never click while a reply is streaming
if (isStop(primaryButton()) && !(await kit.waitFor(() => !isStop(primaryButton()), 5000))) return false;
```

Clicking it mid-reply **cancels the model's answer** and produces outcome `stopped` — which our loop
treats as terminal. So: always probe `isStop()` first, wait up to 5 s for it to clear, and only then
send. The same applies to the Enter key.

## 3. Acceptance = a page change, not a promise

After clicking send, the client must confirm the page took the message. LuauPilot's predicate:

```js
const accepted = () => editorText().trim() === ""                     // composer cleared
                 || allMessages().filter(isUser).length > before      // a new user bubble appeared
                 || isStop(primaryButton());                          // generation started
```

with a bounded retry: at most **2 clicks**, then **Enter** as a fallback, inside a 6 s deadline (25 s when
attachments are uploading), and a `rateShown()` check after every attempt. On failure it clears the
editor and removes attachments so the next attempt starts clean.

**Our version of that algorithm, which is what `specs/09-ui.md` and `core/agent.js` must implement:**

```
1 if isStop() → wait ≤5 s for clear, else STOPPED_ELSEWHERE
2 setText(composer, text);  if !verify() → typeSlow();  if !verify() → SEND_FAILED
3 before = userTurnCount()
4 click send (≤2) → if !accepted() within 2.5 s → Enter → if !accepted() within 4 s → SEND_FAILED
5 after every attempt: if refusal notice → RATE_LIMIT (terminal, never resend)
6 on SEND_FAILED: clear composer, remove attachments, restore draft to mdh:pending
```

## 4. Attachments are a different path on every site

- DeepSeek: a synthetic paste only creates a **local preview**; the real upload starts from
  `input[type=file]`. LuauPilot sets files on that input.
- Gemini: `div[xapfileselectordropzone]` plus a hidden `input[type=file]`.
- ChatGPT: `input[type="file"]` (Superpower: `button[aria-label*="Attach"], input[type="file"] + button`).

v1 consequence: **we do not attach files to the prompt at all.** Results come back as text, and binaries
are described (`[attached: shot.png, 412 KB]`) rather than uploaded. Attachment support is a v1.1 item,
because every site needs its own path and the failure mode is silent.

## 5. Pacing and the governor

Every send passes through the governor (`02-RATE-LIMITS.md §5`): serialised, `minGapMs`, `perMinute`,
`pace.mult` after hits. A second tab on the same platform is blocked by the lease (`NO_TAB`), so the
governor never has to coordinate across tabs.

## 6. What we deliberately do not do

- **No `KeyboardEvent` for letters on ProseMirror.** It fires but the editor ignores it, which produces
  "sometimes works" — the worst kind of bug. `execCommand`/`InputEvent`/paste only.
- **No clicking by coordinates.** Layout changes and the user's zoom level change the button's position.
- **No auto-clicking a "Continue generating" button.** It is a provider offer, not our decision.
- **No hidden tabs.** Sending from a background tab is allowed only if the site already had the tab
  focused at least once; a never-focused tab's composer can be uninitialised. We require the tab to have
  been visible once per session (cheap flag in `storage.session`-equivalent).
