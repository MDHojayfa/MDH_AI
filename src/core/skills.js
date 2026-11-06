/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * core/skills.js — playbooks the model can open when it needs them.
 *
 * Claude Code has skills as folders of Markdown; we have no folder to put them in (this product has no repository,
 * and the user is not going to edit `~/.config/mdh/skills/build.md` on a laptop that is already doing its best).
 * So a skill here is a name and a body, stored in extension storage and surfaced to the model as a name only.
 *
 * The important part is what the model does *not* see: bodies stay out of the prompt until `read_skill` is called,
 * because a prompt is a budget and a playbook nobody needs this run is pure cost. Names are cheap, that is the
 * whole design.
 */
(() => {
  const MDH = (globalThis.MDH ??= {});

  const LIMITS = { skills: 12, nameChars: 40, bodyChars: 4000 };

  /** `## build\n…\n## deploy\n…` → `[{name:'build', body:'…'}]`. Forgiving on purpose: people type `#`, `###`. */
  function parse(text) {
    const lines = String(text ?? '').split('\n');
    const out = [];
    let current = null;
    for (const line of lines) {
      const heading = line.match(/^\s*#{1,4}\s+(.+?)\s*$/);
      if (heading) {
        if (current) out.push(current);
        current = { name: heading[1].slice(0, LIMITS.nameChars), body: '' };
        continue;
      }
      if (current) current.body += `${line}\n`;
    }
    if (current) out.push(current);
    return out
      .map((skill) => ({ name: skill.name.trim(), body: skill.body.trim() }))
      .filter((skill) => skill.name && skill.body)
      .slice(0, LIMITS.skills);
  }

  const render = (skills = []) =>
    (Array.isArray(skills) ? skills : [])
      .map((skill) => `## ${skill.name}\n${skill.body}`)
      .join('\n\n');

  const names = (skills = []) => (Array.isArray(skills) ? skills : []).map((skill) => skill.name);

  function find(skills, name) {
    const wanted = String(name ?? '').trim().toLowerCase();
    if (!wanted) return null;
    const list = Array.isArray(skills) ? skills : [];
    return (
      list.find((skill) => skill.name.toLowerCase() === wanted) ??
      list.find((skill) => skill.name.toLowerCase().includes(wanted)) ??
      null
    );
  }

  /** The prompt line. Names only, and it says how to open one without a paragraph of instructions. */
  function promptLine(skills = []) {
    const list = names(skills);
    if (!list.length) return null;
    return `Skills the user has written: ${list.join(', ')}. If one matches the task, call \`read_skill\` with its name before you start — and follow it.`;
  }

  MDH.skills = { LIMITS, parse, render, names, find, promptLine };
})();
