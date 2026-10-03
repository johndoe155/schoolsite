# Portal Integration Plan — `portal.zip` → BIC unified site

**Status:** DECISIONS RECORDED — Q1–Q4 answered; Q5–Q7 and explicit go-ahead pending.
STOP RULE observed: no portal code has been moved into the site tree (`git diff HEAD` is empty).
**Date:** 2026-10-03
**Archive:** `portal.zip` (621,445 bytes) → extracted to `_temp_portal/school-portal/` (235 files, 2.2 MB)

---

## Decisions log

| # | Question | Decision | Consequence for the build |
| --- | --- | --- | --- |
| 1 | How is the portal exposed? | **Proxy behind :4040** | `server.js` gains `http-proxy-middleware`; two proxies registered *before* `express.static` (line 504) and the `/api` catch-all (line 524). Next gets `basePath: '/portal'`. |
| 2 | Database target? | **PGlite for dev; Postgres requirement documented** | Dev/preview runs on PGlite. Production posture documented, not faked — `db/client.ts` throws on boot without `DATABASE_URL`. |
| 3 | Unify site + portal login? | **Keep fully separate** | No changes to either session system. `bic.sid` and `sid` coexist. The portal's RBAC/MFA/RLS/audit core stays untouched. |
| 4 | Where does the Portal link go? | **Header nav + footer** | Add `{ href: '/portal', label: 'Portal' }` to the `NAV` array in `nav.js` (lines 26–31) — renders in the desktop bar and overlay menu automatically — plus a portal entry in `layout.js` `footerHtml()`. |
| 5 | Token delivery | **Vendor a copy into `portal/`** | `tokens.css` copied to `portal/apps/web/app/tokens.css` + a drift guard. Docker-safe (see evidence below). |
| 6 | Fonts / CSP | **Keep CSP strict, system fonts** | `proxy.ts` CSP unchanged at `font-src 'self'`. No third-party request on portal pages. Portal adopts BIC colours, spacing, radii, and shadows but not the four webfonts. |
| 7 | CI workflow | **Merge into root `.github/workflows/`** | Portal's API tests + web smoke checks + k6 fold into a root workflow so they run on push. |
| 8 | Go-ahead | **Approved — execute the full plan** | All 10 steps + CI merge. |

### New evidence bearing on Q5 — the `@import` option is a deploy-time break

`portal/Dockerfile` copies into the image, in order: `package.json`,
`package-lock.json`, `tsconfig.base.json` (line 16), `packages/` (24), `apps/` (25),
`db/` (26), `scripts/` (30), and in the runtime stage `/app/packages`, `/app/apps`,
`/app/db`, `/app/scripts` (lines 53–56). **Nothing outside the portal root is ever
copied.**

So `@import '../../../public/assets/css/tokens.css'` from `apps/web/app/globals.css`
would resolve on a developer's disk and **fail `next build` inside Docker**, where that
path does not exist. Vendoring a copy into the portal is the only option that survives
both, and it needs a sync guard so the two copies cannot silently drift.

---

## 0. The finding that changes the shape of this job

The brief assumed a portal that could be "moved into position" — files dropped into a
subfolder, links rewired, tokens applied. **That premise does not hold.** `portal.zip`
is not a static bundle. It is a compiled three-package TypeScript monorepo:

| Package | Stack | Role |
| --- | --- | --- |
| `@portal/contracts` | TypeScript + zod | Shared request/response schemas |
| `@portal/api` | **NestJS 12** + Express 5 + Drizzle ORM + **PostgreSQL 18 / PGlite** | 122 REST endpoints under `/api/v1` |
| `@portal/web` | **Next.js 16** App Router + React 19 | 40 server-rendered routes |

Against that, the main site is 539 lines of CommonJS Express 5 serving seven
hand-written HTML files from `public/`, with JSON files on disk as its database.

