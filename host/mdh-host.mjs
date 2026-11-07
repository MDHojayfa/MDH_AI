#!/usr/bin/env node
/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * host/mdh-host.mjs — the native-messaging host.
 *
 * The browser starts this process; it lives as long as the port does. Everything it prints on **stdout**
 * is protocol. Logs go to stderr. That single rule is the difference between working and the most common
 * bug in this corner of the ecosystem (`docs/INTERFACES.md` §4).
 *
 * If you are tempted to add a `console.log` for debugging: do not. That is how a working host becomes a
 * mysterious "Invalid native messaging message" and an evening of your life disappears.
 *
 * Protocol: one JSON object per message, each prefixed with its 4-byte little-endian length, exactly as
 * Chromium and Firefox frame native messaging.
 */
import { McpClient } from './mcp_client.mjs';
import { builtinTools, runBuiltin, ToolError } from './tools/linux.mjs';
import { appendAudit, verifyAudit } from './audit.mjs';
import { ensureConfigFiles, loadConfig, loadServers, paths } from './config.mjs';
import { runDiag } from './diag.mjs';
import { renderPage, startViewer } from './viewer.mjs';
import { DIAG_FILE, archiveAudit, stateSnapshot } from './logs.mjs';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const VERSION = '1.0.0';
const AUTHOR = { name: 'MDHojayfa', repo: 'https://github.com/MDHojayfa/MDH_AI' };
const HOST_NAME = 'dev.mdhojayfa.mdh';

const log = (...args) => process.stderr.write(`mdh-host ${new Date().toISOString()} ${args.join(' ')}\n`);

let cfg = null;
const clients = new Map(); // server name -> McpClient
/** One viewer per host process: a new port every click would leave a trail of open sockets. */
let viewer = null;
/** Tools the browser executes itself; the host only declares them. */
const BUILTIN_LOCAL = new Set(builtinTools.filter((t) => t.local).map((t) => t.name));

/* ─────────────────────────────────────────────────────── native messaging */

