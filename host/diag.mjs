/**
 * host/diag.mjs — the facts a browser cannot see about the machine it is running on.
 *
 * The extension knows the page. It does not know the kernel, the clock, the route, the disk or the tunnel.
 * In practice those explain a large share of "it just stopped": a clock two minutes off, an MTU that drops
 * large frames, a VPN that reconnects, a full disk that makes the audit log fail silently, a resolver that
 * answers for the wrong host.
 *
 * Two hard rules live in this file:
 *
 *   1. **No shell.** Every fact comes from a Node API or a documented file under /proc or /sys. A diagnostic
 *      tool that spawns `curl` to diagnose a broken shell is a joke with a thesaurus.
 *   2. **No arbitrary destinations.** The one outbound request this product ever makes is a GET to one of
 *      two fixed IP-echo endpoints, and only when a human presses a button. The model cannot ask for it:
 *      `netProbe` is not in the tool catalogue, only in the `diag` frame.
 */
import { readFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { networkInterfaces, release, loadavg, totalmem, freemem, uptime, cpus, arch, platform } from 'node:os';
import { resolve4, resolve6 } from 'node:dns/promises';
import { connect } from 'node:net';
import { paths } from './config.mjs';

/** The eight platforms, plus loopback: the only hosts a connectivity probe may touch. */
export const HOST_VERSION = '1.0.0';

export const PROBE_TARGETS = Object.freeze([
  'chatgpt.com', 'claude.ai', 'gemini.google.com', 'chat.deepseek.com',
  'kimi.com', 'chat.qwen.ai', 'chat.z.ai', 'grok.com',
  '127.0.0.1',
]);

/** Two endpoints, both plain GET, both documented. Adding a third is a decision, not a line. */
export const IP_ENDPOINTS = Object.freeze([
  { url: 'https://api.ipify.org?format=json', pick: (b) => JSON.parse(b).ip },
  { url: 'https://ifconfig.co/json', pick: (b) => JSON.parse(b).ip },
]);

const TIMEOUT_MS = 5000;

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** Interface names are the cheapest VPN detector that exists without a permission. */
const TUNNEL = /^(tun|tap|wg|ppp|zt|tailscale|utun|ipsec|nordlynx|proton)/i;

function interfaceFacts() {
  const out = [];
  const all = safe(() => networkInterfaces(), {}) ?? {};
  for (const [name, addrs] of Object.entries(all)) {
    for (const addr of addrs ?? []) {
      if (addr.internal) continue;
      out.push({
        name,
        family: addr.family,
        address: addr.address,
        cidr: addr.cidr ?? null,
        tunnel: TUNNEL.test(name),
        mtu: safe(() => Number(readFileSync(`/sys/class/net/${name}/mtu`, 'utf8').trim()), null),
      });
    }
  }
  return out;
}

/** Everything local, synchronous, and safe to attach to a report. */
export function systemFacts({ paths: p = paths } = {}) {
  const ifaces = interfaceFacts();
  return {
    hostVersion: HOST_VERSION,
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpus: safe(() => cpus().length),
    loadAvg: safe(() => loadavg().map((n) => Math.round(n * 100) / 100)),
    memory: safe(() => ({
      totalGB: Math.round(totalmem() / 2 ** 30),
      freeGB: Math.round(freemem() / 2 ** 30),
    })),
    uptimeHours: safe(() => Math.round(uptime() / 3600)),
    pid: process.pid,
    interfaces: ifaces,
    tunnels: ifaces.filter((i) => i.tunnel).map((i) => i.name),
    smallMtu: ifaces.filter((i) => i.mtu && i.mtu < 1400).map((i) => `${i.name}:${i.mtu}`),
    stateDir: p.stateDir,
    containerHints: {
      docker: safe(() => readFileSync('/proc/1/cgroup', 'utf8').includes('docker'), false),
      wsl: safe(() => /microsoft/i.test(release()), false),
    },
  };
}

/** Disk space, because a full disk turns a working host into a silent one. */
export async function diskFacts(dir = paths.stateDir) {
  try {
    const s = await statfs(dir);
    const freeGB = (s.bavail * s.bsize) / 2 ** 30;
    return { dir, freeGB: Math.round(freeGB * 10) / 10, ok: freeGB > 0.2 };
  } catch (e) {
    return { dir, error: e.message, ok: null };
  }
}

/* ─────────────────────────────────────────────────────────────── network probes */

/**
 * One request, two facts: the address the internet sees, and how far this clock is from the server's.
 * The Date header is coarse (seconds), which is exactly the resolution that matters — a minute is enough
 * to break TLS, and a second is not.
 */
export async function networkProbe({ timeoutMs = TIMEOUT_MS, includeIp = true, fetchImpl = globalThis.fetch, endpoints = IP_ENDPOINTS } = {}) {
  const started = Date.now();
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetchImpl(endpoint.url, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      const serverDateValue = res.headers.get('date') ?? null;
      const serverDate = serverDateValue ? new Date(serverDateValue) : null;
      return {
        ok: res.ok,
        status: res.status,
        endpoint: new URL(endpoint.url).host,
        ip: includeIp && res.ok ? safe(() => endpoint.pick(text), null) : null,
        clockSkewMs: serverDate ? Date.now() - serverDate.getTime() : null,
        ms: Date.now() - started,
      };
    } catch (e) {
      lastError = e.name === 'TimeoutError' ? `timed out after ${timeoutMs} ms` : e.message;
    }
  }

  return { ok: false, error: lastError ?? 'no endpoint answered', ms: Date.now() - started };
}

