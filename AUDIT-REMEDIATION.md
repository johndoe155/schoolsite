# Audit remediation log

Response to the independent audit of the portal integration. Every line below was
re-derived from the code in this repository and, where it could be, executed
against a running stack. Claims that turned out to be **wrong** are recorded as
such rather than quietly dropped.

Commits: `fa9ef98` (auth + XSS), `b4332d3` (payments, data loss, uptime).

Legend: **FIXED** = changed and verified · **VERIFIED, NOT A BUG** = claim did not
survive testing · **OPEN** = confirmed real, not yet fixed · **BLOCKED** = cannot
be verified or completed in this environment.

---

## Blockers

### 1. Library upload had no authentication — FIXED
`/api/staff/login` returned `crypto.randomBytes(24)` and **no route ever checked
it**. `library.js` used it only to decide whether to show the modal. The upload
endpoint was open to anyone.

Now session-authenticated (`requireLibraryAuth`), with `/api/library/auth` and
`/api/staff/logout`. The lockout was also one global counter — five wrong
guesses locked out *every* staff member — and is now a per-IP `Map`.

Measured through :4040: unauthenticated upload **401** (was 200), after login
**200**, after logout **401**.

### 2. Stored XSS on the origin that hosts /portal — FIXED (one part blocked)
Three separate sinks, all on the same origin as the portal, whose CSRF cookie is
deliberately readable by JavaScript:

- `library.js` interpolated `title`, `author`, `year`, `subject`, `type`, `pdf`
  and `thumb` into `innerHTML` unescaped. All now go through `esc()`/`attr()`,
  URLs through `safeUrl()`. Verified under jsdom: `<img src=x onerror=alert(1)>`
  → `&lt;img src=x onerror=alert(1)&gt;`.
- The inline `onclick="App.openPreview('${item.title}'…)"` was both an injection
  point and simply broken on any title containing an apostrophe (`O'Level`).
  Replaced with `data-preview` + a delegated listener.
- News stored article bodies verbatim and `news.js` renders them as HTML. The
  admin textarea says *"Separate paragraphs with a blank line"*, so bodies are
  plain text by intent: `renderArticleText()` escapes then paragraphs at write
  time. Posted `<script>alert(1)</script>` came back
  `<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>`.

`pdfjsLib.getDocument` now passes `isEvalSupported: false` (CVE-2024-4367), so a
crafted uploaded PDF cannot execute script during preview.

**BLOCKED:** SRI `integrity` hashes for the pdf.js and Tailwind CDN tags.
`cdnjs.cloudflare.com` is unreachable from this sandbox (HTTP 000 for every
version tried). Writing plausible-looking hashes would be worse than none; this
needs a machine with network access.

### 3. Weak defaults were only warnings — FIXED
`NODE_ENV=production` now refuses to boot: default `NEWS_ADMIN_PASSWORD` or
`STAFF_PASSCODE`, missing `SESSION_SECRET`, or a missing/short `ADMIN_TOKEN`.

```
❌ Refusing to start with NODE_ENV=production:
   • NEWS_ADMIN_PASSWORD is still the published default
   • STAFF_PASSCODE is still the published default
exit=1
```

With real values it boots normally. Dev still boots with an empty `.env`.

`trust proxy` was never set, so behind TLS `express-session` would not set the
secure cookie and the admin logins would silently fail to stick, while rate
limits keyed on the proxy's IP. Now honours `TRUST_PROXY`, defaulting to `1` in
production.

Also removed: the CORS clause that treated an empty `ALLOWED_ORIGINS` as
allow-everyone, and the gallery admin's acceptance of a token in the **query
string** (so it landed in logs, history and Referer), now header/body only with
a constant-time compare and a rate limit.

### 5. `PUBLIC_WEB_ORIGIN` did not have to match the basePath — FIXED
Every invite, reset, guardian-verify and MFA link, plus Paystack's
`callback_url`, is built from this value. The shipped `.env.example` and all
three `docker-compose.yml` defaults omitted the `/portal` suffix, so **all of
them would 404 in production while go-live readiness still reported PASS.**

