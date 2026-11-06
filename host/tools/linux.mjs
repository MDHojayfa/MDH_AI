/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * host/tools/linux.mjs — the thirteen builtins.
 *
 * Ten of them touch the machine and pass through `guard()`: the path is expanded, symlinks are resolved,
 * the deny list is checked first and the allow list second. The other three (`update_plan`, `ask_user`,
 * `finish`) are conversation-level and are declared here only so the model can see them; the browser
 * executes them without ever waking this process.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir, cpus, freemem, loadavg, release, totalmem, userInfo, arch } from 'node:os';

export class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MAX_READ = 128 * 1024;

const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'number', description });

/* ────────────────────────────────────────────────────────────── the guard */

function canonical(p) {
  const expanded = String(p ?? '') === '~' ? homedir() : String(p ?? '').replace(/^~(?=\/)/, homedir());
  const absolute = expanded.startsWith('/') ? expanded : resolve(process.cwd(), expanded);
  if (existsSync(absolute)) {
    try {
      return realpathSync(absolute);
    } catch {
      return absolute;
    }
  }
  // For a path that does not exist yet, resolve its parent: otherwise `newdir/../../..` slips through.
  const parent = dirname(absolute);
  try {
    const realParent = existsSync(parent) ? realpathSync(parent) : parent;
    return join(realParent, basename(absolute));
  } catch {
    return absolute;
  }
}

const within = (child, root) => child === root || child.startsWith(root.endsWith('/') ? root : `${root}/`);

/**
 * The allowlist is the law; realpath is the bailiff. Symlinks are resolved *before* the comparison,
 * because a path that lies about where it points is not a path, it is an ambush.
 */
export function guard(path, cfg, { mustExist = false } = {}) {
  if (typeof path !== 'string' || !path.trim()) throw new ToolError('PATH_DENIED', 'a path is required');
  const real = canonical(path);
  const deny = (cfg.denyPaths ?? []).map(canonical);
  const allow = (cfg.allowPaths ?? []).map(canonical);

  if (deny.some((d) => within(real, d))) throw new ToolError('PATH_DENIED', `${path} is on the deny list`);
  if (!allow.some((a) => within(real, a))) {
    throw new ToolError('PATH_DENIED', `${path} is outside the allowed folders (${cfg.allowPaths.join(', ')})`);
  }
  if (mustExist && !existsSync(real)) throw new ToolError('NOT_FOUND', `${path} does not exist`);
  return real;
}

/* ──────────────────────────────────────────────────────────── process glue */

/**
 * Container mode: the same script, in a rootless podman container with no network and only the
 * allowlisted folders mounted. Off by default because the tool's job is to operate the real machine;
 * on for anyone who wants a hard boundary (docs/SECURITY.md C4).
 */
function containerInvocation(script, cwd, cfg) {
  const image = typeof cfg.container === 'string' ? cfg.container : 'docker.io/library/debian:stable';
  const args = ['run', '--rm', '--network=none', '--userns=keep-id'];
  for (const root of cfg.allowPaths ?? []) {
    const real = canonical(root);
    if (existsSync(real)) args.push('-v', `${real}:${real}`);
  }
  args.push('-w', cwd, '-e', 'HOME=' + cwd, image, 'bash', '-lc', script);
  return { command: 'podman', args };
}

function runShell(script, { cwd, timeoutMs, container }) {
  return new Promise((resolveP) => {
    const invocation = container
      ? containerInvocation(script, cwd, container === true ? { allowPaths: ['/tmp/mdh'] } : container)
      : { command: '/bin/bash', args: ['-lc', script] };
    const child = spawn(invocation.command, invocation.args, { cwd });
    let out = '';
    let err = '';
    const cap = 512 * 1024;
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, Math.max(1000, timeoutMs));

    child.stdout.on('data', (b) => {
      if (out.length < cap) out += b.toString('utf8');
    });
    child.stderr.on('data', (b) => {
      if (err.length < cap) err += b.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolveP({ code: 127, out, err: `${err}${e.message}` });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolveP({ code: code ?? (signal ? 124 : 0), out, err });
    });
  });
}

/* ─────────────────────────────────────────────────────────────── tool bodies */

