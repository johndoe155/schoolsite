/**
 * Bodija International College — unified site server
 * ==================================================
 * One Express server for the whole site:
 *   • static pages & assets            →  public/
 *   • contact form (SMTP)              →  POST /api/contact
 *   • public gallery + staff admin     →  GET/POST /api/gallery
 *   • news posts + news admin          →  /api/posts, /api/config, /api/login …
 *   • digital library PDF uploads      →  /api/assets, /api/library/upload
 *
 * Run:   npm install && npm start        (uses .env — see .env.example)
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const session    = require('express-session');
const FileStore  = require('session-file-store')(session);
const rateLimit  = require('express-rate-limit');
const multer     = require('multer');
const cors       = require('cors');
const compression = require('compression');
const nodemailer = require('nodemailer');
const crypto     = require('crypto');
const fs         = require('fs');
const path       = require('path');

/* ── Configuration ────────────────────────────────────────────────────────── */

const PORT       = Number(process.env.PORT) || 4040;
const NODE_ENV   = process.env.NODE_ENV || 'development';
const PUBLIC_DIR = path.join(__dirname, 'public');
const IS_VERCEL  = !!process.env.VERCEL;

/* ── Portal (see PORTAL-INTEGRATION-PLAN.md) ──────────────────────────────── */
/* The portal is a separate Next.js + NestJS monorepo under portal/. This server
   is the single public door: it proxies /portal/** to Next and
   /portal/api/v1/** to the API, so the portal is same-origin with the site and
   its session cookie stays first-party. Set PORTAL_ENABLED=false to run the
   marketing site alone (the links then 404 rather than the whole server dying
   when the portal processes are down). */
const PORTAL_ENABLED = process.env.PORTAL_ENABLED !== 'false';
/* Accept either a full URL or just a port, so PORTAL_API_PORT=8090 is enough —
   scripts/portal.js reads the *_PORT names, and having two schemes for one
   setting means the proxy silently points at the wrong process. */
const PORTAL_WEB_URL = process.env.PORTAL_WEB_URL
  || `http://127.0.0.1:${process.env.PORTAL_WEB_PORT || 3000}`;
const PORTAL_API_URL = process.env.PORTAL_API_URL
  || `http://127.0.0.1:${process.env.PORTAL_API_PORT || 8080}`;
const DATA_DIR   = IS_VERCEL ? '/tmp/data' : path.join(__dirname, 'data');

/* The school's own calendar day. Everything below used
   `new Date().toISOString().slice(0, 10)`, which is the UTC day — so a news
   item published at 00:30 in Lagos (UTC+1) was stamped with *yesterday's*
   date, and it would appear out of order in the list for an hour every night.
   Override with SITE_TIMEZONE for a different campus. */
/* Accepts the same SCHOOL_TIMEZONE the portal API and worker read, so the
   whole stack can be configured with one variable. Having two names for one
   setting is how the site's proxy ended up pointing at the wrong port. */
const SITE_TIMEZONE = process.env.SCHOOL_TIMEZONE || process.env.SITE_TIMEZONE || 'Africa/Lagos';
function localDate(d = new Date()) {
  try {
    // en-CA renders YYYY-MM-DD, which is the shape the JSON files already use.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SITE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  } catch {
    /* An invalid IANA name throws; falling back to UTC beats refusing to save
       the post, and the warning says so rather than failing quietly. */
    console.warn(`[dates] unknown SITE_TIMEZONE "${SITE_TIMEZONE}" — falling back to UTC.`);
    return d.toISOString().slice(0, 10);
  }
}

/* Gallery (staff admin) */
const ADMIN_TOKEN    = process.env.ADMIN_TOKEN || '';
const GALLERY_JSON   = path.join(DATA_DIR, 'gallery-data.json');
const GALLERY_DIR    = path.join(PUBLIC_DIR, 'assets', 'img', 'gallery');

/* Contact form */
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const TO_EMAIL  = process.env.TO_EMAIL;

/* News admin */
const NEWS_ADMIN_PASSWORD = process.env.NEWS_ADMIN_PASSWORD || 'change-me-now';
const SESSION_SECRET      = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const NEWS_DATA_DIR       = path.join(DATA_DIR, 'news');
const POSTS_FILE          = path.join(NEWS_DATA_DIR, 'posts.json');
const NEWS_CONFIG_FILE    = path.join(NEWS_DATA_DIR, 'config.json');
const SESSIONS_DIR        = path.join(NEWS_DATA_DIR, 'sessions');
const SUBSCRIBERS_FILE    = path.join(NEWS_DATA_DIR, 'subscribers.json');
const NEWS_UPLOADS_DIR    = path.join(PUBLIC_DIR, 'assets', 'uploads');

/* Library staff */
const STAFF_PASSCODE   = process.env.STAFF_PASSCODE || 'admin123';
const LIBRARY_DIR      = path.join(PUBLIC_DIR, 'assets', 'library');
const LIBRARY_CATALOG  = path.join(DATA_DIR, 'library', 'catalog.json');

/* Make sure runtime directories exist */
/* On Vercel the project folder is read-only; copy any bundled data into /tmp */
const BUNDLED_DATA = path.join(__dirname, 'data');
if (IS_VERCEL && fs.existsSync(BUNDLED_DATA)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.cpSync(BUNDLED_DATA, DATA_DIR, { recursive: true });
}

[DATA_DIR, NEWS_DATA_DIR, SESSIONS_DIR, GALLERY_DIR, NEWS_UPLOADS_DIR, LIBRARY_DIR,
 path.dirname(LIBRARY_CATALOG)].forEach(dir => {
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { console.warn('mkdir skipped:', dir, e.code); }
});
if (!fs.existsSync(POSTS_FILE))       fs.writeFileSync(POSTS_FILE, '[]');
if (!fs.existsSync(NEWS_CONFIG_FILE)) fs.writeFileSync(NEWS_CONFIG_FILE, JSON.stringify({ featuredId: null }, null, 2));
if (!fs.existsSync(LIBRARY_CATALOG))  fs.writeFileSync(LIBRARY_CATALOG, '[]');

