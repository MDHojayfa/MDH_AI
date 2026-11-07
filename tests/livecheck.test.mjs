/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tests/livecheck.test.mjs — the parts of the real-browser check that can be checked here.
 *
 * `tools/live-check.mjs` exists because this sandbox has no browser: the driver is written so that a person with
 * Chrome can settle the question in one command. This file tests everything about it that does not need Chrome —
 * argument parsing, browser discovery, native-host manifest parsing, and the DevTools client's request/response
 * correlation — so the only thing left unproven is the browser itself, which is the point of the script.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cdp, evaluate, findBrowser, findHostManifest, hostDirs, parseArgs } from '../tools/live-check.mjs';

test('flags parse, and a flag nobody wrote is refused', () => {
  const options = parseArgs(['--page', 'https://chatgpt.com/', '--click', '--headless', '--timeout', '5000']);
  assert.equal(options.page, 'https://chatgpt.com/');
  assert.equal(options.click, true);
  assert.equal(options.headless, true);
  assert.equal(options.timeout, 5000);

  const plain = parseArgs([]);
  assert.equal(plain.dryRun, false);
  assert.equal(plain.keep, false);

  assert.throws(() => parseArgs(['--nope']), /unknown flag/);
  assert.throws(() => parseArgs(['--timeout', '10']), /at least 1000/);
  assert.throws(() => parseArgs(['--timeout', 'soon']), /at least 1000/);
});

test('browser discovery trusts an explicit path and refuses a missing one', () => {
  assert.equal(findBrowser('/bin/sh'), '/bin/sh');
  assert.equal(findBrowser('/nope/not-a-browser'), null);
});

test('each browser family is looked for in its own config directory', () => {
  const chrome = hostDirs('/usr/bin/google-chrome');
  const brave = hostDirs('/usr/bin/brave-browser');
  const chromium = hostDirs('/usr/bin/chromium');
  assert.equal(chrome.length, 1);
  assert.match(chrome[0], /google-chrome\/NativeMessagingHosts$/);
  assert.match(brave[0], /Brave-Browser\/NativeMessagingHosts$/);
  assert.match(chromium[0], /chromium\/NativeMessagingHosts$/);
  assert.ok(hostDirs('/usr/bin/unknown-browser').length >= 3, 'an unknown binary gets every path tried');
});

test('a native-host manifest is read, and a broken one is reported as broken', () => {
  const home = mkdtempSync(join(tmpdir(), 'mdh-home-'));
  const previous = process.env.HOME;
  process.env.HOME = home;
  try {
    const dir = join(home, '.config', 'google-chrome', 'NativeMessagingHosts');
    mkdirSync(dir, { recursive: true });

    assert.equal(findHostManifest('/usr/bin/google-chrome'), null, 'nothing installed yet is a null, not a throw');

    writeFileSync(join(dir, 'dev.mdhojayfa.mdh.json'), JSON.stringify({ name: 'dev.mdhojayfa.mdh', path: '/nope/host', allowed_origins: [] }));
    const broken = findHostManifest('/usr/bin/google-chrome');
    assert.equal(broken.file, join(dir, 'dev.mdhojayfa.mdh.json'));
    assert.equal(broken.pathExists, false, 'a manifest pointing at nothing is reported, not silently accepted');

    writeFileSync(join(dir, 'dev.mdhojayfa.mdh.json'), JSON.stringify({ name: 'dev.mdhojayfa.mdh', path: process.execPath }));
    assert.equal(findHostManifest('/usr/bin/google-chrome').pathExists, true);

    writeFileSync(join(dir, 'dev.mdhojayfa.mdh.json'), '{ not json');
    const invalid = findHostManifest('/usr/bin/google-chrome');
    assert.equal(invalid.parsed, null);
    assert.ok(invalid.error, 'and the parse error is kept for the report');
  } finally {
    process.env.HOME = previous;
  }
});