function listDir({ path = '~', depth = 1 }, cfg) {
  const root = guard(path, cfg, { mustExist: true });
  const rows = [];
  const walk = (dir, level) => {
    if (rows.length >= 500) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      rows.push(`${dir}: ${e.code}`);
      return;
    }
    const sorted = entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of sorted) {
      if (rows.length >= 500) return;
      if (entry.name === 'node_modules' || entry.name === '.git') {
        rows.push(`${'  '.repeat(level)}${entry.name}/ (skipped)`);
        continue;
      }
      const full = join(dir, entry.name);
      let size = '';
      try {
        const st = lstatSync(full);
        if (st.isFile()) size = ` ${(st.size / 1024).toFixed(1)}K`;
        if (st.isSymbolicLink()) size = ' -> symlink';
      } catch {
        /* raced with a delete */
      }
      rows.push(`${'  '.repeat(level)}${entry.name}${entry.isDirectory() ? '/' : ''}${size}`);
      if (entry.isDirectory() && level + 1 < Math.min(3, Math.max(1, depth))) walk(full, level + 1);
    }
  };
  walk(root, 0);
  return rows.join('\n') || '(empty)';
}

function readFileTool({ path, offset = 1, limit = 2000 }, cfg) {
  const file = guard(path, cfg, { mustExist: true });
  const st = statSync(file);
  if (!st.isFile()) throw new ToolError('NOT_FOUND', `${path} is not a regular file`);
  const buf = readFileSync(file);
  if (buf.includes(0)) throw new ToolError('TOOL_FAILED', `${path} looks binary; refusing to guess`);
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  const start = Math.max(1, Math.floor(offset));
  const count = Math.max(1, Math.min(5000, Math.floor(limit)));
  const slice = lines.slice(start - 1, start - 1 + count);
  const numbered = slice.map((l, i) => `${String(start + i).padStart(5)}│ ${l}`).join('\n');
  const suffix = start - 1 + count < lines.length ? `\n[…${lines.length - (start - 1 + count)} more lines]` : '';
  return `${numbered}${suffix}`.slice(0, MAX_READ);
}

function writeFileTool({ path, content = '' }, cfg) {
  const file = guard(path, cfg);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.mdh-tmp-${process.pid}`;
  writeFileSync(tmp, String(content), 'utf8');
  renameSync(tmp, file);
  return `wrote ${Buffer.byteLength(String(content))} bytes to ${path}`;
}

function editFileTool({ path, find, replace = '' }, cfg) {
  const file = guard(path, cfg, { mustExist: true });
  const text = readFileSync(file, 'utf8');
  if (!find) throw new ToolError('TOOL_FAILED', 'find is required');
  const first = text.indexOf(find);
  if (first === -1) throw new ToolError('NOT_FOUND', 'that text does not appear in the file');
  if (text.indexOf(find, first + 1) !== -1) {
    throw new ToolError('AMBIGUOUS_MATCH', 'that text appears more than once; include more context');
  }
  writeFileSync(file, text.slice(0, first) + replace + text.slice(first + find.length), 'utf8');
  return `edited ${path}`;
}

async function searchFiles({ pattern, path = '~', glob }, cfg) {
  if (!pattern) throw new ToolError('TOOL_FAILED', 'pattern is required');
  const root = guard(path, cfg, { mustExist: true });
  const quoted = JSON.stringify(pattern);
  const rg = `command -v rg >/dev/null 2>&1 && rg --line-number --no-heading --color never --max-count 200 ${
    glob ? `--glob ${JSON.stringify(glob)}` : ''
  } -e ${quoted} ${JSON.stringify(root)} | head -200`;
  const grep = `grep -rIn ${glob ? `--include=${JSON.stringify(glob.replace(/\*/g, ''))}` : ''} -e ${quoted} ${JSON.stringify(root)} 2>/dev/null | head -200`;
  const res = await runShell(`${rg} || ${grep}`, { cwd: root, timeoutMs: 45000, container: cfg.container });
  return res.out.trim() || `no matches for ${pattern} in ${path}`;
}

function fileInfoTool({ path }, cfg) {
  const file = guard(path, cfg, { mustExist: true });
  const st = statSync(file);
  return [
    `path: ${path}`,
    `type: ${st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other'}`,
    `size: ${st.size} bytes`,
    `mode: ${(st.mode & 0o777).toString(8)}`,
    `mtime: ${st.mtime.toISOString()}`,
  ].join('\n');
}

