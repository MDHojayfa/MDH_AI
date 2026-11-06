/**
 * core/interceptor.js — the isolated-world side of the network read path.
 *
 * The MAIN-world script (content/injected.js) wraps fetch/XHR/WebSocket and forwards text chunks here.
 * This file decides what a chunk *means* for the current adapter: which mode (sse / binary / body),
 * what the delta is, and when the turn is finished.
 *
 * It never throws into page code and never blocks a request: the wrapper is transparent by contract
 * (docs/ARCHITECTURE.md §3).
 *
 * Not out of politeness. A page that notices it is being watched has two options, and it will not pick the
 * one where it tells you. It will start sending a tidier stream than the one the user sees. Every agent that
 * scraped a product UI has learned this the expensive way; this file is written by someone who would rather
 * not learn it twice.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const log = () => MDH.log;

  const state = {
    adapter: null,
    active: null,       // { requestId, url, startedAt, mode, raw, text, done }
    status: 'idle',     // idle | attached | degraded
    lastChunkAt: 0,
    handlers: new Set(),
  };

  const CHANNEL = '__mdh_stream';

  function emit(kind, payload) {
    for (const fn of state.handlers) {
      try {
        fn(kind, payload);
      } catch (e) {
        log()?.error('handler failed', e);
      }
    }
  }

  /** Match a request URL against the active adapter's signature. */
  function matches(url) {
    const adapter = state.adapter;
    if (!adapter || !url) return false;
    const pattern = adapter.sse?.apiPattern ?? adapter.apiPattern;
    return pattern ? pattern.test(String(url)) : false;
  }

  function begin({ requestId, url, mode }) {
    state.active = {
      requestId,
      url,
      mode: mode ?? state.adapter?.sse?.mode ?? 'sse',
      startedAt: Date.now(),
      raw: '',
      text: '',
      done: false,
      buffer: '',
    };
    state.lastChunkAt = Date.now();
    log()?.info('stream begin', state.active.mode, String(url).slice(0, 120));
    emit('begin', { ...state.active });
  }

  /** sse: split on blank lines, parse `data:` payloads, run the adapter's extract(). */
  function feedSse(chunk) {
    const a = state.active;
    a.buffer += chunk;
    const parts = a.buffer.split(/\r?\n\r?\n/);
    a.buffer = parts.pop() ?? '';
    let delta = '';
    let terminal = false;

    for (const part of parts) {
      for (const line of part.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
        if (payload === '[DONE]') {
          terminal = true;
          continue;
        }
        let json = null;
        try {
          json = JSON.parse(payload);
        } catch {
          json = null;
        }
        if (!json) continue;

        // A refusal or an error frame is data about the *site*, not text for the model.
        if (state.adapter?.sse?.refusal && state.adapter.sse.refusal.test(payload)) {
          emit('refusal', { text: payload.slice(0, 300) });
          terminal = true;
          continue;
        }
        const piece = state.adapter?.sse?.extract ? safeExtract(json, payload) : null;
        if (typeof piece === 'string' && piece) delta += piece;
        if (state.adapter?.sse?.end && safeEnd(json)) terminal = true;
      }
    }

    if (delta) {
      a.text += delta;
      state.lastChunkAt = Date.now();
      emit('chunk', { text: a.text, delta });
    }
    if (terminal) finish('completed');
  }

  function safeExtract(json, payload) {
    try {
      return state.adapter.sse.extract(json, payload);
    } catch (e) {
      log()?.warn('extract() threw', e);
      return null;
    }
  }

  function safeEnd(json) {
    try {
      return !!state.adapter.sse.end(json);
    } catch {
      return false;
    }
  }

  /** binary: 5-byte framed messages (1 flag + 4 length) → brace-depth JSON scan. */
  function feedBinary(chunk, isBase64) {
    const a = state.active;
    let bytes;
    if (isBase64) {
      const bin = atob(chunk);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = chunk instanceof Uint8Array ? chunk : new TextEncoder().encode(String(chunk));
    }
    a.bufferBytes = a.bufferBytes ? concat(a.bufferBytes, bytes) : bytes;

    // Decode JSON objects by brace depth, ignoring the framing header where present.
    const text = new TextDecoder().decode(a.bufferBytes);
    let depth = 0;
    let start = -1;
    let consumed = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start >= 0) {
          const slice = text.slice(start, i + 1);
          try {
            const json = JSON.parse(slice);
            const piece = state.adapter?.sse?.extract ? safeExtract(json, slice) : null;
            if (typeof piece === 'string' && piece) {
              a.text += piece;
              emit('chunk', { text: a.text, delta: piece });
            }
            if (state.adapter?.sse?.end && safeEnd(json)) finish('completed');
          } catch {
            /* not a complete object yet */
          }
          consumed = i + 1;
          start = -1;
        }
      }
    }
    if (consumed > 0) a.bufferBytes = new TextEncoder().encode(text.slice(consumed));
  }

  /** body: no deltas at all — the whole response arrives once (Gemini's RPC). */
  function feedBody(text) {
    const a = state.active;
    a.raw += text;
    const piece = state.adapter?.sse?.extract ? safeExtract({ raw: a.raw }, a.raw) : a.raw;
    if (typeof piece === 'string' && piece) {
      a.text = piece;
      emit('chunk', { text: a.text, delta: piece });
    }
    finish('completed');
  }

  function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function finish(outcome) {
    const a = state.active;
    if (!a || a.done) return;
    a.done = true;
    emit('end', { text: a.text, outcome: outcome ?? 'completed', requestId: a.requestId });
  }

  /** window.postMessage bridge with the MAIN world. */
  function onWindowMessage(ev) {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.channel !== CHANNEL) return;

    switch (data.type) {
      case 'wrapped':
        state.status = data.degraded ? 'degraded' : 'attached';
        log()?.info('interceptor', state.status);
        break;
      case 'begin':
        if (matches(data.url)) begin({ requestId: data.requestId, url: data.url, mode: data.mode });
        break;
      case 'chunk': {
        const a = state.active;
        if (!a || a.requestId !== data.requestId) return;
        if (a.mode === 'binary') feedBinary(data.text, data.binary === true);
        else if (a.mode === 'body') a.raw += data.text;
        else feedSse(data.text);
        break;
      }
      case 'end': {
        const a = state.active;
        if (!a || a.requestId !== data.requestId) return;
        if (a.mode === 'body') feedBody('');
        else finish('completed');
        break;
      }
      case 'refusal':
        emit('refusal', { text: String(data.text ?? '').slice(0, 300) });
        break;
      default:
        break;
    }
  }

  window.addEventListener('message', onWindowMessage, true);

  MDH.interceptor = {
    attach(adapter) {
      state.adapter = adapter;
      state.status = 'attached';
      return state.status;
    },
    detach() {
      state.adapter = null;
      state.active = null;
      state.status = 'idle';
    },
    on(fn) {
      state.handlers.add(fn);
      return () => state.handlers.delete(fn);
    },
    reset() {
      state.active = null;
    },
    /** Explicit end-of-turn from the loop (used when the site gives no terminal frame). */
    finalize(outcome) {
      finish(outcome ?? 'unknown');
    },
    get status() {
      return state.status;
    },
    get activeText() {
      return state.active?.text ?? '';
    },
    get lastChunkAt() {
      return state.lastChunkAt;
    },
    get active() {
      return state.active;
    },
  };
})();
