/**
 * content/main.js — the isolated-world entry point.
 *
 * Wires the modules together, answers the popup, and decides what to do on this page. Deliberately thin:
 * a content script that can throw during load is a content script that silently does nothing, so every
 * step here is guarded and logged.
 *
 * It also holds the lease: one tab drives, the others watch and say so. Two tabs on one chat is not
 * teamwork, it is two people answering the same phone.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;
  const api = MDH.api;
  const log = MDH.log;

  const adapter = MDH.platforms.match(location.hostname, location.pathname);
  const booted = Date.now();

  function status() {
    const agent = MDH.agent.status();
    return {
      ok: true,
      version: MDH.VERSION,
      platform: adapter ? { id: adapter.id, name: adapter.name } : null,
      supported: !!adapter,
      interceptor: MDH.interceptor.status,
      host: MDH.transport.connected,
      hostError: MDH.transport.lastError,
      agent,
      bootedAt: booted,
      log: log.tail(30),
      dock: { mounted: Boolean(MDH.dock?.mounted), hidden: Boolean(MDH.dock?.hidden) },
    };
  }

  async function handle(msg) {
    switch (msg?.type) {
      case 'mdh:status':
        return status();

      case 'mdh:ping-host': {
        try {
          const pong = await MDH.transport.ping();
          return { ok: pong.ok, ...pong };
        } catch (e) {
          return { ok: false, code: e.code ?? 'NO_HOST', message: e.message };
        }
      }

      case 'mdh:start': {
        if (!adapter) return { ok: false, reason: 'unsupported page' };
        const lease = await MDH.state.get('lease');
        if (lease && lease.tabId && lease.tabId !== msg.tabId) {
          return { ok: false, reason: 'another tab is driving MDH' };
        }
        await MDH.state.set('lease', { tabId: msg.tabId ?? null, platform: adapter.id, at: Date.now() });
        const res = await MDH.agent.start(msg.task ?? '', adapter);
        return res;
      }

      case 'mdh:stop':
        MDH.agent.stop('stopped by the user');
        return { ok: true };

      case 'mdh:resume':
        await MDH.agent.resume();
        return { ok: true };

      case 'mdh:dock': {
        if (!adapter) return { ok: false, reason: 'unsupported page' };
        const res = await MDH.dock.setHidden(Boolean(msg.hidden), adapter);
        return { ok: true, ...res };
      }

      case 'mdh:policy': {
        const policy = await MDH.state.get('policy');
        return { ok: true, policy };
      }

      case 'mdh:set-policy': {
        await MDH.state.set('policy', msg.policy);
        return { ok: true };
      }

      case 'mdh:home': {
        const settings = await MDH.state.get('settings');
        settings.welcomed = true;
        await MDH.state.set('settings', settings);
        return { ok: true };
      }

      default:
        return { ok: false, reason: 'unknown message' };
    }
  }

  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('mdh:')) return false;
    Promise.resolve(handle(msg))
      .then((res) => sendResponse(res))
      .catch((e) => {
        log.error('message handler failed', msg.type, e);
        sendResponse({ ok: false, message: String(e?.message ?? e) });
      });
    return true; // async response
  });

  /** First load: tell the background this platform is ready (it owns the one-time welcome tab). */
  async function hello() {
    try {
      const settings = await MDH.state.get('settings');
      await api.runtime.sendMessage({ type: 'mdh:hello', platform: adapter?.id ?? null, firstRun: !settings.welcomed });
    } catch {
      /* the background may be asleep; this is best effort */
    }
  }

  /** After a reload the pending call must be *offered*, never re-sent automatically. */
  async function maybeResume() {
    const pending = await MDH.state.get('pending');
    if (!pending?.resumeAfterReload) return;
    const settings = await MDH.state.get('settings');
    if (!settings.enabled || !settings.autoResume) return;
    await MDH.state.set('pending', { ...pending, resumeAfterReload: false });
    MDH.ui.notice('A call was interrupted by the reload. Press Resume in the popup to continue.', { tone: 'warn', ms: 9000 });
    MDH.ui.mount();
  }

  /** Single-page apps change conversations without a reload: re-attach on URL changes. */
  function watchNavigation() {
    let last = location.href;
    const check = () => {
      if (location.href === last) return;
      last = location.href;
      const next = MDH.platforms.match(location.hostname, location.pathname);
      if (next?.id === adapter?.id) {
        MDH.interceptor.attach(next);
        log.debug('re-attached after navigation', next.id);
      }
    };
    setInterval(check, 1000);
  }

  function boot() {
    if (!adapter) {
      log.warn('unsupported page:', location.hostname);
      return;
    }
    MDH.ui.mount();
    MDH.dock.mount(adapter);
    MDH.interceptor.attach(adapter);
    watchNavigation();
    hello();
    maybeResume();
    log.info(`MDH ${MDH.VERSION} on ${adapter.name}`);
  }

  try {
    boot();
  } catch (e) {
    log.error('boot failed', e);
  }
})();
