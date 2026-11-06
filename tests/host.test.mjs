import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuiltin, ToolError } from '../host/tools/linux.mjs';

const root = mkdtempSync(join(tmpdir(), 'mdh-host-'));
const cfg = { allowPaths: [root], denyPaths: [], commandTimeoutMs: 10000, maxTimeoutMs: 20000, maxResultBytes: 1000 };

test('run_command returns output and exit code', async () => {
  const out = await runBuiltin('run_command', { cmd: 'echo hello', cwd: root }, cfg);
  assert.equal(out.status, 'ok');
  assert.match(out.body, /exit_code: 0/);
  assert.match(out.body, /hello/);
});

test('run_command reports a non-zero exit without throwing', async () => {
  const out = await runBuiltin('run_command', { cmd: 'exit 3', cwd: root }, cfg);
  assert.match(out.body, /exit_code: 3/);
});

test('a batch keeps one shell: cd persists and the first failure is the exit code', async () => {
  const out = await runBuiltin(
    'run_command',
    { cmds: ['cd /tmp', 'pwd', 'false', 'echo still-running'], cwd: root, timeout_ms: 10000 },
    cfg,
  );
  assert.match(out.body, /\/tmp/);
  assert.match(out.body, /still-running/);
  assert.match(out.body, /exit_code: 1/);
});

test('a hanging command is killed at the timeout', async () => {
  const out = await runBuiltin('run_command', { cmd: 'sleep 5', cwd: root, timeout_ms: 1000 }, cfg);
  assert.match(out.body, /exit_code: (124|137)/);
});

test('write_file creates parents and read_file numbers lines', async () => {
  const target = join(root, 'nested/dir/notes.txt');
  await runBuiltin('write_file', { path: target, content: 'alpha\nbeta\n' }, cfg);
  const read = await runBuiltin('read_file', { path: target }, cfg);
  assert.match(read.body, /1│ alpha/);
  assert.match(read.body, /2│ beta/);
});

test('edit_file refuses an ambiguous match', async () => {
  const target = join(root, 'dup.txt');
  writeFileSync(target, 'x\nx\n');
  await assert.rejects(
    () => runBuiltin('edit_file', { path: target, find: 'x', replace: 'y' }, cfg),
    (e) => e instanceof ToolError && e.code === 'AMBIGUOUS_MATCH',
  );
  assert.equal(readFileSync(target, 'utf8'), 'x\nx\n');
});

test('list_dir skips node_modules and .git rather than walking them', async () => {
  await runBuiltin('write_file', { path: join(root, 'proj/node_modules/lib.txt'), content: 'x' }, cfg);
  await runBuiltin('write_file', { path: join(root, 'proj/.git/config'), content: 'x' }, cfg);
  await runBuiltin('write_file', { path: join(root, 'proj/src/main.c'), content: 'x' }, cfg);
  const out = await runBuiltin('list_dir', { path: join(root, 'proj'), depth: 2 }, cfg);
  assert.match(out.body, /node_modules\/ \(skipped\)/);
  assert.match(out.body, /main\.c/);
});

test('a huge result is truncated and says so', async () => {
  await runBuiltin('write_file', { path: join(root, 'big.txt'), content: 'A'.repeat(5000) }, { ...cfg, maxResultBytes: 500 });
  const out = await runBuiltin('read_file', { path: join(root, 'big.txt'), limit: 100 }, { ...cfg, maxResultBytes: 500 });
  assert.match(out.body, /truncated/);
});

test('sys_info names the machine it is running on', async () => {
  const out = await runBuiltin('sys_info', {}, cfg);
  assert.match(out.body, /kernel:/);
  assert.match(out.body, /cwd:/);
});

test('a binary file is refused rather than guessed', async () => {
  const target = join(root, 'blob.bin');
  writeFileSync(target, Buffer.from([0, 1, 2, 3]));
  await assert.rejects(() => runBuiltin('read_file', { path: target }, cfg), (e) => e.code === 'TOOL_FAILED');
});
