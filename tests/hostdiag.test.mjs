import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROBE_TARGETS, networkProbe, reachProbe, runDiag, systemFacts, diskFacts } from '../host/diag.mjs';
import { builtinTools } from '../host/tools/linux.mjs';
import { ROOT } from './helpers.mjs';

const fakeFetch = ({ ip = '203.0.113.7', skewMs = 0, fail = null } = {}) => async () => {
  if (fail) throw Object.assign(new Error(fail.message ?? 'nope'), { name: fail.name ?? 'Error' });
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => (k === 'date' ? new Date(Date.now() - skewMs).toUTCString() : null) },
    text: async () => JSON.stringify({ ip }),
  };
};

test('the probe allowlist is the eight platforms plus loopback, nothing else', () => {
  assert.equal(PROBE_TARGETS.length, 9);
  for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com', 'kimi.com', 'chat.qwen.ai', 'chat.z.ai', 'grok.com']) {
    assert.ok(PROBE_TARGETS.includes(host), `missing ${host}`);
  }
  assert.ok(PROBE_TARGETS.includes('127.0.0.1'));
});

test('an arbitrary destination is refused before any socket is opened', async () => {
  const result = await reachProbe('evil.example.com');
  assert.equal(result.ok, false);
  assert.equal(result.allowlisted, false);
  assert.match(result.error, /allowlist/);
});

test('the model cannot ask for diagnostics: they are not tools', () => {
  const names = builtinTools.map((t) => t.name.toLowerCase());
  for (const forbidden of ['diag', 'diagnostics', 'net_probe', 'public_ip', 'viewer', 'snapshot', 'probe']) {
    assert.ok(!names.includes(forbidden), `${forbidden} must not be a model-callable tool`);
  }
  // and the host's dispatcher handles them on separate frame types
  const host = readFileSync(join(ROOT, 'host/mdh-host.mjs'), 'utf8');
  assert.match(host, /case 'diag':/);
  assert.match(host, /case 'viewer':/);
  assert.match(host, /case 'snapshot':/);
  assert.match(host, /Deliberately \*\*not\*\* part of the tool catalogue/);
});

test('an IP probe returns the address and the clock skew in one request', async () => {
  const result = await networkProbe({ fetchImpl: fakeFetch({ ip: '198.51.100.4', skewMs: 90_000 }) });
  assert.equal(result.ok, true);
  assert.equal(result.ip, '198.51.100.4');
  assert.ok(result.clockSkewMs > 60_000, `skew was ${result.clockSkewMs}`);
  assert.equal(result.endpoint, 'api.ipify.org');
});

test('the clock-only probe does not retrieve the address', async () => {
  const result = await networkProbe({ includeIp: false, fetchImpl: fakeFetch() });
  assert.equal(result.ok, true);
  assert.equal(result.ip, null);
  assert.equal(typeof result.clockSkewMs, 'number');
});

test('a dead network is reported, not thrown', async () => {
  const timedOut = await networkProbe({ timeoutMs: 5, fetchImpl: fakeFetch({ fail: { name: 'TimeoutError' } }) });
  assert.equal(timedOut.ok, false);
  assert.match(timedOut.error, /timed out/);

  const refused = await networkProbe({ fetchImpl: fakeFetch({ fail: { message: 'connect ECONNREFUSED' } }) });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /ECONNREFUSED/);
});

test('system facts say something true about the machine running the tests', () => {
  const facts = systemFacts();
  assert.match(facts.node, /^v\d+/);
  assert.ok(['linux', 'darwin', 'win32'].includes(facts.platform));
  assert.ok(Number.isFinite(facts.cpus) && facts.cpus > 0);
  assert.ok(Array.isArray(facts.interfaces));
  assert.equal(typeof facts.containerHints.docker, 'boolean');
  assert.ok(facts.loadAvg.length === 3);
});

test('disk facts either answer or say why not', async () => {
  const disk = await diskFacts();
  assert.ok('ok' in disk && 'dir' in disk);
  if (disk.ok !== null) assert.equal(typeof disk.freeGB, 'number');
});

test('unknown diagnostic ops fail closed', async () => {
  const result = await runDiag('rm -rf /');
  assert.equal(result.ok, false);
  assert.match(result.error, /unknown diag op/);
});

test('runDiag("system") bundles facts and disk without touching the network', async () => {
  const result = await runDiag('system');
  assert.equal(result.ok, true);
  assert.ok(result.facts.node);
  assert.ok('disk' in result);
});
