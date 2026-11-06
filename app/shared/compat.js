/**
 * compat.js — Firefox ⇄ Chrome API shim.
 *
 * Chromium exposes `chrome.*` returning promises (MV3).
 * Firefox exposes `chrome.*` as a **callback-style alias**; promises live on `browser.*`.
 *
 * This codebase is written entirely in the promise style (`await chrome.storage.local.get(...)`),
 * with zero callback call sites. So on Firefox we simply point `chrome` at `browser`.
 *
 * No-op on Chromium. Must load before anything else in:
 *   - background (declared first in the Firefox manifest's background.scripts)
 *   - every content script (declared first in the manifest)
 *   - popup.html / welcome.html (before their own script tag)
 */
(() => {
  'use strict';

  const g = globalThis;
  if (!g.browser || !g.browser.runtime) return;   // Chromium → nothing to do
  if (g.chrome && g.chrome === g.browser) return; // already unified

  try {
    g.chrome = g.browser;
  } catch {
    // Some hosts define `chrome` as non-writable; fall back to redefining it.
    try {
      Object.defineProperty(g, 'chrome', { value: g.browser, writable: true, configurable: true });
    } catch {
      // Give up silently: the caller keeps the callback alias and will fail loudly.
    }
  }
})();
