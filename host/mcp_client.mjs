/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * host/mcp_client.mjs — a minimal, strict MCP over stdio client.
 *
 * Seven rules, learned the hard way (docs/INTERFACES.md §4):
 *   1. one child per server, never restarted on a per-call basis;
 *   2. newline-delimited JSON-RPC, nothing else on the pipe;
 *   3. `initialize` → `notifications/initialized` → `tools/list`, in that order, once;
 *   4. a call that times out kills the child rather than leaking a pending id;
 *   5. stderr is forwarded to our stderr, never parsed;
 *   6. tool results are text-only; images are described, not embedded;
 *   7. a dead server is reported as a tool error, never as a crash of the host;
 *   8. a server that prints a greeting to stdout before its JSON-RPC will be logged, ignored and judged
 *      silently — every ecosystem has one, and it is always the one you need.
 */
import { spawn } from 'node:child_process';

const PROTOCOL = '2024-11-05';

export class McpClient {
  constructor({ name, command, args = [], env = {}, cwd }) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = cwd;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.ready = false;
    this.tools = [];
  }

  log(...args) {
    process.stderr.write(`mdh-host[mcp:${this.name}] ${args.join(' ')}\n`);
  }

  async start(timeoutMs = 20000) {
    if (this.child) return;
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.onData(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => process.stderr.write(`mdh-host[${this.name}] ${chunk}`));
    this.child.on('exit', (code, signal) => {
      this.log(`exited code=${code} signal=${signal}`);
      this.ready = false;
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`${this.name} exited`));
      }
      this.pending.clear();
      this.child = null;
    });
    this.child.on('error', (e) => this.log('spawn failed:', e.message));

    await this.request(
      'initialize',
      {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: 'mdh-host', version: '1.0.0' },
      },
      timeoutMs,
    );
    this.notify('notifications/initialized', {});
    this.tools = await this.listTools(timeoutMs);
    this.ready = true;
    this.log(`ready with ${this.tools.length} tools`);
  }

  onData(chunk) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        this.log('non-JSON on stdout (ignored):', line.slice(0, 120));
        continue;
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message ?? 'mcp error'));
        else p.resolve(msg.result);
      }
    }
  }

  write(obj) {
    if (!this.child?.stdin?.writable) throw new Error(`${this.name} is not running`);
    this.child.stdin.write(`${JSON.stringify(obj)}\n`);
  }

  notify(method, params) {
    try {
      this.write({ jsonrpc: '2.0', method, params });
    } catch (e) {
      this.log('notify failed:', e.message);
    }
  }

  request(method, params, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name}: ${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ jsonrpc: '2.0', id, method, params });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  async listTools(timeoutMs = 30000) {
    const out = [];
    let cursor;
    for (let page = 0; page < 10; page++) {
      const res = await this.request('tools/list', cursor ? { cursor } : {}, timeoutMs);
      for (const tool of res?.tools ?? []) out.push(tool);
      cursor = res?.nextCursor;
      if (!cursor) break;
    }
    return out;
  }

  async callTool(name, args, timeoutMs = 120000) {
    if (!this.ready) await this.start();
    const res = await this.request('tools/call', { name, arguments: args ?? {} }, timeoutMs);
    const parts = [];
    for (const item of res?.content ?? []) {
      if (item.type === 'text') parts.push(item.text);
      else if (item.type === 'image') parts.push(`[image ${item.mimeType ?? ''} ${String(item.data ?? '').length} b64 chars]`);
      else if (item.type === 'resource') parts.push(`[resource ${item.resource?.uri ?? ''}]`);
      else parts.push(JSON.stringify(item));
    }
    const body = parts.join('\n') || (res?.isError ? 'tool reported an error with no message' : '(no output)');
    return { status: res?.isError ? 'error' : 'ok', body };
  }

  stop() {
    try {
      this.child?.stdin?.end();
      this.child?.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.child = null;
    this.ready = false;
  }
}
