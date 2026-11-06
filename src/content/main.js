/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
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

  async function status() {
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
      layout: (await MDH.state.get('probes').catch(() => ({})))?.[location.hostname] ?? null,
    };
  }

  async function handle(msg) {
    switch (msg?.type) {
      case 'mdh:status':
        return await status();

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

      /*
       * "Check this page": run the adapter's own selectors against the live DOM and say what matched. A renamed
       * composer should stop looking like a mysterious silence.
       */
      case 'mdh:probe': {
        if (!adapter) return { ok: false, reason: 'unsupported page' };
        const result = MDH.probe?.probe?.(adapter, document) ?? null;
        if (result) log()?.info('probe', result.platform, result.ok ? 'ok' : `missing ${result.missing.join(',')}`);
        return { ok: true, result };
      }

      /*
       * Remembered approvals, and the one thing that must always exist beside them: a way to forget one.
       * Both go through `MDH.state` so the agent's cache and storage stay in agreement.
       */
      case 'mdh:grants': {
        const boot = await MDH.state.get('boot').catch(() => null);
        const store = await MDH.state.get('grants');
        const items = MDH.grants?.list?.(store, { site: location.hostname, boot }) ?? [];
        return { ok: true, items: items.map(({ key, command, scope, at }) => ({ key, command, scope, at })) };
      }

      case 'mdh:forget-grant': {
        if (!msg.key) return { ok: false, reason: 'no key' };
        const store = await MDH.state.get('grants');
        const next = MDH.grants.forget(store, msg.key, { site: location.hostname });
        await MDH.state.set('grants', next);
        MDH.state.invalidate?.('grants');
        log()?.info('approval forgotten', String(msg.command ?? '').slice(0, 80));
        return { ok: true };
      }

      // Notes the user wants in every prompt: stored locally, bounded, and quoted verbatim.
      case 'mdh:get-memory':
        return { ok: true, value: await MDH.state.get('memory').catch(() => '') };

      case 'mdh:set-memory': {
        const value = String(msg.value ?? '').slice(0, MDH.prompt?.MEMORY_LIMIT ?? 1200);
        await MDH.state.set('memory', value);
        log()?.info('memory updated', value.length, 'chars');
        return { ok: true, length: value.length };
      }

      // Skills: saved as text, parsed into {name, body}. Names go into the prompt; bodies wait for read_skill.
      case 'mdh:get-skills':
        return { ok: true, skills: await MDH.state.get('skills').catch(() => []) };

      case 'mdh:set-skills': {
        const skills = MDH.skills?.parse?.(String(msg.text ?? '')) ?? [];
        await MDH.state.set('skills', skills);
        log()?.info('skills updated', skills.length, 'playbooks');
        return { ok: true, count: skills.length, names: MDH.skills?.names?.(skills) ?? [] };
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

  /**
   * Layout watch: check the adapter against this page shortly after it loads, and remember the result.
   *
   * Sites render late, so the first check waits and the second one exists because the first one may have been
   * early. Only a *regression* — worked last time, does not work now — is worth interrupting a human for; that
   * is precisely the moment a redesign lands, and it is much cheaper to find out from a quiet warning now than
   * from "it did nothing" in the middle of a task.
   */
  async function checkLayout() {
    if (!adapter || !MDH.probe) return null;
    const current = MDH.probe.probe(adapter, document);
    const probes = await MDH.state.get('probes').catch(() => ({}));
    const previous = probes?.[location.hostname] ?? null;
    const change = MDH.probe.regression(previous, current);
    probes[location.hostname] = {
      at: Date.now(),
      ok: current.ok,
      missing: current.missing,
      platform: adapter.id,
    };
    await MDH.state.set('probes', probes).catch(() => {});

    if (change.regressed) {
      log.warn('layout regression on', adapter.id, 'missing:', current.missing.join(','));
      MDH.ui.notice(
        `${adapter.name} looks different since your last visit: ${current.missing.join(', ')} not found. ` +
          'It may still work — press Check this page in the popup before you start a long task.',
        { tone: 'warn', ms: 12000 },
      );
    } else if (change.recovered) {
      log.info('layout recovered on', adapter.id);
    }
    return { current, change };
  }

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
    // Give the SPA time to paint, then look again once, because the first look is often a skeleton screen.
    setTimeout(() => checkLayout().catch(() => {}), 4000);
    setTimeout(() => checkLayout().catch(() => {}), 15000);
    maybeResume();
    log.info(`MDH ${MDH.VERSION} on ${adapter.name}`);
  }

  try {
    boot();
  } catch (e) {
    log.error('boot failed', e);
  }
})();
