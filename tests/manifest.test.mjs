/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const base = JSON.parse(readFileSync(join(ROOT, 'src/manifest.base.json'), 'utf8'));
const firefox = JSON.parse(readFileSync(join(ROOT, 'src/overlays/firefox.json'), 'utf8'));
const chrome = JSON.parse(readFileSync(join(ROOT, 'src/overlays/chrome.json'), 'utf8'));

const PLATFORMS = [
  'chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com',
  'kimi.com', 'chat.qwen.ai', 'chat.z.ai', 'grok.com',
];

test('the manifest covers exactly the eight promised platforms', () => {
  const hosts = base.host_permissions.join(' ');
  for (const platform of PLATFORMS) assert.ok(hosts.includes(platform), `missing ${platform}`);
});

test('no remote code, no insecure origin, no third-party notice endpoint', () => {
  const json = JSON.stringify(base);
  assert.doesNotMatch(json, /http:\/\//);
  assert.doesNotMatch(json, /raw\.githubusercontent|unpkg|cdn\./);
});

test('the interceptor is MAIN-world and the loop is isolated', () => {
  const main = base.content_scripts.find((c) => c.js.includes('content/injected.js'));
  const iso = base.content_scripts.find((c) => c.js.includes('content/main.js'));
  assert.equal(main.world, 'MAIN');
  assert.equal(main.run_at, 'document_start');
  assert.equal(iso.world, 'ISOLATED');
  assert.deepEqual(main.matches, iso.matches);
});

test('every content script file actually exists', () => {
  const iso = base.content_scripts.find((c) => c.js.includes('content/main.js'));
  for (const file of iso.js) assert.ok(existsSync(join(ROOT, 'src', file)), `missing src/${file}`);
  for (const file of base.content_scripts[0].js) assert.ok(existsSync(join(ROOT, 'src', file)), `missing src/${file}`);
  assert.ok(existsSync(join(ROOT, 'src', base.background.service_worker)));
});

test('the module order is dependency-safe', () => {
  const js = base.content_scripts.find((c) => c.js.includes('content/main.js')).js;
  const at = (name) => js.findIndex((f) => f.includes(name));
  assert.ok(at('compat.js') === 0, 'compat must load first');
  assert.ok(at('platforms/base.js') < at('platforms/chatgpt.js'), 'base registry before adapters');
  assert.ok(at('core/interceptor.js') < at('core/agent.js'));
  assert.ok(at('content/main.js') === js.length - 1, 'main.js must be last');
});

test('firefox artifact is an event page with a gecko id and no service worker', () => {
  assert.deepEqual(firefox.background.scripts, ['shared/compat.js', 'background/background.js']);
  assert.equal(firefox.browser_specific_settings.gecko.id, 'mdh@mdhojayfa.dev');
  assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
});

test('chromium artifact pins the extension key', () => {
  assert.ok(chrome.key.length > 300);
  assert.equal(chrome.minimum_chrome_version, '116');
});

test('the pinned key derives a stable id', () => {
  const der = Buffer.from(chrome.key, 'base64');
  const hex = createHash('sha256').update(der).digest('hex').slice(0, 32);
  const id = hex.replace(/[0-9a-f]/g, (c) => 'abcdefghijklmnop'[parseInt(c, 16)]);
  assert.equal(id, 'oegdcjbfbcjpogbplakppjddiojflepk');
});

test('the author credit is present in the manifest', () => {
  assert.equal(base.author, 'MDHojayfa');
  assert.match(base.homepage_url, /mdhojayfa\.github\.io/);
});

test('every script the popup loads exists, in the order the code needs', () => {
  const html = readFileSync(join(ROOT, 'src/popup/popup.html'), 'utf8');
  const sources = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.ok(sources.length >= 4, 'the popup should load compat, log, fun, report, popup');
  for (const src of sources) {
    assert.ok(!src.startsWith('http'), `${src} is remote; the extension loads nothing from the network`);
    const path = join(ROOT, 'src/popup', src);
    assert.ok(existsSync(path), `${src} does not exist — a typo here is a blank popup`);
  }
  // report.js must load before popup.js, and fun.js before report.js: the pools are read at init.
  const order = sources.map((s) => s.split('/').pop());
  assert.ok(order.indexOf('report.js') < order.indexOf('popup.js'));
  assert.ok(order.indexOf('fun.js') < order.indexOf('report.js'));
});

test('the help desk ships in the content-script list too, not just the popup', () => {
  const files = base.content_scripts.flatMap((entry) => entry.js);
  assert.ok(files.includes('core/report.js'), 'the in-page failure card needs the report module');
  assert.ok(files.indexOf('core/report.js') < files.indexOf('core/ui.js'), 'ui.js reads MDH.report');
  assert.ok(files.indexOf('core/fun.js') < files.indexOf('core/report.js'));
});
