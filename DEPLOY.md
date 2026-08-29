# REACH — Deploy Guide
### GitHub · Supabase · Render (backend) · Vercel (frontend)

---

## Overview

```
Supabase  ←── PostgreSQL database
Upstash   ←── Redis (OTP sessions + rate limiting)
Render    ←── FastAPI backend   → https://reach-api.onrender.com
Vercel    ←── React frontend    → https://reach-xyz.vercel.app
```

---

## Before You Start

You need accounts on all four platforms. All have free tiers that work for this:

- [supabase.com](https://supabase.com) — create a project, pick a region close to your users (e.g. EU West for Nigeria)
- [upstash.com](https://upstash.com) — create a Redis database, copy the `REDIS_URL`
- [render.com](https://render.com) — you'll connect your GitHub repo here
- [vercel.com](https://vercel.com) — you'll connect your GitHub repo here
- [cloudinary.com](https://cloudinary.com) — create a free account, copy cloud name + API key + secret

You also need:
- Python 3.11+ and Node 18+ installed locally
- A Gmail account with 2FA enabled (needed for App Passwords)

---

## Step 1 — Clone and push to GitHub

If you haven't already pushed the clean codebase:

```bash
git clone https://github.com/Xtley001/reach.git   # or use your local copy
cd reach
git init
git add .
git commit -m "REACH — production release"
git remote add origin https://github.com/Xtley001/reach.git
git branch -M main
git push origin main --force
```

> If prompted for credentials, use your GitHub username and a **Personal Access Token** (not your password). Generate one at: GitHub → Settings → Developer Settings → Personal access tokens → Tokens (classic) → Generate new token → check `repo`.

---

## Step 2 — Run SQL migrations in Supabase

Open your **Supabase project → SQL Editor**.

Run these two files in order — paste each one and click **Run**:

Paste the entire contents of `migrations/schema.sql` and click **Run**. This is one idempotent file that creates all tables, enums, indexes, and constraints.

Only needs to run once on a fresh database. Safe to re-run — every statement uses `IF NOT EXISTS`.

After running, go to **Supabase → Table Editor** and confirm you see tables: `users`, `hubs`, `campaigns`, `contacts`, `invite_tokens`.

Alternatively, with `psql` installed locally:
```bash
export DATABASE_URL="postgresql://..."
make db
```

---

## Step 3 — Set up your .env locally

The `.env` file lives at the **project root**, not inside `backend/`.

```bash
cp backend/.env.example .env
```

Fill in every value:

```dotenv
# ── Database ──────────────────────────────────────────────────────────────────
# Supabase → Settings → Database → Connection string → Session mode (port 5432)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# ── JWT ───────────────────────────────────────────────────────────────────────
# Run: openssl rand -hex 64
JWT_SECRET_KEY=paste_your_64_char_hex_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30
SESSION_INACTIVITY_HOURS=168

# ── OTP ───────────────────────────────────────────────────────────────────────
OTP_PROVIDER=email

# ── Email (Gmail SMTP) ────────────────────────────────────────────────────────
# Gmail → Account → Security → 2-Step Verification → App Passwords → create one
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx

ADMIN_BACKUP_EMAIL=your@gmail.com

# ── SMS (Termii) ──────────────────────────────────────────────────────────────
TERMII_API_KEY=your_termii_api_key
TERMII_SENDER_ID=REACH

# ── Supabase Storage (I-93/94) ───────────────────────────────────────────────
# Replaces Cloudinary (see "Why Supabase Storage, not Cloudinary" below).
# Supabase dashboard → Storage → New bucket → name "avatars" → Public bucket: ON
# Supabase dashboard → Settings → API → service_role key (NOT anon — server-side only)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_AVATARS_BUCKET=avatars

# ── Cloudinary (DEPRECATED — I-94) ───────────────────────────────────────────
# Leave blank once SUPABASE_URL above is set. Kept only as an emergency
# rollback path — storage.py prefers Supabase automatically when configured.
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# ── Redis (Upstash) ───────────────────────────────────────────────────────────
# Upstash → your database → copy the full rediss:// URL
REDIS_URL=rediss://default:YOUR_TOKEN@your-instance.upstash.io:6379

# ── App ───────────────────────────────────────────────────────────────────────
ENVIRONMENT=production
ALLOWED_ORIGINS=https://your-app.vercel.app
FRONTEND_URL=https://your-app.vercel.app
```

To generate your JWT secret:
```bash
openssl rand -hex 64
```

### How to get your Gmail App Password

1. Go to your Google Account → **Security**
2. Make sure **2-Step Verification** is enabled (required — App Passwords won't appear without it)
3. Search for **App Passwords** in the Google Account search bar
4. App name: `REACH` → click **Create**
5. Copy the 16-character password (shown once) → paste into `SMTP_PASS`

---

## Step 4 — Create a Python venv and seed your admin accounts

Do this from your local machine — it connects directly to Supabase via `DATABASE_URL` in your `.env`.

```bash
# From project root
python3 -m venv venv

# Activate — macOS / Linux:
source venv/bin/activate
source venv/Scripts/activate


# Activate — Windows PowerShell:
# venv\Scripts\Activate.ps1

# Activate — Windows CMD:
# venv\Scripts\activate.bat

# Install dependencies
pip install -r backend/requirements.txt

# Option A — using make (recommended)
export SEED_ADMIN_EMAIL=your@gmail.com
export SEED_ADMIN_PHONE=+2349XXXXXXXXX
make seed

# Option B — direct python
python -m backend.seed_admin \
  --email your@gmail.com \
  --phone +2349XXXXXXXXX
```

This creates three accounts in your Supabase database, all `status=active`:

| Role | Login identifier | Login URL |
|------|-----------------|-----------|
| Minister | `your@gmail.com` and your phone | `/admin` |
| Hub Leader | `your+hub@gmail.com` | `/hub-login` |
| Volunteer | `your+vol@gmail.com` | `/login` (email tab) |

Gmail automatically routes `+hub` and `+vol` addresses to your main inbox, so all OTPs arrive in one place.

**Verify it worked:**
```bash
# Expected: 3 rows, all status=active
```
Or check Supabase → Table Editor → `users` table — you should see all three rows.

Safe to re-run — the script is idempotent (it updates existing rows rather than duplicating).

---

## Step 5 — Deploy Backend to Render

### 5.1 Create the Web Service

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub account if you haven't already
3. Select the `Xtley001/reach` repository
4. Fill in:

| Field | Value |
|-------|-------|
| **Name** | `reach-api` |
| **Region** | Frankfurt EU (closest to Nigeria) |
| **Branch** | `main` |
| **Runtime** | Python 3 |
| **Build Command** | `pip install -r backend/requirements.txt` |
| **Start Command** | `alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | Starter ($7/mo) — use this, not Free, to avoid cold-start sleep |

### 5.2 Set environment variables on Render

In the Render dashboard → your service → **Environment** → add each of these:

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Your Supabase Session mode connection string |
| `JWT_SECRET_KEY` | Your `openssl rand -hex 64` output |
| `JWT_ALGORITHM` | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` |
| `SESSION_INACTIVITY_HOURS` | `168` |
| `OTP_PROVIDER` | `email` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | your 16-char Gmail App Password |
| `ADMIN_BACKUP_EMAIL` | your Gmail address |
| `TERMII_API_KEY` | from Termii dashboard |
| `TERMII_SENDER_ID` | `REACH` |
| `CLOUDINARY_CLOUD_NAME` | from Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | from Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | from Cloudinary dashboard |
| `REDIS_URL` | your Upstash `rediss://` URL |
| `ALLOWED_ORIGINS` | your Vercel URL — **come back and update this after step 6** |
| `FRONTEND_URL` | your Vercel URL — **come back and update this after step 6** |

### 5.3 Deploy and confirm

Click **Deploy**. Watch the build logs — it should end with:

```
INFO:     Application startup complete.
```

Then hit your health endpoint:
```
https://reach-api.onrender.com/health
```
Expected response: `{"status": "ok", "service": "reach-api"}`

If it 404s, wait 2 minutes for the first deploy to finish and try again.

---

## Step 6 — Deploy Frontend to Vercel

### 6.1 Update vercel.json with your Render URL

Before pushing, edit `vercel.json` in the project root:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://reach-api.onrender.com/:path*"
    },
    {
      "source": "/((?!api/).*)",
      "destination": "/index.html"
    }
  ]
}
```

Replace `reach-api.onrender.com` with your actual Render service URL.

Commit and push:
```bash
git add vercel.json
git commit -m "set render backend url"
git push
```

### 6.2 Create the Vercel project

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Import `Xtley001/reach` from GitHub
3. Fill in:

| Field | Value |
|-------|-------|
| **Framework Preset** | Vite |
| **Root Directory** | `frontend` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |

### 6.3 Set environment variables on Vercel

In the Vercel project → **Settings** → **Environment Variables** → add:

```
VITE_API_URL = https://reach-api.onrender.com/api
```

Replace with your actual Render URL.

### 6.4 Deploy

Click **Deploy**. Vercel builds and gives you a URL like `https://reach-xyz.vercel.app`.

### 6.5 Go back to Render and update CORS

Now that you have your Vercel URL, go back to Render → your service → **Environment** and update:

```
ALLOWED_ORIGINS = https://reach-xyz.vercel.app
FRONTEND_URL    = https://reach-xyz.vercel.app
```

Click **Save** — Render will redeploy automatically. Wait for it to finish before testing.

---

## Step 7 — Pre-Launch Checklist

Run this from the project root first:

```bash
chmod +x check-deploy.sh
./check-deploy.sh
```

Must be 10/10 before you share the URL with anyone.

Then open a **private/incognito browser window** and go through each check:

| Check | URL | Expected |
|---|---|---|
| Backend health | `https://reach-api.onrender.com/health` | `{"status":"ok"}` |
| Landing page loads | `/` | Dark hero, amber text, two CTAs |
| Volunteer login | `/login` (email tab) | OTP arrives in Gmail within 30s |
| Volunteer dashboard | after OTP | Contact list, stats, add button |
| Add contact | `/vol/add` | Form submits, contact appears in list |
| Hub leader login | `/hub-login` | OTP → hub dashboard |
| Approve a volunteer | pending queue in hub dashboard | Volunteer status flips to active |
| Minister login | `/admin` | OTP → full dashboard with charts |
| Hub drilldown | click any hub | Volunteer cards with stats |
| Volunteer detail | click any volunteer | Full contact list |
| Demographics | `/admin-panel/demographics` | Status chart + hub breakdown |

---

## Step 8 — Onboarding Real Users

The system is live. Here's the order:

**1. Create your campaign and hubs**
Minister dashboard → Campaigns → New Campaign → fill in name, programme date, venue, target count → Save.
Then add each hub (name + zone).

**2. Invite hub leaders**
Minister dashboard → Volunteers → Invite Hub Leader → select hub → enter the hub leader's phone number → Generate link.
Copy the invite link and send it to them via WhatsApp or SMS.
The link expires in 7 days (D-46 — bumped from the original 48h, which was too tight for real onboarding pace if someone doesn't check their phone same-day). The hub leader clicks it, enters their name, requests OTP, verifies — they land directly on their dashboard. No approval step.

**3. Share the sign-up link with volunteers**
Send your Vercel URL to volunteers. They visit `/` → "Join as a volunteer" → enter name, phone, select hub → OTP.
New volunteer accounts start as `status=pending`.

**4. Hub leaders approve pending volunteers**
Hub leader dashboard shows a pending queue. They review and approve — the volunteer can now log in and start adding contacts.

---

## Why Supabase Storage, not Cloudinary (I-92/93/94/95/96)

Cloudinary was used for exactly one thing: uploading a pre-cropped 400×400
profile avatar (`backend/storage.py`). No video, no on-the-fly transforms
beyond `quality:auto`/`fetch_format:auto`, no CDN-heavy media pipeline.

The app already runs on Supabase for Postgres. Supabase Storage
(S3-compatible file storage, its own CDN and image transforms) is part of
the same project at no extra signup. For a workload this small — one small
image per user — a second file-storage vendor was one more API key to
leak, one more service that can go down independently, and one more
dependency in `requirements.txt` for zero real benefit.

**Migration**: `storage.py` now calls the Supabase Storage REST API
directly (`upload_avatar`/`delete_avatar` keep the exact same function
signatures as before, so nothing else in the codebase changed). It
auto-falls-back to Cloudinary only if `SUPABASE_URL` isn't set — this is a
safety net during the swap, not a permanent dual-vendor setup. A one-time
backfill script for existing avatars lives at
`backend/scripts/migrate_avatars_to_supabase.py` — run it once after
setting the Supabase env vars:

```bash
cd backend
python -m scripts.migrate_avatars_to_supabase --dry-run   # preview first
python -m scripts.migrate_avatars_to_supabase              # then actually run it
```

If Supabase Storage's free-tier limits ever become a real constraint
(they're generous for a single church), that's the point to revisit — not
before.

---

## Hosting architecture — why 3 vendors, and which paid tier matters (I-97/98/99/100)

Three vendors today: Vercel (static frontend, instant global CDN, preview
deploys per PR), Render (FastAPI backend — a long-running process, which is
what SQLAlchemy connection pooling, background tasks, and the stateful rate
limiter genuinely want, unlike Vercel's serverless functions), and Supabase
(Postgres + Storage).

**The real, visible cost of this split**: Render's free tier spins the
backend down when idle, which is exactly why the `reach:slow-start`
cold-start message (`api.js`, `LoadingScreen` in `App.jsx`) had to be built
in the first place — see item H below. That's not a hypothetical, it's a
problem this codebase already had to work around.

**Decision**: keep the 3-vendor split, but pay for Render's smallest
always-on plan (a few dollars/month) instead of the free tier. This removes
the cold-start problem entirely without touching any code — it's the
lowest-effort fix for the actual pain point ("things being slow to
start"). The alternative (consolidating to Render for both frontend and
backend) would cut one vendor, but loses Vercel's preview-deploy-per-PR
workflow, which is worth keeping even for a small admin team — and Vercel's
frontend hosting is free regardless, so there's no real reason to give it
up.

**Action for whoever manages billing**: upgrade the Render web service off
the free tier before real Sunday-morning usage. This is a payment decision
this document can flag but can't make for you — see the "Blocked items"
note in the project summary.

Regardless of tier, a scheduled health-check ping (any free uptime
monitor hitting `GET /health` every 5–10 minutes) is worth having anyway —
it keeps a free/idle tier warm as a stopgap and doubles as the uptime
alerting called out below.

---

## Reliability checklist for future releases (E-54, E-64)

Run through this before shipping any release that touches contacts, tags,
call logs, or auth — not just this one:

- [ ] CSP headers present in `vercel.json` / `frontend/vercel.json` (see D-44)
- [ ] Rate limits present on `/auth/*` and `/invite/*` endpoints (D-41/42)
- [ ] Alembic migrations applied AND `alembic upgrade head` resolves to a
      single head with no missing `revision`/`down_revision` (see E-58 —
      this exact thing broke silently once already)
- [ ] `SENTRY_DSN` set on the backend, `VITE_SENTRY_DSN` set on the frontend
- [ ] New/changed endpoints have at least one request-validation test
      (`backend/tests/`) — see E-57
- [ ] `npm run build` and `npm run test` both pass
- [ ] `python -m pytest backend/tests/` passes

### Rollback plan (E-64)

If the tag system, mass-upload flow, or call logging has a bug on day one:

1. **Frontend-only bug** (a UI glitch, not data corruption): revert the
   Vercel deployment to the previous one from the Vercel dashboard
   (Deployments → previous → "Promote to Production"). Takes under a
   minute, no data is touched.
2. **Backend bug with the new endpoints, but data is fine**: redeploy the
   previous Render build from the Render dashboard (Deploys → previous
   → "Redeploy"). The new tables (`contact_tags`, `call_logs`,
   `tag_definitions`) simply go unused by the old code — nothing is lost,
   because they're additive tables, not modifications to existing ones
   (except `contacts.location` becoming nullable and `contacts.is_incomplete`
   being added, both backward-compatible with old code that never reads
   them).
3. **Migration needs to be rolled back**: `alembic downgrade -1` reverses
   the `20260824_tags_calls` migration (drops the new tables, drops the
   `is_incomplete` column). It deliberately does NOT re-add
   `location NOT NULL` or remove the `suspended` enum value — see the
   comments in that migration file for why (Postgres can't cleanly remove an
   enum value, and re-adding NOT NULL could fail on real data created via
   the paste-import flow in the meantime).
4. **No contact entered that day is ever lost by any of the above** — steps
   1–3 all leave the `contacts` table itself untouched; the risk is only
   ever in the new tag/call-log tables being unreachable, not in existing
   data being deleted.

### Feature flags (E-63)

There's no feature-flag framework in this codebase, and adding one is out
of scope for this release. The lightest real option, if a future update
needs to roll out to one hub first: add a nullable `feature_flags JSONB`
column to `organisations` (or a dedicated `hubs.feature_flags` column),
check it in the relevant router before enabling new behavior, default to
the old behavior when the column is null/empty. Deliberately not built
speculatively here — build it when the first feature that actually needs
staged rollout shows up, not before.

---



**OTP not arriving in Gmail**
Check on Render: `OTP_PROVIDER=email`, `SMTP_USER` is your Gmail, `SMTP_PASS` is the 16-char App Password (with spaces is fine), `SMTP_PORT=465`. Check Render logs for SMTP errors.

**CORS error in browser console**
`ALLOWED_ORIGINS` on Render doesn't exactly match your Vercel URL — no trailing slash, must be `https://`.

**404 on direct navigation to `/login`, `/admin`, `/join`**
`vercel.json` either wasn't committed, has the wrong Render URL in the destination, or the Root Directory wasn't set to `frontend` in Vercel.

**Invite links point to localhost or wrong domain**
`FRONTEND_URL` on Render is not set, or still set to a local/wrong value.

**Render keeps sleeping (free tier)**
Upgrade to the Starter plan ($7/mo) — free tier services sleep after 15 minutes of inactivity and take ~30 seconds to wake, which kills the OTP flow.

**`psycopg2 could not connect` in Render logs**
Make sure you're using the **Session mode** connection string from Supabase (port `5432`), not Transaction mode (port `6543`). Supabase → Settings → Database → Connection string → Session mode.

**Build fails on Render with `ModuleNotFoundError`**
The build command must be `pip install -r backend/requirements.txt` (not `pip install -r requirements.txt`).