/* Startup warnings (non-fatal: the site still serves pages without them) */
if (!ADMIN_TOKEN)             console.warn('⚠️  ADMIN_TOKEN not set — gallery staff admin will reject logins.');
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !TO_EMAIL)
  console.warn('⚠️  SMTP_* / TO_EMAIL env vars incomplete — /api/contact will return 503 until configured.');
if (NEWS_ADMIN_PASSWORD === 'change-me-now')
  console.warn('⚠️  NEWS_ADMIN_PASSWORD is the default — set it in .env before going live.');
if (STAFF_PASSCODE === 'admin123')
  console.warn('⚠️  STAFF_PASSCODE is the default — set it in .env before going live.');
if (!process.env.SESSION_SECRET)
  console.warn('⚠️  SESSION_SECRET not set — news admin sessions will not survive restarts.');
if (!process.env.NEWSLETTER_SECRET && !process.env.SESSION_SECRET)
  console.warn('⚠️  NEWSLETTER_SECRET / SESSION_SECRET not set — unsubscribe links in sent newsletters will stop working after a restart.');

/* ── Production boot gate ───────────────────────────────────────────────────
   These used to be warnings, which means a school could go live with the
   published default credentials for the news and library admin panels. A
   warning nobody reads is not a control. In production the documented
   defaults are refused outright; in development they stay usable so the site
   still runs with an empty .env. */
const KNOWN_WEAK = new Map([
  ['NEWS_ADMIN_PASSWORD', 'change-me-now'],
  ['STAFF_PASSCODE',      'admin123'],
]);
if (NODE_ENV === 'production') {
  const problems = [];
  for (const [name, weak] of KNOWN_WEAK) {
    if ((process.env[name] || weak) === weak) problems.push(`${name} is still the published default`);
  }
  if (!process.env.SESSION_SECRET) problems.push('SESSION_SECRET is not set (a random one would invalidate every session on restart)');
  if (!process.env.NEWSLETTER_SECRET && !process.env.SESSION_SECRET)
    problems.push('NEWSLETTER_SECRET is not set (unsubscribe links already sent would stop working)');
  if (!ADMIN_TOKEN) problems.push('ADMIN_TOKEN is not set');
  if (ADMIN_TOKEN && ADMIN_TOKEN.length < 24) problems.push('ADMIN_TOKEN is shorter than 24 characters');
  if (problems.length) {
    console.error('\n❌ Refusing to start with NODE_ENV=production:\n   • ' + problems.join('\n   • ') +
      '\n\n   Copy .env.example to .env and set real values.\n');
    process.exit(1);
  }
}


/* ── JSON file helpers (atomic writes) ──────────────────────────────────────
   A corrupt or half-written file used to read back as the fallback, which for
   the gallery and the library is `[]`. The very next admin action would then
   write that empty array over the real data — silent, total, unrecoverable
   loss of the school's catalogue. Missing and corrupt are now different
   things: missing seeds a new file, corrupt refuses to be overwritten. */

const corruptFiles = new Set();

function readJSON(file, fallback) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;      // genuinely absent: fine
    console.error(`[data] cannot read ${file}: ${err.code}`);
    corruptFiles.add(file);
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw);
    corruptFiles.delete(file);
    return parsed;
  } catch (err) {
    console.error(`[data] ${file} is corrupt (${err.message}) — writes to it are blocked until it is repaired.`);
    corruptFiles.add(file);
    return fallback;
  }
}

function writeJSON(file, data) {
  if (corruptFiles.has(file)) {
    const err = new Error(`Refusing to overwrite ${path.basename(file)}: the existing file is corrupt. Repair or remove it first.`);
    err.status = 500;
    throw err;
  }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/* ── Shared helpers ───────────────────────────────────────────────────────── */

/**
 * Article bodies are written as plain text — the admin textarea says
 * "Separate paragraphs with a blank line". news.js inserts the stored value
 * as HTML, so it used to be possible to store <script> or an <img onerror>
 * here and have it run for every reader. Escape first, then build the
 * paragraphs, so markup can only ever be the <p>/<br> we add ourselves.
 */
function renderArticleText(raw) {
  const escaped = String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * Clean up free text from a form.
 *
 * This used to HTML-escape < and >, but its only caller sends the result as
 * the `text` part of a plain-text email — so a parent who wrote
 * "JSS1 <and> JSS2" had it arrive as "JSS1 &lt;and&gt; JSS2". Entities are
 * for HTML sinks; this is not one. What actually matters here is header
 * injection: newlines in a subject or address can add SMTP headers.
 */
function sanitize(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\r\n\t]/g, ' ')      // no CRLF — that is header injection
    .replace(/[\u0000-\u001f\u007f]/g, '')  // strip other control characters
    .slice(0, maxLength)
    .trim();
}

/* Same rules, but paragraph breaks survive. Newsletters are written in
   paragraphs, and the single-line sanitize() collapsed every one of them onto
   one line. Newlines still cannot reach a mail header: the subject is
   sanitized with the strict version. */
function sanitizeMultiline(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .slice(0, maxLength)
    .trim();
}

/* ── App + global middleware ──────────────────────────────────────────────── */

const app = express();

/* Behind TLS / a reverse proxy, Express must be told how many hops to trust or
   req.protocol stays "http" and express-session will not set the `secure`
   cookie — the news and library admin logins would then silently fail to
   stick. Rate limits also key on req.ip, so without this the whole school
   shares one bucket behind the proxy. */
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
else if (NODE_ENV === 'production') app.set('trust proxy', 1);

/* ── Security headers: first in the stack ─────────────────────────────────────
   This block used to sit at the BOTTOM of the middleware chain, after the HTML
   nonce middleware ended HTML requests with res.send() and after the /api
   routes answered on their own. The consequence was measured:
   / returned the CSP and nothing else — no X-Content-Type-Options, no
   X-Frame-Options, no Referrer-Policy, no Permissions-Policy — while a CSS file
   returned all of them (static assets fall through to later middleware and HTML
   pages never did), and /api/* returned none at all.

   Order matters more than the middleware itself, so it is registered here,
   above the proxy and above every route: nothing can answer a request before
   this has run. The CSP is a nonce-less default at this point; the nonce
   middleware further down overwrites it for HTML.
   ------------------------------------------------------------------------- */