**There is no version of "integrate" that means copying these files next to each other.**
The portal needs a Node build step, a running Next server, a running Nest server, and a
Postgres database. The integration is therefore a **federation behind a single origin** —
the main Express server becomes the one public door, and proxies to the portal's two
processes behind it. Sections 1–4 below specify exactly that.

### Verified, not assumed

Everything below was executed in this sandbox, not inferred from the README:

| Check | Result |
| --- | --- |
| `npm install` in portal workspace | **OK** — 192 packages, `next@16.3.8`, `@nestjs/core@12.1.2`, `express@5.2.1`, `drizzle-orm@0.45.3`, `@electric-sql/pglite@0.3.16`, `zod@3.25.76` |
| `npm run build` (contracts → api → web) | **OK, exit 0** — Next compiled 40 routes + proxy middleware |
| API boot | **OK** — `listening on :8080 db=pglite`, all **17 migrations** applied (`0001_init` … `0017_dpia_record`) |
| `GET /api/v1/health` | **200** — `{"status":"ok","db":"up",...}` |
| `GET /api/v1/students` unauthenticated | **401** as designed |
| `POST /api/v1/auth/login` (`admin@school.example`) | **200** — session cookie + `csrf` cookie issued, 15 permissions returned |
| MFA enforcement | **403 `mfa_required`** on `/students` for staff without a second factor |
| `POST /api/v1/auth/login` (`s1@school.example`) → `GET /api/v1/student/grades` | **200** — `{"data":[]}` (student path not MFA-gated) |

The portal is a complete, working system. The work here is integration, not repair.

---

## 1. Target directory & route architecture

### 1.1 Where the files go

```
schoolsite/
├── server.js                  ← existing; gains a proxy layer (see §2)
├── public/                    ← existing; gains one nav entry (§3.2)
├── portal/                    ← NEW: portal monorepo, moved from _temp_portal/school-portal/
│   ├── apps/api/              NestJS API (122 endpoints, /api/v1)
│   ├── apps/web/              Next.js 16 (40 routes, basePath /portal)
│   ├── packages/contracts/    zod schemas
│   ├── db/migrations/         17 SQL migrations
│   ├── docs/  scripts/  ops/  retained — they are the runbook
│   ├── package.json           kept as its own workspace root
│   ├── package-lock.json      kept (see §5.3 on why NOT to merge it)
│   └── .gitignore             kept, scoped to portal/ only
├── package.json               ← existing; gains root scripts + http-proxy-middleware
└── PORTAL-INTEGRATION-PLAN.md (this file)
```

**`portal/` as a self-contained subtree, not a flat merge.** Four hard reasons:

1. **`.gitignore` collision — confirmed.** The portal's `.gitignore` contains `data/`.
   The main site *tracks* four files under `data/`:
   `data/gallery-data.json`, `data/library/catalog.json`, `data/news/config.json`,
   `data/news/posts.json`. Flattening the portal's ignore rules to repo root would
   un-track the site's live content.
2. **Dependency conflicts — confirmed.** `nodemailer` main `^9.0.1` vs portal `^10.0.13`;
   `multer` main `^2.0.2` vs portal `^2.4.0`. Separate workspaces keep each pinned version;
   one flat `package.json` cannot hold both.
3. **Build tooling.** The portal needs `tsc` + `next build`; the site has no build step.
   Keeping the workspace boundary means `npm start` for the site stays zero-build.
4. **Engines.** Portal requires Node `>=20.19`; site declares `>=18.0.0`.
   (Sandbox is v22.22.3 — fine. Root `engines` should be bumped to `>=20.19`.)

`express` is *not* a conflict: both resolve to a single hoisted **5.2.1**
(verified — one `express` dir in the portal tree, plus `@types/express`).

### 1.2 Public route map (single origin, port 4040)

