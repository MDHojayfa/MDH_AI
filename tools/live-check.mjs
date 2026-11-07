#!/usr/bin/env node
/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tools/live-check.mjs — the check that uses a real browser.
 *
 * Everything in `tests/` runs the extension's actual scripts, but not inside Chrome: a `vm` context, a fake page,
 * a fake `chrome.*`. That catches logic bugs and has caught several. It cannot catch the things that only a
 * browser knows — whether the service worker registers, whether `connectNative` really reaches the host, whether
 * the pill really lands above the composer on a live page.
 *
 * This script does those things by driving the browser you already have, over the DevTools protocol, with no
 * dependencies: Node 22 ships a `WebSocket` client, and Chrome ships the rest. It is deliberately not part of
 * `npm test` — it needs a graphical session, a real signed-in browser profile and a network, and a test suite that
 * fails for those reasons teaches people to ignore it.
 *
 *   npm run live-check                 # preflight + load the extension + ping the real host
 *   npm run live-check -- --page https://chat.openai.com/
 *   npm run live-check -- --click      # also press Start (this sends a message into the open chat)
 *   npm run live-check -- --headless   # CI-shaped; extensions need a recent browser to work headless
 *   npm run live-check -- --dry-run    # prerequisite checks only, launches nothing
 *
 * Exit code 0 means every check that ran passed. A check that could not run says so and is not counted as a pass.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOST_NAME = 'dev.mdhojayfa.mdh';
const EXT_ID = JSON.parse(readFileSync(join(ROOT, 'src', 'extension-id.json'), 'utf8')).chrome ?? 'oegdcjbcjpogbplakppjddiojflepk';
const DIST = join(ROOT, 'dist', 'chrome');

/* ─────────────────────────────────────────────────────────────────── arguments */

const usage = `live-check — prove the extension works in the browser you already have

  --browser <path>   browser binary (default: the first Chrome-family browser found)
  --page <url>       open this page and check that the pill mounted above the composer
  --screenshot <dir> save a PNG of the page (and of the pill) into <dir>; works with --page
  --click            with --page: press Start, which fills the composer and sends it
  --headless         run without a window (extensions may still need a header)
  --keep             leave the browser running and print the profile path
  --dry-run          check prerequisites, launch nothing
  --json             one machine-readable object instead of the report
  --timeout <ms>     per-step timeout, default 20000
  --help
`;

function parseArgs(argv) {
  const out = { page: null, click: false, headless: false, keep: false, dryRun: false, json: false, timeout: 20000, browser: null, screenshot: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--browser': out.browser = argv[++i]; break;
      case '--page': out.page = argv[++i]; break;
      case '--timeout': out.timeout = Number(argv[++i]); break;
      case '--screenshot': out.screenshot = argv[++i]; break;
      case '--click': out.click = true; break;
      case '--headless': out.headless = true; break;
      case '--keep': out.keep = true; break;
      case '--dry-run': out.dryRun = true; break;
      case '--json': out.json = true; break;
      case '--help': case '-h': out.help = true; break;
      default:
        if (arg.startsWith('--')) throw new Error(`unknown flag ${arg}`);
    }
  }
  if (!Number.isFinite(out.timeout) || out.timeout < 1000) throw new Error('--timeout must be at least 1000');
  if (out.screenshot !== null && !out.screenshot) throw new Error('--screenshot needs a folder');
  return out;
}

/* ───────────────────────────────────────────────────────────────── browser hunt */

const CANDIDATES = [
  'google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser',
  'brave-browser', 'brave', 'microsoft-edge', 'vivaldi-stable',
];

function findBrowser(explicit) {
  if (explicit) return existsSync(explicit) ? explicit : null;
  if (process.env.MDH_BROWSER && existsSync(process.env.MDH_BROWSER)) return process.env.MDH_BROWSER;
  for (const name of CANDIDATES) {
    // `command -v` rather than a PATH walk: it answers exactly what the shell would run, which is what a person
    // typing the browser name would get.
    const probe = spawnSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
    const found = (probe.stdout ?? '').trim();
    if (probe.status === 0 && found) return found;
  }
  return null;
}

