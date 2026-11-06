import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPage, summary, esc, startViewer, filterEntries } from '../host/viewer.mjs';

const entries = [
  { at: Date.parse('2026-11-06T10:00:00Z'), tool: 'read_file', status: 'ok', ms: 12, hash: 'aaaaaaaaaaaa', detail: '/home/x/a.txt' },
  { at: Date.parse('2026-11-06T10:00:01Z'), tool: 'read_file', status: 'ok', ms: 20, hash: 'bbbbbbbbbbbb', detail: '/home/x/b.txt' },
  { at: Date.parse('2026-11-06T10:00:02Z'), tool: 'run_command', status: 'denied', ms: 1, hash: 'cccccccccccc', detail: 'sudo rm -rf /' },
  { at: Date.parse('2026-11-06T10:00:03Z'), tool: 'run_command', status: 'error', hash: 'dddddddddddd', detail: 'exit 2' },
];

test('the page is self-contained and script-free', () => {
  const html = renderPage({ entries, meta: { hostVersion: '1.0.0', pid: 7 } });
  assert.match(html, /<!doctype html>/i);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /https?:\/\//, 'the page must not reference anything off-machine');
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /read_file/);
  assert.match(html, /4<\/b><span>calls/);
});

test('a malicious tool name or path cannot escape the table', () => {
  const evil = renderPage({
    entries: [{ at: Date.now(), tool: '<img src=x onerror=alert(1)>', status: 'ok', ms: 1, detail: '</td></script><script>alert(2)</script>' }],
  });
  assert.ok(!evil.includes('<img src=x'), 'tool names are escaped');
  assert.ok(!evil.includes('</script><script>alert(2)'), 'detail is escaped');
  assert.ok(evil.includes('&lt;img'), 'the escaped form is present, so the data is not simply dropped');
});

