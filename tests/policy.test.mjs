/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCore } from './helpers.mjs';

const { MDH } = loadCore(['src/core/policy.js']);
const { policy } = MDH;

const basePolicy = {
  allowPaths: ['~/projects', '/tmp/mdh'],
  denyPaths: ['~/.ssh', '/etc/shadow'],
  approval: {
    read_file: 'allow',
    write_file: 'ask',
    run_command: 'ask',
    list_dir: 'allow',
  },
};

test('a path inside the allowlist is fine, outside is denied', () => {
  assert.equal(policy.check({ tool: 'read_file', arguments: { path: '~/projects/a.txt' } }, basePolicy).decision, 'allow');
  assert.equal(policy.check({ tool: 'read_file', arguments: { path: '/etc/passwd' } }, basePolicy).decision, 'deny');
  assert.equal(policy.check({ tool: 'read_file', arguments: { path: '~/Documents/x' } }, basePolicy).decision, 'deny');
});

test('traversal cannot climb out of the allowlist', () => {
  const out = policy.check({ tool: 'read_file', arguments: { path: '~/projects/../../.ssh/id_rsa' } }, basePolicy);
  assert.equal(out.decision, 'deny');
  assert.match(out.reason ?? '', /deny list|outside/);
});

test('the deny list wins over the allowlist', () => {
  const p = { ...basePolicy, allowPaths: ['~'], denyPaths: ['~/.ssh'] };
  assert.equal(policy.check({ tool: 'read_file', arguments: { path: '~/.ssh/id_ed25519' } }, p).decision, 'deny');
  assert.equal(policy.check({ tool: 'read_file', arguments: { path: '~/notes.md' } }, p).decision, 'allow');
});

test('a path that escapes above the root is refused rather than guessed', () => {
  assert.equal(policy.normalize('/../../etc/shadow'), null);
});

test('approval follows the policy, and unknown tools are never silently allowed', () => {
  assert.equal(policy.check({ tool: 'write_file', arguments: { path: '~/projects/a' } }, basePolicy).decision, 'ask');
  const unknown = policy.check({ tool: 'some_mcp_tool', arguments: {} }, basePolicy);
  assert.equal(unknown.decision, 'ask');
  assert.equal(unknown.rule, 'unknown-tool');
});

test('a command asks even when its policy says allow', () => {
  // Read-only tools can be pre-approved; a command can do anything, so it always stops at the card.
  const p = { ...basePolicy, approval: { ...basePolicy.approval, run_command: 'allow' } };
  const out = policy.check({ tool: 'run_command', arguments: { cmd: 'rm -rf ~/projects/x' } }, p);
  assert.equal(out.decision, 'ask');
  assert.equal(out.rule, 'command-requires-approval');
});

test('describe() reports the request, not the model prose', () => {
  const desc = policy.describe(
    { tool: 'run_command', arguments: { cmd: 'git status', cwd: '~/projects/app' } },
    basePolicy,
  );
  assert.equal(desc.command, 'git status');
  assert.deepEqual([...desc.paths], ['~/projects/app']);
  assert.equal(desc.verdict.decision, 'ask');
});

test('normalize collapses dot segments but preserves ~', () => {
  assert.equal(policy.normalize('~/projects/./a//b'), '~/projects/a/b');
  assert.equal(policy.normalize('/tmp/mdh/../mdh/x'), '/tmp/mdh/x');
  assert.equal(policy.normalize('~'), '~');
});
