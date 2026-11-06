import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/dock.js'], { hostname: 'chat.deepseek.com' });
const dock = MDH.dock;
const source = readFileSync(join(ROOT, 'src/core/dock.js'), 'utf8');
const main = readFileSync(join(ROOT, 'src/content/main.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'src/manifest.base.json'), 'utf8'));

test('the pill is loaded and mounted on supported pages', () => {
  const files = manifest.content_scripts.flatMap((entry) => entry.js);
  assert.ok(files.includes('core/dock.js'), 'dock.js must be in the content scripts');
  assert.ok(files.indexOf('core/agent.js') < files.indexOf('core/dock.js'), 'the dock drives the agent, so it loads after it');
  assert.ok(files.indexOf('core/dock.js') < files.indexOf('content/main.js'));
  assert.match(main, /MDH\.dock\.mount\(adapter\)/);
});

test('every phase has a label, an action and a tooltip a person can read', () => {
  const phases = dock._internals.PHASES;
  assert.ok(Object.keys(phases).length >= 7);
  for (const [phase, entry] of Object.entries(phases)) {
    assert.ok(entry.icon && entry.label && entry.title, `${phase} is incomplete`);
    assert.ok(['start', 'stop', 'resume', 'report', 'none'].includes(entry.action), `${phase} has a strange action`);
    assert.ok(entry.label.length <= 10, `${phase} label is too long for a pill: ${entry.label}`);
    assert.match(entry.title, /[a-z]/i);
  }
});

test('the state follows the agent, including a paused and a finished run', () => {
  assert.equal(dock.stateFor({ agent: { running: false, phase: 'idle' } }).action, 'start');
  assert.equal(dock.stateFor({ agent: { running: true, phase: 'waiting-reply', turn: 3 } }).icon, '⏳');
  assert.equal(dock.stateFor({ agent: { running: true, phase: 'waiting-reply', turn: 3 } }).turn, 3);
  assert.equal(dock.stateFor({ agent: { running: true, phase: 'executing' } }).action, 'stop');
  assert.equal(dock.stateFor({ agent: { running: false, phase: 'stopped' } }).action, 'resume');
  assert.equal(dock.stateFor({ agent: { running: false, phase: 'done' } }).action, 'resume');
  assert.equal(dock.stateFor(null).action, 'start');
  // an unknown phase must not leave the button actionless
  assert.equal(dock.stateFor({ agent: { running: false, phase: 'teleporting' } }).action, 'start');
});

test('the anchor sits above the composer and never outside the window', () => {
  const viewport = { width: 1200, height: 800 };
  const rect = { right: 900, top: 700, bottom: 760, left: 300, width: 600, height: 60 };
  const pos = dock._internals.anchorFor(rect, { width: 96, height: 38 }, viewport);
  assert.equal(pos.left, 900 - 96, 'flush with the composer right edge');
  assert.ok(pos.top < rect.top, 'above the composer, never on the send button');

  const edge = dock._internals.anchorFor({ right: 1195, top: 12, bottom: 70 }, { width: 96, height: 38 }, viewport);
  assert.ok(edge.left >= 0 && edge.left + 96 <= viewport.width);
  assert.ok(edge.top >= 0, 'top clamped to the viewport');
});

test('clamping survives a saved position from a bigger screen', () => {
  const pos = dock._internals.clampPos({ left: 4000, top: 3000 }, { width: 96, height: 38 }, { width: 1024, height: 768 });
  assert.equal(pos.left, 1024 - 96);
  assert.equal(pos.top, 768 - 38);
  const negative = dock._internals.clampPos({ left: -50, top: -10 }, { width: 96, height: 38 }, { width: 1024, height: 768 });
  assert.equal(negative.left, 0);
  assert.equal(negative.top, 0);
});

test('the pill keeps its own styles and its own position', () => {
  assert.match(source, /attachShadow\(\{ mode: 'open' \}\)/);
  assert.match(source, /position: fixed/);
  assert.match(source, /dockPos/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /aria-label/);
  assert.match(source, /Math\.hypot\([^)]*\) < 4/, 'a drag must be distinguishable from a click');
});

test('starting from the page remembers the task and does not require the popup', () => {
  assert.match(source, /lastTask/);
  assert.match(source, /MDH\.agent\?\.start\?\.\(task, adapter\)/);
  assert.match(source, /MDH\.agent\?\.stop\?\./);
  assert.match(source, /MDH\.agent\?\.resume\?\./);
});

test('the pill cannot squeeze the page: it floats and never edits the composer', () => {
  assert.match(source, /document\.documentElement\.append\(host\)/, 'the host element is a child of <html>');
  assert.doesNotMatch(source, /composer\.style/, 'never style the page\'s composer');
  assert.doesNotMatch(source, /insertAdjacentElement|appendChild\(.*composer/, 'never inject into the composer subtree');
  assert.match(source, /position: fixed/);
  // anchoring is measurement-based, so a renamed layout slot moves the pill instead of breaking the page
  assert.match(source, /getBoundingClientRect/);
});