app.use((req, res, next) => {
  /* The portal sets its own CSP, XFO and HSTS (apps/web/proxy.ts). Leave those
     responses alone — a default CSP from the site would only fight them. */
  if (req.path.startsWith('/portal')) return next();
  res.setHeader('Content-Security-Policy', SITE_CSP.replace('%NONCE%', ''));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  /* HSTS only over TLS. A browser that is told to remember an https:// upgrade
     for a site it reached over http:// will refuse to connect — so this is
     gated on the same signal the session cookie uses (X-Forwarded-Proto from
     the TLS terminator), not on NODE_ENV alone. Behind Caddy that header is
     always set; on localhost it is not, and localhost keeps working. */
  const proto = req.headers['x-forwarded-proto'] ?? (req.secure ? 'https' : 'http');
  if (String(proto).split(',')[0].trim() === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  next();
});


/* ══════════════════════════════════════════════════════════════════════════
   PORTAL PROXY  (must precede express.static and the /api 404 catch-all)
   ══════════════════════════════════════════════════════════════════════════
   /portal/api/v1/**  →  NestJS  (prefix stripped; the API's own global prefix
                                 is already "api/v1")
   /portal/**         →  Next.js (prefix KEPT; Next runs with basePath=/portal)

   This block is registered FIRST — before cors(), express.json(),
   express.urlencoded() and session(). Body parsers consume the request
   stream, and a proxy that runs after them forwards an empty body and
   hangs. Portal traffic also has no use for the site's session store.

   Direct-to-API rather than via Next's own rewrite so that roster CSV uploads
   (multipart, several MB) do not make an extra hop, and so /portal/api/v1/health
   still answers when the Next process is down. */

if (PORTAL_ENABLED) {
  const { createProxyMiddleware } = require('http-proxy-middleware');

  /* The portal's rate limiting and audit log both key on the real client IP,
     so the API must be told it sits behind exactly one proxy hop. */
  const portalProxyBase = {
    changeOrigin: true,
    xfwd: true,
    /* v3 dropped logLevel/onError — they only exist under dist/legacy and
       createProxyMiddleware never applies that adapter, so the v2 spelling is
       silently ignored and the proxy falls back to its own 504, which echoes
       the internal target host back to the browser. v3 spells them
       `logger` and `on.error`. */
    logger: console,
    on: {
      error: (err, _req, res) => {
      const wantsJson = String(_req.originalUrl || '').includes('/api/');
      console.error(`[portal] proxy error → ${err.code || err.message}`);
      if (!res || res.headersSent) { try { res && res.end(); } catch { /* closed */ } return; }
      res.status(502);
      if (wantsJson) {
        res.json({ error: 'Portal service unavailable. Is the portal API running? (npm run portal:api)' });
      } else {
        res.type('html').send(
          '<!doctype html><meta charset="utf-8"><title>Portal unavailable</title>' +
          '<body style="font:16px/1.6 system-ui;padding:48px;max-width:40rem;margin:auto">' +
          '<h1 style="font:700 1.5rem Georgia,serif">The portal is not responding</h1>' +
          '<p>The school portal service could not be reached. If you are running this ' +
          'locally, start it with <code>npm run portal</code>.</p>' +
          '<p><a href="/">← Back to the website</a></p></body>');
      }
      },
    },
  };

  /* NO Express mount path here — deliberately.
     app.use('/portal', …) makes Express strip '/portal' off req.url before the
     middleware sees it, and http-proxy-middleware v3 forwards req.url. The
     result is Next receiving '/login' instead of '/portal/login' (a 404 page
     rendered with a 404 status) and the API receiving '/v1/health' instead of
     '/api/v1/health'. Using hpm's own pathFilter keeps req.url intact. */

  /* API first — the more specific filter must win over the /portal catch-all. */
  app.use(createProxyMiddleware({
    ...portalProxyBase,
    target: PORTAL_API_URL,
    pathFilter: '/portal/api',
    pathRewrite: { '^/portal': '' },          /* /portal/api/v1/x → /api/v1/x */
  }));

  app.use(createProxyMiddleware({
    ...portalProxyBase,
    target: PORTAL_WEB_URL,
    pathFilter: '/portal',                     /* /portal/x → /portal/x (basePath) */
  }));

  console.log(`[portal] proxying /portal → ${PORTAL_WEB_URL}, /portal/api → ${PORTAL_API_URL}`);
}


/* CORS allow-list for API routes. Same-origin browsers send no Origin header
   and are always allowed; set ALLOWED_ORIGINS=https://a.com,https://b.com to
   permit cross-origin callers. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use('/api', cors({
  origin: (origin, callback) => {
    /* An empty allow-list means "same-origin only", not "everyone". Requests
       from the site's own pages carry no Origin header and still pass; a
       cross-origin caller must be listed explicitly. */
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* Sessions (news admin) */
app.use(session({
  store:             new FileStore({ path: SESSIONS_DIR, ttl: 28800, reapInterval: 3600 }),
  secret:            SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  name:              'bic.sid',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure:   NODE_ENV === 'production',
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
  },
}));