Validation now requires the suffix, read from the same `PORTAL_BASE_PATH` that
`next.config.mjs` uses — declaring it twice is how the two drift apart. All four
defaults updated. A root-mounted deploy sets `PORTAL_BASE_PATH=''`.

### 6. `trust proxy` — FIXED (see 3)
The audit marked this as *reasoned, not run*. Confirmed real: the setting was
absent from `server.js` entirely.

### 16. Proxy used v2 option names — FIXED
The audit marked this *reasoned, not run*. **Confirmed real, and worse than
described.** `onError` and `logLevel` exist only under `dist/legacy/`, which
`createProxyMiddleware` never applies — so the custom handler never ran and hpm
returned its own 504 that echoed the internal target host:port to the browser.

Migrated to v3's `on.error` / `logger` and re-tested in-repo with a throwaway
script: **502, custom handler fired, `ECONNREFUSED`, no internal host in the
body.**

---

## High

### 7. Payment return unreachable — FIXED
`sid` was `SameSite=Strict`. Paystack sends the payer back with a cross-site
top-level GET, and Strict makes the browser withhold the cookie on exactly that
navigation — so `/fees/return`'s own session check saw an anonymous visitor and
redirected to `/login`. The one page whose job is to stop a parent paying twice
was unreachable immediately after paying.

Now `Lax` for `sid` and `csrf`. Not a CSRF regression: Lax still withholds
cookies on cross-site POST/PUT/PATCH/DELETE, which covers every mutating verb,
and the real defence is `CsrfGuard`'s `x-csrf` double-submit check.
`sso.controller.ts` already reasoned its way to Lax for its flow cookie; its four
session-cookie writes now match.

### 8. Payments depend on the webhook — VERIFIED, NOT A BUG
Correct as a description, but the design is sound and deliberate. The return
page does **not** trust the browser: it polls
`/fees/payments/:reference/status`, which reads the row updated by the
HMAC-SHA-512-verified webhook. The code comments say as much — *"pending is the
honest answer while the webhook is in flight."*

The real constraint is operational, not a defect: if Paystack cannot reach the
server (NAT, dev box, no public URL) the payment never confirms. That belongs in
the deployment checklist, not the code.

### 9. Attendance traps — NOT CONFIRMED
Could not reproduce. `POST sections/:id/attendance` requires an idempotency key
(replay returns the stored body, concurrent returns `409`), enforces
`attendance:write`, checks section scope, and rejects any student not enrolled
in that section with `not_enrolled`. The audit text for this item was not
specific enough for me to know which behaviour was meant; **treated as
unverified rather than dismissed.**

### 10. Gallery admin broke on refresh — FIXED
`admin.js` kept the token in a variable but the "am I logged in" flag in
`sessionStorage`. F5 restored the flag, lost the token, and every request went
out as `X-Admin-Token: undefined`. The admin saw a live-looking panel in which
nothing worked.

Added `/api/gallery/{login,logout,auth}`; the panel now asks the server. All
nine cases measured:

| case | result |
|---|---|
| auth before login | `{"authenticated":false}` |
| wrong token | 401 |
| token in query string | 401 (ignored) |
| correct token | 200 |
| **refresh: cookie only, no header** | **200** (was 401) |
| no cookie, no token | 401 |
| after logout | `{"authenticated":false}` → 401 |

### 13. Account lockout is a denial of service — FIXED, and it was worse than described
Measured, not assumed. `lockout: { maxFailures: 5, durationMs: 15 * 60_000 }`:

```
attempts 1–5 → 401 invalid_credentials
attempt 6    → 423 account_locked
attempt 11   → 429 rate_limited      ← the separate in-memory limiter
```

Two distinct problems:

1. **DoS.** Five unauthenticated requests lock any account for 15 minutes. There
   is **no admin unlock endpoint** — a locked staff member simply waits, and an
   attacker can re-lock them indefinitely.
2. **Existence oracle.** A non-existent email always returns `invalid_credentials`
   and can never reach `account_locked`. So `423` vs `401` reliably distinguishes
   real staff accounts from fake ones.

**Both halves fixed.**

