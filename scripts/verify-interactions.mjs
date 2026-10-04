#!/usr/bin/env node
/* ============================================================
   verify:interactions — the interactive layer's regression gate.

   Everything a mouse, a thumb or a keyboard can touch goes through
   components.css (the `.btn` control layer, the field layer, the focus
   layer) and, where the page has one, luxe.js for pointer physics. This
   harness asserts the properties that make that layer *premium* — and the
   ones that make it accessible — against the real stylesheets, the real
   pages and the real script, in jsdom.

   Run: npm run verify:interactions
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = (...p) => path.join(ROOT, 'public', ...p);
const read = (p) => fs.readFileSync(p, 'utf8');

const results = [];
const ok = (label) => results.push({ label, ok: true });
const fail = (label, detail) => results.push({ label, ok: false, detail });
const check = (label, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (pass) ok(label); else fail(label, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const assert = (label, cond, detail) => (cond ? ok(label) : fail(label, detail));

/* ── colours ──────────────────────────────────────────────────────────────
   WCAG 2.1 relative luminance and contrast. Text pairs are checked at 4.5:1
   (normal text) and 3:1 for large/bold text and for UI boundaries. */
function parseColor(text) {
  const out = String(text || '').trim();
  let m = out.match(/^#([0-9a-fA-F]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    const a = h.length === 8 ? n(6) / 255 : 1;
    return { r: n(0), g: n(2), b: n(4), a };
  }
  m = out.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    const scale = (v, i) => (String(m[1].split(/[\s,/]+/).filter(Boolean)[i] || '').endsWith('%') ? Math.round((v / 100) * 255) : v);
    return { r: scale(parts[0], 0), g: scale(parts[1], 1), b: scale(parts[2], 2), a: parts[3] === undefined ? 1 : parts[3] };
  }
  return null;
}
const luminance = ({ r, g, b }) => {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** Contrast of `fg` over `bg`, compositing translucent layers onto `base`. */
function contrast(fg, bg, base = { r: 255, g: 255, b: 255, a: 1 }) {
  const over = (c, b) => ({ r: c.r * c.a + b.r * (1 - c.a), g: c.g * c.a + b.g * (1 - c.a), b: c.b * c.a + b.b * (1 - c.a), a: 1 });
  const f = fg.a < 1 ? over(fg, base) : fg;
  const b = bg.a < 1 ? over(bg, base) : bg;
  const l1 = luminance(f), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/* ── the stylesheet, and the per-element resolution the harness needs ───── */
const TOKENS = read(PUB('assets', 'css', 'tokens.css'));
const COMPONENTS = read(PUB('assets', 'css', 'components.css'));
const NAV = read(PUB('assets', 'css', 'nav.css'));

const VARS = new Map();
for (const m of TOKENS.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) VARS.set(m[1], m[2].trim());

const varNames = (css) => {
  const names = new Set();
  for (const m of css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) names.add(m[1]);
  for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) names.add(m[1]);
  return [...names];
};

function mount(html, sheets, { url = 'https://example.test/' } = {}) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  const css = sheets.map((s) => read(PUB('assets', 'css', s))).join('\n');
  const style = win.document.createElement('style');
  style.id = '__istyles';
  style.textContent = css;
  win.document.head.appendChild(style);
  win.__css = css;
  win.__varNames = varNames(css);

  /* jsdom cascades custom properties but cannot evaluate var(), and it takes
     a fallback over an unresolvable property — so for each element we read
     back the custom properties it actually cascaded and substitute those into
     a copy of the sheets before computing. That is the browser's own order
     of operations, and it is what makes the assertions below meaningful. */
  win.__sheetFor = (el) => {
    const cs = win.getComputedStyle(el);
    const map = new Map(VARS);
    for (const name of win.__varNames) {
      let v = '';
      try { v = cs.getPropertyValue(name); } catch { /* unknown */ }
      if (v && v.trim()) map.set(name, v.trim());
    }
    let text = win.__css;
    for (let i = 0; i < 6 && text.includes('var('); i++) {
      text = text.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,([^()]*?))?\)/g, (m, name, fb) =>
        map.has(name) ? map.get(name) : (fb !== undefined ? fb.trim() : m));
    }
    return text;
  };
  return win;
}

function resolve(text, cs, passes = 6) {
  let out = String(text == null ? '' : text);
  for (let i = 0; i < passes && out.includes('var('); i++) {
    out = out.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,([^()]*?))?\)/g, (m, name, fb) => {
      const own = cs ? String(cs.getPropertyValue(name) || '').trim() : '';
      if (own && own !== m) return own;
      if (VARS.has(name)) return VARS.get(name);
      return fb !== undefined ? fb.trim() : m;
    });
  }
  return out.trim();
}

