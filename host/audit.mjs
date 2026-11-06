/**
 * host/audit.mjs — an append-only, hash-chained record of every call.
 *
 * It is the user's own record of their own machine, not evidence against anybody: the chain makes a
 * silent edit detectable, nothing more. Arguments are summarised (paths and the first line of a
 * command), never file contents, so the log itself is not a leak.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { paths } from './config.mjs';

const GENESIS = '0'.repeat(64);

function lineHash(prev, entry) {
  return createHash('sha256').update(prev).update(JSON.stringify(entry)).digest('hex');
}

/** Keep the log small in meaning as well as in size. */
function summarise(tool, args = {}) {
  const out = {};
  if (typeof args.path === 'string') out.path = args.path;
  if (typeof args.cwd === 'string') out.cwd = args.cwd;
  if (typeof args.cmd === 'string') out.cmd = args.cmd.split('\n')[0].slice(0, 200);
  if (Array.isArray(args.cmds)) out.cmds = args.cmds.slice(0, 3).map((c) => String(c).slice(0, 120));
  if (typeof args.pattern === 'string') out.pattern = args.pattern.slice(0, 120);
  if (typeof args.offset === 'number') out.offset = args.offset;
  if (typeof args.name_or_command === 'string') out.app = args.name_or_command.slice(0, 120);
  out.bytesIn = JSON.stringify(args).length;
  out.tool = tool;
  return out;
}

function lastHash() {
  try {
    if (!existsSync(paths.audit)) return GENESIS;
    const lines = readFileSync(paths.audit, 'utf8').trim().split('\n');
    const last = lines[lines.length - 1];
    if (!last) return GENESIS;
    return JSON.parse(last).hash ?? GENESIS;
  } catch {
    return GENESIS;
  }
}

/**
 * Append one line. If this ever throws, the call still happens — an audit log that can block work becomes
 * an outage with extra steps, so failures are logged to stderr and swallowed.
 */
/**
 * Who allowed the call. A closed vocabulary would be tidier, but versions drift, so the rule is a shape: lowercase
 * words and colons, 24 characters. Anything else is recorded as `other` rather than silently dropped — a log that
 * quietly loses a field is worse than one that admits it did not understand it.
 */
function cleanVia(via) {
  if (via === undefined || via === null || via === '') return undefined;
  const text = String(via).toLowerCase();
  return /^[a-z][a-z0-9:-]{0,23}$/.test(text) ? text : 'other';
}

export function appendAudit({ tool, args, status, ms, detail, run, via }) {
  try {
    mkdirSync(dirname(paths.audit), { recursive: true });
    const prev = lastHash();
    const entry = {
      at: new Date().toISOString(),
      tool,
      args: summarise(tool, args),
      status,
      ms,
      detail: detail ? String(detail).slice(0, 200) : undefined,
      // Which run this call belonged to. Optional because older entries predate it, and a log that lies about
      // its own history is worse than one with a gap in it.
      run: run ? String(run).slice(0, 40) : undefined,
      // Which gate let this through: policy, a remembered grant, or a person clicking Allow. Omitted when the
      // caller is older than the field, so old entries still verify.
      via: cleanVia(via),
      prev,
    };
    entry.hash = lineHash(prev, { ...entry, hash: undefined });
    appendFileSync(paths.audit, `${JSON.stringify(entry)}\n`);
  } catch (e) {
    process.stderr.write(`mdh-host: audit write failed: ${e.message}\n`);
  }
}

/** Verify the chain; returns the first broken line, or ok:true. */
export function verifyAudit() {
  if (!existsSync(paths.audit)) return { ok: true, lines: 0 };
  const lines = readFileSync(paths.audit, 'utf8').trim().split('\n').filter(Boolean);
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      return { ok: false, brokenAt: i + 1, reason: 'not json' };
    }
    const { hash, ...rest } = entry;
    const expected = lineHash(prev, rest);
    if (entry.prev !== prev || hash !== expected) return { ok: false, brokenAt: i + 1, reason: 'hash mismatch' };
    prev = hash;
  }
  return { ok: true, lines: lines.length };
}
