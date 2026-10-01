# Repository Audit Report — `johndoe155/schoolsite`

**Date:** 2026-10-01 · **Branch:** `arena/01a0f4e7-schoolsite` · **Base commit:** `86f0391`
**Scope:** Read-only inventory. No files modified.

The repository is the website of **Bodija International College (BIC/BIS), Ibadan**. It currently
consists of 7 independent mini-projects + 1 backup archive, each with its own server, assets and
copy-pasted navigation. 2,336 files are tracked in Git (~94 MB), of which 1,306 are committed
`node_modules` files.

---

## 1. Folder & Page Map

```
schoolsite/
├── sitte/            34 MB  ★ MAIN SITE ("Bodija International College")
│   ├── index.html           Home (1,548 ln) — Tailwind CDN + inline config + style.css/script.js
│   ├── academies.html       BIMA/BIFA academies page (legacy GSAP-era, 547 ln)
│   ├── contact.html         Contact page, newer variant (visit-date field, async submit, 1,727 ln)
│   ├── admin.html           Staff gallery-admin panel (1,018 ln) → talks to "/admin-api.php"
│   ├── server.js            Express :3000 — static + gallery-admin API + /api/contact (nodemailer)
│   ├── server.clean.js      ⚠ EMPTY FILE (0 bytes)
│   ├── admin-api.php        Legacy PHP admin API — superseded by Node route of same name
│   ├── backup-1.html        Old backup of index.html (2,042 ln)
│   ├── backend/             2nd standalone contact server (:4000, nodemailer)
│   ├── api/contact/         3rd contact impl — Vercel-style serverless, SendGrid
│   ├── gallery-data.json    Gallery model: 131 image refs, ⚠ 42 files MISSING on disk
│   ├── images/              160 gallery photos (22 MB), ⚠ 71 not referenced anywhere
│   └── hero.mp4, hero-desktop.mp4, hero-desktop.jpg, heroo.jpg, princi.jpg, logo.png
│
├── contact/          72 KB  Standalone OLDER contact page (90-line delta vs sitte/contact.html:
│                            no visit-date field, non-async submit) — duplicate, superseded
├── programs/         1.2 MB Static "Explore Programs" page + images/ (logo, science1, arts1, comm1)
├── news/             8.4 MB "BIC News" Express app (:3000 default, env PORT)
│   ├── index.html           3,221 ln, posts rendered client-side from /api/posts
│   ├── server.js            Sessions, admin login, multer uploads, posts.json CRUD
│   ├── data/                posts.json (EMPTY), config.json
│   ├── .env                 ⚠ COMMITTED: ADMIN_PASSWORD=admin123 + SESSION_SECRET
│   └── node_modules/        ⚠ COMMITTED: 1,306 tracked files / 8.2 MB
├── st-aurelius-library/ 4.8 MB "Digital Library" page + Express :3000 server for PDF uploads
│   ├── index.html           2,387 ln; catalog.json is EMPTY
│   └── ⚠ broken nav links + missing images/logo.png
├── bifa/             432 KB React/Vite REBUILD of the academies page (Framer Motion + R3F)
│   ├── vite.config.js       base: '/bifasite/' (GitHub Pages deploy workflow included)
│   └── ⚠ references /logo.png & /bifa.jpg but has NO public/ dir → 404s in dev/build
├── testing/          1.6 MB OLDER prototype of the main page (index-6.html, style-1.css,
│                     script-1.js) + byte-identical copy of sitte/hero-desktop.mp4
└── rerd.zip          45 MB  Old backup of sitte/ incl. node_modules — but ALSO the only place
                             the 42 missing gallery images exist
```

### How the pages relate (navigation)
Every page carries a copy-pasted full-screen "mobile menu" with **hard-coded localhost ports**:

| Menu item      | Hard-coded target       | Real page               |
|----------------|-------------------------|-------------------------|
| Home           | `http://127.0.0.1:4040` | sitte/index.html        |
| Updates        | `http://127.0.0.1:2020` | news/                   |
| Our Programs   | `http://127.0.0.1:3030` | programs/               |
| Get In Touch   | `http://127.0.0.1:6060` | contact page            |
| Digital Library| `http://127.0.0.1:5050` | st-aurelius-library/    |
| BIMA/BIFA      | `/academies.html`       | sitte/academies.html (bifa/ is the rebuild) |

These only work on the original developer's machine with per-folder PORT env overrides
(the servers actually default to :3000 everywhere). **All internal cross-links are broken in any
real deployment.**

---

## 2. Junk & Dead Candidates

| Item | Size | Verdict |
|---|---|---|
| `rerd.zip` | 45 MB | Old sitte backup (incl. node_modules, a stray file named `cd`, old `stylew.css`/`scriptw.js`). **Sole source of 42 gallery images** → restore those, then delete |
| `news/node_modules/` | 8.2 MB, 1,306 files | Committed deps; belongs in `.gitignore` (already listed, but tracked from before) |
| `news/.env` | — | Committed secrets (`ADMIN_PASSWORD=admin123`, session secret) |
| `testing/` | 1.6 MB | Superseded prototype: no BIMA/BIFA menu item, older hero config keys (`desktopVideo` vs `videoDesktop`); `hero-desktop.mp4` md5-identical to sitte's |
| `sitte/backup-1.html` | 96 KB | Stale copy of index.html (no BIMA/BIFA nav item) |
| `sitte/server.clean.js` | 0 B | Empty file |
| `sitte/admin-api.php` | 8 KB | Legacy PHP API; Node server already serves the same `/admin-api.php` route |
| `contact/` folder | 72 KB | Older duplicate of `sitte/contact.html` |
| `sitte/backend/`, `sitte/api/contact/` | — | 2 of 3 competing contact-form backends (see §3) |
| 71 orphan images in `sitte/images/` | ~9 MB | Uploaded via admin but referenced by neither `gallery-data.json` nor any HTML/JS (incl. 7 screenshots/phone-camera strays like `YoGreyMD_w-…`, `Screenshot_2026…`) |
| Demo refs in `sitte/server.js` | — | `images/gallery1*.jpg` fallback entries that never existed on disk |

