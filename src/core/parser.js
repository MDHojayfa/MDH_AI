/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * core/parser.js — turn a chat reply into exactly one tool call, or into a reason.
 *
 * Doctrine (docs/INTERFACES.md §6):
 *   · the model puts the call in a ```json fence; we take the **last closed** block, because a turn
 *     often narrates first and calls last (`docs/ARCHITECTURE.md` §4);
 *   · two calls are never half-executed — `multi` yields no call at all;
 *   · when we cannot read a reply we say *why* in words the model can act on, and we never quote the
 *     foreign markup back at it (that teaches it to repeat it);
 *   · coercion is schema-driven and conservative: a string that is not a number stays a string, and
 *     the host validates again before anything runs.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;

  const CALL_KEYS = ['mdh_call', 'tool_call', 'mcp_call', 'call', 'action'];
  // Five accepted spellings, because a model that has read other projects will invent a sixth. The
  // envelope is data; being generous about its name costs nothing and saves a whole turn.

  const FOREIGN = [
    /<\|?[a-z_]*tool_call\|?>/i,
    /antml:invoke/i,
    /<\/?function_calls>/i,
    /```tool_code/i,
    /<\|python_tag\|>/i,
    /<function=[a-z0-9_]+>/i,
    /\[TOOL_CALL\]/i,
  ];

  const FENCE = /```(?:json|JSON)?\s*\n?([\s\S]*?)(?:```|$)/g;

  /** Try hard, but predictably, to turn almost-JSON into JSON. Returns null on failure. */
  function repair(text) {
    let s = String(text ?? '').trim();
    if (!s) return null;

    s = s
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/\bNone\b/g, 'null');

    try {
      return JSON.parse(s);
    } catch {
      /* fall through to brace extraction */
    }

    const start = s.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(s.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null; // unbalanced: an unclosed object
  }

  /** Pull every candidate JSON object out of the reply, fences first. */
  function candidates(text) {
    const out = [];
    const seen = new Set();
    const push = (raw, fenced) => {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      const parsed = repair(trimmed);
      if (parsed) out.push({ value: parsed, raw: trimmed, fenced });
    };

    FENCE.lastIndex = 0;
    let m;
    while ((m = FENCE.exec(text)) !== null) push(m[1], true);

    if (!out.length) {
      // No usable fence: accept a bare object only if it *looks* like a call, which is stricter than
      // accepting any JSON — a reply that quotes an example must not become an execution.
      const bare = repair(text);
      if (bare && typeof bare === 'object' && hasCallShape(bare)) push(text, false);
    }
    return out;
  }

  function hasCallShape(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (CALL_KEYS.some((k) => obj[k] && typeof obj[k] === 'object')) return true;
    return typeof obj.tool === 'string' && (obj.arguments === undefined || typeof obj.arguments === 'object');
  }

  /** Normalise a parsed object to `{tool, arguments}` — or null. */
  function toCall(obj) {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of CALL_KEYS) {
      const inner = obj[k];
      if (inner && typeof inner === 'object' && typeof inner.tool === 'string') {
        return { tool: inner.tool.trim(), arguments: inner.arguments ?? inner.args ?? {} };
      }
    }
    if (typeof obj.tool === 'string') return { tool: obj.tool.trim(), arguments: obj.arguments ?? obj.args ?? {} };
    return null;
  }

  /** Count how many independent call-shaped objects a reply contains. */
  function countCalls(list) {
    let n = 0;
    for (const { value } of list) if (toCall(value)) n++;
    return n;
  }

  function coerceValue(value, schema) {
    if (value === null || value === undefined) return undefined;
    if (!schema || typeof schema !== 'object') return value;

    const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    if (Array.isArray(schema.enum) && typeof value === 'string' && !schema.enum.includes(value)) return value;

    if (type === 'number' || type === 'integer') {
      if (typeof value === 'number') return value;
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        const n = Number(value);
        return type === 'integer' ? Math.trunc(n) : n;
      }
      return value;
    }
    if (type === 'boolean') {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    }
    if (type === 'string') {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return value;
    }
    if (type === 'array') {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return value.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
      return value;
    }
    return value;
  }

  function coerceArguments(tool, args, schemas) {
    const schema = schemas?.[tool];
    const out = { ...(args ?? {}) };
    if (!schema?.properties) return out;
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (!(key in out)) continue;
      const coerced = coerceValue(out[key], prop);
      if (coerced === undefined) delete out[key];
      else out[key] = coerced;
    }
    return out;
  }

  /**
   * @param {string} text the assistant's reply
   * @param {{tools?: string[], schemas?: Record<string, any>}} ctx
   * @returns {{call: null|{tool: string, arguments: object}, reason: string, detail?: string, foreign?: string}}
   */
  function parse(text, ctx = {}) {
    const body = String(text ?? '');

    if (!body.trim()) return { call: null, reason: 'none' };

    const list = candidates(body);
    const found = countCalls(list);

    if (found > 1) return { call: null, reason: 'multi', detail: `${found} calls` };

    if (found === 1) {
      const obj = list.map((c) => toCall(c.value)).find(Boolean);
      if (!obj.tool) return { call: null, reason: 'missing_name' };
      const args = coerceArguments(obj.tool, obj.arguments, ctx.schemas);
      return { call: { tool: obj.tool, arguments: args }, reason: 'none' };
    }

    // Nothing callable. Classify, because the explanation is what makes the retry work.
    const looksLikeJson = /(^|\s)[{[]/.test(body) && /mdh_call|tool_call|"tool"|"arguments"/.test(body);
    if (looksLikeJson) {
      const fenceOpen = (body.match(/```/g) ?? []).length % 2 === 1;
      if (fenceOpen) return { call: null, reason: 'unclosed' };
      if (!list.length) return { call: null, reason: 'not_json' };
      // A block that is call-shaped but has no `tool` is a recoverable mistake: name it precisely so the
      // retry can fix exactly one thing.
      const nameless = list.some(({ value }) =>
        CALL_KEYS.some((k) => value?.[k] && typeof value[k] === 'object' && typeof value[k].tool !== 'string'),
      );
      if (nameless) return { call: null, reason: 'missing_name' };
      const badKey = CALL_KEYS.find((k) => body.includes(`"${k}_name"`));
      return { call: null, reason: badKey ? 'wrong_key' : 'not_json' };
    }

    if (/```\s*json\s*\n?[\s\S]*$/.test(body) && !/```/.test(body.slice(body.lastIndexOf('```') + 3))) {
      return { call: null, reason: 'unclosed' };
    }

    const foreign = FOREIGN.map((re) => body.match(re)).find(Boolean);
    if (foreign) return { call: null, reason: 'foreign_markup', foreign: foreign[0] };

    return { call: null, reason: 'none' };
  }

  /** Model-facing explanation. Never quotes the foreign marker it found (docs/INTERFACES.md §6). */
  function explain(reason, detail) {
    switch (reason) {
      case 'unclosed':
        return 'your json block was never closed — reply with the block, opening and closing fences both present';
      case 'not_json':
        return `your block is not valid JSON${detail ? ` (${detail})` : ''}`;
      case 'wrong_key':
        return 'the call must be {"mdh_call":{"tool":"…","arguments":{…}}}';
      case 'missing_name':
        return 'the call has no "tool" name inside mdh_call';
      case 'multi':
        return 'you sent more than one call; send exactly one and wait for its result';
      case 'truncated':
        return 'your reply was cut off before the json ended';
      case 'foreign_markup':
        return 'your reply used tool syntax from another system; use only the json block with mdh_call';
      default:
        return 'no readable call';
    }
  }

  MDH.parser = { parse, explain, repair, coerceArguments };
})();
