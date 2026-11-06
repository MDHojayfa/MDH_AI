#!/usr/bin/env node
/**
 * host/mdh-log.mjs — "show me what happened", from a terminal.
 *
 *   node host/mdh-log.mjs              write ~/.local/state/mdh/log.html and print the path
 *   node host/mdh-log.mjs --open       …and open it in the default browser
 *   node host/mdh-log.mjs --serve      live view on 127.0.0.1, random port, token in the URL
 *   node host/mdh-log.mjs --json       machine-readable summary, for a bug report or a script
 *
 * The snapshot mode exists because it is the mode that always works: no port, no permission, no running
 * process — a file you can email to yourself before a reboot. The live mode exists because a 40-minute task
 * is easier to watch than to reconstruct.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { archiveAudit, stateSnapshot } from './logs.mjs';
import { renderPage, startViewer, summary } from './viewer.mjs';
import { paths } from './config.mjs';

const VERSION = '1.0.0';

function parseArgs(argv) {
  const args = { serve: false, open: false, json: false, watch: false, runs: false, run: null, interval: 5, port: 0, lines: 500, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--serve') args.serve = true;
    else if (arg === '--open') args.open = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--watch') {
      args.watch = true;
      const next = Number(argv[i + 1]);
      if (Number.isFinite(next) && next > 0) {
        args.interval = Math.max(2, next);
        i += 1;
      }
    }
    else if (arg === '--runs') args.runs = true;
    else if (arg === '--run') args.run = argv[++i] ?? '';
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--port') args.port = Number(argv[++i] ?? 0) || 0;
    else if (arg === '--lines') args.lines = Math.max(1, Number(argv[++i] ?? 500) || 500);
    else if (arg === '--out') args.out = argv[++i] ?? null;
    else if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
    else args.out = arg;
  }
  return args;
}

const HELP = `mdh-log ${VERSION} — the log page behind the product

  node host/mdh-log.mjs [options]

  (no options)     write a self-contained HTML snapshot and print its path
  --serve          live view on 127.0.0.1 only, random port, token in the URL
  --port <n>       port for --serve (default: random)
  --open           open the result in the default browser
  --json           print a summary as JSON instead of writing a page
  --runs           list the runs in the audit, newest first (id, calls, failures, tools)
  --run <id>       print one run in order: every call, its status, its detail
  --watch [sec]    re-render the snapshot file every N seconds (default 5); no server, no port
  --lines <n>      how many audit entries to include (default 500)
  --out <file>     where to write the snapshot

  Nothing here leaves the machine. --serve binds loopback and refuses every request
  without the token printed next to the URL.`;

function openUrl(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  if (args.serve) {
    const viewer = await startViewer({
      getState: () => stateSnapshot({ limit: args.lines, hostVersion: VERSION }),
      clear: () => archiveAudit(),
      port: args.port,
    });
    process.stdout.write(`mdh-log ${VERSION} · live\n${viewer.url}\n`);
    process.stdout.write('loopback only · close with Ctrl-C · the token dies with the process\n');
    if (args.open) openUrl(viewer.url);
    const stop = async () => {
      await viewer.close();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    return null;
  }

  const state = stateSnapshot({ limit: args.lines, hostVersion: VERSION });

  if (args.runs || args.run) {
    const { groupRuns } = await import('./viewer.mjs');
    const rows = state.entries ?? [];
    if (args.run) {
      const mine = rows.filter((entry) => entry.run === args.run);
      if (!mine.length) {
        process.stdout.write(`no calls recorded for run ${args.run}\n`);
        process.exit(1);
      }
      const when = (iso) => new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
      process.stdout.write(`run ${args.run} — ${mine.length} calls\n\n`);
      if (mine.some((entry) => entry.via)) {
        const counted = mine.reduce((acc, entry) => {
          const key = entry.via ?? 'unknown';
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {});
        process.stdout.write(
          `allowed by: ${Object.entries(counted).map(([via, n]) => `${via} ${n}`).join(' · ')}\n\n`,
        );
      }
      for (const entry of mine) {
        process.stdout.write(
          `${when(entry.at)}  ${String(entry.tool).padEnd(14)} ${String(entry.status ?? '?').padEnd(7)} ` +
            `${String(entry.ms ?? '').padStart(5)} ms  ${String(entry.via ?? '—').padEnd(14)} ` +
            `${String(entry.detail ?? '').slice(0, 70)}\n`,
        );
      }
      process.exit(0);
    }
    const groups = groupRuns(rows);
    if (!groups.length) {
      process.stdout.write('no calls recorded yet\n');
      process.exit(0);
    }
    const when = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : '—');
    process.stdout.write('run          calls  failed  from              to                tools\n');
    for (const group of groups) {
      process.stdout.write(
        `${(group.key || '(earlier)').padEnd(12)} ${String(group.calls).padStart(5)}  ` +
          `${String(group.errors).padStart(6)}  ${when(group.first).padEnd(17)} ${when(group.last).padEnd(17)} ` +
          `${group.tools.join(', ')}\n`,
      );
    }
    process.exit(0);
  }

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version: VERSION,
          generatedAt: new Date().toISOString(),
          summary: summary(state.entries),
          audit: state.meta.audit,
          hypotheses: state.diag?.hypotheses ?? [],
          diag: state.diag?.diag ?? null,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  const out = args.out ?? join(paths.stateDir, 'log.html');
  mkdirSync(dirname(out), { recursive: true });

  const writeOnce = () => {
    const fresh = stateSnapshot({ limit: args.lines, hostVersion: VERSION });
    writeFileSync(out, renderPage({ ...fresh, generatedAt: Date.now() }));
    return fresh;
  };

  const first = writeOnce();
  process.stdout.write(`${out}\n`);
  process.stdout.write(`${first.entries.length} calls · audit ${first.meta.audit.ok ? 'intact' : 'broken'}\n`);
  if (args.open) openUrl(`file://${out}`);

  if (args.watch) {
    process.stdout.write(`watching every ${args.interval} s · Ctrl-C to stop · the file is the interface\n`);
    const timer = setInterval(() => {
      try {
        const fresh = writeOnce();
        process.stdout.write(`re-rendered · ${fresh.entries.length} calls · ${new Date().toLocaleTimeString()}\n`);
      } catch (e) {
        process.stderr.write(`re-render failed: ${e.message}\n`);
      }
    }, args.interval * 1000);
    process.on('SIGINT', () => {
      clearInterval(timer);
      process.exit(0);
    });
    return null;
  }
  return 0;
}

main()
  .then((code) => {
    if (code !== null) process.exit(code);
  })
  .catch((e) => {
    process.stderr.write(`mdh-log: ${e.message}\n`);
    process.exit(1);
  });
