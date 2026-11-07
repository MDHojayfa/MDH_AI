#!/usr/bin/env node
/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tools/build.mjs — one source, two artifacts.
 *
 *   node tools/build.mjs            → dist/chrome + dist/firefox
 *   node tools/build.mjs chrome     → only dist/chrome
 *
 * The engines differ in exactly three places, all declared in src/overlays/*.json (a `null` value
 * deletes a key, which is how Firefox sheds Chromium-only fields). If a fourth difference appears, it
 * belongs in an overlay too — not in an `if (firefox)` scattered through the code:
 *
 *   background   Chromium: MV3 service worker   → background.service_worker
 *                Firefox : event page (no workers, bug 1573659) → background.scripts
 *   identity     Chromium: a pinned `key` → stable extension ID for the host manifest
 *                Firefox : browser_specific_settings.gecko.id
 *   chrome-only  minimum_chrome_version is stripped from the Firefox artifact
 *
 * Everything else — content scripts, the MAIN-world interceptor, popup, storage — is shared verbatim.
 * No bundler, no transpiler, no minifier: what ships is what you can read.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { BANNER, fingerprint } from './stamp.mjs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

/** Source-side things that are build inputs, not extension files. */
const NOT_SHIPPED = new Set(['manifest.base.json', 'overlays', 'extension-id.json']);

const TARGETS = ['chrome', 'firefox'];

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * Shallow-merge overlay onto a clone of base; overlay arrays/objects win wholesale.
 * A `null` value deletes the key — that is how an overlay removes a Chromium-only field.
 */
function merge(base, overlay) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(overlay)) {
    if (k.startsWith('_')) continue;
    if (v === null) delete out[k];
    else out[k] = structuredClone(v);
  }
  return out;
}

/** Every `.js` under a directory, in a stable order. */
function walkJs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkJs(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (NOT_SHIPPED.has(entry)) continue;
    const s = join(from, entry);
    const d = join(to, entry);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else cpSync(s, d);
  }
}

/** Extension ID from the pinned key: first 16 bytes of sha256(DER) mapped 0-f → a-p. */
export function extensionIdFromKey(keyB64) {
  const der = Buffer.from(keyB64, 'base64');
  const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
  return hex.replace(/[0-9a-f]/g, (c) => 'abcdefghijklmnop'[parseInt(c, 16)]);
}

/** Fail the build rather than ship a manifest we would not want to debug in the field. */
function verify(target, m) {
  const problems = [];
  const req = (cond, msg) => { if (!cond) problems.push(msg); };

  req(m.manifest_version === 3, 'manifest_version must be 3');
  req(m.author === 'MDHojayfa', 'author must be MDHojayfa');
  req(Array.isArray(m.permissions) && m.permissions.includes('nativeMessaging'), 'nativeMessaging permission missing');
  req(!JSON.stringify(m).includes('http://'), 'no insecure http:// origins allowed');
  req(!JSON.stringify(m).includes('raw.githubusercontent'), 'no remote code/notice origins allowed');

  const cs = m.content_scripts ?? [];
  const main = cs.find((c) => (c.js ?? []).includes('content/injected.js'));
  const isolated = cs.find((c) => (c.js ?? []).includes('content/main.js'));
  req(!!main && main.world === 'MAIN' && main.run_at === 'document_start',
    'the interceptor must be a MAIN-world content script at document_start');
  req(!!isolated && isolated.world === 'ISOLATED',
    'the loop must run in the ISOLATED world');
  req((isolated?.js ?? []).indexOf('content/injected.js') === -1,
    'injected.js must not be loaded in the isolated world');
  req((main?.js ?? []).length === 1, 'injected.js must be the only MAIN-world file');
  req((main?.matches ?? []).join() === (isolated?.matches ?? []).join(),
    'both content scripts must match the same 8 platform origins');

  if (target === 'firefox') {
    req(m.background?.scripts?.length === 2, 'firefox needs background.scripts (compat + background)');
    req(!('service_worker' in (m.background ?? {})), 'firefox must not declare background.service_worker');
    req(m.browser_specific_settings?.gecko?.id === 'mdh@mdhojayfa.dev', 'gecko id missing');
    req(m.browser_specific_settings.gecko.strict_min_version === '140.0', 'strict_min_version must be 140.0');
    req(m.browser_specific_settings.gecko.data_collection_permissions?.required?.[0] === 'none',
      'data_collection_permissions required: ["none"] (AMO mandate from 140)');
    req(!('minimum_chrome_version' in m), 'minimum_chrome_version is Chromium-only');
    req(!('key' in m), 'the store `key` is Chromium-only and Chrome rejects it on AMO-style review');
  }

  if (target === 'chrome') {
    req(m.background?.service_worker === 'background/background.js', 'chrome needs a service worker');
    req(!('browser_specific_settings' in m), 'Chrome rejects browser_specific_settings');
    req(typeof m.key === 'string' && m.key.length > 300, 'the pinned key must be present (stable extension ID)');
  }

  if (problems.length) {
    console.error(`✖ ${target}:`);
    for (const p of problems) console.error('   ·', p);
    process.exitCode = 1;
    return false;
  }
  return true;
}

function emit(target) {
  const base = readJson(join(SRC, 'manifest.base.json'));
  const overlayPath = join(SRC, 'overlays', `${target}.json`);
  const overlay = existsSync(overlayPath) ? readJson(overlayPath) : {};
  const manifest = merge(base, overlay);

  const out = join(DIST, target);
  rmSync(out, { recursive: true, force: true });
  copyTree(SRC, out);
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // The author line again, in the artifact rather than only in the source: a copy of `dist/` that gets renamed and
  // re-uploaded still says where it came from, in every file a reader would open first.
  let stamped = 0;
  for (const file of walkJs(out)) {
    const text = readFileSync(file, 'utf8');
    if (text.includes(BANNER)) continue;
    writeFileSync(file, `${BANNER}\n${text}`);
    stamped += 1;
  }

  if (stamped) console.log(`  ${target}: author line in ${stamped} emitted files · fingerprint ${fingerprint(manifest.version)}`);
  if (!verify(target, manifest)) return;
  const id = manifest.key ? extensionIdFromKey(manifest.key) : manifest.browser_specific_settings.gecko.id;
  console.log(`✔ dist/${target.padEnd(8)} id=${id}`);
}

/**
 * Run only when this file is the program. `tools/doctor.mjs` imports `extensionIdFromKey` from here, and without
 * the guard that import rebuilt `dist/` as a side effect — the same bug that made every CI run fail when the
 * packager did it (tools/package.mjs has the story).
 */
function main(argv) {
  const only = argv[0];
  for (const t of only ? [only] : TARGETS) {
    if (!TARGETS.includes(t)) {
      console.error(`unknown target: ${t} (expected ${TARGETS.join(' | ')})`);
      process.exitCode = 1;
      continue;
    }
    emit(t);
  }

  if (process.exitCode) process.exit(process.exitCode);
  const key = readJson(join(SRC, 'overlays', 'chrome.json')).key;
  console.log(`  chrome id: ${extensionIdFromKey(key)}   ← install.sh writes this into the host manifest`);
}

if (process.argv[1]?.endsWith('build.mjs')) main(process.argv.slice(2));
