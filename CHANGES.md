# Consolidation Change Log

**Branch:** `arena/01a0f4e7-schoolsite` · **Date:** 2026-10-01
**Base:** 86f0391 ("Remove leftover bifa_real and sitte_real")

Companion to `AUDIT-REPORT.md`. All Phase-2 decisions were approved by the
project owner and applied as follows.

---

## 1. New unified structure (created)

```
server.js                  single Express server for the whole site
package.json               single dependency set (express 5, multer 2, …)
.env.example               all env vars documented, no secrets
public/
  index.html               Home (from sitte/index.html)
  programs.html            (from programs/index.html)
  contact.html             (from sitte/contact.html — the newer variant)
  news.html                (from news/index.html)
  library.html             (from st-aurelius-library/index.html)
  academies.html           pre-built self-contained BIMA/BIFA page
  admin.html               gallery staff panel (from sitte/admin.html)
  assets/css/              tokens.css + home/contact/programs/news/library/admin.css
  assets/js/               layout.js + home/main/contact/programs/news/library/admin.js
  assets/img/              logo.png, bifa.jpg, programs photos, gallery/ (131 photos)
  assets/media/            hero.mp4, hero-desktop.mp4, hero-desktop.jpg, heroo.jpg, princi.jpg
  assets/uploads/          news article uploads (runtime, git-ignored content)
  assets/library/          library PDF uploads (runtime)
data/
  gallery-data.json        paths rewritten images/* → assets/img/gallery/*
  news/posts.json, news/config.json
  library/catalog.json
```

## 2. Shared components extracted

- **`assets/js/layout.js`** — the site map (`BIC_SITEMAP`) is now the single
  source of every cross-page link. Pages carry a `<div data-bic-menu=…>`
  placeholder; layout.js injects the menu markup (both visual variants),
  marks the current page `aria-current="page"`, wires open/close behaviour
  (focus trap, scroll lock, Escape/overlay), and fills footer years.
- **`assets/css/tokens.css`** — central design tokens: brand palette,
  silent-luxury palette, typography, motion, menu z-index/timing.
  Identical `--bic-*` token blocks removed from contact/news/library CSS.
- Per-page inline `<style>`/`<script>` blocks extracted into external
  `assets/css/*.css` / `assets/js/*.js` (each former block wrapped in its own
  IIFE; this also fixed a latent bug on the home page where two inline
  scripts both declared top-level `const observer`).
- All hard-coded `http://127.0.0.1:{2020,3030,4040,5050,6060,8080}` links
  removed; dead links to `/prototypes.html`, `/prottt.html`,
  `/NewsPage.html` repointed to real pages.

## 3. Servers merged into one (`server.js`)

- **Contact:** main server's nodemailer endpoint + the standalone backend's
  `express-rate-limit` (5 msgs / 15 min) and CORS allow-list (`ALLOWED_ORIGINS`).
- **Gallery admin:** former `/admin-api.php` route contract moved to
  `/api/gallery` (public GET + token-authed admin actions); admin.html's
  `API_BASE` updated. Uploads land in `assets/img/gallery/`.
- **News:** full posts CRUD, session login (session-file-store), image
  uploads → `assets/uploads/`, served at `/assets/uploads/…`.
- **Library:** staff login with lockout, PDF upload → `assets/library/`,
  catalog in `data/library/catalog.json`; upload route renamed
  `/upload` → `/api/library/upload` (page JS updated).
- **Dropped:** helmet CSP (it would break the Tailwind/esm.sh CDNs used by
  the pages), the non-functional `NewsPage_v2.html` catch-all route, and the
  gallery demo-fallback referencing never-existing `gallery1*.jpg`.

## 4. Academies page

- `bifa/` React project built via its own `scripts/build-standalone.mjs`
  → shipped as self-contained `public/academies.html` (72 KB).
- Before building: `content.js` asset refs fixed (`/logo.png`, `/bifa.jpg`
  had no `public/` dir to be served from → now `/assets/img/…`); previously
  disabled nav links wired to `/news.html` and `/library.html`.
- React source, Vite config and GH-Pages workflow removed per decision 4(a).

## 5. Assets & data

- **42 gallery images** referenced by `gallery-data.json` but missing from
  disk were **restored from `rerd.zip`** (verified byte-for-byte against the
  JSON refs), then the 45 MB zip was deleted.
- 89 referenced images copied from `sitte/images/`; gallery paths rewritten.
- **71 orphan images** (uploaded but referenced nowhere) purged per decision 6.
- Logo deduplicated 3× → 1 (`assets/img/logo.png`; the three copies were
  md5-identical). `bifa.jpg` sourced from `bifa/bifa.jpg`.
- Hero media + principal photo → `assets/media/`; programs photos → `assets/img/`.

## 6. Deleted (junk / dead code / superseded)

| Removed | Reason |
|---|---|
| `rerd.zip` (45 MB) | stale backup; needed images recovered first |
| `testing/` | older homepage prototype; hero video byte-identical to sitte's |
| `sitte/backup-1.html` | stale index copy |
| `sitte/server.clean.js` | empty file |
| `sitte/admin-api.php` | legacy PHP, superseded by Node route |
| `sitte/backend/`, `sitte/api/contact/` | duplicate contact backends (merged) |
| `contact/` | older duplicate of sitte/contact.html |
| `news/node_modules/` (1,306 tracked files) | committed dependencies |
| `news/.env` | committed secrets — now untracked; **rotate those credentials** |
| `bifa/`, `sitte/`, `news/`, `programs/`, `st-aurelius-library/` | consolidated into the unified project |
| broken `--menu-bg: url('her.jpg')` in menu CSS | image never existed |

