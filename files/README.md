# DayZeroFoundry — backend

Saves every submitted idea to MongoDB and emails **saisiddardh10@gmail.com** and
**abhinavrishisaka@gmail.com** whenever someone sends an idea.

## What's here
- `server.js` — the API (one endpoint: `POST /api/intake`)
- `package.json` — dependencies
- `.env.example` — the secrets template (copy to `.env`)

## Run it locally
1. Install Node 18+ if you don't have it.
2. In this folder: `npm install`
3. `cp .env.example .env` and fill in the values (see below).
4. `npm start` → API runs at `http://localhost:4000`

## Filling in `.env`
1. **MONGODB_URI** — make a free cluster at MongoDB Atlas, create a database user,
   and paste the connection string. Add a database name (e.g. `/dayzero`) before the `?`.
2. **SMTP_USER** — the Gmail address that will send the notification emails.
3. **SMTP_PASS** — a Gmail **App Password**, not your login password:
   Google Account → Security → 2-Step Verification (turn on) → App passwords →
   generate one → paste the 16 characters here.
4. **ALLOWED_ORIGIN** — keep `*` while testing; later set it to your site's URL.

## Connect the frontend
In `dayzerofoundry.html`, near the top of the `<script>`:
```js
var DEMO_MODE = false;                 // turn off demo mode
var API_URL   = 'https://YOUR-BACKEND-URL/api/intake';
```
While `DEMO_MODE = true`, the form just shows a success screen so you can preview the
page without a backend.

## Hosting
- **Render** or **Railway** are the easiest for an always-on Node server (free tiers exist).
  Push this folder to GitHub → New Web Service → build `npm install`, start `npm start`,
  add the same env vars in the dashboard.
- If you'd rather keep everything on **Vercel** (like veixon.com), this can be converted
  to a serverless function instead — say the word and I'll adapt it.

## Test it
```bash
curl -X POST http://localhost:4000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@gmail.com","idea":"An app that does X."}'
```
You should get back `{ "ok": true, "castId": "DZ-00-1234", ... }`, a new row in MongoDB,
and an email in both inboxes.
