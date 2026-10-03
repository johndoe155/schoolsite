#!/usr/bin/env node
/**
 * Generate the PWA icons (npm run icons:pwa).
 *
 * Why a generator instead of two committed PNGs: nobody can review a binary
 * blob, and re-cutting the mark later would mean finding someone with an image
 * editor. This draws the same thing every time, from ~60 lines of arithmetic.
 *
 * Why PNG at all when the portal already ships icon.svg: Chrome on Android
 * decides whether "Add to home screen" installs an app or makes a bookmark
 * from the manifest's PNG icons at 192 and 512. An SVG-only manifest installs
 * on desktop and silently degrades to a shortcut on the phones the teachers
 * actually carry — which is the whole point of the offline work.
 *
 * The mark: the school's indigo field with a white open book (two tilted
 * panels and a spine). Drawn from signed-distance-ish maths, no dependencies.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "apps", "web", "public");

const BG = [5, 1, 74];        // #05014A — the same indigo as theme_color
const FG = [255, 255, 255];

/* ── PNG encoding ─────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixel rows → a PNG buffer. */
function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  // 10-12: deflate / adaptive filtering / no interlace — all zero, which is what
  // the spec means by "default".
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;   // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── the mark ─────────────────────────────────────────────────────────────── */

/**
 * @param {number} size square edge, px
 * @param {boolean} maskable true = keep the mark inside the 80% safe circle
 *   (Android crops the artwork to whatever shape the launcher uses, so a
 *   maskable icon must not put anything important near the edge).
 */
function draw(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const s = (v) => v * size;
  const radius = maskable ? 0 : s(0.22);          // launcher masks maskable icons
  const inset = maskable ? s(0.22) : s(0.24);     // book bounding box

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-square field
      let alpha = 255;
      if (radius > 0) {
        const cx = Math.min(Math.max(x, radius), size - radius);
        const cy = Math.min(Math.max(y, radius), size - radius);
        const d = Math.hypot(x - cx, y - cy);
        if (d > radius) alpha = 0;
      }
      let [r, g, b] = BG;

      // The book: two panels leaning up towards the spine, with a gutter
      // between them. Open, not closed — a closed book is a rectangle, and a
      // white rectangle on indigo is what the first draft looked like.
      const left = inset, right = size - inset, top = inset, bottom = size - inset;
      const mid = (left + right) / 2;
      const half = (right - left) / 2;
      const gutter = size * 0.05;            // indigo channel at the spine
      const t = Math.min(1, Math.abs(x - mid) / half);   // 0 at spine → 1 at edge
      if (Math.abs(x - mid) > gutter / 2 && x >= left && x <= right) {
        const panelTop = top + t * size * 0.10;         // pages rise to the spine
        const panelBottom = bottom - t * size * 0.02;
        const pageEdge = panelBottom - size * 0.022;    // hairline under the text block
        if (y >= panelTop && y <= panelBottom && y < pageEdge) [r, g, b] = FG;
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = alpha;
    }
  }
  return px;
}

mkdirSync(OUT_DIR, { recursive: true });
const outputs = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
];
for (const [name, size, maskable] of outputs) {
  const file = join(OUT_DIR, name);
  writeFileSync(file, png(size, size, draw(size, maskable)));
  console.log(`wrote ${file} (${size}×${size}${maskable ? ", maskable" : ""})`);
}
