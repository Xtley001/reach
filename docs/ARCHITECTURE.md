# REACH — Architecture

## System Overview

```
Browser / Mobile (PWA)
        │ HTTPS
        ▼
Vercel (React + Vite, CDN)
  Routes: / /login /signup /hub-login /admin
          /vol/* /hub/* /admin-panel/* /attend /decisions
        │ HTTPS cross-origin
        ▼
Render (FastAPI, Python 3.11)
  Prefix: /api
  Routes: /auth/* /onboarding/* /users/* /contacts/* /hub/*
          /attendance/* /decisions/* /templates/* /management/*
        │
        ▼
Supabase (PostgreSQL 15)
```

---

## Auth

OTP login (email or SMS via Brevo) → JWT access token (60 min) + rotating httpOnly refresh token cookie (30 days, `samesite=none`).

**Token rotation:** every `/auth/refresh` call issues a new token and marks the old one used. Token reuse (replay attack) → entire family revoked.

**Secret rotation:** `JWT_SECRET_V1` holds the retired key. Decode tries active key first, then V1. Tokens carry `kv` claim to force-expire by key version.

**Signup vs Sign-in:**
- `/signup` — new volunteer flow: name → avatar (optional) → contact → hub → OTP → creates user atomically
- `/login` — returning users: contact → OTP. If `is_returning=false`, redirects to `/signup`

---

## Roles & Access

| Role | What they do | Contacts visible | Users visible |
|---|---|---|---|
| `volunteer` | Logs contacts, calls queue | Own (`added_by = user.id`) | None |
| `hub_leader` | Approves volunteers, manages hub | Hub's contacts | Hub's volunteers |
| `minister` | Full dashboard, campaigns, exports | Organisation-wide | Organisation-wide |
| `registration_team` | Gate check-in at event | Campaign contacts (read) | None |
| `decisions_team` | Records decisions at event | None | None |

Access is enforced at the query level in every router — not just frontend routing.

---

## Signup Flow Detail

```
/signup
  Step 0: Full name + optional avatar upload
  Step 1: Email or phone
  Step 2: Hub selection (fetched from GET /onboarding/hubs)
          → POST /auth/send-otp
  Step 3: OTP
          → POST /auth/verify-otp (name + hub_id + otp, atomic)
          → PATCH /users/me/profile (multipart, avatar upload)
          → navigate /pending
```

Avatar is uploaded immediately after account creation. The hub leader sees the volunteer's photo in the approval queue, which is the primary identification mechanism.

---

## Data Model (key tables)

```
organisations → campaigns → hubs → users (volunteers, hub_leaders)
                                 ↘ contacts
contacts → contact_statuses (history)
        → attendances
        → decisions
        → logistics
        → message_sends
```

All primary keys: `gen_random_uuid()` — no sequential IDs exposed.

Soft deletes on `contacts` via `deleted_at TIMESTAMPTZ` with partial unique index.

---

## Enum Serialisation

All Python enums inherit `(str, enum.Enum)` so `.value` serialises as `"coming"` not `"ContactStatusCode.coming"`. `lib/labels.js` handles the prefixed form as a fallback for any legacy data.

---

## Performance

- `mv_demographics` materialised view — refreshed every 5 min via `pg_cron`
- Hub list uses a single batch query (no N+1)
- `INFLIGHT` deduplication in `cache.js` — concurrent identical requests share one Promise
- Minister pages lazy-loaded — volunteers never load recharts
- Service Worker: cache-first app shell
- DB heartbeat: `SELECT 1` every 5 min (prevents Supabase idle timeout)

---

## Offline Support

`lib/offline.js` stores pending contacts in `localStorage` when the network is unavailable. `useOfflineSync` hook flushes the queue on reconnect. API calls are not intercepted by the Service Worker — the SW handles only the app shell.

---

## File Upload

Avatars: frontend sends `multipart/form-data` to `PATCH /users/me/profile`. Backend pipes to Cloudinary with `public_id = reach/avatars/{user_id}` — overwrites on re-upload, no orphaned files.
Max size: 5 MB. Accepted types: JPEG, PNG, WebP.
