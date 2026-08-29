# REACH — Complete Production Setup & Deployment Guide
### Supabase · Render · Vercel · Brevo (Zero-to-Hero Fresh Start)

This document is the definitive, updated guide for setting up REACH completely from scratch on a clean database and deploying to **Supabase**, **Render**, and **Vercel**.

---

## 1. Supabase Setup (Database & Storage)

### 1.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Select your region (e.g. **EU Central / Frankfurt** or closest to your users).
3. Set a strong database password and copy your project reference ID.

### 1.2 Run Schema Migrations
1. Go to **Supabase Dashboard** → **SQL Editor** → **New query**.
2. If resetting an existing database, wipe all old tables:
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   GRANT ALL ON SCHEMA public TO postgres;
   GRANT ALL ON SCHEMA public TO public;
   ```
3. Paste the contents of [`migrations/schema.sql`](file:///c:/Users/pc/Desktop/reach/migrations/schema.sql) and click **Run**.
4. (Or run `alembic upgrade head` from your local terminal with your `DATABASE_URL` set).

### 1.3 Create Public Avatar Storage Bucket
1. Go to **Storage** in your Supabase dashboard.
2. Click **New Bucket**.
3. Bucket name: `avatars`.
4. Enable **Public bucket** (toggle ON).
5. Click **Save**.

### 1.4 Get Supabase Connection Strings & Keys
- **Database Connection String**:
  - Go to **Project Settings** → **Database** → **Connection string** → **Session mode** (Port 5432).
  - Format: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
- **Service Role Key**:
  - Go to **Project Settings** → **API** → copy `service_role` (secret key).
- **Supabase URL**:
  - Go to **Project Settings** → **API** → copy `Project URL` (e.g. `https://[PROJECT-REF].supabase.co`).

---

## 2. Bootstrap Your Minister / Admin Account

Run this query directly in the **Supabase SQL Editor** to create your active campaign and your Super Admin account:

```sql
-- 1. Create Default Active Campaign
INSERT INTO campaigns (id, name, target_count, programme_date, venue, is_active, created_at)
VALUES (
    gen_random_uuid(),
    'Greater Reach 2026',
    10000,
    '2026-10-15 09:00:00+00',
    'Main Arena',
    true,
    NOW()
);

-- 2. Create Your Primary Minister / Super Admin Account
-- Replace the name, email, and phone number with your real details:
INSERT INTO users (id, name, email, phone, role, status, is_superadmin, created_at)
VALUES (
    gen_random_uuid(),
    'Lead Minister',
    'your.email@example.com',
    '+2348012345678',
    'minister',
    'active',
    true,
    NOW()
);
```

---

## 3. Render Backend Deployment

### 3.1 Create Web Service
1. Go to [render.com](https://render.com) → **New** → **Web Service**.
2. Select your repository: `Xtley001/reach`.
3. Configure the service settings:

| Setting | Value |
|---|---|
| **Name** | `reach-api` |
| **Region** | Frankfurt (EU Central) |
| **Branch** | `main` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r backend/requirements.txt` |
| **Start Command** | `alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |

### 3.2 Add Environment Variables on Render
Under **Environment**, add the following keys:

| Environment Variable | Description / Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | Supabase connection string: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres` |
| `JWT_SECRET` | Generate with `openssl rand -hex 64` in terminal |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `120` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` |
| `OTP_PROVIDER` | `brevo` (or `console` for staging) |
| `BREVO_API_KEY` | `xkeysib-...` (From your Brevo account) |
| `BREVO_SENDER` | `noreply@yourverifieddomain.com` |
| `ADMIN_BACKUP_EMAIL` | `your.email@example.com` |
| `SUPABASE_URL` | `https://[PROJECT-REF].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase `service_role` secret key |
| `SUPABASE_AVATARS_BUCKET` | `avatars` |
| `REDIS_URL` | Upstash Redis connection string (e.g. `rediss://default:...@...upstash.io:6379`) |
| `ALLOWED_ORIGINS` | `https://your-frontend.vercel.app` (update after Vercel deploy) |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` (update after Vercel deploy) |

Click **Deploy Web Service**. Render will build and deploy your API to a URL like `https://reach-api-xxxx.onrender.com`.

---

## 4. Vercel Frontend Deployment

### 4.1 Import Project
1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. Select your repository: `Xtley001/reach`.
3. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click `Edit` and select `frontend`.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 4.2 Add Frontend Environment Variables
In the Vercel **Environment Variables** section:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://reach-api-xxxx.onrender.com` (Your Render backend URL) |

4. Click **Deploy**. Vercel will produce your live app URL (e.g. `https://reach-xyz.vercel.app`).

### 4.3 Link URLs
1. Copy your Vercel URL (e.g. `https://reach-xyz.vercel.app`).
2. Go back to Render → `reach-api` → **Environment**.
3. Update `ALLOWED_ORIGINS` and `FRONTEND_URL` to match your Vercel domain.
4. Save and let Render auto-redeploy.

---

## 5. Verification & Testing

1. **Minister Portal:**
   - Navigate to `https://your-app.vercel.app/login`.
   - Enter your email `your.email@example.com` or phone `+2348012345678`.
   - Enter the 6-digit OTP received in your inbox.
   - You will land directly on the **Minister Dashboard**.
2. **Hub Management:**
   - Go to **Hubs** on the Minister Dashboard → click **New Hub** to create your first outreach hub.
   - Generate an **Invite Link** for your Hub Leader.
3. **Volunteer Flow:**
   - Test user registration at `/signup`.
   - Select the hub, verify phone/email OTP, and check the volunteer dashboard.

---

## 6. Maintenance & Disaster Recovery

- **To run future schema migrations:**
  Render automatically runs `alembic upgrade head` on every deploy.
- **To inspect database tables:**
  Use the Supabase **Table Editor** to view contacts, users, hubs, and attendance logs in real time.
- **To view backend logs:**
  Go to Render → `reach-api` → **Logs**.
