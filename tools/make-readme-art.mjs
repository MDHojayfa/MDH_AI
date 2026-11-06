/**
 * tools/make-readme-art.mjs — the pictures in the README, drawn here rather than screenshotted.
 *
 * Why a generator instead of a screen recording: a recording of a chat page is a recording of somebody else's
 * UI, with their fonts and their layout changes, and it ages the week the site ships a redesign. These frames are
 * drawn from the real pill and card markup in `src/core/dock.js` and `src/core/ui.js` — same labels, same state
 * names, same buttons — and every image says so, because a mock presented as a recording is a lie with a
 * spreadsheet of engagement metrics.
 *
 * Everything below is ImageMagick primitives and text; no external assets, no fonts to download, no dependencies.
 * Run `npm run art` (or `node tools/make-readme-art.mjs`) and the files in `assets/` are regenerated.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'assets');
const TMP = join(ROOT, 'assets', '.frames');

const INK = '#d7d9e3';
const DIM = '#8b90a5';
const FAINT = '#6b7280';
const LINE = '#232434';
const PANEL = '#0e0f18';
const RULE = '#2a2b3d';

const SANS = 'DejaVu-Sans';
const BOLD = 'DejaVu-Sans-Bold';
const MONO = 'DejaVu-Sans-Mono';

/**
 * One ImageMagick command per frame. Every element is emitted as its own `-fill/-stroke/-draw` (or `-annotate`)
 * pair, because ImageMagick takes the current fill and stroke at draw time — batching them silently paints
 * everything in the last colour, which is how you spend an hour wondering why your labels are invisible.
 */
class Canvas {
  constructor(width, height, background = '#0b0b12') {
    this.args = ['-size', `${width}x${height}`, `xc:${background}`, '-antialias'];
  }

  rect(x, y, w, h, fill, { stroke = null, radius = 0, width: strokeWidth = 1 } = {}) {
    this.args.push('-fill', fill, '-stroke', stroke ?? 'none', '-strokewidth', String(strokeWidth));
    this.args.push(
      '-draw',
      radius > 0
        ? `roundrectangle ${x},${y} ${x + w},${y + h} ${radius},${radius}`
        : `rectangle ${x},${y} ${x + w},${y + h}`,
    );
    return this;
  }

  circle(cx, cy, r, fill) {
    this.args.push('-fill', fill, '-stroke', 'none', '-draw', `circle ${cx},${cy} ${cx + r},${cy}`);
    return this;
  }

  line(x1, y1, x2, y2, color, width = 1) {
    this.args.push('-fill', 'none', '-stroke', color, '-strokewidth', String(width), '-draw', `line ${x1},${y1} ${x2},${y2}`);
    return this;
  }

  polygon(points, fill) {
    this.args.push('-fill', fill, '-stroke', 'none', '-draw', `polygon ${points.map(([x, y]) => `${x},${y}`).join(' ')}`);
    return this;
  }

  text(x, y, value, { size = 15, color = INK, font = SANS, spacing = 0 } = {}) {
    // `%` is ImageMagick's escape character in annotate; a stray one would print a filename instead of the text.
    const safe = String(value).replace(/%/g, '%%');
    this.args.push('-font', font, '-pointsize', String(size), '-fill', color, '-stroke', 'none');
    if (spacing) this.args.push('-kerning', String(spacing));
    this.args.push('-annotate', `+${x}+${y}`, safe);
    if (spacing) this.args.push('-kerning', '0');
    return this;
  }

  /** A pill: dot, icon glyph drawn as shapes, label, and an optional trailing turn counter. */
  pill(x, y, { dot, label, turn = '', icon = 'play' }) {
    const width = 92 + label.length * 9 + (turn ? turn.length * 7 + 14 : 0);
    this.rect(x, y, width, 44, '#12111c', { stroke: '#3b3663', radius: 22 });
    this.circle(x + 26, y + 22, 7, dot);
    const ix = x + 44;
    const iy = y + 22;
    if (icon === 'play') this.polygon([[ix - 4, iy - 7], [ix + 7, iy], [ix - 4, iy + 7]], dot);
    if (icon === 'dots') {
      this.circle(ix - 7, iy, 2.4, dot).circle(ix, iy - 3, 2.4, dot).circle(ix + 7, iy + 1, 2.4, dot);
    }
    if (icon === 'pause') {
      this.rect(ix - 6, iy - 6, 4, 12, dot, { radius: 1 }).rect(ix + 2, iy - 6, 4, 12, dot, { radius: 1 });
    }
    if (icon === 'check') {
      this.line(ix - 7, iy, ix - 1, iy + 6, dot, 2.4).line(ix - 1, iy + 6, ix + 8, iy - 7, dot, 2.4);
    }
    this.text(x + 60, y + 27, label, { size: 15, font: BOLD, color: INK });
    if (turn) this.text(x + width - 18 - turn.length * 7, y + 27, turn, { size: 12, color: FAINT, font: MONO });
    return this;
  }

