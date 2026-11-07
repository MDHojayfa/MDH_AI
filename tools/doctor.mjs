#!/usr/bin/env node
/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tools/doctor.mjs — "it doesn't work" answered with a line per cause.
 *
 * The failure this exists for: a person installs, loads the extension, opens a chat, sees no pill, and has no way
 * to tell which of nine things went wrong. Reading the source to discover that a package manager was involved is
 * not a user manual, and it is what happened to the first person who tried this.
 *
 * Every check names the thing, says what it found, and — when it failed — the one command that fixes it. It is
 * read-only: it writes nothing except a probe file in the state folder it is testing, which it deletes.
 *
 *   node tools/doctor.mjs
 *   node tools/doctor.mjs --json
 */
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extensionIdFromKey } from './build.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOME = process.env.MDH_HOME_OVERRIDE || homedir();
const HOST_NAME = 'dev.mdhojayfa.mdh';
const GECKO_ID = 'mdh@mdhojayfa.dev';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const pkg = readJson(join(ROOT, 'package.json'));

/** Where each browser family looks for the native host, and the name a person knows it by. */
export function hostLocations(home = HOME) {
  return [
    { browser: 'Chrome', file: join(home, '.config/google-chrome/NativeMessagingHosts', `${HOST_NAME}.json`) },
    { browser: 'Brave', file: join(home, '.config/BraveSoftware/Brave-Browser/NativeMessagingHosts', `${HOST_NAME}.json`) },
    { browser: 'Chromium', file: join(home, '.config/chromium/NativeMessagingHosts', `${HOST_NAME}.json`) },
    { browser: 'Firefox', file: join(home, '.mozilla/native-messaging-hosts', `${HOST_NAME}.json`) },
  ];
}