## 7. Fixes applied along the way

- Typo in home CMS data: "Bodija Internsecational College" → "International".
- `programs.html` contact button fallback `/contact` → `/contact.html`.
- Missing `images/logo.png` on contact/news/library pages → shared asset.
- Missing `images/bifa.jpg` on home/academies → shared asset.
- Library page: removed an orphaned duplicate-menu markup fragment with
  stray closing tags and dead localhost links.
- Admin panel toast/error copy no longer mentions `admin-api.php`.
- multer upgraded 1.4.5-lts → 2.x (patched CVE line); Express unified on v5.

## 8. Validation performed (Phase 4)

- `node --check` on every JS file.
- Server started; all 7 pages + all CSS/JS/media assets → HTTP 200.
- API tests: gallery public/authed reads (401/200), save roundtrip, news
  login/session/logout, library staff login, contact 503-without-SMTP
  behaviour, health check.
- Automated link check of every local reference in HTML/CSS/JS → all resolve.
- jsdom render tests: menu injection + 6 correct links + correct
  `aria-current` on every page; no menu on admin/academies (as designed).
- Debug `console.log` statements stripped from page scripts.

## 9. Known follow-ups for the owner

- **Rotate the credentials** that were committed in the old `news/.env`
  (they remain in Git history): admin password + session secret.
- Fill `.env` with real SMTP credentials, `ADMIN_TOKEN`,
  `NEWS_ADMIN_PASSWORD`, `STAFF_PASSCODE`, `SESSION_SECRET`.
- Supply a real BIFA photo (`content.js` uses a placeholder plate by design)
  and hero slideshow image "her.jpg" was intentionally not recreated.

---

# Phase 5 — Visual Design & Aesthetic Consistency refinement

Plan of record: `VISUAL-REFINEMENT-PLAN.md` (approved, incl. font/nav/footer
decisions). Scope: index, contact, programs, news, library, admin pages.
`academies.html` deliberately untouched (self-contained, already on
Fraunces/Inter).

## 1. Typography unified — 3 families

- **Inter** (body/UI), **Cormorant Garamond** (editorial display; small-caps
  kickers replace the retired Cormorant SC), **Fraunces** (statement/hero).
- Retired across pages + JS: Montserrat, Playfair Display, Libre Baskerville,
  DM Sans, Josefin Sans, Raleway, Poppins, Quicksand, Abril Fatface,
  Cormorant SC/Infant.
- One canonical Google Fonts link per page; dead duplicate Tailwind font
  configs deleted (index.html); ~34 inline `font-family` attributes purged
  from index.html; font-loader `.fonts-loaded` rules retargeted.

## 2. Design tokens — single source of truth

- `tokens.css` rewritten: canonical palette, 8px spacing grid (--space-1..8),
  radii 4/8/12/20/pill, 5-step warm shadow scale, motion + type scales,
  `--bic-*` compatibility aliases.
- `contact.css` (`--lux-*`), `news.css` (navy palette), `programs.css`
  (unprefixed set) remapped to canonical `var()` references — news drops its
  divergent navy/parchment drift and shares the site palette.

## 3. Shared footer — one component, five pages

- `public/assets/css/footer.css` + `footerHtml()/injectFooters()` in
  `layout.js`; pages carry a single `<div data-bic-footer data-bic-sub="…">`
  placeholder. News keeps `href="#admin" id="adminTrigger"` so its admin
  modal still binds (script order guarantees injection first).
- Removed ~120 duplicated/drifted footer rules from contact, news, library,
  programs and home CSS. Footer is now pixel-identical site-wide.

## 4. Layout constants

