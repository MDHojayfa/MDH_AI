#!/usr/bin/env node
/* MDH_AI · MDHojayfa · MIT · https://github.com/MDHojayfa/MDH_AI */
/**
 * tools/make-og.mjs — the social preview card, drawn with arithmetic again.
 *
 *   node tools/make-og.mjs   → site/og.png (1200×640)
 *
 * No font, no image library, no exported design file: a dark starfield, a ringed planet, one dashed
 * orbit and a laser beam coming from a very small, very distant Pluto. It is a joke about the product,
 * rendered in signed 8-bit pixels. Text would need a font, a font would need a licence, and the whole
 * point of this repository is that it does not need one.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'site');
const W = 1200;
const H = 640;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── a deterministic PRNG, because a preview image that changes every build is a diff nobody wants ── */
let seed = 20261106;
function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

const px = Buffer.alloc(W * H * 4);
const put = (x, y, r, g, b, a = 1) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = Math.min(255, Math.round(px[i] * (1 - a) + r * a));
  px[i + 1] = Math.min(255, Math.round(px[i + 1] * (1 - a) + g * a));
  px[i + 2] = Math.min(255, Math.round(px[i + 2] * (1 - a) + b * a));
  px[i + 3] = 255;
};

/* background: a vertical gradient from near-black to a cold blue-black */
for (let y = 0; y < H; y++) {
  const t = y / H;
  for (let x = 0; x < W; x++) {
    const glow = 1 - Math.min(1, Math.hypot((x - W * 0.72) / W, (y - H * 0.34) / H) * 2.2);
    const r = 10 + t * 6 + glow * 10;
    const g = 14 + t * 8 + glow * 16;
    const b = 18 + t * 12 + glow * 26;
    put(x, y, r, g, b, 1);
  }
}

/* stars: three brightness classes, so it reads as depth rather than noise */
for (let i = 0; i < 520; i++) {
  const x = Math.floor(rand() * W);
  const y = Math.floor(rand() * H);
  const bright = rand();
  const tone = bright > 0.94 ? [255, 255, 255] : bright > 0.7 ? [190, 210, 230] : [120, 140, 160];
  put(x, y, tone[0], tone[1], tone[2], bright > 0.94 ? 0.95 : 0.55);
}

/* the planet: a ringed gas giant, drawn with two ellipse tests */
// Integer centres: a Buffer index is not a float, and a fractional pixel write is silently dropped.
const cx = Math.round(W * 0.72);
const cy = Math.round(H * 0.46);
const R = 120;
for (let y = cy - R - 70; y <= cy + R + 70; y++) {
  for (let x = cx - R * 2.1; x <= cx + R * 2.1; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    // ring: an ellipse, with a gap so it is visibly a ring and not a hat
    const ringR = Math.hypot(dx / 1.9, dy / 0.35);
    if (Math.abs(ringR - R * 1.02) < 10) {
      const fade = 0.35 + 0.25 * Math.sin(dx * 0.05);
      put(x, y, 200, 214, 232, fade);
    }
    if (d < R) {
      // banded body, lit from the upper left
      const band = Math.sin(dy * 0.09) * 0.5 + 0.5;
      const light = Math.max(0, 1 - Math.hypot((dx + R * 0.35) / (R * 1.6), (dy + R * 0.35) / (R * 1.6)));
      const r = 74 + band * 40 + light * 90;
      const g = 62 + band * 26 + light * 70;
      const b = 58 + band * 22 + light * 50;
      put(x, y, r, g, b, 1);
    }
  }
}

/* a small Moon, because the Moon is always watching */
const mx = Math.round(W * 0.2);
const my = Math.round(H * 0.26);
for (let y = -26; y <= 26; y++) {
  for (let x = -26; x <= 26; x++) {
    if (x * x + y * y > 26 * 26) continue;
    const shade = 0.9 + 0.06 * Math.sin(x * 0.12) * Math.cos(y * 0.1);
    put(mx + x, my + y, 206 * shade, 210 * shade, 216 * shade, 1);
    if ((x - 8) * (x - 8) + (y + 5) * (y + 5) < 16) put(mx + x, my + y, 176, 180, 188, 1);
    if ((x + 10) * (x + 10) + (y - 8) * (y - 8) < 9) put(mx + x, my + y, 184, 188, 196, 1);
  }
}

/* the laser from Pluto: a thin beam with a bright head, because the joke needs a diagram */
const beamFrom = { x: 40, y: H - 60 };
for (let t = 0; t < 1; t += 0.0008) {
  const x = Math.round(beamFrom.x + (mx - beamFrom.x) * t);
  const y = Math.round(beamFrom.y + (my - beamFrom.y) * t);
  const fade = 1 - t;
  put(x, y, 167, 139, 250, 0.5 * fade);
  put(x, y - 1, 167, 139, 250, 0.25 * fade);
}
/* Pluto: a very small, very distant dot, because the beam has to start somewhere */
const px0 = beamFrom.x + 6;
const py0 = beamFrom.y - 10;
for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
  if (x * x + y * y <= 16) put(px0 + x, py0 + y, 214, 196, 170, 0.9);
}

/* the orbit: a dashed ellipse, drawn once and never again */
for (let a = 0; a < Math.PI * 2; a += 0.002) {
  if (Math.floor(a * 8) % 2) continue;
  const x = Math.round(cx + Math.cos(a) * R * 1.9);
  const y = Math.round(cy + Math.sin(a) * R * 0.72);
  put(x, y, 120, 200, 180, 0.35);
}

/* a violet glow along the bottom, so the card has a floor rather than a fade */
for (let y = H - 90; y < H; y++) {
  const a = ((y - (H - 90)) / 90) * 0.22;
  for (let x = 0; x < W; x++) put(x, y, 90, 70, 150, a);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'og.png'), png(W, H, px));
console.log(`✔ site/og.png  ${W}×${H}`);