*The oracle.* Both `account_locked` branches (login and `ssoLink`) now throw the
same `401 invalid_credentials` as a wrong password. The account is still locked
and the lockout still runs — only the response stopped saying so. `retryAfterMs`
is gone, since that alone would have revealed the account exists.

*The DoS.* Added `POST /api/v1/users/:id/unlock` (`directory:write`, audited as
`auth.unlock`), so a locked-out member of staff is recoverable immediately
instead of waiting out 15 minutes while an attacker keeps re-locking them.

This did mean changing five assertions the portal's own suite made
(`phase53.test.mjs`, `phase6-hardening.test.mjs`). They still assert that the
account *is* locked — the correct password is still refused after five
failures — they just no longer assert on a status code that leaked existence.

New `test/lockout.test.mjs`, 6 tests. The important one drives a real address
and a made-up one through identical traffic and asserts the responses are
byte-identical in status, `code`, and the absence of `retryAfterMs` — an
attacker comparing them learns nothing.

### 14. Corrupt data files were silently overwritten — FIXED
`readJSON` returned the fallback for both *missing* and *corrupt*. For the
gallery and the library that fallback is `[]`, so a half-written file read back
as empty and the next admin action wrote that empty array over the real data —
silent and unrecoverable.

Missing still seeds a new file; corrupt now logs loudly and blocks writes to
that file. Verified:

```
read of corrupt file → [] (fallback, not real data)
✓ write REFUSED: Refusing to overwrite catalog.json: the existing file is corrupt.
file still holds the original bytes
✓ after repair, write allowed
```

### 12. No role-switch UI — FIXED
`POST /auth/role/switch` had existed since the RBAC work and was never reachable
from anywhere: no UI, and **no test in the whole suite**. A registrar who was
also a teacher saw "Registrar" in the topbar with no way to become the teacher,
so a dual-role account silently lost half its access.

`components/shell.tsx` now renders a role picker when `session.roles.length > 1`,
posts to the endpoint through `api()` (so it carries `x-csrf`), navigates to the
new role's home via `ROLE_HOME` — staying on `/teacher` as a student would 403 —
and calls `router.refresh()` so the new permissions reach the component.

**A second, worse problem surfaced while testing it.** The endpoint returned
**201 with no CSRF token at all.** `CsrfGuard` exempted the whole of
`/api/v1/auth/*` on the reasoning that those endpoints are rate-limited. That is
true for the pre-authentication ones, where no session cookie exists to
double-submit — it is not true for `role/switch`, which runs inside a session.
The exemption also meant any *future* `/auth` route would inherit no CSRF
protection by accident.

Narrowed: the exemption now applies only when no session cookie is present.
Every `/auth/*` caller in the web app goes through `api()`, which always sends
`x-csrf`, so nothing breaks.

New `test/role-switch.test.mjs`, 5 tests: a dual-role staff member switches and
the **permissions** actually change (not just the label); a role you do not hold
is `403 role_not_held` and leaves the active role untouched; an empty role is
`400`; the switch is audited with the role in `after_json`; and CSRF is
required.

### 4. No working production path for site and portal together — FIXED (build not run)

I originally marked this **OPEN** and said only that the boot gate "covers no
dev defaults in production". That was me substituting the part I had already
done for the finding. It was not addressed.

The gap was larger than a missing container. `docker-compose.yml` had
`postgres`, `api`, `worker`, `web`, `backup` and `caddy` — and **zero references
to the site**: no `4040`, no `server.js`. The Caddyfile sent the entire domain
to `web:3000`, but `web` is built with `basePath=/portal`, so it cannot answer
for `/` at all. The compose stack could never have served the marketing site,
and the site is what proxies `/portal`. **The two halves have never been
deployable together from this repo.**

Added:

- **`Dockerfile`** (repo root) — multi-stage, `npm ci --omit=dev`, non-root
  `bic` user, healthcheck on `/api/health`, writable `/app/data`.
- **`.dockerignore`** — the compose build context is the repo root, so without
  this the daemon is sent the entire portal monorepo including `node_modules`,
  `.next` and `dist`.
