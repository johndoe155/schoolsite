# Bodija International College — Unified Website

A single, consolidated Node/Express project for the whole school site:
home, programs, contact, news ("Updates"), digital library, the BIMA/BIFA
academies page, and the staff gallery-admin panel — all served by **one
server** from one clean folder hierarchy.

## Quick start

Requires **Node ≥ 20.19**.

```bash
# ── The marketing site on its own ───────────────────────────────────
npm install
cp .env.example .env    # then fill in real values
npm start               # → http://localhost:4040
```

The site runs standalone. Portal links will show a "portal is not responding"
page until you also do this:

```bash
# ── …with the portal ────────────────────────────────────────────────
npm run portal:install  # install the portal monorepo's dependencies
npm run portal:build    # build contracts → API → web  (once, or after changes)

npm run portal          # terminal 1: portal API :8080 + web :3000
npm start               # terminal 2: the site :4040, proxying /portal
```

Then open **http://localhost:4040** — one origin for everything:

| URL | What |
| --- | --- |
| `/` | Home and the rest of the marketing site |
| `/portal` | Portal sign-in → your dashboard |
| `/portal/api/v1/health` | Portal API health |
| `/api/health` | Site API health |

`npm run portal` seeds a demo roster the first time it starts. Sign in with
`s1@school.example` / `Passw0rd!` (student) or `admin@school.example` /
`Passw0rd!` (admin — staff accounts are then asked for two-factor setup).

### Portal commands

| Command | What it does |
| --- | --- |
| `npm run portal` | Runs the API and web together; stops both if either dies |
| `npm run portal:build` | Rebuild after changing portal code |
| `npm run portal:reset` | Wipe the dev database and re-seed it |
| `npm run portal:test` | The API suite (256 tests) |
| `npm run portal:smoke` | The web checks (61) — run `portal:reset` first |
| `npm run tokens:sync` | Re-copy `tokens.css` into the portal |
| `npm run tokens:check` | Fail if the portal's token copy has drifted |

The portal runs on **PGlite** (Postgres compiled to WASM, in-process) in
development — nothing to install. Production needs a real `DATABASE_URL`; the
API refuses to boot without it rather than silently falling back. The portal
has ~64 variables of its own, documented in `portal/.env.example`.

For the full picture — why the portal is proxied rather than merged, how the
two session systems coexist, and what was verified — see
[`PORTAL-INTEGRATION-PLAN.md`](PORTAL-INTEGRATION-PLAN.md).

## Deploying to production

Everything runs behind one hostname. Caddy terminates TLS and forwards to the
site, which serves the marketing pages and proxies `/portal/*` onward:

```
caddy:443 → site:4040 ─┬─ /             static public/
                       ├─ /api/*        site's own JSON API
                       ├─ /portal/api/* → api:8080   (NestJS)
                       └─ /portal/*     → web:3000   (Next.js)
```

`web` and `api` are **not** published to the host — they are reachable from
outside only through the site's proxy. One TLS cert, one origin, first-party
cookies for both halves.

```bash
cp portal/.env.example portal/.env    # then fill in every value
cd portal && docker compose up -d --build
```

### Required, or the stack will not start

`docker-compose.yml` uses `${VAR:?}`, so Compose refuses to resolve the file
until these are set: `POSTGRES_OWNER_PASSWORD`, `APP_SECRET` (≥32 chars),
`SESSION_SECRET`, `NEWS_ADMIN_PASSWORD`, `STAFF_PASSCODE`,
`BACKUP_ENCRYPTION_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`.

The site additionally **exits on boot** in production if `NEWS_ADMIN_PASSWORD`
or `STAFF_PASSCODE` is still the published default, or if `SESSION_SECRET` /
`ADMIN_TOKEN` is missing or too short:

```
❌ Refusing to start with NODE_ENV=production:
   • NEWS_ADMIN_PASSWORD is still the published default
```

`PUBLIC_WEB_ORIGIN` **must end with the portal's basePath** —
`https://school.example/portal`. Every invite, password-reset, guardian-verify
and MFA link is built from it, as is Paystack's `callback_url`; a suffix-less
value 404s on all of them. For a root-mounted portal, set
`PORTAL_BASE_PATH=''` and drop the suffix from both.

### Do not skip Caddy

The site's session cookie is `Secure` whenever `NODE_ENV=production`. Express
only sets it when it believes the connection is TLS, which it learns from
`X-Forwarded-Proto`. Behind Caddy that works; **point a browser straight at
`:4040` over plain HTTP and every admin login returns `200` while silently
dropping the cookie** — the admin sees success and is logged out immediately.
Verified: without the header, `cookie set: 0`; with it, `cookie set: 1` and the
`Secure` flag present.

### Forwarding hops

| service | `TRUST_PROXY` | chain |
|---|---|---|
| site | `1` | caddy → site |
| api  | `2` | caddy → site → api |

### Persistent volumes

`site_data` (posts, news config, library catalog, gallery JSON, sessions),
`site_gallery`, `site_uploads`, `site_library`. The site stores its content in
JSON files and its uploads on disk — without these, every gallery image, news
post and library PDF is discarded on the next redeploy.

### What this cannot do

PGlite is a development convenience. The Compose stack uses real Postgres, and
`apps/api/src/db/client.ts` treats PGlite as **fatal** in production. Never
point `DATABASE_URL` away from Postgres in a deployed stack.



```
├── server.js               One Express server for the entire site,
│                           and the single public door for the portal
├── package.json            Site dependencies + portal orchestration scripts
├── .env.example            Every configuration knob, documented
├── portal/                 The portal monorepo (NestJS API + Next.js web).
│                           Own workspace, lockfile and .gitignore
├── scripts/                portal.js (runs both portal processes),
│                           sync-tokens.js (token vendoring + drift guard)
├── .github/workflows/      site.yml + portal.yml
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
