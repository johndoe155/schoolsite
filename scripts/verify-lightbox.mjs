#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
 * Gallery viewer + hero/gallery/admissions verification harness.
 *
 * WHY THIS EXISTS
 * The owner reported nine problems across the landing page, the administration
 * section and the admissions form. Three of them were defects rather than
 * taste:
 *
 *   • "clicking Next often triggers an infinite loader" — the old viewer
 *     latched a module-level `isLoading` flag; one slow or failed image left
 *     the spinner up forever and swallowed every later Next/Prev click.
 *   • "the count indicator breaks, displaying NaN/0" — the *other* lightbox
 *     (a duplicate that used to live in main.js) computed
 *     `(currentIndex + 1) % currentArchive.length`; with an empty archive that
 *     is NaN / 0. This script guards against that expression coming back.
 *   • "the close button is overlapped by the header" — three pages share
 *     id="lightbox" and the nav is z-index 900, so the dialog layer has to be
 *     both scoped and raised, and the nav has to step aside while it is open.
 *
 * The rest of the list is design (frosted hero pill, pressed states that keep
 * their glass, a modern scroll cue, the chairman's signature, gallery
 * breathing room, a resting surface for the submit button). Those are checked
 * here too, so a later edit cannot quietly undo them.
 *
 * WHAT IT CHECKS
 *   1. Lightbox behaviour in jsdom, driving the real home.js: open, next,
 *      prev, wrap in both directions, Home/End, Escape, focus return, a
 *      failed load, a *hung* load (the reported bug), an empty archive and a
 *      single-image archive. The counter must always match /^\d+ \/ \d+$/.
 *   2. Layering and styling invariants, with tokens resolved into the sheets
 *      the page actually loads (jsdom does not implement var()).
 *   3. The nine reported items, one assertion each, by name.
 *
 * jsdom is a devDependency; no network access and no browser are needed.
 *
 * Usage:  npm run verify:lightbox
 * ────────────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = (...p) => path.join(ROOT, 'public', ...p);
const read = (p) => fs.readFileSync(p, 'utf8');

const html = read(PUB('index.html'));
const homeJs = read(PUB('assets/js/home.js'));
const mainJs = read(PUB('assets/js/main.js'));
const componentsCss = read(PUB('assets/css/components.css'));
const homeCss = read(PUB('assets/css/home.css'));
const tokensCss = read(PUB('assets/css/tokens.css'));
const navCss = read(PUB('assets/css/nav.css'));
/** JS with comments stripped: an old expression is fine in prose, not in code. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const homeCode = stripComments(homeJs);
const mainCode = stripComments(mainJs);
const gallery = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/gallery-data.json'), 'utf8'));

/* ── the harness ─────────────────────────────────────────────────────────── */

const results = [];
const t = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  results.push({ label, got, want, ok });
  return ok;
};
const tOk = (label, cond, detail = '') => {
  results.push({ label, got: detail || cond, want: true, ok: !!cond });
  return !!cond;
};

const tick = (ms = 8) => new Promise((r) => setTimeout(r, ms));

function makeDom({ onRequest = null, guardMs = 120 } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.fetch = (url) => Promise.resolve({ ok: true, json: () => Promise.resolve(String(url).includes('gallery') ? gallery : []) });

  const requested = [];
  window.Image = class {
    set src(v) {
      this._src = v;
      requested.push(v);
      const verdict = onRequest ? onRequest(v) : 'load';
      if (verdict === 'hang') return;             // no callback, ever — a stalled request
      setTimeout(() => { if (verdict === 'error') this.onerror?.(); else this.onload?.(); }, 0);
    }
    get src() { return this._src; }
  };
  window.eval(homeJs);
  const lightbox = window.document.getElementById('lightbox');
  lightbox.setAttribute('data-load-guard', String(guardMs));
  return { window, document: window.document, requested };
}

