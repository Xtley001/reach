# REACH — Changelog

## v1.0.0 — Initial Release

### Architecture
- OTP-only auth with JWT access tokens + httpOnly refresh tokens (family rotation)
- Roles: `volunteer`, `hub_leader`, `minister`, `registration_team`, `decisions_team`
- All PKs are `gen_random_uuid()` — no sequential IDs
- Phone numbers stored as E.164 with DB-level CHECK constraint
- Soft deletes on contacts via `deleted_at`

### Auth & Security
- OTP lockout after 5 failed attempts (30-minute coolout), persists on resend
- Cross-channel lockout: switching email↔phone doesn't bypass lockout
- JWT secret rotation via `JWT_SECRET_V1` (verify-only retired key)
- Refresh token replay detection — family revoked on reuse
- `ADMIN_OTP_CC_ENABLED` boolean config — off by default
- Invite links: all invalid states return same message (no enumeration oracle)

### Signup Flow (v1.0)
- **New volunteers** → `/signup`: name + avatar (optional) → contact → hub → OTP → `/pending`
- **Returning users** → `/login`: contact → OTP → dashboard
- Avatar uploaded immediately post-OTP so hub leader sees photo in approval queue
- Atomic user creation: name + hub_id + OTP verified together, no ghost users
- `POST /auth/send-otp` returns `is_returning` — frontend routes accordingly

### UI/UX
- Design system: Stone & Sage palette (`--accent` sage green, `--highlight` terracotta)
- Dark mode support via `data-theme="dark"`
- Role badge pills on Hub Leader and Admin login pages (replaces gold left-border)
- Consistent top bar across all auth pages: back arrow · REACH wordmark · theme toggle
- Progress bar on all multi-step auth flows
- Admin URL (`/admin`) not linked from landing page

### Bug Fixes (schema/API)
- `HubLeaderSummary`: aligned field names (`hub_id`, `hub_name`, `hub_zone`, `leader_name`, `leader_avatar_url`)
- `ActiveSessionOut`: aligned to actual router fields (`token_id`, `device_hint`, `expires_at`)
- `ADMIN_OTP_CC_ENABLED` declared as `bool` in `Settings` — no more `AttributeError` on `.lower()`
- `mv_demographics` GROUP BY fixed via CTE with `DISTINCT ON`
- `contact_statuses` unique constraint collision fix (id as tiebreaker)
- `ConfirmDialog` added to `UI.jsx` (was imported but undefined)

### Performance
- Hub list endpoint: single batch query replaces N+1 (eliminates ~4,500 ms delay)
- Materialised view `mv_demographics` with `CONCURRENT` refresh
- `INFLIGHT` map in `cache.js` deduplicates concurrent API calls
- Minister layout lazy-loaded — volunteers never pay recharts bundle cost
- Service Worker: cache-first app shell strategy

### Infrastructure
- `pg_cron` job for `mv_demographics` refresh every 5 minutes
- Daily DB backup script (`scripts/ops/backup.sh`) — excludes `otp_sessions`
- DB connection pool heartbeat (`SELECT 1` every 5 min) prevents idle timeout
- Alembic configured against `backend.models.Base`

---

## Pending / Future

| Item | Notes |
|---|---|
| Automated test suite | Framework not yet set up |
| Playwright E2E | Depends on test suite |
| CSRF on `/auth/refresh` | Low risk given `samesite=none + secure`; document and revisit |
| `pg_cron` in Supabase | Enable via Supabase dashboard → Extensions |
