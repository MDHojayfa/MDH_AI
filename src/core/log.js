/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * core/log.js — one ring buffer, one console.
 *
 * Everything the loop decides is worth being able to see after the fact: a user's bug report is only
 * useful if it can name a stage (`docs/INTERFACES.md` §3). The buffer is small on purpose — it lives
 * in the content script, is never persisted, and is exposed to the popup on request.
 *
 * Logs are a letter to the version of you who opens this at 2 a.m. Write for that person; they are tired.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const MAX = 200;

  const entries = [];
  let enabled = true;

  const push = (level, args) => {
    const text = args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
    entries.push({ at: Date.now(), level, text: MDH.util.truncate(text, 400) });
    if (entries.length > MAX) entries.shift();
  };

  MDH.log = {
    get enabled() {
      return enabled;
    },
    set enabled(v) {
      enabled = !!v;
    },

    debug(...args) {
      push('debug', args);
      if (enabled) console.debug('%cMDH', 'color:#4ade80', ...args);
    },
    info(...args) {
      push('info', args);
      if (enabled) console.info('%cMDH', 'color:#4ade80', ...args);
    },
    warn(...args) {
      push('warn', args);
      console.warn('%cMDH', 'color:#fbbf24', ...args);
    },
    error(...args) {
      push('error', args);
      console.error('%cMDH', 'color:#f87171', ...args);
    },

    /** Last N entries, oldest first. */
    tail(n = 50) {
      return entries.slice(-n);
    },

    clear() {
      entries.length = 0;
    },
  };
})();
