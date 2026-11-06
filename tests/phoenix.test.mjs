import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/phoenix.js']);
const phoenix = MDH.phoenix;
const source = readFileSync(join(ROOT, 'src/core/phoenix.js'), 'utf8');
const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'src/manifest.base.json'), 'utf8'));

test('the code is short, prefixed and free of characters people confuse', () => {
  const code = phoenix.make(() => 0.5);
  assert.match(code, /^PHX-[A-Z0-9]{6}$/);
  assert.doesNotMatch(code.replace('PHX', ''), /[ILO01]/, 'no I, L, O, 0 or 1 — they get mistyped');
  assert.equal(code.length, 10);
  assert.ok(phoenix.size() >= 8.8e8, 'enough codes that two sessions never collide by accident');
});

test('draws are deterministic when the random source is', () => {
  const zeros = phoenix.make(() => 0);
  assert.equal(zeros, `${phoenix.PREFIX}-${phoenix.ALPHABET[0].repeat(phoenix.LENGTH)}`);
  assert.equal(zeros, phoenix.make(() => 0), 'same source, same code — which is what makes it testable');
  assert.notEqual(phoenix.make(() => 0.1), phoenix.make(() => 0.9));
  assert.notEqual(phoenix.make(), phoenix.make(), 'and two real draws differ');
});

test('matching forgives case, dashes, spaces and sloppiness — but not being wrong', () => {
  const code = 'PHX-7KQ2MD';
  for (const variant of ['PHX-7KQ2MD', 'phx-7kq2md', '7KQ2MD', ' PHX 7KQ 2MD ', 'Phx7kq2md']) {
    assert.equal(phoenix.matches(variant, code), true, `should accept ${JSON.stringify(variant)}`);
  }
  for (const wrong of ['', null, undefined, 'PHX-000000', '7KQ2M', '7KQ2MDX', 'DONE', 'phoenix']) {
    assert.equal(phoenix.matches(wrong, code), false, `should reject ${JSON.stringify(wrong)}`);
  }
});

test('the prompt block states the code, the call and the consequence', () => {
  const block = phoenix.block('PHX-ABC234');
  assert.match(block, /PHX-ABC234/);
  assert.match(block, /"phoenix":"PHX-ABC234"/);
  assert.match(block, /rejected/i);
  assert.match(block, /prose does not end a task/i);
  assert.match(block, /```json/, 'the shape is shown as a code block, not described');
});

test('the rejection is a correction, not a sentence in the chat', () => {
  const note = phoenix.rejection('PHX-ABC234');
  assert.match(note, /^\[MDH_PHOENIX\]/);
  assert.match(note, /PHX-ABC234/);
  assert.match(note, /not finished/i);
  assert.match(note, /\[\/MDH_PHOENIX\]$/);
  assert.match(phoenix.banner('PHX-ABC234'), /PHX-ABC234/);
  assert.ok(phoenix.banner('PHX-ABC234').length < 120, 'the reminder has to stay cheap enough to repeat');
});

test('the module ships before the prompt and the loop that use it', () => {
  const files = manifest.content_scripts.flatMap((e) => e.js);
  assert.ok(files.includes('core/phoenix.js'));
  assert.ok(files.indexOf('core/phoenix.js') < files.indexOf('core/prompt.js'));
  assert.ok(files.indexOf('core/phoenix.js') < files.indexOf('core/agent.js'));
  assert.match(agent, /finishAccepts/);
  assert.match(agent, /MDH\.phoenix\?\.make/);
});

test('the loop cannot end without the code: it corrects, then pauses', () => {
  assert.match(source, /The task ends in exactly one way/, 'the rule is written where it is enforced');
  assert.match(agent, /phoenixMismatch/);
  assert.match(agent, /MDH\.phoenix\.rejection\(S\.phoenix\)/);
  assert.match(agent, /could not produce the completion code/);
  assert.match(agent, /allowFinish: true/, 'after two failures the human gets the last word');
  // and a wrong code must never reach the completion path
  const finishBlock = agent.slice(agent.indexOf("if (tool === 'finish')"), agent.indexOf("if (tool === 'finish')") + 1400);
  assert.match(finishBlock, /if \(!finishAccepts\(call\.arguments\)\)/);
});

test('the finish tool advertises the code, so the model is told twice', () => {
  const tools = readFileSync(join(ROOT, 'host/tools/linux.mjs'), 'utf8');
  const finish = tools.slice(tools.indexOf("name: 'finish'"), tools.indexOf("name: 'finish'") + 460);
  assert.match(finish, /phoenix/);
  assert.match(finish, /completion code/i);
});

test('the prompt carries the code into every reminder, not just the first message', () => {
  const prompt = readFileSync(join(ROOT, 'src/core/prompt.js'), 'utf8');
  assert.match(prompt, /function renderPrompt\(\{ tools = \[\], phoenix = null \}/);
  assert.ok(prompt.includes('phoenix = null'), 'the reminder accepts a code');
  assert.ok(prompt.includes('continuation(n = 1, { phoenix = null }'), 'so does the nudge');
  assert.match(prompt, /MDH\.phoenix\?\.call/, 'the reminder names the exact call, not just the idea');
});
