# Bodija International College — Unified Website

A single, consolidated Node/Express project for the whole school site:
home, programs, contact, news ("Updates"), digital library, the BIMA/BIFA
academies page, and the staff gallery-admin panel — all served by **one
server** from one clean folder hierarchy.

## Quick start

```bash
npm install
cp .env.example .env   # then fill in real values
npm start              # → http://localhost:4040
```

## Project layout

```
├── server.js               One Express server for the entire site
├── package.json            Single dependency set
├── .env.example            Every configuration knob, documented
├── public/                 Everything served statically
│   ├── index.html          Home
│   ├── programs.html       Our Programs
│   ├── contact.html        Get In Touch (contact form → /api/contact)
│   ├── news.html           Updates + built-in news admin panel
│   ├── library.html        Digital Library + staff PDF upload panel
│   ├── academies.html      BIMA/BIFA academies (self-contained build)
│   ├── admin.html          Gallery management (staff login)
│   └── assets/
│       ├── css/            tokens.css (shared design tokens) + one
│       │                   stylesheet per page
│       ├── js/             layout.js (shared menu/nav injection +
│       │                   behaviour) + one script per page
│       ├── img/            logo.png, bifa.jpg, programs photos,
│       │                   gallery/ (gallery photos)
│       ├── media/          hero videos + posters, principal photo
│       ├── uploads/        news article image uploads (runtime)
│       └── library/        library PDF uploads (runtime)
├── data/                   JSON "database" files
│   ├── gallery-data.json   Gallery model (edited via /admin.html)
│   ├── news/               posts.json, config.json, sessions/ (runtime)
│   └── library/            catalog.json
└── docs-style reports      AUDIT-REPORT.md · CHANGES.md
```

## Shared building blocks

- **`public/assets/css/tokens.css`** — the single source of design tokens
  (brand palette, silent-luxury palette, typography, menu z-index/timing).
  Loaded first on every page.
- **`public/assets/js/layout.js`** — the site map and the mobile menu.
  Pages carry a `<div data-bic-menu="home|lux">` placeholder; layout.js
  injects the menu markup (links included, current page marked
  `aria-current`), wires the open/close behaviour (focus trap, scroll lock,
  Escape/overlay close) and fills footer years. All internal links live in
  one array in this file.

## API surface

| Route | Purpose | Auth |
|---|---|---|
| `POST /api/contact` | Contact form e-mail (SMTP, rate-limited 5/15 min) | — |
| `GET /api/gallery` | Public gallery data | — |
| `GET /api/gallery?action=get_gallery` | Admin read | `X-Admin-Token` |
| `POST /api/gallery?action=save_gallery\|delete_image\|upload_image` | Gallery admin | `X-Admin-Token` |
| `GET /api/posts`, `GET /api/config` | News reads | — |
| `POST /api/login`, `POST /api/logout`, `GET /api/auth/check` | News admin session | password → session cookie |
| `POST /api/posts`, `DELETE /api/posts/:id`, `PUT /api/config/featured` | News admin writes | session |
| `POST /api/staff/login` | Library staff login (5 attempts / 60 s lockout) | passcode |
| `POST /api/library/upload`, `GET /api/assets` | Library PDF catalog | — |
| `GET /api/health` | Health check | — |

## Environment variables

See [.env.example](.env.example). Highlights:

- `PORT` — server port (default 4040)
- `ADMIN_TOKEN` — gallery admin password (`/admin.html`)
- `SMTP_HOST/PORT/USER/PASS`, `TO_EMAIL` — contact form mail delivery
- `NEWS_ADMIN_PASSWORD`, `SESSION_SECRET` — news admin panel
- `STAFF_PASSCODE` — library staff uploads
- `ALLOWED_ORIGINS` — optional CORS allow-list for `/api/*`

The server starts (and serves all static pages) even when optional
credentials are missing; the affected endpoints return 503 with a clear
message and a startup warning is printed.

## Notes

- The academies page (`academies.html`) is a self-contained production
  build of the React/BIFA project; it loads React/Three/Framer Motion from
  esm.sh at runtime and falls back to readable static markup offline.
- `node_modules/`, `.env`, runtime session files and upload directories are
  git-ignored.
