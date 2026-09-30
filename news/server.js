'use strict';

const express        = require('express');
const session        = require('express-session');
const FileStore      = require('session-file-store')(session);
const rateLimit      = require('express-rate-limit');
const helmet         = require('helmet');
const multer         = require('multer');
const fs             = require('fs');
const path           = require('path');
const crypto         = require('crypto');
require('dotenv').config();

// ─────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────
const PORT           = process.env.PORT           || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-now';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const NODE_ENV       = process.env.NODE_ENV       || 'development';

if (ADMIN_PASSWORD === 'change-me-now') {
  console.warn('\n⚠️  WARNING: You are using the default admin password.');
  console.warn('   Set ADMIN_PASSWORD in your .env file before going live.\n');
}

// ─────────────────────────────────────────────
//  Directory bootstrap
// ─────────────────────────────────────────────
const DATA_DIR     = path.join(__dirname, 'data');
const UPLOADS_DIR  = path.join(__dirname, 'uploads');
const POSTS_FILE   = path.join(DATA_DIR,  'posts.json');
const CONFIG_FILE  = path.join(DATA_DIR,  'config.json');
const SESSIONS_DIR = path.join(DATA_DIR,  'sessions');

[DATA_DIR, UPLOADS_DIR, SESSIONS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(POSTS_FILE))  fs.writeFileSync(POSTS_FILE,  JSON.stringify([], null, 2));
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({ featuredId: null }, null, 2));

// ─────────────────────────────────────────────
//  JSON helpers (atomic writes via tmp rename)
// ─────────────────────────────────────────────
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return fallback; }
}
function writeJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const readPosts   = () => readJSON(POSTS_FILE,  []);
const readConfig  = () => readJSON(CONFIG_FILE, { featuredId: null });
const writePosts  = data => writeJSON(POSTS_FILE,  data);
const writeConfig = data => writeJSON(CONFIG_FILE, data);

// ─────────────────────────────────────────────
//  Multer — image upload storage
// ─────────────────────────────────────────────
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req,  file, cb) => {
    // Produce a collision-safe name: timestamp-randomhex.ext
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
  },
});

// ─────────────────────────────────────────────
//  Express app
// ─────────────────────────────────────────────
const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'https:', 'http:'],
      connectSrc:  ["'self'"],
    },
  },
}));

// Body parsers (JSON + form) — NOT applied to file upload routes; multer handles those
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Sessions
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

// Login rate-limiter
const loginLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            10,
  message:        { error: 'Too many login attempts — please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ─────────────────────────────────────────────
//  Static assets
// ─────────────────────────────────────────────
// Serve uploaded article images (publicly readable)
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve other static asset folders that may sit alongside server.js
['images', 'css', 'js', 'fonts'].forEach(dir => {
  const full = path.join(__dirname, dir);
  if (fs.existsSync(full)) app.use('/' + dir, express.static(full));
});

// ─────────────────────────────────────────────
//  Auth middleware
// ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized — please log in.' });
}

// ─────────────────────────────────────────────
//  API Routes
// ─────────────────────────────────────────────

// ── Auth ──────────────────────────────────────
app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  if (typeof password !== 'string' || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  req.session.authenticated = true;
  req.session.loginAt       = new Date().toISOString();
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ── Posts ─────────────────────────────────────
app.get('/api/posts', (_req, res) => {
  res.json(readPosts());
});

// POST /api/posts — accepts multipart/form-data (image file + text fields)
app.post(
  '/api/posts',
  requireAuth,
  upload.single('image'),        // multer processes the image field; other fields go into req.body
  (req, res) => {
    const { title, category, date, excerpt, content, setFeatured } = req.body;

    if (!title || !excerpt || !content) {
      // Clean up uploaded file if validation fails
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'title, excerpt and content are required.' });
    }

    const DEFAULT_IMAGE =
      'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=1200&q=60';

    // Build the image URL: prefer the uploaded file, fall back to default
    const imageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : DEFAULT_IMAGE;

    const post = {
      id:         Date.now(),
      title:      String(title).trim(),
      category:   String(category || 'Announcements').trim(),
      date:       String(date || new Date().toISOString().slice(0, 10)),
      excerpt:    String(excerpt).trim(),
      image:      imageUrl,
      content:    String(content),
      createdAt:  new Date().toISOString(),
    };

    const posts = readPosts();
    posts.unshift(post);
    writePosts(posts);

    if (setFeatured === '1') {
      const config = readConfig();
      config.featuredId = post.id;
      writeConfig(config);
      post.isFeatured = true;
    }

    res.status(201).json(post);
  }
);

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const id    = Number(req.params.id);
  const posts = readPosts();
  const idx   = posts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found.' });

  const [removed] = posts.splice(idx, 1);
  writePosts(posts);

  // Delete the uploaded image file (if it was a local upload, not an external URL)
  if (removed.image && removed.image.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, removed.image);
    fs.unlink(filePath, () => {}); // silent — file may already be gone
  }

  // If the deleted post was featured, fall back to the next available post
  const config = readConfig();
  if (config.featuredId === id) {
    config.featuredId = posts.length > 0 ? posts[0].id : null;
    writeConfig(config);
  }

  res.json({ success: true, deletedId: id });
});

// ── Config ────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json(readConfig());
});

app.put('/api/config/featured', requireAuth, (req, res) => {
  const { featuredId } = req.body;
  if (featuredId == null) return res.status(400).json({ error: 'featuredId is required.' });

  const posts = readPosts();
  if (!posts.some(p => p.id === Number(featuredId))) {
    return res.status(404).json({ error: 'No post with that id.' });
  }

  const config = readConfig();
  config.featuredId = Number(featuredId);
  writeConfig(config);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
//  Serve the news page
// ─────────────────────────────────────────────
app.get(['/', '/NewsPage.html', '/index.html'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'NewsPage_v2.html'));
});

// ─────────────────────────────────────────────
//  Error handlers
// ─────────────────────────────────────────────
// Multer-specific errors (file too large, wrong type)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Image too large — maximum size is 5 MB.' });
    }
    return res.status(400).json({ error: 'Invalid file — only JPG, PNG, GIF and WebP are accepted.' });
  }
  next(err);
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

// Generic error
app.use((err, _req, res, _next) => {
  console.error('[Server error]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─────────────────────────────────────────────
//  Start
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  BIC News server running → http://localhost:${PORT}`);
  console.log(`   Data    : ${DATA_DIR}`);
  console.log(`   Uploads : ${UPLOADS_DIR}`);
  console.log(`   Env     : ${NODE_ENV}\n`);
});