function sysInfo() {
  const read = (p) => {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      return '';
    }
  };
  const pretty = /PRETTY_NAME="?([^"\n]+)"?/.exec(read('/etc/os-release'))?.[1] ?? 'unknown distro';
  let disk = 'unknown';
  try {
    disk = execFileSync('df', ['-h', '--output=target,size,used,avail,pcent', '/'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .slice(1)
      .join(' ');
  } catch {
    /* df is not universal, but it is everywhere on Linux */
  }
  return [
    `distro: ${pretty}`,
    `kernel: ${release()} (${arch()})`,
    `session: ${process.env.XDG_SESSION_TYPE ?? 'unknown'} · desktop ${process.env.XDG_CURRENT_DESKTOP ?? 'unknown'}`,
    `cpu: ${cpus().length} cores · ${loadavg()[0].toFixed(2)} load`,
    `memory: ${(freemem() / 1024 ** 3).toFixed(1)} GiB free of ${(totalmem() / 1024 ** 3).toFixed(1)} GiB`,
    `disk (/): ${disk}`,
    `user: ${userInfo().username} · home ${homedir()}`,
    `cwd: ${process.cwd()}`,
  ].join('\n');
}

async function runCommand({ cmd, cmds, cwd = '~', timeout_ms }, cfg) {
  const dir = guard(cwd || '~', cfg, { mustExist: true });
  const timeoutMs = Math.min(Number(timeout_ms) || cfg.commandTimeoutMs, cfg.maxTimeoutMs);

  if (Array.isArray(cmds) && cmds.length) {
    const list = cmds.slice(0, 20);
    const script = list
      .map((c, i) => `printf '\\n── ${i + 1} ──\\n'; ${c}\nprintf '__MDH_EXIT_${i}__%s\\n' "$?"`)
      .join('\n');
    const res = await runShell(script, { cwd: dir, timeoutMs, container: cfg.container });
    const exits = [...res.out.matchAll(/__MDH_EXIT_(\d+)__(\d+)/g)].map((m) => Number(m[2]));
    const firstBad = exits.find((code) => code !== 0) ?? 0;
    return `exit_code: ${firstBad}\n\n${res.out.replace(/__MDH_EXIT_\d+__\d+\n?/g, '')}${res.err ? `\n[stderr]\n${res.err}` : ''}`;
  }

  if (!cmd) throw new ToolError('TOOL_FAILED', 'cmd or cmds is required');
  const res = await runShell(cmd, { cwd: dir, timeoutMs, container: cfg.container });
  return `exit_code: ${res.code}\n\n${res.out}${res.err ? `\n[stderr]\n${res.err}` : ''}`;
}

async function openApp({ name_or_command }) {
  if (!name_or_command) throw new ToolError('TOOL_FAILED', 'name_or_command is required');
  const child = spawn('/bin/bash', ['-lc', `nohup ${name_or_command} >/dev/null 2>&1 &`], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return `launched ${name_or_command} in the user's session`;
}

/* ───────────────────────────────────────────────────────────────── registry */

const LOCAL = [
  {
    name: 'ask_user',
    description: 'Ask the user a question and wait for their answer',
    inputSchema: { type: 'object', properties: { question: str('the question'), options: { type: 'array', items: { type: 'string' } } }, required: ['question'] },
    local: true,
  },
  {
    name: 'update_plan',
    description: 'Show your plan as a checklist; runs nothing',
    inputSchema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'string' } } }, required: ['steps'] },
    local: true,
  },
  {
    // Plan mode's exit: a plan the user approves, which flips the run from read-only to allowed.
    name: 'propose_plan',
    description: 'Plan mode: ask the user to approve your steps before you change anything',
    inputSchema: {
      type: 'object',
      properties: { steps: { type: 'array', items: { type: 'string' }, description: 'ordered steps, each one sentence' } },
      required: ['steps'],
    },
    local: true,
  },
  {
    // Answered in the browser from the user's own skill list — never a file the host has to be trusted with.
    name: 'read_skill',
    description: 'Read one of the user’s skills (playbooks) by name',
    inputSchema: { type: 'object', properties: { name: str('skill name') }, required: ['name'] },
    local: true,
  },
  {
    name: 'finish',
    description: 'End the task. Requires the session completion code printed in your instructions',
    inputSchema: {
      type: 'object',
      properties: {
        summary: str('what was done'),
        phoenix: str('the session completion code, e.g. PHX-7KQ2MD'),
      },
      required: ['summary', 'phoenix'],
    },
    local: true,
  },
];

