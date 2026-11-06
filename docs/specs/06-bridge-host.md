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

| Tool | Args | Notes |
|---|---|---|
| `file_read` | `path, offset?, limit?` | allowlist-checked |
| `file_write` | `path, content, create_dirs?` | refuses outside allowlist; atomic write (tmp+rename) |
| `file_edit` | `path, find, replace, all?` | exact match, fails loudly on 0 or >1 (unless `all`) |
| `dir_list` | `path, depth?` | depth ≤ 3 |
| `file_search` | `glob, root?` | capped at 500 results |
| `code_search` | `pattern, root?, glob?` | ripgrep if present, else Python fallback |
| `run_command` | `command, cwd?, timeout_ms?` | **approval required by default**; no shell metacharacter cleverness |
| `proc_list` | — | `/proc` reader, Linux only |
| `sys_info` | — | distro, kernel, CPU, RAM, disks — the "does it work" smoke tool |

Explicitly **not** in v1: GUI automation (that is `computer-use-linux` via MCP), clipboard, screenshots.

## Output handling
- UTF-8, `errors="replace"`.
- Truncate at 48 KB with a marker; the full output is offered as an attachment.
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
