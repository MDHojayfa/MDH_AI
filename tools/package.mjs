#!/usr/bin/env node
/**
 * tools/package.mjs — turn dist/ into the two files a store will actually accept.
 *
 *   node tools/package.mjs            → release/mdh-ai-chrome-1.0.0.zip
 *                                       release/mdh-ai-firefox-1.0.0.zip
 *
 * Why write a ZIP by hand instead of shelling out to `zip`?
 * The install story for this project is "node and nothing else". A release step that quietly requires
 * `zip`, `7z` or a Python wheel is a release step that fails on somebody's machine at the worst moment.
 * Deflate is already in `node:zlib`, the format is 40 years old, and the whole writer is under a hundred
 * lines — cheaper than a dependency, and readable by anyone who has ever wondered how a ZIP works.
 */
import { deflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'release');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

/* ────────────────────────────────────────────────────────────────── crc32 ── */
const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ──────────────────────────────────────────────────────────────────── walk ── */
function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, base, out);
    else out.push({ path: relative(base, full).split(sep).join('/'), data: readFileSync(full) });
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────── the zip ── */
function dosTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export function makeZip(files, when = new Date()) {
  const { time, day } = dosTime(when);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, 'utf8');
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), 'utf8');
    const packed = deflateRawSync(raw, { level: 9 });
    // Store uncompressed when deflate loses (tiny files, already-compressed PNGs): smaller and honest.
    const useStore = packed.length >= raw.length;
    const body = useStore ? raw : packed;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(useStore ? 0 : 8, 8); // method
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(useStore ? 0 : 8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

/* ─────────────────────────────────────────────────────────────────── main ── */
function packageTarget(target) {
  const dir = join(DIST, target);
  const files = walk(dir);
  if (!files.some((f) => f.path === 'manifest.json')) {
    throw new Error(`${dir} has no manifest.json — run \`npm run build\` first`);
  }
  const zip = makeZip(files);
  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, `mdh-ai-${target}-${VERSION}.zip`);
  writeFileSync(out, zip);
  const kb = (zip.length / 1024).toFixed(0);
  console.log(`✔ ${relative(ROOT, out)}  ${files.length} files · ${kb} KB`);
  return out;
}

/**
 * The packager has to be importable. `tests/package.test.mjs` imports `makeZip` to check the zip it writes, and
 * without this guard that import ran the whole build, tried to zip a `dist/` that a fresh clone does not have,
 * and set `exitCode = 1` — which failed the test file on CI while passing on any machine that had built once.
 * A CLI that cannot be imported is a CLI that is tested only by running it.
 */
function main() {
  const only = process.argv[2];
  const targets = only ? [only] : ['chrome', 'firefox'];
  for (const target of targets) {
    try {
      packageTarget(target);
    } catch (e) {
      console.error(`✖ ${target}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) {
    console.log('  upload chrome to the Web Store, firefox to addons.mozilla.org (or `web-ext sign`)');
  }
}

if (process.argv[1] && process.argv[1].endsWith('package.mjs')) main();
