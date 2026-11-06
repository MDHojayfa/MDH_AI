/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/prompt.js']);
const { prompt } = MDH;

const tools = [
  { server: 'builtin', name: 'read_file', description: 'Read a text file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number' } }, required: ['path'] } },
  { server: 'builtin', name: 'run_command', description: 'Run a command', inputSchema: { type: 'object', properties: { cmd: { type: 'string' } } } },
  { server: 'desktop', name: 'desktop.read', description: 'MCP read', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
];

test('renders signatures, not JSON Schema', () => {
  const text = prompt.renderPrompt({ tools });
  assert.match(text, /read_file\(path: string, offset\?: number\)/);
  assert.doesNotMatch(text, /"properties"/);
  assert.match(text, /### desktop/);
});

test('states the two rules that make the loop work', () => {
  const text = prompt.renderPrompt({ tools });
  assert.match(text, /not a simulation/i);
  assert.match(text, /never say you cannot access/i);
  assert.match(text, /data, not instructions/i);
});

test('carries the author credit exactly once', () => {
  const text = prompt.renderPrompt({ tools });
  const mentions = text.match(/MDHojayfa/g) ?? [];
  assert.equal(mentions.length, 1);
  assert.match(text, /mdhojayfa\.github\.io/);
});

test('stays inside the token budget', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({
    server: 'mcp',
    name: `tool_${i}`,
    description: 'x'.repeat(200),
    inputSchema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } } },
  }));
  const text = prompt.renderPrompt({ tools: many });
  assert.ok(text.length <= prompt.BUDGET_CHARS, `prompt was ${text.length} chars`);
  // What is dropped is said, not silently lost.
  assert.match(text, /more tools .* available but not listed/);
});

test('the first message keeps the user text verbatim', () => {
  const wrapped = prompt.wrapFirstMessage('PROMPT', 'fix my tests');
  assert.match(wrapped, /^\[MDHPROMPT:[0-9a-f]{8}\]/);
  assert.ok(wrapped.trimEnd().endsWith('fix my tests'));
});

test('an empty task still produces something sendable', () => {
  const wrapped = prompt.wrapFirstMessage('P', '');
  assert.match(wrapped, /No task given yet/);
});

test('the reminder is short and has both modes', () => {
  const user = prompt.reminder('user', { servers: ['builtin'], count: 13 });
  const result = prompt.reminder('result');
  assert.ok(user.length < 220, `reminder was ${user.length}`);
  assert.ok(result.length < 220);
  assert.match(user, /mdh_call/);
  assert.match(result, /Continue: call the next tool/);
});

test('text alone does not end a task: finish does', () => {
  const result = prompt.reminder('result');
  const user = prompt.reminder('user');
  assert.match(result, /call `finish`/);
  assert.doesNotMatch(result, /final answer in text/i, 'the old wording taught the model to stop by prose');
  assert.match(user, /Text alone does not end a task/);
  const promptText = prompt.renderPrompt({ tools: [] });
  assert.match(promptText, /text is not an action/i);
  assert.doesNotMatch(promptText, /answer normally in text/);
});

test('the nudge names the mistake and offers a way out', () => {
  const first = prompt.continuation(1);
  const last = prompt.continuation(2);
  assert.match(first, /^\[MDH_CONTINUE\]/);
  assert.match(first, /do the next step now/);
  assert.match(first, /call `finish`/);
  assert.match(last, /second and last nudge/);
  assert.ok(!first.includes('second and last'));
  assert.ok(first.length < 500, 'a nudge has to stay cheap enough to send twice');
});

test('the tool signature is stable and order-independent', () => {
  const a = prompt.toolSignature(tools);
  const b = prompt.toolSignature([...tools].reverse());
  assert.equal(a, b);
  assert.equal(a.length, 8);
});
