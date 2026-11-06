/**
 * shared/compat.js — tiny surface that makes one codebase run in Chromium and Firefox.
 *
 * Loaded first, in both the background and every content script. No dependencies, no polyfill library:
 * the only real differences we need to paper over are (a) which global holds the extension API and
 * (b) callback-vs-promise style. Both engines give promises for `storage` and `runtime` on the versions
 * we support (Chrome 116+, Firefox 140+), so this file is deliberately small.
 */
(() => {
  'use strict';

  /** @type {any} */
  const g = globalThis;
  const ns = (g.MDH = g.MDH || {});

  ns.VERSION = '1.0.0';
  ns.HOME = 'https://mdhojayfa.github.io/';
  ns.HOST_NAME = 'dev.mdhojayfa.mdh';
  ns.GECKO_ID = 'mdh@mdhojayfa.dev';

  // Firefox exposes `browser`; Chromium exposes `chrome` and (from 148) also `browser`.
  ns.api = g.browser && g.browser.runtime ? g.browser : g.chrome;

  ns.util = {
    now: () => Date.now(),

    sleep: (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))),

    clamp: (n, lo, hi) => Math.min(hi, Math.max(lo, n)),

    /**
     * Deterministic 32-bit hash of a string, hex-encoded. Used for the call-dedup key and the tool
     * signature — never for anything security related (that is the host's job).
     */
    hash(str) {
      let h1 = 0xdeadbeef;
      let h2 = 0x41c6ce57;
      for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return (((h2 >>> 0) * 4294967296 + (h1 >>> 0)) >>> 0).toString(16).padStart(8, '0').slice(-8);
    },

    uuid: () =>
      g.crypto && g.crypto.randomUUID
        ? g.crypto.randomUUID()
        : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`,

    /** `mm:ss`, the shape every countdown in this product uses. */
    clock(ms) {
      const total = Math.max(0, Math.round(ms / 1000));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    },

    truncate(text, max, marker = '\n[…truncated]') {
      const s = String(text ?? '');
      if (s.length <= max) return s;
      return s.slice(0, Math.max(0, max - marker.length)) + marker;
    },
  };

  /** Namespaced logger; see core/log.js for the sink. */
  ns.scoped = (name) => (...args) => {
    if (ns.log && ns.log.enabled) ns.log.debug(`[${name}]`, ...args);
  };
})();
