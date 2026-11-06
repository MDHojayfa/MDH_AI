# Spec 05 — Transport (native messaging)

**Files:** `src/transport/native.js`, `host/mdh_host.py` · **Milestone:** M5 · **Linux only**

## Why native messaging
No listening socket. The browser spawns the host as a child process and speaks over stdin/stdout.
A malicious page cannot reach a fd it does not have. Every other project in this space opens
`127.0.0.1:<port>` and hopes Origin checks are enough.

## Wire protocol (Chrome and Firefox use the same framing)

| Direction | Bytes |
|---|---|
| → host | 4-byte **native-endian unsigned int** length, then UTF-8 JSON |
| ← host | same |

Max message size: 1 MB from host → extension (Chrome), 4 GB extension → host in theory, **64 KB** in practice
before you should chunk. Our rule: split any payload > 48 KB into `{seq, of, chunk}` frames.

## Registration on Linux

| Browser | Host manifest path |
|---|---|
| Chrome | `~/.config/google-chrome/NativeMessagingHosts/com.mdh.host.json` |
| Brave | `~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.mdh.host.json` |
| Chromium | `~/.config/chromium/NativeMessagingHosts/com.mdh.host.json` |
| Firefox | `~/.mozilla/native-messaging-hosts/com.mdh.host.json` |

Chrome/Brave manifest:
```json
{ "name": "com.mdh.host", "description": "MDH_AI host", "path": "/home/me/.local/share/mdh/mdh-host",
  "type": "stdio", "allowed_origins": ["chrome-extension://<EXTENSION_ID>/"] }
```
Firefox manifest — **different key**:
```json
{ "name": "com.mdh.host", "description": "MDH_AI host", "path": "/home/me/.local/share/mdh/mdh-host",
  "type": "stdio", "allowed_extensions": ["mdh@mdhojayfa.dev"] }
```
`path` must be absolute and executable. `install.sh` chmods it 0755.

**Extension ID stability:** Chrome derives the ID from the unpacked directory path unless a `key` is
pinned in the manifest. Unpacked IDs therefore differ per machine → `install.sh` must ask the extension
for its ID (the popup shows it) or compute it, and write it into the host manifest.

## JS interface

```js
MDH.transport.connect()  -> Promise<void>
MDH.transport.call(msg)  -> Promise<Result>   // rejects with {code, message}
MDH.transport.onEvent(fn)                     // host-initiated events (audit, progress)
MDH.transport.status()   -> 'idle'|'connecting'|'ready'|'dead'
```

## Reconnect policy
`onDisconnect` → read `chrome.runtime.lastError` → classify:

| Cause | Action |
|---|---|
| host missing / not registered | terminal: show install instructions, no retry |
| host crashed | restart once after 1 s, then terminal |
| browser idled the worker | silent reconnect on next call |

## Host side
- Reads frames in a loop; each call is dispatched on a worker thread so a slow tool never blocks the pipe.
- Writes are serialised with a lock; never interleave a frame.
- On exit: kill children, flush the audit log, exit 0.

## Acceptance criteria
- [ ] Round-trip 1 KB / 48 KB / 1 MB payloads correctly.
- [ ] Host kill → extension recovers once, then reports clearly.
- [ ] Host manifest written for all four paths; missing browsers skipped with a printed note.
- [ ] No port is opened: `ss -ltnp` shows nothing new while running.
