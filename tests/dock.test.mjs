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
  assert.ok(Object.keys(phases).length >= 10, 'paused, resuming and sending are states a user will see');
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
  const paused = dock.stateFor({ agent: { running: false, phase: 'paused', pauseReason: 'no reply arrived' } });
  assert.equal(paused.action, 'resume', 'a paused task must be one click from continuing');
  assert.equal(paused.label, 'Continue');
  assert.equal(paused.paused, true);
  assert.equal(paused.pauseReason, 'no reply arrived');
  // a stop in the middle of a send must not advertise a strange state
  assert.equal(dock.stateFor({ agent: { running: false, phase: 'injecting' } }).phase, 'idle');
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

test('the pill can be hidden per site, and put back', () => {
  const main = readFileSync(join(ROOT, 'src/content/main.js'), 'utf8');
  const popup = readFileSync(join(ROOT, 'src/popup/popup.js'), 'utf8');
  const html = readFileSync(join(ROOT, 'src/popup/popup.html'), 'utf8');
  assert.match(source, /setHidden/);
  assert.match(source, /dockHidden/);
  assert.match(source, /if \(hiddenHere\) return/, 'a hidden pill must not be rebuilt on load');
  assert.match(main, /mdh:dock/);
  assert.match(main, /dock: \{ mounted/, 'the popup needs to know the current state');
  assert.match(popup, /dock-toggle/);
  assert.match(html, /id="dock-toggle"/);
});

test('a finished task gets a finish card, not silence', () => {
  const ui = readFileSync(join(ROOT, 'src/core/ui.js'), 'utf8');
  const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
  assert.match(ui, /function done\(/);
  assert.match(ui, /Run again/);
  assert.match(ui, /Report a problem/);
  assert.match(agent, /MDH\.ui\.done\?\.\(/);
  assert.match(agent, /onAgain:/);
});

test('the tooltip answers "why is it like this" without opening anything', () => {
  const { explain, PHASES } = dock._internals;

  assert.equal(explain({ title: PHASES.running.title, turn: 12 }), `${PHASES.running.title} · turn 12`);
  assert.equal(
    explain({ title: PHASES.paused.title, pauseReason: 'no reply arrived', turn: 4 }),
    `${PHASES.paused.title} — no reply arrived · turn 4`,
    'the reason is in the tooltip, not only in the card',
  );
  assert.equal(explain({ title: PHASES.stopped.title, pauseReason: 'turn limit reached' }),
    `${PHASES.stopped.title} — turn limit reached`);
  assert.equal(explain({}), 'MDH', 'a missing state still says something true');
});

test('the title is refreshed when the reason changes, not only when the phase does', () => {
  assert.match(source, /const title = explain\(state\);/);
  assert.match(source, /if \(pill\.title !== title\)/);
  assert.match(source, /pill\.setAttribute\('aria-label', title\)/, 'and screen readers get the same sentence');
});

test('a phase change is announced, not only drawn (WCAG 4.1.3 / ARIA22)', () => {
  // The pill changes without moving focus. Without a live region a screen reader user never learns that the task
  // started, paused or died, which makes the control useless to them however good it looks.
  assert.match(source, /role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true'/);
  assert.match(source, /live\.textContent = `\$\{state\.label\}\./, 'announced with the same word the pill shows');
  assert.match(source, /\.sr \{ position: absolute; width: 1px; height: 1px;/, 'hidden visually, not from AT');
  assert.doesNotMatch(source, /\.sr \{[^}]*display: none/, 'display:none would take it out of the accessibility tree');
  assert.match(source, /shadow\.append\(pill, panel, live\)/, 'the region exists before any change');
  assert.match(source, /if \(state\.phase !== lastPhase\)/, 'updated on a phase change, not on every poll');
});