const HOST = [
  { name: 'list_dir', description: 'List a directory tree', inputSchema: { type: 'object', properties: { path: str('folder'), depth: num('levels, 1-3') }, required: ['path'] }, run: listDir },
  { name: 'read_file', description: 'Read a text file by line range', inputSchema: { type: 'object', properties: { path: str('file'), offset: num('first line, 1-based'), limit: num('max lines') }, required: ['path'] }, run: readFileTool },
  { name: 'write_file', description: 'Create or overwrite a text file', inputSchema: { type: 'object', properties: { path: str('file'), content: str('full contents') }, required: ['path', 'content'] }, run: writeFileTool },
  { name: 'edit_file', description: 'Replace the one exact match in a file', inputSchema: { type: 'object', properties: { path: str('file'), find: str('exact text to find'), replace: str('replacement') }, required: ['path', 'find', 'replace'] }, run: editFileTool },
  // A shell, as the user, with their environment. Not a sandbox, not a "safe" subset of commands, not a promise
  // that `rm` is a file operation. The guardrails are the allowlist, the approval card and the fact that a human
  // is watching — in that order, and none of them is a substitute for the others.
  { name: 'run_command', description: 'Run shell commands and return output and exit code', inputSchema: { type: 'object', properties: { cmd: str('one command'), cmds: { type: 'array', items: { type: 'string' }, description: 'up to 20 commands in one shell' }, cwd: str('working directory'), timeout_ms: num('milliseconds') } }, run: runCommand },
  { name: 'send_stdin', description: 'Continue a background command (not available in v1 — see docs)', inputSchema: { type: 'object', properties: { session_id: str('id'), input: str('text') }, required: ['session_id', 'input'] }, run: async () => 'background sessions are not enabled in this build' },
  { name: 'search_files', description: 'Regex search across files', inputSchema: { type: 'object', properties: { pattern: str('regex'), path: str('folder'), glob: str('file glob') }, required: ['pattern'] }, run: searchFiles },
  { name: 'file_info', description: 'Size, type, mode and mtime of a path', inputSchema: { type: 'object', properties: { path: str('path') }, required: ['path'] }, run: fileInfoTool },
  { name: 'sys_info', description: 'OS, kernel, session, CPU, memory, disk, cwd', inputSchema: { type: 'object', properties: {} }, run: () => sysInfo() },
  { name: 'open_app', description: 'Launch a GUI application in the user session', inputSchema: { type: 'object', properties: { name_or_command: str('command or app name') }, required: ['name_or_command'] }, run: openApp },
];

export const builtinTools = [
  ...HOST.map((t) => ({ server: 'builtin', name: t.name, description: t.description, inputSchema: t.inputSchema, local: false })),
  ...LOCAL.map((t) => ({ server: 'builtin', name: t.name, description: t.description, inputSchema: t.inputSchema, local: true })),
];

export const builtinRunners = new Map(HOST.map((t) => [t.name, t.run]));

export async function runBuiltin(name, args, cfg) {
  const run = builtinRunners.get(name);
  if (!run) throw new ToolError('TOOL_MISSING', `no builtin tool named ${name}`);
  const started = Date.now();
  const result = await run(args ?? {}, cfg);
  const text = String(result ?? '');
  const max = cfg.maxResultBytes ?? MAX_READ;
  return {
    status: 'ok',
    body: text.length > max ? `${text.slice(0, max)}\n[…truncated: showing ${(max / 1024).toFixed(0)} KB of ${(text.length / 1024).toFixed(0)} KB]` : text,
    ms: Date.now() - started,
  };
}

export const toolNames = () => builtinTools.map((t) => t.name);
export const fingerprint = (body) => createHash('sha256').update(body).digest('hex').slice(0, 12);
export const _internal = { canonical, within };
