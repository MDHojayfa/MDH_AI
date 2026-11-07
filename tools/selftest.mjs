#!/usr/bin/env node
/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tools/selftest.mjs — one command on a real machine, one report to send back.
 *
 * Every test in `tests/` runs in a sandbox with no browser. This runs on the machine that has the browser, the
 * desktop session and the distribution nobody has tried yet, and writes down what happened:
 *
 *   node tools/selftest.mjs             # everything that can run without a window
 *   node tools/selftest.mjs --browser   # …and drive a real Chrome/Brave if one is installed
 *
 * It writes `selftest-<timestamp>.md` into the state folder and prints the path. That file contains check results,
 * versions and paths under the home directory — no file contents, no conversation text, no commands the agent ran.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOST = join(ROOT, 'host', 'mdh-host.mjs');

const steps = [];
const record = (name, ok, detail) => {
  steps.push({ name, ok, detail });
  process.stdout.write(`  ${ok === true ? 'ok  ' : ok === null ? 'note' : 'FAIL'}  ${name.padEnd(38, ' ')} ${detail ?? ''}\n`);
  return ok;
};

/**
 * Speak the browser's framing — 4-byte little-endian length, then JSON — to a real host in a throwaway HOME.
 *
 * It resolves as soon as the answers that were asked for arrive. Waiting for the process to exit would always take
 * the full timeout, because the host stays alive until its stdin closes, and a working host would look hung.
 */
function talkToHost(frames, { home, ms = 15000 } = {}) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [HOST], { env: { ...process.env, HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
    const seen = [];
    let buffer = Buffer.alloc(0);
    let stderr = '';
    let settled = false;

    const finish = (timedOut) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { proc.stdin.end(); } catch { /* already gone */ }
      resolve({ frames: seen, stderr, timedOut });
    };
    const timer = setTimeout(() => finish(true), ms);

    proc.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < 4) return;
        const length = buffer.readUInt32LE(0);
        if (buffer.length < 4 + length) return;
        seen.push(JSON.parse(buffer.subarray(4, 4 + length).toString('utf8')));
        buffer = buffer.subarray(4 + length);
        if (seen.filter((frame) => frame.t !== 'ready').length >= frames.length) finish(false);
      }
    });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    proc.on('exit', () => finish(false));

    for (const frame of frames) {
      const body = Buffer.from(JSON.stringify(frame), 'utf8');
      const prefix = Buffer.alloc(4);
      prefix.writeUInt32LE(body.length, 0);
      proc.stdin.write(Buffer.concat([prefix, body]));
    }
  });
}

async function main(argv) {
  const wantBrowser = argv.includes('--browser');
  process.stdout.write('\n  mdh selftest — what this machine actually does\n\n');

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  record('node', Number(process.versions.node.split('.')[0]) >= 20, `v${process.versions.node}`);
  record('version', true, pkg.version);

  const built = existsSync(join(ROOT, 'dist/chrome/manifest.json')) && existsSync(join(ROOT, 'dist/firefox/manifest.json'));
  record('the extension is built', built, built ? 'dist/chrome + dist/firefox' : 'run: node tools/build.mjs');

  const doctor = spawnSync(process.execPath, [join(ROOT, 'tools/doctor.mjs'), '--json'], { encoding: 'utf8', timeout: 60000 });
  let doctorChecks = [];
  try {
    doctorChecks = JSON.parse(doctor.stdout).checks;
  } catch { /* reported on the next line */ }
  const bad = doctorChecks.filter((entry) => entry.ok === false);
  record('doctor', doctorChecks.length > 0 && bad.length === 0, doctorChecks.length ? `${doctorChecks.length} checks, ${bad.length} failed` : 'the doctor produced no output');

  const home = mkdtempSync(join(tmpdir(), 'mdh-selftest-'));
  try {
    const { frames, stderr, timedOut } = await talkToHost([{ t: 'ping', id: 1 }, { t: 'list', id: 2 }], { home });
    const pong = frames.find((frame) => frame.t === 'pong');
    record('the host answers a ping', Boolean(pong) && !timedOut,
      pong
        ? `pong from ${pong.host} v${pong.version}, audit ${pong.audit ? 'ok' : 'BROKEN'}`
        : (timedOut ? 'no answer within 15 s' : (stderr.trim().split('\n').at(-1) ?? 'no frames')));
    const tools = frames.find((frame) => frame.t === 'tools');
    record('the tool catalogue', Boolean(tools), tools ? `${tools.tools.length} tools` : 'no catalogue');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }

  if (wantBrowser) {
    const browser = spawnSync(process.execPath, [join(ROOT, 'tools/live-check.mjs')], { encoding: 'utf8', timeout: 180000 });
    record('the browser check', browser.status === 0, browser.status === 0 ? 'all checks passed' : 'see the report');
    for (const line of (browser.stdout || '').split('\n').filter((l) => /^ {2}(ok|FAIL|note)/.test(l))) {
      steps.push({ name: '  ↳ live-check', ok: null, detail: line.trim() });
    }
  } else {
    record('the browser check', null, 'not run — pass --browser to drive a real Chrome/Brave');
  }

  const adapters = spawnSync(process.execPath, ['-e', `
    const fs = require('fs');
    const dir = process.argv[1];
    console.log(fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'base.js').map((f) => f.replace('.js', '')).join(', '));
  `, join(ROOT, 'src', 'platforms')], { encoding: 'utf8' });
  record('platform adapters present', adapters.status === 0, (adapters.stdout ?? '').trim());
  record('machine', true, `${process.platform}/${process.arch} · ${process.env.XDG_SESSION_TYPE ?? 'session unknown'}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(process.env.HOME ?? tmpdir(), '.local/state/mdh');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `selftest-${stamp}.md`);
  const lines = [];
  lines.push(`# MDH_AI selftest — ${new Date().toISOString()}`, '');
  lines.push(`- version: ${pkg.version}`);
  lines.push(`- node: ${process.versions.node} on ${process.platform}/${process.arch}`);
  lines.push(`- repository: ${ROOT}`, '', '## Steps', '');
  for (const step of steps) {
    lines.push(`- **${step.ok === true ? 'PASS' : step.ok === null ? 'note' : 'FAIL'}** ${step.name} — ${step.detail ?? ''}`);
  }
  lines.push('', '## Doctor output', '');
  lines.push(doctorChecks.map((entry) => `${entry.ok === true ? 'ok  ' : entry.ok === null ? 'note' : 'FAIL'} ${entry.title}: ${entry.detail ?? ''}`).join('\n'));
  lines.push('', '## What this file does not contain', '');
  lines.push('No file contents, no conversation text, no commands you ran through the agent, no environment variables.');
  lines.push('Paths under your home directory appear only where they explain a failure.');
  writeFileSync(file, `${lines.join('\n')}\n`);

  const failed = steps.filter((step) => step.ok === false).length;
  process.stdout.write(`\n  report: ${file} (${(statSync(file).size / 1024).toFixed(1)} KB)\n`);
  process.stdout.write(failed ? `  ${failed} step${failed === 1 ? '' : 's'} failed — the report says which\n\n` : '  every step passed\n\n');
  return failed ? 1 : 0;
}

if (process.argv[1]?.endsWith('selftest.mjs')) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    process.stderr.write(`selftest: ${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}

export { talkToHost };
