/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/phoenix.js', 'src/core/skills.js', 'src/core/prompt.js']);
const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
const ui = readFileSync(join(ROOT, 'src/core/ui.js'), 'utf8');
const html = readFileSync(join(ROOT, 'src/popup/popup.html'), 'utf8');
const tools = readFileSync(join(ROOT, 'host/tools/linux.mjs'), 'utf8');
const state = readFileSync(join(ROOT, 'src/core/state.js'), 'utf8');

test('plan mode is a rule in the prompt, not a suggestion in the UI', () => {
  const text = MDH.prompt.renderPrompt({ tools: [], phoenix: 'PHX-ABC234', planMode: true });
  assert.match(text, /# Plan mode — read-only until the user agrees/);
  assert.match(text, /will be refused, and the refusal is not a bug/);
  assert.match(text, /propose_plan/);
  const off = MDH.prompt.renderPrompt({ tools: [], phoenix: 'PHX-ABC234', planMode: false });
  assert.doesNotMatch(off, /# Plan mode/);
});

test('the loop refuses everything that is not read-only, before the host is asked', () => {
  assert.match(agent, /if \(S\.planMode && !READ_ONLY_TOOLS\.has\(tool\)\)/);
  assert.match(agent, /\[PLAN MODE\]/);
  for (const safe of ['read_file', 'list_dir', 'search_files', 'file_info', 'sys_info', 'update_plan', 'propose_plan', 'read_skill']) {
    assert.ok(agent.includes(`'${safe}'`), `${safe} is on the read-only list`);
  }
  const refusal = agent.slice(agent.indexOf('if (S.planMode && !READ_ONLY_TOOLS'), agent.indexOf('const reply = await MDH.transport.callTool'));
  assert.doesNotMatch(refusal, /transport/, 'a refusal must not reach the machine');
});

test('approving the plan is the only way out of it', () => {
  assert.match(agent, /const approved = await MDH\.ui\.approvePlan/);
  assert.match(agent, /if \(approved\) \{\s*S\.planMode = false;/);
  assert.match(agent, /the user wants more planning/);
  assert.match(agent, /the user approved the plan/);
});

test('the card asks about a direction, not an action', () => {
  assert.match(ui, /function approvePlan\(/);
  assert.match(ui, /Approve and continue/);
  assert.match(ui, /Keep planning/);
  assert.match(ui, /Nothing has been changed yet/);
  assert.match(ui, /approvePlan,/);
});

test('it is a setting people keep, not a dialog they dismiss', () => {
  assert.match(html, /id="plan-first"/);
  assert.match(html, /read-only until I approve/);
  assert.match(state, /planFirst: false/);
  const block = tools.slice(tools.indexOf("name: 'propose_plan'"), tools.indexOf("name: 'propose_plan'") + 420);
  assert.match(block, /local: true/, 'declared to the model, decided in the browser');
});

test('local tools are declared to the model and never run by the host', async () => {
  const { builtinTools } = await import('../host/tools/linux.mjs');
  const local = builtinTools.filter((tool) => tool.local).map((tool) => tool.name);
  const host = builtinTools.filter((tool) => !tool.local).map((tool) => tool.name);
  for (const name of ['propose_plan', 'read_skill', 'finish', 'update_plan', 'ask_user']) {
    assert.ok(local.includes(name), `${name} is answered in the browser`);
    assert.ok(!host.includes(name), `${name} must not be offered to the host runner`);
  }
  for (const name of ['run_command', 'write_file', 'read_file', 'list_dir']) {
    assert.ok(host.includes(name), `${name} really runs on the machine`);
  }
});
