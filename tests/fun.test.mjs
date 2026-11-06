/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/fun-corpus.js', 'src/core/fun.js']);
const { fun } = MDH;

test('the corpus is big enough that a session never hears the same joke twice', () => {
  // 60 turns × ~40 s of waiting, one line every 2.6 s ≈ 900 rotations. One thousand lines covers it.
  assert.ok(fun.MISSION.length >= 1000, `mission pool is ${fun.MISSION.length}`);
  assert.ok(fun.QUOTES.length >= 300, `quote pool is ${fun.QUOTES.length}`);
  assert.ok(fun.size() >= 1300, `total is ${fun.size()}`);
});

test('no duplicates in the merged pool', () => {
  assert.equal(new Set(fun.MISSION).size, fun.MISSION.length);
  assert.equal(new Set(fun.QUOTES).size, fun.QUOTES.length);
});

test('every line is short enough for a ticker that must not wrap', () => {
  for (const line of [...fun.MISSION, ...fun.QUOTES]) {
    assert.ok(line.length > 10, `too short: ${line}`);
    assert.ok(line.length <= 120, `too long (${line.length}): ${line}`);
  }
});

test('no mission line claims a real action or a success', () => {
  // "written in rock" is scenery, not a claim about a file; the rest are real claims and stay banned.
  const forbidden = [/✔/, /\bsuccess(ful|fully)?\b/i, /\binstalled\b/i, /\buploaded\b/i, /\bsent to\b/i, /\bsaved\b/i, /\bexecuted\b/i];
  for (const line of fun.MISSION) {
    for (const re of forbidden) assert.doesNotMatch(line, re, `joke claims something real: ${line}`);
  }
});

test('no line asks for or exposes a credential', () => {
  const dangerous = [/\bapi key\b/i, /\bprivate key\b/i, /id_rsa/i, /\bssh\b/i, /passphrase/i, /\baudit log contains\b/i];
  for (const line of [...fun.MISSION, ...fun.QUOTES]) {
    for (const re of dangerous) assert.doesNotMatch(line, re, `unsafe joke: ${line}`);
  }
});

test('rotation is deterministic and does not repeat back to back', () => {
  assert.equal(fun.missionAt(0), fun.MISSION[0]);
  assert.equal(fun.missionAt(fun.MISSION.length), fun.MISSION[0]);
  assert.notEqual(fun.missionAt(0), fun.missionAt(1));
  assert.equal(fun.quoteAt(3), fun.QUOTES[3 % fun.QUOTES.length]);
});

test('the pool is interleaved: consecutive lines come from different categories', () => {
  const firstTwelve = new Set(Array.from({ length: 12 }, (_, i) => fun.tagAt(i)));
  assert.ok(firstTwelve.size >= 5, `only ${[...firstTwelve].join(',')} in the first twelve`);
});

test('every tag is one the popup can colour', () => {
  assert.deepEqual([...fun.TAGS], ['FUN', 'MOON', 'MARS', 'JUPITER', 'PLUTO', 'DEEP SPACE']);
  for (const entry of fun.TAGGED) assert.ok(fun.TAGS.includes(entry.tag));
});

test('the chip line carries the tag that tells the user it is a joke', () => {
  assert.match(fun.chip(0), /^☾ /);
});

test('rotate() is safe with no node and returns a stop function', () => {
  const stop = fun.rotate(null);
  assert.equal(typeof stop, 'function');
  stop();
});