/* ── Multer uploaders ─────────────────────────────────────────────────────── */

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const galleryUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, GALLERY_DIR),
    filename: (_req, file, cb) => {
      const base = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9_\-]/g, '_');
      const ext  = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[file.mimetype] || 'jpg';
      cb(null, `${base}-${Date.now()}.${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    IMAGE_MIME.includes(file.mimetype) ? cb(null, true) : cb(new Error(`Unsupported type: ${file.mimetype}`)),
});

const newsUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, NEWS_UPLOADS_DIR),
    filename: (_req, file, cb) => {
      /* Extension from the MIME type, never from originalname. Taking it from
         the filename let an admin (or anything that can reach this route) store
         a .html or .svg file under /assets/uploads, which the browser would
         then execute same-origin when opened directly. */
      const ext  = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '.jpg';
      const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    IMAGE_MIME.includes(file.mimetype) ? cb(null, true) : cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image')),
});

const libraryUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LIBRARY_DIR),
    filename: (_req, _file, cb) =>
      cb(null, `${Date.now()}_${crypto.randomBytes(3).toString('hex')}.pdf`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Only PDF files are allowed.')),
});

/* ══════════════════════════════════════════════════════════════════════════
   CONTACT FORM — POST /api/contact  (SMTP via nodemailer, rate-limited)
   ══════════════════════════════════════════════════════════════════════════ */

const mailer = (SMTP_HOST && SMTP_USER && SMTP_PASS && TO_EMAIL)
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages sent. Please wait 15 minutes and try again.' },
});

/* ── Newsletter sign-up ───────────────────────────────────────────────────────
   news.html used to flash "Subscribed ✓" and throw the address away, which is
   worse than having no form: the school believes it is building a list and
   parents believe they are on one. */
const SUBSCRIBER_MAX = 20000;          // a hard ceiling — this is a public endpoint

function readSubscribers() {
  const list = readJSON(SUBSCRIBERS_FILE, []);
  return Array.isArray(list) ? list : [];
}

app.post('/api/newsletter', contactLimiter, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  }
  if (email.length > 254) {
    return res.status(400).json({ ok: false, error: 'That email address is too long.' });
  }

  const list = readSubscribers();
  if (list.some((r) => r.email === email)) {
    /* Already subscribed is success, not an error — and saying so does not
       confirm anything an attacker could not learn by just subscribing. */
    return res.json({ ok: true, alreadySubscribed: true, message: 'You are already on the list. Thank you!' });
  }
  if (list.length >= SUBSCRIBER_MAX) {
    console.error('[newsletter] subscriber list is at its ceiling; refusing new sign-ups.');
    return res.status(507).json({ ok: false, error: 'The mailing list is full. Please contact the school office.' });
  }

  list.push({ email, subscribedAt: new Date().toISOString(), source: req.get('referer') || '' });
  writeJSON(SUBSCRIBERS_FILE, list);
  return res.json({ ok: true, message: 'Thank you — you are on the list.' });
});

/* Staff read the list. Same passcode gate as the news admin. */
app.get('/api/newsletter', requireNewsAuth, (_req, res) => {
  const list = readSubscribers();
  res.json({
    count: list.length,
    subscribers: list,
    /* What the send screen needs to show before anyone commits: how many
       people would receive a message, and when the last one went out. */
    campaigns: readCampaigns().map(campaign => ({
      id: campaign.id, subject: campaign.subject, startedAt: campaign.startedAt,
      sent: campaign.sent.length, failed: campaign.failed.length,
      completedAt: campaign.completedAt || null,
    })).slice(-10).reverse(),
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   NEWSLETTER — sending. The list could be collected but never written to:
   the only way to reach subscribers was to export the file and paste it into
   another mail client, which nobody was going to do. See
   PRODUCTION-READINESS-GAPS.md.

   Sending is split into preview → send, because a school newsletter is
   irreversible: there is no "unsent". `preview: true` answers "how many people
   and to what" without sending anything, and a real send must say
   `confirm: true`.

   A send covers at most NEWSLETTER_SEND_MAX recipients. Larger lists continue
   on the next call against the same campaign id, which is what the admin
   screen does in a loop — a single request that held a connection open while
   it delivered 20,000 emails would time out somewhere and the operator would
   have no idea what had gone out.
   ══════════════════════════════════════════════════════════════════════════ */

const NEWSLETTER_SECRET = process.env.NEWSLETTER_SECRET || SESSION_SECRET;
const NEWSLETTER_LOG    = path.join(NEWS_DATA_DIR, 'newsletter-log.json');
const NEWSLETTER_SEND_MAX = 400;   // per request; the UI loops until done
const NEWSLETTER_SUBJECT_MAX = 160;
const NEWSLETTER_BODY_MAX    = 20000;

const newsletterSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,                         // ~12,000 recipients per quarter hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many send requests — please wait a few minutes.' },
});

const readCampaigns = () => {
  const log = readJSON(NEWSLETTER_LOG, []);
  return Array.isArray(log) ? log : [];
};

/**
 * Unsubscribe link for one address.
 *
 * The token is an HMAC of the address, so it cannot be guessed from someone
 * else's link and does not have to be stored. Changing NEWSLETTER_SECRET (or
 * SESSION_SECRET, which it falls back to) invalidates every link in every
 * message already delivered — which is why the default is a warning at boot.
 */
function unsubscribeToken(email) {
  return crypto.createHmac('sha256', NEWSLETTER_SECRET).update(email).digest('base64url');
}

/* The address the recipient's mail client will actually reach. Set
   PUBLIC_ORIGIN when the site is behind a proxy that does not report the
   public host; otherwise the request's own host is right. */
function unsubscribeUrl(email, req) {
  const origin = (process.env.PUBLIC_ORIGIN || (req
    ? `${req.protocol}://${req.get('host')}`
    : '')).replace(/\/+$/, '');
  return `${origin}/api/newsletter/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/* Turn the plain text the staff member typed into the message that goes out.
   Plain text is the source of truth: it is what most clients show, what the
   school can keep in the log, and what cannot smuggle markup into an inbox. */
function newsletterMime({ text, email, subject, req }) {
  const url = unsubscribeUrl(email, req);
  const body = String(text).trim();
  const paragraphs = body.split(/\n{2,}/).map(chunk =>
    `<p style="margin:0 0 1em">${escapeHtml(chunk).replace(/\n/g, '<br>')}</p>`).join('');
  const html =
    `<!doctype html><html><body style="font-family:Montserrat,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#242430">` +
    paragraphs +
    `<hr style="border:none;border-top:1px solid #e6e6ee;margin:2em 0 1em">` +
    `<p style="font-size:12px;color:#6b6b78;margin:0">` +
    `You are receiving this because you subscribed to updates from Bodija International College. ` +
    `<a href="${url}" style="color:#05014A">Unsubscribe</a>.</p>` +
    `</body></html>`;
  return {
    subject,
    text: `${body}\n\n---\nUnsubscribe: ${url}\n`,
    html,
    headers: {
      /* RFC 8058 one-click: a mail client can unsubscribe without opening a
         browser, and without the subscriber having to be "logged in". */
      'List-Unsubscribe': `<${url}>, <mailto:${TO_EMAIL || 'bicbis95@gmail.com'}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