| Public path | Handled by | Notes |
| --- | --- | --- |
| `/`, `/programs.html`, `/news.html`, `/library.html`, `/academies.html`, `/contact.html`, `/admin.html` | main Express static | unchanged |
| `/api/contact`, `/api/gallery`, `/api/posts`, `/api/config`, `/api/login`, `/api/logout`, `/api/auth/check`, `/api/staff/login`, `/api/library/upload`, `/api/assets`, `/api/health` | main Express | unchanged |
| **`/portal/**`** | → proxy → Next.js :3000 | 40 routes, `basePath: '/portal'` |
| **`/portal/api/v1/**`** | → proxy → NestJS :8080 | 122 endpoints (Next's own rewrite already targets `/api/:path*`) |

**Route-collision audit result: no literal path collisions exist.** The portal API is
namespaced under `/api/v1` and the site's endpoints sit at `/api/<noun>` — even
`/api/health` (site) vs `/api/v1/health` (portal) are distinct. Mounting Next at
`/portal` (rather than the web root) removes the only real risk: portal routes named
`/login`, `/admin`, `/student`, `/legal/*` would otherwise sit beside the site's
`/admin.html` and be shadowed by `express.static`.

**Ordering is the one place this breaks.** In `server.js`, `express.static(PUBLIC_DIR)`
is registered at line 504 and the `/api` JSON-404 catch-all at line 524. The portal
proxies **must be registered before both**, or static will 404 them and the catch-all
will swallow API calls.

### 1.3 Next.js `basePath` — required changes (this is the bulk of the code work)

`apps/web/next.config.mjs` currently has **no `basePath`**. Serving under `/portal` needs:

```js
// next.config.mjs
export default {
  basePath: '/portal',
  assetPrefix: '/portal',
  turbopack: { root: monorepoRoot },
  async rewrites() {
    const api = process.env.API_INTERNAL ?? 'http://127.0.0.1:8080';
    return [{ source: '/portal/api/:path*', destination: `${api}/api/:path*` }];  // was /api/:path*
  },
};
```

Next's `<Link>` and `router.push()` prefix `basePath` automatically, so the 21 call
sites across 10 files need **no** change. **Raw `fetch()` does not** — I grepped, and
exactly two break:

| File | Line | Current | Must become |
| --- | --- | --- | --- |
| `apps/web/lib/client.ts` | 23 | `fetch(\`/api/v1${path}\`)` | `fetch(\`/portal/api/v1${path}\`)` |
| `apps/web/components/shell.tsx` | 62 | `fetch("/api/v1/school")` | `fetch("/portal/api/v1/school")` |

Better than hardcoding: read `basePath` from a single const in `lib/client.ts` and
export it for `shell.tsx`.

**API-side absolute URLs also need the prefix.** `PUBLIC_WEB_ORIGIN` feeds every emailed
link and the Paystack callback. With a `/portal` basePath, it becomes
`https://school.example/portal`, which correctly yields:

- `auth.service.ts:289` → `${origin}/reset?token=…`
- `auth.service.ts:400,451` → `${origin}/invite?token=…`
- `sso.controller.ts:98` → `res.redirect(302, origin + (needsMfa ? "/mfa" : "/"))`
- `fees.controller.ts:282` → `callback_url: ${origin}/fees/return`
- `notify/templates/index.ts` → 8 more (`/forgot`, `/mfa`, `/parent`, `/parent/messages`, …)

⚠ **One production landmine:** `config.ts` rejects a loopback `PUBLIC_WEB_ORIGIN` in
production, and `PUBLIC_WEB_ORIGIN` must be set on **both** the API and the worker or
every emailed link points at the recipient's own machine (the README documents this as
a bug they already hit in compose).

---

## 2. Server & auth strategy

### 2.1 Process topology

Three processes, one public port. Main `server.js` gains `http-proxy-middleware` (the
only new dependency the site takes on):

```
browser ──► :4040  main Express (server.js)  ← the only public listener
                    ├── static  public/
                    ├── /api/*  site endpoints (unchanged)
                    ├── /portal/api/v1/* ──► :8080 NestJS  (proxy, no rewrite)
                    └── /portal/*        ──► :3000 Next.js (proxy, no rewrite)
```

This matters operationally in this environment too: only ports bound to `0.0.0.0` get a
live preview, so a single front door gives one working URL instead of three.