### Broken references found
- `sitte/index.html` + `academies.html` → `images/bifa.jpg` (**missing**; only exists as `bifa/bifa.jpg`)
- `sitte/contact.html`, `news/index.html`, `st-aurelius-library/index.html` → `images/logo.png` (**missing** in each folder; the same file exists as `sitte/logo.png`, `bifa/logo.png`, `programs/images/logo.png` — all three md5-identical)
- `gallery-data.json` → **42 missing images** (all recoverable from `rerd.zip`)
- `news/index.html` → `/prototypes.html` (exists nowhere)
- Library page → `/NewsPage.html`, `/prototypes.html`, `/prottt.html` (exist nowhere)
- `bifa/src/data/content.js` → `/logo.png`, `/bifa.jpg` with no `public/` dir

---

## 3. Discrepancies & Redundancies

1. **Three competing contact backends** — `sitte/server.js` `/api/contact` (nodemailer),
   `sitte/backend/server.js` (nodemailer, :4000), `sitte/api/contact/index.js` (SendGrid,
   Vercel-style). The live contact page calls `/api/contact`. The main `sitte/package.json` mixes
   deps from all variants (`@sendgrid/mail` **and** `nodemailer`).
2. **Two contact pages** — `sitte/contact.html` (newer: visit-date field, past-date guard, async
   submit) vs `contact/contact.html` (older).
3. **Two academies pages** — `sitte/academies.html` (legacy) vs the full `bifa/` React rebuild.
   The rebuild was clearly meant to replace the legacy page but was never wired in.
4. **Three homepage variants** — `sitte/index.html` (current), `sitte/backup-1.html`,
   `testing/index-6.html` (oldest).
5. **Conflicting CSS approaches** — Tailwind CDN (home/academies) vs hand-rolled design tokens
   everywhere else. The "Silent Luxury" parchment/gold token set is duplicated with **slightly
   different values** in `contact/contact.html` (`#F5F0E8`) and `programs/index.html` (`#F3EFE5`),
   while `news/` uses a third parchment/navy variant (`#FAF8F4`/`#08103A`). Fonts are re-declared
   per page with overlapping families (Cormorant SC/Garamond, DM Sans, Inter, Playfair, Poppins…).
6. **Copy-pasted chrome** — the full-screen mobile menu + footer + social links are duplicated
   verbatim in every page (and already drifting: library still links dead prototype pages).
7. **Logo duplicated 3×** — identical file in `sitte/`, `bifa/`, `programs/images/`.
8. **Express versions skew** — express ^5 (sitte) vs ^4 (news, library); deps also include
   multer 1.4.5-lts (old line).

---

## 4. Proposed Architecture

Single Node/Express project at the repo root; static pages + one shared layout; data kept as
JSON files (current model). BIFA served as a pre-built self-contained page unless you want to
keep the React toolchain (see Q3).

```
schoolsite/
├── package.json              single dependency set (express, multer, nodemailer, …)
├── server.js                 ONE server: static site + /api/contact + gallery admin API
│                             + news API + library API   (PORT from .env)
├── .env.example              (no real secrets in Git)
├── public/
│   ├── index.html            Home
│   ├── programs.html         Programs
│   ├── contact.html          Contact (newer variant)
│   ├── news.html             Updates/News
│   ├── library.html          Digital Library
│   ├── academies.html        BIMA/BIFA (built from bifa/)
│   ├── admin.html            Staff login / gallery admin
│   └── assets/
│       ├── css/  tokens.css + layout.css + per-page stylesheets
│       ├── js/   layout.js (injects shared menu/footer), script.js, per-page scripts
│       ├── img/  logo.png, bifa.jpg, gallery/… (131 used images)
│       └── media/ hero.mp4, hero-desktop.mp4, hero-desktop.jpg, heroo.jpg, princi.jpg
├── data/
│   ├── gallery-data.json
│   ├── news/posts.json · news/config.json
│   └── library/catalog.json
└── docs/AUDIT-REPORT.md      (this file)
```

Shared chrome (mobile menu, footer, `<head>` font/SEO block) extracted once and injected by
`assets/js/layout.js` (or a build-time include), with all cross-links converted to simple
relative paths (`/programs.html`, `/news.html`, …). The hard-coded `127.0.0.1:*` links disappear
entirely.

**Expected result:** ~94 MB → ~30 MB (rerd.zip −45 MB, node_modules −8 MB, dupes/prototypes
−2 MB), 2,336 → ~250 tracked files, zero broken internal links, one server, one design-token set.

---

## 5. Phase 2 — Decisions Needed (numbered questions in chat)

See the accompanying message: 10 questions covering server strategy, the contact-backend choice,
the BIFA React app, gallery-image policy, design-system unification, and secrets handling.
