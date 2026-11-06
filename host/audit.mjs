/**
 * host/audit.mjs — an append-only, hash-chained record of every call.
 *
 * It is the user's own record of their own machine, not evidence against anybody: the chain makes a
 * silent edit detectable, nothing more. Arguments are summarised (paths and the first line of a
 * command), never file contents, so the log itself is not a leak.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { paths } from './config.mjs';

const GENESIS = '0'.repeat(64);
/*
 * A checkpoint, beside the chain and outside it: how many entries the log had the last time the host wrote one,
 * and what the last hash was. This exists because a hash chain cannot detect its own tail being removed — delete
 * the last ten lines and every remaining link still verifies (Bellare & Yee, forward integrity; Ma & Tsudik on
 * the truncation attack). It is a smoke alarm for the honest cases, not a defence against someone who can write
 * both files: that person can lie about the count too. `docs/RESEARCH.md` says so in as many words.
 */
const checkpointPath = () => `${paths.audit}.checkpoint.json`;

function writeCheckpoint(lines, lastHash, extraLost = 0) {
  try {
    mkdirSync(paths.stateDir, { recursive: true });
    /*
     * `lost` is cumulative: if this write sees fewer entries than the last one recorded, the difference is added
     * and never subtracted. Without that, deleting the tail and letting one more call through would reset the
     * count and bury the evidence — which is the obvious way to defeat a checkpoint that only remembers a total.
     */
    const previous = readCheckpoint();
    const lost = (previous?.lost ?? 0) + Math.max(0, (previous?.lines ?? 0) - lines) + extraLost;
    writeFileSync(checkpointPath(), JSON.stringify({ lines, lost, lastHash, at: new Date().toISOString() }));
  } catch (e) {
    process.stderr.write(`mdh-host: checkpoint write failed: ${e.message}\n`);
  }
}

function readCheckpoint() {
  try {
    if (!existsSync(checkpointPath())) return null;
    const parsed = JSON.parse(readFileSync(checkpointPath(), 'utf8'));
    return Number.isInteger(parsed?.lines) && typeof parsed?.lastHash === 'string' ? parsed : null;
  } catch {
    return null; // a corrupt checkpoint is a missing checkpoint, not a broken chain
  }
}

/** Start a new chain honestly: called when the log is archived, so "fewer lines than the checkpoint" is not a lie. */
export function resetCheckpoint() {
  try {
    mkdirSync(paths.stateDir, { recursive: true });
    // Written directly rather than through writeCheckpoint(): a deliberate new chain has lost nothing.
    writeFileSync(checkpointPath(), JSON.stringify({ lines: 0, lost: 0, lastHash: GENESIS, at: new Date().toISOString() }));
  } catch {
    /* nothing to do: verify treats a missing checkpoint as "no opinion" */
  }
}

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
    const counted = existsSync(paths.audit) ? readFileSync(paths.audit, 'utf8').trim().split('\n').filter(Boolean).length : 1;
    /*
     * If the line we just chained onto is not the line the checkpoint remembers as last, the tail was replaced:
     * entries were removed and new ones written over them, and the count alone can look perfectly innocent.
     */
    const remembered = readCheckpoint();
    const replaced = Boolean(remembered && prev !== remembered.lastHash && prev !== GENESIS);
    writeCheckpoint(counted, entry.hash, replaced ? 1 : 0);
  } catch (e) {
    process.stderr.write(`mdh-host: audit write failed: ${e.message}\n`);
  }
}

/** Verify the chain; returns the first broken line, or ok:true. */
export function verifyAudit() {
  if (!existsSync(paths.audit)) {
    // A missing file is the largest possible truncation. Saying "ok" here was the old behaviour and it was wrong
    // in exactly the case the checkpoint exists for.
    const cp = readCheckpoint();
    const remembered = (cp?.lines ?? 0) + (cp?.lost ?? 0);
    if (remembered > 0) {
      return {
        ok: false,
        lines: 0,
        truncated: true,
        missing: remembered,
        reason: `the audit file is gone and the checkpoint remembers ${remembered} entries`,
      };
    }
    return { ok: true, lines: 0 };
  }
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
  /*
   * The chain is intact — now check that it is the same chain. A shorter file than the checkpoint remembers means
   * entries were removed from the end, which no link can prove on its own.
   */
  const checkpoint = readCheckpoint();
  const lost = checkpoint?.lost ?? 0;
  const shortBy = Math.max(0, (checkpoint?.lines ?? 0) - lines.length);
  if (lost > 0 || shortBy > 0) {
    const missing = Math.max(lost, shortBy);
    return {
      ok: false,
      lines: lines.length,
      truncated: true,
      missing,
      reason:
        lost > 0
          ? `this log lost ${lost} ${lost === 1 ? 'entry' : 'entries'} after they were written — the rest of the ` +
            'chain verifies because a chain cannot see its own tail'
          : `the last ${missing} ${missing === 1 ? 'entry is' : 'entries are'} missing — the chain verifies because ` +
            'a chain cannot see its own tail',
    };
  }
  return { ok: true, lines: lines.length };
}
