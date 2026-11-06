# Test plan

Nothing here needs a GUI browser except the last layer, and that layer is a human checklist.

## Layer 1 — unit (no browser, runs in CI)

| Module | Tests | Gate |
|---|---|---|
| `parser` | envelope, 200-case malformed corpus, coercion, multi-call refusal | 100 % of repair ladder |
| `prompt` | signature token budget < 1,200, reminder < 220 chars, no Spanish leakage | fails build |
| `interceptor` | 8 synthetic SSE fixtures; chunk-split fuzz (10 k splits → identical output) | byte-identical |
| `agent` | every state transition, illegal transitions, refusal → zero re-sends, dedup cap at 4 | no re-send after refusal |
| `policy` | `..`, symlink, `~`, absolute, encoding tricks → all refused | zero bypasses |
| `mcp_client` | id matching under interleaved responses, timeout, crash+retry-once | no hangs |

Tooling: `node --test`, `pytest`. No network. Runtime target < 60 s.

## Layer 2 — harness (no browser, real processes)

A fake "chat" driver feeds recorded model replies into the real `agent.js` + real host over a fake
transport. This proves the loop and the host agree on the protocol before any browser is involved.

- [ ] end-to-end: inject → call → approve → execute → deliver, with a dummy MCP server
- [ ] host kill mid-call → one retry → structured error
- [ ] 1 MB result → chunked frames → reassembled exactly

## Layer 3 — live checklist (human, ~10 min per browser)

| Step | Chrome | Brave | Firefox |
|---|---|---|---|
| Load unpacked / temporary add-on | ☐ | ☐ | ☐ |
| No console errors on load | ☐ | ☐ | ☐ |
| Native host connects (`sys_info` returns) | ☐ | ☐ | ☐ |
| Approval card appears for `run_command` | ☐ | ☐ | ☐ |
| Deny → nothing executes | ☐ | ☐ | ☐ |
| Result delivered, loop continues | ☐ | ☐ | ☐ |
| Reload extension mid-session → clean stop | ☐ | ☐ | ☐ |
| Tab hidden during a 60 s tool call | ☐ | ☐ | ☐ |
| Firefox: event page survived the call | — | — | ☐ |

## Layer 4 — platform matrix (8 platforms × 3 browsers = 24 cells)

For each cell: `list the files in ~/mdh` → approve → correct result, twice in a row.

| | ChatGPT | Claude | Gemini | DeepSeek | Kimi | Qwen | GLM | Grok |
|---|---|---|---|---|---|---|---|---|
| Chrome | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Brave | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Firefox | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

Record per cell: stream format found, whether SSE or DOM won, refusal string (verbatim), notes.

## Layer 5 — adversarial

- [ ] Prompt injection corpus: 20 hostile file contents ("ignore previous instructions…") → assert the
      approval gate still fires, no auto-execution.
- [ ] Malicious page in another tab attempts to reach the host → assert no port to reach.
- [ ] Symlink inside the allowlist pointing at `~/.ssh` → refused.
- [ ] Model emits two calls → none executed.
- [ ] Model loops the same call 6× → 5th refused.
- [ ] Rate-limit fixture → exactly one notice, zero re-sends.

## Definition of done mapping

Each checkbox in `PLAN.md §2` must have a line here that proves it. A DoD item without a test is not done.
