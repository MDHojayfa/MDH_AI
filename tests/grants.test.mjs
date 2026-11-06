/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/grants.js']);
const G = MDH.grants;

const key = 'run_command\u0000\u0000git status';
const call = { key, command: 'git status' };

test('a grant answers "already approved", never "is it allowed"', () => {
  let store = G.empty();
  assert.equal(G.isGranted(store, key, { boot: 'b1', site: 'chatgpt.com' }), false);
  store = G.add(store, { ...call, scope: 'run', boot: 'b1', site: 'chatgpt.com' });
  // run grants are not stored: add() only accepts session/site, so this is a no-op by design
  assert.equal(store.items.length, 0);
});

test('session grants end when the browser restarts, and only then', () => {
  let store = G.add(G.empty(), { ...call, scope: 'session', boot: 'b1' });
  assert.equal(G.isGranted(store, key, { boot: 'b1' }), true);
  assert.equal(G.isGranted(store, key, { boot: 'b2' }), false, 'a new boot ends it');
  const after = G.expire(store, 'b2');
  assert.equal(after.boot, 'b2');
  assert.equal(after.items.length, 0, 'and it is pruned, not just ignored');
});

test('site grants survive restarts and are scoped to one site', () => {
  const store = G.add(G.empty(), { ...call, scope: 'site', site: 'chatgpt.com', boot: 'b1' });
  assert.equal(G.isGranted(store, key, { site: 'chatgpt.com', boot: 'b9' }), true);
  assert.equal(G.isGranted(store, key, { site: 'claude.ai', boot: 'b9' }), false, 'another site is another decision');
  assert.equal(G.list(store, { site: 'claude.ai' }).length, 0);
  assert.equal(G.list(store, { site: 'chatgpt.com' }).length, 1);
});

test('the same grant is never stored twice, and can be forgotten', () => {
  let store = G.add(G.empty(), { ...call, scope: 'site', site: 'chatgpt.com', at: 1 });
  store = G.add(store, { ...call, scope: 'site', site: 'chatgpt.com', at: 2 });
  assert.equal(store.items.length, 1);
  assert.equal(store.items[0].at, 2, 'the newer approval wins');
  store = G.forget(store, key, { site: 'chatgpt.com' });
  assert.equal(store.items.length, 0);
  assert.equal(G.isGranted(store, key, { site: 'chatgpt.com' }), false);
});

test('a grant list stays bounded, and rejects junk', () => {
  let store = G.empty();
  for (let i = 0; i < 260; i += 1) {
    store = G.add(store, { key: `${key}${i}`, scope: 'session', boot: 'b1' });
  }
  assert.equal(store.items.length, 200, 'a long browser session should not grow without end');
  assert.equal(G.add(store, { key: '', scope: 'run' }).items.length, 200, 'an empty key is refused');
});

test('the scopes are worded the way the buttons read', () => {
  assert.equal(G.describe('run'), 'allow for this run');
  assert.equal(G.describe('session'), 'allow until the browser restarts');
  assert.match(G.describe('site', 'claude.ai'), /claude\.ai/);
});

test('the card and the loop agree on the four scopes', () => {
  const ui = readFileSync(join(ROOT, 'src/core/ui.js'), 'utf8');
  const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
  for (const label of ['Allow once', 'Allow for this run', 'Allow for this session', 'Always allow on this site']) {
    assert.ok(ui.includes(label), `the menu offers "${label}"`);
  }
  assert.match(ui, /aria-haspopup/, 'the drop-down is announced, not just drawn');
  assert.match(agent, /decision === 'session'/);
  assert.match(agent, /decision === 'site'/);
});
