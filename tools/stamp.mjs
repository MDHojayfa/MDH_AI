#!/usr/bin/env node
/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tools/stamp.mjs — one author line, in every file that is really a file of code.
 *
 * The licence is MIT: anyone may fork this, and pretending otherwise would be a lie in a document full of
 * careful ones. What a fork cannot do is quietly remove where it came from, because the line is in every source
 * file, in every file `npm run build` emits, in the runtime handshake the host answers with, and in the comment
 * field of the release zip. `tests/credit.test.mjs` fails when the line goes missing, so stripping it is a red
 * build rather than a silent rebrand.
 *
 *   node tools/stamp.mjs           # add the line where it is missing
 *   node tools/stamp.mjs --check   # print what is missing and exit 1; what CI and the tests use
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The one place the name is spelled. Everything else reads it from here, or from the banner it produces. */
export const AUTHOR = {
  name: 'MDHojayfa',
  url: 'https://mdhojayfa.github.io/',
  repo: 'https://github.com/MDHojayfa/MDH_AI',
  product: 'MDH_AI',
  licence: 'MIT',
};

// One line, spelled exactly as `package.json`, `LICENSE` and the site spell it. No invented legal name: a name
// nobody uses is not a credit, it is a typo waiting to be copied.
const line = (open, close) => `${open} ${AUTHOR.product} · ${AUTHOR.name} · ${AUTHOR.licence} · ${AUTHOR.repo} ${close}`;
export const BANNER = line('/*', '*/');
export const SHELL_BANNER = line('#', '');
export const HTML_BANNER = line('<!--', '-->');

/**
 * A short, stable hash of who wrote this and what it is. It is not a signature and does not pretend to be one:
 * it is a fingerprint that is cheap to check by eye and impossible to change without changing the files.
 */
export function fingerprint(version = '1.0.0') {
  return createHash('sha256')
    .update(`${AUTHOR.product}|${AUTHOR.name}|${AUTHOR.repo}|${version}`)
    .digest('hex')
    .slice(0, 12);
}

/* ────────────────────────────────────────────────────────────────── the files */

const walk = (dir, filter, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
};

/** Everything that ships or runs, and nothing that is generated. */
export function stampedFiles(root = ROOT) {
  const js = walk(join(root, 'src'), (f) => f.endsWith('.js'));
  const host = walk(join(root, 'host'), (f) => f.endsWith('.mjs'));
  // Including this file. The tool that asks every other file to carry the line carries it too.
  const tools = walk(join(root, 'tools'), (f) => f.endsWith('.mjs'));
  const tests = walk(join(root, 'tests'), (f) => f.endsWith('.mjs'));
  const shell = [join(root, 'install.sh')];
  const html = [join(root, 'site', 'index.html')];
  return { js, host, tools, tests, shell, html };
}

function lineFor(file) {
  if (file.endsWith('.sh')) return SHELL_BANNER;
  if (file.endsWith('.html')) return HTML_BANNER;
  return BANNER;
}

function insert(text, line, file) {
  if (/^#!/.test(text) || text.startsWith(BANNER) === false && file.endsWith('.sh')) {
    // After the shebang, never before it: a comment above `#!/usr/bin/env bash` makes the file unrunnable, and
    // above `#!/usr/bin/env node` it is a syntax error — which is exactly how this was found.
    const index = text.indexOf('\n');
    return `${text.slice(0, index + 1)}${line}\n${text.slice(index + 1)}`;
  }
  if (file.endsWith('.html')) {
    const doctype = text.match(/^\s*<!DOCTYPE[^>]*>\n/i);
    return doctype ? `${doctype[0]}${line}\n${text.slice(doctype[0].length)}` : `${line}\n${text}`;
  }
  return `${line}\n${text}`;
}

export function audit(root = ROOT) {
  const groups = stampedFiles(root);
  const missing = [];
  for (const [kind, files] of Object.entries(groups)) {
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes(lineFor(file))) missing.push({ kind, file: relative(root, file) });
    }
  }
  return { groups, missing };
}

function main(argv) {
  const check = argv.includes('--check');
  const { groups, missing } = audit();
  const total = Object.values(groups).reduce((sum, files) => sum + files.length, 0);

  if (!missing.length) {
    process.stdout.write(`  ok   ${total} files carry the author line · fingerprint ${fingerprint()}\n`);
    return 0;
  }
  if (check) {
    process.stdout.write(`  ${missing.length} of ${total} files have no author line:\n`);
    for (const entry of missing.slice(0, 20)) process.stdout.write(`       ${entry.file}\n`);
    if (missing.length > 20) process.stdout.write(`       … and ${missing.length - 20} more\n`);
    process.stdout.write('\n  Run `npm run stamp` to put it back. It is one line and it is the point.\n');
    return 1;
  }
  let written = 0;
  for (const entry of missing) {
    const file = join(ROOT, entry.file);
    writeFileSync(file, insert(readFileSync(file, 'utf8'), lineFor(file), file));
    written += 1;
  }
  process.stdout.write(`  stamped ${written} files · fingerprint ${fingerprint()}\n`);
  return 0;
}

if (process.argv[1]?.endsWith('stamp.mjs')) process.exit(main(process.argv.slice(2)));
