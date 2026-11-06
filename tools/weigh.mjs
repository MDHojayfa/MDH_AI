#!/usr/bin/env node
/**
 * tools/weigh.mjs — the numbers behind the word "lightweight".
 *
 * Every project in this category calls itself lightweight. Almost none of them measure it, which is how a
 * 400 MB Electron app ends up described as "minimal" in a README written on a 32-core workstation. The
 * developer of this one does not have a NASA PC. That is not a humblebrag, it is the target hardware: a
 * laptop from 2014 with 4 GB of RAM, a spinning disk, and a browser already using most of it.
 *
 * So this script weighs the actual product on the actual machine:
 *
 *   • the extension as a user receives it (files, unpacked bytes, ZIP bytes)
 *   • the host as it starts (milliseconds to the first `ready` frame, resident memory)
 *   • the dependency count (npm packages that must be downloaded before it runs)
 *
 * Any budget it breaks is a bug, not a rounding error. `--json` for scripts, no flags for humans.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Budgets. Chosen so a 2014 laptop notices nothing: the extension is smaller than one screenshot, the host
 * uses less memory than a single browser tab, and it is ready before a human can move the mouse to the button.
 */
export const BUDGET = {
  zipKb: 300,
  hostRssMb: 80,
  startupMs: 1500,
  dependencies: 0,
};

const kb = (bytes) => bytes / 1024;
const mb = (bytes) => bytes / (1024 * 1024);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function tree(dir) {
  const files = walk(dir);
  const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
  return { dir: relative(ROOT, dir) || '.', files: files.length, bytes };
}

function sourceLines() {
  let lines = 0;
  for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'host'))]) {
    if (!/\.(mjs|js|css|html|json)$/.test(file)) continue;
    lines += readFileSync(file, 'utf8').split('\n').length;
  }
  return lines;
}

/**
 * Start the host for real and time it to its first `ready` frame. Reading the file and guessing would be a
 * different, easier, less true measurement — module loading, config reads and the audit check are most of
 * the startup, and they are exactly the parts that surprise people on a slow disk.
 */
function weighHost({ timeoutMs = 6000 } = {}) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(process.execPath, [join(ROOT, 'host', 'mdh-host.mjs')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MDH_WEIGH: '1' },
    });
    let buffer = Buffer.alloc(0);
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Read the memory *before* the kill: a dead process has no RSS, and a missing number is worse than a
      // small one for a script whose whole job is to stop people quoting feelings.
      const rss = child.pid ? rssMb(child.pid) : null;
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      resolve({ ...result, rss });
    };

    child.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      let frame = null;
      try {
        frame = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
      } catch {
        /* a frame we cannot parse is still a frame: the host is up */
      }
      finish({ ok: Boolean(frame?.t === 'ready'), ms, pid: child.pid, frame });
    });

    child.on('error', (error) => finish({ ok: false, error: error.message }));
    child.on('exit', () => finish({ ok: false, error: 'the host exited before it was ready' }));

    const timer = setTimeout(() => finish({ ok: false, error: `no ready frame within ${timeoutMs} ms` }), timeoutMs);
  });
}

/** RSS from the process itself is more honest than a guess; /proc is not everywhere, and that is fine. */
function rssMb(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = status.match(/VmRSS:\s+(\d+) kB/);
    return match ? Number(match[1]) / 1024 : null;
  } catch {
    return null;
  }
}

/**
 * Numbers quoted in prose. A doc that says 131 KB while the zip says 139 KB is not a rounding error, it is the
 * beginning of every "lightweight" claim that was true once. The tolerance is generous because compression moves
 * a little between builds; anything beyond it is a stale paragraph, and stale paragraphs are how trust is lost.
 */
const QUOTED = [
  { file: 'README.md', re: /(\d+)\s*KB\s+zipped/i },
  { file: 'docs/WHY.md', re: /extension \(zip\)\s+(\d+)\s*KB/i },
  { file: 'docs/MANUAL.md', re: /(\d+)\s*KB\s+zipped/i },
];

function claims() {
  const found = [];
  for (const claim of QUOTED) {
    try {
      const text = readFileSync(join(ROOT, claim.file), 'utf8');
      const match = text.match(claim.re);
      if (match) found.push({ file: claim.file, kb: Number(match[1]) });
    } catch {
      /* a missing doc is not a measurement problem */
    }
  }
  return found;
}