/** Where each family looks for a native-messaging host manifest on Linux. */
function hostDirs(browserPath) {
  const home = process.env.HOME ?? '';
  const base = [join(home, '.config', 'chromium', 'NativeMessagingHosts'), join(home, '.config', 'google-chrome', 'NativeMessagingHosts')];
  base.push(join(home, '.config', 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts'));
  const name = (browserPath ?? '').toLowerCase();
  if (name.includes('brave')) return [base[2]];
  if (name.includes('google-chrome')) return [base[1]];
  if (name.includes('chromium')) return [base[0]];
  return base;
}

function findHostManifest(browserPath) {
  for (const dir of hostDirs(browserPath)) {
    const file = join(dir, `${HOST_NAME}.json`);
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      return { file, parsed, pathExists: Boolean(parsed.path && existsSync(parsed.path)) };
    } catch (error) {
      return { file, parsed: null, pathExists: false, error: String(error) };
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────── devtools protocol */

/**
 * A very small CDP client. Flat sessions only, one message at a time, and a timeout on every call: a driver that
 * hangs is worse than a driver that fails, because a hang looks like a slow machine.
 */
function cdp(wsUrl, { timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Set();

    const settle = (id, ok, payload) => {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      clearTimeout(entry.timer);
      ok ? entry.resolve(payload) : entry.reject(new Error(payload?.message ?? 'CDP error'));
    };

    socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.id && pending.has(msg.id)) settle(msg.id, !msg.error, msg.error ?? msg.result);
      else for (const fn of listeners) fn(msg);
    });

    socket.addEventListener('error', () => reject(new Error(`cannot open ${wsUrl}`)));
    socket.addEventListener('open', () => {
      const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
        const id = nextId++;
        const timer = setTimeout(() => { pending.delete(id); rej(new Error(`${method} timed out after ${timeout}ms`)); }, timeout);
        pending.set(id, { resolve: res, reject: rej, timer });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
      resolve({
        send,
        on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
        close: () => { try { socket.close(); } catch { /* already gone */ } },
      });
    });
  });
}

/**
 * Save what the page actually looks like. A screenshot is the one piece of evidence that survives a language
 * barrier: it does not need to be described, and it cannot be paraphrased by whoever is looking at it.
 */
export async function saveScreenshot(client, sessionId, file) {
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
  if (!shot?.data) throw new Error('the browser returned no image data');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}

/** Evaluate a promise inside a target's JS context and return the resolved value. */
async function evaluate(client, sessionId, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'evaluation threw');
  return result?.result?.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtoolsPort(profileDir, timeout) {
  const file = join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const [port, path] = readFileSync(file, 'utf8').split('\n');
      if (port && path) return { port: Number(port), wsPath: path.trim() };
    }
    await sleep(150);
  }
  throw new Error('the browser never wrote DevToolsActivePort — it probably refused to start');
}

async function waitFor(predicate, timeout, what) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`gave up waiting for ${what}`);
}

/* ──────────────────────────────────────────────────────────────────── the checks */

