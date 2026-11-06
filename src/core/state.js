/**
 * core/state.js — the only place that talks to `storage.local`.
 *
 * Everything durable is namespaced `mdh:` and survives a reload, because the two things that must
 * survive are the *pending call* and the *ladder's memory* (`docs/ARCHITECTURE.md` §4). An in-memory
 * mirror keeps the hot path synchronous; writes are debounced per key.
 *
 * The in-memory mirror is also why the popup can be honest in real time: the tab knows, so the UI knows.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const api = MDH.api;
  const PREFIX = 'mdh:';

  const DEFAULTS = {
    settings: {
      enabled: true,
      paused: false,
      timestamps: false,
      autoResume: true,
      /* First-run credit: open the author's site once, then never again unless asked. */
      welcomed: false,
    },
    policy: {
      allowPaths: ['~/projects', '~/mdh', '/tmp/mdh'],
      denyPaths: [
        '~/.ssh', '~/.gnupg', '~/.aws', '~/.config', '~/.local/share/keyrings',
        '~/.mozilla', '~/.password-store', '/etc/shadow', '/etc/sudoers',
      ],
      approval: {
        read_file: 'allow', list_dir: 'allow', search_files: 'allow', file_info: 'allow',
        sys_info: 'allow', update_plan: 'allow', ask_user: 'allow', finish: 'allow',
        write_file: 'ask', edit_file: 'ask', run_command: 'ask', send_stdin: 'ask', open_app: 'ask',
      },
      approvalTimeoutMs: 120000,
      container: false,
    },
    session: null,   // { tabId, platform, startedAt, phase, outcome }
    pending: null,   // { call, pushedAt, attempts, fingerprint }
    pace: { mult: 1, lastSendAt: 0, sentInWindow: 0, windowStart: 0 },
    rate: { hits: 0, lastHitAt: 0, phase: '', resumeAt: 0 },
    answered: [],    // turnIds already answered (bounded to 50)
    history: [],     // last 50 turns: { at, tool, status, ms, platform }
    lease: null,     // { tabId, platform, at }
    turn: null,      // the in-flight turn
    boot: null,      // random id per browser session, so "until restart" is a fact
    grants: { boot: null, items: [] }, // remembered approvals: session and per-site
    memory: '',
    skills: [],      // [{ name, body }] — playbooks the model opens on demand, names only in the prompt
    probes: {},      // last layout check per chat host: { at, ok, missing }
    planFirst: false, // start read-only and ask for a plan before touching anything      // free text the user wants in every prompt — the CLAUDE.md of a no-files product
  };

  const memo = new Map();
  const timers = new Map();

  const key = (name) => PREFIX + name;

  async function read(name) {
    if (memo.has(name)) return memo.get(name);
    const stored = await api.storage.local.get(key(name));
    const value = stored[key(name)];
    const merged = value === undefined ? structuredClone(DEFAULTS[name]) : value;
    memo.set(name, merged);
    return merged;
  }

  function write(name, value, { debounce = 0 } = {}) {
    memo.set(name, value);
    const flush = () => {
      timers.delete(name);
      api.storage.local.set({ [key(name)]: value }).catch((e) => MDH.log.error('state write failed', name, e));
    };
    if (debounce > 0) {
      clearTimeout(timers.get(name));
      timers.set(name, setTimeout(flush, debounce));
    } else {
      flush();
    }
  }

  MDH.state = {
    DEFAULTS,

    async get(name) {
      return structuredClone(await read(name));
    },

    async set(name, value) {
      write(name, value);
      return value;
    },

    /** Shallow patch of an object-valued key; arrays are replaced wholesale. */
    async patch(name, partial) {
      const current = await read(name);
      const next = Array.isArray(current) ? partial : { ...current, ...partial };
      write(name, next);
      return structuredClone(next);
    },

    /** Debounced patch for fields that change on every turn (pace, rate). */
    async patchSoon(name, partial) {
      const current = await read(name);
      const next = { ...current, ...partial };
      write(name, next, { debounce: 400 });
      return next;
    },

    /** Synchronous view of the last known value — for hot paths that cannot await. */
    peek(name) {
      return memo.get(name) ?? structuredClone(DEFAULTS[name]);
    },

    async all() {
      const names = Object.keys(DEFAULTS);
      const out = {};
      for (const n of names) out[n] = await read(n);
      return out;
    },

    /** Forget a cached value without touching storage — used after the popup edits the grant list. */
    invalidate(name) {
      memo.delete(name);
    },

    async reset() {
      memo.clear();
      const keys = Object.keys(DEFAULTS).map(key);
      await api.storage.local.remove(keys);
    },

    /** Bounded push used by `answered` and `history`. */
    async pushCapped(name, item, cap) {
      const list = await read(name);
      const next = list.concat([item]);
      while (next.length > cap) next.shift();
      write(name, next);
      return next;
    },
  };
})();
