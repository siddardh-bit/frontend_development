require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ── people who get notified on every new idea ──
const NOTIFY = ['saisiddardh10@gmail.com', 'abhinavrishisaka@gmail.com'];

// ── database ──
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

const ideaSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  email:   { type: String, required: true, trim: true, lowercase: true },
  role:    { type: String, trim: true, default: '' },
  company: { type: String, trim: true, default: '' },
  idea:    { type: String, required: true, trim: true },
  castId:  { type: String, index: true },
  ip:      { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
const Idea = mongoose.model('Idea', ideaSchema);

// ── email (Gmail App Password — see README) ──
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

// ── in-memory rate limiting map: ip -> Array of timestamps ──
const rateLimits = {};
const LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_SUBMISSIONS = 5;

function rateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const now = Date.now();

  if (!rateLimits[ip]) {
    rateLimits[ip] = [];
  }

  // Filter timestamps outside of the window
  rateLimits[ip] = rateLimits[ip].filter(timestamp => now - timestamp < LIMIT_WINDOW_MS);

  if (rateLimits[ip].length >= MAX_SUBMISSIONS) {
    return res.status(429).json({ error: 'Too many submissions. Please try again later.' });
  }

  rateLimits[ip].push(now);
  next();
}

function genCastId() {
  return 'DZ-00-' + Math.floor(1 + Math.random() * 9999).toString().padStart(4, '0');
}
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
}
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
}

// ── the intake endpoint the page posts to ──
app.post('/api/intake', rateLimiter, async (req, res) => {
  try {
    const { name, email, role = '', company = '', idea, company_url } = req.body || {};

    // 1. Honeypot check (silently accept, do not send email or save to DB)
    if (company_url) {
      console.log(`[Spam Blocked] Honeypot triggered by IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
      const fakeCastId = genCastId();
      return res.json({ ok: true, castId: fakeCastId });
    }

    if (!name || !email || !idea) {
      return res.status(400).json({ error: 'Name, email and idea are required.' });
    }

    const sanitizedName = sanitize(name);
    const sanitizedEmail = sanitize(email).toLowerCase();
    const sanitizedRole = sanitize(role);
    const sanitizedCompany = sanitize(company);
    const sanitizedIdea = sanitize(idea);

    // 2. Server-side validation length caps
    if (sanitizedName.length > 120) {
      return res.status(400).json({ error: 'Name must be 120 characters or less.' });
    }
    if (sanitizedEmail.length > 200 || !isEmail(sanitizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email under 200 characters.' });
    }
    if (sanitizedRole.length > 200) {
      return res.status(400).json({ error: 'Role must be 200 characters or less.' });
    }
    if (sanitizedCompany.length > 200) {
      return res.status(400).json({ error: 'Company must be 200 characters or less.' });
    }
    if (sanitizedIdea.length < 20) {
      return res.status(400).json({ error: 'Your idea must be at least 20 characters.' });
    }
    if (sanitizedIdea.length > 4000) {
      return res.status(400).json({ error: 'Your idea must be 4000 characters or less.' });
    }

    const castId = genCastId();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    
    // Save to Database
    const doc = await Idea.create({ 
      name: sanitizedName, 
      email: sanitizedEmail, 
      role: sanitizedRole, 
      company: sanitizedCompany, 
      idea: sanitizedIdea, 
      castId,
      ip 
    });

    // Notify the team (fire-and-forget)
    transporter.sendMail({
      from: `"DayZeroFoundry" <${process.env.SMTP_USER}>`,
      replyTo: sanitizedEmail,
      to: NOTIFY.join(','),
      subject: `New idea — ${sanitizedName} (${castId})`,
      text:
`New DayZeroFoundry intake

Cast ID : ${castId}
Name    : ${sanitizedName}
Email   : ${sanitizedEmail}
Role    : ${sanitizedRole || '—'}
Company : ${sanitizedCompany || '—'}
IP      : ${ip}

Idea
----
${sanitizedIdea}
`
    }).catch(err => console.error('Team email notification send error:', err.message));

    // Notify the submitter (fire-and-forget)
    transporter.sendMail({
      from: `"DayZeroFoundry" <${process.env.SMTP_USER}>`,
      to: sanitizedEmail,
      subject: `We've received your idea! (${castId})`,
      text:
`Hi ${sanitizedName},

We've successfully received your idea for the forge!

Your reference/cast ID is: ${castId}

Our team will review it and get back to you soon at this email address. Keep an eye on your inbox.

Warmly,
The DayZeroFoundry / Veixon Team
https://www.veixon.com
`
    }).catch(err => console.error('Submitter email confirmation send error:', err.message));

    return res.json({ ok: true, castId, id: doc._id });
  } catch (err) {
    console.error('Intake error:', err);
    return res.status(500).json({ error: 'Something broke on our side. Please try again.' });
  }
});

// Serve the intake frontend page
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dayzerofoundry.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`DayZeroFoundry API on :${PORT}`));
