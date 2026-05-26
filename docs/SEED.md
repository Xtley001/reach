# REACH — Seed Data Guide

Two seed scripts. Run `seed_admin` first always. `seed_demo` is optional — for a full realistic dataset.

---

## Quick start (copy-paste)

```bash
# From ~/Desktop/reach — with venv active

# Step 1: Always run this first
python -m backend.seed_admin \
  --email you@gmail.com \
  --phone +2348012345678

# Step 2: Optional — populate with 1,100 realistic contacts
python -m backend.seed_demo \
  --email you@gmail.com \
  --phone +2348012345678
```

All OTPs go to your Gmail inbox. Sub-addresses (`+hub@`, `+vol@`, `+sur@` etc.) all land in the same inbox — no extra accounts needed.

---

## `seed_admin.py` — Minimal bootstrap

Creates the minimum needed to log in as any role:

| What | Value |
|---|---|
| Organisation | `Ministry` (or `--org "Your Org Name"`) |
| Campaign | `Admin Campaign` |
| Hub | `Admin Hub — Central` |
| Minister account | Your email + phone → `/admin` |
| Hub Leader account | `you+hub@gmail.com` → `/hub-login` |
| Volunteer account | `you+vol@gmail.com` → `/login` (email tab) |

**Usage:**

```bash
# Option A — flags
python -m backend.seed_admin \
  --email you@gmail.com \
  --phone +2348012345678 \
  --org "Living Faith"

# Option B — env vars (set once in .env or shell)
export SEED_ADMIN_EMAIL=you@gmail.com
export SEED_ADMIN_PHONE=+2348012345678
python -m backend.seed_admin
```

Safe to re-run — skips anything that already exists.

---

## `seed_demo.py` — Full realistic dataset

Builds on top of `seed_admin`. Creates 5 hubs, 5 hub leaders, 20 volunteers, and ~1,100 contacts with realistic Nigerian names, Lagos locations, status distribution, transport requests, and follow-up queues.

**Usage:**

```bash
python -m backend.seed_demo \
  --email you@gmail.com \
  --phone +2348012345678 \
  --count 1100
```

**What it creates:**

| Item | Count |
|---|---|
| Hubs | 5 (Surulere, Ikeja, Lekki, Oshodi, Festac) |
| Hub Leaders | 5 |
| Volunteers | 20 (4 per hub) |
| Contacts | 1,100 (default, configurable with `--count`) |
| Message templates | 4 |
| Logistics records | ~198 (18% of contacts need transport) |
| Follow-up queue items | ~440 (undecided + no-answer contacts) |

**Status distribution (approximate):**

| Status | % |
|---|---|
| Coming | 30% |
| Undecided | 22% |
| No Answer | 18% |
| Needs Transport | 12% |
| Message Sent | 10% |
| Not Coming | 5% |
| Unreachable | 3% |

**Login credentials after `seed_demo`:**

```
MINISTER   → /admin
  your@gmail.com  (phone or email)

HUB LEADERS  → /hub-login (email tab)
  you+sur@gmail.com    Surulere Hub
  you+ikj@gmail.com    Ikeja Hub
  you+lkk@gmail.com    Lekki Hub
  you+osh@gmail.com    Oshodi Hub
  you+fst@gmail.com    Festac Hub

VOLUNTEERS  → /login (email tab)
  you+v01@gmail.com    Chukwuemeka Eze  (Surulere)
  you+v05@gmail.com    Tunde Babatunde  (Ikeja)
  you+v09@gmail.com    Obinna Nwofor    (Lekki)
  you+v13@gmail.com    Olusegun Badmus  (Oshodi)
  you+v17@gmail.com    Chukwudi Nwofor  (Festac)
  (v01–v20 all work)
```

Safe to re-run — existing records are skipped, new contacts append.

---

## Running the schema first

Both seed scripts assume the schema is already applied. Always run this before seeding on a fresh database:

```bash
# Paste migrations/schema.sql into Supabase SQL editor, or:
psql "$DATABASE_URL" -f migrations/schema.sql
```

**Full sequence for a fresh setup:**

```bash
psql "$DATABASE_URL" -f migrations/schema.sql
python -m backend.seed_admin --email you@gmail.com --phone +2348012345678
python -m backend.seed_demo  --email you@gmail.com --phone +2348012345678
```

---

## Resetting seed data

To wipe all contacts and start fresh (keeps users and org):

```sql
-- Supabase SQL editor
TRUNCATE follow_up_queues, logistics, contact_statuses, contacts RESTART IDENTITY CASCADE;
```

To wipe everything including users:

```sql
TRUNCATE follow_up_queues, logistics, message_sends, contact_statuses,
         contacts, message_templates, invite_tokens, refresh_tokens,
         otp_sessions, audit_logs, users, hubs, campaigns, organisations
RESTART IDENTITY CASCADE;
```

Then re-run `seed_admin` and `seed_demo`.
