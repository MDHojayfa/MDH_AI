/**
 * tests/logcli.test.mjs — the log page's command line, and the grouping both it and the page share.
 *
 * The CLI is the answer for "show me the runs" when you are already in a terminal and do not want a page.
 * So the tests run the real script, against a throwaway HOME, and read its stdout the way a person would.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupRuns } from '../host/viewer.mjs';

const CLI = fileURLToPath(new URL('../host/mdh-log.mjs', import.meta.url));

/** A temp HOME with an audit file shaped like the host writes it (ISO timestamps, newest last). */
function homeWithAudit(rows) {
  const home = mkdtempSync(join(tmpdir(), 'mdh-log-'));
  mkdirSync(join(home, '.local', 'state', 'mdh'), { recursive: true });
  writeFileSync(
    join(home, '.local', 'state', 'mdh', 'audit.jsonl'),
    rows.map((row) => JSON.stringify(row) + '\n').join(''),
  );
  return home;
}

const base = Date.now() - 600_000;
const iso = (offsetSeconds) => new Date(base + offsetSeconds * 1000).toISOString();
const fixture = [
  { at: iso(0), tool: 'list_dir', args: { path: '~/projects' }, status: 'ok', ms: 12, run: 'aaaaaaaaaa', hash: 'h1' },
  { at: iso(30), tool: 'run_command', args: { cmd: 'npm test' }, status: 'ok', ms: 900, run: 'aaaaaaaaaa', hash: 'h2' },
  { at: iso(60), tool: 'write_file', args: { path: '~/projects/x.js' }, status: 'denied', ms: 0, run: 'aaaaaaaaaa', hash: 'h3' },
  { at: iso(120), tool: 'sys_info', args: {}, status: 'ok', ms: 4, run: 'bbbbbbbbbb', hash: 'h4' },
];

test('groupRuns keeps runs apart, counts failures, and never invents a run id', () => {
  const rows = [
    { at: iso(0), tool: 'read_file', status: 'ok', run: 'r1' },
    { at: iso(10), tool: 'read_file', status: 'ok', run: 'r1' }, // same tool twice: listed once
    { at: iso(20), tool: 'write_file', status: 'denied', run: 'r1' },
    { at: iso(5), tool: 'sys_info', status: 'error', run: 'r2' },
    { at: iso(6), tool: 'list_dir', status: 'ok' }, // no run id: its own honest bucket
  ];
  const groups = groupRuns(rows);
  assert.deepEqual(
    groups.map((group) => group.key),
    ['r1', '', 'r2'],
    'newest first, and the entries that predate run ids still get a row',
  );
  const r1 = groups.find((group) => group.key === 'r1');
  assert.equal(r1.calls, 3);
  assert.equal(r1.errors, 1, 'a denial is not a failure of the tool, but it is not ok either');
  assert.deepEqual(r1.tools, ['read_file', 'write_file']);
  assert.equal(r1.first, base);
  assert.equal(r1.last, base + 20_000);
  assert.equal(groupRuns([]).length, 0);
  assert.equal(groupRuns(undefined).length, 0, 'undefined is an empty log, not a crash');
});

test('groupRuns takes both ends of the timestamp gap: ISO strings and epoch ms', () => {
  // the viewer reads raw JSONL (strings); stateSnapshot() hands the CLI epoch ms
  const rows = [
    { at: iso(0), tool: 'a', status: 'ok', run: 'mixed' },
    { at: base + 30_000, tool: 'b', status: 'ok', run: 'mixed' },
    { at: 'not a date', tool: 'c', status: 'ok', run: 'mixed' },
  ];
  const [group] = groupRuns(rows);
  assert.equal(group.calls, 3);
  assert.equal(group.first, base);
  assert.equal(group.last, base + 30_000);
});

test('--runs prints one line per run, newest first, with tools', () => {
  const home = homeWithAudit(fixture);
  try {
    const out = execFileSync(process.execPath, [CLI, '--runs'], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
    const lines = out.trim().split('\n');
    assert.match(lines[0], /^run\s+calls\s+failed\s+from\s+to\s+tools/, 'a person can read the columns');
    assert.match(lines[1], /^bbbbbbbbbb\s+1\s+0\s+\d{4}-\d\d-\d\d \d\d:\d\d/, 'newest run first');
    assert.match(lines[1], /sys_info$/);
    assert.match(lines[2], /^aaaaaaaaaa\s+3\s+1/, 'three calls, one not ok');
    assert.match(lines[2], /list_dir, run_command, write_file/, 'in the order they first appear');
    assert.equal(lines.length, 3);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('--run prints every call of one run in order, and exits 1 for a run that is not there', () => {
  const home = homeWithAudit(fixture);
  try {
    const out = execFileSync(process.execPath, [CLI, '--run', 'aaaaaaaaaa'], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
    });
    assert.match(out, /run aaaaaaaaaa — 3 calls/);
    const order = ['list_dir', 'run_command', 'write_file'].map((tool) => out.indexOf(tool));
    assert.ok(order.every((index) => index > 0), 'all three are printed');
    assert.ok(order[0] < order[1] && order[1] < order[2], 'in the order they happened');
    assert.match(out, /denied/, 'the status is on the line, not hidden');
    assert.doesNotMatch(out, /sys_info/, 'a call from another run is another run');

    const missing = spawnSync(process.execPath, [CLI, '--run', 'ffffffffff'], {
      env: { ...process.env, HOME: home },
      encoding: 'utf8',
    });
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /no calls recorded for run ffffffffff/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('the help text names both flags, so they are discoverable', () => {
  const help = execFileSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.match(help, /--runs\s+list the runs in the audit/);
  assert.match(help, /--run <id>\s+print one run in order/);
});
