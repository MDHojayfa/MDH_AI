/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const files = [
  'src/core/phoenix.js',
  'src/core/grants.js',
  'src/core/skills.js',
  'src/core/policy.js',
  'src/core/parser.js',
  'src/core/prompt.js',
  'src/core/agent.js',
];
const { MDH } = loadCore(files);
const { hintFor } = MDH.agent._internals;
const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');

test('a known failure becomes a next action, not a repeat', () => {
  assert.match(hintFor('[PATH_DENIED] /etc/shadow is on the deny list'), /allowed folders/);
  assert.match(hintFor('Error: ENOENT: no such file or directory, open \'/tmp/x\''), /does not exist/);
  assert.match(hintFor('[TIMEOUT] command exceeded 60000 ms'), /narrower|time limit/);
  assert.match(hintFor('[TOOL_MISSING] no tool named docker'), /not installed in this build/);
  assert.match(hintFor('[DENIED] the user denied this call'), /do not retry/);
  assert.match(hintFor('bash: Permission denied'), /not allowed to touch/);
  assert.match(hintFor('NO_HOST the host is not running'), /install\.sh/);
});

test('an unknown failure gets no invented advice', () => {
  assert.equal(hintFor('something strange happened'), null);
  assert.equal(hintFor(''), null);
  assert.equal(hintFor('exit code 1'), null, 'a failing command is not automatically a known problem');
});

test('the hint rides below the real error, never instead of it', () => {
  assert.match(agent, /\[MDH_HINT\]/);
  const block = agent.slice(agent.indexOf('function frame('), agent.indexOf('function frame(') + 700);
  // The body is truncated and tag-scrubbed before the hint is computed, so a hint cannot be triggered by text
  // that was cut away — and the text the model reads is the text the hint was chosen from.
  assert.match(block, /const safe = scrubTag\(MDH\.util\.truncate\(String\(body \?\? ''\), 128 \* 1024\), tag\)/);
  assert.match(block, /\$\{safe\}\$\{tail\}/, 'the error text is untouched, the hint is appended');
  assert.match(block, /status === 'ok' \? null : hintFor\(safe\)/, 'a successful call never gets a warning hint');
});

test('the hint list stays short enough to be read', () => {
  const hints = agent.slice(agent.indexOf('const HINTS = ['), agent.indexOf('];', agent.indexOf('const HINTS = [')));
  const count = (hints.match(/\{ match:/g) ?? []).length;
  assert.ok(count >= 6 && count <= 12, `expected a short table, found ${count}`);
});
