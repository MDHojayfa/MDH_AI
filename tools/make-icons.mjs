#!/usr/bin/env node
/**
 * tools/make-icons.mjs — the only "artwork" in the project, drawn with arithmetic.
 *
 * No fonts, no third-party images (CREDITS.md §Fonts/images), no design tool: a rounded dark square
 * with a green terminal prompt (›_) — the product in nine pixels of idea.
 *
 * Every pixel is computed, so the icons are reproducible and reviewable: a diff in this file is a diff in
 * the artwork. Also, the developer genuinely cannot draw, and arithmetic does not judge.
 *
 *   node tools/make-icons.mjs   → src/icons/icon-{16,32,48,128}.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'icons');

const BG = [16, 20, 24, 255];        // #101418
const FG = [74, 222, 128, 255];      // #4ade80
const DIM = [148, 163, 184, 255];    // #94a3b8

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

/** Encode RGBA pixels as a PNG (8-bit, no interlace, filter 0). */
function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distance from point to segment, for the chevron and the bar. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 32;                       // all geometry expressed on a 32-unit grid
  const radius = 7 * s;
  const stroke = Math.max(1.35 * s, 1.0);
  const pad = 5 * s;

  const put = (x, y, rgba, alpha = 1) => {
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[i + c] * (1 - alpha) + rgba[c] * alpha);
    px[i + 3] = Math.max(px[i + 3], Math.round(255 * alpha));
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      // rounded-rect background
      const qx = Math.max(radius - cx, cx - (size - radius), 0);
      const qy = Math.max(radius - cy, cy - (size - radius), 0);
      const cover = Math.hypot(qx, qy) <= radius ? 1 : 0;
      if (!cover) continue;
      const bgAlpha = Math.min(1, (radius - Math.hypot(qx, qy)) / 1.2);
      put(x, y, BG, bgAlpha);

      // terminal prompt: › then _
      const chevX = pad + 3 * s;
      const d1 = Math.min(
        segDist(cx, cy, chevX, 11 * s, chevX + 6 * s, 16 * s),
        segDist(cx, cy, chevX + 6 * s, 16 * s, chevX, 21 * s),
      );
      if (d1 <= stroke) put(x, y, FG, Math.min(1, stroke - d1 + 0.5));

      // underscore bar
      if (cx >= 15 * s && cx <= 24 * s && Math.abs(cy - 21 * s) <= stroke) put(x, y, DIM, 1);
    }
  }
  return png(size, px);
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, drawIcon(size));
  console.log(`✔ ${file}`);
}
