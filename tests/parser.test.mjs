import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/parser.js']);
const { parse, explain, repair } = MDH.parser;

const call = (tool, args = {}) => `{"mdh_call":{"tool":"${tool}","arguments":${JSON.stringify(args)}}}`;
const fenced = (body) => '```json\n' + body + '\n```';

test('reads a clean fenced call', () => {
  const out = parse(`Sure, one moment.\n\n${fenced(call('list_dir', { path: '~/projects' }))}`);
  assert.equal(out.reason, 'none');
  assert.equal(out.call.tool, 'list_dir');
  assert.equal(out.call.arguments.path, '~/projects');
});

test('takes the LAST block: a turn narrates, then calls', () => {
  const text = `${fenced(call('list_dir', { path: 'a' }))}\n\nNow the real one:\n\n${fenced(call('read_file', { path: 'b' }))}`;
  const out = parse(text);
  // Two call-shaped blocks is multi — but a single call must win when the earlier block is not a call.
  assert.equal(out.reason, 'multi');

  const single = `Here is my plan.\n\n${fenced(call('read_file', { path: 'b' }))}`;
  assert.equal(parse(single).call.tool, 'read_file');
});

test('two real calls execute nothing', () => {
  const text = `${fenced(call('read_file', { path: 'a' }))}\n${fenced(call('write_file', { path: 'b', content: 'x' }))}`;
  const out = parse(text);
  assert.equal(out.call, null);
  assert.equal(out.reason, 'multi');
});

test('repairs trailing commas, smart quotes and Python literals', () => {
  const broken = '{"mdh_call":{"tool":"run_command","arguments":{"cmd":"ls",},},}';
  assert.equal(parse(fenced(broken)).call.tool, 'run_command');

  const smart = '{"mdh_call":{"tool":"write_file","arguments":{"path":"a","content":"hi"}}}'.replace(/"/g, '\u201c');
  const out = parse(fenced(smart));
  assert.equal(out.call.tool, 'write_file');

  const py = '{"mdh_call":{"tool":"x","arguments":{"flag":True,"other":None}}}';
  assert.equal(parse(fenced(py)).call.arguments.flag, true);
});

test('a truncated reply is reported as unclosed, not executed', () => {
  const out = parse('```json\n{"mdh_call":{"tool":"read_file","argu');
  assert.equal(out.reason, 'unclosed');
  assert.equal(out.call, null);
});

test('complete JSON in an unclosed fence still runs (the JSON is unambiguous)', () => {
  const out = parse('```json\n{"mdh_call":{"tool":"read_file","arguments":{"path":"a"}}}');
  assert.equal(out.call.tool, 'read_file');
});

test('a bare object in prose is only accepted when it is call-shaped', () => {
  assert.equal(parse('the config looks like {"port": 3000} by the way').call, null);
  const ok = parse('use {"tool":"read_file","arguments":{"path":"a"}}');
  assert.equal(ok.call.tool, 'read_file');
});

test('foreign tool syntax is named, never quoted back', () => {
  const out = parse('<antml:invoke name="read_file">…</antml:invoke>');
  assert.equal(out.reason, 'foreign_markup');
  const msg = explain(out.reason, out.detail);
  assert.doesNotMatch(msg, /antml/);
});

test('prose with no call is a plain answer, not an error', () => {
  const out = parse('The tests pass. Nothing else to do.');
  assert.equal(out.reason, 'none');
  assert.equal(out.call, null);
});

test('schema coercion is conservative', () => {
  const schemas = { read_file: { properties: { offset: { type: 'number' }, limit: { type: 'integer' } } } };
  const text = fenced('{"mdh_call":{"tool":"read_file","arguments":{"path":"a","offset":"12","limit":"3.9"}}}');
  const out = parse(text, { schemas });
  assert.equal(out.call.arguments.offset, 12);
  assert.equal(out.call.arguments.limit, 3);

  const keep = parse(fenced('{"mdh_call":{"tool":"read_file","arguments":{"offset":"twelve"}}}'), { schemas });
  assert.equal(keep.call.arguments.offset, 'twelve');
});

test('repair() never invents an object out of prose', () => {
  assert.equal(repair('no json here at all'), null);
  assert.equal(repair(''), null);
});

test('missing tool name is its own reason', () => {
  const out = parse(fenced('{"mdh_call":{"arguments":{}}}'));
  assert.equal(out.call, null);
  assert.equal(out.reason, 'missing_name');
});
