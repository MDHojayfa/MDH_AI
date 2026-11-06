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
