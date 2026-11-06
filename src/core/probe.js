/**
 * core/probe.js — "does this site still look the way the adapter thinks it does?"
 *
 * Every DOM-driving extension dies the same death: the site renames a class, the selector stops matching, and
 * the tool goes quiet. The user sees "it stopped" and cannot tell a broken selector from a rate limit.
 *
 * This module answers that question directly, from the page itself, without guessing: it runs the adapter's own
 * selector lists against the live DOM and reports which ones matched. It is a **wiring check**, not a health
 * check — a green probe does not promise the model will answer, but a red composer explains almost every
 * "nothing happens when I press Start".
 *
 * Honesty rules that matter here:
 *  - A missing send button is not a failure. Several platforms only render it once there is text.
 *  - A missing stop button is not a failure either. It exists during a stream, and nowhere else.
 *  - We report what matched, not a score out of ten. Numbers invite false confidence.
 */
(() => {
  const MDH = (globalThis.MDH ??= {});

  const ESSENTIAL = ['composer', 'messages'];
  const OPTIONAL = ['send', 'stop'];

  const NOTE = {
    composer: 'no composer matched — Start cannot type a message here',
    messages: 'no message container matched — replies cannot be read',
    send: 'no send button matched — usually fine: most sites add it after you type',
    stop: 'no stop button matched — usually fine: it only exists while a reply is streaming',
  };

  function checkOne(root, name, selectors = []) {
    const matched = [];
    const broken = [];
    for (const selector of selectors) {
      let found = null;
      try {
        found = root?.querySelector?.(selector) ?? null;
      } catch {
        broken.push(selector); // invalid selector: a bug in the adapter, worth naming
        continue;
      }
      if (found) matched.push(selector);
    }
    return {
      name,
      ok: matched.length > 0,
      required: ESSENTIAL.includes(name),
      tried: selectors.length,
      matched,
      invalid: broken,
      note: matched.length ? null : NOTE[name] ?? null,
    };
  }

  /** Probe one adapter against one document. Pure enough to test with a stub root. */
  function probe(adapter, root = globalThis.document) {
    if (!adapter) return { ok: false, platform: null, fields: {}, summary: 'no adapter for this page' };

    const fields = {};
    for (const name of [...ESSENTIAL, ...OPTIONAL]) {
      fields[name] = checkOne(root, name, adapter.dom?.[name] ?? []);
    }

    const missing = ESSENTIAL.filter((name) => !fields[name].ok);
    return {
      ok: missing.length === 0,
      platform: adapter.id,
      name: adapter.name ?? adapter.id,
      fields,
      missing,
      sse: {
        mode: adapter.sse?.mode ?? null,
        deltaMode: adapter.sse?.deltaMode ?? null,
        // `.source` of the RegExp: the exact pattern, so a user can paste it into devtools.
        apiPattern: adapter.sse?.apiPattern?.source ?? null,
      },
      visibility: root?.visibilityState ?? null,
      summary: missing.length
        ? `this page does not match the ${adapter.name ?? adapter.id} adapter (${missing.join(', ')})`
        : `${adapter.name ?? adapter.id} wiring looks right`,
    };
  }

  /**
   * Did this site get worse since we last looked? Only a *regression* is worth a notification: a page that was
   * broken yesterday and is broken today has already been reported once, and nagging is how warnings get muted.
   */
  function regression(previous, current) {
    const before = previous ?? null;
    const now = current ?? null;
    if (!now) return { regressed: false, lost: [], first: !before };
    if (!before) return { regressed: false, lost: [], first: true };
    if (!before.ok && now.ok) return { regressed: false, lost: [], recovered: true };
    if (before.ok && !now.ok) {
      return { regressed: true, lost: now.missing ?? [], first: false };
    }
    return { regressed: false, lost: [], first: false };
  }

  /** The human-readable version, used by the popup and by `--diagnose`-style reports. */
  function report(result) {
    if (!result) return ['no probe result'];
    const lines = [`${result.ok ? '✔' : '✘'} ${result.summary}`];
    for (const field of Object.values(result.fields ?? {})) {
      const mark = field.ok ? '✔' : field.required ? '✘' : '○';
      lines.push(`  ${mark} ${field.name}: ${field.ok ? field.matched[0] : field.note}`);
      if (field.invalid.length) lines.push(`    invalid selector: ${field.invalid.join(', ')}`);
    }
    if (result.sse?.apiPattern) lines.push(`  · stream: ${result.sse.mode}/${result.sse.deltaMode} ${result.sse.apiPattern}`);
    return lines;
  }

  MDH.probe = { probe, report, regression, checkOne, ESSENTIAL, OPTIONAL };
})();