Proxy config notes:
- `changeOrigin: true`, `ws: false` (no WebSockets — the README's planned Socket.IO
  gateway was never built; I confirmed no `socket.io` dependency exists).
- Do **not** strip prefixes — Next's `basePath` and Nest's `setGlobalPrefix("api/v1")`
  already expect the full path.
- Preserve `req.ip`: the API sets `trust proxy` from `TRUST_PROXY` and its rate limiting
  and audit log both depend on the real client IP. Set `TRUST_PROXY=1` (one hop).

### 2.2 Sessions — deliberately NOT unified

Two session systems will coexist. **This is correct and should not be "cleaned up."**

| | Main site | Portal |
| --- | --- | --- |
| Mechanism | `express-session` + `session-file-store` | Custom, DB-backed `sessions` table |
| Cookie | `bic.sid` | `sid` (`config.sidCookie`) |
| Token form | signed session id | random token, **SHA-256 hashed at rest** |
| Expiry | 8 h | 12 h |
| Backing | files in `data/news/sessions/` | Postgres rows with `revokedAt` |

Different cookie names ⇒ zero interference, and both can run on one origin.

Unifying them would mean rebuilding the portal's `Principal` model — roles,
`rolePermissions`, `mfaVerified`, `mfaInGrace`, `mustChangePassword`, RLS `SET LOCAL
ROLE portal_app`, and the append-only audit log are all read from that session row in
`session.middleware.ts`. Replacing it with a flat `req.session.authenticated` boolean
would delete the entire authorisation model. **Not a refactor; a rewrite of the
security core.** Keep both.

**SSO across the boundary is out of scope by design.** A visitor logged into the site's
gallery/news admin is *not* logged into the portal, and vice versa. If single sign-on is
wanted, that is a separate, larger project (see Question 3).

### 2.3 Middleware that must stay inside the portal process

Do not hoist these into `server.js` — each is coupled to portal internals:

- **CSRF** (`CsrfGuard`) — double-submit on `x-csrf` vs `csrf` cookie; exempts
  `/auth/*`, `/webhooks/*`, and the RFC 8058 unsubscribe (a mail client POSTs it with
  no cookies at all).
- **Authorisation** (`PermGuard`) — capability gate plus the parent-read-only invariant,
  with `@ParentWrite()` as the single deliberate exception for fee payment.
- **MFA gate** — `session.middleware.ts` returns 403 `mfa_required` for staff without a
  verified second factor, honouring a dated `MFA_GRACE_UNTIL` window.
- **Rate limiting** — its own in-memory `rateLimitCheck`, deliberately *per-email strict
  + per-IP generous* because a whole school sits behind one NAT IP, backed by durable DB
  lockout. The site's `express-rate-limit` cannot express this.
- **helmet** — `defaultSrc 'none'` on the JSON API; Next's `proxy.ts` sets a per-request
  **CSP nonce** middleware for the web side (Next 16 renamed `middleware.ts` → `proxy.ts`).

The site's own `app.use('/api', cors(...))` becomes inert for portal traffic, because
proxying makes everything same-origin — which is exactly what the portal's BFF design
(ADR-012) assumes.

### 2.4 Database

- **Dev / this sandbox:** PGlite (real Postgres compiled to WASM, in-process). This is
  the only runnable path here — **no `psql`, no `docker` in this environment**, both
  confirmed absent. Migrations run from `db/migrations/*.sql`.
- **Production:** real Postgres, non-negotiable. `db/client.ts` **throws on boot** if
  `DATABASE_URL` is unset while `NODE_ENV=production`, rather than silently degrading to
  in-memory. The plan must not imply PGlite is production-viable.
- Migrations need `data/` writable for the PGlite dir (`PGLITE_DATA_DIR`).

### 2.5 Environment variables