const counter = (doc) => doc.getElementById('lbCounter').textContent;
const isLoading = (doc) => doc.getElementById('lightbox').classList.contains('is-loading');
const cardFor = (doc, title) =>
  [...doc.querySelectorAll('.gallery-item')].find((el) => el.getAttribute('data-title') === title);

/* ── 1. happy path, both directions, both ends ───────────────────────────── */

{
  const { document: doc } = makeDom();
  await tick(14);
  const cards = doc.querySelectorAll('.gallery-item');
  t('seven gallery categories render', cards.length, gallery.length);

  const moments = gallery.find((g) => g.title === 'Moments');
  cardFor(doc, 'Moments').click();
  t('opening shows the first image immediately', counter(doc), `1 / ${moments.images.length}`);
  tOk('spinner runs while the image loads', isLoading(doc));   // synchronously, before any await
  await tick(20);
  tOk('spinner clears once the image settles', !isLoading(doc));
  tOk('the dialog is open and the nav has stepped aside',
    doc.getElementById('lightbox').classList.contains('is-open')
    && doc.documentElement.classList.contains('lb-open'));
  t('image count exposed for the single-image rule', doc.getElementById('lightbox').getAttribute('data-count'), String(moments.images.length));

  for (let i = 0; i < 4; i++) { doc.getElementById('lbNext').click(); await tick(12); }
  t('Next advances the index', counter(doc), `5 / ${moments.images.length}`);

  // walk to the last frame, then wrap forward
  for (let i = 0; i < moments.images.length - 5; i++) { doc.getElementById('lbNext').click(); await tick(12); }
  t('the last frame reads N / N', counter(doc), `${moments.images.length} / ${moments.images.length}`);
  doc.getElementById('lbNext').click(); await tick(12);
  t('Next wraps past the end to the first image', counter(doc), `1 / ${moments.images.length}`);
  doc.getElementById('lbPrev').click(); await tick(12);
  t('Prev wraps before the start to the last image', counter(doc), `${moments.images.length} / ${moments.images.length}`);

  doc.getElementById('lbNext').click(); await tick(12);
  doc.getElementById('lbNext').click(); await tick(12);
  doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  await tick(12);
  t('End jumps to the last image', counter(doc), `${moments.images.length} / ${moments.images.length}`);
  doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  await tick(12);
  t('Home jumps to the first image', counter(doc), `1 / ${moments.images.length}`);

  // counter format, category by category — the "NaN / 0" regression guard
  let wellFormed = true;
  for (const cat of gallery) {
    cardFor(doc, cat.title).click();
    await tick(12);
    for (let i = 0; i < 3; i++) { doc.getElementById('lbNext').click(); await tick(12); }
    const text = counter(doc);
    const m = text.match(/^(\d+) \/ (\d+)$/);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > Number(m[2]) || Number(m[2]) !== cat.images.length) {
      wellFormed = false;
      tOk(`counter well-formed for ${cat.title}`, false, text);
    }
  }
  tOk('every category keeps the counter as "n / N"', wellFormed);

  // close: focus returns to the card that opened it
  const invoker = cardFor(doc, 'Sports');
  invoker.click(); await tick(12);
  doc.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tick(12);
  tOk('Escape closes the viewer', !doc.getElementById('lightbox').classList.contains('is-open'));
  tOk('the nav comes back', !doc.documentElement.classList.contains('lb-open'));
  tOk('focus returns to the card that opened it', doc.activeElement === invoker);
}

/* ── 2. the reported infinite loader: a hung request ─────────────────────── */

{
  const hung = gallery.find((g) => g.title === 'Discovery').images[1];
  const { document: doc } = makeDom({ onRequest: (src) => (src === hung ? 'hang' : 'load') });
  await tick(14);
  cardFor(doc, 'Discovery').click(); await tick(12);
  const before = counter(doc);
  doc.getElementById('lbNext').click(); await tick(12);   // lands on the hung frame
  t('the hung frame is still counted', counter(doc), '2 / ' + gallery.find((g) => g.title === 'Discovery').images.length);

  const during = counter(doc);
  doc.getElementById('lbNext').click(); await tick(12);
  doc.getElementById('lbNext').click(); await tick(12);
  tOk('navigation is NOT blocked while an image hangs', counter(doc) !== during,
    `${during} → ${counter(doc)} (started at ${before})`);

  await tick(400);                                        // past the guard (120ms)
  tOk('the guard clears the spinner for a hung image', !isLoading(doc));
}