app.post('/api/newsletter/send', requireNewsAuth, newsletterSendLimiter, async (req, res) => {
  const subject = sanitize(req.body?.subject, NEWSLETTER_SUBJECT_MAX);
  const text    = sanitizeMultiline(req.body?.text, NEWSLETTER_BODY_MAX);
  const preview = req.body?.preview === true;
  const confirm = req.body?.confirm === true;
  const testTo  = sanitize(req.body?.test_to, 254);

  if (!subject || !text) {
    return res.status(400).json({ error: 'A subject and a message body are both required.' });
  }

  const list = readSubscribers();

  /* Preview: the number the operator must agree to before anything is sent. */
  if (preview) {
    const campaigns = readCampaigns();
    const last = campaigns[campaigns.length - 1];
    return res.json({
      ok: true, preview: true, recipients: list.length, subject,
      last_campaign: last
        ? { subject: last.subject, startedAt: last.startedAt, sent: last.sent.length }
        : null,
    });
  }

  if (!mailer) {
    console.error('[newsletter] send requested but SMTP is not configured.');
    return res.status(503).json({ error: 'Email is not configured on this server, so nothing was sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS and TO_EMAIL.' });
  }

  /* Test send: one copy to an address the operator names, so a real newsletter
     can be checked in an actual inbox before it goes to the whole list. */
  if (testTo) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
      return res.status(400).json({ error: 'That test address does not look like an email address.' });
    }
    try {
      await mailer.sendMail({
        from: `"Bodija International College" <${SMTP_USER}>`,
        to: testTo,
        ...newsletterMime({ text, email: testTo, subject: `[TEST] ${subject}`, req }),
      });
      return res.json({ ok: true, test: true, to: testTo });
    } catch (err) {
      console.error('[newsletter] test send failed:', err.message);
      return res.status(502).json({ error: `The test message could not be sent: ${err.message}` });
    }
  }

  if (!confirm) {
    return res.status(400).json({ error: 'Sending needs confirm: true — use preview first to check the audience.' });
  }
  if (list.length === 0) {
    return res.json({ ok: true, campaign_id: null, sent: 0, failed: [], remaining: 0, recipients: 0 });
  }

  /* One campaign per subject unless the caller pins an id, so a continuation
     after a partial send never mails the first batch twice. `let` because the
     log is capped after a send and rows may be dropped from it. */
  let campaigns = readCampaigns();
  let campaign = req.body?.campaign_id
    ? campaigns.find(c => c.id === req.body.campaign_id)
    : null;
  if (req.body?.campaign_id && !campaign) {
    return res.status(404).json({ error: 'Unknown campaign id.' });
  }
  /* A pruned campaign has had its recipient list dropped, so "who has already
     had this" is unknowable — continuing it would mail the first batch twice.
     Refuse, and let the operator start a fresh one. */
  if (campaign && campaign.pruned) {
    return res.status(409).json({ error: 'That campaign’s recipient list has been trimmed, so it cannot be continued safely. Start a new send.' });
  }
  if (!campaign) {
    campaign = {
      id: crypto.randomBytes(8).toString('hex'),
      subject, text,
      startedAt: new Date().toISOString(),
      completedAt: null,
      sent: [], failed: [],
    };
    campaigns.push(campaign);
  } else if (campaign.subject !== subject) {
    /* Editing the subject mid-campaign would split one newsletter into two. */
    return res.status(409).json({ error: `This campaign is already sending "${campaign.subject}". Start a new campaign to change the subject.` });
  }

  const alreadySent = new Set(campaign.sent);
  const queue = list.filter(r => !alreadySent.has(r.email)).slice(0, NEWSLETTER_SEND_MAX);
  let sentThisRequest = 0;

  /* Deliver with a little concurrency: fast enough for a school list, gentle
     enough that a shared SMTP host does not start refusing connections. */
  const CONCURRENCY = 5;
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const sub = queue[cursor++];
      try {
        await mailer.sendMail({
          from: `"Bodija International College" <${SMTP_USER}>`,
          to: sub.email,
          ...newsletterMime({ text: campaign.text, email: sub.email, subject: campaign.subject, req }),
        });
        campaign.sent.push(sub.email);
        sentThisRequest += 1;
      } catch (err) {
        campaign.failed.push({ email: sub.email, error: err.message, at: new Date().toISOString() });
        console.error(`[newsletter] delivery to ${sub.email} failed:`, err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  const remaining = list.filter(r => !campaign.sent.includes(r.email)).length;
  if (remaining === 0) campaign.completedAt = new Date().toISOString();

  /* Keep the log bounded without losing the record of what was sent.
     The bulky part of a campaign is its list of recipients; that list exists
     so an interrupted send can be resumed without mailing the first batch
     twice, so it is only dropped once the campaign has FINISHED, and the row
     stays behind as a summary. An unfinished campaign is never touched.
     Past 50 rows the oldest summaries go entirely. */
  for (const c of campaigns.slice(0, -20)) {
    if (!c.completedAt || c.pruned) continue;
    c.sent = [];
    c.failed = c.failed.slice(0, 5);
    c.pruned = true;
  }
  if (campaigns.length > 50) {
    const surplus = campaigns.length - 50;
    const droppable = campaigns.slice(0, surplus).filter(c => c.pruned);
    if (droppable.length) {
      campaigns = campaigns.filter(c => !droppable.includes(c));
    }
  }
  writeJSON(NEWSLETTER_LOG, campaigns);

  return res.json({
    ok: true,
    campaign_id: campaign.id,
    subject: campaign.subject,
    recipients: list.length,
    /* sent = campaign total (what the progress bar shows); sent_now = this
       request, so a 400-message chunk can be told apart from the whole job. */
    sent: campaign.sent.length,
    sent_now: sentThisRequest,
    failed: campaign.failed.slice(-20),
    remaining,
    done: remaining === 0,
  });
});

/* Unsubscribe. GET is the link in the email; POST is the RFC 8058 one-click
   that a mail client fires with an empty body. */
