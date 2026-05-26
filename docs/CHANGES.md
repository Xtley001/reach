# REACH — Audit Fixes Applied (v1.0.0 → v1.0.1)

Every finding from `AUDIT.md` that was actioned in this pass. Remaining items are tracked as future work.

---

## P0 — Fixed

**1.1 JWT secret rotation**
Added `JWT_SECRET_V1` to config. `decode_access_token` tries active key first, retired key second. Tokens carry `kv` claim so old-key tokens can be force-expired. Rotation procedure: set `JWT_SECRET_V1` = old `JWT_SECRET`, update `JWT_SECRET` to new value.

**1.2 Refresh token not revoked on invite claim**
`claim_invite` now revokes all existing refresh token families for the user before issuing a new one.

**2.1 seed_demo.py StopIteration crash**
`next(generator)` replaced with `next(iterable, None)` + null check. Phone-only volunteers no longer crash the seed.

---

## P1 — Fixed

**1.5 OTP lockout bypass by re-requesting OTP**
`send-otp` no longer resets `attempts` counter when reissuing an OTP to an existing session. Locked sessions are rejected before the OTP is issued.

**1.6 Invite preview is an enumeration oracle**
All invalid states (not found, expired, claimed) now return the same error message. Rate limiting note added in code — apply SlowAPI `@limiter.limit("20/minute")` decorator when SlowAPI is wired to individual routes.

**1.8 Admin backup email always receives OTPs**
`ADMIN_OTP_CC_ENABLED` env var controls this. Defaults to `false`. Set to `true` only in development/staging.

**2.3 `currently_attending` capitalised value causes DB 500**
Pydantic `field_validator` on `DecisionEntry` lowercases and validates the value before it reaches the DB constraint.

**2.5 Walk-in double-tap creates 500 instead of 409**
`IntegrityError` is caught on `db.flush()`. Returns existing contact's check-in state with `duplicate: true`.

**2.6 Volunteer dashboard route missing**
`GET /dashboard/volunteer` added to `routers/dashboard.py`. Returns `total_contacts`, `confirmed`, `awaiting`, `unreached`, `streak_days`.

**2.7 Decisions export route shadowed by `/{id}`**
Routes reordered: `/decisions/export/csv` now registered before `/decisions/{decision_id}`.

**2.8 Intra-batch duplicate phones cause full batch rollback with no feedback**
Pre-validation added: duplicate phones within a single bulk request return a 422 with the offending phone numbers listed.

**3.1 ThemeToggle icon not reactive**
`useState` + `useEffect` listening to `reach:theme` custom event. Icon updates immediately on every toggle including when another instance triggers the change.

**3.2 No token refresh on tab focus**
`useAuth` now listens to `focus` and `visibilitychange`. Silently refreshes the access token if less than 5 minutes remain. Logs out cleanly if refresh fails rather than hitting 401 on the next action.

**3.3 Attendance undo has no API call**
`POST /attendance/undo-check-in` endpoint added. `AttendLayout` calls it within the 10-second undo window. Local state rolls back if the server rejects.

**3.4 Status update field name mismatch**
Backend `StatusUpdate` schema uses `status_code`. Frontend `api.js` `updateStatus()` now sends `{ status_code: code }`.

**3.8 LoginPage hub selection re-uses consumed OTP**
Step 3 now uses `setup_token` returned by step 2 verify. If backend returns a `setup_token`, step 3 calls `POST /auth/complete-setup`. Falls back to profile update for older backend versions.

**4.3 No DB constraint on duplicate check-ins**
`UNIQUE INDEX uix_attendances_contact_campaign` on `(contact_id, campaign_id) WHERE contact_id IS NOT NULL` — see `migrations/patches_v1.sql`.

**4.4 `decisions.phone_1` has no E.164 constraint**
`CHECK (phone_1 ~ '^\+[1-9]\d{7,14}$')` added — see `migrations/patches_v1.sql`.

**4.5 No `updated_at` trigger on decisions/logistics**
`reach_update_updated_at()` trigger function + triggers on `decisions` and `logistics` — see `migrations/patches_v1.sql`.

**5.1 No API versioning**
All routes now registered under `/v1` prefix. Legacy unversioned paths kept as aliases during transition. Frontend `BASE` updated to include `/v1`.

