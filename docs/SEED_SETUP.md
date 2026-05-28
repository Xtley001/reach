# REACH — Seed Setup Guide

How to seed your database, log in as every role, add accounts, and wipe mock data before going live.

---

## Before you start

Make sure:
- `DATABASE_URL` is set in your `.env` (pointing to Supabase)
- Venv is active: `source venv/Scripts/activate` (Windows) or `source venv/bin/activate` (Mac/Linux)
- You are in `~/Desktop/reach`
- `migrations/schema.sql` has been run on your Supabase database (paste it into the Supabase SQL editor)

---

## Step 1 — Run the schema

Open your Supabase project → **SQL Editor** → paste the entire contents of `migrations/schema.sql` → **Run**.

Then paste and run `migrations/patches_v1.sql`.

Both files are idempotent — safe to run more than once.

---

## Step 2 — Seed your account as minister

```bash
# From ~/Desktop/reach
python -m backend.seed_admin \
  --email agbolubela@gmail.com \
  --phone +2348012345678 \
  --org "Living Faith"
```

Replace `+2348012345678` with your real phone number. The `--org` name appears in the app header.

This creates:
- **Minister account** → `agbolubela@gmail.com` → logs in at `/admin`
- **Hub leader account** → `agbolubela+hub@gmail.com` → logs in at `/hub-login`
- **Volunteer account** → `agbolubela+vol@gmail.com` → logs in at `/login`

All three email sub-addresses land in your **same Gmail inbox** — no extra accounts needed.

---

## Step 3 — Seed demo data (realistic full dataset)

```bash
python -m backend.seed_demo \
  --email agbolubela@gmail.com \
  --phone +2348012345678 \
  --count 1100
```

This adds 5 hubs, 20 volunteers, ~1,100 contacts, message templates, logistics records, and follow-up queues.

---

## Login credentials after seeding

All logins use OTP. The code is sent to the email/phone — or if `OTP_PROVIDER=console` in `.env`, it prints to your terminal.

| Role | Login URL | Email to use |
|---|---|---|
| Minister | `/admin` | `agbolubela@gmail.com` |
| Hub Leader (Central) | `/hub-login` | `agbolubela+hub@gmail.com` |
| Volunteer | `/login` (email tab) | `agbolubela+vol@gmail.com` |
| Hub Leaders (demo) | `/hub-login` | `agbolubela+sur@gmail.com` (Surulere) |
| | | `agbolubela+ikj@gmail.com` (Ikeja) |
| | | `agbolubela+lkk@gmail.com` (Lekki) |
| | | `agbolubela+osh@gmail.com` (Oshodi) |
| | | `agbolubela+fst@gmail.com` (Festac) |
| Volunteers (demo) | `/login` (email tab) | `agbolubela+v01@gmail.com` through `agbolubela+v20@gmail.com` |
| Registration Team | `/attend` | Invite from admin panel |
| Decisions Team | `/decisions` | Invite from admin panel |

---

## Adding a real person's account from Supabase

When someone on your team needs an account and you don't want to go through the invite flow:

Open **Supabase → SQL Editor** and run this template:

```sql
-- 1. Find your organisation_id (run this first)
SELECT id, name FROM organisations LIMIT 5;

-- 2. Find the hub_id you want (for hub leaders and volunteers)
SELECT id, name, zone FROM hubs ORDER BY name;

-- 3. Insert the user
-- Replace ALL values in UPPER_CASE before running
INSERT INTO users (
  organisation_id,
  hub_id,
  phone,
  email,
  name,
  role,
  status
) VALUES (
  'YOUR_ORGANISATION_ID',   -- from step 1
  'YOUR_HUB_ID',            -- from step 2, or NULL for minister
  '+234XXXXXXXXXX',          -- E.164 format
  'person@example.com',
  'Full Name Here',
  'volunteer',               -- volunteer | hub_leader | minister | registration_team | decisions_team
  'active'                   -- active (skip pending) or pending (needs hub leader approval)
);
```

**Role values:**
- `volunteer` — standard field volunteer
- `hub_leader` — hub leader (set `hub_id` to their hub)
- `minister` — full admin access (set `hub_id` to NULL)
- `registration_team` — attendance gate only
- `decisions_team` — decisions entry only

**Status values:**
- `active` — can log in immediately
- `pending` — needs hub leader to approve first

---

## Promoting an existing user to a different role

