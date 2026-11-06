# Injecting into the page — MAIN world, CSP, and the blind spot

The interceptor has to run **inside the page's own JavaScript context** (to wrap `window.fetch` before the
site calls it), while the loop and the UI must run in the **isolated** world (to keep our state out of the
page's reach). How those two worlds are created is a security decision, not a convenience.

---

## 1 · The version facts (verified locally against `@mdn/browser-compat-data@8.1.8`)

```
content_scripts.world   chrome 111 · edge 111 · firefox 128 · opera 97 · safari 18
scripting.registerContentScripts (dynamic registration)   chrome 96
```

Our minimums are Chrome 116 and Firefox 140, so `world: "MAIN"` is available on every browser we support
and the manifest can declare both scripts statically. No dynamic registration, no permissions dance.

## 2 · The decision: declare both, never inject a `<script>` tag

The classic trick — `document.createElement('script'); s.src = chrome.runtime.getURL('inject.js')` — fails
on any site with a strict `script-src` (and inline injection fails on all of them, because the page's CSP
governs DOM-inserted script elements, not browser-injected content scripts).

| Approach | CSP `script-src` | Ordering vs page code | Verdict |
|---|---|---|---|
| `createElement('script')` + `src` | **blocked** unless the extension origin is allowlisted | racy | rejected |
| inline `<script>` text | **blocked** by `script-src` without `unsafe-inline` | racy | rejected |
| manifest `content_scripts` with `world: "MAIN"`, `run_at: "document_start"` | **not subject to page CSP** — the browser injects it | runs before page scripts | **chosen** |
| `chrome.scripting.executeScript({world:'MAIN'})` at runtime | not subject to page CSP | after load; too late for the first fetch | fallback only |

Firefox needs the same thing expressed in the same manifest key (`world` is supported since 128), which is
why one manifest serves both engines.

## 3 · What MAIN world actually means for us

- The wrapper is a **page-realm object**: `window.fetch` is ours for the lifetime of the page, and any page
  script can see it, undo it, or wrap it again. That is expected — `specs/01` handles "page already
  wrapped" by chaining, and `interceptor.status() === 'degraded'` is reported to the popup.
- Our **secrets never enter that realm.** The MAIN script has no extension APIs, no tokens, no state: it
  receives a port name from the isolated script and only forwards text. If the page tampers with it, the
  page can only hurt itself.
- The isolated script (our loop, policy, UI) is invisible to the page, and its `chrome.*` APIs are not
  reachable from MAIN world at all.

## 4 · The blind spot nobody documents: workers

If a site ever streams replies from a **Web Worker / SharedWorker / Service Worker**, the fetch happens in
a different global and our wrapper never sees it. This is not hypothetical — it is exactly the kind of
change a site makes to move heavy streaming off the main thread.

Mitigations, in order:
1. **DOM read** (`messages` selectors) — always available, which is why the read ladder ends there;
2. patch `Worker`/`SharedWorker` constructors and inject our wrapper into the worker's source (possible in
   MAIN world, fragile, and out of scope for v1);
3. detect the situation: if the composer is busy and no stream has been seen for 15 s while the DOM *is*
   producing text, log `TRANSPORT_WORKER` and switch that conversation to DOM mode.

v1 ships 1 and 3. Point 2 is documented as a known limitation rather than half-built.

## 5 · Trusted Types and other page policies

- We never assign HTML: no `innerHTML`, no `insertAdjacentHTML`. Our UI lives in a **Shadow DOM** on a
  container we create, which sidesteps a page's `Trusted Types` requirement for `script`/`innerHTML`.
- `document.execCommand('insertText')` (the composer path) is not a Trusted Types sink.
- If a page enforces `require-trusted-types-for 'script'` *and* we ever need to set text in a rich editor,
  the fallback is character-by-character `InputEvent` dispatch (`research/04 §1`), not HTML.

## 6 · Consequences written into the specs

| Change | Where |
|---|---|
| MAIN-world script declared in the manifest, `document_start`, both engines | `specs/01`, `specs/08` overlays |
| Never inject via script tag — and a test asserting the built manifests contain the MAIN entry | `TESTPLAN` L1 |
| `interceptor.status() === 'degraded'` surfaced in the popup pipeline strip | `specs/09 §8.2` |
| Worker blind spot + `TRANSPORT_WORKER` detection → DOM mode | `specs/01`, `ARCHITECTURE` failure table |
| No HTML in the page's realm; Shadow DOM + text only | `specs/09 §4` |
