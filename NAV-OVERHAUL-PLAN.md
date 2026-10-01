# Navigation Overhaul Plan — Unified Smart Nav + Cinematic Dual-Overlay Menu

Status: **proposed, awaiting approval**

## Current state (measured)

- **4 divergent headers**: index (Tailwind `#mainHeader` + SVG hamburger + desktop
  anchor links), contact/news/library (`.bic-site-nav` + `#hamburger` BIC pill +
  `enableStickyHamburger`/`#hamburgerSticky` clone + inline `.scrolled` listener),
  programs (same, own CSS subset, no scroll JS), academies (Phase-8 port + own
  scroll listener). admin.html has no site nav.
- **Menu engine**: `layout.js` (~200 lines) — two markup variants (home:
  full-screen dark; lux: 380px ebony side panel). Already implements focus trap,
  Escape, body scroll-lock, `aria-expanded`, re-parenting. Timings from tokens
  (`--overlay-duration` 220 / `--panel-duration` 340 / `--panel-delay` 120).
- **Duplication**: ~180 nav/menu CSS rules across contact.css (41), library.css
  (42), news.css (41), programs.css (23), home.css (33) + academies inline copy.
- **Absent**: smart show/hide scroll, dual-overlay staggered menu, item stagger,
  page-transition engine, morphing toggle.

## Target architecture

### New files
- `public/assets/css/nav.css` — unified bar, morph toggle, dual-overlay system,
  transition mask. Themed via `--nav-*` custom properties + `data-nav-theme`:
  - `paper` (contact/programs/news): parchment glass, ink text, gold accents
  - `hero` (index/academies): transparent over dark hero → glass on scroll
  - `navy` (library): navy glass, cream text, brass accents
  Overlay A mask colour matches each page's deep tone (indigo/ebony/navy/
  aubergine — same family as the footer themes).
- `public/assets/js/nav.js` —
  - **ScrollDirector**: rAF-throttled scroll-direction detector; 12px dead-zone;
    forced visible at `scrollY < 10` and while menu open; `translate3d` only.
  - **DualOverlayMenu** state machine: `closed → opening → open → closing →
    navigating`; rapid-toggle safe. Open: A wipes in
    (`cubic-bezier(0.76,0,0.24,1)`, ~600ms) → +140ms B slides over A → items
    slide-up+fade with 40ms stagger. Close: reverse.
  - **Route transition engine**: intercept internal links while menu open →
    A wipes back over B → `sessionStorage` flag → navigate under mask → target
    page boots covered → mask slides away after first paint (`pageshow` handles
    bfcache) → flag cleared. 2.5s failsafe.
  - **A11y layer** (ported from layout.js, hardened): focus trap, Escape,
    scroll lock, `aria-expanded`/`aria-controls`, focus restore,
    guarded `navigator.vibrate(8)` on toggle.

### Unified header markup (static in each page, no-JS-safe)
Glass bar: crest + wordmark (+ sub) | optional desktop links | pill CTA |
morphing hamburger→X toggle. One identical snippet per page; per-page config
via data attributes (wordmark title/sub, CTA label/href, active path, extra
in-page links for the menu — index gets About/Academics/Gallery).

### Deletions
- Old headers: index Tailwind header; `.bic-site-nav` blocks on 4 lux pages +
  academies inline nav CSS.
- ~180 duplicated nav/menu rules across contact/library/news/programs/home.css.
- `layout.js` menu machinery (markup + behaviour) — keeps footer/year/sitemap.
- `enableStickyHamburger`, `#hamburgerSticky` clone, per-page `.scrolled`
  listeners, home menu variant.

### Design decisions (flagged for owner)
- admin.html **excluded** by default (app shell with own top bar).
- BIC text trigger retired → morphing hamburger→X pill (wordmark carries
  identity).

## Execution order
1. Build `nav.css` + `nav.js`; pilot on contact.html.
2. Port news / library / programs / academies.
3. Rebuild index.html (retire Tailwind header + home variant).
4. Cleanup sweep: layout.js slim-down, dead CSS/JS removal.
5. Validate: jsdom suite (aria/focus/transition flag), HTTP + link checks,
   manual QA: rapid toggle, fast scroll, resize, back button, bfcache, no-JS.
6. Docs (CHANGES.md) + commit.

## Constraints honored
- transform/opacity only (GPU), no layout-property animation
- luxury easings: `cubic-bezier(0.76,0,0.24,1)` wipes,
  `cubic-bezier(0.16,1,0.3,1)` content entrances
- body scroll lock while menu active
- focus trap + Escape + aria-expanded/aria-controls
