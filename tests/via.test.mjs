/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tests/via.test.mjs — "who said yes".
 *
 * A status of `ok` says a call ran. It does not say whether a person allowed it, whether the policy did, or
 * whether a remembered grant answered for them. These tests pin the difference at every hop: the loop's
 * decision, the frame, the audit line, the hash, the page, and the terminal.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// config.mjs resolves ~ at import time, so point HOME at a scratch directory first.
const home = mkdtempSync(join(tmpdir(), 'mdh-via-'));
process.env.HOME = home;

const { appendAudit, resetCheckpoint, verifyAudit } = await import('../host/audit.mjs');
const { paths } = await import('../host/config.mjs');
const { renderPage } = await import('../host/viewer.mjs');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const reset = () => {
  mkdirSync(join(home, '.local', 'state', 'mdh'), { recursive: true });
  writeFileSync(paths.audit, '');
  resetCheckpoint(); // these tests want a scratch log, not a truncated one
};

test('the audit records who allowed the call, and the chain still verifies', () => {
  reset();
  appendAudit({ tool: 'read_file', args: { path: '/tmp/a' }, status: 'ok', ms: 2, run: 'run-1', via: 'auto' });
  appendAudit({ tool: 'run_command', args: { cmd: 'npm test' }, status: 'ok', ms: 90, run: 'run-1', via: 'grant:session' });
  const lines = readFileSync(paths.audit, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines[0].via, 'auto');
  assert.equal(lines[1].via, 'grant:session');
  assert.equal(verifyAudit().ok, true);
});

test('via is inside the hash: changing it afterwards is detectable', () => {
  reset();
  appendAudit({ tool: 'write_file', args: { path: '/tmp/b' }, status: 'ok', ms: 4, run: 'run-2', via: 'approval' });
  const entry = JSON.parse(readFileSync(paths.audit, 'utf8').trim());
  entry.via = 'auto'; // rewriting who said yes, so nobody can be blamed
  writeFileSync(paths.audit, `${JSON.stringify(entry)}\n`);
  const out = verifyAudit();
  assert.equal(out.ok, false);
  assert.equal(out.brokenAt, 1);
});

test('an unrecognisable via becomes "other" instead of disappearing', () => {
  reset();
  appendAudit({ tool: 'list_dir', args: { path: '/tmp' }, status: 'ok', ms: 1, via: 'AppRoved By: Someone' });
  appendAudit({ tool: 'list_dir', args: { path: '/tmp' }, status: 'ok', ms: 1, via: 'x'.repeat(40) });
  const lines = readFileSync(paths.audit, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines[0].via, 'other', 'spaces and capitals are not a vocabulary we invented');
  assert.equal(lines[1].via, 'other', 'and neither is a value longer than the field');
  assert.equal(verifyAudit().ok, true);
});

test('an entry written without via stays valid and has no empty field', () => {
  reset();
  appendAudit({ tool: 'sys_info', args: {}, status: 'ok', ms: 1 });
  const entry = JSON.parse(readFileSync(paths.audit, 'utf8').trim());
  assert.equal('via' in entry, false, 'an absent fact is absent, not blank');
  assert.equal(verifyAudit().ok, true);
});

test('the loop tells a policy allow apart from a click', () => {
  const agent = read('src/core/agent.js');
  assert.match(
    agent,
    /if \(desc\.verdict\.decision === 'allow'\) return 'auto';/,
    'nobody was asked, and the audit says so',
  );
  const gate = agent.slice(agent.indexOf('async function gate'), agent.indexOf('async function turn'));
  assert.doesNotMatch(gate, /return 'once';/, 'the old conflation must not come back');
  for (const [decision, via] of [
    ['once', 'approval'],
    ['run', 'grant:run'],
    ['session', 'grant:session'],
    ['site', 'grant:site'],
    ['always', 'always-allow'],
  ]) {
    assert.match(agent, new RegExp(`${decision}: '${via}'`), `${decision} is spelled ${via}`);
  }
  assert.match(agent, /result = await execute\(call, VIA\[decision\]/, 'the decision travels with the call');
  assert.match(read('src/core/transport.js'), /async function callTool\(name, args, \{ timeout, run, via \}/);
  assert.match(read('src/core/transport.js'), /t: 'call', name, arguments: args, run, via/);
  assert.match(read('host/mdh-host.mjs'), /via: frame\.via/);
  assert.match(read('host/mdh-host.mjs'), /via: meta\.via/);
});

test('the log page shows who allowed each call, and the run view keeps it in order', () => {
  const now = Date.now();
  const rows = [
    { at: new Date(now - 4000).toISOString(), tool: 'list_dir', status: 'ok', run: 'run-7', via: 'auto' },
    { at: new Date(now - 3000).toISOString(), tool: 'run_command', status: 'ok', run: 'run-7', via: 'grant:session' },
    { at: new Date(now - 2000).toISOString(), tool: 'write_file', status: 'denied', run: 'run-7', via: 'approval' },
  ];
  const page = renderPage({ entries: rows, allEntries: rows, meta: { tokenValue: 'tok' }, query: { run: 'run-7' } });
  assert.match(page, /via auto/);
  assert.match(page, /via grant:session/);
  assert.match(page, /list_dir ok \(auto\) → run_command ok \(grant:session\) → write_file denied \(approval\)/);
});

test('mdh-log --run prints a tally of who allowed the run', () => {
  reset();
  appendAudit({ tool: 'list_dir', args: { path: '/tmp' }, status: 'ok', ms: 2, run: 'run-44', via: 'auto' });
  appendAudit({ tool: 'run_command', args: { cmd: 'ls' }, status: 'ok', ms: 3, run: 'run-44', via: 'approval' });
  const cli = fileURLToPath(new URL('../host/mdh-log.mjs', import.meta.url));
  const out = execFileSync(process.execPath, [cli, '--run', 'run-44'], {
    env: { ...process.env, HOME: home },
    encoding: 'utf8',
  });
  assert.match(out, /run run-44 — 2 calls/);
  assert.match(out, /allowed by: auto 1 · approval 1/);
  assert.match(out, /2 ms\s+auto/, 'and the column is on the line itself, after the duration');
});
