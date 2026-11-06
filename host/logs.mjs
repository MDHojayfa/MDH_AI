/**
 * host/logs.mjs — reading the state directory, for the viewer and the CLI.
 *
 * Small on purpose. The audit file is the record; this module only parses it, caps it, and reads the last
 * diagnostic snapshot the extension left behind. No writing of audit lines happens here — the chain is
 * written in one place (`audit.mjs`) and read everywhere else.
 */
import { existsSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from './config.mjs';
import { verifyAudit } from './audit.mjs';

export const DIAG_FILE = () => join(paths.stateDir, 'last-diag.json');

/** Parse the JSONL, tolerate a half-written last line, newest last. */
export function readAudit(limit = 500) {
  if (!existsSync(paths.audit)) return [];
  const lines = readFileSync(paths.audit, 'utf8').split('\n').filter(Boolean);
  const slice = lines.slice(-Math.max(1, limit));
  const out = [];
  for (const line of slice) {
    try {
      const entry = JSON.parse(line);
      out.push({ ...entry, at: typeof entry.at === 'number' ? entry.at : Date.parse(entry.at) });
    } catch {
      // a torn line is not a reason to show nothing
    }
  }
  return out;
}

export function readDiag() {
  try {
    if (!existsSync(DIAG_FILE())) return null;
    return JSON.parse(readFileSync(DIAG_FILE(), 'utf8'));
  } catch {
    return null;
  }
}

export function stateSnapshot({ limit = 500, hostVersion = null, pid = process.pid } = {}) {
  return {
    entries: readAudit(limit),
    diag: readDiag(),
    meta: {
      hostVersion,
      pid,
      stateDir: paths.stateDir,
      audit: verifyAudit(),
      auditPath: paths.audit,
    },
  };
}

/**
 * Archive the audit chain and start a new one. Deliberately **not** a delete: the old file keeps its name plus
 * a timestamp, so the record of what ran on this machine survives the cleanup. A hash chain that can be
 * silently truncated is not an audit log, it is a text file with commitments.
 */
export function archiveAudit(now = new Date()) {
  try {
    if (!existsSync(paths.audit)) return { ok: true, file: null, note: 'nothing to archive' };
    const size = statSync(paths.audit).size;
    if (size === 0) return { ok: true, file: null, note: 'already empty' };
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const target = paths.audit.replace(/\.jsonl$/, `-${stamp}.jsonl`);
    renameSync(paths.audit, target);
    return { ok: true, file: target, bytes: size };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
