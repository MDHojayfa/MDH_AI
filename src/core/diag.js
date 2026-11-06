/**
 * core/diag.js — the part of a bug report that is worth reading.
 *
 * A failure report has three audiences: the user (who wants to know whether it is their fault), the
 * maintainer (who wants to reproduce it), and the maintainer six months later (who has forgotten everything
 * and needs the facts in one place). One blob of JSON serves none of them. So this module produces a
 * **diagram, not a dump**: what the build is, what the machine is, what the network looked like, what stage
 * failed, and — the point of the whole file — a ranked list of *plausible causes with evidence*.
 *
 * The inspiration is a real afternoon: a tool that worked for its author failed for one user, and the cause
 * was a blocked IP at the provider. Nothing in the UI could have said that, so it took three months. The
 * signature table below exists so that the next person gets an answer in three minutes.
 *
 * Two rules, both enforced by tests:
 *   1. Nothing here is sent anywhere by itself. The report is built locally, shown to the user, and only
 *      leaves the machine when a human clicks Submit on GitHub — with the tab pre-filled, never posted.
 *   2. Anything that could identify a person's files, folders or browsing is redacted before it is shown.
 *      Hostnames of the eight platforms are the only URLs that survive.
 */
(() => {
  const MDH = (globalThis.MDH ??= {});

  const REPO = 'https://github.com/MDHojayfa/MDH_AI';
  const ISSUE = `${REPO}/issues/new?template=bug_report.yml`;

  /** The only eight hosts allowed to appear in a report, because they are the product's own scope. */
  const KNOWN_HOSTS = [
    'chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com',
    'kimi.com', 'chat.qwen.ai', 'chat.z.ai', 'grok.com', 'x.com',
  ];

  /**
   * Signature table. Ordered: the first match wins, so put narrow patterns above broad ones.
   * Each entry must answer "what do I do about it" — a diagnosis without an action is trivia.
   */
  const SIGNATURES = [
    {
      id: 'cf-ban',
      match: /\b(1015|1020)\b|you have been (banned|blocked)|access denied.*cloudflare/i,
      what: 'The provider is refusing this network, not this code',
      why: 'Cloudflare returned a ban/block page. That is a decision about the IP address (or the country it is in), made before the app ever runs.',
      fix: 'Try another network (phone hotspot is the fastest test). If it works there, the old IP is flagged — that is a provider problem, not an extension problem.',
      severity: 'external',
    },
    {
      id: 'cf-challenge',
      match: /just a moment|checking your browser|cf-chl|cf-turnstile|verify you are human|unusual traffic/i,
      what: 'A bot check is standing between you and the chat',
      why: 'The page you are on is an interstitial, not the app. Every selector in the adapter misses because the real page never loaded.',
      fix: 'Solve the check in that tab once, then press Resume. If it appears on every message, the network is on a shared/VPN address.',
      severity: 'external',
    },
    {
      id: 'rate-limit',
      match: /\b429\b|too many requests|rate[ -]?limit|retry-after|quota/i,
      what: 'The plan is rate-limited right now',
      why: 'The provider answered 429 (or the page said so). Free tiers count messages per minute and per day; both are real.',
      fix: 'Wait it out — the governor does this already, and reloading faster only extends the block. A different model on the same account shares the same quota.',
      severity: 'external',
    },
    {
      id: 'geo-block',
      match: /not available in your (country|region)|unavailable in your region|country is not supported|unsupported country/i,
      what: 'The provider does not serve this country',
      why: 'A regional block. It has nothing to do with the browser, the extension or the account age.',
      fix: 'A supported network is the only fix. This is also the most common reason a VPN "fixes" a tool and then breaks it again.',
      severity: 'external',
    },
    {
      id: 'clock-skew',
      match: /err_cert|net::err_cert|clock|timestamp.*(skew|invalid)|notyetvalid|expired certificate/i,
      what: 'The system clock is wrong',
      why: 'TLS and signed tokens both compare timestamps. A machine ten minutes off gets rejected by services that are working perfectly, and the error points at the certificate, not the clock.',
      fix: 'sudo timedatectl set-ntp true (or enable automatic time in the desktop settings), then reload the tab.',
      severity: 'local',
    },
    {
      id: 'network-flap',
      match: /err_network_changed|err_internet_disconnected|err_name_not_resolved|err_connection_reset|err_tunnel/i,
      what: 'The network dropped mid-stream',
      why: 'VPN reconnect, Wi-Fi roam, or a resolver hiccup. The stream ends without a terminal frame, so the reply looks truncated rather than failed.',
      fix: 'Press Resume. If it repeats at the same minute every time, the VPN is the suspect (see MTU below).',
      severity: 'local',
    },
    {
      id: 'mtu-vpn',
      match: /err_connection_closed|err_empty_response|packet too big|mtu/i,
      what: 'MTU / VPN path problem',
      why: 'Large response frames die while small requests succeed. Classic on PPPoE and on some WireGuard setups: the handshake works, the payload does not.',
      fix: 'Lower the MTU on the tunnel (1400 or 1380 is the usual first try) or switch the VPN off for one run to confirm.',
      severity: 'local',
    },
    {
      id: 'no-host',
      match: /no_host|host (is )?(offline|not answering)|native messaging host not found|cannot connect to host/i,
      what: 'The local host is not running',
      why: 'The browser could not start or reach the native-messaging host, so every tool call had nowhere to go.',
      fix: 'Run ./install.sh again, then reopen the popup. It prints the exact manifest path it wrote.',
      severity: 'local',
    },
    {
      id: 'context-invalidated',
      match: /extension context invalidated|receiving end does not exist|message port closed/i,
      what: 'This tab is talking to an old copy of the extension',
      why: 'The extension was reloaded or updated while the tab stayed open. The old content script is orphaned.',
      fix: 'Reload the tab (F5). This is the single most common cause of "it worked a minute ago".',
      severity: 'local',
    },
    {
      id: 'dom-drift',
      match: /composer not found|send button|selector|could not write into the composer/i,
      what: 'The site changed its markup',
      why: 'The adapter looks for a structure the page no longer has. The provider shipped a redesign; the adapter is a data file and needs one line.',
      fix: 'Report it — the card names the selector that stopped matching, which is usually enough to fix it in one commit.',
      severity: 'product',
    },
    {
      id: 'no-reply',
      match: /no reply|timed out waiting|stalled|could not read your last reply/i,
      what: 'The model answered in prose, or not at all',
      why: 'Either no answer arrived inside the window, or an answer arrived without a tool block the parser could read.',
      fix: 'Send "use your tools" once. If it repeats, the prompt may be pushing the model into a chatty mode; a fresh chat fixes most of it.',
      severity: 'product',
    },
    {
      id: 'permission',
      match: /path_denied|not permitted|permission denied|eacces/i,
      what: 'The host refused a path',
      why: 'The guard denied it by name or by allowlist. That is the guard doing its job, not a crash.',
      fix: 'Add the folder to ~/.config/mdh/config.json allowPaths, or pick something inside the ones already allowed.',
      severity: 'product',
    },
    {
      id: 'truncated',
      match: /unclosed|truncated|incomplete|incomplete fence/i,
      what: 'A fence was cut in half',
      why: 'The reply stopped mid-block (stream cut, tab hidden, provider hiccup), so the tool call could not be parsed.',
      fix: 'Resume. The parser already retries once with a repair pass before giving up.',
      severity: 'product',
    },
  ];

  /* ───────────────────────────────────────────────────────────── collection */

  const str = (v, max = 200) => (v == null ? '' : String(v).slice(0, max));

  /** A browser name that is stable enough to be useful, without a UA-parsing dependency. */
  function browserName(ua = '') {
    const s = String(ua);
    if (/Firefox\/(\d+)/.test(s)) return `Firefox ${RegExp.$1}`;
    const edge = s.match(/Edg\/(\d+)/);
    if (edge) return `Edge ${edge[1]}`;
    const opera = s.match(/OPR\/(\d+)/);
    if (opera) return `Opera ${opera[1]}`;
    const brave = /Brave/.test(s);
    const chrome = s.match(/Chrome\/(\d+)/);
    if (chrome) return `${brave ? 'Brave' : 'Chrome'} ${chrome[1]}`;
    if (/Version\/(\d+).*Safari/.test(s)) return `Safari ${RegExp.$1}`;
    return 'unknown browser';
  }

  /** OS family + kernel-ish detail, from the UA and the high-entropy hints when they exist. */
  function osName(ua = '') {
    const s = String(ua);
    if (/Windows NT 10/.test(s)) return 'Windows 10/11';
    if (/Windows/.test(s)) return 'Windows';
    if (/Android/.test(s)) return 'Android';
    if (/iPhone|iPad/.test(s)) return 'iOS';
    if (/Mac OS X/.test(s)) return 'macOS';
    if (/Linux/.test(s)) return 'Linux';
    return 'unknown OS';
  }

  /**
   * Redact before display and before the URL is built. Hostnames that are one of the eight survive, because
   * a report that cannot name the site is not a report; everything else becomes <url> / <path>.
   */
  function redact(text) {
    const keep = [];
    let out = String(text ?? '');

    // 1. Park the platform URLs: a report that cannot name the site is not a report.
    out = out.replace(/https?:\/\/([^\s/"'<>)]+)[^\s"'<>)]*/gi, (whole, host) => {
      const clean = String(host).toLowerCase().replace(/^www\./, '');
      const known = KNOWN_HOSTS.some((h) => clean === h || clean.endsWith(`.${h}`));
      if (known) {
        keep.push(whole);
        return `\u0001${keep.length - 1}\u0001`;
      }
      return `<url ${clean.replace(/\./g, '·')}>`;
    });

    // 2. Now everything path-shaped is fair game, including the ones inside stacks and file:// URLs.
    out = out.replace(/file:\/\/[^\s)"']+/gi, '<path>');
    out = out.replace(/(^|[\s("'`=:[,>])\/(?:[\w.@+-]+\/)+[\w.@+-]*/g, '$1<path>');
    out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, '<email>');

    // 3. Put the platform URLs back.
    return out.replace(/\u0001(\d+)\u0001/g, (_, i) => keep[Number(i)] ?? '<url>');
  }

  function flags(fn) {
    try {
      return fn();
    } catch {
      return null;
    }
  }

  /**
   * Collect the facts. Everything is optional: a report built on a page where half the APIs are missing is
   * still a report, and `null` is honest about what the browser refused to say.
   */
  function collect({
    stage = 'unknown',
    platform = null,
    error = null,
    logTrail = [],
    host = null,
    health = null,
    extra = {},
  } = {}) {
    const nav = flags(() => globalThis.navigator) ?? {};
    const screenInfo = flags(() => globalThis.screen) ?? {};
    const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
    const uaData = nav.userAgentData ?? null;
    const tz = flags(() => Intl.DateTimeFormat().resolvedOptions().timeZone) ?? null;
    const offsetMin = flags(() => -new Date().getTimezoneOffset()) ?? null;

    return {
      at: Date.now(),
      iso: new Date().toISOString(),
      build: {
        name: 'MDH_AI',
        version: MDH.VERSION ?? 'dev',
        id: MDH.RUNTIME?.id ?? 'n/a',
        target: nav.userAgent?.includes('Firefox') ? 'firefox' : 'chrome',
      },
      browser: {
        name: browserName(nav.userAgent),
        ua: str(nav.userAgent, 400),
        language: str(nav.language),
        languages: Array.isArray(nav.languages) ? nav.languages.slice(0, 4).join(', ') : null,
        brands: uaData?.brands ? uaData.brands.map((b) => `${b.brand} ${b.version}`).slice(0, 4).join(', ') : null,
        platformHint: uaData?.platform ?? null,
        cookies: flags(() => nav.cookieEnabled),
        doNotTrack: str(nav.doNotTrack),
      },
      os: {
        name: uaData?.platform ?? osName(nav.userAgent),
        arch: str(nav.userAgentData?.architecture ?? '') || null,
        tz,
        utcOffsetMinutes: offsetMin,
      },
      device: {
        cores: nav.hardwareConcurrency ?? null,
        memoryGB: nav.deviceMemory ?? null,
        screen: screenInfo.width && screenInfo.height ? `${screenInfo.width}×${screenInfo.height}` : null,
        dpr: globalThis.devicePixelRatio ?? null,
        touch: (nav.maxTouchPoints ?? 0) > 0,
      },
      network: {
        online: nav.onLine ?? null,
        type: conn?.type ?? null,
        effectiveType: conn?.effectiveType ?? null,
        downlinkMbps: conn?.downlink ?? null,
        rttMs: conn?.rtt ?? null,
        saveData: conn?.saveData ?? null,
      },
      page: {
        origin: flags(() => location.origin) ?? null,
        host: flags(() => location.hostname) ?? null,
        platform: platform?.id ?? platform ?? null,
        readMode: platform?.read ?? null,
        visibility: flags(() => document.visibilityState) ?? null,
      },
      stage,
      failure: error
        ? {
            name: str(error.name ?? 'Error', 80),
            code: str(error.code ?? '', 40) || null,
            message: redact(str(error.message ?? error, 400)),
            stack: str(error.stack ?? '', 1200) || null,
          }
        : null,
      host: host ?? null,
      health: health ?? null,
      log: Array.isArray(logTrail) ? logTrail.slice(-60).map((e) => ({
        at: e.at ?? null,
        level: str(e.level ?? 'info', 10),
        text: redact(str(e.text ?? '', 300)),
      })) : [],
      extra,
    };
  }

  /* ─────────────────────────────────────────────────────────────── hypotheses */

  const trailText = (diag) =>
    [
      diag?.failure?.name, diag?.failure?.code, diag?.failure?.message, diag?.stage,
      ...(diag?.log ?? []).map((e) => e.text),
    ]
      .filter(Boolean)
      .join('\n');

  /**
   * Ranked guesses, each with the evidence that produced it. The word "guess" is doing real work: these are
   * labelled as hypotheses everywhere they are displayed, never as the cause. A wrong confident answer costs
   * a maintainer a day; a wrong labelled guess costs a glance.
   */
  function hypotheses(diag) {
    const text = trailText(diag);
    const found = [];
    for (const sig of SIGNATURES) {
      if (sig.match.test(text)) {
        found.push({
          id: sig.id,
          what: sig.what,
          why: sig.why,
          fix: sig.fix,
          severity: sig.severity,
          evidence: firstEvidence(text, sig.match),
        });
      }
    }

    // Facts from the host outrank string matches: a measured 12-minute clock skew explains a lot of TLS.
    const skew = Number(diag?.host?.clockSkewMs ?? 0);
    if (Math.abs(skew) > 60_000) {
      found.unshift({
        id: 'clock-skew-measured',
        what: `The system clock is ${(skew / 1000).toFixed(0)} s off the network`,
        why: 'Measured against an HTTP Date header. Anything past a minute breaks signed requests, certificate checks and some websockets, usually with an error that blames the server.',
        fix: 'Enable automatic time sync, then reload the tab. This is the cheapest fix in the list and it is invisible until measured.',
        severity: 'local',
        evidence: `skew ${skew} ms`,
      });
    }

    if (diag?.network?.online === false) {
      found.unshift({
        id: 'offline',
        what: 'The browser says it is offline',
        why: 'navigator.onLine is false, so the request never left the machine. Nothing else in this report matters until that changes.',
        fix: 'Reconnect, then press Resume. Submissions are not lost — the pending call survives a reload.',
        severity: 'local',
        evidence: 'navigator.onLine === false',
      });
    }

    if (diag?.network?.saveData) {
      found.push({
        id: 'save-data',
        what: 'Data saver is on',
        why: 'Some browsers downgrade or defer streamed responses when Save-Data is set, which can truncate a long reply.',
        fix: 'Turn data saver off for this site, or accept shorter answers.',
        severity: 'local',
        evidence: 'saveData === true',
      });
    }

    if (diag?.browser?.doNotTrack || diag?.browser?.cookies === false) {
      found.push({
        id: 'cookies',
        what: 'Cookies are disabled for this site',
        why: 'The platform cannot hold a session without them; the page will look logged out or half-loaded.',
        fix: 'Allow cookies for the platform host, then sign in again.',
        severity: 'local',
        evidence: 'cookieEnabled === false',
      });
    }

    if (!diag?.host) {
      // Only interesting when the failure was a tool call; a render bug on a page with no host is fine.
      if (/host|NO_HOST|tool/i.test(text)) {
        found.push({
          id: 'host-absent',
          what: 'The report has no host diagnostics',
          why: 'Either the host is not running, or the failure happened before it was asked. Without it there are no filesystem, clock or network facts.',
          fix: 'Run ./install.sh and press Resume; the next report will carry them.',
          severity: 'local',
          evidence: 'host: null',
        });
      }
    }

    // De-duplicate by id, keeping the highest-ranked instance.
    const seen = new Set();
    return found.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true))).slice(0, 6);
  }

  function firstEvidence(text, re) {
    for (const line of String(text).split('\n')) {
      if (re.test(line)) return line.slice(0, 160);
    }
    return '';
  }

  /* ──────────────────────────────────────────────────────────── the report body */

  const row = (k, v) => (v == null || v === '' ? null : `| ${k} | ${v} |`);

  function factsTable(diag, { includeIp = false } = {}) {
    const d = diag ?? {};
    const rows = [
      ['Build', `${d.build?.name ?? 'MDH_AI'} ${d.build?.version ?? '?'} · ${d.build?.target ?? '?'}`],
      ['When', d.iso ?? '—'],
      ['Stage', d.stage ?? '—'],
      ['Platform', d.page?.platform ?? 'none'],
      ['Page', d.page?.host ?? '—'],
      ['Read mode', d.page?.readMode ?? '—'],
      ['Browser', d.browser?.name ?? '—'],
      ['Engine hints', d.browser?.brands ?? null],
      ['OS', `${d.os?.name ?? '—'}${d.os?.arch ? ` · ${d.os.arch}` : ''}`],
      ['Timezone', d.os?.tz ? `${d.os.tz} (UTC${(d.os.utcOffsetMinutes ?? 0) >= 0 ? '+' : ''}${Math.round((d.os.utcOffsetMinutes ?? 0) / 60)})` : null],
      ['Device', [d.device?.cores ? `${d.device.cores} cores` : null, d.device?.memoryGB ? `${d.device.memoryGB} GB` : null, d.device?.screen, d.device?.dpr ? `${d.device.dpr}×` : null].filter(Boolean).join(' · ') || null],
      ['Network', [d.network?.online === false ? 'offline' : 'online', d.network?.effectiveType, d.network?.rttMs != null ? `${d.network.rttMs} ms RTT` : null, d.network?.downlinkMbps != null ? `${d.network.downlinkMbps} Mb/s` : null].filter(Boolean).join(' · ') || null],
      ['Visibility', d.page?.visibility ?? null],
      ['Host', d.host ? `${d.host.version ?? '?'} · pid ${d.host.pid ?? '?'} · skew ${d.host.clockSkewMs ?? '?'} ms` : 'no host facts'],
      ['Public IP', includeIp ? d.host?.publicIp ?? 'not probed' : 'not included (the user chose not to send it)'],
    ];
    const body = rows.map(([k, v]) => row(k, v)).filter(Boolean);
    return body.length ? ['| Field | Value |', '|---|---|', ...body].join('\n') : '';
  }

  /**
   * The markdown body that goes into the URL. It is deliberately one screen long before the log: a report a
   * maintainer has to scroll through before reaching the failure is a report read next week.
   */
  function issueBody(diag, { includeIp = false, title = '' } = {}) {
    const d = diag ?? {};
    const hyps = hypotheses(d);
    const lines = [];

    if (title) lines.push(`**${redact(title)}**`, '');

    lines.push(
      '### What happened',
      '',
      redact(d.failure?.message || '(no message — the run stopped without one)'),
      '',
      '### What the extension thinks might be going on',
      '',
      '*Guesses from the local signature table, ranked. They are hypotheses, not the cause — but they are the*',
      '*difference between a report that needs three months and one that needs three minutes.*',
      '',
    );

    if (hyps.length) {
      for (const h of hyps) {
        lines.push(`- **${h.what}** _(${h.severity})_ — ${h.why}`, `  - Try: ${h.fix}`,
          h.evidence ? `  - Evidence: \`${h.evidence.replace(/`/g, "'")}\`` : '');
      }
    } else {
      lines.push('- No known signature matched. That makes this interesting rather than impossible: the log below is the useful part.');
    }
    lines.push('');

    lines.push('### Facts', '', factsTable(d, { includeIp }), '');

    if (d.extra?.selectors) {
      lines.push('### Selectors the adapter looked for', '', '```', redact(String(d.extra.selectors)), '```', '');
    }

    const trail = (d.log ?? []).slice(-40);
    lines.push('### Log (last 40 lines)', '', '```');
    if (trail.length) {
      for (const e of trail) lines.push(`${e.at ? new Date(e.at).toISOString() : '—'} ${e.level} ${e.text}`);
    } else {
      lines.push('(empty — the popup keeps a longer one under Advanced → Copy log)');
    }
    lines.push('```', '');

    if (d.failure?.stack) {
      lines.push('<details><summary>Stack</summary>', '', '```', redact(d.failure.stack), '```', '', '</details>', '');
    }

    lines.push(
      '---',
      '',
      '_Built locally by MDH_AI. Nothing was uploaded to build this; it travels only because you pressed Submit._',
      `_Nothing identifying was included on purpose: file paths and non-platform URLs are redacted, and the` +
        ` public IP is only present if you chose to include it._`,
    );

    return lines.filter((l) => l !== null).join('\n');
  }

  function issueUrl(diag, { includeIp = false, title = '' } = {}) {
    const t = redact(title || `[bug] ${diag?.stage ?? 'failure'} on ${diag?.page?.platform ?? 'unknown'}`);
    const body = issueBody(diag, { includeIp, title: '' });
    const params = new URLSearchParams({
      template: 'bug_report.yml',
      title: t.slice(0, 200),
      body: body.slice(0, 7500),
    });
    return `${ISSUE}&${params.toString()}`;
  }

  /** A short, human version for the in-page card: three lines at most, facts first. */
  function summary(diag) {
    const d = diag ?? {};
    const hyps = hypotheses(d);
    return {
      stage: d.stage ?? 'unknown',
      platform: d.page?.platform ?? 'unknown',
      browser: d.browser?.name ?? 'unknown',
      what: hyps[0]?.what ?? 'No known cause matched',
      fix: hyps[0]?.fix ?? 'The log is the useful part — please attach it.',
      guessCount: hyps.length,
    };
  }

  /** Everything the viewer, the clipboard and the JSON export need, in one object. */
  function bundle(diag, opts = {}) {
    return {
      schema: 1,
      generatedAt: new Date().toISOString(),
      diag,
      hypotheses: hypotheses(diag),
      body: issueBody(diag, opts),
      url: issueUrl(diag, opts),
    };
  }

  MDH.diag = {
    KNOWN_HOSTS,
    SIGNATURES,
    collect,
    hypotheses,
    issueBody,
    issueUrl,
    factsTable,
    summary,
    bundle,
    redact,
    browserName,
    osName,
    size: () => SIGNATURES.length,
  };
})();
