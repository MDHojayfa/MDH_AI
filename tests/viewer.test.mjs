import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPage, summary, esc, startViewer } from '../host/viewer.mjs';

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