function handleUnsubscribe(req, res) {
  const email = String((req.query.e || req.body?.e || '')).trim().toLowerCase();
  const token = String((req.query.t || req.body?.t || ''));
  /* A bad or missing token is treated as "already unsubscribed" rather than an
     error: an expired link must never leave someone stuck on the list, and a
     response that says "that address is/isn't subscribed" would turn this
     endpoint into a membership oracle. */
  const valid = email && token && safeEqual(token, unsubscribeToken(email));

  if (valid) {
    const list = readSubscribers();
    const next = list.filter(r => r.email !== email);
    if (next.length !== list.length) {
      writeJSON(SUBSCRIBERS_FILE, next);
      console.log(`[newsletter] unsubscribed ${email} (${next.length} remaining)`);
    }
  } else if (email) {
    console.warn('[newsletter] unsubscribe link rejected (bad token) for a supplied address');
  }

  if (req.method === 'POST') return res.json({ ok: true });
  return res.redirect(303, '/newsletter-unsubscribed.html');
}

app.get('/api/newsletter/unsubscribe', handleUnsubscribe);
app.post('/api/newsletter/unsubscribe', handleUnsubscribe);

app.post('/api/contact', contactLimiter, async (req, res) => {
  const name    = sanitize(req.body?.name,    100);
  const email   = sanitize(req.body?.email,   254);
  const subject = sanitize(req.body?.subject, 200);
  const message = sanitize(req.body?.message, 5000);

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  if (!mailer) {
    console.error('Contact form misconfigured: missing SMTP env vars.');
    return res.status(503).json({ error: 'Could not send your message. Please try again later.' });
  }

  try {
    await mailer.sendMail({
      from:    `"BIC Contact Form" <${SMTP_USER}>`,
      to:      TO_EMAIL,
      replyTo: email,
      subject: `New Enquiry: ${subject}`,
      text:    `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    });
    return res.json({ success: true, message: 'Message received successfully.' });
  } catch (err) {
    console.error('SMTP send error:', err.message);
    return res.status(500).json({ error: 'Could not send your message. Please try again later.' });
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   GALLERY — GET /api/gallery (public) · admin actions require X-Admin-Token
   ══════════════════════════════════════════════════════════════════════════ */

/* Gallery admin credentials are tried here, so the attempts are limited the
   same way the library passcode is. */
const galleryAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts. Please wait 15 minutes.' },
});

function requireGalleryAuth(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ ok: false, error: 'Gallery admin is not configured on this server.' });
  }
  /* A session set by /api/gallery/login is enough. admin.js used to keep the
     token in a plain variable while the "am I logged in" flag lived in
     sessionStorage — so a page refresh restored the flag, lost the token, and
     every subsequent request went out as X-Admin-Token: undefined. The admin
     saw a live-looking panel in which nothing worked. */
  if (req.session && req.session.galleryAdmin) return next();
  /* Header or JSON body only — never the query string. A token in a URL ends
     up in server logs, browser history and any Referer header. */
  const token = req.headers['x-admin-token'] || req.body?.token || '';
  if (!safeEqual(token, ADMIN_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

/* Exchange the token for a session, so the panel survives a refresh. */
app.post('/api/gallery/login', galleryAuthLimiter, (req, res) => {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ ok: false, error: 'Gallery admin is not configured on this server.' });
  }
  const token = req.headers['x-admin-token'] || req.body?.token || '';
  if (!safeEqual(token, ADMIN_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  req.session.galleryAdmin = true;
  return res.json({ ok: true });
});

app.post('/api/gallery/logout', (req, res) => {
  delete req.session?.galleryAdmin;
  res.json({ ok: true });
});

app.get('/api/gallery/auth', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.galleryAdmin) });
});

app.get('/api/gallery', (req, res) => {
  /* Authenticated admin read uses ?action=get_gallery; the public page
     fetches the same data without an action parameter. */
  if (req.query.action && req.query.action !== 'get_gallery') {
    return res.status(400).json({ ok: false, error: 'Unknown action' });
  }
  const wantsAuthed = req.query.action === 'get_gallery';
  const send = () => res.json(readJSON(GALLERY_JSON, []));
  if (wantsAuthed) return requireGalleryAuth(req, res, send);
  return send();
});

app.post('/api/gallery', galleryAuthLimiter, requireGalleryAuth, (req, res) => {
  const action = req.query.action;

  if (action === 'save_gallery') {
    const data = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ ok: false, error: 'Expected JSON array' });
    const clean = data.map(item => ({
      id:       String(item.id || ('item-' + Date.now())).replace(/[^a-z0-9\-]/gi, ''),
      title:    String(item.title || ''),
      subtitle: String(item.subtitle || ''),
      images:   (item.images || []).map(String).filter(Boolean),
    }));
    try {
      writeJSON(GALLERY_JSON, clean);
      return res.json({ ok: true, message: 'Gallery saved.' });
    } catch (e) {
      console.error('Gallery write failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Could not save gallery. Please try again.' });
    }
  }

  if (action === 'delete_image') {
    const rel = String(req.body?.path || '').replace(/^\/+/, '');
    if (!/^assets\/img\/gallery\/[a-zA-Z0-9_\-.]+$/.test(rel)) {
      return res.status(400).json({ ok: false, error: 'Invalid path.' });
    }
    const full = path.join(PUBLIC_DIR, rel);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return res.json({ ok: true, message: 'Deleted.' });
  }

  if (action === 'upload_image') {
    return galleryUpload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, error: err.message });
      if (!req.file) return res.status(400).json({ ok: false, error: 'No file received.' });
      return res.json({ ok: true, path: 'assets/img/gallery/' + req.file.filename });
    });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action: ' + action });
});

/* ══════════════════════════════════════════════════════════════════════════
   NEWS — posts CRUD + session-based admin
   ══════════════════════════════════════════════════════════════════════════ */

const readPosts   = () => readJSON(POSTS_FILE, []);
const readNewsCfg = () => readJSON(NEWS_CONFIG_FILE, { featuredId: null });
const writePosts  = data => writeJSON(POSTS_FILE, data);
const writeNewsCfg = data => writeJSON(NEWS_CONFIG_FILE, data);

function requireNewsAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized — please log in.' });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts — please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password !== NEWS_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  req.session.authenticated = true;
  req.session.loginAt = new Date().toISOString();
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/posts', (_req, res) => res.json(readPosts()));

app.post('/api/posts', requireNewsAuth, newsUpload.single('image'), (req, res) => {
  const { title, category, date, excerpt, content, setFeatured } = req.body;

  if (!title || !excerpt || !content) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'title, excerpt and content are required.' });
  }
  const DEFAULT_IMAGE =
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=60';

  const post = {
    id:        Date.now(),
    title:     String(title).trim(),
    category:  String(category || 'Announcements').trim(),
    date:      String(date || localDate()),
    excerpt:   String(excerpt).trim(),
    image:     req.file ? `/assets/uploads/${req.file.filename}` : DEFAULT_IMAGE,
    content:   renderArticleText(content),
    createdAt: new Date().toISOString(),
  };

  const posts = readPosts();
  posts.unshift(post);
  writePosts(posts);

  if (setFeatured === '1') {
    const config = readNewsCfg();
    config.featuredId = post.id;
    writeNewsCfg(config);
    post.isFeatured = true;
  }

  res.status(201).json(post);
});

app.delete('/api/posts/:id', requireNewsAuth, (req, res) => {
  const id    = Number(req.params.id);
  const posts = readPosts();
  const idx   = posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found.' });

  const [removed] = posts.splice(idx, 1);
  writePosts(posts);

  if (removed.image && removed.image.startsWith('/assets/uploads/')) {
    fs.unlink(path.join(PUBLIC_DIR, removed.image), () => {});
  }

  const config = readNewsCfg();
  if (config.featuredId === id) {
    config.featuredId = posts.length > 0 ? posts[0].id : null;
    writeNewsCfg(config);
  }

  res.json({ success: true, deletedId: id });
});

app.get('/api/config', (_req, res) => res.json(readNewsCfg()));

app.put('/api/config/featured', requireNewsAuth, (req, res) => {
  const { featuredId } = req.body || {};
  if (featuredId == null) return res.status(400).json({ error: 'featuredId is required.' });

  const posts = readPosts();
  if (!posts.some(p => p.id === Number(featuredId))) {
    return res.status(404).json({ error: 'No post with that id.' });
  }

  const config = readNewsCfg();
  config.featuredId = Number(featuredId);
  writeNewsCfg(config);
  res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════════════════════
   DIGITAL LIBRARY — catalog + staff PDF uploads
   ══════════════════════════════════════════════════════════════════════════ */

const loadCatalog = () => readJSON(LIBRARY_CATALOG, []);
const saveCatalog = data => writeJSON(LIBRARY_CATALOG, data);

/* Lockout is per-IP, not global. A single shared counter meant five wrong
   guesses from anyone locked every member of staff out for a minute — a
   free denial of service against the library panel. */
const libraryAttempts = new Map();          // ip -> { count, lockedUntil }
const LIBRARY_MAX_ATTEMPTS = 5;
const LIBRARY_LOCKOUT_MS   = 60_000;

/* Constant-time compare: a plain !== leaks the passcode length and lets an
   attacker confirm a guess byte by byte from response timing. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ab.length !== bb.length) { crypto.timingSafeEqual(ab, ab); return false; }
  return crypto.timingSafeEqual(ab, bb);
}

app.post('/api/staff/login', (req, res) => {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  const state = libraryAttempts.get(ip) || { count: 0, lockedUntil: 0 };

  if (now < state.lockedUntil) {
    const secsLeft = Math.ceil((state.lockedUntil - now) / 1000);
    return res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${secsLeft}s.` });
  }

  const { passcode } = req.body || {};
  if (!safeEqual(passcode, STAFF_PASSCODE)) {
    state.count += 1;
    if (state.count >= LIBRARY_MAX_ATTEMPTS) {
      state.lockedUntil = now + LIBRARY_LOCKOUT_MS;
      state.count = 0;
      libraryAttempts.set(ip, state);
      return res.status(429).json({ ok: false, error: 'Too many failed attempts. Locked out for 60 seconds.' });
    }
    libraryAttempts.set(ip, state);
    return res.status(401).json({ ok: false, error: 'Incorrect passcode.' });
  }

  libraryAttempts.delete(ip);
  /* Authenticate with the session the site already runs, not a random token.
     The old code returned a token that no route ever verified, and library.js
     only used it to decide whether to show the modal — so the upload endpoint
     was wide open. A session cookie is httpOnly, survives a page reload, and
     is actually checked below. */
  req.session.libraryStaff = true;
  req.session.libraryLoginAt = new Date().toISOString();
  return res.json({ ok: true });
});

