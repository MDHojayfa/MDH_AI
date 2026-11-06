import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guard, ToolError } from '../host/tools/linux.mjs';

const root = mkdtempSync(join(tmpdir(), 'mdh-test-'));
const safe = join(root, 'safe');
const secret = join(root, 'secret');
mkdirSync(safe);
mkdirSync(secret);
writeFileSync(join(safe, 'file.txt'), 'hello');
writeFileSync(join(secret, 'key.txt'), 'PRIVATE');

const cfg = { allowPaths: [safe], denyPaths: [secret] };

test('a path inside the allowlist resolves', () => {
  assert.equal(guard(join(safe, 'file.txt'), cfg, { mustExist: true }), join(safe, 'file.txt'));
});

test('a path outside the allowlist is refused', () => {
  assert.throws(() => guard(join(secret, 'key.txt'), cfg), (e) => e instanceof ToolError && e.code === 'PATH_DENIED');
  assert.throws(() => guard('/etc/passwd', cfg), (e) => e.code === 'PATH_DENIED');
});

test('traversal is resolved before the check', () => {
  assert.throws(() => guard(join(safe, '..', 'secret', 'key.txt'), cfg), (e) => e.code === 'PATH_DENIED');
});

test('a symlink pointing outside is refused', () => {
  const link = join(safe, 'sneaky');
  try {
    symlinkSync(join(secret, 'key.txt'), link);
  } catch {
    return; // filesystem without symlink support: nothing to assert
  }
  assert.throws(() => guard(link, cfg, { mustExist: true }), (e) => e.code === 'PATH_DENIED');
  rmSync(link, { force: true });
});

test('a missing path that would be created is still checked against the allowlist', () => {
  assert.equal(guard(join(safe, 'new/dir/file.txt'), cfg), join(safe, 'new/dir/file.txt'));
  assert.throws(() => guard(join(secret, 'new.txt'), cfg), (e) => e.code === 'PATH_DENIED');
});

test('an empty path is refused', () => {
  assert.throws(() => guard('', cfg), (e) => e.code === 'PATH_DENIED');
});

test.after(() => rmSync(root, { recursive: true, force: true }));