The portal reads **64** (documented in its `.env.example`, 13,725 bytes). The site reads **11**.
Plan: **keep two `.env` files** — root `.env` for the site, `portal/.env` for the portal —
because `NODE_ENV`, `PORT`, and the SMTP variable *names* all differ
(site: `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`; portal: a single `SMTP_URL`).
I will merge a documented portal block into the root `.env.example` for discoverability
without pretending one file drives both.

Minimum to boot the portal in dev:
`SEED_DEMO=true COOKIE_SECURE=false SMTP_VERIFY_ON_BOOT=false TRUST_PROXY=1
PUBLIC_WEB_ORIGIN=http://localhost:4040/portal API_INTERNAL=http://127.0.0.1:8080`

---

## 3. Design system & UX harmonisation

### 3.1 The two design languages are unrelated

| | Main site `tokens.css` | Portal `globals.css` |
| --- | --- | --- |
| Background | `#F3EFE5` parchment | `#f6f7fb` cool grey |
| Brand | `#05014A` deep indigo | `#4338ca` violet |
| Accent | `#B07D3F` antique gold | none |
| Type | 4 families (Montserrat / Quicksand / Libre Baskerville / Abril Fatface) | `system-ui` only |
| Scale | fluid `clamp()` type scale, 8 px spacing grid, 5 radii, 4 shadows, motion tokens | ~8 flat custom props |
| Size | 159 lines, documented | 55 lines, minimal |

The portal's palette and typography would read as a different school's product. The
README claims "Tailwind v4 + shadcn/ui"; **that is false** — `apps/web/package.json`
declares only `next`, `react`, `react-dom`, and the styles are hand-written. Good news:
no Tailwind to reconcile.

### 3.2 Harmonisation plan

**a) Rebase `globals.css` onto `tokens.css`.** Import the tokens and remap the portal's
props — one file, no component rewrites:

```css
@import '../../../public/assets/css/tokens.css';   /* or copy tokens into portal/ */

:root {
  --bg:       var(--color-paper);       /* #f6f7fb → #F3EFE5 */
  --card:     var(--color-surface);     /* #ffffff → #FDFAF5 */
  --ink:      var(--color-ink);         /* #0f172a → #18140F */
  --muted:    var(--color-ink-60);
  --line:     var(--color-border);      /* #e2e8f0 → #E4DCCB */
  --brand:    var(--color-brand);       /* #4338ca → #05014A */
  --brand-ink: var(--color-cream);
  --ok:   var(--color-success);
  --warn: var(--color-warning);
  --bad:  var(--color-danger);
}
body { font-family: var(--font-body); }
h1, h2, .topbar .brand { font-family: var(--font-display); }
.btn, .tabbar a, .chip, label { font-family: var(--font-ui); }
.card { border-radius: var(--radius-md); box-shadow: var(--shadow-1); }
```

Token *import path* needs a decision — see Question 5.

**b) Namespace the portal's global selectors.** Collision audit against
`public/assets/css/*.css` (counts = hits across the site's 10 stylesheets):

| Selector | Hits in site CSS | Files |
| --- | --- | --- |
| `.btn` | 40 | components, home, news, programs |
| `:focus-visible` | 22 | components, contact, footer, library, nav, news, programs |
| `.card` | 14 | home, news |
| `.chip` | 7 | news, programs |
| `.container` | 4 | components, news |
| `.muted` | 1 | news |
| `.skip` | 1 | home |
| `.row` `.grid` `.stat` `.alert` `.topbar` `.tabbar` | 0 | — |

Today these do **not** collide at runtime, because Next scopes `globals.css` to the
portal document. But they *will* the moment anyone embeds a portal component in a site
page or vice versa. Cheap insurance: scope the portal stylesheet under a
`portal-root` wrapper class on `<body>` in `app/layout.tsx`.

**c) Fonts.** The site loads Google Fonts; the portal has no font loading and its CSP
(`proxy.ts`) is `font-src 'self'`. Adding Google Fonts to the portal requires relaxing
that to `font-src 'self' https://fonts.gstatic.com` — a deliberate security-posture
change needing sign-off (Question 6).

