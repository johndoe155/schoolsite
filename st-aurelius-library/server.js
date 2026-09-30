/**
 * St. Aurelius Library — Backend Server
 * Handles staff auth, PDF uploads, and asset catalog persistence.
 *
 * Uploaded PDFs are saved to:  ./library-section/assets/<timestamp>_<hex>.pdf
 * Catalog metadata is saved to: ./library-section/assets/catalog.json
 */

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Configuration ────────────────────────────────────────────────────────────
const STAFF_PASSCODE = process.env.STAFF_PASSCODE || 'admin123';
const ASSETS_DIR     = path.join(__dirname, 'library-section', 'assets');
const CATALOG_FILE   = path.join(ASSETS_DIR, 'catalog.json');

// Ensure the assets directory exists on first run
fs.mkdirSync(ASSETS_DIR, { recursive: true });


// ── Catalog helpers (simple JSON file as a lightweight database) ─────────────
function loadCatalog() {
    if (!fs.existsSync(CATALOG_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    } catch {
        return [];
    }
}

function saveCatalog(catalog) {
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf8');
}


// ── Multer (file upload) configuration ──────────────────────────────────────
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ASSETS_DIR),
    filename: (_req, _file, cb) => {
        // Produce a collision-resistant name: <unix-ms>_<6-char-hex>.pdf
        const timestamp  = Date.now();
        const randomHex  = crypto.randomBytes(3).toString('hex');
        cb(null, `${timestamp}_${randomHex}.pdf`);
    }
});

const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new Error('Only PDF files are allowed.'));
        }
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});


// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());

// Serve the entire project folder as static (index.html, CSS, etc.)
app.use(express.static(__dirname));

// Serve uploaded PDFs under their canonical URL path
app.use(
    '/library-section/assets',
    express.static(ASSETS_DIR)
);


// ── Simple in-memory rate limiter for login ──────────────────────────────────
const loginState = { attempts: 0, lockedUntil: 0 };
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 60_000; // 60 seconds


// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/staff/login
 * Body: { passcode: string }
 * Returns: { ok: true, token: string } | { ok: false, error: string }
 */
app.post('/api/staff/login', (req, res) => {
    const now = Date.now();

    // Rate-limit check
    if (now < loginState.lockedUntil) {
        const secsLeft = Math.ceil((loginState.lockedUntil - now) / 1000);
        return res.status(429).json({
            ok: false,
            error: `Too many attempts. Try again in ${secsLeft}s.`
        });
    }

    const { passcode } = req.body;

    if (passcode !== STAFF_PASSCODE) {
        loginState.attempts += 1;
        if (loginState.attempts >= MAX_ATTEMPTS) {
            loginState.lockedUntil = now + LOCKOUT_MS;
            loginState.attempts    = 0;
            return res.status(429).json({
                ok: false,
                error: 'Too many failed attempts. Locked out for 60 seconds.'
            });
        }
        return res.status(401).json({ ok: false, error: 'Incorrect passcode.' });
    }

    // Success — reset counter, issue a simple opaque token
    loginState.attempts   = 0;
    loginState.lockedUntil = 0;
    const token = crypto.randomBytes(24).toString('hex');

    return res.json({ ok: true, token });
});


/**
 * POST /upload
 * Multipart form-data: file (PDF), title, subject, type, year, author
 * Returns: { message, asset }
 */
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ ok: false, error: 'No file received.' });
    }

    const { title, subject, type, year, author } = req.body;

    if (!title || !subject || !type || !year) {
        // Remove the orphaned file if metadata is incomplete
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ ok: false, error: 'Missing required metadata fields.' });
    }

    const newAsset = {
        id:         req.file.filename.split('_')[0], // timestamp portion
        title,
        subject,
        type,
        year:       parseInt(year, 10),
        author:     author?.trim() || 'Unknown',
        // Thumbnail — can be swapped for a real cover image later
        thumb:      'https://images.unsplash.com/photo-1543286386-713df548e9cc?auto=format&fit=crop&q=80&w=400',
        // Public URL that the browser can fetch directly
        pdf:        `/library-section/assets/${req.file.filename}`,
        _filename:  req.file.filename,
        uploadedAt: new Date().toISOString()
    };

    const catalog = loadCatalog();
    catalog.unshift(newAsset);   // newest first
    saveCatalog(catalog);

    console.log(`[upload] Saved → ${req.file.filename}  (${req.file.size} bytes)`);

    return res.json({ message: 'File uploaded successfully', asset: newAsset });
});


/**
 * GET /api/assets
 * Returns the full catalog JSON array (newest first).
 */
app.get('/api/assets', (_req, res) => {
    res.json(loadCatalog());
});


// ── Error handler (catches multer errors, etc.) ──────────────────────────────
app.use((err, _req, res, _next) => {
    console.error('[error]', err.message);
    res.status(400).json({ ok: false, error: err.message });
});


// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n  St. Aurelius Library server`);
    console.log(`  → http://localhost:${PORT}\n`);
    console.log(`  Assets saved to: ${ASSETS_DIR}`);
    console.log(`  Catalog file:    ${CATALOG_FILE}\n`);
});
