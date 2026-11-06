/**
 * host/viewer.mjs — a log page you can actually look at.
 *
 * The audit log is a JSONL file in `~/.local/state/mdh/`. That is the right format for a machine and the
 * wrong one for a person at 11 pm who wants to know why the last task died. So this module renders the same
 * data as one self-contained HTML page, and can serve it live on loopback for the ninety seconds anybody
 * needs a live view.
 *
 * Design rules, all of them consequences of past mistakes elsewhere:
 *   • **No script in the page.** The CSP is `default-src 'none'` and the page still works: filtering is done
 *     by sorting, collapsing and anchor links. A log viewer that needs a script to show a log is a supply
 *     chain with a textarea.
 *   • **Loopback only.** `listen(port, '127.0.0.1')` — not `0.0.0.0`, not `::`. A diagnostic server on a LAN
 *     is a diagnostic server on somebody else's LAN.
 *   • **Token in the URL.** 24 random bytes, compared in constant time. The URL is printed once, to the
 *     terminal of the person who asked for it.
 *   • **Nothing is fetched.** No fonts, no icons, no CDN, no analytics. The page works with the network
 *     unplugged, which is precisely when a log viewer is needed.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

/* ───────────────────────────────────────────────────────────────────── escaping */

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Short, stable hash prefix: enough to spot an edit in the chain, too short to be a secret. */
const short = (hash) => (typeof hash === 'string' && hash.length >= 8 ? hash.slice(0, 10) : '—');

const ms = (n) => (typeof n === 'number' ? `${n} ms` : '—');

const filteredCount = (shown, total) =>
  shown === total ? `${total} calls` : `${shown} of ${total} calls shown — the rest are filtered out`;

const when = (at) => {
  const date = at ? new Date(at) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
};

/* ──────────────────────────────────────────────────────────────────── filtering */

export const STATUSES = ['ok', 'denied', 'error'];

/**
 * Server-side filtering, because the page has no script and never will. Anything the user can narrow is a
 * query parameter, which also means every filtered view is a URL they can bookmark or paste into a report.
 */