/** DNS + TCP 443, because "the browser says offline" and "DNS is broken" are different bugs. */
export async function reachProbe(target, { timeoutMs = TIMEOUT_MS } = {}) {
  if (!PROBE_TARGETS.includes(target)) {
    return { ok: false, error: `refusing to probe ${target}: not in the allowlist`, allowlisted: false };
  }

  const started = Date.now();
  let addresses = [];
  let dnsError = null;
  try {
    addresses = await Promise.race([
      Promise.allSettled([resolve4(target), resolve6(target)]).then((rs) =>
        rs.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('dns timeout')), timeoutMs)),
    ]);
  } catch (e) {
    dnsError = e.message;
  }

  const address = addresses[0] ?? target;
  const tcp = await new Promise((done) => {
    const socket = connect({ host: address, port: 443, timeout: timeoutMs });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      done(result);
    };
    socket.once('connect', () => finish({ connected: true }));
    socket.once('timeout', () => finish({ connected: false, error: 'tcp timeout' }));
    socket.once('error', (e) => finish({ connected: false, error: e.code ?? e.message }));
  });

  return {
    ok: Boolean(tcp.connected),
    target,
    allowlisted: true,
    addresses: addresses.slice(0, 3),
    dnsError,
    ...tcp,
    ms: Date.now() - started,
  };
}

/* ────────────────────────────────────────────────────────────────── dispatch */

/**
 * The `diag` frame's whole surface. Every op is read-only; none takes a free-form destination; none is in
 * the tool catalogue the model sees.
 */
export async function runDiag(op, payload = {}) {
  switch (op) {
    case 'system':
      return { ok: true, facts: systemFacts(), disk: await diskFacts() };
    case 'net':
      return { ok: true, ...(await reachProbe(payload.target, { timeoutMs: payload.timeoutMs })) };
    case 'ip':
      return networkProbe({ includeIp: true, timeoutMs: payload.timeoutMs });
    case 'clock':
      return networkProbe({ includeIp: false, timeoutMs: payload.timeoutMs });
    case 'all': {
      const [system, disk, ip] = await Promise.all([systemFacts(), diskFacts(), networkProbe()]);
      return { ok: true, system, disk, ip };
    }
    default:
      return { ok: false, error: `unknown diag op: ${op}` };
  }
}
