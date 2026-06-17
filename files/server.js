require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ── people who get notified on every new idea ──
const NOTIFY = ['saisiddardh10@gmail.com', 'abhinavrishisaka@gmail.com'];

// ── database ──
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

const ideaSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true, maxlength: 120 },
  email:   { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  role:    { type: String, trim: true, default: '', maxlength: 200 },
  company: { type: String, trim: true, default: '', maxlength: 200 },
  idea:    { type: String, required: true, trim: true, maxlength: 4000 },
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

function genCastId() {
  return 'DZ-00-' + Math.floor(1 + Math.random() * 9999).toString().padStart(4, '0');
}
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || ''); }
function cap(v, n) { return String(v || '').trim().slice(0, n); }

// ── simple per-IP rate limit: max 5 / 10 min (swap for Redis/Upstash at scale) ──
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), windowMs = 10 * 60 * 1000, max = 5;
  const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

// ── intake endpoint ──
app.post('/api/intake', async (req, res) => {
  try {
    const b = req.body || {};

    // honeypot: bots fill this; pretend success and drop it
    if (b.company_url) return res.json({ ok: true, castId: genCastId() });

    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (rateLimited(ip)) return res.status(429).json({ error: 'Too many submissions — please try again in a bit.' });

    const name    = cap(b.name, 120);
    const email   = cap(b.email, 200).toLowerCase();
    const role    = cap(b.role, 200);
    const company = cap(b.company, 200);
    const idea    = cap(b.idea, 4000);

    if (!name || !email || !idea) return res.status(400).json({ error: 'Name, email and idea are required.' });
    if (!isEmail(email))          return res.status(400).json({ error: 'That email looks invalid.' });
    if (idea.length < 20)         return res.status(400).json({ error: 'Please add a little more detail to your idea.' });

    const castId = genCastId();
    const doc = await Idea.create({ name, email, role, company, idea, castId, ip });

    // 1) notify the team
    transporter.sendMail({
      from: `"DayZeroFoundry" <${process.env.SMTP_USER}>`,
      replyTo: email,
      to: NOTIFY.join(','),
      subject: `New idea — ${name} (${castId})`,
      text:
`New DayZeroFoundry intake

Cast ID : ${castId}
Name    : ${name}
Email   : ${email}
Role    : ${role || '—'}
Company : ${company || '—'}

Idea
----
${idea}
`
    }).catch(err => console.error('Team email error:', err.message));

    // 2) confirmation to the submitter
    transporter.sendMail({
      from: `"DayZeroFoundry (Veixon)" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `We've got your idea — ${castId}`,
      text:
`Hi ${name},

Thanks for trusting us with your idea — it's in the forge.

Your reference is ${castId}. A real person from our team reads every submission,
and we'll reach out to you soon. Your idea stays confidential and remains yours.

— The DayZeroFoundry team, by Veixon
https://www.veixon.com
`
    }).catch(err => console.error('Confirmation email error:', err.message));

    return res.json({ ok: true, castId, id: doc._id });
  } catch (err) {
    console.error('Intake error:', err);
    return res.status(500).json({ error: 'Something broke on our side. Please try again.' });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dayzerofoundry.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`DayZeroFoundry API on :${PORT}`));
