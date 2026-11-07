/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tests/continue.test.mjs — what happens when the chat itself runs out.
 *
 * ChatGPT stops accepting messages in a long conversation and says so on the page; Claude compacts and carries on.
 * For this product the ChatGPT behaviour is the interesting one: the agent is ten turns into a real task, and the
 * page it is talking to will not take the next message. Before this, that surfaced as a stall — "no reply arrived"
 * — which reads as the agent hanging rather than the conversation being full.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/platforms/base.js']);
const looksExhausted = MDH.platforms.looksExhausted;

test('the real strings a platform uses are recognised', () => {
  const real = [
    "You've reached the maximum length for this conversation, but you can keep talking by starting a new chat.",
    'This conversation is too long, please start a new one.',
    'Context window reached. Start a new chat to continue.',
    'Chat memory full',
  ];
  for (const text of real) assert.equal(looksExhausted(text), true, text);
});

test('a model suggesting a new chat is not an error', () => {
  const prose = [
    'If this keeps happening you could start a new chat and paste the summary.',
    'You might want to start a new conversation for the next task.',
    'Long conversations can be hard; consider a fresh chat.',
    '',
  ];
  for (const text of prose) assert.equal(looksExhausted(text), false, text);
});

test('every adapter knows where its own new chat is, on its own host', () => {
  const files = ['chatgpt', 'claude', 'deepseek', 'gemini', 'kimi', 'qwen', 'qwen-domestic', 'glm', 'grok'];
  for (const name of files) {
    const source = readFileSync(join(ROOT, 'src', 'platforms', `${name}.js`), 'utf8');
    const url = new URL(/newChat: '([^']+)'/.exec(source)?.[1] ?? 'about:blank');
    assert.equal(url.protocol, 'https:', `${name} continues over https`);

    // The URL has to be on a host the adapter already claims, or a continuation lands on somebody else's page.
    const hostPattern = (/host: (\/.*?\/),/.exec(source)?.[1] ?? '').replace(/\\/g, '');
    const bare = url.hostname.replace(/^www\./, '');
    assert.ok(hostPattern.includes(bare), `${name}: ${url.hostname} is not covered by ${hostPattern}`);
  }
});

test('the agent pauses with a reason the user can act on', () => {
  const agent = readFileSync(join(ROOT, 'src', 'core', 'agent.js'), 'utf8');
  assert.match(agent, /function contextFull\(\)/, 'detection is one function, called in both places');
  assert.match(agent, /pause\('context-full'/, 'a refusal pauses rather than stalls');
  assert.match(agent, /label: 'Continue in a new chat'/, 'and the card offers the fix, not just the diagnosis');
  assert.match(agent, /code: 'CONTEXT_FULL'/, 'delivery distinguishes a full chat from a broken composer');
});

test('continuing parks the brief, and the new page picks it up once', () => {
  const agent = readFileSync(join(ROOT, 'src', 'core', 'agent.js'), 'utf8');
  const main = readFileSync(join(ROOT, 'src', 'content', 'main.js'), 'utf8');

  assert.match(agent, /await MDH\.state\.patch\('kickoff'/, 'the brief is parked in storage, not in a variable');
  assert.match(agent, /location\.assign\(url\)/, 'then the page moves to the new chat');
  assert.match(agent, /const text = handoffText\(/, 'and the brief is the handoff the prompt module already writes');

  assert.match(main, /async function maybeContinue\(\)/, 'the new page looks for it');
  assert.match(main, /parked\.platform !== adapter\?\.id/, 'only on the platform it was parked for');
  assert.match(main, /await MDH\.state\.patch\('kickoff', null\)/, 'and consumes it whether or not it runs');
  assert.match(main, /age < 15 \* 60 \* 1000/, 'a stale brief is dropped rather than fired at a stranger');
  assert.match(main, /MDH\.agent\.start\(parked\.text, adapter\)/, 'the continuation is a normal run with a different starting message');
});

test('the handoff a parked run carries has the things a new chat cannot guess', () => {
  const prompt = readFileSync(join(ROOT, 'src', 'core', 'prompt.js'), 'utf8');
  const handoff = prompt.slice(prompt.indexOf('function handoff('), prompt.indexOf('function handoff(') + 2000);
  for (const field of ['task', 'plan', 'results', 'next', 'phoenix']) {
    assert.ok(handoff.includes(field), `the brief carries ${field}`);
  }
});
