// api/contact/index.js
// Vercel Serverless Function — Contact form via SendGrid

const express = require('express');
const cors    = require('cors');
const sgMail  = require('@sendgrid/mail');

const app = express();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '10kb' }));

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('SENDGRID_API_KEY not set');
}

// Sanitize user input to prevent header injection and XSS
function sanitize(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\r\n\t]/g, ' ')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .slice(0, maxLength)
    .trim();
}

// Simple rate limiting (in-memory; use Redis on multi-instance setups)
const submissions = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 5;
  const record = submissions.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count++;
  submissions.set(ip, record);
  return record.count > max;
}

app.post('/', async (req, res) => {
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

  const from = process.env.FROM_EMAIL;
  const to   = process.env.TO_EMAIL;

  if (!from || !to) {
    console.error('Missing FROM_EMAIL or TO_EMAIL environment variable');
    return res.status(500).json({ error: 'Could not send your message. Please try again later.' });
  }

  const msg = {
    to,
    from,
    replyTo: email,
    subject: `[BIC Contact] ${subject}`,
    text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
  };

  try {
    await sgMail.send(msg);
    res.json({ success: true, message: 'Message received successfully.' });
  } catch (error) {
    console.error('SendGrid error:', JSON.stringify(error.response?.body || error.message));
    res.status(500).json({ error: 'Could not send your message. Please try again later.' });
  }
});

module.exports = app;
