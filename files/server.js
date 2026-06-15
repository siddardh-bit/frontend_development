require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

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
function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
}

// ── the intake endpoint the page posts to ──
app.post('/api/intake', async (req, res) => {
  try {
    const { name, email, role = '', company = '', idea } = req.body || {};

    if (!name || !email || !idea) {
      return res.status(400).json({ error: 'Name, email and idea are required.' });
    }
    if (!isEmail(email)) {
      return res.status(400).json({ error: 'That email looks invalid.' });
    }

    const castId = genCastId();
    const doc = await Idea.create({ name, email, role, company, idea, castId });

    // notify the team (don't block the response on email delivery)
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
    }).catch(err => console.error('Email send error:', err.message));

    return res.json({ ok: true, castId, id: doc._id });
  } catch (err) {
    console.error('Intake error:', err);
    return res.status(500).json({ error: 'Something broke on our side. Please try again.' });
  }
});

// quick health check
app.get('/', (_req, res) => res.send('DayZeroFoundry API is running.'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`DayZeroFoundry API on :${PORT}`));