- Nav unified at **68px** (home moved 80→68, `h-20` → `h-[68px]`).
- Container 1120px and gutter come from tokens everywhere; Tailwind brand
  palette remapped (cream #F3EFE5, stone #E4DCCB).

## 5. Validation performed (Phase 5)

- `node --check` on all JS; CSS brace-balance audit on all 9 stylesheets.
- jsdom suite: menu injection + footer injection on all 5 pages — placeholder
  consumed, subtitles correct, Discover → `/index.html#about`, Staff Login
  targets correct (`/admin.html`, `#admin`+`#adminTrigger` on news), admin
  page verified footer-free. **48/48 assertions pass.**
- HTTP check: 26 URLs (8 pages + 18 assets) → 0 failures; API fetch targets
  (gallery, assets) → 200.
- Link audit: 44 internal references → 0 missing; 0 retired font families
  remain outside `academies.html`.

---

# Phase 6 — Typeface reinstatement (kill the template look)

Inter / Cormorant Garamond / Fraunces read as generic AI-template fonts and
were retired site-wide — including `academies.html`, re-skinned in Phase 6b
below. Four original faces reinstated with strict roles:

| Role | Family | Where |
|---|---|---|
| `--font-ui` chrome | **Montserrat** (300–800 + italics) | nav, menus, buttons, kickers, labels, wordmarks, form UI |
| `--font-body` prose | **Quicksand** (300–700) | body copy, article text, inputs, long-form |
| `--font-display` editorial | **Libre Baskerville** (400/700 + ital) | all headings, quotes, serif moments |
| `--font-statement` hero | **Abril Fatface** (400 only) | hero headline + footer tagline |

## Changes

- `tokens.css`: new 4-family stack; `--font-ui` added; `--bic-font-sc`
  small-caps/kicker alias now resolves to Montserrat.
- `components.css`: headings pinned 700 (Libre Baskerville has no 600);
  buttons + kickers → Montserrat; `.t-statement` weight pinned 400
  (Abril Fatface is single-weight).
- `programs.css`: `--font-sc` → Montserrat; `.year-label` moved to Montserrat
  (a 13px UI label, not editorial display).
- `news.css` / `home.css` / `admin.css`: literal families remapped with
  per-role triage (body → Quicksand, chrome → Montserrat, display → Libre
  Baskerville). Removed a stray `@import` of Cormorant SC from home.css and
  swept 23 dead old-home-footer rules (`.site-footer`, `.footer-*`,
  `.office-list`, `.btn-designed`) — the shared injected footer replaced them.
- All 6 pages: single canonical Google Fonts link (4 families).
- Tailwind configs (index/admin/library): `display`→Libre Baskerville,
  `statement`→Abril Fatface (new key), `brand`/`sans`→Montserrat,
  `serif`→Libre Baskerville. Hero H1 switched to `font-statement font-normal`;
  serif heading weights normalised to real 400/700.
- `news.js` toast → Montserrat; index font-loader → Libre Baskerville.

## Weight discipline

Libre Baskerville (400/700) and Abril Fatface (400) are the only available
weights — no rule synthesizes 300/500/600 on either. Montserrat/Quicksand are
variable and render every weight natively.

## Validation performed (Phase 6)

- 0 references to Inter/Fraunces/Cormorant remain outside `academies.html`.
- CSS brace-balance audit clean (9 stylesheets); `node --check` clean (all JS).
- jsdom menu+footer suite: 48/48 pass.
- HTTP check: 26 URLs → 0 failures.
- New Google Fonts URL verified to serve valid `@font-face` for all 4 families.

---

# Phase 6b — academies.html re-skin (owner request)

The self-contained academies page (BIMA & BIFA) joined the same 4-family
system. Its embedded `<style>` token block and JS-generated UI were retyped:

| Old | New |
|---|---|
| Fraunces (headings, logo, mobile menu) | **Libre Baskerville** 700 for headings & mobile menu |
| Fraunces hero | **Abril Fatface** 400 — "Cultivating Excellence"; the `<em>` drops its synthetic italic (Abril has none) and keeps its brass colour |
| Inter (body + all chrome) | **Quicksand** for prose (body, hero copy, cards); **Montserrat** for chrome (nav links, buttons, badges, footer links, skip-link, toast, error fallback) |
| IBM Plex Mono (kickers, price tags, ledger meta, footer fine print) | **Montserrat** — the tracked-uppercase kicker + ledger role reads sharper in Montserrat and removes a fifth family |

- Font link → the same canonical 4-family URL as every other page.
- Weight discipline kept: headings pinned 700 (LB), hero pinned 400 (Abril);
  no synthesized weights anywhere on the page.
- `--font-mono` token retired; `--font-ui` added to the page's local tokens.
- Zero Fraunces/Inter/IBM Plex Mono references remain — the site is now
  100% on the reinstated stack.

## Validation (Phase 6b)

- Embedded CSS brace audit clean; no single-weight-face synthesis violations.
- HTTP 200 + all internal refs resolve; jsdom suite still 48/48.

---

# Phase 7 — Footer rebuilt on the original landing-page model + lighter "BIC"

## 1. Footer (owner direction)

The Phase-5 shared footer was modelled on the contact-page footer. Per owner
review, the **pre-unification landing-page footer was the strong original** —
the others were weaker copies. The shared footer is now rebuilt on that
model (`footer.css` rewritten, `layout.js footerHtml()` rewritten):

- Deep indigo `--color-brand` (#05014A) field instead of warm black.
- Single editorial column: logo + "Bodija Int'l College" wordmark (Libre
  Baskerville small-caps) with the "Success through Labor" line →
  uppercase kicker "How we make it happen" → the big **Abril Fatface**
  statement *"Building / deep human / connection / that sparks / success"*
  (50px, 0.92 leading, drop-shadow, exactly as on the old landing page) →
  mission **and** vision paragraphs (the old footer had both; the Phase-5
  footer had dropped the vision) → four social circles (**Dribbble restored**)
  → contact row "We'd love to hear from you — bicbis95@gmail.com" beside the
  stacked Abril tagline → copyright bar with Staff Login.
- Removed from the Phase-5 design: address block, city list, "Discover our
  values" link, per-page `data-bic-sub` subtitles. The `footerHtml(sub)`
  parameter is kept (defaults to the tagline) should a page ever need it.
- `.social-circle` styles moved into footer.css (shared by the footer and the
  home mobile menu); the dead `--footer-yellow` hover reference is gone.
- Staff Login contract unchanged: `/admin.html` everywhere, `#admin` +
  `#adminTrigger` on news.

## 2. Solitary "BIC" marks lightened (owner direction)

Every place "BIC" appears alone was too heavy; all reduced:

| Element | Before | After |
|---|---|---|
| index loader crest `.bic` | 700 | 400 |
| index nav `.brand-btn` | 700 | 400 |
| `#hamburger` triggers (contact/library/news/programs) | 600 | 400 |
| `.bic-logo-mark` / `.logo-mark` (mobile menu header) | 500 | 400 |
| news admin `.adm-bic` / `.adm-topbar-bic` | 900 | 500 |
| admin panel BIC badges (×2) | bold | medium |
| programs decorative `.cta-bg-text` | 700 | 400 |

## Validation (Phase 7)

- jsdom suite rewritten for the new contract: statement lines, tagline,
  kicker, email, 4 socials, staff-login targets, old elements gone —
  **75/75 pass** across all pages.
- CSS brace audit clean; 26-URL HTTP check 0 failures; zero references to
  retired footer classes remain.

---

# Phase 8 — Per-page footer colour schemes + academies fully integrated

## 1. Footer colour now complements each page (owner direction)

The footer is themed through custom properties
(`--footer-bg/-heading/-text/-muted/-faint/-line/-accent/-circle-*`) with a
modifier class chosen via `data-bic-footer-theme` on the placeholder:

| Page | Page palette | Footer scheme |
|---|---|---|
| index | brand indigo + yellow | **landing indigo** (default, kept as-is per owner) |
| contact / programs / news | warm parchment + ink + gold | `--warm`: ebony `#141210`, warm-cream text, gold accent |
| library | midnight navy `#0b1220` + brass gold | `--navy`: navy field, cream text, brass `#c59b53` accent |
| academies | aubergine ink + brass | `--academies`: `#15122b` field, cream text, brass-light accent |

`layout.js footerHtml()` reads the theme attribute and applies the class.
Structure/copy identical everywhere — only the palette shifts.

## 2. academies.html joined the unified system (owner direction)

- **Unified footer** injected via `layout.js` with the `academies` theme;
  the page now links `tokens.css` + `footer.css`.
- **Header refactored to the shared lux pattern**: 68px fixed
  `bic-site-nav` with the lightened Montserrat "BIC" hamburger trigger,
  "Bodija Int'l Academies / BIMA & BIFA" wordmark and an Enroll CTA.
  Transparent over the dark hero; paper + ink once scrolled (small inline
  scroll listener replaces the retired React behaviour).
- **Shared slide-over menu** (`data-bic-menu="lux"`): same ebony panel,
  Libre Baskerville items and site-wide links as every other page; the
  page-local menu CSS was ported into the inline stylesheet, so the page
  remains single-file.
- React `Nav` and `Footer` components retired from `App` (their markup,
  mobile-menu CSS and 14 dead nav rules removed); the static in-`#root`
  content remains as the no-JS/CDN-failure fallback, minus its own nav
  (the unified header is static HTML and therefore always present).

## Validation (Phase 8)

- jsdom suite extended to academies + footer-theme assertions:
  **95/95 pass** (menu + themed footer + contract on all 6 pages).
- Inline `<style>` and all 9 stylesheets brace-balanced; layout.js syntax OK.
- 26-URL HTTP check → 0 failures; academies serves the unified header,
  menu placeholder, themed footer placeholder, footer.css and layout.js.

---

# Phase 9 — Bugfix round (owner-reported)

## 1. Contact page rendered blank (CRITICAL)

`contact.js` wrote `document.getElementById('year').textContent` at the top
of the file (twice). Since the footer rebuild, `#year` only exists once
`layout.js` injects the shared footer at DOMContentLoaded — so the script
threw immediately and **the rest of contact.js (incl. the reveal logic)
never ran**, leaving every `.reveal` section at `opacity: 0` (blank page).
Both writes are now null-guarded (`layout.js fillYears()` already owns the
year). Verified: jsdom boots contact.html with 0 errors, 3/3 reveals visible.
Same guard audit done for programs/news/library/main — all safe.

## 2. Academies "standard version" note + stacked footer

- The static fallback `<footer class="site-footer">` inside `#root` (the
  no-JS safety net) stacked over the unified footer whenever React hadn't
  mounted yet. It is now **removed** (+ its 7 CSS rules) — the unified
  footer is the only footer.
- The mount watchdog was a single 6s shot, but the interactive build pulls
  React/three/framer-motion from esm.sh and a cold load can legitimately
  exceed 6s. It now polls for 12s, only then shows a softer "still loading"
  note (`#bic-std-note`), and the module removes the note if the app mounts
  late. Added `<link rel="preconnect" href="https://esm.sh">` to shave
  import latency.
- If the note persists permanently in a given browser, esm.sh is unreachable
  from that environment (page degrades to the static standard version by
  design). The module script itself was verified clean: syntax check, and a
  stubbed-CDN jsdom execution reaches `render()` with no errors.

---

# Phase 10 — Cinematic unified navigation + dual-overlay menu/transitions

## What landed

**One nav bar, everywhere.** A single reusable `<header class="bic-nav">`
now renders on index, contact, programs, news, library and academies —
identical hierarchy, padding, blur and branding on every page. admin.html
stays nav-free by design. The bar carries the crest + wordmark, a JS-filled
desktop link row, a page CTA, and a **morphing hamburger→X toggle** (the old
"BIC" text trigger is retired). Glassmorphism via backdrop-blur, micro-border,
clean type — themed per page through `data-nav-theme`:

| page | theme | CTA |
| --- | --- | --- |
| index | hero | Get In Touch → /contact.html |
| contact / programs / news | paper | Home → /index.html |
| library | navy | Home → /index.html (+ Staff auth controls preserved) |
| academies | hero-dark | Enroll → #enroll |

**Smart scroll director.** `nav.js` runs an rAF-throttled scroll director
(transform-only `translateY(-110%)` hide) with an accumulator threshold
(~12px): down-scroll past 90px hides the bar, any up-scroll or `scrollY ≤ 10`
shows it. The bar is pinned visible at the top and while the menu is open.
No layout thrash — reads `scrollY`, writes one class, batched in rAF.

**Dual-overlay menu = page-transition engine.** `nav.js` injects
`#bic-menu` with two overlays — **A** a blank mask, **B** the content panel
(links with numbering + stagger, socials, CTA, fine print). Opening sweeps A
in, then B over it with items staggering up 40ms apart. Clicking an internal
link: preventDefault → the panel sweeps left **under the still-covering
mask** → a `sessionStorage` flag is set → the route changes under a
full-screen cover (`html.bic-is-transitioning::after`) → the arriving page
reveals from beneath the mask. Escape closes, focus is trapped and restored,
`aria-expanded`/`aria-controls`/`role=dialog` are wired, body scroll locks.

## Performance & a11y
- Motion uses **transform/opacity only** (no left/top/width/height).
- Luxury easing `cubic-bezier(0.76,0,0.24,1)` for wipes; entrances use
  `cubic-bezier(0.16,1,0.3,1)`.
- Full `prefers-reduced-motion` fallback (instant states).
- Focus trap + Escape + focus restore + `aria-modal` dialog semantics.

## Removed (dead/legacy)
- layout.js menu markup + behaviour (~230 lines) — now footer/years only.
- Old per-page nav CSS in home/contact/programs/news/library (~40–140 rules
  each) and the duplicate BIC_SITEMAP.
- `enableStickyHamburger` floating-clone systems in contact/news/programs JS.
- The Tailwind header on index.html, the inline menu.js scripts, and the
  `data-bic-menu` placeholder mechanism.
- academies' static `.bic-site-nav` block + its inline nav CSS/scroll script.

## Verification
- jsdom boots all 6 nav pages: unified header, 6-link sitemap, dual-overlay
  menu, open/close/escape/scroll-lock, navigation-under-mask flag flow,
  rapid-toggle + fast-scroll + resize stress — all green.
- validate_refine suite extended to assert the new nav (113 assertions pass).
- All 7 pages return HTTP 200; internal link sweep clean.


## Phase 10 revision round (owner feedback)

1. **Overlay choreography corrected — everything from the left.**
   Open: the blank mask wipes in **from the left**, then (+120ms) the menu
   panel wipes over it, also from the left. Navigate: the same blank mask
   wipes in again from the left **over** the open panel, the route changes
   under it, and the cover slides away **to the right** revealing the
   destination page. Close: reverse sweep back out to the left. The old
   right-entrance / panel-sweeps-left choreography is gone.
2. **Menu panel restyled on the original landing-page menu.** The heavy
   treatment (serif labels, numbering, bordered rows, pill CTA, fine print)
   is replaced by the landing menu's own look: Montserrat weight-300 links
   at `clamp(28px, 9vw, 56px)`, `0.6px` letter-spacing, muted colour rising
   to the theme highlight with a 4px nudge on hover, generous vertical
   rhythm, socials in the footer. Background is now a **solid colour** per
   theme (no image/gradient). "On this page" anchors keep the same voice at
   a smaller size.
3. **Logo ring removed** from the nav bar — the crest is now bare.
4. The transit flag now carries the departing page's theme id, so the
   cross-page cover matches the mask colour exactly (paper/hero/hero-dark/
   navy) instead of a single neutral tone.

Verified: rebuilt jsdom suite — 202 assertions across all 6 pages
(structure, left-entrance classes, under-cover navigation with theme flag,
snippet → arrival right-slide reveal, scroll director, 40-click toggle
storm, scroll barrage, resize) — all passing.

## Phase 10 fix round — landing page (owner-reported)

1. **Nav no longer ghosts over the opened menu.** While opening, the bar
   (z-index 1200, above the panel) used to fade its glass background and
   light hero-theme text out over ~300ms — a visible ghost over the dark
   panel, most obvious on the landing page. `.bic-nav--open` now vanishes
   instantly (transition reduced to transform, children `transition: none`)
   and stops intercepting clicks entirely (`pointer-events: none`, with the
   toggle re-enabled). The smooth fades return on close.
2. **Landing section links fixed.** Menu items pointing at same-page
   sections (#about / #academics / #gallery / #contact / #home) no longer
   rely on the browser's native hash jump — unreliable right after the body
   scroll-lock releases (notably Safari/iOS). The click is intercepted: the
   menu closes, then the page glides to the section via `scrollIntoView`
   400ms in, with the hash synced via `history.replaceState`.
   `prefers-reduced-motion` jumps instantly. Landing sections get
   `scroll-margin-top: 76px` so headings clear the fixed bar.

Verified: 20 focused assertions (anchor interception, scroll spy, hash
sync, CSS vanish contract) plus the full 202-assertion suite — all green.

## Phase 10 diagnosis round — invisible first overlay + "weird border"

Careful diagnosis (this replaces the reverted guess in 6a46c3d):

**Symptom 1 — the blank overlay never gets seen on the landing page.**
Two compounding causes:
- The panel started only **120ms** after the mask, and with the luxury
  easing `cubic-bezier(0.76,0,0.24,1)` the mask had covered just **5.3%**
  of the screen by then — a sliver, not a readable blank cover.
- The hero-theme mask colour (#05014a) was near-identical to the
  landing hero's dark slate, so even the sliver blended in.

Fix: the panel now waits **340ms**, by which time the mask has wiped to
~81% coverage — the blank overlay clearly arrives on its own before the
menu rides over it. The hero mask deepens to #02001f so the sweep reads
against the hero. Item stagger (500ms + 40ms), group title (700ms) and
footer (740ms) retimed to land after the panel's wipe.

**Symptom 2 — the "weird border" on the overlay.** The landing panel is
the only one that overflows (11 links ≈ 980px vs a ~700–900px viewport)
and nothing styled its scrollbar — the browser's default light bar
rendered as a bright stripe down the right edge of the dark panel.
Fix: themed slim scrollbar (6px, `--menu-line` thumb, transparent track,
accent on hover; `scrollbar-width: thin` for Firefox).

Verified: 202 + 20 assertions green; timing probe confirms 340ms panel
delay and 81% mask coverage at panel launch.

## Phase 10 polish round (owner notes)

1. **Mask colour restored.** The hero-theme blank overlay reverts from
   the experiment (#02001f) back to its original #05014a (transit cover
   included). The readability fix stays — it came from the 340ms solo
   window, not the colour.
2. **Nav never appears over the menu — real root cause found.** The
   vanished-bar overrides on `.bic-nav--open` had ONE-class specificity
   while `.bic-nav.bic-nav--scrolled` has TWO — so after any scroll the
   opaque glass background out-cascaded `background: transparent` and
   the bar sat visibly over the panel on every page. The open state is
   now `.bic-nav.bic-nav--open` (wins the cascade), with transform
   pinned and transitions disabled so a hidden bar snaps rather than
   drops in. The floating toggle also recolours to the menu palette so
   the close button stays legible over every dark panel.
3. **Timing consistency proven site-wide.** A real-CSS probe boots all
   six pages: panel delay computes to 340ms on every page (one shared
   stylesheet + one set of JS constants — no page-specific timing
   exists), and the scrolled+open bar computes transparent everywhere.

Verified: 202 + 20 assertions green, 6-page computed-style probe clean.

## Phase 10 fix round — contact/news menu-open glitches

**Root cause (not the header).** contact.css and news.css carried a
legacy lux rule `html, body { height: 100% }` — the ONLY two pages
with it, and the only two pages glitching. When the menu locks scroll
(overflow:hidden on html+body), body clips its tall content to its
100%-height box and html is exactly viewport-sized, so the document's
scrollable range collapses and the browser clamps the scroll offset to
0 — the page snaps to the top while the mask is still sweeping in.
Contact: "goes back to the hero". News: "content disappears / elements
shift" (same snap, plus scrollbar reflow). Pages without the rule keep
their scroll position through the lock, hence no glitch elsewhere.

**Fixes**
- Removed `html, body { height: 100% }` from contact.css and news.css
  (dead legacy: no layout depends on body height; every remaining
  height:100% resolves against a sized parent).
- Belt and braces: nav.js preventScroll now records scrollY on lock and
  restores it on unlock if the browser clamped/lost it.

**Header approach note.** The overlays already visually cover the
header (bar contents vanish instantly; opaque panel above everything
but the floating close toggle). Flipping z-order to literally park the
header under the overlays would bury the toggle — the only mobile close
button — forcing it to be relocated for zero visual gain, so the
current model stays; the glitches had a different cause (above).

Verified: new 18-assertion scroll-lock guard probe (both pages, real
lock/unlock with simulated clamp) + 202 + 20 suites green.

## Stock photography — relevant images on Programs and Academies

The Programs page's six "Capstone Examples" cards and the two Academies
photographs carried generic stock imagery that had nothing to do with
their captions (a circuit board, laptops for a water monitor, a
bookshelf, an office meeting). Each slot now shows its own subject.

**Changed**
- Programs capstone cards: a robotics workbench (Autonomous Field
  Drone), stream water sampling (Smart Water Monitor), a painted
  community mural, students reading in a library (Student Literary
  Magazine), a student team at a whiteboard (Start-up Launch), and a
  finance/management workshop (Financial Literacy Workshops).
- Academies: the hero background is now an athletics track; the BIMA
  panel shows a film crew setting up a studio shoot.
- All eight are free-license Pexels photographs (commercial use, no
  attribution required). The photographer is credited in a comment
  beside each image, and the slots are listed in
  FEATURE-INVENTORY-AND-SCHOOL-REQUIREMENTS.md §1.10, with B9 asking the
  school to swap in real BIC photographs of the same subjects.
- `server.js`: the CSP `img-src` now also allows
  `https://images.pexels.com` (unsplash stays for the two server-side
  fallbacks below).

**Deliberately left alone:** `bifa.jpg` and the three programme header
images are real school photographs, not stock.

**Still generic, in the server rather than the pages:** the automatic
image substituted when staff publish a news post or upload a library
book with no picture of their own. Noted in §1.10 for replacement.

Verified: all eight CDN URLs resolve; both pages serve 200 with the new
sources and the widened CSP; no `images.unsplash.com` reference remains
in `public/`.

## Gallery and library dialogs sat under the fixed nav

**Root cause.** Both visitor dialogs ship a low Tailwind z-index — the
homepage gallery lightbox `z-[60]`, the library reader `z-50` — while the
unified nav is `z-index: 900` (nav.css). The nav therefore painted over
the top strip of each dialog, precisely where its close control sits
(`#lbClose` at `top-6 right-6`; the library's `#lightbox-close` in the
top toolbar), and swallowed the click. This is the reported "can't close
the gallery viewer" symptom: a layering bug, not a script bug.

**Fix**
- `components.css` (shared by every page): `#lightbox { z-index: 950 }` —
  above the nav (900), below the menu overlays (mask 1000 / panel 1100),
  the page-transition cover (9000) and the loading overlay (9999). No
  Tailwind rebuild needed; an id selector outranks the utility.
- Staff surfaces with the same latent shape were left alone and are
  reported separately: the gallery admin drawer (`.admin-drawer` 800,
  scrim 799) and the library admin modal (`.admin-modal` 60).

Verified: the rule is in the served stylesheet, `tokens:check` in sync,
`audit:site` unchanged. Browser confirmation still outstanding (no
browser in this environment); the layering itself is arithmetic —
950 clears the nav's 900.

## Visual-refinement polish: audited item by item, gaps closed

**Root cause.** `VISUAL-REFINEMENT-PLAN.md` §3 lists nineteen polish items;
several had been implemented only as far as *remapping* — page-local token
sets were aliased to the central tokens but never deleted, so every page still
carried a second vocabulary (`--lux-*` on contact, `--ink/--parchment/--gold`
on programs, a 23-value shim on news, three hardcoded `:root` blocks on home).
Three items were genuinely unfinished: the hero CTA pair still fell back to a
shared-button look because its designed styles lived in the dead inline
`text/tailwindcss` block, the programs page still ran its own button system,
and the library's JS-rendered cards used utility classes the build never
compiled. The audit also turned up visitor-visible defects the polish list
never mentioned — a duplicated gallery lightbox, eleven orphaned reveal
elements, and five CSS variables that no file ever defined.

**Fixes**
- **Hero CTAs (index).** The blue-block `.btn-primary` override in `home.css`
  is replaced by the designed pair scoped to `#home`: gold pill with a shine
  sweep, glass ghost secondary. Because it is scoped, the enquiry form's
  submit button keeps the shared brand-indigo pill instead of inheriting the
  hero treatment. The unscoped `≥1024px` primary/secondary rules that leaked
  the hero's yellow hover shadow onto that button are scoped too.
- **Gallery lightbox de-duplicated.** `main.js` carried a second 89-line
  implementation of the same dialog that `home.js` already drives. Both are
  loaded on index.html, so each click advanced two independent states (counter
  drift), two preloaders raced for the spinner, and an inline `opacity` set on
  the loader could latch it visible. `home.js` is now the sole owner.
- **Orphaned reveals (index).** Eleven elements — including the “Life at BIC”
  heading, the contact heading and the enquiry submit button — carried
  `reveal opacity-0`, but `.reveal` is defined only in the contact, news and
  programs sheets, and index's observers drive `.bic-reveal`. Converted to
  `.bic-reveal`; contact/news/programs were checked the same way and are sound.
- **Card standard (§3.4).** `.project-card` and `.sidebar-card` now use
  surface + border token + radius-lg + shadow-1 → shadow-2 on hover;
  `.hero-card` takes the materials but keeps its deliberate shadow-3 elevation.
- **Buttons (§3.3).** Programs' `.btn` / `.btn-gold` / `.btn-outline-dark` and
  home's dead `.btn-submit` are retired in favour of the shared trio, with the
  dark-context `.btn-ghost` kept as a page-scoped re-theme. `.btn-close` on
  news remains, documented as a dialog control rather than a CTA.
- **Token hygiene (§3.11–12, 15, 17).** contact's `--lux-*` block, programs'
  two local `:root` blocks and news' 23-value shim are deleted; ~320 references
  now read the central tokens directly. `home.css`'s three hardcoded `:root`
  blocks (including `#D6D3D1`, the arbitrary value §3.7 named) are gone.
- **Void variables fixed.** `--lux-surface-hover` (library card hover),
  `--radius-xl` (news hero panel + article media), `--menu-accent-soft`
  (mobile toggle hover), `--g-100` (form error colour) and `--muted`
  (homepage footer text) were referenced but never defined. A per-page sweep
  now reports zero unresolved custom properties.
- **Library content was uncompiled.** The Tailwind build scanned only
  `library.html`, so the resource grid, skeleton and empty state injected by
  `library.js` had no CSS (`bg-lux-surface`, `border-lux-border`,
  `animate-fade-up`, `aspect-[3/4]`, …). `build.mjs` now scans each page's own
  scripts; the reader's six arbitrary dark hexes became `lux.reader-*` palette
  entries.
- **Type and admin (§3.18, Amendment 1).** 58 hardcoded `font-family` strings
  in news, home and admin CSS are family tokens; the unused `display`/`brand`
  families are purged from the admin build config.
- **Inline styles (§3.5, 14) and library padding (§3.17).** index 48 → 6 and
  programs 15 → 8; every remaining inline `style` on both pages is a `--delay`
  stagger token. The library main container's utility padding and its inline
  `calc(68px + 2rem)` nav offset are `.lib-main` with `--space-*` and
  `--nav-height` (identical pixels).
- **New check.** `npm run verify:polish` (`scripts/verify-polish.mjs`) — a
  jsdom harness asserting the cascade outcomes above across the seven styled
  pages, plus the per-page custom-property integrity sweep.

Verified: `verify:polish` 7 pages / 0 failures (23 assertions), `tokens:check`
in sync, `audit:site` unchanged (same six unfixable advisories), `node --check`
clean on every touched script, HTTP 200 on all ten pages, and the served CSS
carries the new rules. `build:tailwind` is deterministic (a rebuild on the
untouched tree produced no diff). No browser exists in this environment, so the
visual pass over hero, form, cards and reader remains outstanding.

## Second pass — owner-reported items (hero, administration, gallery, admissions)

Nine items were reported against the landing page, the administration section
and the admissions form. Three were defects, not taste:

- **The infinite loader (gallery viewer).** The old viewer latched a
  module-level `isLoading` flag and early-returned from `nextImage()` /
  `prevImage()` while it was set. One slow, failed or *abandoned* image left the
  spinner running forever and made every later Next/Prev click do nothing.
  Reproduced in jsdom (a request that never resolves): spinner still visible
  after 3 s, three further clicks swallowed. The viewer is now a token-based
  state machine — every load settles on `onload`, `onerror` or a timeout guard
  (12 s, overridable per dialog with `data-load-guard`), stale callbacks are
  dropped by token, and navigation is never gated.
- **`NaN / 0` in the count indicator.** That string came from the *duplicate*
  lightbox that used to live in `main.js`:
  `(currentIndex + 1) % currentArchive.length` is NaN for an empty archive. The
  duplicate was removed by the polish pass, but the browser was still running
  the cached copy — `main.js` and `home.js` now carry `?v=2`, and the new
  `verify:lightbox` harness fails if that expression (or any second counter)
  comes back. The new counter is written only from `normalizeIndex()`, which
  clamps a finite integer into `0..n-1` with `n ≥ 1`; an empty archive never
  opens the viewer at all. Brute-forcing nine degenerate archives (empty, null,
  object, string, number, nested, nulls, single, non-JSON) produces no NaN.
- **The close button was overlapped by the header.** Three pages share
  `id="lightbox"` and the unified nav is `z-index: 900` (1200 with its menu
  open). The viewer is now scoped as `#lightbox.lb` at `z-index: 9500` (the
  library reader and admin preview keep their own `#lightbox:not(.lb)` raise),
  and opening it adds `html.lb-open`, which hides the nav and its menu outright
  — so nothing can cover the control in any scroll position or nav state.

Design items, all in the same pass:

- **Hero "Welcome" pill** — whitish frosted glass (`bg-white/10`,
  `backdrop-blur-xl` + saturation, hairline white border, inset highlight). The
  softening comes from translucent fills rather than `opacity` because a
  non-1 opacity on the element (or an ancestor) makes browsers drop
  `backdrop-filter`, which would remove the glass instead of dimming it.
- **Hero CTAs keep their effect when pressed.** `:active` no longer scales the
  button: the yellow pill keeps its surface, its sweep and an inset ring, and
  the glass CTA keeps — actually strengthens — its backdrop blur. The sheen
  overlay also stays out while the primary button is held
  (`group-active:scale-x-100`).
- **Scroll indicator** — the bouncing arrow is replaced by a hairline rail with
  a gold bead travelling down it over a muted chevron, as a real link to
  `#about`, still under `prefers-reduced-motion`.
- **Founder's signature** — "Justice Kayode Eso" in Great Vibes (added to the
  page's single Google Fonts import, which the CSP already allows) on a plate
  inside the portrait's rounded frame; the frame is a `<figure>` with the
  signature as its `<figcaption>`, and it is now `position: relative`, which is
  where the decorative watermark's `inset: 0` was always meant to resolve.
- **Gallery spacing** — section padding `py-12 → py-20/28`, header margin, grid
  `gap-8 → gap-x-8 gap-y-16`, and each category's caption gets a gold hairline
  with 26px of air above and 16px below (`.gallery-caption*`, CSS classes rather
  than utilities because the cards are injected by JS).
- **Admissions "Send Message"** — the button no longer borrows whatever
  `.btn-primary` happens to be: `.btn-send` owns a solid brand surface, a
  hairline border, a shadow, and hover/pressed/focus/busy states.

Because the static handler serves CSS with a 24-hour `max-age`, the three sheets
this pass touched are now requested as `?v=2` from the homepage (and
`verify:lightbox` fails if they stop being versioned) — otherwise a plain reload
would keep showing the old design and the fixes would read as "not done".

Verified: `npm run verify:polish` 7 pages / 0 failures, `npm run
verify:lightbox` 55/55 assertions (including the hung-request reproduction and
the NaN guards), `node --check` clean on every script, `build:tailwind`
regenerated `tw-index.css` with the new utilities before the pages changed
classes, and the server returns 200 on all eight pages with the gallery API
serving 7 categories / 131 images (all present on disk).

### Preview hosting and the headers that blocked it

The site sent `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`, which
is right for production and wrong for any host that embeds the pages in an
iframe on another origin — including the sandbox preview used to review this
work, where the effect was that the fixes could not be looked at at all. Both
headers are now driven by one optional environment variable:
`PREVIEW_FRAME_ANCESTORS` (a CSP source list; `*` covers a preview host whose
parent origin is not known in advance). Unset — the default, and what
production runs with — keeps `'self'` and SAMEORIGIN exactly as before; when it
is set, X-Frame-Options is dropped as well, because a legacy browser obeys the
stricter of the two and SAMEORIGIN cannot express a list. Measured both ways:
with the variable, `frame-ancestors *` and no X-Frame-Options; without it, the
original pair.