export function filterEntries(entries = [], { status = [], tool = '', q = '', level = [] } = {}) {
  const wanted = Array.isArray(status) ? status.filter((v) => STATUSES.includes(v)) : [];
  const needle = String(q ?? '').trim().toLowerCase();
  const toolName = String(tool ?? '').trim().toLowerCase();

  return entries.filter((entry) => {
    if (wanted.length && !wanted.includes(entry.status)) return false;
    if (toolName && !String(entry.tool ?? '').toLowerCase().includes(toolName)) return false;
    if (needle) {
      const hay = `${entry.tool ?? ''} ${entry.detail ?? ''} ${entry.args?.path ?? ''} ${entry.args?.cmd ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    if (Array.isArray(level) && level.length) {
      // Audit rows carry no level; they are records, so they count as `info` rather than vanishing.
      if (!level.includes(String(entry.level ?? 'info'))) return false;
    }
    return true;
  });
}

const LEVELS = ['debug', 'info', 'warn', 'error'];

/* ──────────────────────────────────────────────────────────────────── summaries */

/**
 * Percentiles over the last calls. Not statistics, just enough to answer "is this slow, or is this broken".
 * `ms` values that are missing are ignored rather than treated as zero, which would make every average lie.
 */
export function summary(entries = []) {
  const byTool = new Map();
  const times = [];
  let denied = 0;
  let errors = 0;

  for (const entry of entries) {
    const tool = String(entry.tool ?? 'unknown');
    const row = byTool.get(tool) ?? { tool, calls: 0, ok: 0, denied: 0, error: 0, ms: [] };
    row.calls += 1;
    if (entry.status === 'ok') row.ok += 1;
    else if (entry.status === 'denied') {
      row.denied += 1;
      denied += 1;
    } else {
      row.error += 1;
      errors += 1;
    }
    if (typeof entry.ms === 'number') {
      row.ms.push(entry.ms);
      times.push(entry.ms);
    }
    byTool.set(tool, row);
  }

  const percentile = (list, p) => {
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  };

  const rows = [...byTool.values()]
    .map((row) => ({
      ...row,
      p50: percentile(row.ms, 50),
      p95: percentile(row.ms, 95),
      slowest: row.ms.length ? Math.max(...row.ms) : null,
    }))
    .sort((a, b) => b.calls - a.calls);

  return {
    calls: entries.length,
    denied,
    errors,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    tools: rows,
  };
}

/* ─────────────────────────────────────────────────────────────────────── the page */

const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 28px 22px 60px; background: #0b0b12; color: #d7d9e3;
  font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 15px; margin: 28px 0 10px; color: #c7d2fe; font-weight: 600; letter-spacing: .02em; }
.sub { color: #8b90a5; margin: 0 0 6px; }
code, pre, td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.badge { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 11px; border: 1px solid; }
.ok { color: #34d399; border-color: #14532d; background: #052e1a; }
.bad { color: #fda4af; border-color: #7f1d1d; background: #2a0b13; }
.warn { color: #fbbf24; border-color: #78350f; background: #2a1b06; }
.muted { color: #7c8298; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #1b1c2a; vertical-align: top; }
th { color: #9aa1b8; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
tr:hover td { background: #11121c; }
.card { border: 1px solid #232434; border-radius: 10px; padding: 14px 16px; margin-top: 12px; background: #0e0f18; }
.card h3 { margin: 0 0 6px; font-size: 13.5px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
.tile { border: 1px solid #232434; border-radius: 10px; padding: 10px 12px; background: #0e0f18; }
.tile b { display: block; font-size: 20px; color: #e5e7eb; }
.tile span { font-size: 11.5px; color: #8b90a5; text-transform: uppercase; letter-spacing: .06em; }
details { margin-top: 8px; }
summary { cursor: pointer; color: #a5b4fc; }
.card.danger { border-color: #7f1d1d; background: #17090d; }
.card.danger h3 { color: #fecaca; }
.danger-btn { border-radius: 7px; border: 1px solid #7f1d1d; background: #2a0b13; color: #fecaca; padding: 6px 12px;
  font: inherit; font-weight: 600; cursor: pointer; }
.card.danger .reset { margin-left: 10px; color: #9aa1b8; }
nav.bar { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between;
  margin-top: 14px; padding: 10px 12px; border: 1px solid #232434; border-radius: 10px; background: #0d0e16; }
.filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 12px; color: #9aa1b8; }
.filters label { display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
.filters .fl { text-transform: uppercase; letter-spacing: .06em; font-size: 10.5px; color: #6b7280; }
.filters input[type=search] { padding: 4px 7px; border-radius: 6px; border: 1px solid #2a2547; background: #12111c; color: #e5e7eb; font: inherit; }
.filters button, .btn { border-radius: 7px; border: 1px solid #2a2547; background: #171627; color: #e5e7eb;
  padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; text-decoration: none; }
.filters .reset { color: #8b90a5; }
.tools { display: flex; gap: 8px; }
.note { margin-top: 10px; padding: 8px 10px; border-radius: 8px; font-size: 12.5px; border: 1px solid #14532d; background: #052e1a; color: #86efac; }
footer { margin-top: 36px; color: #6b7280; font-size: 12px; border-top: 1px solid #1b1c2a; padding-top: 14px; }
@media (prefers-color-scheme: light) {
  body { background: #fbfbfd; color: #1f2330; }
  h2 { color: #3730a3; }
  td, th { border-color: #e6e7ee; }
  .card, .tile { background: #fff; border-color: #e6e7ee; }
  tr:hover td { background: #f4f5fa; }
}
`;

/**
 * Render the whole page from data. Pure: no I/O, no clock reads beyond the passed `generatedAt`, so a test
 * can compare two runs byte for byte.
 */
export function renderPage({
  entries = [],
  allEntries = null,
  meta = {},
  diag = null,
  generatedAt = Date.now(),
  live = false,
  query = {},
  archived = null,
  confirm = null,
} = {}) {
  const view = query.view === 'stats' ? 'stats' : 'all';
  const trail = diag?.diag?.log ?? [];
  const filteredTrail = filterEntries(
    trail.map((line) => ({ ...line, tool: 'log', status: 'ok' })),
    { level: query.level ?? [] },
  );
  const total = Array.isArray(allEntries) ? allEntries.length : entries.length;
  const stat = summary(entries);
  const hiddenCount = Math.max(0, total - entries.length);
  const audit = meta.audit ?? null;
  const chain = audit ? (audit.ok ? '<span class="badge ok">chain verified</span>' : '<span class="badge bad">chain broken</span>') : '<span class="badge warn">not checked</span>';

  const tiles = [
    ['calls', stat.calls],
    ['denied', stat.denied],
    ['errors', stat.errors],
    ['p50', stat.p50 == null ? '—' : `${stat.p50} ms`],
    ['p95', stat.p95 == null ? '—' : `${stat.p95} ms`],
  ]
    .map(([label, value]) => `<div class="tile"><b>${esc(value)}</b><span>${esc(label)}</span></div>`)
    .join('');

  const toolRows = stat.tools
    .map(
      (row) => `<tr><td class="mono">${esc(row.tool)}</td><td>${row.calls}</td><td>${row.ok}</td><td>${row.denied}</td>
        <td>${row.error}</td><td>${esc(ms(row.p50))}</td><td>${esc(ms(row.p95))}</td></tr>`,
    )
    .join('');

  const newestFirst = [...entries].reverse().slice(0, 500);
  const entryRows = newestFirst
    .map((entry) => {
      const tone = entry.status === 'ok' ? 'ok' : entry.status === 'denied' ? 'warn' : 'bad';
      const detail = entry.detail ?? entry.args?.path ?? entry.args?.cmd ?? '';
      return `<tr><td class="mono">${esc(when(entry.at))}</td><td class="mono">${esc(entry.tool)}</td>
        <td><span class="badge ${tone}">${esc(entry.status ?? '?')}</span></td>
        <td class="mono">${esc(short(entry.hash))}</td><td class="mono">${esc(ms(entry.ms))}</td>
        <td class="mono">${esc(String(detail).slice(0, 220))}</td></tr>`;
    })
    .join('');

  const diagBlock = diag
    ? `<h2>Last failure report</h2>
       <div class="card">
         <h3>${esc(diag.summary?.what ?? diag.hypotheses?.[0]?.what ?? 'no hypothesis matched')}
           <span class="badge warn">hypothesis</span></h3>
         <p class="sub">${esc(diag.summary?.fix ?? diag.hypotheses?.[0]?.fix ?? 'The log below is the useful part.')}</p>
         <details><summary>Everything that was collected</summary>
           <pre>${esc(JSON.stringify(diag.diag ?? diag, null, 2).slice(0, 20000))}</pre>
         </details>
       </div>`
    : '';

  const title = `MDH_AI · ${stat.calls} calls`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
${live ? '<meta http-equiv="refresh" content="5">' : ''}
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<h1>MDH_AI — local log</h1>
<p class="sub">Generated ${esc(when(generatedAt))}${live ? ' · auto-refresh 5 s' : ''} · host ${esc(meta.hostVersion ?? '?')} · pid ${esc(meta.pid ?? '?')} · ${chain}</p>

<div class="tiles">${tiles}</div>
<p class="sub">${esc(filteredCount(entries.length, total))}</p>

<nav class="bar" aria-label="Log controls">
  <form method="get" class="filters">
    <input type="hidden" name="token" value="${esc(meta.tokenValue ?? '')}">
    <span class="fl">Show</span>
    ${STATUSES.map(
      (status) =>
        `<label><input type="checkbox" name="status" value="${status}"${(query.status ?? []).includes(status) ? ' checked' : ''}> ${status}</label>`,
    ).join('')}
    <span class="fl">Log levels</span>
    ${LEVELS.map(
      (level) =>
        `<label><input type="checkbox" name="level" value="${level}"${(query.level ?? []).includes(level) ? ' checked' : ''}> ${level}</label>`,
    ).join('')}
    <input class="q" type="search" name="q" value="${esc(query.q ?? '')}" placeholder="filter text…" aria-label="Filter text">
    <button type="submit">Apply</button>
    <a class="reset" href="?token=${esc(encodeURIComponent(meta.tokenValue ?? ''))}">Reset</a>
  </form>
  <div class="tools">
    ${
      view === 'stats'
        ? `<a class="btn" href="?token=${esc(encodeURIComponent(meta.tokenValue ?? ''))}&view=all">Show log</a>`
        : `<a class="btn" href="?token=${esc(encodeURIComponent(meta.tokenValue ?? ''))}&view=stats">Hide log</a>`
    }
    <a class="btn" href="?token=${esc(encodeURIComponent(meta.tokenValue ?? ''))}&confirm=archive">Archive &amp; clear…</a>
  </div>
</nav>
${archived ? `<p class="note ok-note">Archived <code>${esc(archived === '1' ? 'the previous chain' : archived)}</code> and started a new chain. The old file is still on disk.</p>` : ''}
${
  confirm === 'archive'
    ? `<div class="card danger">
         <h3>Archive the audit chain?</h3>
         <p class="sub">The current <code>audit.jsonl</code> is renamed with a timestamp and a new chain starts from
           genesis. Nothing is deleted: the record of what ran on this machine stays on this machine.</p>
         <form method="post" action="/archive?token=${esc(encodeURIComponent(meta.tokenValue ?? ''))}">
           <button class="danger-btn" type="submit">Yes, archive it</button>
           <a class="reset" href="?token=${esc(encodeURIComponent(meta.tokenValue ?? ''))}">Cancel</a>
         </form>
       </div>`
    : ''
}
${diagBlock}

<h2>By tool</h2>
<table><thead><tr><th>tool</th><th>calls</th><th>ok</th><th>denied</th><th>errors</th><th>p50</th><th>p95</th></tr></thead>
<tbody>${toolRows || '<tr><td colspan="7" class="muted">No calls recorded yet. Start a task and this fills itself.</td></tr>'}</tbody></table>

<h2>Extension log</h2>
<table><thead><tr><th>when</th><th>level</th><th>line</th></tr></thead>
<tbody>${
    filteredTrail.length
      ? filteredTrail
          .slice(-120)
          .reverse()
          .map(
            (line) =>
              `<tr><td class="mono">${esc(when(line.at))}</td><td><span class="badge ${esc(line.level === 'warn' ? 'warn' : line.level === 'error' ? 'bad' : 'ok')}">${esc(line.level ?? 'info')}</span></td><td class="mono">${esc(line.text)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="3" class="muted">No extension log lines match. Clear the filters or finish a run.</td></tr>'
  }</tbody></table>

<h2>${view === 'stats' ? 'Log hidden' : 'Every call, newest first'}</h2>
<table><thead><tr><th>when</th><th>tool</th><th>status</th><th>hash</th><th>time</th><th>detail</th></tr></thead>
<tbody>${
    view === 'stats'
      ? `<tr><td colspan="6" class="muted">Log hidden — <a href="?token=${esc(encodeURIComponent(meta.tokenValue ?? ''))}&view=all">show it</a>. The totals above are still real.</td></tr>`
      : entryRows || '<tr><td colspan="6" class="muted">Empty. That is an honest zero, not an error.</td></tr>'
  }</tbody></table>

<footer>
  Read from <code>${esc(meta.stateDir ?? '~/.local/state/mdh')}</code>. Filters are query parameters, so a filtered
  view can be bookmarked or pasted into a report. "Archive &amp; clear" never deletes: it renames the audit file
  with a timestamp and starts a new chain from genesis. Nothing on this page was uploaded anywhere;
  it is the same file your machine wrote. The hash column is the first ten characters of each entry's chain
  hash — enough to see a gap, too short to be useful to anybody else.<br>
  ${meta.token ? 'Close this tab when you are done: the URL carries a token that only works on loopback.' : ''}
</footer>
</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────────────────── serving */

/**
 * Start the loopback viewer. Explicitly binds `127.0.0.1`: binding `0.0.0.0` "just in case" is how a local
 * diagnostic becomes a LAN service with no authentication story.
 */
export function startViewer({ getState, clear, port = 0, token = null, host = '127.0.0.1' } = {}) {
  const secret = token ?? randomBytes(24).toString('base64url');
  const digest = createHash('sha256').update(secret).digest();

  const authorised = (url) => {
    const given = url.searchParams.get('token') ?? '';
    const candidate = createHash('sha256').update(given).digest();
    return candidate.length === digest.length && timingSafeEqual(candidate, digest);
  };

  const headers = (extra = {}) => ({
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy':
      // `form-action 'self'` is the one relaxation, and it exists for the filter form. No script is allowed,
      // now or later: a log viewer that can execute something is a log viewer that can be made to execute it.
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
    ...extra,
  });

  const server = createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
    } catch {
      res.writeHead(400, headers()).end('bad request');
      return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, headers({ 'content-type': 'application/json' })).end('{"ok":true}');
      return;
    }

    if (!authorised(url)) {
      // 404, not 403: a probing page should not learn that a token exists.
      res.writeHead(404, headers({ 'content-type': 'text/plain; charset=utf-8' })).end('not found');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      res.writeHead(405, headers({ allow: 'GET, POST', 'content-type': 'text/plain; charset=utf-8' })).end('method not allowed');
      return;
    }

    // Archive-and-clear is the only state change this server can make, it needs the token, it needs to be a
    // POST, and it never deletes: it renames the chain and starts a fresh one from genesis.
    if (url.pathname === '/archive') {
      if (req.method !== 'POST') {
        res.writeHead(405, headers({ allow: 'POST', 'content-type': 'text/plain; charset=utf-8' })).end('POST only');
        return;
      }
      Promise.resolve(typeof clear === 'function' ? clear() : { ok: false, error: 'no archiver configured' })
        .then((result) => {
          if (!result?.ok) {
            res.writeHead(500, headers({ 'content-type': 'text/plain; charset=utf-8' })).end(`archive failed: ${result?.error ?? 'unknown'}`);
            return;
          }
          const next = new URL('/', 'http://127.0.0.1');
          next.searchParams.set('token', secret);
          next.searchParams.set('archived', result.file ?? '1');
          res.writeHead(303, headers({ location: `${next.pathname}${next.search}` })).end();
        })
        .catch((e) => {
          res.writeHead(500, headers({ 'content-type': 'text/plain; charset=utf-8' })).end(`archive failed: ${e.message}`);
        });
      return;
    }

    const state = typeof getState === 'function' ? getState() : (getState ?? {});
    const query = {
      status: url.searchParams.getAll('status'),
      level: url.searchParams.getAll('level'),
      q: url.searchParams.get('q') ?? '',
      tool: url.searchParams.get('tool') ?? '',
      view: url.searchParams.get('view') ?? 'all',
    };
    const entries = filterEntries(state.entries ?? [], query);
    const payload = {
      entries,
      allEntries: state.entries ?? [],
      meta: { ...(state.meta ?? {}), token: true, tokenValue: secret },
      diag: state.diag ?? null,
      query,
      archived: url.searchParams.get('archived'),
      confirm: url.searchParams.get('confirm'),
      generatedAt: Date.now(),
    };

    if (url.pathname === '/data.json') {
      res.writeHead(200, headers({ 'content-type': 'application/json; charset=utf-8' }));
      res.end(
        JSON.stringify({
          entries: payload.entries,
          total: payload.allEntries.length,
          query,
          meta: state.meta ?? {},
          hypotheses: state.diag?.hypotheses ?? [],
        }),
      );
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, headers());
      res.end(renderPage({ ...payload, live: true }));
      return;
    }

    res.writeHead(404, headers({ 'content-type': 'text/plain; charset=utf-8' })).end('not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      const base = `http://${host}:${address.port}/`;
      resolve({
        url: `${base}?token=${encodeURIComponent(secret)}`,
        base,
        port: address.port,
        token: secret,
        close: () => new Promise((done) => server.close(() => done())),
        _server: server,
      });
    });
  });
}