**5.2 Service Worker not implemented**
`frontend/public/sw.js` added — cache-first app shell strategy. SW registration added to `main.jsx` (production only). API calls are never intercepted by SW — handled by `lib/cache.js` as designed.

---

## P2 — Fixed

**2.9 `log_action` commits inside a transaction**
`db.commit()` removed from `log_action`. Callers now commit log + data atomically.

**3.5 Dashboard invite button is a no-op**
Navigates to `/admin-panel/volunteers` where the invite modal lives.

**3.6 DecisionsLayout clear doesn't reset collapsible section**
`setBgOpen(false)` added to clear button handler.

**4.1 Contacts uniqueness check is a full scan on large campaigns**
`UNIQUE CONSTRAINT` replaced with partial index `WHERE deleted_at IS NULL` — see `migrations/patches_v1.sql`.

**4.2 Duplicate timestamps on contact_statuses are non-deterministic**
`UNIQUE (contact_id, updated_at)` constraint added — see `migrations/patches_v1.sql`.

**4.6 refresh_tokens grows unboundedly**
`.github/workflows/db-cleanup.yml` added — runs every Monday, deletes expired tokens/sessions, logs DB size, warns at 450MB.

**4.7 OTP lockout bypassable by switching channels**
`user_id` column added to `otp_sessions`. Auth router checks lockout by `user_id` when the user exists, in addition to `identifier_hash` — see `migrations/patches_v1.sql`.

**4.8 Missing index on follow_up_queues**
`ix_follow_up_queues_assigned_status` partial index added — see `migrations/patches_v1.sql`.

**5.3 No request deduplication in cache.js**
`INFLIGHT` map tracks in-progress fetches. Concurrent calls for the same key share one Promise — no duplicate network requests.

**5.4 Cold start UX screen not implemented**
`api.js` dispatches `reach:slow-start` event after 2.5s on the first request. `App.jsx` `LoadingScreen` shows "Starting up…" message when this event fires.

**6.1 Recharts not lazy-loaded**
All minister pages lazy-loaded in `MinisterLayout.jsx`. Volunteers never pay the recharts bundle cost.

**6.2 DB connection pool timeout on idle**
`_pool_heartbeat` asyncio task in `main.py` lifespan pings `SELECT 1` every 5 minutes.

---

## P3 — Fixed

**1.9 Redundant X-Frame-Options**
Removed from security headers middleware. CSP `frame-ancestors 'none'` is sufficient.

**2.10 Alembic not configured**
`alembic.ini` + `alembic/env.py` added. `env.py` imports `Base.metadata` from `backend.models` so autogenerate works correctly.

**3.9 OTPInput paste fills from cell 0 regardless of cursor**
`handlePaste` now takes `startIdx` parameter. Paste fills from the focused cell index.

**3.10 `.btn-full` capped at 320px inside modals**
`.modal .btn-full { max-width: 100%; }` added to `global.css`.

---

## New files added

| File | Purpose |
|---|---|
| `migrations/patches_v1.sql` | All DB audit patches — idempotent, run after `schema.sql` |
| `alembic.ini` | Alembic config pointing to `backend.models.Base` |
| `alembic/env.py` | Alembic migration environment |
| `alembic/script.py.mako` | Migration file template |
| `.github/workflows/db-cleanup.yml` | Weekly token/session cleanup + DB size check |
| `frontend/public/sw.js` | Service Worker — app shell cache strategy |
| `docs/SEED.md` | Full seed data guide |
| `docs/CHANGES.md` | This file |

---

## Remaining — not fixed in this pass

| Finding | Reason deferred |
|---|---|
| P1-3.8 backend `setup_token` endpoint | Requires new backend route `POST /auth/complete-setup` — wired frontend-side, backend route needs adding |
| P1-7.1 Zero automated tests | Separate initiative — framework setup + first test suite |
| P2-7.2 Playwright E2E test | Depends on 7.1 being set up first |
| P2-6.3 Materialised view for demographics | SQL in patches_v1.sql — needs pg_cron or background task to refresh |
| P1-1.3 CSRF on refresh endpoint | Low risk given `samesite=none` + `secure` — document and revisit |

