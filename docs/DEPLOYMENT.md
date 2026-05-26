# REACH — Deployment

## Backend — Render

**Service type:** Web Service (free tier for staging, Starter $7/mo for production — no cold starts)

**Build command:**
```bash
pip install -r requirements.txt
```

**Start command:**
```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

**Required environment variables:** See README.md — Environment Variables section.

**Keep-alive (free tier):** Set up UptimeRobot to ping `https://reach-api-xg6c.onrender.com/health` every 10 minutes.

## Frontend — Vercel

**Framework preset:** Vite

**Build command:** `npm run build`

**Output directory:** `dist`

**Environment variables:**
```
VITE_API_URL=https://reach-api-xg6c.onrender.com
```

**Redirects** (`vercel.json`):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## Database — Supabase

1. Create project in Supabase (EU-West region for best latency from Nigeria)
2. Copy the connection string from Settings → Database → Connection string (URI mode)
3. Run `migrations/schema.sql` in the Supabase SQL editor

## Backups

1. Add `DATABASE_URL` to GitHub repository secrets (Settings → Secrets → Actions)
2. The `.github/workflows/db-backup.yml` workflow runs every Sunday at midnight WAT
3. Artifacts are retained for 90 days

## Post-deploy checklist

- [ ] `JWT_SECRET` is 64+ chars, not committed to git
- [ ] `OTP_PROVIDER=brevo` in production
- [ ] `ENVIRONMENT=production`
- [ ] Cookie `samesite="none"` with `secure=True`
- [ ] Cloudinary signed uploads configured
- [ ] UptimeRobot ping configured
- [ ] `.env` is in `.gitignore` and not in git history
- [ ] `git log --all --full-history -- .env` returns nothing
