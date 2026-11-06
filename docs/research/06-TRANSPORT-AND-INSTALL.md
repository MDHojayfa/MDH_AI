# Transport & install — what the field actually does

Four transports appear in the survey: native messaging, a localhost WebSocket, a localhost HTTP server,
and `chrome.debugger` driving. Their real-world costs, from code.

---

## 1. Native messaging, as implemented

`deepseek-pp/packages/shell-host/lib/installer-locations.mjs` is the cleanest cross-OS version:

```js
const manifestSegments = {          // linux
  chrome:   ['.config', 'google-chrome', 'NativeMessagingHosts'],
  chromium: ['.config', 'chromium', 'NativeMessagingHosts'],
  edge:     ['.config', 'microsoft-edge', 'NativeMessagingHosts'],
  firefox:  ['.mozilla', 'native-messaging-hosts'],
};
```
```js
if (args.browser === 'firefox') manifest.allowed_extensions = [FIREFOX_EXTENSION_ID];
else { if (!args.extensionId) throw new Error('--extension-id is required for Chrome/Edge/Chromium.');
       manifest.allowed_origins = [`chrome-extension://${args.extensionId}/`]; }
```

Two details worth keeping:
- the manifest's `path` points at a **wrapper script**, not at `node` directly — the OS requires an
  executable file, and a wrapper is also where you put environment and logging;
- Firefox's ID is a **string** (`deepseek-pp@zhu1090093659.github`), Chromium's is an **origin**
  (`chrome-extension://<id>/`). One typo in either is a silent failure — the browser simply refuses.

**Brave** is absent from their table; ours adds `~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/`.
That is the only Brave-specific line in the whole project.

## 2. Extension ID stability — three independent solutions

The unpacked-extension ID is derived from the directory path, so it changes per machine — and a host
manifest that lists the wrong ID fails silently. Every mature project solves it the same way:

- **Interceptor**, `ARCHITECTURE.md`: *"`extension/manifest.json#key` carries the Chrome Web Store item
  public key, so an unpacked load … derives the same extension ID as the store install."*
- **BrowserMCP**: *"Every build of this extension has the same ID (`imlplcjlhgpajopdbpbngiadkcmdbgob`,
  from the `key` in `apps/extension/extension-key.ts`)"* — and the server accepts extra IDs from
  `BROWSER_MCP_EXTENSION_IDS`.
- **ai-tool-agent**: ships a `key` as the first field of `manifest.json`.

Our D2 (pin the key, print the derived ID at install) is therefore not a clever trick — it is the
industry-standard fix, and three projects independently converged on it. Keep it.

## 3. Firefox: what is impossible, and what that means for us

BrowserMCP's README: **"Firefox has no `debugger` API, so Browser MCP doesn't work there."**

That is the whole reason the automation-based school cannot serve Firefox. Our design reads network
streams and writes into the composer — neither needs `debugger`. The **only** genuinely missing Firefox
feature is `background.service_worker` (bug 1573659), already handled by the dual-key manifest.

`k3d3/firefox_mcpbridge` shows the Firefox-native shape (MV2, no licence, read-only reference):

```json
"content_scripts": [
  { "matches": ["*://claude.ai/*"], "js": ["bridge.js"],     "run_at": "document_start" },
  { "matches": ["*://claude.ai/*"], "js": ["page_script.js"], "run_at": "document_start", "world": "MAIN" }
]
```
Two worlds, one at `document_start` — exactly our `content/injected.js` (MAIN) + `content/main.js`
(ISOLATED) split. That pattern is correct on both engines.

## 4. Transports we rejected, with the evidence

| Transport | Where seen | Why not |
|---|---|---|
| **localhost WebSocket** | ZeroScript, web-mcp-bridge, Interceptor (as a second path) | any local process or page can attempt a connection; needs a port, an origin allowlist, and a token to be roughly as safe as native messaging — which needs none of them |
| **localhost HTTP** | ai-tool-agent (`127.0.0.1:3002`, whitelisted in `host_permissions`) | same, plus the browser is granted permission to a local origin. Two processes to keep alive |
| **`chrome.debugger` + Playwright** | BrowserMCP, Interceptor | Chromium-only, an automation banner on every tab, and it fights the user for the mouse |
| **CLI subscription** | Endoplexity (`claude`/`cursor-agent`) | requires a paid CLI login — fails "no account, no key" |
| **Reimplement the client** | deepseek-pp (`pow.ts`, `request-codec.ts`) | inherits PoW, tokens and header churn forever |

Interceptor's own docs admit the wart of running both: a copy missing from `allowed_origins`
*"still works over the WebSocket"* — i.e. the port is a bypass of the identity check. One transport, one
identity: ours.

## 5. Lifecycle facts that cost install bugs

- **The browser starts the host.** Interceptor: *"Chrome spawning the daemon on browser start"* — the host
  must be cheap to start, log to stderr, and exit when stdin closes.
- **One copy per profile.** BrowserMCP: *"Keep one copy per profile: both bind the same extension entry,
  and loading the unpacked folder over a store install takes the entry over."* Our `install.sh` should
  detect a second copy and say so.
- **Pin the ID before the user loads anything**, otherwise the first `sys_info` fails and the popup shows
  the red state. `install.sh` order: write host manifest (with the pinned ID) → build → print load
  instructions → verify.
- **A pairing code** (BrowserMCP's six digits, compared between app and popup) is a good pattern for
  defeating a spoofed local process. Native messaging already authenticates the caller at the OS level, so
  v1 does not need it — but a first-run confirmation card is still worth having.

## 6. What our install has to do (revised)

```
install.sh
 1 detect browsers: ~/.config/{google-chrome,BraveSoftware/Brave-Browser,chromium},
                    ~/.mozilla  (presence of the profile dir, not the binary)
 2 derive ID: pinned `key` in src/manifest.base.json → sha256 → first 32 hex chars → 'a'..'p'
              print it; never guess
 3 render host manifests: allowed_origins[chrome-extension://<id>/] + allowed_extensions[mdh@mdhojayfa.dev]
 4 wrapper at ~/.local/share/mdh/host.sh (0755): exec node <repo>/host/mdh-host.mjs "$@", logs to stderr
 5 prerequisites: node >= 20, python3 (only if the user's MCP servers need it)
 6 self-check: spawn the host, send `{"t":"ping"}`, expect `{"t":"pong"}` — fail loudly, not silently
 7 --dry-run prints every path it would write and touches nothing
 8 --uninstall removes manifests + wrapper, leaves audit log and config
```

The self-check in step 6 is the one thing no surveyed project does well: they all install a manifest and
*assume* it works, which is why "host offline" is the most common support issue (`REVIEW.md E2`).
