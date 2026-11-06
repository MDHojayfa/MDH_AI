import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/skills.js', 'src/core/prompt.js']);
const S = MDH.skills;
const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
const main = readFileSync(join(ROOT, 'src/content/main.js'), 'utf8');
const html = readFileSync(join(ROOT, 'src/popup/popup.html'), 'utf8');
const tools = readFileSync(join(ROOT, 'host/tools/linux.mjs'), 'utf8');

test('a playbook is a heading and a body, whatever the heading level', () => {
  const list = S.parse('# build\npnpm build\n\n### deploy\nonly from main\n\n#### notes\nshort');
  assert.deepEqual([...list.map((skill) => skill.name)], ['build', 'deploy', 'notes']);
  assert.equal(list[0].body, 'pnpm build');
  assert.equal(list[1].name, 'deploy');
});

test('junk does not become a playbook', () => {
  assert.equal(S.parse('').length, 0);
  assert.equal(S.parse('just a sentence with no heading').length, 0);
  assert.equal(S.parse('# empty\n\n# also empty\n').length, 0);
});

test('the list is bounded so a paste cannot fill the prompt', () => {
  const many = Array.from({ length: 30 }, (_, i) => `## skill${i}\nbody`).join('\n\n');
  assert.equal(S.parse(many).length, S.LIMITS.skills);
  const long = `## long\n${'x'.repeat(9000)}`;
  assert.equal(S.parse(long)[0].body.length, 9000, 'parsing keeps the text; the clip happens on open');
});

test('the model sees names, and opens a body on demand', () => {
  const list = S.parse('## build\npnpm build\n\n## deploy\nnow deploy');
  const line = S.promptLine(list);
  assert.match(line, /build, deploy/);
  assert.doesNotMatch(line, /pnpm build/, 'bodies are not in the prompt');
  assert.match(line, /read_skill/);
  assert.equal(S.promptLine([]), null, 'no skills, no line');

  assert.equal(S.find(list, 'build').body, 'pnpm build');
  assert.equal(S.find(list, 'DEPLOY').name, 'deploy', 'case does not matter');
  assert.equal(S.find(list, 'dep').name, 'deploy', 'a prefix is enough');
  assert.equal(S.find(list, 'nope'), null);
});

test('the loop answers read_skill locally, and names what exists', () => {
  assert.match(agent, /if \(tool === 'read_skill'\)/);
  assert.match(agent, /no skill called/);
  assert.match(agent, /Available: \$\{list\.join\(', '\)\}/);
  assert.match(agent, /the user has not written any skills yet/);
  assert.match(tools, /name: 'read_skill'[\s\S]{0,200}local: true/, 'declared to the model, executed in the browser');
});

test('the popup edits playbooks without a file path in sight', () => {
  assert.match(html, /id="skills"/);
  assert.match(html, /one `## name` per playbook/);
  assert.match(main, /case 'mdh:get-skills'/);
  assert.match(main, /case 'mdh:set-skills'/);
  const state = readFileSync(join(ROOT, 'src/core/state.js'), 'utf8');
  assert.match(state, /skills: \[\]/);
});

test('a prompt with skills still respects the budget rule for the first message', () => {
  const list = S.parse('## build\npnpm build');
  const text = MDH.prompt.renderPrompt({ tools: [], phoenix: 'PHX-ABC234', skills: list });
  assert.match(text, /Skills the user has written: build/);
  assert.match(text, /Completion code/);
  assert.ok(text.length < MDH.prompt.BUDGET_CHARS * 2, 'the names cost a line, not a section');
});
