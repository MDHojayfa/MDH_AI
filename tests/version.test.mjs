/**
 * tests/version.test.mjs — one version string, in every place that shows it to somebody.
 *
 * A release is not a version number in package.json. It is the same number in the manifest a store reads, in the
 * host's `ping` reply that `install.sh` prints, in the log page's footer, and on the site. When two of those drift,
 * the bug report says "1.0.0" and the artifact is 1.0.1, and the first hour of every conversation about it is
 * spent establishing which one the user has.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('src/manifest.base.json'));

const versions = {
  'package.json': pkg.version,
  'src/manifest.base.json': manifest.version,
  'host/mdh-host.mjs': read('host/mdh-host.mjs').match(/const VERSION = '([^']+)'/)?.[1],
  'host/mdh-log.mjs': read('host/mdh-log.mjs').match(/const VERSION = '([^']+)'/)?.[1],
  'host/diag.mjs': read('host/diag.mjs').match(/HOST_VERSION = '([^']+)'/)?.[1],
  'host/mcp_client.mjs': read('host/mcp_client.mjs').match(/clientInfo: \{ name: 'mdh-host', version: '([^']+)' \}/)?.[1],
  'site/index.html': read('site/index.html').match(/"softwareVersion":\s*"([^"]+)"/)?.[1],
};

test('every place that names the version names the same version', () => {
  for (const [file, value] of Object.entries(versions)) {
    assert.ok(value, `${file} has a version string`);
    assert.equal(value, pkg.version, `${file} says ${value}, package.json says ${pkg.version}`);
  }
});

test('the version looks like semver, because the release checklist assumes it does', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});

test('the changelog has a section for the version being shipped', () => {
  const changelog = read('CHANGELOG.md');
  assert.match(changelog, new RegExp(`## \\[${pkg.version.replace(/\./g, '\\.')}\\]`), 'the current version is in the changelog');
});

test('the release notes name the artifacts the packager actually writes', () => {
  const release = read('docs/RELEASE.md');
  for (const target of ['chrome', 'firefox']) {
    assert.ok(
      release.includes(`mdh-ai-${target}-`) || release.includes(`mdh-ai-{chrome,firefox}`),
      `RELEASE.md mentions the ${target} zip`,
    );
  }
});
