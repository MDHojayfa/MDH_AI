#!/usr/bin/env node
/**
 * build.mjs — one source, two artifacts.
 *
 *   npm run build            → dist/chrome + dist/firefox
 *   npm run build -- chrome  → only dist/chrome
 *
 * The only real divergence between engines is the **background context**:
 *   Chromium: MV3 service worker            → background.service_worker
 *   Firefox : MV3 event page (no workers)   → background.scripts
 * Everything else (content scripts, popup, storage, alarms) is shared verbatim.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');

/** Files/dirs that must never ship in an artifact. */
const EXCLUDE = new Set([
  'dist', 'tools', 'tests', 'scripts', 'node_modules', '.git', '.github', 'server',
  'package.json', 'package-lock.json', 'README.md', 'SECURITY.md',
  'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'Dockerfile', '.gitignore',
]);

const GECKO_ID = 'mdh-ai@mdhojayfa.dev';
const STRICT_MIN = '140.0';   // 140+ : host_permissions granted at install + data_collection_permissions + world: MAIN

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (EXCLUDE.has(entry)) continue;
    const src = join(from, entry);
    const dst = join(to, entry);
    const stat = statSync(src);
    if (stat.isDirectory()) copyTree(src, dst);
    else cpSync(src, dst);
  }
}

/** Chrome artifact: identical to the source manifest. */
function chromeManifest(base) {
  const m = structuredClone(base);
  delete m.browser_specific_settings;
  return m;
}

/** Firefox artifact: event page instead of service worker, gecko id, no Chrome-only keys. */
function firefoxManifest(base) {
  const m = structuredClone(base);
  m.background = {
    scripts: ['shared/compat.js', 'background/background.js'],
    type: 'module',
  };
  m.browser_specific_settings = {
    gecko_android: { strict_min_version: '142.0' },
    gecko: {
      id: GECKO_ID,
      strict_min_version: STRICT_MIN,
      // Everything stays on the machine: no telemetry, no remote code, no data leaves the browser.
      data_collection_permissions: { required: ['none'] },
      // Firefox for Android only gained data_collection_permissions in 142.
      // (gecko_android lives next to gecko, added below)
    },
  };
  delete m.minimum_chrome_version;
  return m;
}

function emit(target, manifestFor) {
  const out = join(DIST, target);
  rmSync(out, { recursive: true, force: true });
  copyTree(ROOT, out);
  const manifest = manifestFor(JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')));
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`✔ dist/${target}  (${relative(ROOT, out)})`);
}

const only = process.argv[2];
mkdirSync(DIST, { recursive: true });
if (!only || only === 'chrome') emit('chrome', chromeManifest);
if (!only || only === 'firefox') emit('firefox', firefoxManifest);