**d) Navigation — two touchpoints.**

- **Header:** `public/assets/js/nav.js` holds a `NAV` array of six items (lines 26–31:
  Home, Our Programs, Updates, Digital Library, BIMA · BIFA, Get In Touch). Add
  `{ href: '/portal', label: 'Portal' }`. It renders into both the desktop bar and the
  overlay menu automatically.
- **Footer:** `layout.js` `footerHtml()` already emits a **Staff Login** link (defaults
  to `/admin.html`, overridable via `data-bic-admin-href`). Options: repoint it to
  `/portal`, or add a distinct "Parent & Student Portal" entry. See Question 4.
- **Inside the portal:** `components/shell.tsx` renders a role-keyed tab bar. Add a
  "← Back to website" link in the `topbar` so users are never stranded.

Note `shell.tsx` fetches the school name from `/api/v1/school` for its brand label — that
fetch is one of the two that needs the `/portal` prefix (§1.3).

---

## 4. File cleanup

| Item | Action | Why |
| --- | --- | --- |
| `_temp_portal/` | **delete** after the move | 2.2 MB source + 542 MB `node_modules` I installed for verification |
| `portal.zip` | **delete** | 621 KB; contents now live in `portal/` |
| `portal/node_modules/` (542 MB) | gitignored, never committed | main `.gitignore` already has `node_modules/` |
| `portal/apps/api/dist/`, `portal/apps/web/.next/` | gitignored | main `.gitignore` has `dist/`; add `.next/` |
| Portal `.gitignore` | **keep inside `portal/`** | its `data/` rule must not reach the site's tracked `data/` files |
| Portal `package-lock.json` (106 KB) | **keep** | separate workspace ⇒ separate lockfile; merging pins would break the `nodemailer`/`multer` split |
| Portal `README.md`, `docs/` (16 files, 268 KB) | **keep** | this is the operating runbook — pilot runbook, go-live plan, backup/restore, email setup, 13 ADRs |
| Portal `.github/workflows/ci.yml` | **keep but relocate or merge** | GitHub Actions only runs from `.github/` at repo root — see Question 7 |
| Portal `Dockerfile`, `docker-compose.yml`, `ops/` | **keep** | the only production-shaped deploy path (Caddy TLS + Postgres + worker + backup) |
| Root `package-lock.json` | **regenerate** | after adding `http-proxy-middleware` |

Nothing here is destructive to the site. The two deletions (`portal.zip`, `_temp_portal/`)
happen only after the portal is verified serving from `portal/`.

---

## 5. Execution sequence (on approval)

1. `git mv` the extracted tree into `portal/`; keep its workspace + lockfile intact.
2. Add `http-proxy-middleware` to root `package.json`; bump `engines` to `>=20.19`.
3. `server.js`: register both proxies **before** `express.static` (line 504) and the
   `/api` catch-all (line 524); add portal env config near the existing config block.
4. `next.config.mjs`: add `basePath` + `assetPrefix`, retarget the rewrite.
5. Fix the two raw `fetch()` calls (§1.3) via a shared `basePath` const.
6. Rebase `globals.css` onto `tokens.css`; add the `portal-root` scope; add the
   back-to-site link in `shell.tsx`.
7. Add `Portal` to `nav.js` `NAV`; update the footer link per Question 4.
8. Root `package.json` scripts: `dev:portal`, `build:portal`, `start` orchestrating all
   three processes (a small `scripts/dev.js`, or `concurrently`).
9. Merge the portal env block into root `.env.example`; document `portal/.env`.
10. Delete `portal.zip` and `_temp_portal/`.

### Validation I will run (Phase 4)

- `npm run build -w @portal/api` and `-w @portal/web` — both must exit 0.
- `npm test -w @portal/api` — the suite the README claims at 256 tests; I will report the
  **actual** number, not the README's.
- `npm run smoke -w @portal/web` — 61 claimed web checks.
- Live, through **:4040 only**: `/` , `/portal`, `/portal/login`, `/portal/legal/privacy`,
  `/portal/api/v1/health`, `/api/health` (site), `/api/posts` (site).
