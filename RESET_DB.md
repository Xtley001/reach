# REACH — Reset Database & Push Fresh Schema

> ⚠️ **DESTRUCTIVE** — this wipes all data. Use only on dev/staging or when starting fresh.

---

## Step 1 — Open Supabase SQL Editor

Go to: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF/sql/new`

---

## Step 2 — Drop ALL Tables (Nuclear Option)

Paste and run this in the SQL editor. It drops everything in dependency order:

```sql
-- ═══════════════════════════════════════════════════════════════════
-- REACH — DROP ALL TABLES (wipes everything — confirm before running)
-- ═══════════════════════════════════════════════════════════════════

-- Disable foreign key checks temporarily
SET session_replication_role = 'replica';

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS export_log          CASCADE;
DROP TABLE IF EXISTS audit_logs          CASCADE;
DROP TABLE IF EXISTS decisions           CASCADE;
DROP TABLE IF EXISTS attendance          CASCADE;
DROP TABLE IF EXISTS follow_up_queue     CASCADE;
DROP TABLE IF EXISTS message_sends       CASCADE;
DROP TABLE IF EXISTS message_templates   CASCADE;
DROP TABLE IF EXISTS contacts            CASCADE;
DROP TABLE IF EXISTS refresh_tokens      CASCADE;
DROP TABLE IF EXISTS invites             CASCADE;
DROP TABLE IF EXISTS users               CASCADE;
DROP TABLE IF EXISTS hubs                CASCADE;
DROP TABLE IF EXISTS campaigns           CASCADE;
DROP TABLE IF EXISTS organisations       CASCADE;

-- Drop all custom enums
DROP TYPE IF EXISTS user_role            CASCADE;
DROP TYPE IF EXISTS user_status          CASCADE;
DROP TYPE IF EXISTS campaign_status      CASCADE;
DROP TYPE IF EXISTS contact_status_code  CASCADE;
DROP TYPE IF EXISTS transport_status     CASCADE;
DROP TYPE IF EXISTS follow_up_queue_type CASCADE;
DROP TYPE IF EXISTS follow_up_status     CASCADE;

-- Re-enable foreign key checks
SET session_replication_role = 'origin';

SELECT 'All tables dropped ✓' AS result;
```

---

## Step 3 — Push the New Schema

### Option A — Via Supabase SQL Editor (quickest)

1. Open `migrations/schema.sql` from this repo
2. Copy the entire file contents
3. Paste into a new SQL editor tab in Supabase
4. Click **Run**

### Option B — Via Bash / psql (if you have the connection string)

```bash
# Get your Supabase DB connection string from:
# Supabase Dashboard → Settings → Database → Connection string (URI)
# It looks like: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

export DATABASE_URL="postgresql://postgres:[YOUR_PASSWORD]@db.[YOUR_PROJECT_REF].supabase.co:5432/postgres"

# Push the schema
psql "$DATABASE_URL" -f migrations/schema.sql

# Verify tables were created
psql "$DATABASE_URL" -c "\dt"
```

### Option C — Via Alembic (if using migrations workflow)

```bash
cd /path/to/reach

# Set env
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"

# Mark current head (skip history if starting fresh)
alembic stamp head

# Or run all migrations from scratch
alembic upgrade head
```

---

## Step 4 — Re-seed Admin Account

After schema is pushed, create the admin/minister account:

```bash
# From project root (make sure backend deps are installed)
cd backend

# Set your DB URL
export DATABASE_URL="postgresql://..."

# Run seed script
python seed_admin.py
```

This creates:
- An Organisation: `Reach Ministry`
- A Minister user with the phone/email you specify
- An active Campaign

---

## Step 5 — Verify in Supabase

Run this in the SQL editor to confirm everything is set up:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check organisations
SELECT id, name, slug FROM organisations;

-- Check campaigns
SELECT id, name, status FROM campaigns;

-- Check users (minister)
SELECT id, name, role, status FROM users;
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| `permission denied for table` | Run as `postgres` user (Supabase service role) |
| `type already exists` | The `DO $$ BEGIN CREATE TYPE...` blocks handle this — schema is idempotent |
| `foreign key violation on drop` | Use `CASCADE` — already included in Step 2 SQL |
| Alembic `target database is not up to date` | Run `alembic stamp head` first, then `alembic upgrade head` |
| Vercel env vars wrong | Update `VITE_API_URL` in Vercel dashboard to point to your Railway/Render backend |

---

## Environment Variables Reference

### Backend (Railway / Render)
```
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
JWT_SECRET=your-secret-key-min-32-chars
REFRESH_SECRET=another-secret-key
FRONTEND_URL=https://reach-livid.vercel.app
TWILIO_ACCOUNT_SID=...   (for SMS OTP)
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+1...
```

### Frontend (Vercel)
```
VITE_API_URL=https://your-backend.railway.app
```

---

*Last updated: 27 May 2026*
