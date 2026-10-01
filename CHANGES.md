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