  /** The window every frame sits in: a muted chrome bar and a title, so the pill has somewhere to live. */
  chrome(title) {
    this.rect(24, 20, 912, 420, '#0d0e16', { stroke: LINE, radius: 14 });
    this.line(24, 64, 936, 64, LINE, 1);
    this.circle(48, 42, 5, '#3f1d24').circle(66, 42, 5, '#3a3220').circle(84, 42, 5, '#1f3a2c');
    this.text(104, 47, title, { size: 12, color: FAINT, font: MONO });
    this.text(936 - title.length * 7 - 4, 47, 'MDH_AI · v1.0.0', { size: 12, color: '#4b5063', font: MONO });
    return this;
  }

  /** The honest line. Small, always present, impossible to mistake for a screenshot credit. */
  disclaimer() {
    this.text(48, 462, 'Illustration drawn from the real pill and card markup — not a screen recording.', {
      size: 11,
      color: '#4b5063',
    });
    return this;
  }

  to(file) {
    execFileSync('convert', [...this.args, file], { stdio: 'pipe' });
  }
}

/* ─────────────────────────────────────────────────────────────── the hero loop */

function heroFrame(state) {
  const c = new Canvas(960, 484).chrome('chat.deepseek.com — the chat you are already signed into');

  // the task and the answer, so the pill has a reason to exist
  c.rect(352, 82, 560, 62, '#1b1c2e', { stroke: '#2b2c44', radius: 16 });
  c.text(376, 118, 'find every file over 100 MB in ~/projects', { size: 17, color: '#cfd3e2' });

  c.rect(48, 152, 560, 86, '#101120', { stroke: '#22233a', radius: 14 });
  c.text(72, 182, 'Looking inside ~/projects. Nothing is deleted:', { size: 15, color: '#c3c7d6' });
  c.text(72, 206, 'I run commands, you approve them, the log keeps both.', { size: 15, color: DIM });
  c.text(72, 228, '[MDH_RESULT tool="run_command" status="ok"]', { size: 12, color: '#5b607a', font: MONO });

  // the approval card, only on the frame that has one
  if (state.card) {
    c.rect(120, 244, 520, 142, PANEL, { stroke: '#3a3460', radius: 14 });
    c.text(144, 272, 'Allow this command?', { size: 16, color: INK, font: BOLD });
    c.text(144, 296, 'du -ah ~/projects | sort -h | tail -20', { size: 12.5, color: '#a5b4fc', font: MONO });
    c.text(144, 317, 'It runs a shell command on your machine, in ~/projects.', { size: 12, color: DIM });
    c.rect(144, 330, 106, 32, '#6d5efc', { radius: 8 });
    c.text(162, 351, 'Allow once', { size: 12.5, color: '#ffffff', font: BOLD });
    c.rect(262, 330, 62, 32, 'none', { stroke: '#3b3663', radius: 8 });
    c.text(280, 351, 'Deny', { size: 12.5, color: '#c3c7d6' });
    c.text(338, 351, 'remember: run · session · site', { size: 11, color: '#5b607a' });
  }

  // the composer the pill floats above
  c.rect(48, 392, 864, 2, LINE);
  c.rect(48, 400, 700, 34, '#12131f', { stroke: '#22233a', radius: 12 });
  c.text(68, 423, 'Message…', { size: 13.5, color: '#4b5063' });
  c.rect(760, 400, 34, 34, '#2a2550', { radius: 10 });
  c.polygon([[774, 417], [783, 410], [783, 424]], '#a5b4fc');

  c.pill(690, 300, state.pill);

  if (state.done) {
    c.rect(620, 156, 292, 50, '#0f1b16', { stroke: '#14532d', radius: 12 });
    c.text(640, 186, '3 files over 100 MB · 1.2 GB total', { size: 13, color: '#a7f3d0' });
  }

  c.disclaimer();
  return c;
}

const HERO = [
  { pill: { dot: '#6b7280', label: 'Start', icon: 'play' }, hold: 120, file: 'hero-1' },
  { pill: { dot: '#fbbf24', label: 'Working', turn: 'turn 1', icon: 'dots' }, hold: 70, file: 'hero-2' },
  { pill: { dot: '#fbbf24', label: 'Working', turn: 'turn 2', icon: 'dots' }, card: true, hold: 170, file: 'hero-3' },
  { pill: { dot: '#a5b4fc', label: 'Paused', icon: 'pause' }, hold: 130, file: 'hero-4' },
  { pill: { dot: '#34d399', label: 'Done', turn: 'turn 4', icon: 'check' }, done: true, hold: 220, file: 'hero-5' },
];

/* ──────────────────────────────────────────────────────────── the terminal loop */

const TERMINAL = [
  '$ git clone https://github.com/MDHojayfa/MDH_AI && cd MDH_AI',
  '$ ./install.sh',
  '  host    ok  registered  dev.mdhojayfa.mdh',
  '  build   ok  dist/chrome, dist/firefox',
  '  audit   ok  chain verified (0 calls)',
  '$ mdh-log --runs',
];

