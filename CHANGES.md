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
