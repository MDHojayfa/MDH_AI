/**
 * content/injected.js — runs in the page's own world (MAIN), before any page script.
 *
 * Job: make `fetch`, `XMLHttpRequest` and `WebSocket` observable, and post what they receive to the
 * isolated world. Nothing else.
 *
 * Contract (docs/ARCHITECTURE.md §3):
 *   · the caller gets exactly what it got before — same Response, same promise resolution, same errors;
 *   · the page is the paying customer here. We are a passenger with a notebook, not the driver;
 *   · nothing is cancelled, re-written or delayed;
 *   · duplicate injection is detected and reported as `degraded`, not applied twice;
 *   · no extension API is used here, so a hostile page can break this file without gaining anything.
 */
(() => {
  'use strict';

  const CHANNEL = '__mdh_stream';
  const FLAG = Symbol.for('mdh.injected');

  const post = (type, payload) => {
    try {
      window.postMessage({ channel: CHANNEL, type, ...payload }, '*');
    } catch {
      /* the page may have broken postMessage; never throw into page code */
    }
  };

  if (window[FLAG]) {
    post('wrapped', { degraded: true, reason: 'already-injected' });
    return;
  }
  Object.defineProperty(window, FLAG, { value: true, enumerable: false });

  let seq = 0;

  const isTextual = (contentType) =>
    !contentType || /(text\/|event-stream|json|javascript|xml)/i.test(contentType);

  function toBase64(bytes) {
    let out = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(out);
  }

  /** Read a cloned body alongside the page's own read. Never touches the original stream. */
  function observeBody(response, requestId, url) {
    if (!response?.body?.getReader) return;
    const contentType = response.headers?.get?.('content-type') ?? '';
    post('begin', { requestId, url, textual: isTextual(contentType), contentType });

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });

    const pump = () => {
      reader.read().then(({ done, value }) => {
        if (done) {
          post('end', { requestId });
          return;
        }
        if (isTextual(contentType)) {
          post('chunk', { requestId, text: decoder.decode(value, { stream: true }), binary: false });
        } else {
          post('chunk', { requestId, text: toBase64(value), binary: true });
        }
        pump();
      }).catch((e) => post('end', { requestId, error: String(e && e.message) }));
    };
    pump();
  }

  // ───────────────────────────────────────────────────────────────── fetch
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    const wrappedFetch = function fetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      const requestId = ++seq;
      const promise = originalFetch.apply(this, arguments);

      promise.then((response) => {
        try {
          // Starting the observation *before* the caller reads keeps the clone cheap and complete.
          observeBody(response.clone(), requestId, url);
        } catch {
          post('begin', { requestId, url, textual: false, cloneFailed: true });
        }
        return response;
      }).catch((err) => {
        post('end', { requestId, error: String((err && err.message) || err) });
      });

      return promise; // the caller's promise, untouched
    };

    try {
      Object.defineProperty(wrappedFetch, 'name', { value: 'fetch' });
      Object.defineProperty(wrappedFetch, 'length', { value: originalFetch.length });
      wrappedFetch.toString = () => originalFetch.toString();
    } catch {
      /* cosmetic only */
    }

    window.fetch = wrappedFetch;
    post('wrapped', { degraded: false, fetch: true });
  }

  // ─────────────────────────────────────────────────────────────────── XHR
  const XHR = window.XMLHttpRequest;
  if (XHR?.prototype) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      this.__mdh = { url: String(url), requestId: ++seq, sent: 0 };
      return open.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      const meta = this.__mdh;
      if (meta) {
        const onProgress = () => {
          try {
            if (this.readyState < 2) return;
            const text = this.responseType === '' || this.responseType === 'text' ? this.responseText : '';
            if (!text || text.length <= meta.sent) return;
            const delta = text.slice(meta.sent);
            meta.sent = text.length;
            if (!meta.begun) {
              meta.begun = true;
              post('begin', { requestId: meta.requestId, url: meta.url, textual: true });
            }
            post('chunk', { requestId: meta.requestId, text: delta, binary: false });
          } catch {
            /* ignore */
          }
        };
        this.addEventListener('progress', onProgress);
        this.addEventListener('load', () => {
          onProgress();
          post('end', { requestId: meta.requestId });
        });
        this.addEventListener('error', () => post('end', { requestId: meta.requestId, error: 'xhr error' }));
      }
      return send.apply(this, arguments);
    };
  }

  // ────────────────────────────────────────────────────────────── WebSocket
  const OriginalWS = window.WebSocket;
  if (typeof OriginalWS === 'function') {
    const WrappedWS = function (url, protocols) {
      const ws = protocols === undefined ? new OriginalWS(url) : new OriginalWS(url, protocols);
      const requestId = ++seq;
      let begun = false;
      ws.addEventListener('message', (event) => {
        try {
          if (!begun) {
            begun = true;
            post('begin', { requestId, url: String(url), textual: typeof event.data === 'string' });
          }
          if (typeof event.data === 'string') post('chunk', { requestId, text: event.data, binary: false });
        } catch {
          /* ignore */
        }
      });
      ws.addEventListener('close', () => post('end', { requestId }));
      return ws;
    };
    WrappedWS.prototype = OriginalWS.prototype;
    WrappedWS.CONNECTING = OriginalWS.CONNECTING;
    WrappedWS.OPEN = OriginalWS.OPEN;
    WrappedWS.CLOSING = OriginalWS.CLOSING;
    WrappedWS.CLOSED = OriginalWS.CLOSED;
    try {
      Object.defineProperty(WrappedWS, 'name', { value: 'WebSocket' });
      WrappedWS.toString = () => OriginalWS.toString();
    } catch {
      /* cosmetic */
    }
    window.WebSocket = WrappedWS;
  }
})();
