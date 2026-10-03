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
    logLevel: 'warn',
    onError: (err, _req, res) => {
      const wantsJson = String(_req.originalUrl || '').includes('/api/');
      console.error(`[portal] proxy error → ${err.code || err.message}`);
      if (res.headersSent) return res.end();
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
    if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
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

function requireGalleryAuth(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(503).json({ ok: false, error: 'Gallery admin is not configured on this server.' });
  }
  const token = req.headers['x-admin-token'] || req.body?.token || req.query?.token || '';
  if (token !== ADMIN_TOKEN) {
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

app.post('/api/gallery', requireGalleryAuth, (req, res) => {
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
    content:   String(content),
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

const libraryLoginState = { attempts: 0, lockedUntil: 0 };
const LIBRARY_MAX_ATTEMPTS = 5;
const LIBRARY_LOCKOUT_MS   = 60_000;

app.post('/api/staff/login', (req, res) => {
  const now = Date.now();
  if (now < libraryLoginState.lockedUntil) {
    const secsLeft = Math.ceil((libraryLoginState.lockedUntil - now) / 1000);
    return res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${secsLeft}s.` });
  }

  const { passcode } = req.body || {};
  if (passcode !== STAFF_PASSCODE) {
    libraryLoginState.attempts += 1;
    if (libraryLoginState.attempts >= LIBRARY_MAX_ATTEMPTS) {
      libraryLoginState.lockedUntil = now + LIBRARY_LOCKOUT_MS;
      libraryLoginState.attempts = 0;
      return res.status(429).json({ ok: false, error: 'Too many failed attempts. Locked out for 60 seconds.' });
    }
    return res.status(401).json({ ok: false, error: 'Incorrect passcode.' });
  }

  libraryLoginState.attempts = 0;
  libraryLoginState.lockedUntil = 0;
  return res.json({ ok: true, token: crypto.randomBytes(24).toString('hex') });
});

app.post('/api/library/upload', libraryUpload.single('file'), (req, res) => {
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
