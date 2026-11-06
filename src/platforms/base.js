/**
 * platforms/base.js
 * The registry is deliberately tiny: `pick`, `pickString`, `deepStrings`. Selector lists change shape on
 * every redesign, so every lookup returns the first entry that resolves instead of assuming one.
 * — the registry and the only helpers an adapter is allowed to use.
 *
 * An adapter is **data**: a host pattern, a stream signature, four selector lists, pacing and timings.
 * If a platform ever needs logic beyond `extract()`, that is a signal the core is missing something —
 * not a licence to grow the adapter (docs/PLATFORMS.md §"Adding platform #9").
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;

  /** First defined value along a path like `v.response.fragments.0.content`. */
  function pick(obj, path) {
    let cur = obj;
    for (const part of String(path).split('.')) {
      if (cur == null) return undefined;
      cur = Array.isArray(cur) && /^\d+$/.test(part) ? cur[Number(part)] : cur[part];
    }
    return cur;
  }

  function pickString(obj, paths) {
    for (const path of paths) {
      const value = pick(obj, path);
      if (typeof value === 'string' && value) return value;
    }
    return '';
  }

  /** Concatenate every string found under a key, anywhere in a frame (last-resort extraction). */
  function deepStrings(obj, key, out = [], depth = 0) {
    if (depth > 8 || obj == null) return out;
    if (Array.isArray(obj)) {
      for (const item of obj) deepStrings(item, key, out, depth + 1);
      return out;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' && k === key) out.push(v);
        else deepStrings(v, key, out, depth + 1);
      }
    }
    return out;
  }

  const list = [];

  MDH.platforms = {
    list,
    util: { pick, pickString, deepStrings },

    register(adapter) {
      if (!adapter?.id || !adapter?.host) throw new Error('adapter needs an id and a host pattern');
      const existing = list.findIndex((a) => a.id === adapter.id);
      if (existing >= 0) list[existing] = adapter;
      else list.push(adapter);
      MDH.log?.debug('adapter registered', adapter.id);
    },

    match(hostname = location.hostname, pathname = location.pathname) {
      return list.find((a) => (a.match ? a.match(hostname, pathname) : a.host.test(hostname))) ?? null;
    },
  };
})();
