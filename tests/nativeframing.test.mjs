/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tests/nativeframing.test.mjs — the real host, over the real wire format.
 *
 * Every other host test imports functions and calls them. This one starts `host/mdh-host.mjs` as a **process**,
 * writes the same 4-byte little-endian length prefix the browser writes, and reads what comes back. It is the
 * boundary a `vm` test stops at: if the framing were wrong, the host would look perfect in every other test and
 * fail on the first real message in a real browser.
 *
 * It is still not a browser. It is the half of the boundary that can be tested without one — which is why
 * `docs/VERIFICATION.md` calls this file out and says what is left.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const HOST = join(ROOT, 'host', 'mdh-host.mjs');

/** A throwaway HOME with a config that allows this test's temp folder and nothing else. */
function sandbox() {
  const home = mkdtempSync(join(tmpdir(), 'mdh-native-'));
  const projects = join(home, 'projects');
  mkdirSync(projects, { recursive: true });
  mkdirSync(join(home, '.config', 'mdh'), { recursive: true });
  writeFileSync(
    join(home, '.config', 'mdh', 'config.json'),
    `${JSON.stringify({ allowPaths: [projects], denyPaths: [], commandTimeoutMs: 8000 }, null, 2)}\n`,
  );
  writeFileSync(join(home, '.config', 'mdh', 'servers.json'), '{"servers":[]}\n');
  return { home, projects };
}

/** Start the host and give back a frame-aware handle on it. */
function startHost(home) {
  const child = spawn(process.execPath, [HOST], {
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_STATE_HOME: join(home, '.local', 'state') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let buffer = Buffer.alloc(0);
  const frames = [];
  const waiters = [];
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) return;
      const body = buffer.subarray(4, 4 + length).toString('utf8');
      buffer = buffer.subarray(4 + length);
      const frame = JSON.parse(body);
      frames.push(frame);
      for (const waiter of [...waiters]) waiter(frame);
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

  const send = (frame) => {
    const body = Buffer.from(JSON.stringify(frame), 'utf8');
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32LE(body.length, 0);
    child.stdin.write(Buffer.concat([prefix, body]));
  };

  /** Wait for a frame matching `match`, or fail with whatever was seen — a silent timeout explains nothing. */
  const next = (match, ms = 8000) => new Promise((resolve, reject) => {
    const found = frames.find(match);
    if (found) return resolve(found);
    const timer = setTimeout(() => {
      waiters.splice(waiters.indexOf(check), 1);
      reject(new Error(`no matching frame in ${ms}ms; saw ${JSON.stringify(frames.map((f) => f.t))}\nstderr: ${stderr.slice(-400)}`));
    }, ms);
    const check = (frame) => {
      if (!match(frame)) return;
      clearTimeout(timer);
      waiters.splice(waiters.indexOf(check), 1);
      resolve(frame);
    };
    waiters.push(check);
  });

  return {
    child,
    send,
    next,
    frames,
    stderr: () => stderr,
    stop: () => new Promise((resolve) => {
      child.stdin.end();
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
      child.on('exit', () => { clearTimeout(timer); resolve(); });
    }),
  };
}

test('the host answers a ping over the real length-prefixed wire', async (t) => {
  const { home } = sandbox();
  const host = startHost(home);
  t.after(() => host.stop());

  await host.next((f) => f.t === 'ready');
  host.send({ t: 'ping', id: 1 });
  const pong = await host.next((f) => f.t === 'pong');
  assert.equal(pong.id, 1);
  assert.equal(pong.host, 'dev.mdhojayfa.mdh');
  assert.match(pong.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pong.by, 'MDHojayfa', 'the handshake carries the author, per docs/PROVENANCE.md');
  assert.equal(typeof pong.audit, 'boolean');
});

test('the catalogue comes back as tools, with the builtin fifteen in it', async (t) => {
  const { home } = sandbox();
  const host = startHost(home);
  t.after(() => host.stop());

  host.send({ t: 'list', id: 2 });
  const list = await host.next((f) => f.t === 'tools');
  const names = (list.tools ?? []).map((tool) => tool.name);
  assert.ok(names.length >= 15, `the catalogue has ${names.length} tools`);
  for (const expected of ['read_file', 'write_file', 'run_command', 'finish']) {
    assert.ok(names.includes(expected), `catalogue is missing ${expected}`);
  }
});

test('a call arrives, runs, and lands in the audit chain', async (t) => {
  const { home, projects } = sandbox();
  const host = startHost(home);
  t.after(() => host.stop());

  host.send({ t: 'call', id: 3, name: 'run_command', arguments: { cmd: 'echo native-ok', cwd: projects }, run: 'run-native-1' });
  const reply = await host.next((f) => f.t === 'reply');
  assert.equal(reply.id, 3);
  assert.equal(reply.status, 'ok');
  assert.match(reply.body ?? '', /native-ok/);

  // The audit file is the point of the run, so check it through the host's own verifier rather than by eye.
  const auditText = readFileSync(join(home, '.local', 'state', 'mdh', 'audit.jsonl'), 'utf8').trim();
  assert.ok(auditText.length > 0, 'a call must leave a line behind');
  const line = JSON.parse(auditText.split('\n').at(-1));
  assert.equal(line.run, 'run-native-1');

  host.send({ t: 'ping', id: 4 });
  const after = await host.next((f) => f.id === 4);
  assert.equal(after.audit, true, 'the chain still verifies after a real call');
});

test('a path outside the allowlist is refused over the wire, not executed', async (t) => {
  const { home } = sandbox();
  const host = startHost(home);
  t.after(() => host.stop());

  host.send({ t: 'call', id: 5, name: 'read_file', arguments: { path: '/etc/shadow' } });
  const reply = await host.next((f) => f.t === 'reply' || f.t === 'error');
  assert.notEqual(reply.status, 'ok', 'reading /etc/shadow must not succeed');
  assert.match(JSON.stringify(reply), /denied|outside|allow/i);
});

test('a malformed length does not take the process down', async (t) => {
  const { home } = sandbox();
  const host = startHost(home);
  t.after(() => host.stop());

  await host.next((f) => f.t === 'ready');
  // A zero-length frame is the one a buggy client sends first. The host must complain to stderr and keep going.
  const bad = Buffer.alloc(4);
  bad.writeUInt32LE(0, 0);
  host.child.stdin.write(bad);

  host.send({ t: 'ping', id: 9 });
  const pong = await host.next((f) => f.t === 'pong' && f.id === 9, 5000);
  assert.equal(pong.id, 9, 'the host survived a framing error');
  assert.match(host.stderr(), /framing error/, 'and it said so where logs go, not on stdout');
  assert.equal(host.child.exitCode, null, 'still alive');
});
