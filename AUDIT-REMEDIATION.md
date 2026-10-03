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

### 13. Account lockout is a denial of service — OPEN, and worse than described
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

**Not fixed, deliberately.** Removing the oracle means returning `401` while
locked, which contradicts five assertions the portal's own suite makes
(`phase53.test.mjs:523,524,530,531`, `phase6-hardening.test.mjs:174,181,182`) and
costs the real user the "locked, try again in N minutes" message. That is a
security-vs-UX decision belonging to the portal's owners, not a drive-by edit.
The DoS half wants an admin unlock endpoint, which is new surface.

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

### 12. No role-switch UI — OPEN
Not addressed. Requires portal UI work.

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
| Custom 404 page | **OPEN** |
| Timezone handling | **OPEN** — not investigated |
| Docker image for the main site | **OPEN** — the boot gate covers "no dev defaults in production", but there is no site container |

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
