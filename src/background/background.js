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

// Where the first run points. Two doors, both open, neither a trick: the profile is where a follow
// happens (one click, the user's choice), and the site is linked in the popup footer for as long as the
// extension is installed. Nothing is collected, nothing is claimed. A redirect that silently followed
// someone would be a dark pattern, and this product already has enough ways to get things wrong.
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

/**
 * A one-shot native-messaging call from the background.
 *
 * The content script owns the long-lived port; the popup needs the host for two things — the log viewer URL
 * and a diagnostic snapshot — and it has no port of its own. Rather than teach the popup the whole transport,
 * this opens a port, sends one frame, and closes it. Same permission, same host, no second protocol.
 */
function askHost(frame, timeoutMs = 8000) {
  let port;
  try {
    port = api.runtime.connectNative(MDH.HOST_NAME);
  } catch (e) {
    return Promise.reject(Object.assign(new Error('cannot reach the MDH host — is it installed?'), { code: 'NO_HOST', cause: e }));
  }

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        port.disconnect();
      } catch {
        /* already gone */
      }
      fn(value);
    };

    const timer = setTimeout(() => finish(reject, Object.assign(new Error(`host timed out after ${timeoutMs} ms`), { code: 'TIMEOUT' })), timeoutMs);

    port.onMessage.addListener((msg) => {
      if (msg?.t === 'error') finish(reject, Object.assign(new Error(msg.message ?? 'host error'), { code: msg.code ?? 'HOST_ERROR' }));
      else finish(resolve, msg);
    });
    port.onDisconnect.addListener(() => {
      finish(reject, Object.assign(new Error(api.runtime.lastError?.message ?? 'host disconnected'), { code: 'NO_HOST' }));
    });

    try {
      port.postMessage({ ...frame, id: Date.now() });
    } catch (e) {
      finish(reject, Object.assign(new Error('the host port is closed'), { code: 'NO_HOST', cause: e }));
    }
  });
}

/*
 * A boot id per browser session, so "allow for this session" ends when the browser does — by definition rather
 * than by a timer that might never fire. Stamped only when missing (a background restart inside one session must
 * not throw session grants away) and refreshed on `onStartup` (a real browser start must).
 */
async function stampBoot(fresh) {
  try {
    const existing = await MDH.state.get('boot');
    if (fresh || !existing) await MDH.state.set('boot', MDH.util.uuid());
  } catch (e) {
    MDH.log.warn('could not stamp the boot id', e);
  }
}
stampBoot(false);

try {
  api.runtime.onStartup.addListener(() => stampBoot(true));
} catch {
  // Firefox may not expose onStartup in every version; the missing-id path still stamps a first boot.
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

  if (msg.type === 'mdh:viewer') {
    askHost({ t: 'viewer' })
      .then((reply) => sendResponse({ ok: Boolean(reply?.url), url: reply?.url ?? null, port: reply?.port ?? null }))
      .catch((e) => sendResponse({ ok: false, code: e.code ?? 'ERROR', message: e.message }));
    return true;
  }

  if (msg.type === 'mdh:snapshot') {
    askHost({ t: 'snapshot' })
      .then((reply) => sendResponse({ ok: Boolean(reply?.path), path: reply?.path ?? null }))
      .catch((e) => sendResponse({ ok: false, code: e.code ?? 'ERROR', message: e.message }));
    return true;
  }

  /*
   * Facts from the machine, for the popup's own report builder. Two frames, neither of which can return the
   * user's public address: `system` reads the box, `clock` asks one endpoint for its Date header only.
   */
  if (msg.type === 'mdh:diagnose') {
    Promise.all([
      askHost({ t: 'diag', op: 'system' }).catch((e) => ({ ok: false, error: e.message })),
      askHost({ t: 'diag', op: 'clock' }).catch((e) => ({ ok: false, error: e.message })),
    ]).then(([sys, clock]) => {
      sendResponse({
        ok: Boolean(sys?.ok),
        host: sys?.ok
          ? {
              version: sys.facts?.hostVersion ?? null,
              pid: sys.facts?.pid ?? null,
              node: sys.facts?.node ?? null,
              kernel: sys.facts ? `${sys.facts.platform} ${sys.facts.release}` : null,
              diskFreeGB: sys.disk?.freeGB ?? null,
              diskOk: sys.disk?.ok ?? null,
              tunnels: sys.facts?.tunnels ?? [],
              smallMtu: sys.facts?.smallMtu ?? [],
              clockSkewMs: clock?.ok ? clock.clockSkewMs : null,
            }
          : null,
        error: sys?.error ?? null,
      });
    });
    return true;
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
