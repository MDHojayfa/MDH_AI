/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tests/a11y.test.mjs — the parts of the interface that were invisible to everybody who was not looking.
 *
 * Read as source, like the other UI tests: this harness has no browser. What is checked is the shape a screen
 * reader depends on — a live region that exists before the first change, a label that is the same word the pill
 * shows, focus that moves into a card and comes back. The W3C technique for the first two is ARIA22 (WCAG 4.1.3);
 * the third is focus order, 2.4.3.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const dock = read('src/core/dock.js');
const ui = read('src/core/ui.js');
const manual = read('docs/MANUAL.md');

test('the pill has a polite live region, created before anything changes', () => {
  assert.match(dock, /role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true'/);
  assert.match(dock, /shadow\.append\(pill, panel, live\)/, 'in the DOM from the first paint');
  assert.match(dock, /if \(live\) live\.textContent = `\$\{state\.label\}\./);
  assert.match(dock, /polite|aria-live/, 'polite, not assertive: a phase change is not an emergency');
  assert.doesNotMatch(dock, /aria-live': 'assertive'/, 'nothing in the dock shouts');
});

test('the announcement is the pill\'s own word, and only on a phase change', () => {
  const sync = dock.slice(dock.indexOf('function sync()'), dock.indexOf('async function mount'));
  assert.match(sync, /if \(state\.phase !== lastPhase\)/, 'one announcement per phase, not one per poll');
  assert.match(sync, /live\.textContent = `\$\{state\.label\}\./, 'the same label the sighted user reads');
  const announcement = sync.slice(sync.indexOf('live.textContent'), sync.indexOf('live.textContent') + 80);
  assert.doesNotMatch(announcement, /turn/, 'the turn counter is not announced: it is noise');
});

test('a card takes focus, and gives it back', () => {
  assert.match(ui, /let returnFocusTo = null;/);
  assert.match(ui, /const active = document\.activeElement;/, 'remember where the user was');
  assert.match(ui, /card\.querySelector\?\.\('\.primary'\) \?\? card/, 'the decision gets focus when there is one');
  assert.match(ui, /preventScroll: true/, 'moving focus must not scroll the chat away from the task');
  assert.match(ui, /if \(back && document\.contains\(back\)\) back\.focus/, 'and back again, if it still exists');
});

test('the card is a named dialog, not a floating div', () => {
  assert.match(ui, /role: 'dialog', 'aria-modal': 'false', 'aria-label': title/);
  assert.match(ui, /card\.tabIndex = -1/, 'focusable even when it has no button');
});

test('the manual says so, because a feature nobody knows about is a rumour', () => {
  assert.match(manual, /screen reader/i);
});