app.post('/api/staff/logout', (req, res) => {
  delete req.session?.libraryStaff;
  res.json({ ok: true });
});

function requireLibraryAuth(req, res, next) {
  if (req.session && req.session.libraryStaff) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized — please sign in as staff.' });
}

app.get('/api/library/auth', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.libraryStaff) });
});

app.post('/api/library/upload', requireLibraryAuth, libraryUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file received.' });

  const { title, subject, type, year, author } = req.body;
  if (!title || !subject || !type || !year) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ ok: false, error: 'Missing required metadata fields.' });
  }

  const newAsset = {
    id:        req.file.filename.split('_')[0],
    title,
    subject,
    type,
    year:      parseInt(year, 10),
    author:    (author || '').trim() || 'Unknown',
    thumb:     'https://images.unsplash.com/photo-1543286386-713df548e9cc?auto=format&fit=crop&q=80&w=400',
    pdf:       `/assets/library/${req.file.filename}`,
    _filename: req.file.filename,
    uploadedAt: new Date().toISOString(),
  };

  const catalog = loadCatalog();
  catalog.unshift(newAsset);
  saveCatalog(catalog);

  console.log(`[library upload] Saved → ${req.file.filename} (${req.file.size} bytes)`);
  return res.json({ message: 'File uploaded successfully', asset: newAsset });
});

app.get('/api/assets', (_req, res) => res.json(loadCatalog()));

/* ── Health check ─────────────────────────────────────────────────────────── */

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

