import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// config.mjs resolves ~ at import time, so point HOME at a scratch directory first.
const home = mkdtempSync(join(tmpdir(), 'mdh-audit-'));
process.env.HOME = home;

const { appendAudit, verifyAudit } = await import('../host/audit.mjs');
const { paths } = await import('../host/config.mjs');

test('an empty log verifies', () => {
  assert.deepEqual(verifyAudit(), { ok: true, lines: 0 });
});

test('entries chain and the chain verifies', () => {
  appendAudit({ tool: 'read_file', args: { path: '/tmp/a', content: 'SECRET BODY' }, status: 'ok', ms: 3 });
  appendAudit({ tool: 'run_command', args: { cmd: 'ls\nrm -rf /' }, status: 'ok', ms: 9 });
  const out = verifyAudit();
  assert.equal(out.ok, true);
  assert.equal(out.lines, 2);
});

test('a silent edit is detectable', () => {
  const lines = readFileSync(paths.audit, 'utf8').trim().split('\n');
  const entry = JSON.parse(lines[0]);
  entry.status = 'error'; // someone rewriting history
  lines[0] = JSON.stringify(entry);
  writeFileSync(paths.audit, `${lines.join('\n')}\n`);
  const out = verifyAudit();
  assert.equal(out.ok, false);
  assert.equal(out.brokenAt, 1);
});

test('the log never stores file contents', () => {
  const text = readFileSync(paths.audit, 'utf8');
  assert.doesNotMatch(text, /SECRET BODY/);
});

test('only the first command line is kept', () => {
  const text = readFileSync(paths.audit, 'utf8');
  assert.match(text, /ls/);
  assert.doesNotMatch(text, /rm -rf \//);
});

test('a call carries the run it belonged to, and the chain still verifies', () => {
  // The tamper test above deliberately broke this chain; a fresh file is the only honest baseline.
  writeFileSync(paths.audit, '');
  const before = readFileSync(paths.audit, 'utf8').trim() ? 1 : 0;
  appendAudit({ tool: 'run_command', args: { cmd: 'npm test' }, status: 'ok', ms: 5, run: 'run-abc123' });
  const lines = readFileSync(paths.audit, 'utf8').trim().split('\n');
  assert.equal(lines.length, before + 1);
  const entry = JSON.parse(lines[lines.length - 1]);
  assert.equal(entry.run, 'run-abc123');
  assert.equal(verifyAudit().ok, true, 'the run id is inside the hash, so it cannot be edited afterwards');
});

test('a missing or absurd run id never breaks the log', () => {
  appendAudit({ tool: 'read_file', args: { path: '/tmp/x' }, status: 'ok', ms: 1 });
  appendAudit({ tool: 'read_file', args: { path: '/tmp/x' }, status: 'ok', ms: 1, run: 'x'.repeat(500) });
  const lines = readFileSync(paths.audit, 'utf8').trim().split('\n');
  assert.equal(JSON.parse(lines[lines.length - 2]).run, undefined, 'older-shaped entries stay valid');
  assert.equal(JSON.parse(lines[lines.length - 1]).run.length, 40, 'and a runaway id is clipped, not stored');
  assert.equal(verifyAudit().ok, true);
});
