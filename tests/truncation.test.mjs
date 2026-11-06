/**
 * tests/truncation.test.mjs — the one thing a hash chain cannot do on its own.
 *
 * Delete a line from the middle of the audit and the chain breaks. Delete the last ten lines and every remaining
 * link still verifies: a chain has no opinion about its own tail. That is not a new discovery (Bellare & Yee
 * 1997, and Ma & Tsudik 2008 name the truncation attack), it was simply true of this log until the checkpoint
 * beside it. These tests delete things and expect to be told.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'mdh-trunc-'));
process.env.HOME = home;

const { appendAudit, resetCheckpoint, verifyAudit } = await import('../host/audit.mjs');
const { archiveAudit } = await import('../host/logs.mjs');
const { renderPage } = await import('../host/viewer.mjs');
const { paths } = await import('../host/config.mjs');

const CHECKPOINT = `${paths.audit}.checkpoint.json`;
const line = (i) => JSON.stringify({ tool: 'read_file', args: { path: `/tmp/${i}` }, status: 'ok', ms: i });

function fresh(count = 3) {
  rmSync(paths.audit, { force: true });
  rmSync(CHECKPOINT, { force: true });
  for (let i = 1; i <= count; i += 1) {
    appendAudit({ tool: 'read_file', args: { path: `/tmp/${i}` }, status: 'ok', ms: i });
  }
}

test('a whole chain verifies and the checkpoint agrees with it', () => {
  fresh(3);
  const out = verifyAudit();
  assert.equal(out.ok, true);
  assert.equal(out.lines, 3);
  const cp = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
  assert.equal(cp.lines, 3);
  assert.equal(cp.lost, 0, 'a log that has lost nothing says so');
});

test('removing the last entry is caught, with a count', () => {
  fresh(3);
  const lines = readFileSync(paths.audit, 'utf8').trim().split('\n');
  writeFileSync(paths.audit, `${lines.slice(0, -1).join('\n')}\n`);
  const out = verifyAudit();
  assert.equal(out.ok, false, 'this is the case the plain chain used to call fine');
  assert.equal(out.truncated, true);
  assert.equal(out.missing, 1);
  assert.equal(out.lines, 2);
  assert.match(out.reason, /cannot see its own tail/);
});

test('removing several entries reports how many, not just that something is wrong', () => {
  fresh(5);
  const lines = readFileSync(paths.audit, 'utf8').trim().split('\n');
  writeFileSync(paths.audit, `${lines.slice(0, 2).join('\n')}\n`);
  const out = verifyAudit();
  assert.equal(out.missing, 3);
  assert.equal(out.lines, 2);
});

test('deleting the file is the largest truncation, not a clean slate', () => {
  fresh(4);
  rmSync(paths.audit);
  const out = verifyAudit();
  assert.equal(out.ok, false);
  assert.equal(out.truncated, true);
  assert.equal(out.missing, 4);
  assert.match(out.reason, /audit file is gone/);
});

test('a later write cannot bury the evidence', () => {
  fresh(3);
  const lines = readFileSync(paths.audit, 'utf8').trim().split('\n');
  writeFileSync(paths.audit, `${lines.slice(0, -1).join('\n')}\n`);
  appendAudit({ tool: 'list_dir', args: { path: '/tmp' }, status: 'ok', ms: 1 }); // the app keeps working
  const out = verifyAudit();
  assert.equal(out.ok, false, 'the witness keeps the old high-water mark');
  assert.equal(out.missing, 1);
});

test('archiving is a new chain, not a truncation', () => {
  fresh(3);
  const archived = archiveAudit();
  assert.equal(archived.ok, true);
  assert.ok(existsSync(archived.file), 'the entries are still on disk, under a timestamped name');
  const out = verifyAudit();
  assert.equal(out.ok, true, 'a chain the user deliberately put aside is not a missing chain');
  assert.equal(out.lines, 0);
});

test('a corrupt checkpoint is no opinion, not a broken chain', () => {
  fresh(2);
  writeFileSync(CHECKPOINT, 'this is not json');
  const out = verifyAudit();
  assert.equal(out.ok, true, 'verification of the chain must not depend on a side file parsing');
  assert.equal(out.lines, 2);
});

test('the checkpoint sits beside the chain and does not change its hashes', () => {
  fresh(2);
  const text = readFileSync(paths.audit, 'utf8');
  assert.doesNotMatch(text, /witness|checkpoint/, 'the audit file is still just entries');
  assert.equal(JSON.parse(text.trim().split('\n')[0]).prev, '0'.repeat(64));
  resetCheckpoint();
  assert.equal(verifyAudit().ok, true);
});

test('the checkpoint file is written where the docs say it is', () => {
  fresh(1);
  assert.ok(existsSync(CHECKPOINT));
  assert.ok(CHECKPOINT.startsWith(paths.stateDir), 'same folder as the log, same rules about who can read it');
  assert.equal(line(1).includes('checkpoint'), false);
});

test('the page says it in words, not just a badge', () => {
  const rows = [{ at: new Date().toISOString(), tool: 'read_file', status: 'ok', run: 'r1', hash: 'abc123456789' }];
  const audit = { ok: false, lines: 1, truncated: true, missing: 3, reason: 'the last 3 entries are missing' };
  const page = renderPage({ entries: rows, allEntries: rows, meta: { tokenValue: 'tok', audit }, query: {} });
  assert.match(page, /3 entries missing from the end/);
  assert.match(page, /class="sub bad-text"/, 'and the sentence is on the page, not only in the badge');
  assert.match(page, /the last 3 entries are missing/);
  const fine = renderPage({ entries: rows, allEntries: rows, meta: { tokenValue: 'tok', audit: { ok: true, lines: 1 } }, query: {} });
  assert.match(fine, /chain verified/);
  assert.doesNotMatch(fine, /class="sub bad-text"/, 'nothing red when nothing is wrong');
});
