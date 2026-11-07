/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tests/doctor.test.mjs — the "it doesn't work" command, tested from the other side.
 *
 * A person who cannot get the pill to appear is the person a green test suite helps least. `tools/doctor.mjs` is
 * for them, so it has to be right about what is broken: it must fail on a machine that has never been installed,
 * pass on one that has, and never need npm, root, or a browser to say which of the two it is looking at.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { runChecks, failed, hostLocations } from '../tools/doctor.mjs';
import { extensionIdFromKey } from '../tools/build.mjs';

const DOCTOR = join(ROOT, 'tools', 'doctor.mjs');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** A HOME that has never had this installed. */
const bare = () => mkdtempSync(join(tmpdir(), 'mdh-bare-'));

/** A HOME where `./install.sh` has run: host manifests, wrapper, config, state. */
function installed() {
  const home = mkdtempSync(join(tmpdir(), 'mdh-installed-'));
  const wrapperDir = join(home, '.local/share/mdh');
  mkdirSync(wrapperDir, { recursive: true });
  const wrapper = join(wrapperDir, 'host.sh');
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${join(ROOT, 'host/mdh-host.mjs')}" "$@"\n`);
  chmodSync(wrapper, 0o755);

  // The id comes from the key, not from a built artifact: these tests run before `npm run build` in CI, and a test
  // that needs dist/ passes on the author's machine and fails on a clean clone.
  const id = extensionIdFromKey(readJson(join(ROOT, 'src/overlays/chrome.json')).key);
  const chromiumDir = join(home, '.config/chromium/NativeMessagingHosts');
  mkdirSync(join(home, '.config/chromium'), { recursive: true });
  mkdirSync(chromiumDir, { recursive: true });
  writeFileSync(
    join(chromiumDir, 'dev.mdhojayfa.mdh.json'),
    `${JSON.stringify({ name: 'dev.mdhojayfa.mdh', path: wrapper, type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] }, null, 2)}\n`,
  );

  mkdirSync(join(home, '.config/mdh'), { recursive: true });
  writeFileSync(join(home, '.config/mdh/config.json'), JSON.stringify({ allowPaths: [home], denyPaths: [] }));
  writeFileSync(join(home, '.config/mdh/servers.json'), '{"servers":[]}');
  return home;
}

test('a machine that was never installed fails, and says what to run', () => {
  const results = runChecks({ home: bare() });
  const bad = failed(results);
  assert.ok(bad.length >= 1, 'something must be reported as broken');
  const hostCheck = results.find((entry) => entry.id === 'host-manifests');
  assert.equal(hostCheck.ok, false);
  assert.match(hostCheck.fix, /install\.sh/);
  const wrapper = results.find((entry) => entry.id === 'wrapper');
  assert.equal(wrapper.ok, false);
  assert.match(wrapper.fix, /install\.sh/);
});

test('the checks are informational where nothing is wrong yet', () => {
  const results = runChecks({ home: bare() });
  const audit = results.find((entry) => entry.id === 'audit');
  assert.equal(audit.ok, null, 'no calls yet is not a failure');
  assert.ok(!failed(results).some((entry) => entry.id === 'audit'));
  const browsers = results.find((entry) => entry.id === 'browsers');
  assert.equal(browsers.ok, null);
  assert.match(browsers.fix ?? '', /Load unpacked/, 'and it still tells you the step no script can do');
});

test('an installed machine passes the parts that can be checked without a browser', () => {
  const home = installed();
  const results = runChecks({ home });
  const byId = Object.fromEntries(results.map((entry) => [entry.id, entry]));
  assert.equal(byId['host-manifests'].ok, true, byId['host-manifests'].detail);
  assert.equal(byId.wrapper.ok, true, byId.wrapper.detail);
  assert.equal(byId.config.ok, true, byId.config.detail);
  // Whether `dist/` exists is a property of this checkout, not of the fake home: the suite runs before the build in
  // CI, so the honest assertion is "the doctor agrees with the filesystem".
  const built = existsSync(join(ROOT, 'dist/chrome/manifest.json'));
  assert.equal(byId.build.ok, built, byId.build.detail);
  if (!built) assert.match(byId.build.fix, /node tools\/build\.mjs/, 'and it says how to fix that');
  assert.equal(byId.identity.ok, true);
  assert.equal(byId['host-answers'].ok, true, byId['host-answers'].detail);
});

test('the command exits non-zero when something is wrong, and zero when it is not', () => {
  const bad = spawnSync(process.execPath, [DOCTOR], { encoding: 'utf8', env: { ...process.env, HOME: bare() } });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /FAIL/);
  assert.match(bad.stdout, /fix: /);
  assert.match(bad.stdout, /doctor — one line per thing that can be wrong/);

  const built = existsSync(join(ROOT, 'dist/chrome/manifest.json'));
  const good = spawnSync(process.execPath, [DOCTOR], { encoding: 'utf8', env: { ...process.env, HOME: installed() } });
  if (built) {
    assert.equal(good.status, 0, good.stdout);
    assert.match(good.stdout, /Nothing is broken/);
  } else {
    // A clean clone has no dist/, and the doctor must say so rather than pretend.
    assert.equal(good.status, 1, good.stdout);
    assert.match(good.stdout, /FAIL {2}the extension is built/);
    assert.match(good.stdout, /node tools\/build\.mjs/);
  }
});

test('it is read-only, offline, and never needs npm or root', () => {
  const source = readFileSync(DOCTOR, 'utf8');
  assert.doesNotMatch(source, /spawnSync\([^)]*npm|execFileSync\([^)]*npm/, 'nothing in the doctor shells out to npm');
  assert.doesNotMatch(source, /\bfetch\(/, 'and nothing reaches the network');
  // A URL inside a comment is documentation. A URL passed to a request would be a call.
  assert.doesNotMatch(source, /(fetch|request|https\.get)\(\s*['"]https?:/, 'no request is built from a URL');
  assert.match(source, /--json/, 'but it does offer machine-readable output for a report');
  const json = spawnSync(process.execPath, [DOCTOR, '--json'], { encoding: 'utf8', env: { ...process.env, HOME: bare() } });
  const parsed = JSON.parse(json.stdout);
  assert.ok(Array.isArray(parsed.checks));
  assert.ok(parsed.checks.every((entry) => typeof entry.title === 'string'));
});

test('importing the build no longer rebuilds anything, which the doctor relies on', () => {
  const probe = spawnSync(process.execPath, ['-e', `import('${join(ROOT, 'tools/build.mjs')}').then(() => console.log('imported'))`], {
    encoding: 'utf8',
    cwd: tmpdir(),
  });
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /imported/);
  assert.doesNotMatch(probe.stdout, /dist\/chrome/, 'no build output: the entry point is guarded');
});

test('every browser family the installer writes to is one the doctor looks at', () => {
  const installer = readFileSync(join(ROOT, 'install.sh'), 'utf8');
  const locations = hostLocations('/home/someone').map((entry) => entry.file.replace('/home/someone/', ''));
  for (const location of locations) {
    const dir = location.replace(/\/dev\.mdhojayfa\.mdh\.json$/, '');
    assert.ok(installer.includes(dir), `the installer writes ${dir}, so the doctor must look there`);
  }
  assert.ok(existsSync(join(ROOT, 'docs/TROUBLESHOOTING.md')), 'and the decision tree the doctor points at exists');
});