/** A WebSocket that answers from a table, so the client can be tested without a browser behind it. */
function fakeSocket(reply) {
  return class FakeSocket {
    constructor(url) {
      this.url = url;
      this.open = new Set();
      this.message = new Set();
      this.close = new Set();
      setTimeout(() => { for (const fn of this.open) fn({}); }, 0);
    }
    addEventListener(type, fn) {
      if (type === 'open') this.open.add(fn);
      if (type === 'message') this.message.add(fn);
      if (type === 'error') this.error = fn;
      if (type === 'close') this.close.add(fn);
    }
    send(data) {
      const request = JSON.parse(data);
      const answer = reply(request);
      if (!answer) return; // stay silent: the timeout path
      setTimeout(() => {
        for (const fn of this.message) fn({ data: JSON.stringify({ id: request.id, ...answer }) });
      }, 0);
    }
    close() {}
  };
}

test('the devtools client pairs answers with requests and gives up on silence', async () => {
  const original = globalThis.WebSocket;
  const seen = [];
  globalThis.WebSocket = fakeSocket((request) => {
    seen.push(request.method);
    if (request.method === 'Target.getTargets') return { result: { targetInfos: [{ type: 'service_worker', url: 'chrome-extension://x/background.js' }] } };
    if (request.method === 'Explode') return { error: { message: 'nope' } };
    return null; // Never answers: this is the hang a real driver must not have.
  });
  try {
    const client = await cdp('ws://example.test/devtools/browser/1', { timeout: 300 });
    const targets = await client.send('Target.getTargets');
    assert.equal(targets.targetInfos[0].type, 'service_worker');
    await assert.rejects(() => client.send('Explode'), /nope/);
    await assert.rejects(() => client.send('Silent'), /timed out after 300ms/);
    assert.deepEqual(seen, ['Target.getTargets', 'Explode', 'Silent']);
    client.close();
  } finally {
    globalThis.WebSocket = original;
  }
});

test('evaluation returns values and turns an exception into an error', async () => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = fakeSocket((request) => {
    if (request.method !== 'Runtime.evaluate') return null;
    if (request.params.expression === 'boom') return { result: { exceptionDetails: { text: 'boom went off' } } };
    return { result: { result: { value: 'v1.0.0' } } };
  });
  try {
    const client = await cdp('ws://example.test/devtools/browser/2', { timeout: 300 });
    const session = 'session-1';
    assert.equal(await evaluate(client, session, 'chrome.runtime.getManifest().version'), 'v1.0.0');
    await assert.rejects(() => evaluate(client, session, 'boom'), /boom went off/);
    client.close();
  } finally {
    globalThis.WebSocket = original;
  }
});

test('a screenshot is written from what the browser returned, and a silent browser is an error', async () => {
  const { mkdtempSync, readFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { saveScreenshot } = await import('../tools/live-check.mjs');

  const original = globalThis.WebSocket;
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  globalThis.WebSocket = fakeSocket((request) => {
    if (request.method !== 'Page.captureScreenshot') return null;
    if (request.params.format !== 'png') return { result: {} };
    return { result: { data: png.toString('base64') } };
  });
  try {
    const client = await cdp('ws://example.test/devtools/browser/3', { timeout: 300 });
    const dir = mkdtempSync(join(tmpdir(), 'mdh-shot-'));
    const file = join(dir, 'nested', 'chatgpt.com-pill.png');
    const written = await saveScreenshot(client, 'session-1', file);
    assert.equal(written, file);
    assert.ok(existsSync(file), 'the folder is created and the file written');
    assert.deepEqual(readFileSync(file), png, 'the bytes are what the browser sent, decoded');
    client.close();
  } finally {
    globalThis.WebSocket = original;
  }

  const silent = fakeSocket(() => ({ result: {} }));
  globalThis.WebSocket = silent;
  try {
    const client = await cdp('ws://example.test/devtools/browser/4', { timeout: 300 });
    const dir = mkdtempSync(join(tmpdir(), 'mdh-shot-'));
    await assert.rejects(() => saveScreenshot(client, 's', join(dir, 'none.png')), /no image data/);
    client.close();
  } finally {
    globalThis.WebSocket = original;
  }
});

test('--screenshot is a folder, and asking for one without a value is refused', () => {
  assert.equal(parseArgs(['--screenshot', '/tmp/shots']).screenshot, '/tmp/shots');
  assert.throws(() => parseArgs(['--screenshot']), /needs a folder/);
});
