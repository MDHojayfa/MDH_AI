# Testing

Five layers. The first four run without a browser or a signed-in account; the fifth is a checklist a human
runs before a release.

## 1. Units — `npm test`

58 tests against the shipped files, loaded into a `vm` sandbox with a fake storage and a fake page. No
copies of the logic, so a green run means something about the extension itself.

| Area | File | What it pins |
|---|---|---|
| parser | `tests/parser.test.mjs` | last closed fence wins, two calls execute nothing, repairs, unclosed/truncated, foreign syntax is named not quoted, conservative coercion |
| policy | `tests/policy.test.mjs` | allow/deny, traversal, deny-over-allow, unknown tools ask, commands always ask, card describes the *request* |
| prompt | `tests/prompt.test.mjs` | signatures not JSON Schema, budget respected with dropped tools named, verbatim task, credit present exactly once |
| guard | `tests/guard.test.mjs` | realpath check, symlink escape, missing-path creation, empty input |
| audit | `tests/audit.test.mjs` | chain verifies, silent edit detected, no file contents stored, only the first command line kept |
| host | `tests/host.test.mjs` | real `run_command` output, batched shell, timeout kill, atomic write, ambiguous edit, binary refusal, truncation |
| manifests | `tests/manifest.test.mjs` | eight platforms, MAIN/ISOLATED split, module order, Firefox event page, Chrome key → stable ID, no `http://` |

## 2. Build invariants — `npm run build`

The build refuses to emit a manifest that would fail in the field: wrong world for the tap, missing
`nativeMessaging`, a Firefox service worker, an absent Gecko ID, a Chromium-only field in the Firefox
artifact, an insecure origin, a key that does not derive the documented extension ID.

`npx web-ext lint --source-dir dist/firefox` must stay at **0 errors**. One warning about Firefox for
Android is expected and irrelevant: this product is desktop only.

## 3. Host — `node tools/selfcheck.mjs`

Spawns the host exactly as a browser does — length-prefixed frames on stdin — and waits for a real pong.
`install.sh` ends here, because "the manifest is written" is not the same claim as "the host answers".

Beyond the ping, the host is exercised by hand for the risky paths:

| Case | Expected |
|---|---|
| `read_file ~/projects/x` | content, line-numbered |
| `read_file ~/.ssh/id_rsa` | `PATH_DENIED`, nothing read |
| `write_file` outside the allowlist | `PATH_DENIED` |
| `edit_file` with text that appears twice | `AMBIGUOUS_MATCH` |
| `run_command` with 20 commands, one failing | first non-zero exit, all output |
| `run_command` past the timeout | killed, `exit_code: 124` |
| an MCP server that never starts | `TOOL_MISSING` for its tools; host stays alive |
| kill the host mid-call | extension reports `NO_HOST` and offers Retry |

## 4. Loop — deterministic parts

The agent's `_internals` are exported for exactly this. The cases that decide whether the product is safe:

- one call in, one result out; the result is a single bounded block
- the same call four times in fifteen minutes is refused on the fifth, and the model is told why
- a refusal never re-sends: it walks the ladder and stops
- a reload after a denial offers resume; it does not re-send the call
- a second tab cannot take the lease while the first is driving
- sixty turns, or three consecutive tool errors, ends the session with a stated reason

## 5. Release checklist — a human, one platform at a time

For each of the eight, in the two browsers the maintainer has:

1. Fresh chat, ask for a small task ("list `~/projects` and tell me the newest folder").
2. Accept the approval card; confirm the result appears in the chat and the popup counters move.
3. Deny a write; confirm the model is told and does not retry it verbatim.
4. Send two tasks back to back; confirm pacing held and no duplicate execution occurred.
5. Switch tabs mid-reply; confirm the hidden-tab timing still completes.
6. Reload the page mid-reply; confirm the turn is not executed twice.
7. Copy the log and check the stage names read sensibly.

Anything that fails becomes a fixture plus a test, or an adapter change — in that order.
