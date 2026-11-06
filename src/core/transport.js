/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * core/transport.js — the only way out of the browser: native messaging.
 *
 * No socket, no port, no HTTP: the browser itself spawns the host from the manifest that install.sh
 * wrote, and the OS authenticates the caller. That is why a web page can never reach it
 * (docs/DECISIONS.md D2).
 *
 * Frames are `{t, id, …}` as JSON. The host prefixes nothing — native messaging already frames messages
 * with a 32-bit length, and getting that wrong is the classic bug (`docs/INTERFACES.md` §4).
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const log = () => MDH.log;

  const DEFAULT_TIMEOUT = 120000;

  const state = {
    port: null,
    connected: false,
    lastError: null,
    pending: new Map(), // id -> {resolve, reject, timer, startedAt}
    seq: 0,
    retries: 0,
  };

  function failAll(code, message) {
    for (const [, p] of state.pending) {
      clearTimeout(p.timer);
      p.reject(Object.assign(new Error(message ?? code), { code }));
    }
    state.pending.clear();
  }

  function onMessage(frame) {
    if (!frame || typeof frame !== 'object') return;
    const id = frame.id;
    const entry = id != null ? state.pending.get(id) : null;

    if (frame.t === 'progress' && entry) {
      // A long tool is still alive: reset the clock but never resolve early.
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        state.pending.delete(id);
        entry.reject(Object.assign(new Error(`timeout after ${DEFAULT_TIMEOUT} ms`), { code: 'TIMEOUT' }));
      }, DEFAULT_TIMEOUT);
      if (typeof frame.message === 'string') log()?.debug('progress', frame.message);
      return;
    }

    if (!entry) {
      if (frame.t === 'ready') {
        state.connected = true;
        state.retries = 0;
        log()?.info('host ready', frame.host, frame.version);
      }
      return;
    }

    clearTimeout(entry.timer);
    state.pending.delete(id);
    if (frame.t === 'error') entry.reject(Object.assign(new Error(frame.message ?? 'host error'), { code: frame.code ?? 'HOST_ERROR' }));
    else entry.resolve(frame);
  }

  function onDisconnect() {
    const err = api.runtime.lastError;
    state.connected = false;
    state.lastError = err?.message ?? 'disconnected';
    log()?.warn('native port disconnected:', state.lastError);
    failAll('NO_HOST', state.lastError);
    state.port = null;
  }

  const api = MDH.api;

  function open() {
    if (state.port) return state.port;
    const port = api.runtime.connectNative(MDH.HOST_NAME);
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
    state.port = port;
    state.connected = true;
    state.retries += 1;
    return port;
  }

  /**
   * @param {object} frame partial frame; `t` and any fields; an `id` is added
   * @param {{timeout?: number}} [opts]
   */
  function send(frame, { timeout = DEFAULT_TIMEOUT } = {}) {
    let port;
    try {
      port = open();
    } catch (e) {
      return Promise.reject(Object.assign(new Error('cannot reach the MDH host — is it installed?'), { code: 'NO_HOST', cause: e }));
    }

    const id = ++state.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(id);
        reject(Object.assign(new Error(`timeout after ${timeout} ms`), { code: 'TIMEOUT' }));
      }, timeout);

      state.pending.set(id, { resolve, reject, timer, startedAt: Date.now() });

      try {
        port.postMessage({ ...frame, id });
      } catch (e) {
        clearTimeout(timer);
        state.pending.delete(id);
        reject(Object.assign(new Error('the host port is closed — reload the page'), { code: 'NO_HOST', cause: e }));
      }
    });
  }

  function close() {
    if (!state.port) return;
    try {
      state.port.disconnect();
    } catch {
      /* already gone */
    }
    state.port = null;
    state.connected = false;
    failAll('NO_HOST', 'closed by the extension');
  }

  /** Cheap liveness probe; also the install.sh contract (`ping` → `pong`). */
  async function ping() {
    const started = Date.now();
    const reply = await send({ t: 'ping' }, { timeout: 5000 });
    return { ok: reply?.t === 'pong', ms: Date.now() - started, host: reply?.host, version: reply?.version };
  }

  async function listTools() {
    const reply = await send({ t: 'list' }, { timeout: 20000 });
    return Array.isArray(reply?.tools) ? reply.tools : [];
  }

  async function callTool(name, args, { timeout, run, via } = {}) {
    const reply = await send({ t: 'call', name, arguments: args, run, via }, { timeout });
    if (reply?.t === 'error') throw Object.assign(new Error(reply.message), { code: reply.code });
    return reply;
  }

  /**
   * Diagnostics, not tools. Same pipe, different frame type — the host keeps them out of the catalogue the
   * model sees, so "read the user's public IP" is not something a prompt can ask for.
   */
  async function hostDiag(op, extra = {}, { timeout = 15000 } = {}) {
    return send({ t: 'diag', op, ...extra }, { timeout });
  }

  /** Ask the host to start (once) and return the loopback viewer URL. */
  async function openViewer() {
    return send({ t: 'viewer' }, { timeout: 10000 });
  }

  /** Write a static HTML snapshot next to the audit log; returns its path. */
  async function writeSnapshot() {
    return send({ t: 'snapshot' }, { timeout: 15000 });
  }

  MDH.transport = {
    send, ping, listTools, callTool, hostDiag, openViewer, writeSnapshot, close,
    get connected() {
      return state.connected;
    },
    get lastError() {
      return state.lastError;
    },
  };
})();
