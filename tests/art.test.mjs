/**
 * tests/art.test.mjs — the pictures in the README.
 *
 * Images rot silently: a renamed file leaves a broken image on the front page and nothing fails. These tests
 * read the README, resolve every asset it mentions, and check the honesty rule that makes illustrations
 * acceptable in the first place — they are labelled as illustrations.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const art = readFileSync(join(ROOT, 'tools/make-readme-art.mjs'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('every asset the README points at exists and is not a placeholder', () => {
  const referenced = [...readme.matchAll(/assets\/([\w.-]+\.(?:gif|png|jpg|svg))/g)].map((m) => m[1]);
  assert.ok(referenced.length >= 3, 'a README with a hero and a demo is the point');
  for (const name of new Set(referenced)) {
    const file = join(ROOT, 'assets', name);
    assert.ok(existsSync(file), `README references assets/${name}, which must exist`);
    assert.ok(statSync(file).size > 4096, `assets/${name} is not an empty file`);
  }
});

test('the loops are real GIFs, not a renamed PNG', () => {
  for (const name of ['hero.gif', 'terminal.gif']) {
    const head = readFileSync(join(ROOT, 'assets', name)).subarray(0, 6).toString('latin1');
    assert.equal(head, 'GIF89a', `${name} starts with the GIF89a magic`);
  }
});

test('the art is generated, and the generator can run again', () => {
  assert.match(pkg.scripts.art, /make-readme-art\.mjs/);
  assert.ok(existsSync(join(ROOT, 'tools/make-readme-art.mjs')));
  assert.match(art, /execFileSync\('convert'/, 'drawn with ImageMagick, no binary blobs checked in');
  assert.match(art, /hero\.gif/);
  assert.match(art, /terminal\.gif/);
});

test('every frame says it is an illustration, because it is one', () => {
  assert.match(art, /Illustration drawn from the real pill and card markup — not a screen recording\./);
  const disclaimers = art.match(/not a (screen recording|screenshot)/g) ?? [];
  assert.ok(disclaimers.length >= 2, 'the loop and the still both carry a label');
  assert.match(readme, /illustrations, not recordings/i, 'and the README says it in prose as well');
});

test('the scratch frames never end up in git', () => {
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /assets\/\.frames\//);
});
