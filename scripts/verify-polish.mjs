#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
 * Visual-refinement verification harness.
 *
 * WHY THIS EXISTS
 * VISUAL-REFINEMENT-PLAN.md §3 plus the Phase 10 owner notes list the polish
 * the site is supposed to carry: one nav height, one shared footer, three
 * button classes, a card standard, no page-local token sets, one font import
 * per page, no arbitrary values, reveal animations that actually run, and so
 * on. That list is easy to regress silently, and the sandbox this was built in
 * has no browser, so a Puppeteer probe cannot run there.
 *
 * WHAT IT CHECKS
 *   1. Custom-property integrity — for every page: walk the stylesheets it
 *      loads (plus its inline <style> blocks and scripts) and fail on any
 *      var(--x) that is neither defined in scope nor given a fallback. This is
 *      the bug class that produced the grey hero buttons (--color-foreground),
 *      the void library hover (--lux-surface-hover) and the square news hero
 *      panel (--radius-xl).
 *   2. Cascade outcomes — render each page in jsdom with the token values
 *      resolved into the stylesheet text (jsdom does not implement var()
 *      substitution), then assert computed values for the elements the polish
 *      list names: the hero CTA pair versus the enquiry submit button, the
 *      hidden-until-observed reveal classes, the news hero card, the library
 *      main container, the programs cards and the reader surfaces.
 *
 * jsdom is a devDependency; no network access is needed.
 *
 * Usage:  npm run verify:polish
 * ────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = (...p) => path.join(ROOT, 'public', ...p);
const read = (p) => fs.readFileSync(p, 'utf8');

const PAGES = [
  { page: 'index.html',     sheets: ['tw-index.css', 'tokens.css', 'components.css', 'footer.css', 'home.css', 'nav.css'] },
  { page: 'contact.html',   sheets: ['tokens.css', 'components.css', 'footer.css', 'nav.css', 'contact.css'] },
  { page: 'programs.html',  sheets: ['tokens.css', 'components.css', 'footer.css', 'programs.css', 'nav.css'] },
  { page: 'news.html',      sheets: ['tokens.css', 'components.css', 'footer.css', 'news.css', 'nav.css'] },
  { page: 'library.html',   sheets: ['tw-library.css', 'tokens.css', 'components.css', 'footer.css', 'library.css', 'nav.css'] },
  { page: 'admin.html',     sheets: ['tw-admin.css', 'tokens.css', 'components.css', 'admin.css'] },
  { page: 'academies.html', sheets: ['tokens.css', 'footer.css', 'nav.css'] },
];

const failures = [];

/* ── 1. custom-property integrity ────────────────────────────────────────── */
function definedNames(files) {
  const names = new Set();
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const txt = read(f);
    for (const m of txt.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) names.add(m[1]);
    for (const block of txt.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      for (const m of block[1].matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) names.add(m[1]);
    }
  }
  return names;
}

function references(files) {
  const out = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const txt = read(f);
    for (const m of txt.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*([,)])/g)) {
      out.push({ name: m[1], hasFallback: m[2] === ',', file: path.basename(f) });
    }
  }
  return out;
}

for (const { page, sheets } of PAGES) {
  const htmlPath = PUB(page);
  const html = read(htmlPath);
  const linked = [...html.matchAll(/href="\/assets\/(css\/[^"]+)"/g)].map(m => PUB('assets', m[1]));
  const scripts = [...html.matchAll(/src="\/(assets\/js\/[^"]+)"/g)].map(m => PUB(m[1]));
  const scope = [htmlPath, ...linked];
  const defined = definedNames(scope);
  const bad = references([...scope, ...scripts]).filter(
    (r) => !defined.has(r.name) && !r.hasFallback && !r.name.startsWith('--tw-')
  );
  for (const b of bad) failures.push(`[${page}] unresolved var(${b.name}) in ${b.file}`);

  // the plan's own expectation: every sheet the page declares should exist
  for (const s of sheets) if (!fs.existsSync(PUB('assets/css', s))) failures.push(`[${page}] missing sheet ${s}`);
}

/* ── 2. cascade outcomes ─────────────────────────────────────────────────── */
function tokenTable() {
  const vars = new Map();
  for (const m of read(PUB('assets/css/tokens.css')).matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) {
    vars.set(m[1], m[2].trim());
  }
  return vars;
}
const VARS = tokenTable();

