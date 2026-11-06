/**
 * host/config.mjs — everything the host reads off disk.
 *
 * Two files, both optional, both plain JSON, both in the user's own directories:
 *   ~/.config/mdh/config.json   policy (allowed folders, approval defaults) and runtime knobs
 *   ~/.config/mdh/servers.json  MCP servers to start
 *
 * The host reads these itself and never trusts the copy the extension sends: two opinions about safety
 * is one opinion and one liability. The files on
 * disk are the authority, because they are the ones a user actually edited.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const HOME = homedir();

export const paths = {
  home: HOME,
  configDir: join(HOME, '.config', 'mdh'),
  config: join(HOME, '.config', 'mdh', 'config.json'),
  servers: join(HOME, '.config', 'mdh', 'servers.json'),
  stateDir: join(HOME, '.local', 'state', 'mdh'),
  audit: join(HOME, '.local', 'state', 'mdh', 'audit.jsonl'),
  sessions: join(HOME, '.local', 'state', 'mdh', 'sessions.json'),
};

export const DEFAULTS = {
  allowPaths: ['~/projects', '~/mdh', '/tmp/mdh'],
  denyPaths: [
    '~/.ssh', '~/.gnupg', '~/.aws', '~/.config', '~/.local/share/keyrings',
    '~/.mozilla', '~/.password-store', '/etc/shadow', '/etc/sudoers', '/etc/ssh',
  ],
  maxResultBytes: 131072,
  maxCallBytes: 262144,
  commandTimeoutMs: 60000,
  // 0 = a random loopback port each time the viewer starts. Set a number only if you bookmark it.
  viewerPort: 0,
  maxTimeoutMs: 300000,
  container: false,
};

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    process.stderr.write(`mdh-host: cannot read ${file}: ${e.message}\n`);
    return fallback;
  }
}

export function loadConfig() {
  const fromDisk = readJson(paths.config, {});
  return {
    ...DEFAULTS,
    ...fromDisk,
    allowPaths: fromDisk.allowPaths ?? DEFAULTS.allowPaths,
    denyPaths: fromDisk.denyPaths ?? DEFAULTS.denyPaths,
  };
}

export function loadServers() {
  const raw = readJson(paths.servers, { servers: [] });
  const list = Array.isArray(raw) ? raw : raw.servers ?? [];
  return list.filter((s) => s && s.name && (Array.isArray(s.command) || typeof s.command === 'string'));
}

/** Write a starter config on first run so a user has something to edit rather than a blank page. */
export function ensureConfigFiles() {
  mkdirSync(paths.configDir, { recursive: true });
  mkdirSync(paths.stateDir, { recursive: true });

  if (!existsSync(paths.config)) {
    writeFileSync(
      paths.config,
      `${JSON.stringify(
        {
          allowPaths: DEFAULTS.allowPaths,
          denyPaths: DEFAULTS.denyPaths,
          commandTimeoutMs: DEFAULTS.commandTimeoutMs,
          container: false,
        },
        null,
        2,
      )}\n`,
    );
  }
  if (!existsSync(paths.servers)) {
    writeFileSync(paths.servers, `${JSON.stringify({ servers: [] }, null, 2)}\n`);
  }
}

export function expandHome(p) {
  const s = String(p ?? '');
  if (s === '~') return HOME;
  if (s.startsWith('~/')) return join(HOME, s.slice(2));
  return s;
}

export function resolveFrom(base, p) {
  const expanded = expandHome(p);
  return expanded.startsWith('/') ? expanded : resolve(base ?? process.cwd(), expanded);
}

export { dirname };
