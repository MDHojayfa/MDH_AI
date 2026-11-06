/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/phoenix.js', 'src/core/prompt.js']);
const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');

const plan = [
  { step: 'read the log', status: 'done' },
  { step: 'fix the parser', status: 'in progress' },
];
const results = [
  { tool: 'read_file', status: 'ok', body: 'a'.repeat(1000) },
  { tool: 'run_command', status: 'ok', body: 'npm test → 208 passing' },
  { tool: 'edit_file', status: 'ok', body: 'patched prompt.js' },
  { tool: 'run_command', status: 'error', body: 'exit 1' },
];

test('a handoff carries state, not conversation', () => {
  const text = MDH.prompt.handoff({ task: 'fix the parser', plan, results, next: 'run the tests' });
  assert.match(text, /^# Continuing a task from another chat/);
  assert.match(text, /Task: fix the parser/);
  assert.match(text, /- read the log — done/);
  assert.match(text, /- fix the parser — in progress/);
  assert.match(text, /Next step: run the tests/);
  assert.match(text, /Do not redo work that already succeeded/);
  assert.doesNotMatch(text, /Assistant:|User:/, 'no transcript');
});

test('only the last three results survive, and each is clipped', () => {
  const text = MDH.prompt.handoff({ task: 't', results });
  assert.doesNotMatch(text, /a{401}/, 'a 1000-char body is clipped');
  assert.match(text, /npm test → 208 passing/);
  assert.match(text, /exit 1/);
  assert.doesNotMatch(text, /Last results[\s\S]*read_file/, 'the oldest results fall off');
  assert.ok((text.match(/^- \w+ \[/gm) ?? []).length === 3, 'three results, no more');
});

test('an empty handoff says so instead of inventing a plan', () => {
  const text = MDH.prompt.handoff({ task: '' });
  assert.match(text, /no task recorded/);
  assert.doesNotMatch(text, /Plan:/);
  assert.doesNotMatch(text, /Last results/);
  assert.match(text, /continue the task from where the results above stop/);
});

test('a handoff can carry a fresh plug for the receiving chat', () => {
  const code = MDH.phoenix.make(() => 0.3);
  const text = MDH.prompt.handoff({ task: 't', phoenix: code });
  assert.ok(text.includes(code));
  assert.match(text, /Completion code|Completion code \(this session\)|finish/);
});

test('the pause card offers the copy, and the state it needs is kept', () => {
  assert.match(agent, /label: 'Copy handoff'/);
  assert.match(agent, /navigator\.clipboard\.writeText/);
  assert.match(agent, /recentResults: \[\]/);
  assert.match(agent, /S\.recentResults\.push/);
  assert.match(agent, /S\.recentResults\.length > 3/, 'bounded: a long run must not grow a transcript in memory');
  assert.match(agent, /S\.plan = Array\.isArray/, 'the plan is stored when the model updates it');
  assert.match(agent, /Handoff copied/);
});