/** The computed value of `prop` on the first element matching `sel`. */
function style(win, sel, prop, index = 0) {
  const els = win.document.querySelectorAll(sel);
  const el = els[index];
  if (!el) return null;
  const holder = win.document.getElementById('__istyles');
  if (holder) holder.textContent = win.__sheetFor(el);
  const cs = win.getComputedStyle(el);
  const value = resolve(cs[prop], cs);
  return value;
}

/** Colours need the shorthand too: a var()ed `background` leaves the
    longhand initial. */
function color(win, sel, prop, index = 0) {
  const els = win.document.querySelectorAll(sel);
  const el = els[index];
  if (!el) return null;
  const holder = win.document.getElementById('__istyles');
  if (holder) holder.textContent = win.__sheetFor(el);
  const cs = win.getComputedStyle(el);
  const raw = resolve(cs[prop], cs);
  const direct = parseColor(raw);
  if (/^transparent$/i.test(raw)) return null;
  if (direct && !/^rgba?\(0, 0, 0, 0\)$/.test(raw)) return direct;
  const shorthand = resolve(cs.background, cs);
  const token = shorthand.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/);
  return token ? parseColor(token[0]) : direct;
}

const px = (v) => {
  const m = String(v || '').match(/^(-?[\d.]+)px$/);
  return m ? parseFloat(m[1]) : null;
};
const ms = (v) => {
  const m = String(v || '').match(/^(-?[\d.]+)ms$/);
  return m ? parseFloat(m[1]) : (px(v) !== null ? px(v) : null);
};
/** calc(A + B) with px terms, the way jsdom leaves it after substitution. */
const calcPx = (v) => {
  const s = String(v || '').trim();
  if (!/^calc\(/.test(s)) return px(s);
  const inner = s.slice(5, -1).replace(/px/g, '');
  if (!/^[\d\s.+*/-]+$/.test(inner)) return null;
  try { return Number(Function('"use strict";return (' + inner + ')')().toFixed(3)); } catch { return null; }
};

/* ══════════════════════════════════════════════════════════════════════════
   1. The control layer exists and is variant-complete
   ══════════════════════════════════════════════════════════════════════════ */
{
  for (const sel of ['.btn', '.btn--primary', '.btn--secondary', '.btn--ghost', '.btn--outline', '.btn--danger']) {
    assert(`1.1 ${sel} is defined`, new RegExp('\\' + sel.replace('.', '.') + '\\s*[,{]').test(COMPONENTS) || COMPONENTS.includes(sel + ' {'), 'missing from components.css');
  }
  assert('1.2 the base is a plate, not a bare link',
    /\.btn \{[\s\S]{0,900}display: inline-flex/.test(COMPONENTS) &&
    /\.btn \{[\s\S]{0,900}min-height: var\(--ctl-h\)/.test(COMPONENTS), 'no flex plate / no min-height');
  assert('1.3 padding is vertical-free and grid-derived (flex centring)',
    /\.btn \{[\s\S]{0,1400}padding: 0 var\(--ctl-px\)/.test(COMPONENTS), 'expects `padding: 0 var(--ctl-px)`');
  assert('1.4 the legacy class names are aliases, not a second implementation',
    /\.btn-primary \{ --ctl-bg:/.test(COMPONENTS) && /\.btn-secondary \{ --ctl-bg:/.test(COMPONENTS));
  assert('1.5 sizes are on the 4pt grid',
    /--ctl-h-sm: 44px/.test(TOKENS) && /--ctl-h-md: 48px/.test(TOKENS) && /--ctl-h-lg: 56px/.test(TOKENS),
    'the control heights must be 44/48/56');
  assert('1.6 every control height is a multiple of 4',
    ['--ctl-h-sm', '--ctl-h-md', '--ctl-h-lg'].every((n) => {
      const v = parseInt(VARS.get(n), 10);
      return Number.isFinite(v) && v % 4 === 0;
    }));
}

/* ══════════════════════════════════════════════════════════════════════════
   2. Depth: multi-layered, soft, plus a 1px translucent edge
   ══════════════════════════════════════════════════════════════════════════ */
{
  const layers = (v) => (String(v).match(/rgba?\(/g) || []).length;
  for (const token of ['--shadow-1', '--shadow-2', '--shadow-3', '--shadow-4', '--shadow-lift']) {
    const value = VARS.get(token) || '';
    assert(`2.1 ${token} is a three-layer stack`, layers(value) >= 3, `found ${layers(value)} layer(s): ${value}`);
    const alphas = [...value.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)].map((m) => parseFloat(m[1]));
    assert(`2.2 ${token} stays under 12% alpha`, alphas.every((a) => a <= 0.12), `alphas: ${alphas.join(', ')}`);
  }
  assert('2.3 the tactile edges are 1px translucent inner lines',
    /--edge-light:\s*inset 0 1px 0 rgba\(255,255,255,\.60\)/.test(TOKENS) &&
    /--edge-dark:\s*inset 0 1px 0 rgba\(255,255,255,\.10\)/.test(TOKENS) &&
    /--edge-gold:/.test(TOKENS));
  assert('2.4 the pressed state compresses with an inner shadow',
    /--shadow-press:[^;]*inset 0 2px 5px/.test(TOKENS), 'no inner shadow on --shadow-press');
  assert('2.5 the plate composites edge + elevation',
    /\.btn \{[\s\S]{0,2600}box-shadow: var\(--ctl-edge\), var\(--ctl-shadow\)/.test(COMPONENTS));
}

/* ══════════════════════════════════════════════════════════════════════════
   3. Motion physics
   ══════════════════════════════════════════════════════════════════════════ */
{
  assert('3.1 hover is at least 300ms ease-out',
    /--dur-hover: 320ms/.test(TOKENS) && /--ease-out-lux: cubic-bezier\(\.16,1,\.3,1\)/.test(TOKENS));
  assert('3.2 press is faster than release (physical asymmetry)',
    ms(VARS.get('--dur-press')) < ms(VARS.get('--dur-release')),
    `press ${VARS.get('--dur-press')} vs release ${VARS.get('--dur-release')}`);
  assert('3.3 the spring easing overshoots', /--ease-spring: cubic-bezier\(\.34,1\.4[0-9]*,\.64,1\)/.test(TOKENS));
  check('3.4 hover sells a subtle scale', VARS.get('--sc-hover'), '1.02');
  check('3.5 press compresses to .97', VARS.get('--sc-press'), '.97');
  assert('3.6 the transition names its properties (never `all`)',
    !/\.btn \{[\s\S]{0,2600}transition: all/.test(COMPONENTS));
  assert('3.7 the CSS fallback is scoped away once physics are live',
    /html:not\(\.luxe-gsap\) \.btn:active/.test(COMPONENTS) &&
    /html:not\(\.luxe-gsap\) \.btn:hover/.test(COMPONENTS));
  assert('3.8 the press compression is applied where it cannot fight the tween',
    /\.btn > span \{[\s\S]{0,200}transition: transform var\(--dur-release\) var\(--ease-spring\)/.test(COMPONENTS) &&
    /\.btn:active > span \{ transform: scale\(var\(--sc-press\)\)/.test(COMPONENTS),
    'the label must take the compression GSAP’s transform ownership rules out');
}

/* ══════════════════════════════════════════════════════════════════════════
   4. Focus — offset ring with a soft glow, honouring reduced motion
   ══════════════════════════════════════════════════════════════════════════ */
{
  assert('4.1 one shared focus ring for every clickable thing',
    /:where\(a, button, summary, \[tabindex\], input, select, textarea\):focus-visible \{\s*outline: var\(--ring-w\) solid var\(--ring-color\);/.test(COMPONENTS),
    'the shared :focus-visible rule is missing or was rewritten');
  assert('4.2 the ring is offset, and the offset animates',
    /outline-offset: var\(--ring-offset\)/.test(COMPONENTS) && /outline-offset 220ms var\(--ease-out-lux\)/.test(COMPONENTS));
  assert('4.3 the glow is a filter, so it cannot clobber elevation',
    /filter: drop-shadow\(var\(--ring-glow\)\)/.test(COMPONENTS));
  check('4.4 the ring colour is the brand accent', VARS.get('--ring-color'), 'var(--color-accent-bright)');
  assert('4.5 zero specificity, so no page rule is overridden',
    /^:where\(a, button, summary/m.test(COMPONENTS), 'the ring must not raise specificity');
  assert('4.6 focus survives forced colours',
    /@media \(forced-colors: active\)[\s\S]{0,600}outline: 2px solid Highlight/.test(COMPONENTS));
  assert('4.7 reduced motion removes travel, keeps the ring',
    /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,900}transform: none/.test(COMPONENTS));
}

/* ══════════════════════════════════════════════════════════════════════════
   5. Text boxes
   ══════════════════════════════════════════════════════════════════════════ */
{
  assert('5.1 a shared field baseline exists at zero specificity',
    /:where\(input, textarea, select\):where\(:not\(\[type="checkbox"\]\)/.test(COMPONENTS));
  assert('5.2 fields hold the 44px touch floor',
    /:where\(input, textarea, select\)[\s\S]{0,400}min-height: var\(--ctl-h-md\)/.test(COMPONENTS));
  assert('5.3 fields have a resting edge and an inset',
    /--edge-inset:/.test(TOKENS) && /:where\(input, textarea, select\)[\s\S]{0,600}box-shadow: var\(--edge-inset\)/.test(COMPONENTS));
  assert('5.4 placeholders clear the text-contrast floor',
    /--color-placeholder: rgba\(24,20,15,\.70\)/.test(TOKENS) &&
    /--color-placeholder-dark: rgba\(255,255,255,\.58\)/.test(TOKENS) &&
    /:where\(input, textarea, select\)::placeholder \{ color: var\(--color-placeholder\); \}/.test(COMPONENTS),
    'a placeholder is text and must meet AA like any other label');
  assert('5.5 focus warms the border and adds a soft bloom',
    /:where\(input, textarea, select\):focus \{[\s\S]{0,300}0 0 0 4px rgba\(176,125,63,\.16\)/.test(COMPONENTS));
}

/* ══════════════════════════════════════════════════════════════════════════
   6. Hit areas — 44×44 minimum, per page, per control
   ══════════════════════════════════════════════════════════════════════════ */
{
  const overlaid = ['.chip', '.pg-btn', '.adm-btn', '.thumbnail-btn', '.btn--compact'];
  assert('6.1 sub-44px controls get an invisible 44px hit overlay',
    overlaid.every((sel) => new RegExp('\\' + sel + '::after').test(COMPONENTS)) &&
    /min-width: 44px;\s*min-height: 44px;/.test(COMPONENTS),
    'the tap-target overlay is missing for ' + overlaid.join(', '));

  const PAGES = [
    { page: 'index.html', sheets: ['tw-index.css', 'components.css', 'home.css', 'nav.css'] },
    { page: 'contact.html', sheets: ['components.css', 'contact.css', 'nav.css'] },
    { page: 'programs.html', sheets: ['components.css', 'programs.css', 'nav.css'] },
    { page: 'news.html', sheets: ['components.css', 'news.css', 'nav.css'] },
    { page: 'library.html', sheets: ['tw-library.css', 'components.css', 'library.css', 'nav.css'] },
  ];
  const tooSmall = [];
  for (const { page, sheets } of PAGES) {
    const win = mount(read(PUB(page)), sheets, { url: 'https://example.test/' + page });
    for (const sel of ['.btn', '.btn-primary', '.btn-secondary', '.btn-ghost', '.pg-btn', '.lux-btn-send', '.lux-btn-reset', '.social-link', '.lux-social-link', '.bic-nav__cta', '.chip', '.adm-btn', '.thumbnail-btn', '.lb__btn', '.btn-send', '.form-submit', '#submitBtn']) {
      const els = win.document.querySelectorAll(sel);
      els.forEach((el, i) => {
        const holder = win.document.getElementById('__istyles');
        holder.textContent = win.__sheetFor(el);
        const cs = win.getComputedStyle(el);
        const h = calcPx(resolve(cs.minHeight, cs)) ?? calcPx(resolve(cs.height, cs));
        const w = calcPx(resolve(cs.minWidth, cs)) ?? calcPx(resolve(cs.width, cs));
        const text = (el.textContent || '').trim();
        const iconOnly = text.length === 0;
        const covered = overlaid.some((c) => el.classList.contains(c.slice(1)));
        const padX = calcPx(resolve(cs.paddingLeft, cs));
        /* jsdom performs no layout, so a text control's width computes to
           `auto`. Three measurable things stand in for it: the height (the
           floor that matters most), the explicit width for icon-only
           controls, and — for text controls — a deliberately conservative
           estimate of the label's advance width (0.62em per character, below
           the real average for the uppercase UI face) plus its padding.
           Under-estimating is the point: if the estimate clears 44, the real
           control clears it too. */
        const fs = parseFloat(resolve(cs.fontSize, cs)) || 14;
        const tracking = resolve(cs.letterSpacing, cs);
        const trackPx = /em$/.test(tracking) ? parseFloat(tracking) * fs : (px(tracking) || 0);
        const chars = iconOnly ? 0 : text.length;
        const estimated = chars * (fs * 0.62 + trackPx) + 2 * (padX || 0);
        const heightOk = (h !== null && h >= 44) || covered;
        const widthOk = iconOnly
          ? ((w !== null && w >= 44) || covered)
          : (estimated >= 44 || covered);
        if (!(heightOk && widthOk)) {
          tooSmall.push(`${page} ${sel}[${i}]: h=${h} w=${w} padX=${padX} est=${Math.round(estimated)}${iconOnly ? ' icon-only' : ''}${covered ? ' overlay' : ''}`);
        }
      });
    }
  }
  assert('6.2 every control on the public pages reaches 44px', tooSmall.length === 0, tooSmall.join(' | '));
}

/* ══════════════════════════════════════════════════════════════════════════
   7. Contrast — WCAG AA on every interactive pair, in its own context
   ══════════════════════════════════════════════════════════════════════════ */
{
  const PAPER = { r: 243, g: 239, b: 229, a: 1 };   // --color-paper
  const EBONY = { r: 20, g: 18, b: 16, a: 1 };      // --color-ebony
  const pairs = [];
  const add = (label, fg, bg, base, min) => {
    if (!fg) { fail(label, 'label colour could not be computed'); return; }
    const surface = bg || base;
    const ratio = contrast(fg, surface, base);
    pairs.push({ label, ratio: Math.round(ratio * 100) / 100 });
    assert(`${label} — ${Math.round(ratio * 100) / 100}:1 ≥ ${min}:1`, ratio >= min, `only ${ratio.toFixed(2)}:1`);
  };

  /* Variant-level: each variant is mounted on the surface it was designed
     for, so the pair being measured is the pair the user actually sees. */
  const variants = mount(
    '<!doctype html><html><body style="background:#F3EFE5">' +
    '<a class="btn btn--primary" href="#">Primary</a>' +
    '<a class="btn btn--secondary" href="#">Secondary</a>' +
    '<a class="btn btn--ghost" href="#">Ghost</a>' +
    '<a class="btn btn--outline" href="#">Outline</a>' +
    '<a class="btn btn--danger" href="#">Danger</a>' +
    '<a class="btn btn-primary" href="#">Legacy primary</a>' +
    '<a class="btn btn-secondary" href="#">Legacy secondary</a>' +
    '<a class="btn btn-ghost" href="#">Legacy ghost</a>' +
    '</body></html>',
    ['components.css'],
  );
  for (const [label, sel] of [
    ['7.1 primary', '.btn--primary'],
    ['7.2 secondary (gold)', '.btn--secondary'],
    ['7.3 ghost', '.btn--ghost'],
    ['7.4 outline', '.btn--outline'],
    ['7.5 danger', '.btn--danger'],
    ['7.6 legacy .btn-primary alias', '.btn-primary'],
    ['7.7 legacy .btn-secondary alias', '.btn-secondary'],
    ['7.8 legacy .btn-ghost alias', '.btn-ghost'],
  ]) {
    add(label, color(variants, sel, 'color'), color(variants, sel, 'background-color'), PAPER, 4.5);
  }
  // hover surfaces must clear the floor too — a state that fails AA is a bug
  for (const [label, sel] of [['7.9 primary hover', '.btn--primary'], ['7.10 secondary hover', '.btn--secondary']]) {
    const el = variants.document.querySelector(sel);
    const cs = variants.getComputedStyle(el);
    const fg = resolve(cs.getPropertyValue('--ctl-fg-hover'), cs) || resolve(cs.getPropertyValue('--ctl-fg'), cs);
    const bg = resolve(cs.getPropertyValue('--ctl-bg-hover'), cs) || resolve(cs.getPropertyValue('--ctl-bg'), cs);
    add(label, parseColor(fg), parseColor(bg), PAPER, 4.5);
  }

  /* Page-level: the real controls, in the context their page puts them in. */
  const index = mount(read(PUB('index.html')), ['tw-index.css', 'components.css', 'home.css', 'nav.css']);
  add('7.11 hero gold CTA', color(index, '#ctaPrimary', 'color'), color(index, '#ctaPrimary', 'background-color'), EBONY, 4.5);
  add('7.12 hero glass CTA over the hero', color(index, '#ctaSecondary', 'color'), color(index, '#ctaSecondary', 'background-color'), EBONY, 4.5);
  add('7.13 enquiry submit', color(index, '#submitBtn', 'color'), color(index, '#submitBtn', 'background-color'), PAPER, 4.5);

  const programs = mount(read(PUB('programs.html')), ['components.css', 'programs.css', 'nav.css']);
  add('7.14 programs hero ghost on the dark hero', color(programs, '.btn-ghost', 'color'), color(programs, '.btn-ghost', 'background-color'), EBONY, 4.5);
  add('7.15 programs enquiry submit', color(programs, '.form-submit', 'color'), color(programs, '.form-submit', 'background-color'), PAPER, 4.5);

  const news = mount(read(PUB('news.html')), ['components.css', 'news.css', 'nav.css']);
  add('7.16 news pagination plate', color(news, '.pg-btn', 'color'), color(news, '.pg-btn', 'background-color'), PAPER, 4.5);
  add('7.17 news newsletter submit', color(news, '.newsletter button', 'color'), color(news, '.newsletter button', 'background-color'), PAPER, 4.5);

  const contact = mount(read(PUB('contact.html')), ['components.css', 'contact.css', 'nav.css']);
  add('7.18 contact send button', color(contact, '.lux-btn-send', 'color'), color(contact, '.lux-btn-send', 'background-color'), PAPER, 4.5);
  add('7.19 contact reset', color(contact, '.lux-btn-reset', 'color'), null, PAPER, 4.5);

  const worst = pairs.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  assert(`7.20 worst interactive pair is ${worst.label} at ${worst.ratio}:1`, worst.ratio >= 4.5);
}

/* ══════════════════════════════════════════════════════════════════════════
   8. luxe.js — the pointer physics, and its guards
   ══════════════════════════════════════════════════════════════════════════ */
{
  const LUXE = read(PUB('assets', 'js', 'luxe.js'));
  const GSAP = read(PUB('assets', 'vendor', 'gsap.min.js'));
  assert('8.1 GSAP is vendored, not pulled from a CDN', GSAP.length > 50000 && /GSAP 3\./.test(GSAP.slice(0, 200)));
  assert('8.2 the field radius is φ × the control’s longest side', /var PHI = 1\.618/.test(LUXE) && /Math\.max\(r\.width, r\.height\) \* PHI/.test(LUXE));
  assert('8.3 the pull is zero at the centre and bounded in px at the rim',
    /var TRAVEL = 6/.test(LUXE) &&
    /Math\.min\(1, dist \/ radius\)[\s\S]{0,260}nx \* influence \* TRAVEL/.test(LUXE),
    'the travel must be a capped distance, not the cursor offset scaled up');
  assert('8.4 the magnet is opt-in and curated, never global',
    /\.btn--magnet, \[data-magnet\], \.btn-primary/.test(LUXE) && /data-luxe="off"/.test(LUXE));
  assert('8.5 no magnetic target inside an overlay or menu',
    /closest\('\.bic-menu, #lightbox, \.lb, \[role="dialog"\]/.test(LUXE));
  assert('8.6 reduced motion and coarse pointers opt out',
    /reason = 'reduced-motion'/.test(LUXE) && /reason = 'coarse-pointer'/.test(LUXE));
  assert('8.7 release uses an elastic settle, press a fast ease',
    /elastic\.out\(1, 0\.55\)/.test(LUXE) && /yTo\.tuned\(0\.12, 'power2\.out'\)\(PRESS_LIFT\)/.test(LUXE));
  assert('8.7b it owns one property per tween and never overwrites its own',
    !/overwrite:/.test(LUXE), 'an overwrite would kill the quickTo tween that owns the axis');
  assert('8.7c one tween per axis for the whole session (quickTo, retargeted)',
    (LUXE.match(/gsap\.quickTo\(/g) || []).length === 1 &&
    /var follower = function|function follower\(/.test(LUXE),
    'each axis must be a single persistent tween');
  assert('8.8 late-rendered controls are picked up',
    /new MutationObserver/.test(LUXE) && /observer\.observe\(document\.body/.test(LUXE));
  assert('8.9 it never throws when GSAP is missing',
    /if \(!gsap\) \{ api\.reason = 'gsap-missing'; return; \}/.test(LUXE));

  // behaviour: no GSAP
  const bare = new JSDOM('<!doctype html><html><body><a class="btn-primary" href="#">go</a></body></html>', { runScripts: 'dangerously' });
  bare.window.eval(LUXE);
  check('8.10 without GSAP it degrades silently', [bare.window.luxe.disabled, bare.window.luxe.reason], [true, 'gsap-missing']);

  // behaviour: with GSAP and a fine pointer
  const dom = new JSDOM(
    '<!doctype html><html><body><a class="btn-primary" href="#">go</a>' +
    '<a class="btn-primary" data-luxe="off" href="#">still</a></body></html>',
    { runScripts: 'dangerously', pretendToBeVisual: true },
  );
  const { window } = dom;
  window.matchMedia = (q) => ({ matches: q.includes('hover: hover'), media: q, addEventListener() {}, removeEventListener() {} });
  window.eval(GSAP);
  window.eval(LUXE);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  check('8.11 with GSAP the physics engage', window.luxe.disabled, false);
  check('8.12 the opt-out is honoured', window.luxe.controls.length, 1);
  assert('8.13 the root is marked so the CSS fallback stands down',
    window.document.documentElement.classList.contains('luxe-gsap'));

  /* The numbers, rendered headlessly. `gsap.ticker.sleep()` stops the real
     clock and `updateRoot(t)` advances the root timeline to an absolute time,
     so these assertions are deterministic instead of depending on how fast the
     machine running the gate happens to be. The first version of the magnet
     passed every source-level check and still stranded the control 13px from
     home after `pointerleave`, which is why the physics are measured here. */
  const el = window.luxe.controls[0];
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 48 });
  const TRAVEL = window.luxe.tunables.TRAVEL;
  window.gsap.ticker.sleep();
  let clock = 0;
  const advance = (s) => { clock += s; window.gsap.updateRoot(clock); };
  const offset = () => {
    const m = String(el.style.transform).match(/translate3?d?\((-?[\d.]+)px,\s*(-?[\d.]+)px/);
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
  };
  const move = (type, x, y) => el.dispatchEvent(new window.PointerEvent(type, { clientX: x, clientY: y, bubbles: true }));
  const near = (label, got, want, tol) =>
    assert(label, Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ±${tol}`);
  advance(0.05);

  move('pointerenter', 60, 24);
  advance(0.6);
  const centre = offset();
  near('8.14 dead centre: no sideways pull, only the hover lift', centre[0], 0, 0.01);
  near('8.15 dead centre: the control lifts by HOVER_LIFT', centre[1], -2, 0.01);

  move('pointermove', 170, 24);
  advance(0.6);
  const rim = offset();
  assert('8.16 at the field rim the pull leans toward the pointer',
    rim[0] > 0.5 && rim[0] <= TRAVEL + 0.01, `x=${rim[0]} of a ${TRAVEL}px budget`);

  move('pointermove', 5000, 5000);
  advance(0.6);
  const far = Math.hypot(...offset());
  assert('8.17 an absurd distance cannot drag it off the plate',
    far <= TRAVEL + 0.05, `travelled ${far.toFixed(2)}px with a ${TRAVEL}px budget`);

  move('pointerleave', 5000, 5000);
  advance(1.5);
  const home = offset();
  assert('8.18 pointerleave brings it all the way home',
    Math.abs(home[0]) < 0.05 && Math.abs(home[1]) < 0.05,
    `stranded at x=${home[0]} y=${home[1]} — the transform never returned to rest`);

  move('pointerenter', 60, 24);
  advance(0.6);
  move('pointerdown', 60, 24);
  advance(0.25);
  const pressed = offset()[1];
  assert('8.19 the press sinks the plate under the pointer', pressed > -2, `y stayed at ${pressed}`);
  move('pointerup', 60, 24);
  advance(1.2);
  const released = offset()[1];
  near('8.20 the release springs back to the hovered rest', released, -2, 0.6);
  assert('8.21 the press never reaches for `scale` — CSS owns the compression',
    !/scale\(/.test(el.style.transform || ''),
    `inline transform is ${el.style.transform}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   9. The pages were actually refactored onto the system
   ══════════════════════════════════════════════════════════════════════════ */
{
  const pages = fs.readdirSync(PUB()).filter((f) => f.endsWith('.html'));
  const notWired = pages.filter((p) => !read(PUB(p)).includes('luxe.js'));
  assert('9.1 every page loads the physics', notWired.length === 0, notWired.join(', '));
  const missingGsap = pages.filter((p) => !read(PUB(p)).includes('vendor/gsap.min.js'));
  assert('9.2 every page loads the library the physics use', missingGsap.length === 0, missingGsap.join(', '));
  const magnetised = pages.filter((p) => /data-magnet/.test(read(PUB(p))) || /btn-primary/.test(read(PUB(p))));
  assert('9.3 the magnet is present but curated (≤ 5 per page)', magnetised.every((p) => (read(PUB(p)).match(/data-magnet/g) || []).length <= 5),
    magnetised.filter((p) => (read(PUB(p)).match(/data-magnet/g) || []).length > 5).join(', '));

  for (const [file, needle] of [
    ['home.css', '--ctl-bg: var(--color-brand-yellow)'],
    ['home.css', '--ctl-bg: var(--color-brand);'],
    ['programs.css', '--ctl-bg: var(--color-ink)'],
    ['contact.css', '--ctl-bg: var(--color-ink)'],
    ['news.css', '--ctl-bg: var(--color-brand)'],
  ]) {
    assert(`9.4 ${file} declares ${needle}`, read(PUB('assets', 'css', file)).includes(needle));
  }
  assert('9.5 no page re-implements the plate geometry',
    !/\.(pg-btn|chip|lux-btn-send|form-submit)[^{]*\{[^}]*border-radius: 999px;[^}]*padding: (9|8|7)px/.test(read(PUB('assets', 'css', 'news.css')) + read(PUB('assets', 'css', 'programs.css'))));
  assert('9.6 the desktop blanket transition no longer out-ranks the layer',
    /:not\(a\):not\(button\):not\(input\):not\(select\):not\(textarea\)/.test(read(PUB('assets', 'css', 'home.css'))),
    'home.css still transition-alls every element on desktop, including controls');
}

/* ══════════════════════════════════════════════════════════════════════════
   10. The page sheets, swept onto the system
   Page sheets are allowed to style their own controls — a phone number that
   reads as a link should stay a link — but they may not reintroduce the
   things the system exists to replace: blanket transitions, hardcoded rings,
   single-layer shadows, or sub-44px targets with no overlay.
   ══════════════════════════════════════════════════════════════════════════ */
{
  const sheets = fs.readdirSync(PUB('assets', 'css'))
    .filter((f) => f.endsWith('.css') && !f.startsWith('tw-'));   // tw-* is generated
  const all = sheets.map((f) => [f, read(PUB('assets', 'css', f))]);

  const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');   // a comment is not a declaration
  const blanket = all.filter(([, css]) => /transition:\s*all\b/.test(strip(css))).map(([f]) => f);
  assert('10.1 no sheet animates `all` — every transition names its properties',
    blanket.length === 0, blanket.join(', '));

  const hardRing = all.filter(([f, css]) => f !== 'components.css' && /outline:\s*2px solid/.test(strip(css))).map(([f]) => f);
  assert('10.2 one ring definition, in components.css, and every page borrows it',
    hardRing.length === 0, `hardcoded ring still in ${hardRing.join(', ')}`);

  const singleShadow = all.filter(([f, css]) => /box-shadow:\s*0 \d+px \d+px rgba\([^)]*0\.[2-9]/.test(strip(css))).map(([f]) => f);
  assert('10.3 no page draws a single-layer shadow heavier than 20% alpha',
    singleShadow.length === 0, singleShadow.join(', '));

  assert('10.4 the library and news pages still had their own rings — now tokens',
    /outline: var\(--ring-w\) solid var\(--ring-color\);\n  outline-offset: var\(--ring-offset\);\n  box-shadow: var\(--ring-glow\);/.test(read(PUB('assets', 'css', 'news.css'))));

  /* compact plates: small visual size, 44px target */
  for (const [file, sel] of [
    ['news.css', '.adm-logout-btn::after'],
    ['news.css', '.adm-staff-trigger'],
    ['nav.css', '.bic-nav__links a::after'],
    ['footer.css', '.bic-adm-trigger::after'],
  ]) {
    const css = read(PUB('assets', 'css', file));
    const i = css.indexOf(sel);
    assert(`10.5 ${file} ${sel} carries the overlay`, i > -1 && css.slice(i, i + 320).includes('--tap-min'),
      'a compact control without the overlay is a sub-44px target in practice');
  }

  /* the admin tail consumes the tokens rather than re-inventing them */
  const admin = read(PUB('assets', 'css', 'news.css'));
  for (const sel of ['.adm-login-submit', '.adm-dz-remove', '.adm-newsletter-test,\n.adm-newsletter-preview']) {
    const i = admin.indexOf(sel + ' {');
    assert(`10.6 ${sel} is tuned by the shared motion`, i > -1 && admin.slice(i, i + 900).includes('var(--dur-hover)'),
      'a plate with its own timing is a plate off the system');
  }
  assert('10.7 the staff plates restate the shared glow they would otherwise shadow out',
    /\.adm-btn:focus-visible[\s\S]{0,320}var\(--ring-glow\)/.test(admin));

  const gsapPages = fs.readdirSync(PUB()).filter((f) => f.endsWith('.html'));
  const unversioned = gsapPages.filter((p) => /href="\/assets\/css\/[a-z0-9-]+\.css"/.test(read(PUB(p))));
  assert('10.8 every stylesheet is cache-busted (they are served max-age=86400)',
    unversioned.length === 0, unversioned.join(', '));
  const luxeUnversioned = gsapPages.filter((p) => /src="\/assets\/js\/luxe\.js"/.test(read(PUB(p))));
  assert('10.9 the physics script is cache-busted too', luxeUnversioned.length === 0, luxeUnversioned.join(', '));
}

/* ── report ─────────────────────────────────────────────────────────────── */
const failures = results.filter((r) => !r.ok);
console.log(`\nInteractive layer — ${results.length} assertions\n`);
for (const f of failures) console.log(`✗ ${f.label}\n    ${f.detail}`);
if (failures.length === 0) console.log('✓ all assertions pass');
else console.log(`\n✗ ${failures.length} of ${results.length} assertions failed`);
process.exit(failures.length === 0 ? 0 : 1);
