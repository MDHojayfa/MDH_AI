import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/fun.js']);
const { fun } = MDH;

test('both pools exist and are not three lines pretending to be a loading screen', () => {
  assert.ok(fun.MISSION.length >= 20, `mission pool is ${fun.MISSION.length}`);
  assert.ok(fun.QUOTES.length >= 8, `quote pool is ${fun.QUOTES.length}`);
});

test('every line is short enough for a ticker that must not wrap', () => {
  for (const line of [...fun.MISSION, ...fun.QUOTES]) {
    assert.ok(line.length > 10, `too short: ${line}`);
    assert.ok(line.length <= 110, `too long (${line.length}): ${line}`);
  }
});

test('no joke claims a real action or a success', () => {
  const forbidden = [/✔/, /\bsuccess(ful|fully)?\b/i, /\binstalled\b/i, /\buploaded\b/i, /\bsent to\b/i, /\bwritten\b/i];
  for (const line of fun.MISSION) {
    for (const re of forbidden) assert.doesNotMatch(line, re, `joke claims something real: ${line}`);
  }
});

test('no joke mentions credentials, keys or the audit log', () => {
  const banned = /ssh|api key|token|audit|password|secret|~\/\./i;
  for (const line of [...fun.MISSION, ...fun.QUOTES]) assert.doesNotMatch(line, banned, `unsafe joke: ${line}`);
});

test('rotation is deterministic and does not repeat back to back', () => {
  assert.equal(fun.missionAt(0), fun.missionAt(fun.MISSION.length));
  assert.notEqual(fun.missionAt(0), fun.missionAt(1));
  assert.equal(fun.quoteAt(3), fun.QUOTES[3 % fun.QUOTES.length]);
});

test('the chip line carries the tag that tells the user it is a joke', () => {
  assert.match(fun.chip(0), /^☾ /);
});

test('tags are the ones the popup knows how to colour', () => {
  for (const tag of fun.TAGS) assert.match(tag, /^[A-Z ]+$/);
  assert.equal(fun.tagAt(0), fun.TAGS[0]);
});

test('rotate() is safe with no node and returns a stop function', () => {
  const stop = fun.rotate(null);
  assert.equal(typeof stop, 'function');
  stop();
});
