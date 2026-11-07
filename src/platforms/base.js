/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
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

  /**
   * How much text the composer will take in one message.
   *
   * Not documented by any of the platforms, and not the binding constraint anyway: a 60 KB message is accepted and
   * then the *conversation* refuses the turn after it. 6,000 is the number that keeps a long result from turning
   * into a dead chat, and an adapter that measures something better can say so.
   */
  const DEFAULT_LIMITS = { maxChars: 6000 };

  /**
   * The sentences a platform uses when it will not take another message in this conversation.
   *
   * Measured, not invented: ChatGPT's is "You've reached the maximum length for this conversation, but you can keep
   * talking by starting a new chat", and the older wording — "This conversation is too long, please start a new
   * one" — is still in circulation. Claude compacts and carries on, so it rarely appears there; the patterns cover
   * the family of wording rather than one site's string.
   *
   * Deliberately strict: "you could start a new chat" is something a model says in prose, and treating that as an
   * error would move a working run out of its conversation for no reason.
   */
  const EXHAUSTED = [
    /maximum length for this conversation/i,
    /(this )?conversation is too long/i,
    /context (window|length) (is )?(full|reached|exceeded)/i,
    /(chat )?memory (is )?full/i,
    /you('ve| have) reached the (maximum|context) (length|limit)/i,
  ];

  /** Pure, so the test can feed it the strings instead of a browser. */
  const looksExhausted = (text) => {
    const value = String(text ?? '');
    if (!value) return false;
    return EXHAUSTED.some((pattern) => pattern.test(value));
  };

  const list = [];

  MDH.platforms = {
    looksExhausted,
    list,
    util: { pick, pickString, deepStrings },

    register(adapter) {
      if (!adapter.limits) adapter.limits = DEFAULT_LIMITS;
      if (!adapter?.id || !adapter?.host) throw new Error('adapter needs an id and a host pattern');
      const existing = list.findIndex((a) => a.id === adapter.id);
      if (existing >= 0) list[existing] = adapter;
      else list.push(adapter);
      MDH.log?.debug('adapter registered', adapter.id);
    },

    match(hostname = location.hostname, pathname = location.pathname) {
      return list.find((a) => (a.match ? a.match(hostname, pathname) : a.host.test(hostname))) ?? null;
    },

    /**
     * Is this page refusing the conversation? Reads visible text, capped, so a 40-message thread does not cost a
     * full parse every turn. `body.innerText` is not in a `vm` test, which is why the patterns are tested directly.
     */
    exhausted(adapter) {
      if (!adapter) return false;
      const node = document.body;
      const text = String(node?.innerText ?? node?.textContent ?? '');
      return looksExhausted(text.slice(-6000));
    },
  };
})();