test('esc covers the five characters that matter', () => {
  assert.equal(esc(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

test('percentiles ignore missing timings instead of counting them as zero', () => {
  const stat = summary([
    { tool: 'a', status: 'ok', ms: 10 },
    { tool: 'a', status: 'ok', ms: 30 },
    { tool: 'a', status: 'error' },
    { tool: 'b', status: 'denied', ms: 100 },
  ]);
  assert.equal(stat.calls, 4);
  assert.equal(stat.denied, 1);
  assert.equal(stat.errors, 1);
  assert.equal(stat.p50, 30);
  assert.equal(stat.tools[0].tool, 'a');
  assert.equal(stat.tools.find((t) => t.tool === 'a').error, 1);
});

test('an empty log is an honest zero, not a crash', () => {
  const html = renderPage({ entries: [] });
  assert.match(html, /No calls recorded yet/);
  assert.match(html, /><b>0<\/b><span>calls/);
});

test('the live viewer answers only with the token, and only on loopback', async () => {
  const viewer = await startViewer({
    getState: () => ({ entries, meta: { hostVersion: '1.0.0', pid: 7 }, diag: { summary: { what: 'test', fix: 'do the thing' }, hypotheses: [] } }),
  });

  try {
    assert.equal(viewer._server.address().address, '127.0.0.1', 'never bind 0.0.0.0');
    assert.ok(/^http:\/\/127\.0\.0\.1:\d+\/\?token=/.test(viewer.url));

    const authed = await fetch(viewer.url);
    assert.equal(authed.status, 200);
    assert.match(authed.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(authed.headers.get('x-frame-options'), 'DENY');
    assert.equal(authed.headers.get('cache-control'), 'no-store');

    const anonymous = await fetch(viewer.base);
    assert.equal(anonymous.status, 404, 'no token: no page, and no hint that one exists');

    const wrong = await fetch(`${viewer.base}?token=guess`);
    assert.equal(wrong.status, 404);

    const health = await fetch(`${viewer.base}health`.replace('//health', '/health'));
    assert.equal(health.status, 200);

    const json = await fetch(viewer.url.replace('/?', '/data.json?'));
    assert.equal(json.status, 200);
    const payload = await json.json();
    assert.equal(payload.entries.length, 4);

    const nope = await fetch(viewer.url.replace('/?', '/../../etc/passwd?'));
    assert.equal(nope.status, 404);
  } finally {
    await viewer.close();
  }
});

test('the served page refreshes itself without any script', () => {
  const live = renderPage({ entries: [], live: true });
  assert.match(live, /<meta http-equiv="refresh" content="5">/);
  assert.match(live, /auto-refresh 5 s/);
  assert.doesNotMatch(live, /<script/i, 'a refresh is not a reason to allow scripts');
  const snapshot = renderPage({ entries: [] });
  assert.doesNotMatch(snapshot, /http-equiv="refresh"/, 'a saved file must not reload itself');
});

test('filters are query parameters, so a filtered view is a link', () => {
  const only = filterEntries(entries, { status: ['error'] });
  assert.equal(only.length, 1);
  assert.equal(only[0].tool, 'run_command');
  assert.equal(filterEntries(entries, { status: ['ok', 'denied'] }).length, 3);
  assert.equal(filterEntries(entries, { q: 'sudo' }).length, 1);
  assert.equal(filterEntries(entries, { tool: 'read_file' }).length, 2);
  assert.equal(filterEntries(entries, { status: ['nonsense'] }).length, 4, 'a bogus filter is ignored, not empty');
  assert.equal(filterEntries(entries, { level: ['info'] }).length, 4, 'a record with no level counts as info');
  assert.equal(filterEntries(entries, { level: ['warn'] }).length, 0);
});

test('the page says how much is filtered out, and can hide the log', () => {
  const some = renderPage({ entries: [entries[0]], allEntries: entries, meta: { tokenValue: 't' } });
  assert.match(some, /1 of 4 calls shown/);
  const all = renderPage({ entries, allEntries: entries, meta: { tokenValue: 't' } });
  assert.match(all, /4 calls/);
  assert.doesNotMatch(all, /filtered out/);

  const hidden = renderPage({ entries, allEntries: entries, meta: { tokenValue: 't' }, query: { view: 'stats' } });
  assert.match(hidden, /Log hidden/);
  assert.match(hidden, /show it/);
  assert.match(hidden, /Show log/, 'the toolbar offers the way back');
});

test('archiving is a two-step, token-bound POST that never deletes', async () => {
  let called = 0;
  const viewer = await startViewer({
    getState: () => ({ entries, meta: { hostVersion: '1.0.0' } }),
    clear: async () => {
      called += 1;
      return { ok: true, file: '/home/x/.local/state/mdh/audit-2026-01-01.jsonl' };
    },
  });
  const token = new URL(viewer.url).searchParams.get('token');

  try {
    const confirm = await fetch(`${viewer.base}?token=${token}&confirm=archive`);
    const confirmHtml = await confirm.text();
    assert.match(confirmHtml, /Archive the audit chain\?/);
    assert.match(confirmHtml, /method="post"/, 'the destructive action must not be a GET link');

    const blocked = await fetch(`${viewer.base}archive`, { method: 'POST' });
    assert.equal(blocked.status, 404);
    assert.equal(called, 0, 'a POST without the token must not archive anything');

    const viaGet = await fetch(`${viewer.base}archive?token=${token}`);
    assert.equal(viaGet.status, 405);

    const ok = await fetch(`${viewer.base}archive?token=${token}`, { method: 'POST', redirect: 'manual' });
    assert.equal(ok.status, 303);
    assert.equal(called, 1);
    assert.match(ok.headers.get('location'), /archived=/);
    assert.doesNotMatch(ok.headers.get('location'), /delete|truncate/i, 'the flow archives, it does not delete');
  } finally {
    await viewer.close();
  }
});

test('hiding the log keeps the filter you just set', async () => {
  const html = renderPage({
    entries,
    allEntries: entries,
    meta: { tokenValue: 'tok' },
    query: { status: ['error'], q: 'exit' },
    view: 'all',
  });
  const hideHref = html.match(/href="\?([^"]*view=stats[^"]*)"/)?.[1] ?? '';
  assert.ok(hideHref, 'the hide link exists');
  const params = new URLSearchParams(hideHref.replace(/&amp;/g, '&'));
  assert.equal(params.get('status'), 'error', 'the status filter survives the toggle');
  assert.equal(params.get('q'), 'exit');
  assert.equal(params.get('token'), 'tok');

  const hidden = renderPage({
    entries, allEntries: entries, meta: { tokenValue: 'tok' },
    query: { status: ['error'], view: 'stats' },
  });
  const showHref = hidden.match(/href="\?([^"]*view=all[^"]*)"/)?.[1] ?? '';
  assert.equal(new URLSearchParams(showHref.replace(/&amp;/g, '&')).get('status'), 'error', 'and so does the way back');
});

test('the filter form is multi-select, counted, and honest about "everything"', () => {
  const rows = [
    { at: Date.now(), tool: 'run-command', status: 'error', level: 'warn' },
    { at: Date.now(), tool: 'read-file', status: 'ok' },
    { at: Date.now(), tool: 'read-file', status: 'denied' },
  ];
  const plain = renderPage({ entries: rows, allEntries: rows, meta: { tokenValue: 'tok' }, query: {} });
  assert.match(plain, /name="status" value="error"/, 'statuses are checkboxes');
  assert.match(plain, /name="level" value="warn"/, 'levels are checkboxes');
  assert.match(plain, /error <span class="n">1<\/span>/, 'each box shows how many it would match');
  assert.match(plain, /info <span class="n">2<\/span>/, 'a row without a level counts as info');
  assert.match(plain, /No filters — showing every call/, 'ticking nothing means everything');
  assert.match(plain, /Show all/, 'and there is one click back to it');

  const two = renderPage({
    entries: rows, allEntries: rows, meta: { tokenValue: 'tok' },
    query: { status: ['error', 'denied'], level: ['warn'] },
  });
  assert.match(two, /name="status" value="error" checked/, 'two statuses can be ticked at once');
  assert.match(two, /name="status" value="denied" checked/);
  assert.match(two, /name="level" value="warn" checked/);
  assert.match(two, /name="level" value="debug">/, 'an unticked box stays unticked');
  assert.match(two, /Filtering by status error · status denied · level warn/, 'the page says which are active');
  assert.match(two, /clear all/);
});

test('calls are grouped into runs, and a run is a link', () => {
  const now = Date.now();
  const rows = [
    { at: new Date(now - 4000).toISOString(), tool: 'run-command', status: 'ok', run: 'run-1' },
    { at: new Date(now - 3000).toISOString(), tool: 'read-file', status: 'error', run: 'run-1' },
    { at: new Date(now - 1000).toISOString(), tool: 'read-file', status: 'ok', run: 'run-2' },
    { at: new Date(now - 90000).toISOString(), tool: 'read-file', status: 'ok' },
  ];
  const html = renderPage({ entries: rows, allEntries: rows, meta: { tokenValue: 'tok' }, query: {} });
  assert.match(html, /class="runs"/);
  assert.match(html, /<b>run-1<\/b> <span class="muted">2 calls · <span class="bad">1 failed/);
  assert.match(html, /earlier calls/, 'entries from before the id are grouped honestly, not guessed');
  const link = html.match(/href="\?([^"]*run=run-1[^"]*)"/)?.[1] ?? '';
  assert.ok(link.includes('token=tok'), 'the link keeps the token');
  assert.equal(filterEntries(rows, { run: 'run-1' }).length, 2);
  assert.equal(filterEntries(rows, { run: 'nope' }).length, 0);
  assert.equal(filterEntries(rows, { run: '' }).length, 4, 'no run filter means all of them');

  const filtered = renderPage({ entries: rows.slice(0, 2), allEntries: rows, meta: { tokenValue: 'tok' }, query: { run: 'run-1' } });
  assert.match(filtered, /class="run active"/);
  assert.match(filtered, /run run-1/, 'the filter sentence names the run');
  assert.match(filtered, /all runs/);
});

test('the run filter is part of the URL the rest of the page builds', () => {
  const rows = [{ at: new Date().toISOString(), tool: 'x', status: 'ok', run: 'run-9' }];
  const html = renderPage({ entries: rows, allEntries: rows, meta: { tokenValue: 'tok' }, query: { run: 'run-9' } });
  const hide = html.match(/href="\?([^"]*view=stats[^"]*)"/)?.[1] ?? '';
  assert.match(hide, /run=run-9/, 'hiding the log keeps the run too');
});

test('every row opens to the record underneath it', () => {
  const rows = [
    {
      at: new Date().toISOString(),
      tool: 'run_command',
      status: 'ok',
      run: 'run-7',
      args: { cmd: 'npm test' },
      detail: '208 passing',
      hash: 'abcdef1234567890',
      ms: 900,
    },
  ];
  const html = renderPage({ entries: rows, allEntries: rows, meta: { tokenValue: 'tok' }, query: {} });
  assert.match(html, /<details class="args">/);
  assert.match(html, /npm test/, 'the arguments are visible once opened');
  assert.match(html, /abcdef1234567890/, 'and the full hash, not just the prefix');
  assert.match(html, /run run-7/);
  assert.ok(!html.includes('<script'), 'still no script: <details> is HTML');
});

test('selecting a run opens it end to end', () => {
  const now = Date.now();
  const rows = [
    { at: new Date(now - 5000).toISOString(), tool: 'list_dir', status: 'ok', run: 'run-9' },
    { at: new Date(now - 4000).toISOString(), tool: 'run_command', status: 'ok', run: 'run-9' },
    { at: new Date(now - 3000).toISOString(), tool: 'write_file', status: 'denied', run: 'run-9' },
    { at: new Date(now - 2000).toISOString(), tool: 'finish', status: 'ok', run: 'run-9' },
  ];
  const html = renderPage({ entries: rows, allEntries: rows, meta: { tokenValue: 'tok' }, query: { run: 'run-9' } });
  assert.match(html, /class="card runview"/);
  assert.match(html, /4 calls · 1 failed/);
  assert.match(html, /list_dir ok → run_command ok → write_file denied → finish ok/, 'the order is the point');
  assert.match(html, /A call that is not here did not happen/);
  const plain = renderPage({ entries: rows, allEntries: rows, meta: { tokenValue: 'tok' }, query: {} });
  assert.doesNotMatch(plain, /card runview/, 'no run selected, no header');
});
