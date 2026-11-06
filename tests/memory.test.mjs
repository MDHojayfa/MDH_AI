import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/phoenix.js', 'src/core/prompt.js']);
const prompt = MDH.prompt;
const agent = readFileSync(join(ROOT, 'src/core/agent.js'), 'utf8');
const main = readFileSync(join(ROOT, 'src/content/main.js'), 'utf8');
const popup = readFileSync(join(ROOT, 'src/popup/popup.js'), 'utf8');
const html = readFileSync(join(ROOT, 'src/popup/popup.html'), 'utf8');

test('notes from the user ride in every first prompt, quoted verbatim', () => {
  const text = prompt.renderPrompt({ tools: [], phoenix: 'PHX-ABC234', memory: 'I use pnpm, not npm.' });
  assert.match(text, /# Notes from the user/);
  assert.match(text, /I use pnpm, not npm\./);
});

test('without notes, the prompt does not grow an empty section', () => {
  const text = prompt.renderPrompt({ tools: [], phoenix: 'PHX-ABC234', memory: '   ' });
  assert.doesNotMatch(text, /# Notes from the user/);
});

test('the notes are bounded, so the prompt cannot become a diary', () => {
  const long = 'x'.repeat(5000);
  const text = prompt.renderPrompt({ tools: [], memory: long });
  const section = text.slice(text.indexOf('# Notes from the user'));
  assert.ok(section.includes('x'.repeat(prompt.MEMORY_LIMIT)));
  assert.ok(!section.includes('x'.repeat(prompt.MEMORY_LIMIT + 1)), 'clipped at the limit, not padded');
  assert.equal(prompt.MEMORY_LIMIT, 1200);
});

test('the notes survive a popup that closes without a save button', () => {
  assert.match(html, /id="memory"/);
  assert.match(popup, /addEventListener\('blur', saveMemory\)/, 'saved on blur, not on a button nobody presses');
  assert.match(popup, /mdh:set-memory/);
  assert.match(main, /case 'mdh:set-memory'/);
  assert.match(main, /case 'mdh:get-memory'/);
  assert.match(agent, /MDH\.state\.get\('memory'\)/);
});

test('the notes are local, and the UI says so', () => {
  assert.match(html, /saved locally, sent with each new run/);
  const state = readFileSync(join(ROOT, 'src/core/state.js'), 'utf8');
  assert.match(state, /memory: ''/, 'one string, no file, no sync');
});