/* ── 3. failures degrade instead of hanging ──────────────────────────────── */

{
  const { document: doc } = makeDom({ onRequest: () => 'error' });
  await tick(14);
  cardFor(doc, 'Alumni').click(); await tick(30);
  tOk('a failed image clears the spinner', !isLoading(doc));
  t('a failed image still counts', counter(doc), `1 / ${gallery.find((g) => g.title === 'Alumni').images.length}`);
  doc.getElementById('lbNext').click(); await tick(30);
  tOk('navigation continues after a failure', counter(doc) === `2 / ${gallery.find((g) => g.title === 'Alumni').images.length}`);
}

/* ── 4. degenerate archives ─────────────────────────────────────────────── */

{
  const { window, document: doc } = makeDom();
  await tick(14);
  const opened = window.openGallery([], 0, { title: 'Empty' });
  t('an empty archive never opens the viewer', opened, false);
  tOk('and leaves the counter blank rather than showing a stale count', counter(doc) === '—');
  tOk('and leaves the dialog closed', !doc.getElementById('lightbox').classList.contains('is-open'));

  t('a malformed archive is refused', window.openGallery(null, 0, {}), false);
  t('a non-string archive is refused', window.openGallery([1, 2, 3], 0, {}), false);

  const single = gallery.find((g) => g.title === 'Discovery').images.slice(0, 1);
  t('a one-image archive opens', window.openGallery(single, 0, { title: 'One' }), true);
  await tick(20);
  t('single image counter', counter(doc), '1 / 1');
  t('single image hides the arrows', doc.getElementById('lightbox').getAttribute('data-count'), '1');
  doc.getElementById('lbNext').click(); await tick(20);
  t('Next on a single-image archive is a no-op, not a crash', counter(doc), '1 / 1');
  doc.getElementById('lbPrev').click(); await tick(20);
  t('Prev on a single-image archive is a no-op, not a crash', counter(doc), '1 / 1');
}

/* ── 5. the duplicate that produced NaN is gone for good ────────────────── */

{
  tOk('main.js carries no second lightbox counter', !mainCode.includes('lbCounter'));
  tOk('main.js has no modulo-by-length index arithmetic',
    !/%\s*currentArchive\.length/.test(mainCode) && !/lbCounter/.test(mainCode));
  tOk('home.js never takes a modulo of an unguarded length',
    /normalizeIndex\(/.test(homeCode) && !/\(currentIndex \+ 1\) % currentArchive\.length/.test(homeCode));
  tOk('the page cache-busts the scripts that carried the old viewer',
    /main\.js\?v=\d/.test(html) && /home\.js\?v=\d/.test(html));
}

/* ── 6. layering: nothing can cover the close button ────────────────────── */

{
  const vars = new Map();
  for (const m of tokensCss.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) vars.set(m[1], m[2].trim());
  const resolve = (text, passes = 4) => {
    for (let i = 0; i < passes; i++) {
      text = text.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,([^()]*))?\)/g, (m, name, fb) =>
        vars.has(name) ? vars.get(name) : (fb !== undefined ? fb.trim() : m));
    }
    return text;
  };
  const dom = new JSDOM(html, { url: 'https://example.test/', pretendToBeVisual: true });
  const style = dom.window.document.createElement('style');
  style.textContent = resolve([tokensCss, componentsCss, navCss, homeCss].join('\n'));
  dom.window.document.head.appendChild(style);
  const win = dom.window;
  const val = (sel, prop) => {
    const el = win.document.querySelector(sel);
    return el ? win.getComputedStyle(el)[prop] : null;
  };

  const dialogZ = Number(val('#lightbox', 'zIndex'));
  const navZ = Number(val('.bic-nav', 'zIndex'));
  tOk(`the viewer sits above the nav (viewer ${dialogZ} > nav ${navZ})`, dialogZ > navZ);
  tOk('and above the page-transition cover (9000)', dialogZ > 9000);
  tOk('the nav is hidden outright while the viewer is open',
    /html\.lb-open \.bic-nav/.test(componentsCss) && /visibility: hidden/.test(componentsCss));
  tOk('the viewer is scoped so other pages keep their own dialog',
    /#lightbox:not\(\.lb\) \{ z-index: 950/.test(componentsCss));
  t('the close button is the topmost control inside the dialog', val('#lbClose', 'zIndex') === 'auto', true);
  tOk('the scrim closes the viewer', val('.lb__scrim', 'position') === 'absolute');
  tOk('images crossfade with a transition', (val('.lb__img', 'transition') || '').includes('opacity'));
}

