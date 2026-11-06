/**
 * core/grants.js — remembered approval decisions.
 *
 * Three scopes, three different promises:
 *   · run     — until this task ends. Nothing is written; closing the tab is enough.
 *   · session — until the browser restarts. Stored, but stamped with a boot id that changes every start,
 *               so "session" is a fact rather than a hope.
 *   · site    — until you remove it, on this chat site only. The one that needs a visible, working revoke,
 *               which is why the popup lists them.
 *
 * Everything here is pure: a store in, a store out. The agent and the popup do the reading and writing, so
 * this logic is testable without a browser and the storage layer stays in one place (`core/state.js`).
 *
 * What a grant is *not*: a way past the policy. `policy.check()` still runs first and a deny still denies.
 * A grant only answers "you have already approved this exact command" — it never answers "is this allowed?".
 */
(() => {
  const MDH = (globalThis.MDH ??= {});

  const empty = () => ({ boot: null, items: [] });
  const SCOPES = ['session', 'site'];

  /** Drop grants whose boot id is not the current one: that is what "for this session" means. */
  function expire(store, boot) {
    const base = store && Array.isArray(store.items) ? store : empty();
    if (!boot || base.boot === boot) return base;
    // A new boot: session grants are over, site grants survive (they never carried a boot stamp).
    return { boot, items: base.items.filter((item) => item.scope === 'site') };
  }

  function isGranted(store, key, { site = null, boot = null } = {}) {
    if (!key) return false;
    const current = expire(store, boot);
    return current.items.some((item) => item.key === key && (item.scope === 'site' ? item.site === site : true));
  }

  /** Add or refresh a grant. Same key + scope + site is idempotent, so approving twice does not duplicate. */
  function add(store, { key, command = '', scope = 'session', site = null, boot = null, at = Date.now() }) {
    if (!key || !SCOPES.includes(scope)) return expire(store, boot);
    const current = expire(store, boot);
    const items = current.items.filter(
      (item) => !(item.key === key && item.scope === scope && (scope === 'site' ? item.site === site : true)),
    );
    items.push({ key, command: String(command ?? '').slice(0, 300), scope, site: scope === 'site' ? site : null, at });
    // Bounded: a long-running browser should not accumulate a thousand remembered commands.
    return { boot: current.boot, items: items.slice(-200) };
  }

  function forget(store, key, { site = null } = {}) {
    const current = store && Array.isArray(store.items) ? store : empty();
    return {
      boot: current.boot,
      items: current.items.filter((item) => !(item.key === key && (site === null || item.site === site))),
    };
  }

  function list(store, { site = null, boot = null } = {}) {
    const current = expire(store, boot);
    return site === null ? current.items : current.items.filter((item) => item.scope !== 'site' || item.site === site);
  }

  /** Human sentence for the card, so the button and the consequence say the same thing. */
  const describe = (scope, site = 'this site') =>
    ({
      run: 'allow for this run',
      session: 'allow until the browser restarts',
      site: `always allow on ${site}`,
      once: 'allow once',
    })[scope] ?? scope;

  MDH.grants = { empty, expire, isGranted, add, forget, list, describe, SCOPES };
})();
