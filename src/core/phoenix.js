/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * core/phoenix.js — the completion code.
 *
 * A loop that ends whenever the model writes a sentence is a loop that ends by accident. Prose is how a model
 * says "next I would…", "all done!", "I have completed the task" — three phrases that mean three different
 * things and look identical to a parser. Any product built on top of a chat window has this bug; the fix is
 * not a better regex, it is a **checkable end state**.
 *
 * So: every session gets a short random code. The task can only end with a `finish` call that carries that
 * exact code. Nothing else ends it — not a polite sign-off, not a summary, not a sentence that mentions
 * finishing. The code is printed in the prompt, never in the answer, and it is regenerated per session so a
 * stale "done" from a previous task cannot satisfy this one.
 *
 * This pattern is old and boring in the right way: a sentinel that a pipeline defines and enforces itself,
 * rather than a signal it hopes the vendor will provide. `stop_reason` tells you a generation stopped; it
 * cannot tell you a *task* is complete, because the task spans turns the vendor never sees.
 *
 * The code is not a security control. The model can read it from its own instructions, and should: it is a
 * **deliberateness** control, aimed at the difference between "I finished" and "I typed the word finished".
 */
(() => {
  const MDH = (globalThis.MDH ??= {});

  // 32 symbols, no I/L/O/0/1: the characters models and humans confuse get left out on purpose.
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const LENGTH = 6;
  const PREFIX = 'PHX';
  const SEP = '-';

  /** Random code in the shape `PHX-7KQ2MD`. `random` is injectable so tests are deterministic. */
  function make(random = defaultRandom) {
    let out = '';
    for (let i = 0; i < LENGTH; i += 1) {
      out += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
    }
    return `${PREFIX}${SEP}${out}`;
  }

  function defaultRandom() {
    // Web Crypto in the browser and in Node; Math.random only as a last resort, and it never is one.
    const c = globalThis.crypto;
    if (c?.getRandomValues) {
      const buf = new Uint32Array(1);
      c.getRandomValues(buf);
      return buf[0] / 2 ** 32;
    }
    return Math.random();
  }

  /** Reduce anything to the six significant characters: case, dashes and stray spaces do not matter. */
  function normalise(value) {
    const raw = String(value ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const body = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
    return body.slice(0, LENGTH);
  }

  function matches(given, code) {
    const want = normalise(code);
    if (want.length !== LENGTH) return false;
    const raw = String(given ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const body = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
    // Exactly six characters. Padding must not pass: "7KQ2MDX" is not "7KQ2MD" with a typo, it is a
    // different string, and a lenient comparison here is the difference between a rule and a suggestion.
    return body.length === LENGTH && body === want;
  }

  /** One line for a reminder — short enough to repeat every turn without eating the context budget. */
  const banner = (code) => `completion code ${code} — only a finish call carrying it ends the task`;

  const call = (code, summary = '…') =>
    `{"mdh_call":{"tool":"finish","arguments":{"summary":"${summary}","phoenix":"${code}"}}}`;

  /**
   * The prompt section. It says three things, in this order: here is the code, here is the only legal way to
   * use it, and here is what will happen if you try to finish without it (the run continues).
   */
  function block(code) {
    return [
      '# Completion code (this session)',
      '',
      `The plug is **${code}**. Nothing else ends this task: not "done", not a summary, not a friendly sign-off.`,
      '',
      `**${code}**`,
      '',
      'The task ends in exactly one way:',
      '',
      '```json',
      call(code),
      '```',
      '',
      '- The `phoenix` field must be that exact code. Without it, the call is rejected and you are asked again.',
      '- Never write the code as a sentence, a sign-off or a status line. It appears once, in that call.',
      '- "Done", "I have finished", "all set" are not completion. They are prose, and prose does not end a task.',
      '- If the task is long, keep working. There is no reward for finishing early and no penalty for taking another turn.',
    ].join('\n');
  }

  /** The correction sent when a finish call arrives without the right code. */
  const rejection = (code) =>
    `[MDH_PHOENIX] That finish call did not carry the completion code, so the task is still running. ` +
    `If it really is finished, call finish again with "phoenix":"${code}". ` +
    `If it is not finished, do the next step instead. [/MDH_PHOENIX]`;

  MDH.phoenix = {
    ALPHABET,
    LENGTH,
    PREFIX,
    make,
    normalise,
    matches,
    banner,
    block,
    call,
    rejection,
    /** How many distinguishable codes exist — printed in the docs so the claim is checkable. */
    size: () => ALPHABET.length ** LENGTH,
  };
})();
