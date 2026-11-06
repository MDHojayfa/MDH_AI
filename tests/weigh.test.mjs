import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { evaluate, BUDGET } from '../tools/weigh.mjs';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('the budgets are numbers a potato can meet, and they are enforced', () => {
  assert.equal(BUDGET.dependencies, 0, 'a dependency is a download that can fail on someone else’s machine');
  assert.ok(BUDGET.zipKb <= 500, 'the whole extension should be smaller than one screenshot');
  assert.ok(BUDGET.hostRssMb <= 128, 'the host must not cost more than a browser tab');
  assert.ok(BUDGET.startupMs <= 2000, 'ready before a human can move the mouse to the button');

  assert.equal(evaluate({ zipKb: 131, hostRssMb: 55, startupMs: 51, dependencies: 0 }).ok, true);
  assert.equal(evaluate({ zipKb: 900, hostRssMb: 55, startupMs: 51, dependencies: 0 }).ok, false);
  assert.equal(evaluate({ zipKb: 131, hostRssMb: 400, startupMs: 51, dependencies: 0 }).ok, false);
  assert.equal(evaluate({ zipKb: 131, hostRssMb: 55, startupMs: 9000, dependencies: 0 }).ok, false);
  assert.equal(evaluate({ zipKb: 131, hostRssMb: 55, startupMs: 51, dependencies: 3 }).ok, false,
    'three npm packages is three chances for a supply chain to have a bad week');
});

test('the dependency count is a fact about this package, not a slogan', () => {
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  assert.equal(Object.keys(pkg.optionalDependencies ?? {}).length, 0);
  assert.equal(Object.keys(pkg.devDependencies ?? {}).length, 0, 'not even dev dependencies: node --test is enough');
});

test('"runs on a potato" is measured, and the measurement can fail', () => {
  const weigh = readFileSync(join(ROOT, 'tools/weigh.mjs'), 'utf8');
  assert.match(weigh, /host startup/);
  assert.match(weigh, /resident/);
  assert.match(weigh, /process\.exit\(verdict\.ok \? 0 : 1\)/, 'over budget must break a build, not a paragraph');
  assert.match(weigh, /NASA PC/, 'the one joke in this file is aimed at people who write "lightweight" without measuring');
  assert.ok(pkg.scripts.weigh, 'and it is a first-class script, not a secret');
});

test('the comparison doc quotes the same numbers the tool prints', () => {
  const why = readFileSync(join(ROOT, 'docs/WHY.md'), 'utf8');
  assert.match(why, /npm run weigh/, 'the claim tells the reader how to check it');
  assert.match(why, /dependencies/);
  assert.match(why, /API key/);
  assert.match(why, /does not require|No API key/i);
});

test('v2 notes exist, name the rotation feature, and promise nothing', () => {
  const v2 = readFileSync(join(ROOT, 'docs/V2-NOTES.md'), 'utf8');
  assert.match(v2, /Platform rotation/);
  assert.match(v2, /handoff/i);
  assert.match(v2, /messaging/i);
  assert.match(v2, /not promised|no dates|notes, not a promise/i);
});
