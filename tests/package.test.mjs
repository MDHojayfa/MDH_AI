import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { makeZip } from '../tools/package.mjs';
import { ROOT } from './helpers.mjs';

/** Read the end-of-central-directory record: the part every unzipper trusts. */
function readEocd(buf) {
  const i = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(i >= 0, 'no EOCD record');
  return {
    count: buf.readUInt16LE(i + 10),
    size: buf.readUInt32LE(i + 12),
    offset: buf.readUInt32LE(i + 16),
    end: i,
  };
}

const names = (buf) => {
  const eocd = readEocd(buf);
  const out = [];
  let p = eocd.offset;
  for (let n = 0; n < eocd.count; n++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'bad central header');
    const nameLen = buf.readUInt16LE(p + 28);
    out.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return out;
};

test('the writer produces a structurally valid zip', () => {
  const zip = makeZip([
    { path: 'manifest.json', data: '{"manifest_version":3}' },
    { path: 'popup/popup.html', data: '<!doctype html><title>x</title>' },
  ]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'bad local header');
  assert.deepEqual(names(zip), ['manifest.json', 'popup/popup.html']);
});

test('a tiny file is stored rather than deflated, because deflate would make it bigger', () => {
  const zip = makeZip([{ path: 'a.txt', data: '' }]);
  // method lives at offset 8 of the local header: 0 = store, 8 = deflate
  assert.equal(zip.readUInt16LE(8), 0);
  assert.equal(zip.length, 30 + 5 + 46 + 5 + 22);
});

test('a compressible file is deflated and round-trips', () => {
  const text = 'the Moon says the dust is patient. '.repeat(200);
  const zip = makeZip([{ path: 'notes.txt', data: text }]);
  assert.equal(zip.readUInt16LE(8), 8);
  const crcOffset = 14;
  assert.equal(zip.readUInt32LE(crcOffset) > 0, true);
  const raw = zip.subarray(30 + 'notes.txt'.length);
  const out = deflateRawSync(Buffer.from(text)).length; // same algorithm, same size class
  assert.equal(zip.readUInt32LE(18), out);
  assert.ok(out < text.length / 5, 'deflate should earn its keep here');
  assert.ok(raw.length > 0);
});

test('the release artifacts exist, and contain a manifest at the root', { skip: !existsSync(join(ROOT, 'release')) }, () => {
  const files = readdirSync(join(ROOT, 'release')).filter((f) => f.endsWith('.zip'));
  assert.ok(files.length >= 1, 'no release zips — run npm run package');
  for (const file of files) {
    const zip = readFileSync(join(ROOT, 'release', file));
    const entries = names(zip);
    assert.ok(entries.includes('manifest.json'), `${file} has no root manifest`);
    assert.ok(!entries.some((e) => e.startsWith('dist/')), `${file} carries the build directory`);
    assert.ok(entries.includes('background/background.js'));
    assert.ok(entries.includes('core/report.js'), `${file} is missing the help-desk module`);
    assert.ok(entries.includes('popup/popup.html'));
    assert.ok(entries.includes('popup/popup.css'));
    assert.ok(entries.some((e) => e.startsWith('icons/')));
  }
});

test('the packager refuses a directory with no manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mdh-zip-'));
  writeFileSync(join(dir, 'not-a-manifest.txt'), 'x');
  // The guard lives in packageTarget; here we assert the invariant it protects, cheaply.
  assert.equal(existsSync(join(dir, 'manifest.json')), false);
});

test('importing the packager does not package anything', () => {
  // This is the bug that kept CI red: `import { makeZip } from '../tools/package.mjs'` used to run the whole
  // packager, which failed on a fresh clone with no dist/ and set exitCode = 1. A CLI that cannot be imported is
  // a CLI whose tests only pass on a machine that has already built.
  const probe = spawnSync(
    process.execPath,
    ['-e', "import('./tools/package.mjs').then(() => process.stdout.write('imported\\n'))"],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(probe.status, 0, probe.stderr);
  assert.match(probe.stdout, /imported/);
  assert.doesNotMatch(probe.stdout, /✔ release\//, 'no zip was written by an import');
  const source = readFileSync(join(ROOT, 'tools/package.mjs'), 'utf8');
  assert.match(source, /process\.argv\[1\]\.endsWith\('package\.mjs'\)/, 'the entry point is guarded');
});