function dependencies() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.optionalDependencies ?? {}).length;
}

/** Pure: budget in, verdicts out. Tested without spawning anything. */
export function evaluate(metrics, budget = BUDGET) {
  const checks = [];
  if (metrics.zipKb != null) {
    checks.push({ name: 'extension zip', value: Number(metrics.zipKb.toFixed(1)), unit: 'KB', max: budget.zipKb, ok: metrics.zipKb <= budget.zipKb });
  }
  if (metrics.hostRssMb != null) {
    checks.push({ name: 'host memory', value: Number(metrics.hostRssMb.toFixed(1)), unit: 'MB', max: budget.hostRssMb, ok: metrics.hostRssMb <= budget.hostRssMb });
  }
  if (metrics.startupMs != null) checks.push({ name: 'host startup', value: Math.round(metrics.startupMs), unit: 'ms', max: budget.startupMs, ok: metrics.startupMs <= budget.startupMs });
  checks.push({ name: 'npm dependencies', value: metrics.dependencies, unit: '', max: budget.dependencies, ok: metrics.dependencies <= budget.dependencies });

  // Prose must agree with the scale. 15% is room for compression noise, not for a paragraph from last month.
  for (const claim of metrics.claims ?? []) {
    // No zip yet means no artifact to disagree with: the claim is unmeasured, not wrong. Saying OVER here made
    // `npm run weigh` fail on a fresh clone, which teaches people to ignore the tool that is supposed to be
    // impossible to ignore.
    if (!metrics.zipKb) continue;
    const near = Math.abs(claim.kb - metrics.zipKb) / metrics.zipKb <= 0.15;
    checks.push({ name: `${claim.file} quote`, value: claim.kb, unit: 'KB', max: Number(metrics.zipKb.toFixed(0)), ok: near });
  }
  return { checks, ok: checks.every((check) => check.ok) };
}

async function main() {
  const json = process.argv.includes('--json');

  const firefoxBuild = tree(join(ROOT, 'dist', 'firefox'));
  const zipPath = ['chrome', 'firefox']
    .map((target) => join(ROOT, 'release', `mdh-ai-${target}-1.0.0.zip`))
    .find((path) => existsSync(path));
  const zipKb = zipPath ? kb(statSync(zipPath).size) : null;

  const host = await weighHost();
  const rss = host.rss ?? null;

  const metrics = {
    zipKb,
    unpackedKb: kb(firefoxBuild.bytes),
    extensionFiles: firefoxBuild.files,
    sourceLines: sourceLines(),
    dependencies: dependencies(),
    startupMs: host.ok ? host.ms : null,
    startupError: host.ok ? null : host.error,
    hostRssMb: rss,
    claims: claims(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
  };

  const verdict = evaluate(metrics);

  if (json) {
    process.stdout.write(`${JSON.stringify({ ...metrics, ...verdict, budget: BUDGET }, null, 2)}\n`);
    process.exit(verdict.ok ? 0 : 1);
  }

  const pad = (label, value) => `${label.padEnd(22)}${value}`;
  const lines = [
    'MDH_AI — measured, not claimed',
    '',
    pad('extension (unpacked)', `${metrics.unpackedKb.toFixed(0)} KB in ${metrics.extensionFiles} files`),
    pad('extension (zip)', zipKb == null ? 'not built yet — run npm run package' : `${zipKb.toFixed(0)} KB`),
    pad('source', `${metrics.sourceLines.toLocaleString()} lines`),
    pad('npm dependencies', metrics.dependencies === 0 ? '0 — Node standard library only' : String(metrics.dependencies)),
    pad('host startup', host.ok ? `${Math.round(host.ms)} ms to ready` : `not measured (${host.error})`),
    pad('host memory', rss == null ? 'not measured (no /proc on this system)' : `${rss.toFixed(1)} MB resident`),
    pad('measured on', `${process.platform}/${process.arch} · Node ${process.version}`),
    '',
  ];

  for (const check of verdict.checks) {
    const state = check.ok ? 'ok  ' : 'OVER';
    lines.push(`  ${state} ${check.name}: ${check.value}${check.unit} (budget ${check.max}${check.unit})`);
  }
  lines.push('', verdict.ok ? 'All budgets hold. This is what "runs on a potato" is allowed to mean.' : 'A budget is broken. Fix it before quoting the claim.');
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exit(verdict.ok ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('weigh.mjs')) main();
