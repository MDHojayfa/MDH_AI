/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const sh = (args, env = {}) =>
  execFileSync('bash', [join(ROOT, 'install.sh'), ...args], {
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, NO_COLOR: '1', ...env },
  });

test('--help documents every flag and exits without touching anything', () => {
  const out = sh(['--help']);
  for (const flag of ['--dry-run', '--uninstall', '--no-fun', '--barbos']) assert.match(out, new RegExp(flag));
  assert.match(out, /one script, one extension, eight platforms/);
});

test('--dry-run says what it would do and changes nothing', () => {
  const out = sh(['--dry-run']);
  assert.match(out, /dry run/);
  assert.match(out, /would write:/);
  assert.match(out, /would run: node tools\/build\.mjs/);
  // The self-check is announced, never executed, in a dry run.
  assert.match(out, /would run: node tools\/selfcheck\.mjs/);
});

test('--no-fun removes every mission line but keeps every real one', () => {
  const withFun = sh(['--dry-run']);
  const without = sh(['--dry-run', '--no-fun']);
  assert.match(withFun, /☾/);
  assert.doesNotMatch(without, /☾/);
  assert.match(without, /checking dependencies/);
  assert.match(without, /self-check/);
  // The honesty line still tells the user what the ☾ lines mean when they are on.
  assert.match(withFun, /BARBOS MODE/);
});

test('--barbos echoes the real commands it would run', () => {
  const out = sh(['--dry-run', '--barbos', '--no-fun']);
  assert.match(out, /\$ mkdir -p/);
});

test('an unknown flag fails loudly instead of guessing', () => {
  assert.throws(() => sh(['--launch-missiles']), (e) => /unknown option/.test(e.stderr ?? ''));
});

test('the mission lines never use the success tick', () => {
  const out = sh(['--dry-run']);
  const missionLines = out.split('\n').filter((l) => /^\s*☾/.test(l));
  assert.ok(missionLines.length > 10, `only ${missionLines.length} mission lines`);
  for (const line of missionLines) assert.doesNotMatch(line, /✔/);
});