function terminalFrame(lines, cursorOn) {
  const c = new Canvas(900, 320, '#0b0b12');
  c.rect(20, 16, 860, 268, '#0e0f18', { stroke: LINE, radius: 12 });
  c.circle(44, 40, 5, '#3f1d24').circle(62, 40, 5, '#3a3220').circle(80, 40, 5, '#1f3a2c');
  c.text(760, 45, 'bash — 80x24', { size: 11, color: '#4b5063', font: MONO });
  let y = 86;
  for (const line of lines) {
    const isPrompt = line.startsWith('$ ');
    const isOk = /\bok\b/.test(line) && line.startsWith('  ');
    const color = isPrompt ? '#e5e7eb' : isOk ? '#8fbfa4' : '#9aa1b8';
    c.text(48, y, line, { size: 13.5, color, font: MONO });
    y += 30;
  }
  if (cursorOn) c.rect(48, y - 16, 9, 18, '#a5b4fc');
  c.text(48, 302, 'the install output above is what install.sh prints; mdh-log is in the same repo', {
    size: 10.5,
    color: '#3f4457',
    font: MONO,
  });
  return c;
}

/* ─────────────────────────────────────────────────────────────────── the still */

function approvalStill() {
  const c = new Canvas(960, 400, '#0b0b12');
  c.text(40, 44, 'The card, at the moment it matters', { size: 20, color: INK, font: BOLD });
  c.text(40, 68, 'exact command · where · why · three lifetimes of "yes"', { size: 13, color: DIM });

  c.rect(40, 96, 880, 200, PANEL, { stroke: '#3a3460', radius: 14 });
  c.text(66, 128, 'Allow this command?', { size: 17, color: INK, font: BOLD });
  c.text(66, 158, 'du -ah ~/projects | sort -h | tail -20', { size: 14, color: '#a5b4fc', font: MONO });
  c.text(66, 184, 'It runs a shell command on your machine, in ~/projects.', { size: 13, color: DIM });
  c.text(66, 208, 'You have approved this exact command 2 times in this run.', { size: 12.5, color: '#7d84a0' });
  c.rect(66, 232, 132, 40, '#6d5efc', { radius: 9 });
  c.text(92, 258, 'Allow once', { size: 14, color: '#ffffff', font: BOLD });
  c.rect(212, 232, 86, 40, 'none', { stroke: '#3b3663', radius: 9 });
  c.text(238, 258, 'Deny', { size: 14, color: '#c3c7d6' });
  c.text(320, 258, 'or ▾ remember: for this run · this session · this site', { size: 12, color: '#6b7280' });

  c.text(40, 330, 'Timeout is a deny: silence is not consent. Denials are logged with the reason.', { size: 13, color: DIM });
  c.text(40, 352, 'Illustration drawn from src/core/ui.js — the markup, not a screenshot.', { size: 11, color: '#4b5063' });
  return c;
}

/* ─────────────────────────────────────────────────────────────────────── main */

function gif(name, frames, { delay }) {
  const out = join(OUT, name);
  const args = ['-dispose', 'background'];
  for (const [file, hold] of frames) args.push(`-delay`, String(hold), file);
  args.push('-loop', '0', '-layers', 'Optimize', '-colors', '96', out);
  execFileSync('convert', args, { stdio: 'pipe' });
  return out;
}

function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(TMP, { recursive: true });

  const heroFiles = [];
  for (const frame of HERO) {
    const file = join(TMP, `${frame.file}.png`);
    heroFrame(frame).to(file);
    heroFiles.push([file, frame.hold]);
  }
  gif('hero.gif', heroFiles, { delay: 100 });

  const termFiles = [];
  TERMINAL.forEach((_, index) => {
    const lines = TERMINAL.slice(0, index + 1);
    const file = join(TMP, `term-${index + 1}.png`);
    terminalFrame(lines, index === TERMINAL.length - 1).to(file);
    termFiles.push([file, index === TERMINAL.length - 1 ? 260 : 90]);
  });
  gif('terminal.gif', termFiles, { delay: 90 });

  const still = join(OUT, 'approval-card.png');
  approvalStill().to(still);

  // The social card, so a link pasted anywhere still looks like something. Quantised and trimmed to the 1200x630
  // that link previews actually use: a 460 KB PNG of a dark rectangle is a repository getting heavier for nothing.
  execFileSync(
    'convert',
    [
      join(OUT, 'hero.gif[0]'),
      '-resize', '1200x',
      '-gravity', 'center',
      '-crop', '1200x630+0+0',
      '+repage',
      '-colors', '96',
      '-strip',
      join(OUT, 'social.png'),
    ],
    { stdio: 'pipe' },
  );

  if (!process.env.MDH_ART_KEEP) rmSync(TMP, { recursive: true, force: true });
  process.stdout.write('assets: hero.gif, terminal.gif, approval-card.png, social.png\n');
}

main();