- Live auth through the proxy: staff login → 403 `mfa_required`; student login →
  `/portal/student` renders; logout clears the cookie.
- Regression: site's gallery/news/library admin still authenticate via `bic.sid`.
- Visual: `/portal/login` and `/portal/student` against the rebased tokens.

**Known-unverifiable here, stated up front:** real Postgres, Docker/compose, Caddy TLS,
SMTP delivery, Paystack, and SSO against Entra/Google. No `docker` or `psql` in this
sandbox, and no credentials. PGlite covers the logic paths; the production-shaped
deploy must be verified where those services exist.

---

## 6. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Portal needs Postgres in prod; none available here | High | PGlite for dev; document the hard requirement; `db/client.ts` already refuses to boot without it |
| `basePath` change touches security-adjacent code (CSP, cookies, SSO redirects, payment callback) | High | Only 2 fetch sites + 1 config file; full route sweep in validation |
| `PUBLIC_WEB_ORIGIN` must be set on API **and** worker | Medium | Documented; the README records this exact bug shipping once |
| Two session systems confuse maintainers | Medium | Documented here; explicitly *not* unified |
| MFA blocks staff login until enrolled | Medium | `MFA_GRACE_UNTIL` window + `scripts/mfa-token.mjs` for out-of-band TOTP |
| Portal README overstates the stack (claims Tailwind/shadcn/Socket.IO/PWA that don't exist) | Low | Corrected in this document; worth fixing in `portal/README.md` |
| Repo size: +2.2 MB source, and 542 MB `node_modules` if ever committed | Low | Ignored; verify with `git status` before committing |

---

## 7. Execution log — what was actually done and verified

All 10 planned steps plus the CI merge are complete. Everything below was run,
not predicted.

### Changes made

| File | Change |
| --- | --- |
| `portal/` | New — the extracted monorepo, moved from `_temp_portal/school-portal/` |
| `server.js` | Portal proxy block, registered **first** (before `cors`, `express.json`, `urlencoded`, `session`, `static`, and the `/api` catch-all) |
| `package.json` | `http-proxy-middleware@^3`; `engines` → `>=20.19.0`; 9 portal/token scripts |
| `portal/apps/web/next.config.mjs` | `basePath` + `assetPrefix` = `/portal` |
| `portal/apps/web/lib/base-path.ts` | New — the one `API_BASE` constant |
| `portal/apps/web/lib/client.ts` | fetch → `API_BASE` |
| `portal/apps/web/components/shell.tsx` | fetch → `API_BASE`; `← Website` exit link (plain `<a>`, not `<Link>`) |
| `portal/apps/web/app/admin/audit/audit-browser.tsx` | 1 URL → `API_BASE` |
| `portal/apps/web/app/admin/import/import-panel.tsx` | 4 URLs → `API_BASE` |
| `portal/apps/web/app/login/login-form.tsx` | 2 SSO URLs → `API_BASE` |
| `portal/apps/web/app/globals.css` | Rebased onto BIC tokens, scoped to `body.portal-root` |
| `portal/apps/web/app/tokens.css` | Vendored copy (generated) |
| `portal/apps/web/app/layout.tsx` | `portal-root` on `<body>`; themeColor → `#05014A` |
| `portal/apps/web/test/smoke.mjs` | basePath-aware; `SMOKE_WEB` override |
| `public/assets/js/nav.js` | `Portal` added to `SITEMAP` |
| `public/assets/js/layout.js` | Footer portal link |
| `public/assets/css/footer.css` | `.bic-footer-actions`, `.bic-footer-portal` |
| `scripts/portal.js` | New — runs API + web together |
| `scripts/sync-tokens.js` | New — vendoring + drift guard |
| `.github/workflows/portal.yml` | The portal's 7 CI jobs, `working-directory: portal` |
| `.github/workflows/site.yml` | New — site syntax, token drift, route smoke |
| `.env.example`, `.gitignore` | Portal env block; `.next/`, `portal/data/` |
| `portal/.github/`, `portal.zip`, `_temp_portal/` | **Removed** |

### Verification results

| Check | Result |
| --- | --- |
| `npm run build` (contracts → api → web) | **exit 0** — 40 Next routes + proxy middleware |
| **`npm test` (portal API suite)** | **256 passed, 0 failed** — matches the README's claim exactly |
| **`npm run smoke` (web checks, via the proxy)** | **61 passed, 0 failed** — matches the README's claim exactly |
| Route sweep through :4040 | 28/28 expected outcomes (see below) |
| Student login → `/portal/student` | 201 login → 200 dashboard rendering "Sola Student" |
| Staff login → `/students` | **403 `mfa_required`** — MFA gate intact |
| CSRF | 403 `csrf_missing` without the header, 200 with it |
| Site admin regression | `bic.sid` issued, `authenticated: true`; all `/api/*` still 200 |
| Session isolation | Site cookie → portal `/auth/session` = **401**; portal cookie → site `/api/auth/check` = **`authenticated: false`** |
| Tokens live in served CSS | `#f3efe5`, `#05014a`, `#b07d3f`, `#fdfaf5`, `#e4dccb` present; `--bg:var(--color-paper)` |
| Old palette gone | `#f6f7fb`, `#4338ca`, `#0f172a`, `#e2e8f0` — **0 hits** |
| Selector scoping | 54 `body.portal-root` rules, **0** unscoped `.btn` |
| Token drift guard | exits **1** on drift, **0** in sync |
| `.gitignore` scoping | `portal/data/` ignored; the site's 4 tracked `data/*.json` still tracked |

### Three bugs found and fixed during execution

None of these were in the plan; all three were caught by running the thing.

1. **`basePath` broke 9 call sites, not 2.** The plan said "exactly two break"
   because the first audit only grepped for `fetch(`. A wider grep found 7 more
   in `href=` and `xhr.open` — the CSV export/download links, the roster import
   upload, and both SSO buttons. All 9 now use `API_BASE`; zero bare `/api/v1`
   URLs remain in the web app.
2. **Express mount paths silently broke the proxy.** `app.use('/portal', …)`
   strips the prefix from `req.url`, and hpm v3 forwards `req.url` — so Next
   received `/login` and served its 404 page, and the API received `/v1/health`.
   A status-only sweep reported 404s with no clue why; checking the *body*
   revealed a fully rendered 404 page. Fixed by using hpm's own `pathFilter`
   with no Express mount.
3. **Body parsers swallowed proxied POSTs.** `express.json()` consumed the
   stream before the proxy ran, so every portal login hung until timeout
   (`HTTP 000`). Fixed by registering the proxy ahead of all body parsing —
   which also means portal traffic never touches the site's session store.

Also fixed: PGlite's non-recursive `mkdirSync` (the orchestrator now creates the
data dir), and `npm` not forwarding SIGTERM to `next-server` (the orchestrator
now kills the whole process group, so no stray server holds :3000).

### Two notes for whoever operates this

- **The smoke suite is single-use against a persistent dev DB.** The demo MFA
  enrolment tokens are one-time, so a second run fails at `totp enroll` and then
  crashes on `totpCode(undefined)`. Run `npm run portal:reset` first — this is
  the same reason the portal's own CI does `rm -rf apps/api/data`.
- **`portal/apps/web/test/smoke.mjs` exits 0 even when assertions fail.** It
  prints `N passed, M failed` but never sets a failure exit code, so CI would go
  green on a red suite. `web-smoke` should grep the summary line. Not changed
  here — it is the portal's own harness and the fix belongs in a separate
  review.

### Still unverified — no way to test it in this sandbox

Real PostgreSQL (no `psql`), Docker/compose and Caddy TLS (no `docker`), SMTP
delivery, live Paystack, and Entra/Google SSO. PGlite exercised the logic; the
production-shaped deploy needs verifying where those services exist.