function resolveVars(text, passes = 4) {
  for (let i = 0; i < passes; i++) {
    text = text.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,([^()]*))?\)/g, (m, name, fb) =>
      VARS.has(name) ? VARS.get(name) : (fb !== undefined ? fb.trim() : m));
  }
  return text;
}

function render({ page, sheets }) {
  const dom = new JSDOM(read(PUB(page)), { url: 'https://example.test/' + page, pretendToBeVisual: true });
  const css = sheets.map((s) => resolveVars(read(PUB('assets/css', s)))).join('\n');
  const style = dom.window.document.createElement('style');
  style.textContent = css;
  dom.window.document.head.appendChild(style);
  return dom.window;
}

const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) failures.push(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  return ok;
};

function computed(win, selector, prop) {
  const el = win.document.querySelector(selector);
  return el ? win.getComputedStyle(el)[prop] : null;
}

{
  const win = render(PAGES[0]);
  const val = (sel, prop) => computed(win, sel, prop);
  check('index hero primary CTA is the gold pill', val('#ctaPrimary', 'backgroundColor'), 'rgb(250, 204, 21)');
  check('index hero secondary CTA is the glass ghost', val('#ctaSecondary', 'backgroundColor'), 'rgba(255, 255, 255, 0.05)');
  check('index enquiry submit keeps the brand pill', val('#submitBtn', 'backgroundColor'), 'rgb(5, 1, 74)');
  check('index reveal elements start hidden', val('.bic-reveal', 'opacity'), '0');
  check('index carries no orphaned .reveal elements', win.document.querySelectorAll('.reveal').length, 0);
  check('index About band resolves to a token', val('#about', 'backgroundColor'), 'rgb(243, 239, 229)');
  const inlineLeft = (read(PUB('index.html')).match(/style="(?!\s*--delay)/g) || []).length;
  check('index inline styles are only --delay staggers', inlineLeft, 0);
}
{
  const win = render(PAGES[1]);
  check('contact info panel resolves --color-ink', computed(win, '.lux-info-panel', 'backgroundColor'), 'rgb(24, 20, 15)');
  check('contact has no page-local --lux-* left', /var\(--lux-/.test(read(PUB('assets/css/contact.css'))), false);
}
{
  const win = render(PAGES[2]);
  check('programs hero uses the shared .btn-secondary', win.document.querySelectorAll('.btn-gold').length, 0);
  check('programs .btn-secondary resolves the accent', computed(win, '.btn-secondary', 'backgroundColor'), 'rgb(176, 125, 63)');
  check('programs card standard radius', computed(win, '.project-card', 'borderRadius'), '20px');
  check('programs image card background from CSS', (computed(win, '.prog-card__img--science', 'backgroundImage') || '').includes('science1.jpg'), true);
  check('programs contact message hidden by CSS', computed(win, '#contact-msg', 'display'), 'none');
  const decl = read(PUB('assets/css/programs.css')).replace(/\n\s*/g, ' ');
  check('programs reveal delay declared after the transition shorthand',
    /transition:[^;]+;\s*transition-delay: var\(--delay, 0ms\)/.test(decl), true);
}
{
  const win = render(PAGES[3]);
  check('news hero card radius resolves', computed(win, '.hero-card', 'borderRadius'), '20px');
  check('news hero card on the surface token', computed(win, '.hero-card', 'backgroundColor'), 'rgb(253, 250, 245)');
  check('news page has no page-local token shim', /:root \{/.test(read(PUB('assets/css/news.css'))), false);
}
{
  const win = render(PAGES[4]);
  check('library main container padding-top (nav + space-5)', computed(win, '.lib-main', 'paddingTop'), '100px');
  check('library main container padding-inline tokenised', computed(win, '.lib-main', 'paddingLeft'), '16px');
  check('library reader surface uses the lux palette', computed(win, '.bg-lux-reader-panel', 'backgroundColor'), 'rgb(26, 29, 33)');
  check('library page has no arbitrary hex classes', /\[#/.test(read(PUB('library.html'))), false);
  check('library resource-card hover var is defined', /var\(--lux-surface-hover\)/.test(read(PUB('assets/css/library.css'))), false);
}

/* ── report ──────────────────────────────────────────────────────────────── */
console.log(`verify:polish — ${PAGES.length} pages, ${failures.length} failure(s)`);
for (const f of failures) console.log(`  FAIL ${f}`);
if (failures.length === 0) console.log('  all checks passed ✓');
process.exit(failures.length === 0 ? 0 : 1);
