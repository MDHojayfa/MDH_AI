/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tests/credit.test.mjs — the name, in every file, checked rather than promised.
 *
 * `docs/PROVENANCE.md` says the author line is in 91 source files, in the built artifact, in the host handshake and
 * in the release zip. This file is what keeps that true after somebody edits one of them: it runs the same audit the
 * stamping tool runs, and it reads the source of the build and the packager rather than a stale `dist/`.
 *
 * The licence is MIT, so none of this prevents a fork. It prevents a *silent* one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { BANNER, fingerprint, audit } from '../tools/stamp.mjs';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const { groups, missing } = audit(ROOT);
const total = Object.values(groups).reduce((sum, files) => sum + files.length, 0);

test('every source file carries the author line, and the count is not a lie', () => {
  assert.equal(missing.length, 0, `missing from: ${missing.map((m) => m.file).join(', ')}`);
  assert.equal(total, 91, `the audit walks ${total} files; docs/PROVENANCE.md and NOTICE quote 91`);
  for (const kind of ['js', 'host', 'tools', 'tests', 'shell', 'html']) {
    assert.ok(groups[kind].length > 0, `${kind} is part of the audit`);
  }
  assert.equal(BANNER, '/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */');
  assert.match(fingerprint('1.0.0'), /^[0-9a-f]{12}$/);
  assert.notEqual(fingerprint('1.0.0'), fingerprint('1.0.1'), 'a different version is a different fingerprint');
});

test('the line is spelled the one way the rest of the repository spells it', () => {
  const notice = read('NOTICE');
  const credits = read('CREDITS.md');
  const licence = read('LICENSE');
  const readme = read('README.md');

  assert.equal(pkg.author, 'MDHojayfa');
  assert.match(licence, /Copyright \(c\) 2026 MDHojayfa/);
  for (const [name, text] of [['NOTICE', notice], ['CREDITS.md', credits], ['README.md', readme]]) {
    assert.match(text, /MDHojayfa/, `${name} names the author`);
    // The spelling a copy gets wrong first, and the one a welcome message once did.
    for (const wrong of ['MDHohayfa', 'MDHojayfaa', 'MDHojafa', 'Hojaifa']) {
      assert.ok(!text.includes(wrong), `${name} must not contain ${wrong}`);
    }
  }
});

test('the built artifact and the zip carry the name, in code that runs', () => {
  const build = read('tools/build.mjs');
  const packager = read('tools/package.mjs');
  const host = read('host/mdh-host.mjs');
  const iface = read('docs/INTERFACES.md');

  assert.match(build, /BANNER/, 'the build stamps what it emits');
  assert.match(build, /fingerprint/, 'and records the fingerprint');
  assert.match(packager, /makeZip\(files, new Date\(\), note\)/, 'the zip gets the comment');
  assert.match(packager, /fingerprint\(VERSION\)/);
  assert.match(host, /by: AUTHOR\.name/, 'the host says who it is in the pong');
  assert.match(iface, /t:'pong'.*by/, 'and the interface document says so');
});

test('stamping is idempotent, and checking never writes', () => {
  assert.match(pkg.scripts.stamp, /stamp\.mjs/);
  assert.match(pkg.scripts['stamp:check'], /--check/);
  assert.match(pkg.scripts.verify, /stamp\.mjs --check/, 'verify refuses a tree with a stripped banner');
  const stamp = read('tools/stamp.mjs');
  assert.match(stamp, /function audit\(/, 'the audit is a function, so the test can call the real one');
  assert.match(stamp, /if \(check\) \{/, 'and --check returns before it writes anything');
  assert.match(stamp, /^#!\/usr\/bin\/env node/, 'the tool keeps its shebang above the banner');
});