/* ══════════════════════════════════════════════════════════════════════════
   SECURITY HEADERS FOR THE MARKETING SITE
   ══════════════════════════════════════════════════════════════════════════
   The site had no CSP at all, and it loads third-party scripts. Without one,
   a stored-XSS payload anywhere on this origin could pull script from any
   host — and this origin also hosts /portal, whose CSRF cookie is readable
   by JavaScript by design (double-submit), so injected script here could act
   as a signed-in parent or administrator.

   /portal is unaffected: the proxy above is registered first and never calls
   next() for those paths, and Next sets its own per-request nonce CSP.

   'unsafe-inline' for script is still required — the pages carry inline
   <script> blocks (the page-transition cover, the Tailwind config). Removing
   it means nonces on every inline block; that is a separate piece of work.
   What this policy does buy: script can now only come from 'self' and the
   three CDNs the site actually uses, so an injected payload cannot fetch a
   loader from an attacker's host. */
const SITE_CSP = [
  "default-src 'self'",
  /* No 'unsafe-inline': every inline block carries a per-request nonce (see
     the HTML middleware below). Once a policy contains a nonce, browsers
     ignore 'unsafe-inline' for script anyway — keeping it would be a lie in
     the header while doing nothing.
     The three hosts are external files, which a nonce is not needed for. */
  /* cdn.tailwindcss.com is gone: the three pages that used the Play CDN now
     ship a built stylesheet (npm run build:tailwind). */
  "script-src 'self' %NONCE% https://cdnjs.cloudflare.com https://esm.sh",
  /* style-src keeps 'unsafe-inline' and this is deliberate, not an oversight:
     the Tailwind Play CDN generates a <style> element at runtime, and several
     pages use style="..." attributes. Removing it breaks the CDN outright.
     Styles are not an execution vector the way inline script is. */
  /* 'unsafe-inline' for style stays: the pages use style="..." attributes and
     several scripts set inline styles. That is not an execution vector the way
     inline script is. The Tailwind CDN no longer needs a style-src entry. */
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com https://images.pexels.com",
  "connect-src 'self' https://esm.sh",
  "frame-src https://www.google.com",            // the contact/home map embeds
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

/* ── Per-request CSP nonces ───────────────────────────────────────────────────
   The pages are static files, and express.static streams them untouched, so the
   nonce cannot be baked in at build time. Instead every request gets a fresh
   nonce, it goes into the header, and the HTML is rewritten on the way out.
   Raw HTML is cached against mtime+size; only the (cheap) injection is per
   request. */
const htmlCache = new Map();

function readHtmlCached(file) {
  const st = fs.statSync(file);
  const hit = htmlCache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.html;
  const html = fs.readFileSync(file, 'utf8');
  htmlCache.set(file, { mtimeMs: st.mtimeMs, size: st.size, html });
  return html;
}

/** Add nonce= to every <script> that does not already have one. */
function injectNonces(html, nonce) {
  return html.replace(/<script(?![^>]*\bnonce=)([^>]*)>/gi, `<script nonce="${nonce}"$1>`);
}

app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.setHeader('Content-Security-Policy', SITE_CSP.replace('%NONCE%', `'nonce-${nonce}'`));

  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  let rel;
  try { rel = decodeURIComponent(req.path); } catch { return next(); }
  if (rel.endsWith('/')) rel += 'index.html';
  else if (!rel.toLowerCase().endsWith('.html')) return next();

  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return next();     // traversal guard
  if (!fs.existsSync(file)) return next();                         // fall through to 404

  try {
    const html = injectNonces(readHtmlCached(file), nonce);
    res.type('html');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(req.method === 'HEAD' ? '' : html);
  } catch (err) {
    console.error(`[html] ${rel}: ${err.message}`);
    return next(err);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   STATIC SITE
   ══════════════════════════════════════════════════════════════════════════ */

/* Compression: the HTML pages and JSON payloads are large and were being sent
   uncompressed. */
app.use(compression());

app.use(express.static(PUBLIC_DIR, {
  etag: true,
  lastModified: true,
  /* Fingerprinted/immutable content could be cached longer, but nothing here
     is content-hashed, so a day with revalidation is the honest maximum.
     Must be a NUMBER of ms: serve-static 2.x hands this straight to send,
     which does not parse ms-style strings like '1d' (it silently yields 0). */
  maxAge: 24 * 60 * 60 * 1000,
  setHeaders: (res, filePath) => {
    if (/\.(html)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');          // pages must revalidate
    } else if (/\/(gallery|uploads|library)\//i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');  // user uploads are never rewritten
    }
    /* Uploaded files are served same-origin; never let one be sniffed into a
       document or framed. */
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

/* ── Error handling ───────────────────────────────────────────────────────── */

/* Multer-specific errors (file too large, wrong type) */
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large.' });
    }
    return res.status(400).json({ error: 'Invalid file type.' });
  }
  if (err) {
    console.error('[Server error]', err.message || err);
    /* Respect an explicit status — the corrupt-data guard reports 500, which is
       a server-side problem, not a bad request from the admin. */
    const status = Number(err.status) || 400;
    return res.status(status).json({ ok: false, error: err.message || 'Bad request.' });
  }
  next();
});

/* API 404s as JSON */
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

/* Everything else is a page that does not exist. Express's own answer was an
   unstyled `Cannot GET /path` inside a <pre> — no nav, no branding, and no way
   forward, which is precisely when a visitor needs one. */
app.use((req, res) => {
  res.status(404);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.json({ error: 'Not found.' });
  }
  res.sendFile(path.join(PUBLIC_DIR, '404.html'), (err) => {
    if (err) res.type('html').send('<!doctype html><title>404</title><h1>Not found</h1>');
  });
});

/* ── Start ────────────────────────────────────────────────────────────────── */

if (IS_VERCEL) {
  module.exports = app;   // Vercel runs the app itself
} else {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ✅  Bodija International College — unified server');
    console.log(`  🌐  Site     → http://localhost:${PORT}/`);
    console.log(`  🔐  Gallery admin → http://localhost:${PORT}/admin.html`);
    console.log(`  📰  News / 📚 Library admin panels are built into news.html / library.html`);
    console.log('');
  });
}