- **`site` service** in `docker-compose.yml`, on the `internal` network only,
  with `PORTAL_WEB_URL=http://web:3000` and `PORTAL_API_URL=http://api:8080`,
  `TRUST_PROXY=1`, and the four secrets the boot gate demands. Four new volumes
  so uploads and JSON content survive a redeploy.
- **Caddyfile re-pointed** `web:3000` → `site:4040`, with `depends_on: [site]`.
- **CI** — the `docker` job built only `context: portal`. It now also builds
  the site image, asserts the boot gate refuses defaults inside the container,
  boots it and checks `/` returns 200, asserts it does not run as root, and
  runs `docker compose config` to prove the graph still resolves and that Caddy
  depends on `site`.

**Verified here** (Docker is not installed in this sandbox, so `docker build`
itself was not run — flagged, not assumed):

- `npm ci --omit=dev` on the site tree: **exit 0, 129 packages, all 10 declared
  prod deps present**, and `server.js` boots on prod deps alone.
- The full compose env contract, run against a live stack in
  `NODE_ENV=production` with `TRUST_PROXY=1`: **15/15 routes 200**, `/portal` →
  307, `/portal/api/v1/health` → 200, proxy resolving hostnames rather than IPs.
- All **8** `${VAR:?}` required vars are supplied by the new CI job, so
  `docker compose config` will resolve rather than error.

**Found while testing it:** the site's session cookie is `Secure` in
production, so Express only sets it when `X-Forwarded-Proto: https` is present.
Pointing a browser directly at `:4040` over plain HTTP makes every admin login
return `200` while silently dropping the cookie — success shown, session lost.
Measured: `cookie set: 0` without the header, `cookie set: 1` with the `Secure`
flag. Caddy is therefore load-bearing, not decoration; this is now in the
README.

---

## Medium / Low

