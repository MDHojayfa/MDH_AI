/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCore } from './helpers.mjs';

const { MDH, sandbox } = loadCore(['src/core/diag.js'], { hostname: 'chat.deepseek.com' });
const { diag } = MDH;

const failing = (extra = {}) =>
  diag.collect({
    stage: 'waiting-reply',
    platform: { id: 'deepseek', read: 'sse' },
    error: Object.assign(new Error('host said 429 too many requests'), { code: 'RATE' }),
    logTrail: [
      { at: Date.now() - 2000, level: 'warn', text: 'POST https://chat.deepseek.com/api/v0/chat/completion → 429' },
      { at: Date.now() - 1000, level: 'info', text: 'governor: waiting 30 s' },
    ],
    host: { version: '1.0.0', pid: 4242, clockSkewMs: 1200 },
    ...extra,
  });

test('collection describes the machine without inventing anything', () => {
  const d = failing();
  assert.equal(d.build.name, 'MDH_AI');
  assert.equal(d.stage, 'waiting-reply');
  assert.equal(d.page.platform, 'deepseek');
  assert.equal(d.page.host, 'chat.deepseek.com');
  assert.equal(d.failure.code, 'RATE');
  assert.equal(d.host.pid, 4242);
  assert.ok(d.iso.endsWith('Z'));
  // browser facts come from the fake UA, not from a hard-coded string
  assert.match(d.browser.name, /^(Firefox|Chrome|Brave|Edge|Opera|Safari)/);
  assert.equal(d.log.length, 2);
});

test('the signature table catches the failure that cost three months', () => {
  const banned = diag.collect({
    stage: 'send',
    error: new Error('Error 1015: you have been banned from this site'),
    logTrail: [{ at: Date.now(), level: 'error', text: 'response: 1015 Ray ID 8f2…' }],
  });
  const [first] = diag.hypotheses(banned);
  assert.equal(first.id, 'cf-ban');
  assert.equal(first.severity, 'external');
  assert.match(first.fix, /hotspot|network/i);

  const challenged = diag.collect({
    stage: 'read',
    error: new Error('composer not found'),
    logTrail: [{ at: Date.now(), level: 'info', text: 'page title: Just a moment...' }],
  });
  const ids = diag.hypotheses(challenged).map((h) => h.id);
  assert.ok(ids.includes('cf-challenge'), `got ${ids.join(',')}`);
  assert.ok(ids.includes('dom-drift'), 'a challenge page also looks like DOM drift, and both are worth saying');
});

test('a measured clock skew outranks a guessed one', () => {
  const d = failing({ host: { version: '1.0.0', pid: 1, clockSkewMs: 13 * 60_000 } });
  const [first] = diag.hypotheses(d);
  assert.equal(first.id, 'clock-skew-measured');
  assert.match(first.what, /780 s off|13 min/);
});

test('offline beats everything, because nothing else can be true', () => {
  sandbox.navigator.onLine = false;
  const d = failing();
  const [first] = diag.hypotheses(d);
  assert.equal(first.id, 'offline');
  sandbox.navigator.onLine = true;
});

test('a failed tool call without host facts says so instead of pretending', () => {
  const d = diag.collect({ stage: 'executing', error: new Error('tool failed: NO_HOST'), host: null });
  assert.ok(diag.hypotheses(d).some((h) => h.id === 'host-absent'));
});

test('redaction removes paths, emails and foreign URLs but keeps the platform host', () => {
  const out = diag.redact(
    'failed reading /home/ali/projects/secret.txt as ali@example.com from https://chat.deepseek.com/x and https://internal.corp/v1',
  );
  assert.ok(!out.includes('/home/ali'), out);
  assert.ok(!out.includes('ali@example.com'));
  assert.ok(out.includes('chat.deepseek.com'), 'the platform host is the whole point of the report');
  assert.ok(!out.includes('internal.corp'));
  assert.ok(out.includes('<path>') && out.includes('<email>') && out.includes('<url'));
});

