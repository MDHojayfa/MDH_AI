# M8 playbook — capturing a platform's real behaviour in ~20 minutes

Three of the eight platforms (Claude, Gemini, Grok) have **no stream evidence** in any surveyed project,
and none of the eight has a measured send interval except DeepSeek. No amount of reading fixes that; it is
a DevTools job. This is the procedure, so it is done the same way eight times and the results are
comparable.

**Rules for the session:** use a spare account where possible, never send more than four messages in the
pacing test, and **stop at the first refusal** — you are measuring, not probing the limit.

---

## 0 · Setup

1. Open the platform in a fresh tab, sign in, open DevTools.
2. Network panel → check **Preserve log**, **Disable cache**, filter **Fetch/XHR**.
3. Console → run the sniffer below *before* sending anything.

```js
// 1 · log every request URL and whether it is a stream (documented snippet, not product code)
(() => {
  const of_ = window.fetch;
  window.fetch = async function (...a) {
    const url = (a[0]?.url) || String(a[0]);
    const r = await of_.apply(this, a);
    const ct = r.headers.get('content-type') || '';
    if (/stream|event/i.test(ct)) console.warn('[SSE]', url, ct);
    else if (/chat|conversation|completion/i.test(url)) console.log('[REQ]', url, ct);
    return r;
  };
  const OW = window.WebSocket;
  window.WebSocket = function (...a) { console.warn('[WS]', a[0]); return new OW(...a); };
  window.WebSocket.prototype = OW.prototype;
  console.log('sniffer armed');
})();
```

## 1 · Find the stream

Send one short message ("hi"). In Network, the streaming request stays **pending** while tokens arrive —
that is your `apiPattern`. Record:

| Field | How to read it | Example (DeepSeek) |
|---|---|---|
| URL | right-click → Copy URL | `https://chat.deepseek.com/api/v0/chat/completion` |
| method | the request row | `POST` |
| content-type | Response headers | `text/event-stream` |
| shape | Response tab, or the console | `data: {"..."}` lines |
| paste-into-adapter | pattern that never changes per user | `/chat\/completion/` |

If nothing streams, the reply is **not** SSE → check the `[WS]` line, or accept DOM-first.

## 2 · Find the delta path

In one `data:` line, the growing text sits at a fixed path. Open three consecutive frames and note where
the text is:

```
data: {"v":{"response":{"fragments":[{"content":"Hel"}]}}}     ← DeepSeek-like
data: {"choices":[{"delta":{"content":"lo"}}]}                 ← OpenAI-like
data: {"type":"content_block_delta","delta":{"text":"lo"}}      ← Anthropic-like
```

Write it as a JS path for `extract()`: `v.response.fragments[0].content` etc. **Also note what is *not*
text** (reasoning, tool blocks) so the parser can ignore it.

## 3 · Find the terminal signal

Scroll to the end of the stream. Which of these appears?

- `data: [DONE]`
- `event: message_stop`
- a frame with `finished: true` / `finish_reason: "stop"`
- nothing at all — the connection simply closes.

Record it; it becomes the adapter's `end()` predicate. **If there is no signal**, the fallback is the DOM
stop-button rule (`research/03 §6`).

## 4 · Verify selectors (do this with a script, not by eye)

For each of the four required selectors, run:

```js
const probe = (sel) => sel.map(s => {
  const els = [...document.querySelectorAll(s)].filter(e => e.offsetParent !== null);
  return { s, n: els.length, text: (els.at(-1)?.textContent || '').slice(0, 40) };
});
console.table(probe(['/* composer */', '/* send */', '/* messages */', '/* stop */']));
```

Rules: **exactly one** visible match for composer and send; messages may match many (take the last). A
selector that matches 0 when the element is on screen is wrong, even if it "looks right" in the Elements
panel. Replace utility-class chains (`.flex.items-end`) with `data-testid`/`aria-label`/id whenever one
exists — Superpower's Grok adapter uses `.ml-auto.flex.flex-row.items-end.gap-1`, which will not survive a
week.

## 5 · Verify the editor actually accepts text

```js
const el = document.querySelector('/* composer */');
el.focus();
const before = el.value ?? el.innerText;
el.value !== undefined
  ? ((o) => (Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, 'mdh test'),
     el.dispatchEvent(new Event('input', { bubbles: true }))))()
  : document.execCommand('insertText', false, 'mdh test');
console.log('took:', (el.value ?? el.innerText) !== before);
```

If `took: false`, the editor needs the paste path or character typing (`research/04 §1`). Note which.

Then: is the primary button currently **Stop**? Send is stop on most sites. Click it now and you will
cancel a reply — verify with `aria-label`/`data-testid` before ever clicking.

## 6 · Measure the pacing (carefully)

Send four one-word messages with these gaps: **8 s, 6 s, 4 s**. Stop immediately if any message is refused.
The smallest gap that is accepted three times in a row is `minGapMs`; never publish a number you did not
observe. If the first refusal arrives, wait five minutes, then record the refusal text **verbatim**.

## 7 · Capture the refusal, verbatim

The notice is an inline element, usually near the composer. Copy the exact text, including punctuation and
the site's language, then test the regex you intend to ship:

```js
[/your\s+regex/i.test('paste the notice here')]   // must be [true]
```

Also record: does the notice disappear on its own, and does the message stay in the transcript (a
*refused* message shows as sent but unanswered — that is the trap `02-RATE-LIMITS.md §1` describes).

## 8 · Fill the adapter form (this is the deliverable)

```yaml
id: claude
host:                      # exact hostname(s) seen in location.hostname
sse:
  apiPattern:              # regex over the request URL
  content_type:            # text/event-stream | application/json | binary
  delta_path:              # path inside one frame
  end_signal:              # [DONE] | message_stop | finished | none
  notes:
pace: {minGapMs: , perMinute: }
timings: {idleMs: , stableMs: , warmupMs: , timeoutMs: }
dom:
  composer: []             # ordered, most specific first
  send: []
  messages: []
  stop: []
refusal:                   # verbatim notice + regex
quirks:                    # what broke, what fixed it
verified: 2026-11-06       # date, browser, account tier
```

## 9 · Per-platform starting point

| Platform | Known before the session | What M8 must answer |
|---|---|---|
| ChatGPT | stream `/backend-api/conversation`, `data: [DONE]`, composer `#prompt-textarea` | token path in the frame, stop-button selector today |
| Claude | selectors from web-mcp-bridge | **endpoint + frame shape** (nothing known) |
| Gemini | Quill editor `.ql-editor` | **transport** (Batchexecute?) and whether a delta exists at all |
| DeepSeek | `/chat/completion`, 6 s/5 per min, refusal regex | nothing critical — use it as the calibration run |
| Kimi | binary Connect-RPC frames | frame header layout, end signal |
| Qwen | `/api/v2/chat/completions` | domestic host (`tongyi.aliyun.com`) parity |
| GLM | `#chat-input`, `#send-message-button`, two streams | which product the user is actually on |
| Grok | `grok.com`, `x.com/i/grok` | **everything**: transport, selectors, completion |

## 10 · What "done" means for M8

All eight forms filled, each with a `verified` date, plus one screenshot of a completed exchange per
platform. Any platform whose form is incomplete ships as **beta** in the README rather than being claimed
as supported — the number "8" is a promise, and a promise with a footnote is fine, a silent one is not.
