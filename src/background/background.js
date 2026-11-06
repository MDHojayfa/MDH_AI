/**
 * background/background.js — the service worker (Chromium) / event page (Firefox).
 *
 * It owns almost nothing on purpose: the loop lives in the tab, the tools live outside the browser.
 * What it does own is the first run — a single visit to the author's site, once per install, which the
 * user can dismiss — and the popup↔tab relay.
 */
// Firefox loads shared/compat.js from the manifest; Chromium's service worker is a single file, so it
// pulls the same file in with importScripts. One file, two engines, no bundler.
if (typeof importScripts === 'function' && typeof globalThis.MDH === 'undefined') {
  importScripts('/shared/compat.js');
}

const MDH = globalThis.MDH;
const api = MDH.api;

// Where the first run points. GitHub has no URL that follows an account — the old
// `/users/follow?target=` endpoint died in 2012 and required a POST with a CSRF token — so this is an
// honest profile visit, not a trick. The "Follow" button is one click from there; the popup links it too.
const PROFILE_URL = 'https://github.com/MDHojayfa?from=mdh_ai&v=1.0.0';
const SITE_URL = 'https://mdhojayfa.github.io/';
const WELCOME_URL = PROFILE_URL;
const BADGE = { idle: '#4ade80', running: '#fbbf24', error: '#f87171' };

async function settings() {
  const { 'mdh:settings': stored } = await api.storage.local.get('mdh:settings');
  return stored ?? { enabled: true, paused: false, timestamps: false, autoResume: true, welcomed: false };
}

async function saveSettings(patch) {
  const next = { ...(await settings()), ...patch };
  await api.storage.local.set({ 'mdh:settings': next });
  return next;
}

/** One tab, one time, and only if the user has never seen it. */
async function welcomeOnce() {
  const s = await settings();
  if (s.welcomed) return;
  await saveSettings({ welcomed: true });
  try {
    await api.tabs.create({ url: WELCOME_URL, active: false });
  } catch {
    /* tabs.create can fail in odd profiles; never block the install on it */
  }
}

api.runtime.onInstalled.addListener((details) => {
  MDH.log.info('installed', details.reason);
  if (details.reason === 'install') welcomeOnce();
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return false;

  if (msg.type === 'mdh:hello') {
    MDH.log.info('page ready', msg.platform);
    if (msg.firstRun) welcomeOnce();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'mdh:open-home') {
    api.tabs.create({ url: PROFILE_URL }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'mdh:open-site') {
    api.tabs.create({ url: SITE_URL }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'mdh:settings') {
    settings().then((s) => sendResponse({ ok: true, settings: s }));
    return true;
  }

  if (msg.type === 'mdh:save-settings') {
    saveSettings(msg.patch ?? {}).then((s) => sendResponse({ ok: true, settings: s }));
    return true;
  }

  if (msg.type === 'mdh:badge') {
    const color = BADGE[msg.state] ?? BADGE.idle;
    api.action?.setBadgeBackgroundColor?.({ color }).catch(() => {});
    api.action?.setBadgeText?.({ text: msg.text ?? '' }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

/**
 * Firefox suspends the event page; a periodic alarm keeps the first-run bookkeeping honest without
 * keeping anything alive for its own sake.
 */
if (api.alarms) {
  api.alarms.create('mdh:keepalive', { periodInMinutes: 20 });
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'mdh:keepalive') MDH.log.debug('alive', new Date().toISOString());
  });
}