function writeFrame(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

function reply(id, payload) {
  writeFrame({ id, ...payload });
}

function fail(id, code, message) {
  writeFrame({ id, t: 'error', code, message: String(message ?? code) });
}

/* ───────────────────────────────────────────────────────── tool catalogue */

function catalogue() {
  const list = builtinTools.map((t) => ({ ...t, server: 'builtin' }));
  for (const [name, client] of clients) {
    for (const tool of client.tools) {
      list.push({
        server: name,
        name: `${name}.${tool.name}`,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema ?? {},
        local: false,
      });
    }
  }
  return list;
}

async function startServers() {
  const servers = loadServers();
  await Promise.all(
    servers.map(async (server) => {
      const client = new makeClient(server);
      if (!client) return;
      clients.set(server.name, client);
      try {
        await client.start(server.startTimeoutMs ?? 25000);
      } catch (e) {
        log(`server ${server.name} failed to start: ${e.message}`);
      }
    }),
  );
  log(`servers ready: ${clients.size} of ${servers.length}`);
}

function makeClient(server) {
  try {
    const command = Array.isArray(server.command) ? server.command[0] : server.command;
    const args = Array.isArray(server.command) ? server.command.slice(1) : [];
    if (!command) throw new Error('no command');
    return new McpClient({ name: server.name, command, args, env: server.env, cwd: server.cwd });
  } catch (e) {
    log(`bad server config ${server?.name}: ${e.message}`);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────── calls */

async function callTool(name, args, meta = {}) {
  const started = Date.now();
  let result;

  if (name in BUILTIN_LOCAL) {
    return { status: 'ok', body: `${name} is handled in the browser` };
  }

  try {
    if (name.startsWith('builtin.')) name = name.slice('builtin.'.length);

    if (builtinTools.some((t) => t.server === 'builtin' && t.name === name)) {
      result = await runBuiltin(name, args, cfg);
    } else {
      const [serverName, toolName] = name.includes('.') ? name.split(/\.(.+)/) : [null, name];
      let client = serverName ? clients.get(serverName) : null;
      if (!client) {
        // Accept a bare tool name when it is unambiguous across servers.
        const owners = [...clients.values()].filter((c) => c.tools.some((t) => t.name === toolName));
        if (owners.length === 1) client = owners[0];
      }
      if (!client) throw new ToolError('TOOL_MISSING', `no tool named ${name}`);
      const res = await client.callTool(toolName, args ?? {}, 120000);
      result = { ...res, ms: Date.now() - started };
    }
  } catch (e) {
    result = {
      status: 'error',
      body: `${e.code ? `[${e.code}] ` : ''}${e.message}`,
      ms: Date.now() - started,
    };
  }

  appendAudit({
    tool: name,
    args: meta.args ?? args,
    status: result.status,
    ms: result.ms,
    detail: result.body?.slice(0, 160),
    run: meta.run,
    via: meta.via,
  });
  return result;
}

/* ───────────────────────────────────────────────────────────── protocol */

async function handle(frame) {
  const id = frame.id ?? null;

  switch (frame.t) {
    case 'ping':
      reply(id, { t: 'pong', host: HOST_NAME, version: VERSION, pid: process.pid, audit: verifyAudit().ok, by: AUTHOR.name });
      return;

    case 'list':
      reply(id, { t: 'tools', tools: catalogue() });
      return;

    case 'call': {
      const result = await callTool(frame.name, frame.arguments ?? {}, {
        args: frame.arguments,
        run: frame.run,
        via: frame.via,
      });
      reply(id, { t: 'reply', ...spillLarge(result, { tool: frame.name, run: frame.run }) });
      return;
    }

    case 'audit':
      reply(id, { t: 'audit', ...verifyAudit() });
      return;

    case 'config':
      reply(id, { t: 'config', config: { ...cfg, servers: [...clients.keys()] }, paths });
      return;

    /*
     * Diagnostics. Deliberately **not** part of the tool catalogue: the model can read files and run
     * commands, and it must not be able to ask "what is the user's public IP". These frames exist for the
     * extension's own report builder and for a human who typed `mdh-log`.
     */
    case 'diag': {
      const result = await runDiag(frame.op ?? 'system', frame);
      if (frame.save) saveDiag(frame, result);
      reply(id, { t: 'diag', ...result });
      return;
    }

    case 'viewer': {
      try {
        if (!viewer) {
          viewer = await startViewer({
            getState: () => stateSnapshot({ hostVersion: VERSION }),
            clear: () => archiveAudit(),
            port: Number(cfg.viewerPort ?? 0),
          });
          log(`viewer listening on ${viewer.base} (loopback, token-gated)`);
        }
        reply(id, { t: 'viewer', url: viewer.url, port: viewer.port });
      } catch (e) {
        fail(id, 'VIEWER', `could not start the log viewer: ${e.message}`);
      }
      return;
    }

    case 'snapshot': {
      try {
        const file = join(paths.stateDir, 'log.html');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, renderPage({ ...stateSnapshot({ hostVersion: VERSION }), generatedAt: Date.now() }));
        reply(id, { t: 'snapshot', path: file });
      } catch (e) {
        fail(id, 'SNAPSHOT', `could not write the log page: ${e.message}`);
      }
      return;
    }

    default:
      fail(id, 'PROTO', `unknown frame type ${frame.t}`);
  }
}

/** Keep the last report on disk so the viewer and `mdh-log` can show it after the tab is gone. */
function saveDiag(frame, probes) {
  try {
    mkdirSync(dirname(DIAG_FILE()), { recursive: true });
    writeFileSync(
      DIAG_FILE(),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          summary: frame.summary ?? null,
          hypotheses: frame.hypotheses ?? [],
          diag: frame.diag ?? null,
          probes,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    log(`could not save the diagnostic snapshot: ${e.message}`);
  }
}

/* ─────────────────────────────────────────────────────────── large results */

/**
 * A 60 KB file read is a legitimate result and a terrible chat message: it burns the conversation's whole budget
 * in one turn, and ChatGPT answers the turn after by refusing the conversation. So anything over the limit is
 * written to disk under `/tmp/mdh/spill` — a folder both guards already allow — and the model gets the head, the
 * tail and the path. `read_file` with `offset`/`limit` then costs exactly what the answer needs.
 */
const SPILL_CHARS = 24000;
const SPILL_TTL_MS = 24 * 60 * 60 * 1000;

/** Spilled results are a scratch folder, not an archive: yesterday's are gone before today's are written. */
function pruneSpills() {
  try {
    for (const entry of readdirSync(paths.spillDir)) {
      const full = join(paths.spillDir, entry);
      try {
        const age = Date.now() - statSync(full).mtimeMs;
        if (age > SPILL_TTL_MS) rmSync(full, { recursive: true, force: true });
      } catch { /* a file removed while we looked is not an error */ }
    }
  } catch { /* no spill folder yet */ }
}

function spillLarge(result, { tool, run }) {
  const body = String(result?.body ?? '');
  if (body.length <= SPILL_CHARS) return result;
  try {
    const dir = join(paths.spillDir, String(run ?? 'no-run').replace(/[^\w.-]/g, '_'));
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, `${Date.now()}-${String(tool ?? 'tool').replace(/[^\w.-]/g, '_')}.txt`);
    writeFileSync(file, body, { mode: 0o600 });
    const head = body.slice(0, 2000);
    const tail = body.slice(-500);
    const lines = body.split('\n').length;
    const skipped = body.length - head.length - tail.length;
    return {
      ...result,
      body: `${head}\n\n[…${skipped} characters skipped. The full output is ${file} — ${body.length} characters, ` +
        `${lines} lines. Read the part you need: read_file with path="${file}" and offset/limit, or grep it with ` +
        `search_files.]\n\n${tail}`,
      spilled: { file, chars: body.length, lines },
    };
  } catch (error) {
    // Never lose a result because the disk said no: fall back to the truncating path the caller already had.
    log(`spill failed for ${tool}: ${error.message}`);
    return result;
  }
}

/* ────────────────────────────────────────────────────────────────── boot */

function readLoop() {
  let buffer = Buffer.alloc(0);
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE(0);
      if (length === 0 || length > 64 * 1024 * 1024) {
        log('framing error: bad length', length);
        // Do not throw the whole buffer away: the next valid frame is usually already in it, and discarding the
        // chunk turned one stray byte into a host that ignores everything the browser says afterwards. Walk
        // forward until a header produces JSON, or give up and drop what cannot be trusted.
        let at = -1;
        for (let i = 1; i < buffer.length - 4 && i < 8192; i += 1) {
          const candidate = buffer.readUInt32LE(i);
          if (candidate === 0 || candidate > 64 * 1024 * 1024) continue;
          if (buffer.length < i + 4 + candidate) continue;
          try {
            JSON.parse(buffer.subarray(i + 4, i + 4 + candidate).toString('utf8'));
            at = i;
            break;
          } catch { /* not a frame header, keep walking */ }
        }
        if (at < 0) {
          buffer = Buffer.alloc(0);
          return;
        }
        log('framing resync at byte', at);
        buffer = buffer.subarray(at);
        continue;
      }
      if (buffer.length < 4 + length) return;
      const body = buffer.subarray(4, 4 + length).toString('utf8');
      buffer = buffer.subarray(4 + length);
      let frame;
      try {
        frame = JSON.parse(body);
      } catch {
        log('framing error: not JSON');
        continue;
      }
      handle(frame).catch((e) => {
        log('handler failed:', e.stack ?? e.message);
        fail(frame.id ?? null, e.code ?? 'PROTO', e.message);
      });
    }
  });
  process.stdin.on('end', () => {
    log('stdin closed; shutting down');
    for (const client of clients.values()) client.stop();
    process.exit(0);
  });
}

async function main() {
  ensureConfigFiles();
  pruneSpills();
  cfg = loadConfig();
  log(`start pid=${process.pid} allow=${cfg.allowPaths.join(',')}`);

  writeFrame({ t: 'ready', host: HOST_NAME, version: VERSION });
  readLoop();
  await startServers();
  writeFrame({ t: 'ready', host: HOST_NAME, version: VERSION, tools: catalogue().length });
}

process.on('uncaughtException', (e) => log('uncaught:', e.stack ?? e.message));
process.on('unhandledRejection', (e) => log('unhandled:', e?.stack ?? String(e)));

main().catch((e) => {
  log('fatal:', e.stack ?? e.message);
  process.exit(1);
});
