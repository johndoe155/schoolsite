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
  if (!ADMIN_TOKEN) problems.push('ADMIN_TOKEN is not set');
  if (ADMIN_TOKEN && ADMIN_TOKEN.length < 24) problems.push('ADMIN_TOKEN is shorter than 24 characters');
  if (problems.length) {
    console.error('\n❌ Refusing to start with NODE_ENV=production:\n   • ' + problems.join('\n   • ') +
      '\n\n   Copy .env.example to .env and set real values.\n');
    process.exit(1);
  }
}


/* ── JSON file helpers (atomic writes) ────────────────────────────────────── */

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJSON(file, data) {
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

function sanitize(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\r\n\t]/g, ' ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
      const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
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
  /* Header or JSON body only — never the query string. A token in a URL ends
     up in server logs, browser history and any Referer header. */
  const token = req.headers['x-admin-token'] || req.body?.token || '';
  if (!safeEqual(token, ADMIN_TOKEN)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

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
    date:      String(date || new Date().toISOString().slice(0, 10)),
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
  "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://esm.sh",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com",
  "connect-src 'self' https://esm.sh",
  "frame-src https://www.google.com",            // the contact/home map embeds
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', SITE_CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/* ══════════════════════════════════════════════════════════════════════════
   STATIC SITE
   ══════════════════════════════════════════════════════════════════════════ */

app.use(express.static(PUBLIC_DIR));

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
    return res.status(400).json({ ok: false, error: err.message || 'Bad request.' });
  }
  next();
});

/* API 404s as JSON */
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

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