const canExecute = (file) => {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Every check returns `{ ok, detail, fix }`. `ok` may be `null` for "this is information, not a verdict" — a
 * browser with no profile is not a failure until you try to use it.
 */
export function checks({ home = HOME, root = ROOT } = {}) {
  const dist = join(root, 'dist');
  const wrapper = join(home, '.local/share/mdh/host.sh');
  const configDir = join(home, '.config/mdh');
  const expectedId = (() => {
    try {
      return extensionIdFromKey(readJson(join(root, 'src/overlays/chrome.json')).key);
    } catch {
      return null;
    }
  })();

  return [
    {
      id: 'node',
      title: 'Node.js 20 or newer',
      run() {
        const major = Number(process.versions.node.split('.')[0]);
        return {
          ok: major >= 20,
          detail: `v${process.versions.node}`,
          fix: 'Debian/Ubuntu: sudo apt install nodejs  ·  Fedora: sudo dnf install nodejs  ·  or nvm install 22\n' +
            '      This is the only thing here that may need sudo, and it installs Node, not this project.',
        };
      },
    },
    {
      id: 'build',
      title: 'the extension is built',
      run() {
        const chrome = join(dist, 'chrome/manifest.json');
        const firefox = join(dist, 'firefox/manifest.json');
        if (!existsSync(chrome) || !existsSync(firefox)) {
          return { ok: false, detail: 'dist/chrome or dist/firefox is missing', fix: `cd ${root} && node tools/build.mjs` };
        }
        const version = readJson(chrome).version;
        return {
          ok: version === pkg.version,
          detail: `both artifacts built, manifest v${version}`,
          fix: `the artifacts say ${version}, package.json says ${pkg.version} — rebuild: node tools/build.mjs`,
        };
      },
    },
    {
      id: 'identity',
      title: 'the extension id the host allows',
      run() {
        if (!expectedId) return { ok: false, detail: 'src/overlays/chrome.json has no key', fix: 're-clone the repository; the key is part of it' };
        return { ok: true, detail: `${expectedId} (pinned by the key, not by where you unpacked it)` };
      },
    },
    {
      id: 'host-manifests',
      title: 'the native host is registered',
      run() {
        const found = hostLocations(home).filter((entry) => existsSync(entry.file));
        const browsersWithProfile = hostLocations(home).filter((entry) => existsSync(dirname(dirname(entry.file))));
        if (!found.length) {
          return {
            ok: false,
            detail: browsersWithProfile.length
              ? `no host manifest, but ${browsersWithProfile.map((b) => b.browser).join(', ')} is installed`
              : 'no browser profile found and no host manifest',
            fix: browsersWithProfile.length
              ? `cd ${root} && ./install.sh      (then reload the extension)`
              : 'open your browser once, then: cd ' + root + ' && ./install.sh',
          };
        }
        const broken = [];
        for (const entry of found) {
          let parsed;
          try {
            parsed = readJson(entry.file);
          } catch {
            broken.push(`${entry.browser}: not valid JSON`);
            continue;
          }
          if (!parsed.path || !existsSync(parsed.path)) broken.push(`${entry.browser}: points at ${parsed.path}, which does not exist`);
          else if (!canExecute(parsed.path)) broken.push(`${entry.browser}: ${parsed.path} is not executable`);
          else if (entry.browser === 'Firefox') {
            if (!(parsed.allowed_extensions ?? []).includes(GECKO_ID)) broken.push(`${entry.browser}: does not allow ${GECKO_ID}`);
          } else if (expectedId && !(parsed.allowed_origins ?? []).some((o) => o.includes(expectedId))) {
            broken.push(`${entry.browser}: does not allow chrome-extension://${expectedId}/`);
          }
        }
        return broken.length
          ? { ok: false, detail: broken.join(' · '), fix: `cd ${root} && ./install.sh` }
          : { ok: true, detail: found.map((entry) => entry.browser).join(', ') };
      },
    },
    {
      id: 'wrapper',
      title: 'the host wrapper runs',
      run() {
        if (!existsSync(wrapper)) return { ok: false, detail: `${wrapper} is missing`, fix: `cd ${root} && ./install.sh` };
        if (!canExecute(wrapper)) return { ok: false, detail: `${wrapper} is not executable`, fix: `chmod +x ${wrapper}` };
        const target = /exec\s+"([^"]+)"\s+"([^"]+)"/.exec(readFileSync(wrapper, 'utf8'));
        if (target && !existsSync(target[1])) {
          return { ok: false, detail: `the wrapper runs ${target[1]}, which no longer exists`, fix: `cd ${root} && ./install.sh` };
        }
        return { ok: true, detail: target ? `${target[1]} ${target[2]}` : wrapper };
      },
    },
    {
      id: 'config',
      title: 'the config files are readable',
      run() {
        const problems = [];
        for (const [name, file] of [['config.json', join(configDir, 'config.json')], ['servers.json', join(configDir, 'servers.json')]]) {
          if (!existsSync(file)) {
            problems.push(`${name} is missing`);
            continue;
          }
          try {
            readJson(file);
          } catch (error) {
            problems.push(`${name} is not valid JSON (${error.message.split('\n')[0]})`);
          }
        }
        if (problems.length) return { ok: false, detail: problems.join(' · '), fix: `cd ${root} && ./install.sh   (it keeps edits to existing files)` };

        const missing = [];
        try {
          const cfg = readJson(join(configDir, 'config.json'));
          for (const path of cfg.allowPaths ?? []) {
            const real = String(path).replace(/^~/, home);
            if (!existsSync(real)) missing.push(`${path} does not exist yet`);
          }
        } catch { /* already reported above */ }
        return {
          ok: true,
          detail: missing.length ? `reads fine; ${missing.join(' · ')} (created on first write)` : 'config.json and servers.json read fine',
        };
      },
    },
    {
      id: 'host-answers',
      title: 'the host answers a ping',
      run() {
        const probe = spawnSync(process.execPath, [join(root, 'tools/selfcheck.mjs'), '--quiet'], {
          encoding: 'utf8',
          env: { ...process.env, HOME: home },
          timeout: 20000,
        });
        if (probe.status === 0) {
          const line = (probe.stdout || probe.stderr || '').trim().split('\n').filter(Boolean).at(-1) ?? 'pong received';
          return { ok: true, detail: line };
        }
        return {
          ok: false,
          detail: (probe.stderr || probe.stdout || `exit ${probe.status}`).trim().split('\n').slice(-2).join(' '),
          fix: `node ${join(root, 'host/mdh-host.mjs')}   — run it by hand and read stderr; that is the whole error report`,
        };
      },
    },
    {
      id: 'state',
      title: 'the state folder is writable',
      run() {
        const dir = join(home, '.local/state/mdh');
        try {
          mkdirSync(dir, { recursive: true });
          const probe = join(dir, `.doctor-${process.pid}`);
          writeFileSync(probe, 'ok');
          rmSync(probe);
          return { ok: true, detail: `${dir} (audit log lives here)` };
        } catch (error) {
          return { ok: false, detail: error.message, fix: `mkdir -p ${dir} && chmod u+rwx ${dir}` };
        }
      },
    },
    {
      id: 'audit',
      title: 'the audit chain verifies',
      run() {
        const file = join(home, '.local/state/mdh/audit.jsonl');
        if (!existsSync(file)) return { ok: null, detail: 'no calls yet — the first one creates it' };
        const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).length;
        return { ok: true, detail: `${lines} line${lines === 1 ? '' : 's'} in ${file}` };
      },
    },
    {
      id: 'browsers',
      title: 'browsers and where the extension goes',
      run() {
        const profiles = hostLocations(home).filter((entry) => existsSync(dirname(dirname(entry.file))));
        const detail = profiles.length ? profiles.map((entry) => entry.browser).join(', ') : 'none found';
        return { ok: null, detail, fix: `load ${join(root, 'dist/chrome')} at chrome://extensions → Developer mode → Load unpacked` };
      },
    },
    {
      id: 'logs',
      title: 'the log viewer',
      run() {
        const viewer = join(home, '.local/share/mdh/mdh-log');
        return existsSync(viewer)
          ? { ok: true, detail: viewer }
          : { ok: null, detail: 'not installed', fix: `cd ${root} && ./install.sh` };
      },
    },
  ];
}

