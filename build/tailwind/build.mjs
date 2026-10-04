#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
 * Rebuild the static Tailwind stylesheets.
 *
 * index.html, admin.html and library.html used to load the Tailwind Play CDN,
 * which compiles utility CSS in the browser on every page load. Tailwind
 * documents that as not for production: it ships the whole compiler (~100 KB),
 * blocks first paint on a third-party origin, and breaks under a strict CSP.
 *
 * Each page has its own theme (index/admin use `brand.*`, library uses `lux.*`
 * plus class-based dark mode), so each gets its own config and its own sheet.
 * The configs in this directory were extracted verbatim from the inline
 * `tailwind.config` blocks — do not hand-edit them without checking the page.
 *
 * Usage:  npm run build:tailwind
 * ────────────────────────────────────────────────────────────────────────── */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const PAGES = ['index', 'admin', 'library'];

// Markup injected by a page's own scripts (the admin editor, the library
// resource grid) carries utility classes that never appear in the HTML file,
// so a sheet built from the HTML alone leaves them unstyled — the library's
// JS-rendered cards had no surface, no border and no entrance animation.
// Scan each page's scripts alongside its HTML.
const SOURCES = {
  index:   ['./public/index.html',   './public/assets/js/main.js', './public/assets/js/home.js'],
  admin:   ['./public/admin.html',   './public/assets/js/admin.js'],
  library: ['./public/library.html', './public/assets/js/library.js'],
};

for (const page of PAGES) {
  // The extracted configs carry the theme but not `content`; scope each build
  // to its own page so one sheet cannot pull in another page's classes.
  const theme = (await import(join(here, `${page}.config.js`))).default
    ?? (await import(join(here, `${page}.config.js`)));
  const runtime = join(here, `${page}.runtime.js`);
  writeFileSync(runtime, `module.exports = ${JSON.stringify({ ...theme, content: SOURCES[page] }, null, 2)};\n`);

  const out = `public/assets/css/tw-${page}.css`;
  execFileSync('npx', [
    'tailwindcss', '-c', runtime,
    '-i', join(here, 'input.css'),
    '-o', join(root, out),
    '--minify',
  ], { cwd: root, stdio: 'inherit' });

  console.log(`[tailwind] ${page} → ${out}`);
}