async function run(options) {
  const steps = [];
  const record = (name, ok, detail) => { steps.push({ name, ok, detail }); return ok; };

  /* 1. the extension has been built */
  const manifestFile = join(DIST, 'manifest.json');
  if (!existsSync(manifestFile)) {
    record('extension is built', false, 'dist/chrome/manifest.json is missing — run npm run build');
    return { steps, browser: null, fatal: 'not built' };
  }
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  record('extension is built', true, `dist/chrome · manifest v${manifest.manifest_version} · ${manifest.version}`);

  /* 2. the native host is registered for this browser */
  const browserPath = findBrowser(options.browser);
  if (!browserPath) {
    record('a browser exists', false, 'no Chrome-family binary found; pass --browser /path/to/chrome');
    return { steps, browser: null, fatal: 'no browser' };
  }
  record('a browser exists', true, browserPath);

  const hostManifest = findHostManifest(browserPath);
  if (!hostManifest) {
    record('native host manifest', false, `no ${HOST_NAME}.json in ~/.config/*/NativeMessagingHosts — run ./install.sh`);
  } else if (!hostManifest.parsed) {
    record('native host manifest', false, `${hostManifest.file} is not valid JSON — run ./install.sh`);
  } else if (!hostManifest.pathExists) {
    record('native host manifest', false, `${hostManifest.file} points at ${hostManifest.parsed.path}, which does not exist`);
  } else {
    const origins = hostManifest.parsed.allowed_origins ?? [];
    const forThis = origins.some((origin) => origin.includes(EXT_ID));
    record('native host manifest', forThis, forThis
      ? `${hostManifest.file} → ${hostManifest.parsed.path}`
      : `the manifest does not allow chrome-extension://${EXT_ID}/ — run ./install.sh again`);
  }

  if (options.dryRun) return { steps, browser: browserPath, dryRun: true };

  /* 3. launch it with the extension loaded, into a throwaway profile */
  const profile = mkdtempSync(join(tmpdir(), 'mdh-live-'));
  const flags = [
    `--user-data-dir=${profile}`,
    `--load-extension=${DIST}`,
    `--disable-extensions-except=${DIST}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    ...(options.headless ? ['--headless=new'] : []),
    ...(options.page ? [options.page] : ['about:blank']),
  ];
  const child = spawn(browserPath, flags, { stdio: 'ignore', detached: false });
  let client = null;
  try {
    const { port } = await waitForDevtoolsPort(profile, options.timeout);
    record('browser started', true, `devtools on 127.0.0.1:${port}`);

    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    record('devtools answers', Boolean(version.webSocketDebuggerUrl), version.Browser ?? 'no Browser string');

    client = await cdp(version.webSocketDebuggerUrl, { timeout: options.timeout });

    /* 4. the service worker registered, under the id the host manifest allows */
    const worker = await waitFor(async () => {
      const { targetInfos } = await client.send('Target.getTargets');
      return targetInfos.find((t) => t.type === 'service_worker' && String(t.url).includes(EXT_ID)) ?? null;
    }, options.timeout, 'the extension service worker');
    record('service worker registered', true, worker.url);

    const { sessionId } = await client.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
    const loaded = await evaluate(client, sessionId, 'chrome.runtime.getManifest().version');
    record('service worker wakes up', loaded === manifest.version, `manifest inside the worker says ${loaded}`);

    /* 5. the real native host answers — the boundary every fake test stops at */
    const ping = await evaluate(client, sessionId, `new Promise((resolve) => {
      const done = (value) => { try { port.disconnect(); } catch {} resolve(value); };
      let port;
      try {
        port = chrome.runtime.connectNative('${HOST_NAME}');
      } catch (error) {
        return resolve({ ok: false, error: 'connectNative threw: ' + error.message });
      }
      const timer = setTimeout(() => done({ ok: false, error: 'no reply in 6s — is the host manifest pointing at a working file?' }), 6000);
      port.onMessage.addListener((msg) => {
        if (msg && msg.t === 'ready') return;
        clearTimeout(timer);
        done(msg && msg.t === 'pong' ? { ok: true, version: msg.version, audit: msg.audit } : { ok: false, error: JSON.stringify(msg).slice(0, 200) });
      });
      port.onDisconnect.addListener(() => {
        clearTimeout(timer);
        const why = chrome.runtime.lastError?.message ?? 'the port closed';
        done({ ok: false, error: why });
      });
      port.postMessage({ t: 'ping', id: 1 });
    })`);
    record('native host answers', Boolean(ping?.ok),
      ping?.ok ? `pong from ${HOST_NAME} v${ping.version}, audit chain ${ping.audit ? 'verified' : 'needs attention'}` : (ping?.error ?? 'no answer'));

    /* 6. the pill, on a real page, above a real composer */
    if (options.page) {
      const target = await waitFor(async () => {
        const { targetInfos } = await client.send('Target.getTargets');
        return targetInfos.find((t) => t.type === 'page' && String(t.url).startsWith(options.page.split('?')[0].slice(0, 32))) ?? null;
      }, options.timeout, 'the page you asked for');
      const attached = await client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      await client.send('Page.enable', {}, attached.sessionId);
      const mounted = await waitFor(() => evaluate(client, attached.sessionId, `(() => {
        const host = document.getElementById('mdh-dock');
        if (!host) return null;
        const pill = host.shadowRoot && host.shadowRoot.querySelector('.pill');
        return pill ? { label: (pill.querySelector('.label')?.textContent ?? '').trim(), top: Math.round(pill.getBoundingClientRect().top) } : null;
      })()`), options.timeout, 'the pill to mount');
      record('the pill mounted', Boolean(mounted), `labelled "${mounted.label}" at y=${mounted.top} on ${new URL(options.page).host}`);

      if (options.screenshot) {
        const host = new URL(options.page).host.replace(/[^\w.-]/g, '_');
        const file = join(options.screenshot, `${host}-pill.png`);
        try {
          await saveScreenshot(client, attached.sessionId, file);
          record('a screenshot of the page', true, file);
        } catch (error) {
          record('a screenshot of the page', false, `${error.message} — the page may be refusing capture in this mode`);
        }
      }

      if (options.click) {
        const clicked = await evaluate(client, attached.sessionId, `(() => {
          const host = document.getElementById('mdh-dock');
          const pill = host && host.shadowRoot && host.shadowRoot.querySelector('.pill');
          if (!pill) return false;
          pill.click();
          return true;
        })()`);
        await sleep(1500);
        const turn = await evaluate(client, attached.sessionId, `(() => {
          const host = document.getElementById('mdh-dock');
          const label = host?.shadowRoot?.querySelector('.label')?.textContent?.trim() ?? '';
          return { label };
        })()`);
        record('Start pressed', clicked && turn.label !== 'Start', `pill now says "${turn.label}" — a change means the click reached the agent`);

        if (options.screenshot && clicked) {
          const host = new URL(options.page).host.replace(/[^\w.-]/g, '_');
          const file = join(options.screenshot, `${host}-after-start.png`);
          try {
            await saveScreenshot(client, attached.sessionId, file);
            record('a screenshot after Start', true, file);
          } catch (error) {
            record('a screenshot after Start', false, error.message);
          }
        }
      }
    }
  } finally {
    client?.close();
    if (!options.keep) {
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      await sleep(300);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* lock files, not worth a failure */ }
    } else {
      process.stdout.write(`\nbrowser left running · profile ${profile}\n`);
    }
  }
  return { steps, browser: browserPath };
}

/* ───────────────────────────────────────────────────────────────────── the report */

function report(run1, options) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(run1, null, 2)}\n`);
    return;
  }
  const lines = [];
  lines.push('');
  lines.push('  live-check — the parts a fake page cannot test');
  lines.push('');
  for (const step of run1.steps) {
    const mark = step.ok ? 'ok  ' : 'FAIL';
    lines.push(`  ${mark} ${step.name.padEnd(24, ' ')} ${step.detail ?? ''}`);
  }
  const failed = run1.steps.filter((s) => !s.ok).length;
  lines.push('');
  if (run1.dryRun) lines.push('  dry run: nothing was launched.');
  else if (failed) lines.push(`  ${failed} check${failed === 1 ? '' : 's'} failed. The detail line says what to do.`);
  else lines.push('  Everything that ran, passed. That includes the native host, which is the part the tests fake.');
  lines.push('');
  process.stdout.write(`${lines.join('\n')}\n`);
}

/* ─────────────────────────────────────────────────────────────────────── main */

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`live-check: ${error.message}\n\n${usage}`);
    process.exit(2);
  }
  if (options.help) {
    process.stdout.write(usage);
    process.exit(0);
  }
  if (options.click && !options.page) {
    process.stderr.write('live-check: --click needs --page\n');
    process.exit(2);
  }
  const result = await run(options);
  report(result, options);
  process.exit(result.steps.every((s) => s.ok) ? 0 : 1);
}

if (process.argv[1]?.endsWith('live-check.mjs')) {
  main().catch((error) => {
    process.stderr.write(`live-check: ${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}

export { parseArgs, findBrowser, hostDirs, findHostManifest, cdp, evaluate, waitForDevtoolsPort };
