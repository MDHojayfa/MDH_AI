import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const html = readFileSync(join(ROOT, 'src/popup/popup.html'), 'utf8');
const js = readFileSync(join(ROOT, 'src/popup/popup.js'), 'utf8');
const css = readFileSync(join(ROOT, 'src/popup/popup.css'), 'utf8');
const { MDH } = loadCore(['src/core/report.js']);

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

test('every element the popup script looks up actually exists', () => {
  const used = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
  assert.ok(used.size > 20, 'the popup script should be doing real work');
  for (const id of used) assert.ok(ids.has(id), `#${id} is referenced but not in the markup`);
});

test('no inline event handlers: MV3 would refuse to run them', () => {
  assert.doesNotMatch(html, /\son(click|load|change|submit|input|keydown|error)=/i);
});

test('nothing in the popup is loaded from the network', () => {
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const value = match[1];
    if (value.startsWith('#')) continue;
    if (value.startsWith('http')) continue; // a plain link a human clicks, not a resource
    assert.doesNotMatch(value, /^\/\//, `${value} is protocol-relative`);
  }
  assert.equal((html.match(/<script src="http/g) ?? []).length, 0);
  assert.equal((html.match(/<link[^>]+href="http/g) ?? []).length, 0);
});

test('every share button maps to a real destination', () => {
  const links = MDH.report.shareLinks();
  const buttons = [...html.matchAll(/data-share="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(buttons.length >= 10, `only ${buttons.length} share buttons`);
  for (const name of buttons) assert.ok(links[name], `data-share="${name}" has no URL builder`);
  assert.equal(new Set(buttons).size, buttons.length, 'a destination is listed twice');
});

test('the tags are balanced, so the sheet cannot swallow the page', () => {
  for (const tag of ['section', 'details', 'div', 'button', 'p']) {
    const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
    const close = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
    assert.equal(open, close, `<${tag}> ${open} open vs ${close} closed`);
  }
});

test('the sheet is a real dialog and can be closed three ways', () => {
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby=/);
  assert.match(js, /\$\('share-close'\)\.addEventListener/);
  assert.match(js, /e\.target === \$\('share-sheet'\)/);
  assert.match(js, /e\.key === 'Escape'/, 'a modal without an Escape handler traps a keyboard user');
  assert.match(js, /restoreFocus/, 'closing the sheet must return focus to the button that opened it');
});

test('the report strip sits above the controls, not below them', () => {
  const reportAt = html.indexOf('id="report"');
  const taskAt = html.indexOf('id="task"');
  assert.ok(reportAt > 0 && taskAt > reportAt, 'the issue line must be the first thing a user reads');
  assert.match(css, /\.report\s*\{/);
  assert.match(css, /\.report\.loud/);
});

test('nothing in the popup promises a feature that is not there', () => {
  assert.doesNotMatch(html, /auto-?fix|guarantee|100% |works everywhere|all websites/i);
  assert.match(html, /NASA PC|developer/i);
});

test('turning the jokes off leaves the help desk on', () => {
  assert.match(html, /id="fun-off"/);
  assert.match(js, /funOff/);
  assert.match(js, /stored\?\.funOff === true/, 'the choice has to survive a restart');
  // the strip and the sheet must not live inside either thing the toggle hides
  const barbosAt = html.indexOf('id="barbos"');
  assert.ok(html.indexOf('id="report"') < barbosAt, 'the report strip must be outside BARBOS MODE');
  assert.ok(html.indexOf('id="share-sheet"') > barbosAt, 'the sheet is a sibling, not a child');
  assert.match(js, /applyFun\(\)/);
});

test('a pause says so, in words, in the popup', () => {
  assert.match(js, /phase === 'paused'/);
  assert.match(js, /pauseReason/);
  assert.match(js, /'warn'/);
  assert.match(js, /finished/);
});

test('the popup answers "what happened last run" without being asked', () => {
  assert.match(html, /id="last-run"/);
  assert.match(js, /mdh:runs/);
  assert.match(js, /no runs yet/);
  const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
  assert.match(agent, /pushCapped\('runs'/);
  assert.match(agent, /recordRun\('completed'/);
  assert.match(agent, /recordRun\('paused'/);
  assert.match(agent, /recordRun\('stopped'/);
  assert.match(agent, /visibilitychange/);
});
