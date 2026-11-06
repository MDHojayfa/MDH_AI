# Spec 06 — MCP bridge & builtin Linux tools

**Files:** `host/mdh_host.py`, `host/mcp_client.py`, `host/tools/linux.py` · **Milestone:** M6

## Responsibility
Own tool execution. Be the thing that never lies to the model and never hangs the loop.

## MCP client rules (learned from the best of the surveyed bridges)

1. One dedicated reader thread **per** child; responses matched by JSON-RPC `id` — never "read the next
   line and hope".
2. `stderr` drained continuously, or a chatty server deadlocks on a full pipe.
3. Tool calls locked **per server** so a slow server cannot block another.
4. Dead child → restart, retry the call **once**, then return a structured error.
5. **Every call replies.** Result or error, within the timeout. No silent drops.
6. `tools/list` merged across servers, names namespaced `server:tool`, collisions disambiguated.
7. Servers whose `tools/list` returns 0 tools are probed once more after 3 s (some advertise late).

## Builtin toolset (works with zero configuration)

Thirteen tools (revised after the second survey — see `research/08-LESSONS.md` L14–L19).
Names are the model-facing ones and must match `docs/prompt/SYSTEM.md` exactly.

| Tool | Args | Notes |
|---|---|---|
| `list_dir` | `path, depth?` | depth ≤ 3, 500 entries |
| `read_file` | `path, offset?, limit?` | allowlist-checked; images refused, not garbled |
| `write_file` | `path, content` | atomic (tmp + rename); refuses outside allowlist |
| `edit_file` | `path, find, replace` | exact match; fails loudly on 0 or >1 occurrences |
| `run_command` | `cmd? \| cmds?, cwd?, timeout_ms?, bg?` | **approval required by default**; `cmds` ≤ 20 in one shell, labelled sections, exit = first non-zero; `bg` returns `session_id` |
| `send_stdin` | `session_id, input` | continues a `bg` process; kills it after 10 min idle |
| `search_files` | `pattern, path?, glob?` | ripgrep if present, else a Python fallback; ≤ 500 hits |
| `file_info` | `path` | size, type, mode, mtime — no read |
| `sys_info` | — | distro, kernel, session, CPU, RAM, disks, cwd — the smoke tool |
| `open_app` | `name_or_command` | the **only** GUI action in v1; launches in the user's session, never elevated |
| `ask_user` | `question, options?` | renders a card, returns the user's typed answer or a chosen option |
| `update_plan` | `steps[]` | renders/replaces a checklist card; carries no execution |
| `finish` | `summary` | ends the loop deterministically; the only way a task is "done" |

Explicitly **not** in v1: pixel-level GUI automation (that is `computer-use-linux` via MCP), clipboard,
screenshots, file attachments into the chat.

## Output handling
- UTF-8, `errors="replace"`.
- Budget (revised — the round trip costs far more than the bytes): **128 KB per result**, **256 KB per
  call**, and a `full:true` escape hatch up to **512 KB**. Above that, truncate at a UTF-8 boundary with
  `[…truncated: showing 128 KB of 2.1 MB. Continue with offset/limit, or redirect to a file.]`
- Binary output detected by NUL bytes → refuse with a clear message (no silent garbage).

## Timeouts
`run_command` 60 s (max 300 s), file ops 10 s, MCP tools 120 s default — overridable per tool in
`tools.json`, never by the model.

## Audit
Append-only JSONL at `~/.local/state/mdh/audit.jsonl`:
`{ts, server, tool, args_hash, args_preview, decision, exit, duration_ms, result_bytes, prev_hash, hash}`
Hash-chained so tampering is detectable. Never logged: file contents, command output bodies.

## Acceptance criteria
- [ ] A deliberately hanging MCP server cannot hang the host (timeout respected, other servers usable).
- [ ] A crashing MCP server is restarted and the call retried exactly once.
- [ ] `file_write` outside the allowlist is refused with the resolved path shown.
- [ ] Audit chain verifies with `mdh-host audit --verify`.