| Item | Status |
|---|---|
| No compression | **FIXED** — home page 31066 → 8598 bytes |
| No cache headers | **FIXED** — HTML `no-cache`, assets `max-age=86400`, uploads immutable |
| No `robots.txt` | **FIXED** — blocks `/admin.html`, `/api/`, `/portal/admin` |
| No favicon | **FIXED** — all seven pages |
| `admin.html` indexable | **FIXED** — `noindex, nofollow` |
| No security headers on the site | **FIXED** — CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`. `'unsafe-inline'` for script **remains** (inline transit-cover + Tailwind config blocks); removing it needs nonces on every inline block |
| News upload extension from filename | **FIXED** — now from the MIME type; an admin could previously store `.html`/`.svg` under `/assets/uploads` and have it execute same-origin |
| Idle pg client error kills the API | **FIXED** — pool `error` listener; a failover or server restart no longer takes the process down |
| No graceful shutdown in production | **FIXED** — `enableShutdownHooks()` sat inside the `WORKER_INPROC` branch, so production had none; now unconditional with SIGTERM/SIGINT |
| CI never tested the proxy | **FIXED** — `site.yml` ran with `PORTAL_ENABLED=false`, so the entire integration was untested, which is how the proxy shipped broken twice. New `proxy` job boots all three processes and asserts through :4040 only |
| Custom 404 page | **FIXED** — see below. The portal already had a branded `app/not-found.tsx`; only the site was missing one |
| Timezone handling | **FIXED** — see below. There was no timezone configuration anywhere in the API |
| Docker image for the main site | **FIXED** — see #4 below |

### Custom 404 page — FIXED
The portal already had a branded `app/not-found.tsx`; only the site was missing
one. An unknown path returned Express's default — an unstyled
`Cannot GET /path` in a `<pre>`, 143 bytes, no nav and no way forward, which is
exactly when a visitor needs one.

Added `public/404.html` (nav + footer + links to every main section and the
portal) and a catch-all that serves it with a 404 status. `/api/*` still answers
JSON. Verified: `/nope` → 404, 3618 bytes, correct title; `/api/nope` →
`{"error":"Not found."}`. The page deliberately has **no** inline script, so it
needed no nonce.

### Timezone handling — FIXED
There was **no timezone configuration anywhere** in the API. Every "what day is
it" calculation was `new Date().toISOString().slice(0, 10)` — the UTC day. For
Lagos (UTC+1) that is *yesterday* for the first hour of every local day.

What that actually broke:

| site | effect |
|---|---|
| `notify.service.ts` attendance/grade notifications | named the wrong school day |
| `notify.service.ts` `runDigest` | digest boundary at 01:00 local; the digest is idempotent per `(recipient, date)`, so an event in that hour was **missed**, not merely misfiled |
| `fees.controller.ts` invoice due dates | a 14-day invoice came due on day 13 for an hour a day |
| `server.js` news post dates | published at 00:30 WAT, stamped yesterday |
| audit / MFA CSV export filenames | off by one day |

Added `SCHOOL_TIMEZONE` (IANA name, default `UTC` so nothing changes for an
operator who has not thought about it), a `localDate()` helper, and set it to
`Africa/Lagos` in `.env.example`, all four compose services and the dev
orchestrator. The digest's SQL had to change too: `created_at::date` casts in
the Postgres *session* zone, so pairing it with a locally-computed day would
have disagreed with itself — it is now
`(created_at AT TIME ZONE $tz)::date`.

`server.js` reads `SCHOOL_TIMEZONE` with `SITE_TIMEZONE` as a fallback — one
variable for the whole stack, after the earlier lesson about two names for one
setting.

Verified: `2026-10-03T23:30:00Z` → UTC day `2026-10-03`, Lagos day `2026-10-04`.
An invalid IANA name warns and falls back to UTC rather than throwing.

### `'unsafe-inline'` for script — FIXED
14 inline script blocks across 7 pages. Each request now gets a fresh nonce
(`crypto.randomBytes(16)`), the CSP header carries it, and the HTML is rewritten
on the way out — raw HTML is cached against mtime+size, only the injection is
per request. `'unsafe-inline'` is **gone from `script-src`**; once a policy
carries a nonce, browsers ignore it for script anyway, so leaving it in would
have been a lie in the header doing nothing.

`style-src` **keeps** `'unsafe-inline'`, and that is deliberate: the Tailwind
Play CDN generates a `<style>` element at runtime and several pages use
`style="..."` attributes. Removing it breaks the CDN outright. Inline style is
not an execution vector the way inline script is.

Verified per page, header nonce compared against the body nonce in the *same*
response:

| page | script tags | nonced |
|---|---|---|
| `/` | 8 | 8 |
| `/library.html` | 8 | 8 |
| `/academies.html` | 6 | 6 |
| `/programs.html` | 4 | 4 |
| `/admin.html` | 4 | 4 |

Nonces differ between requests. Path traversal attempts (`/../server.js`,
`/..%2fserver.js`, `/%2e%2e%2fserver.js`, `/assets/../../server.js`) all 404.

---

## Two things worth recording

**`maxAge` must be a number of milliseconds.** serve-static 2.2.1 hands the
value straight to `send`, which does not parse ms-style strings — `'1d'`
silently became `max-age=0`. Only caught by reading the response header.

**An orphaned process invalidated a whole round of testing.** `npm start` spawns
`node server.js` as a child; killing the `npm` wrapper left the real server
listening, so the "restarted" server was still the pre-change build and
compression appeared not to work. `server.js` mtime `12:20:37` vs process start
`12:13:21` was the tell. Kill the listener by PID from `ss -ltnp`.

---

## Verification

| Check | Result |
|---|---|
| `npm run portal:test` (twice, after the API changes) | **256 passed, 0 failed** |
| `npm run build` (portal) | exit 0, 40 routes + proxy middleware |
| `npm run tokens:check` | `[tokens] in sync ✓` |
| Route sweep through :4040 | **22/22 → 200**, `/portal` → 307, `/portal/api/v1/students` → 401 |
| New CI `proxy` job assertions | run clean locally |
| `node --check` on every changed JS file | clean |

Not verifiable here: real Postgres, Docker/compose, GitHub Actions execution,
Caddy TLS, SMTP delivery, live Paystack, Entra/Google SSO, and **cdnjs
reachability** (which is what blocks the SRI hashes).
