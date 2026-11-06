import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/probe.js']);
const { probe, report } = MDH.probe;

const adapter = {
  id: 'testchat',
  name: 'TestChat',
  dom: {
    composer: ['#composer', 'div[contenteditable="true"]'],
    messages: ['[data-role="assistant"]'],
    send: ['button[data-testid="send"]'],
    stop: ['button[data-testid="stop"]'],
  },
  sse: { mode: 'sse', deltaMode: 'replace', apiPattern: /\/backend-api\/conversation/ },
};

const rootWith = (present) => ({
  visibilityState: 'visible',
  querySelector: (selector) => {
    if (selector.includes('[[')) throw new SyntaxError(`'${selector}' is not a valid selector`);
    return present.some((p) => selector.includes(p)) ? { selector } : null;
  },
});

test('a page that matches the adapter is green, and says nothing more', () => {
  const result = probe(adapter, rootWith(['#composer', '[data-role', 'send', 'stop']));
  assert.equal(result.ok, true);
  assert.deepEqual([...result.missing], []);
  assert.match(result.summary, /wiring looks right/);
  assert.equal(result.sse.apiPattern, '\\/backend-api\\/conversation');
});

test('a renamed composer is reported as the reason Start does nothing', () => {
  const result = probe(adapter, rootWith(['[data-role']));
  assert.equal(result.ok, false);
  assert.deepEqual([...result.missing], ['composer']);
  assert.match(result.fields.composer.note, /cannot type a message/);
  assert.match(result.summary, /does not match/);
  assert.equal(report(result)[0][0], '✘');
});

test('a missing send or stop button is a hint, never a failure', () => {
  const result = probe(adapter, rootWith(['#composer', '[data-role']));
  assert.equal(result.ok, true, 'optional selectors must not fail the probe');
  assert.equal(result.fields.send.ok, false);
  assert.equal(result.fields.send.required, false);
  assert.match(result.fields.send.note, /after you type/);
  const lines = report(result);
  assert.ok(lines.some((line) => line.startsWith('  ○ send')), 'drawn as a hint, not a cross');
});

test('the report lists what matched, not a score', () => {
  const lines = report(probe(adapter, rootWith(['#composer', '[data-role', 'send'])));
  assert.equal(lines[0][0], '✔');
  assert.ok(lines.some((line) => line.includes('composer: #composer')));
  assert.ok(!lines.some((line) => /\d+\/10|score/i.test(line)));
});

test('an invalid selector is the adapter’s bug and is named as one', () => {
  const bad = { ...adapter, dom: { ...adapter.dom, composer: ['div[[[', '#composer'] } };
  const result = probe(bad, rootWith(['#composer']));
  assert.deepEqual([...result.fields.composer.invalid], ['div[[[']);
  assert.equal(result.fields.composer.ok, true, 'the valid selector still counts');
  assert.match(report(result).join('\n'), /invalid selector: div\[\[\[/);
});

test('no adapter means no pretending', () => {
  const result = probe(null);
  assert.equal(result.ok, false);
  assert.match(result.summary, /no adapter/);
});

test('the page can be asked for its probe result over the message bus', () => {
  const main = readFileSync(join(ROOT, 'src/content/main.js'), 'utf8');
  assert.match(main, /mdh:probe/);
  const popup = readFileSync(join(ROOT, 'src/popup/popup.js'), 'utf8');
  assert.match(popup, /Check this page|probe-out/);
  const manifest = JSON.parse(readFileSync(join(ROOT, 'src/manifest.base.json'), 'utf8'));
  const files = manifest.content_scripts.flatMap((e) => e.js);
  assert.ok(files.includes('core/probe.js'));
  assert.ok(files.indexOf('core/probe.js') < files.indexOf('content/main.js'));
});
