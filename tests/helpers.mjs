/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tests/helpers.mjs — load the extension's classic scripts into a sandbox.
 *
 * The product ships plain scripts and a `globalThis.MDH` namespace (no bundler, D9/D22), so the tests use
 * the *same files the browser runs* inside a `vm` context with a fake storage and a fake page. That is
 * the point: there is no second copy of the logic to drift.
 *
 * A fake page, a fake storage and a real `vm`: the tests can call the exact functions the browser calls
 * without pretending to be a browser. It is the cheapest kind of honesty and it has caught three bugs.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function fakeStorage() {
  const map = new Map();
  return {
    map,
    local: {
      async get(key) {
        const keys = Array.isArray(key) ? key : [key];
        const out = {};
        for (const k of keys) if (map.has(k)) out[k] = map.get(k);
        return out;
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) map.set(k, v);
      },
      async remove(keys) {
        for (const k of Array.isArray(keys) ? keys : [keys]) map.delete(k);
      },
    },
  };
}

/**
 * @param {string[]} files paths relative to the repo root, in load order
 * @param {{hostname?: string, pathname?: string}} [page]
 */
export function loadExtension(files, page = {}) {
  const storage = fakeStorage();
  const listeners = [];
  const sandbox = {
    console: { debug() {}, info() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    TextEncoder,
    TextDecoder,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    crypto: { randomUUID: () => 'test-uuid' },
    // Browsers have these; a bare vm context does not. Forgetting them makes a passing module look broken.
    URL,
    URLSearchParams,
    encodeURIComponent,
    decodeURIComponent,
    navigator: {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', clipboard: { writeText: async () => {} } },
    location: { hostname: page.hostname ?? 'chatgpt.com', pathname: page.pathname ?? '/', origin: 'https://example.test' },
    document: {
      visibilityState: 'visible',
      documentElement: { append() {}, setAttribute() {} },
      querySelectorAll: () => [],
      addEventListener() {},
      getSelection: () => null,
      createElement: () => ({ style: {}, append() {}, attachShadow: () => ({ append() {}, getElementById: () => null }) }),
    },
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener: (fn) => listeners.push(fn) },
        sendMessage: async () => ({ ok: true }),
        connectNative: () => ({ onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, postMessage() {}, disconnect() {} }),
      },
      storage,
      tabs: { query: async () => [{ id: 1 }], sendMessage: (_id, _msg, cb) => cb?.({ ok: true }) },
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  for (const file of files) {
    const code = readFileSync(join(ROOT, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  return { MDH: sandbox.MDH, sandbox, storage };
}

/** The smallest useful subset: compat + log + the module under test. */
export function loadCore(extra, page) {
  return loadExtension(['src/shared/compat.js', 'src/core/log.js', ...extra], page);
}
