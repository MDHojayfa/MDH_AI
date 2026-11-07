/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const doc = (name) => readFileSync(join(ROOT, 'docs', name), 'utf8');
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');

test('every feature added late in v1 has a scenario a human can recognise', () => {
  const scenarios = doc('SCENARIOS.md');
  for (const needle of [
    'the plug',
    'layout watch',
    'grants',
    'runs in the log',
    'handoff',
  ]) {
    assert.ok(scenarios.toLowerCase().includes(needle), `SCENARIOS covers ${needle}`);
  }
  assert.match(scenarios, /fifteen sentences/, 'and the closing paragraph counts them correctly');
});

test('the questions people will actually ask are answered', () => {
  const faq = doc('FAQ.md');
  for (const question of [
    'completion code',
    'Plan first',
    'Skills',
    'Remembered approvals',
    'Runs on a potato',
  ]) {
    assert.ok(faq.includes(question), `FAQ answers "${question}"`);
  }
  assert.match(faq, /147 KB/, 'and quotes the measured bundle size, not a remembered one');
});

test('the honest gap list covers what 1.0.0 added', () => {
  const limits = doc('KNOWN-LIMITS.md');
  assert.match(limits, /## Added in 1\.0\.0/);
  for (const row of ['Completion code', 'Plan first', 'Skills', 'Remembered approvals', 'Layout watch', 'Weigh']) {
    assert.ok(limits.includes(row), `KNOWN-LIMITS has a row for ${row}`);
  }
});

test('the README points at the docs that make the claims checkable', () => {
  for (const link of ['docs/WHY.md', 'docs/PLUG.md', 'docs/V2-NOTES.md', 'docs/RELEASE.md', 'docs/TESTPLAN.md']) {
    assert.ok(readme.includes(link), `README links ${link}`);
  }
  assert.match(readme, /npm run weigh/, 'and tells the reader how to check the numbers');
});