test('the report body carries the hypotheses, the facts and the consent line', () => {
  const d = failing();
  const body = diag.issueBody(d);
  assert.match(body, /### What happened/);
  assert.match(body, /### What the extension thinks/);
  assert.match(body, /hypothes/i);
  assert.match(body, /### Facts/);
  assert.match(body, /### Log \(last 40 lines\)/);
  assert.match(body, /only because you pressed Submit/);
  assert.match(body, /not included \(the user chose not to send it\)/, 'the IP must be opt-in and said so');
  assert.ok(!body.includes('/home/'), 'no paths in a public body');
});

test('the IP appears only when it was asked for', () => {
  const d = failing({ host: { version: '1.0.0', pid: 1, clockSkewMs: 0, publicIp: '203.0.113.9' } });
  assert.match(diag.issueBody(d, { includeIp: true }), /203\.0\.113\.9/);
  assert.doesNotMatch(diag.issueBody(d), /203\.0\.113\.9/);
});

test('the issue URL is a prefilled form, never a submission', () => {
  const url = diag.issueUrl(failing(), { title: '[bug] deepseek 429' });
  assert.ok(url.startsWith('https://github.com/MDHojayfa/MDH_AI/issues/new?template=bug_report.yml'));
  const params = new URL(url).searchParams;
  assert.equal(params.get('title'), '[bug] deepseek 429');
  assert.match(params.get('body'), /### Facts/);
  assert.ok(params.get('body').length < 8000, 'GitHub rejects very long bodies; the body is capped');
});

test('a report with no information at all is still a valid report', () => {
  const empty = diag.collect({});
  const body = diag.issueBody(empty);
  assert.match(body, /no message/);
  assert.doesNotThrow(() => diag.issueUrl(empty));
  assert.equal(diag.summary(empty).what, 'No known cause matched');
});

test('summary is three lines, not a dump', () => {
  const s = diag.summary(failing());
  assert.deepEqual(Object.keys(s).sort(), ['browser', 'fix', 'guessCount', 'platform', 'stage', 'what']);
  assert.ok(s.guessCount >= 1);
});

test('there are enough signatures to be worth having', () => {
  assert.ok(diag.size() >= 12, `only ${diag.size()} signatures`);
  const ids = diag.SIGNATURES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate signature id');
  for (const sig of diag.SIGNATURES) {
    assert.ok(sig.fix && sig.why && sig.what, `${sig.id} is missing a field`);
    assert.ok(['external', 'local', 'product'].includes(sig.severity), `${sig.id} has no severity`);
    assert.match(sig.fix, /\./, `${sig.id} has no actionable fix`);
  }
});

test('network advice is not a single hot take about hotspots', () => {
  const ban = diag.SIGNATURES.find((s) => s.id === 'cf-ban');
  const challenge = diag.SIGNATURES.find((s) => s.id === 'cf-challenge');
  const geo = diag.SIGNATURES.find((s) => s.id === 'geo-block');
  for (const sig of [ban, challenge, geo]) {
    assert.match(sig.fix, /network|Wi-Fi|wifi/i, `${sig.id} names no network action`);
  }
  // A hotspot can mislead: the advice has to say so rather than promise a clean test.
  assert.match(ban.fix, /hint, not proof/i);
  assert.match(ban.fix, /another Wi-Fi/i);
  assert.match(challenge.fix, /another Wi-Fi/i);
  assert.match(challenge.fix, /does not prove/i);
});

test('a hidden tab is named as a cause, because timers are throttled there', () => {
  const d = diag.collect({ stage: 'waiting-reply', error: new Error('no reply') });
  d.page.visibility = 'hidden';
  const hidden = diag.hypotheses(d).find((h) => h.id === 'hidden-tab');
  assert.ok(hidden, 'a stalled run on a background tab should say why it looks frozen');
  assert.match(hidden.why, /throttl/i);
  assert.match(hidden.fix, /front|foreground/i);

  const visible = diag.collect({ stage: 'waiting-reply' });
  assert.ok(!diag.hypotheses(visible).some((h) => h.id === 'hidden-tab'));
});
