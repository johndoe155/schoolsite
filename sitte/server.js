
/**
 * BIC Admin Server — server.js
 * 
 * Run with:
 *   node server.js
 * 
 * Serves your entire website on http://localhost:3000
 * AND handles all admin API calls at /admin-api.php
 * 
 * Requirements: Node.js 14+
 * Install once:  npm install express multer cors
 */

require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');

// ── Config ──────────────────────────────────────────────────────────────────
const PORT          = 3000;
const ADMIN_PASS = process.env.ADMIN_TOKEN;
if (!ADMIN_PASS) {
  console.error('FATAL: ADMIN_TOKEN environment variable is not set.');
  process.exit(1);
}                         // must match admin.html
const GALLERY_JSON  = path.join(__dirname, 'gallery-data.json');
const IMAGES_DIR    = path.join(__dirname, 'images');
const ALLOWED_MIME  = ['image/jpeg','image/png','image/webp','image/gif'];
const MAX_BYTES     = 8 * 1024 * 1024;  // 8 MB

// Contact form / SMTP config
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const TO_EMAIL   = process.env.TO_EMAIL;
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !TO_EMAIL) {
  console.warn('⚠️  Contact form: one or more SMTP env vars (SMTP_HOST, SMTP_USER, SMTP_PASS, TO_EMAIL) are missing.');
  console.warn('    The /api/contact route will return 500 until these are set in .env');
}
const mailer = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});
// ────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// ── Serve the whole site as static files ────────────────────────────────────
app.use(express.static(__dirname));

// ── Auth middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.body?.token || req.query?.token || '';
  if (token !== ADMIN_PASS) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

// ── Multer (handles file uploads) ───────────────────────────────────────────
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename:    (_req, file, cb) => {
    const base = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const ext  = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif' }[file.mimetype] || 'jpg';
    cb(null, `${base}-${Date.now()}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    ALLOWED_MIME.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`Unsupported type: ${file.mimetype}`));
  }
});

// ── Routes ───────────────────────────────────────────────────────────────────

// ── Contact form ─────────────────────────────────────────────────────────────
function sanitize(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\r\n\t]/g, ' ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, maxLength)
    .trim();
}

const contactSubmissions = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const max = 5;
  const record = contactSubmissions.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count++;
  contactSubmissions.set(ip, record);
  return record.count > max;
}

app.post('/api/contact', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages. Please wait 15 minutes and try again.' });
  }

  const name    = sanitize(req.body?.name,    100);
  const email   = sanitize(req.body?.email,   254);
  const subject = sanitize(req.body?.subject, 200);
  const message = sanitize(req.body?.message, 5000);

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !TO_EMAIL) {
    console.error('Contact form misconfigured: missing SMTP env vars.');
    return res.status(500).json({ error: 'Could not send your message. Please try again later.' });
  }

  try {
    await mailer.sendMail({
      from: SMTP_USER,
      to: TO_EMAIL,
      replyTo: email,
      subject: `[BIC Contact] ${subject}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
    });
    return res.json({ success: true, message: 'Message received successfully.' });
  } catch (err) {
    console.error('SMTP send error:', err.message);
    return res.status(500).json({ error: 'Could not send your message. Please try again later.' });
  }
});

// GET gallery
app.get('/admin-api.php', requireAuth, (req, res) => {
  if (req.query.action !== 'get_gallery') {
    return res.status(400).json({ ok: false, error: 'Unknown action' });
  }
  if (!fs.existsSync(GALLERY_JSON)) {
    const demo = [
      { id:'item-001', title:'Science Fair 2024',  subtitle:'Innovation & Technology', images:['images/gallery1.jpg','images/gallery1-2.jpg','images/gallery1-3.jpg'] },
      { id:'item-002', title:'Sports Day',          subtitle:'Athletics & Teamwork',    images:['images/gallery1.jpg'] },
      { id:'item-003', title:'Cultural Festival',   subtitle:'Diversity & Arts',        images:['images/gallery1.jpg'] }
    ];
    fs.writeFileSync(GALLERY_JSON, JSON.stringify(demo, null, 2));
  }
  res.json(JSON.parse(fs.readFileSync(GALLERY_JSON, 'utf8')));
});

// POST actions
app.post('/admin-api.php', requireAuth, (req, res, next) => {
  const action = req.query.action;

  // ── save_gallery ──────────────────────────────────────────────────────────
  if (action === 'save_gallery') {
    const data = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ ok: false, error: 'Expected JSON array' });
    const clean = data.map(item => ({
      id:       String(item.id       || ('item-' + Date.now())).replace(/[^a-z0-9\-]/gi,''),
      title:    String(item.title    || ''),
      subtitle: String(item.subtitle || ''),
      images:   (item.images || []).map(String).filter(Boolean)
    }));
    try {
      fs.writeFileSync(GALLERY_JSON, JSON.stringify(clean, null, 2));
      return res.json({ ok: true, message: 'Gallery saved.' });
    } catch (e) {
      console.error('Gallery write failed:', e.message);
      return res.status(500).json({ ok: false, error: 'Could not save gallery. Please try again.' });
    }
  }

  // ── delete_image ──────────────────────────────────────────────────────────
  if (action === 'delete_image') {
    const rel  = String(req.body?.path || '').replace(/^\/+/, '');
    if (!/^images\/[a-zA-Z0-9_\-\.]+$/.test(rel)) {
      return res.status(400).json({ ok: false, error: 'Invalid path.' });
    }
    const full = path.join(__dirname, rel);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return res.json({ ok: true, message: 'Deleted.' });
  }

  // ── upload_image ─────────────────────────────────────────────────────────
  if (action === 'upload_image') {
    return upload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, error: err.message });
      if (!req.file) return res.status(400).json({ ok: false, error: 'No file received.' });
      return res.json({ ok: true, path: 'images/' + req.file.filename });
    });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action: ' + action });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ✅  BIC Admin Server running');
  console.log(`  🌐  Website:  http://localhost:${PORT}`);
  console.log(`  🔐  Admin:    http://localhost:${PORT}/admin.html`);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