```sql
-- e.g. promote a volunteer to hub leader
UPDATE users
  SET role = 'hub_leader',
      hub_id = 'TARGET_HUB_ID',
      status = 'active'
  WHERE email = 'person@example.com';
```

---

## Adding a registration team or decisions team member via SQL

```sql
-- Registration Team member
INSERT INTO users (organisation_id, phone, email, name, role, status, is_registration_team)
VALUES (
  'YOUR_ORGANISATION_ID',
  '+234XXXXXXXXXX',
  'gatekeeper@example.com',
  'Gate Person Name',
  'registration_team',
  'active',
  TRUE
);

-- Decisions Team member
INSERT INTO users (organisation_id, phone, email, name, role, status, is_decisions_team)
VALUES (
  'YOUR_ORGANISATION_ID',
  '+234XXXXXXXXXX',
  'counsellor@example.com',
  'Counsellor Name',
  'decisions_team',
  'active',
  TRUE
);
```

---

## Wiping seed/mock data before going live

### Option A — Wipe contacts only (keep users and org)

This is the standard pre-event reset. Removes all mock contacts, statuses, logistics, and queue items. Keeps all user accounts, hubs, and templates.

Run in **Supabase → SQL Editor**:

```sql
-- Wipe all mock contact data — keeps users, hubs, org, templates
TRUNCATE TABLE
  follow_up_queues,
  logistics,
  message_sends,
  contact_statuses,
  attendances,
  decisions,
  contacts
RESTART IDENTITY CASCADE;

-- Verify
SELECT COUNT(*) AS contacts_remaining FROM contacts;
-- Should return 0
```

### Option B — Wipe everything and start completely fresh

Removes all data including users and org. Use this if you need to re-seed from scratch.

```sql
-- Full reset — everything goes
TRUNCATE TABLE
  follow_up_queues,
  logistics,
  message_sends,
  contact_statuses,
  attendances,
  decisions,
  contacts,
  message_templates,
  export_log,
  invite_tokens,
  refresh_tokens,
  otp_sessions,
  audit_logs,
  users,
  hubs,
  campaigns,
  organisations
RESTART IDENTITY CASCADE;

-- Then re-run seed_admin to rebuild the foundation
```

### Option C — Keep your accounts, wipe only demo contacts

Removes only contacts added by the demo seed, leaving any real contacts you've already logged:

```sql
-- Remove only contacts created by the seed (source = 'volunteer' AND added before today)
-- Adjust the date to match when you ran seed_demo
DELETE FROM contact_statuses
  WHERE contact_id IN (
    SELECT id FROM contacts
    WHERE created_at < '2026-05-26 00:00:00+00'
  );

DELETE FROM logistics
  WHERE contact_id IN (
    SELECT id FROM contacts
    WHERE created_at < '2026-05-26 00:00:00+00'
  );

DELETE FROM follow_up_queues
  WHERE contact_id IN (
    SELECT id FROM contacts
    WHERE created_at < '2026-05-26 00:00:00+00'
  );

DELETE FROM contacts
  WHERE created_at < '2026-05-26 00:00:00+00';
```

---

## Pre-live checklist

Run through this before the event:

```sql
-- 1. Confirm organisation exists
SELECT id, name FROM organisations;

-- 2. Confirm campaign is active
SELECT id, name, status, programme_date FROM campaigns WHERE status = 'active';

-- 3. Confirm hubs are set up
SELECT h.name, h.zone, COUNT(u.id) AS volunteers
FROM hubs h
LEFT JOIN users u ON u.hub_id = h.id AND u.role = 'volunteer' AND u.status = 'active'
GROUP BY h.id, h.name, h.zone
ORDER BY h.name;

-- 4. Confirm minister account is active
SELECT id, name, email, phone, role, status FROM users WHERE role = 'minister';

-- 5. Confirm no mock contacts remain
SELECT COUNT(*) FROM contacts;

-- 6. Confirm no pending OTP sessions are stale
DELETE FROM otp_sessions WHERE expires_at < NOW();

-- 7. Check DB size
SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;
```

---

## Switching from OTP_PROVIDER=console to real SMS

In your `.env` (and in Render environment variables):

```bash
# Development (OTP prints to terminal)
OTP_PROVIDER=console

# Production (real SMS via Brevo)
OTP_PROVIDER=brevo
BREVO_API_KEY=your_brevo_api_key_here
```

When switching to production, test the OTP flow once with your own phone before the event.