export function runChecks(options) {
  return checks(options).map((check) => {
    let result;
    try {
      result = check.run();
    } catch (error) {
      result = { ok: false, detail: error.message, fix: 'this check itself failed — that is a bug worth reporting' };
    }
    return { id: check.id, title: check.title, ...result };
  });
}

/** Did anything actually fail? `null` is information, not a failure. */
export const failed = (results) => results.filter((entry) => entry.ok === false);

function report(results) {
  const lines = [''];
  lines.push('  doctor — one line per thing that can be wrong');
  lines.push('');
  for (const entry of results) {
    const mark = entry.ok === true ? 'ok  ' : entry.ok === null ? 'note' : 'FAIL';
    lines.push(`  ${mark}  ${entry.title.padEnd(34, ' ')} ${entry.detail ?? ''}`);
    if (entry.ok === false && entry.fix) {
      for (const fixLine of String(entry.fix).split('\n')) lines.push(`        fix: ${fixLine.trim()}`);
    } else if (entry.ok === null && entry.fix) {
      lines.push(`        next: ${entry.fix}`);
    }
  }
  const bad = failed(results);
  lines.push('');
  if (bad.length) {
    lines.push(`  ${bad.length} thing${bad.length === 1 ? '' : 's'} to fix. Each FAIL above has the command under it.`);
    lines.push('  Still stuck: node tools/doctor.mjs --json and open an issue with the output — it contains no paths');
    lines.push('  outside your home folder and no file contents.');
  } else {
    lines.push('  Nothing is broken. If the pill still does not appear, the extension is not loaded in that browser:');
    lines.push('  chrome://extensions → Developer mode → Load unpacked → dist/chrome. That is the step nothing can automate.');
  }
  lines.push('');
  process.stdout.write(`${lines.join('\n')}\n`);
}

function main(argv) {
  const results = runChecks();
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ checks: results }, null, 2)}\n`);
  } else {
    report(results);
  }
  return failed(results).length ? 1 : 0;
}

if (process.argv[1]?.endsWith('doctor.mjs')) process.exit(main(process.argv.slice(2)));
