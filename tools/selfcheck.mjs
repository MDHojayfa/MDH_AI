#!/usr/bin/env node
/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tools/selfcheck.mjs — does the host actually answer?
 *
 * install.sh ends here. Every project in this space installs a manifest and *assumes* it works, which is
 * why "host offline" is the most common support question (docs/REVIEW.md E2). This spawns the host the
 * same way the browser does — length-prefixed frames over stdin/stdout — and waits for a pong.
 *
 *   node tools/selfcheck.mjs [--quiet]
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOST = join(ROOT, 'host', 'mdh-host.mjs');
const quiet = process.argv.includes('--quiet');

function frame(obj) {
  const json = Buffer.from(JSON.stringify(obj), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

// Every installer in this corner of the ecosystem assumes registration worked, and every support thread
// is the consequence. This one asks the host directly and refuses to be optimistic.
const child = spawn(process.execPath, [HOST], { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = Buffer.alloc(0);
let pong = false;
const timer = setTimeout(() => {
  console.error('✖ self-check: the host did not answer within 10 s');
  child.kill('SIGKILL');
  process.exit(1);
}, 10000);

child.stderr.on('data', (chunk) => {
  if (!quiet) process.stderr.write(chunk);
});

child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    if (buffer.length < 4) return;
    const len = buffer.readUInt32LE(0);
    if (buffer.length < 4 + len) return;
    const body = buffer.subarray(4, 4 + len).toString('utf8');
    buffer = buffer.subarray(4 + len);
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      continue;
    }
    if (msg.t === 'pong') {
      pong = true;
      clearTimeout(timer);
      const audit = msg.audit === true ? 'audit ok' : 'audit broken';
      console.log(`✔ host answered: ${msg.host} v${msg.version} pid=${msg.pid} · ${audit}`);
      child.stdin.end();
      child.kill('SIGTERM');
      process.exit(0);
    }
  }
});

child.on('error', (e) => {
  clearTimeout(timer);
  console.error(`✖ self-check: cannot start the host: ${e.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  if (!pong) {
    clearTimeout(timer);
    console.error(`✖ self-check: host exited (${code}) before answering`);
    process.exit(1);
  }
});

child.stdin.write(frame({ t: 'ping', id: 1 }));
