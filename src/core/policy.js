/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * core/policy.js — the coarse gate in the extension; the host has the real one.
 *
 * Two layers on purpose:
 *   · here  — a pure, string-level check so the UI can refuse early and show the reason in the card;
 *   · host  — `realpath()` + prefix match against the same lists, after resolving symlinks.
 * A string check can be fooled by a symlink; the host check cannot, and the host is the one that
 * actually opens the file. Doing it twice costs microseconds and means a bug in either layer is not
 * automatically a way past the other.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;

  const isAbs = (p) => typeof p === 'string' && p.startsWith('/');
  // This file is the bouncer, the host is the lock. A bouncer can be talked into things; a lock cannot.
  const isHomeRelative = (p) => typeof p === 'string' && (p === '~' || p.startsWith('~/'));

  /** Collapse `.`/`..`/duplicate slashes without touching `~`. Purely lexical. */
  function normalize(p) {
    let s = String(p ?? '').trim();
    if (!s) return '';
    const home = s === '~' || s.startsWith('~/');
    if (home) s = s.slice(1);
    const parts = [];
    for (const seg of s.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') {
        if (!parts.length) return null; // escapes above the root: refuse rather than guess
        parts.pop();
        continue;
      }
      parts.push(seg);
    }
    const joined = '/' + parts.join('/');
    return home ? '~' + (joined === '/' ? '' : joined) : joined;
  }

  /** Is `path` equal to, or inside, one of `roots`? Lexical; the host repeats it canonically. */
  function isInside(path, roots) {
    const p = normalize(path);
    if (p === null) return false;
    for (const root of roots) {
      const r = normalize(root);
      if (r === null || r === '') continue;
      if (p === r) return true;
      if (p.startsWith(r === '/' ? '/' : r + '/')) return true;
    }
    return false;
  }

  /** Arguments that name a filesystem path, per tool. Anything not listed is command/opaque text. */
  const PATH_ARGS = {
    read_file: ['path'],
    write_file: ['path'],
    edit_file: ['path'],
    list_dir: ['path'],
    file_info: ['path'],
    search_files: ['path'],
    run_command: ['cwd'],
    open_app: [],
  };

  /** Tools whose argument text may itself contain a command; used only to explain, never to decide. */
  const COMMAND_ARGS = { run_command: ['cmd', 'cmds'], send_stdin: [] };

  function pathsIn(call) {
    const args = call?.arguments ?? {};
    const keys = PATH_ARGS[call?.tool] ?? [];
    const out = [];
    for (const k of keys) {
      const v = args[k];
      if (typeof v === 'string' && (isAbs(v) || isHomeRelative(v))) out.push(v);
    }
    return out;
  }

/** Shell syntax that means "this is more than one thing": a grant covers one plain command, not a sentence. */
const SHELL_META = /[;&|<>$`(){}[\]*?!#~\\\n]/;

/** The command a call would run, normalised for comparison; null if it is not a command call. */
function commandSignature(call) {
  const args = call?.arguments ?? {};
  const raw = typeof args.cmd === 'string' ? args.cmd : Array.isArray(args.cmds) ? args.cmds.join(' && ') : null;
  if (raw === null) return null;
  const cmd = raw.trim().replace(/\s+/g, ' ');
  return cmd ? { tool: call.tool, cmd, cwd: String(args.cwd ?? '').trim() } : null;
}

/**
 * Can this call be granted for the rest of the run? Only an exact, single, plain command — no chaining, no
 * substitution, no globs. `run_command` keeps asking even when a tool is set to allow; a grant is the answer to
 * "I have approved the same thing four times", not a way to switch the lock off.
 */
function grantable(call) {
  const sig = commandSignature(call);
  if (!sig) return { ok: false, reason: 'this is not a single command' };
  if (SHELL_META.test(sig.cmd)) {
    return {
      ok: false,
      reason: 'the command uses shell chaining, redirection or expansion — those are approved one at a time, on purpose',
    };
  }
  return { ok: true, key: `${sig.tool}\u0000${sig.cwd}\u0000${sig.cmd}`, command: sig.cmd };
}

  MDH.policy = {
    normalize,
    isInside,
    pathsIn,
    commandSignature,
    grantable,

    /**
     * @returns {{decision:'allow'|'ask'|'deny', rule:string, reason?:string}}
     */
    check(call, policy) {
      const tool = call?.tool;
      if (!tool) return { decision: 'deny', rule: 'no-tool', reason: 'the call has no tool name' };

      const approval = policy?.approval ?? {};
      const base = approval[tool];
      if (base === undefined) {
        // Unknown tools are never silently allowed: only the builtins and discovered MCP tools exist,
        // and the host rejects anything else. Ask, so the user still sees it.
        return { decision: 'ask', rule: 'unknown-tool', reason: `${tool} is not in the policy` };
      }

      for (const p of pathsIn(call)) {
        if (isInside(p, policy.denyPaths ?? [])) {
          return { decision: 'deny', rule: 'deny-path', reason: `${p} is on the deny list` };
        }
        if (!isInside(p, policy.allowPaths ?? [])) {
          return { decision: 'deny', rule: 'outside-allowlist', reason: `${p} is outside the allowed folders` };
        }
      }

      if (base === 'allow' && COMMAND_ARGS[tool]) {
        // A read-only tool cannot execute; a command can. Keep the user in the loop by default.
        return { decision: approval[tool] === 'allow' ? 'ask' : base, rule: 'command-requires-approval' };
      }

      return { decision: base, rule: `tool:${tool}` };
    },

    /** Everything the approval card needs to render, derived from the call only — never from prose. */
    describe(call, policy) {
      const tool = call?.tool ?? '';
      const args = call?.arguments ?? {};
      const paths = pathsIn(call);
      const command = args.cmd ?? (Array.isArray(args.cmds) ? args.cmds.join('\n') : null);
      const verdict = this.check(call, policy);
      return {
        tool,
        verdict,
        paths,
        command,
        preview:
          typeof args.content === 'string'
            ? { kind: 'content', text: args.content }
            : typeof args.find === 'string'
              ? { kind: 'edit', find: args.find, replace: args.replace }
              : null,
      };
    },
  };
})();