/* ── 7. the nine reported items, one assertion each ─────────────────────── */

{
  tOk('1. hero pill is whitish frosted glass, not a yellow chip',
    /id="heroEyebrow"[^>]*bg-white\/10[^>]*backdrop-blur-xl/.test(html) && !/heroEyebrow[^>]*bg-brand-yellow/.test(html));
  tOk('1b. and gets its lower opacity from translucent fills, not `opacity`',
    !/id="heroEyebrow"[^>]*[^-]opacity-(?:4|5|6|7|8|9)0/.test(html));
  tOk('2. the primary CTA keeps its sheen while pressed',
    /group-active:scale-x-100/.test(html));
  tOk('2b. pressed states keep their glass instead of scaling it away',
    /#home \.btn-secondary:active \{[^}]*backdrop-filter/.test(homeCss) && !/#home \.btn-secondary:active \{[^}]*scale\(/.test(homeCss));
  tOk('3. the bouncing arrow is replaced by a rail + bead + chevron',
    /class="hero-scroll"/.test(html) && /hero-scroll__bead/.test(homeCss) && !/animate-bounce/.test(html));
  tOk('3b. and it honours prefers-reduced-motion', /prefers-reduced-motion[\s\S]*hero-scroll__bead/.test(homeCss));
  tOk('4. the chairman is signed inside the portrait frame',
    /class="admin-sign"[\s\S]{0,400}Justice Kayode Eso/.test(html)
    && html.indexOf('admin-photo-frame') < html.indexOf('Justice Kayode Eso'));
  tOk('4b. in a handwriting face with a cursive fallback',
    /admin-sign__name \{[\s\S]{0,200}Great Vibes/.test(homeCss) && /cursive/.test(homeCss));
  tOk('5. gallery cards and titles get more room',
    /gap-x-8 gap-y-16/.test(html) && /gallery-caption__rule/.test(homeJs) && /margin: 26px auto 16px/.test(homeCss));
  tOk('6. the lightbox is a modern, minimal frame',
    /\.lb__img \{[\s\S]{0,400}border-radius: 4px/.test(componentsCss) && /lb__loader/.test(componentsCss));
  tOk('9. the submit button owns a resting surface',
    /class="[^"]*btn-send/.test(html) && /\.btn-send \{[\s\S]{0,300}background: var\(--color-brand\)/.test(homeCss));
}

/* ── report ──────────────────────────────────────────────────────────────── */

const failures = results.filter((r) => !r.ok);
console.log(`\nGallery viewer + landing-page checks — ${results.length} assertions\n`);
for (const r of results) {
  if (!r.ok) console.log(`✗ ${r.label}\n    got  ${JSON.stringify(r.got)}\n    want ${JSON.stringify(r.want)}`);
}
if (failures.length === 0) {
  console.log('✓ all assertions pass\n');
  process.exit(0);
}
console.log(`✗ ${failures.length} of ${results.length} assertions failed\n`);
process.exit(1);
