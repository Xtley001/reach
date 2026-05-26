# REACH — Principal Architect & QA Audit

**Reviewer context:** Senior Principal Engineer + QA Lead perspective. This document reviews the entire REACH codebase — backend, frontend, database, security, performance, and architecture — as of v1.0.0. Every finding is actionable.

Severity scale: **P0** (production outage / data loss risk) · **P1** (serious bug or security flaw) · **P2** (significant degradation or UX failure) · **P3** (code quality / maintainability) · **P4** (nice-to-have improvement)

---

## 1. Security

### 1.1 [P0] JWT secret rotation has no mechanism

**Finding:** `JWT_SECRET` is a static string in Render env vars. If it leaks, every access token ever issued becomes forgeable permanently. There is no key rotation path.

**Fix:**
```python
# config.py — support versioned secrets
JWT_SECRET_V1: str = ""    # retired key (verify only, never sign)
JWT_SECRET_CURRENT: str = ""  # active key (sign + verify)

# auth.py
def decode_access_token(token: str) -> Optional[dict]:
    for secret in [settings.JWT_SECRET_CURRENT, settings.JWT_SECRET_V1]:
        if not secret: continue
        try:
            return jwt.decode(token, secret, algorithms=[ALGORITHM])
        except jwt.InvalidTokenError:
            continue
    return None
```
Add key version to JWT payload (`"kv": "2"`) so you can force-expire old tokens.

---

### 1.2 [P0] Refresh token family rotation not enforced on all code paths

**Finding:** `routers/auth.py` issues a new refresh token on `/auth/refresh` but the `claim-invite` path in `routers/invites.py` creates a refresh token without first checking if the user already has an active family. A compromised invite link used after the user has already claimed it can still mint tokens.

**Fix:** Before creating a refresh token in `claim_invite`, revoke all existing refresh tokens for the user:
```python
db.query(RefreshToken).filter(
    RefreshToken.user_id == user.id,
    RefreshToken.revoked == False,
).update({"revoked": True})
db.flush()
```

---

### 1.3 [P1] No CSRF protection on cookie-authenticated state-changing endpoints

**Finding:** The app uses `httponly` cookies for refresh tokens. While access tokens are in `Authorization: Bearer` headers (safe from CSRF), any endpoint that reads the refresh cookie and issues a new access token (`POST /auth/refresh`) is CSRF-vulnerable. A malicious page can trigger a refresh and downgrade a session.

**Fix:** Add `X-Requested-With: XMLHttpRequest` header check on refresh endpoint, or use the `samesite=none` + `secure` combination already in place and add a CSRF token header for the refresh route specifically.

---

### 1.4 [P1] Cloudinary upload signature endpoint has no folder scoping per user

**Finding:** `users/upload-signature` returns a signature for the `avatars/` folder. Any authenticated user can use this to upload files to any path under `avatars/` — including overwriting other users' avatars if they know the public ID.

**Fix:**
```python
def get_upload_signature(user: User = Depends(get_current_user)):
    folder = f"avatars/{user.id}"  # scoped to user's own folder
    params = {"folder": folder, "timestamp": int(time.time())}
    # ... sign and return
```

---

### 1.5 [P1] OTP lockout uses session-level counter but sessions can be re-created

**Finding:** `otp_sessions` table tracks `attempts` and `locked_until` per `identifier_hash`. But `POST /auth/send-otp` creates a new session (resetting attempts to 0) if no existing session is found. An attacker can reset the counter by simply re-requesting an OTP.

**Fix:**
```python
# send-otp — never reset attempts on a locked session
existing = db.query(OTPSession).filter(...).first()
if existing and existing.locked_until and existing.locked_until > now:
    raise HTTPException(429, detail="Too many attempts. Try later.")
if existing:
    # Issue new OTP but PRESERVE the attempt counter
    existing.otp_hash  = hash_value(otp)
    existing.expires_at = expires
    # Do NOT reset existing.attempts
else:
    session = OTPSession(attempts=0, ...)
    db.add(session)
```

---

### 1.6 [P1] No rate limit on `/auth/invite/preview`

**Finding:** `GET /auth/invite/preview?token=X` is unauthenticated and not rate-limited. An attacker can brute-force token values at full speed — 32-byte `secrets.token_urlsafe` tokens are safe in theory, but the endpoint also leaks whether a token exists vs. is expired vs. is claimed, which is an oracle.

**Fix:** Apply a global SlowAPI limit of 20/minute per IP. Return identical 400 response for all invalid token states (don't distinguish between "not found" and "expired").

---

### 1.7 [P2] `log_metadata` column stores raw JSON as TEXT

**Finding:** `AuditLog.log_metadata` is `TEXT` with `json.dumps()`. This means you can't query or index audit metadata fields in PostgreSQL — making security investigations painful.

**Fix:** Change column type to `JSONB`:
```sql
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB;
```
```python
log_metadata = Column(JSONB, nullable=True)
```

---

### 1.8 [P2] Admin backup email receives every OTP — no toggle

**Finding:** `ADMIN_BACKUP_EMAIL` receives every OTP from every user. In production with many volunteers, this inbox receives hundreds of OTPs daily — a significant credential exposure risk if that email account is compromised.

**Fix:** Add `ADMIN_OTP_CC_ENABLED=false` env var. Only enable in staging/development. In production, use Brevo delivery receipts instead.

---

### 1.9 [P3] `X-Frame-Options: DENY` blocks legitimate embed use cases but CSP is also set

**Finding:** Both `X-Frame-Options: DENY` and `frame-ancestors 'none'` in CSP are set. This is redundant — CSP `frame-ancestors` supersedes `X-Frame-Options` in modern browsers. Keep CSP, remove the legacy header.

---

## 2. Backend — Bugs

### 2.1 [P0] `seed_demo.py` volunteer email lookup uses list comprehension that throws `StopIteration` on missing tag

**Finding:**
```python
tag = next(v["tag"] for v in VOLUNTEERS if sub(v["tag"]) == vol.email)
hub_idx = VOLUNTEERS[[v["tag"] for v in VOLUNTEERS].index(tag)]["hub"]
```
If `vol.email` is `None` (phone-only volunteer), `sub(v["tag"]) == None` never matches → `StopIteration` crashes the seed. This isn't caught by the `except Exception` block because `StopIteration` inside a generator is not a standard exception in Python 3.7+.

**Fix:**
```python
hub_idx = 0
if vol.email:
    match = next((v for v in VOLUNTEERS if sub(v["tag"]) == vol.email), None)
    if match:
        hub_idx = match["hub"]
```

---

### 2.2 [P1] `attendance/contacts` endpoint loads all contacts without pagination — can OOM on large campaigns

**Finding:** `GET /attendance/contacts` returns the entire contacts list as a JSON array in one response. At 10,000 contacts (plausible for a large crusade), this is a ~3–5MB JSON payload that must be held in memory on both server and client.

**Fix:** The endpoint is correct for the offline gate use case (need the full list locally), but stream the response:
```python
from fastapi.responses import StreamingResponse
import json

async def stream_contacts():
    yield '{"contacts":['
    first = True
    for c in contacts:
        if not first: yield ','
        yield json.dumps(serialize_contact(c))
        first = False
    yield ']}'

return StreamingResponse(stream_contacts(), media_type="application/json")
```
Also add server-sent compression: `Content-Encoding: gzip` via middleware.

---

### 2.3 [P1] `decision.currently_attending` CHECK constraint mismatch between model and schema

**Finding:** `decisions` table has:
```sql
CHECK (currently_attending IN ('yes','no','used_to'))
```
But `DecisionsLayout.jsx` sends `'yes'`, `'no'`, `'used_to'` — matching correctly. However `routers/decisions.py` passes the value directly without validation, meaning a client sending `'Yes'` (capitalised) silently fails at the DB constraint with a 500, not a 422.

**Fix:**
```python
@field_validator("currently_attending")
@classmethod
def validate_attending(cls, v):
    if v and v not in ('yes', 'no', 'used_to'):
        raise ValueError("currently_attending must be yes, no, or used_to")
    return v
```

---

### 2.4 [P1] `management.py` logistics endpoint — `updated_by` field returns UUID object, not string

**Finding:** The logistics return dict includes `"updated_by": str(l.updated_by)` — but if `updated_by` is `None` (no coordinator set yet), `str(None)` returns `"None"` (string), not `null`. Frontend code comparing this to a UUID will silently never match.

**Fix:**
```python
"updated_by": str(l.updated_by) if l.updated_by else None,
```

---

### 2.5 [P1] No idempotency key on walk-in registration — double-tap creates duplicate

**Finding:** If a Registration Team member taps "Register Walk-In" twice quickly (slow network, double tap), `POST /attendance/walk-in` is called twice. The phone uniqueness constraint on `contacts` catches the second call with a 500 (unique violation), not a clean 409. Frontend shows a generic error.

**Fix:** Wrap walk-in creation in a `try/except IntegrityError`:
```python
from sqlalchemy.exc import IntegrityError
try:
    db.add(contact)
    db.flush()
except IntegrityError:
    db.rollback()
    # Return the existing contact's check-in state
    existing = db.query(Contact).filter(...).first()
    return {"duplicate": True, "contact_id": existing.id, "checked_in": existing.attended}
```

---

### 2.6 [P2] `dashboard/volunteer` endpoint doesn't exist in the router — `VolunteerHome` will 404

**Finding:** `api.getVolunteerDashboard()` calls `GET /dashboard/volunteer`, but reviewing `routers/dashboard.py` from the original codebase, it exposes `/dashboard/hub` and `/dashboard/minister` but the volunteer dashboard route name may differ (e.g. `/dashboard/me` or `/volunteer/dashboard`).

**Fix:** Verify the route exists. Add if missing:
```python
@router.get("/dashboard/volunteer")
async def volunteer_dashboard(user: User = Depends(require_active_user), db: Session = Depends(get_db)):
    # total, confirmed, awaiting, unreached, streak_days
    ...
```

---

### 2.7 [P2] `decisions/export/csv` route conflicts with `decisions/{decision_id}` route

**Finding:** FastAPI will match `GET /decisions/export` against `GET /decisions/{decision_id}` with `decision_id="export"` — the export route is unreachable. This is a classic FastAPI route ordering bug.

**Fix:** In `routers/decisions.py`, define the export route BEFORE the `/{decision_id}` route:
```python
@router.get("/decisions/export/csv")   # Must come before ↓
async def export_decisions(...): ...

@router.get("/decisions/{decision_id}")  # Catches all other IDs
async def get_decision(...): ...
```
The current code in `decisions.py` already has `export/csv` path, but verify the registration order in the file.

---

### 2.8 [P2] `contacts.py` bulk add doesn't validate phone uniqueness within the batch itself

**Finding:** When a volunteer adds 10 contacts in bulk, if two rows have the same phone number, the first succeeds, the second throws an `IntegrityError` on the DB commit, and the entire batch rolls back — but the user sees a generic 500 error, not "row 7 has a duplicate phone".

**Fix:** Pre-validate for intra-batch duplicates:
```python
phones = [r.phone for r in body.records]
if len(phones) != len(set(phones)):
    dupes = [p for p in phones if phones.count(p) > 1]
    raise HTTPException(422, detail=f"Duplicate phones in batch: {list(set(dupes))}")
```

---

### 2.9 [P3] `AuditLog` `db.commit()` inside `log_action()` can mask transaction rollbacks

**Finding:** `dependencies.log_action()` calls `db.commit()` internally. If called mid-transaction where the main work hasn't committed yet, the log commits but the main data doesn't — or vice versa. On rollback, the audit log is lost.

**Fix:** Remove `db.commit()` from `log_action`. Let the caller commit everything together:
```python
def log_action(db, user, action, ...):
    log = AuditLog(...)
    db.add(log)
    # No commit — caller commits everything atomically
```

---

### 2.10 [P3] `alembic` not configured — autogenerate won't find models

**Finding:** The project includes `alembic` in `requirements.txt` and references it in docs, but `alembic.ini` and `alembic/env.py` don't appear to be configured to import the REACH models. Running `alembic revision --autogenerate` on a fresh clone will produce an empty migration.

**Fix:** Ensure `alembic/env.py` includes:
```python
from backend.models import Base
target_metadata = Base.metadata
```
And `alembic.ini` points to the correct `sqlalchemy.url` (or reads from env).

---

## 3. Frontend — Bugs

### 3.1 [P1] `ThemeToggle` reads `getAttribute` at render time — doesn't re-render on toggle

**Finding:**
```jsx
const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
```
This is evaluated once at component mount. If the theme changes (from a different toggle instance on the same page), the icon doesn't update — it stays showing the wrong icon until a full page reload.

**Fix:** Use a React state that listens to the custom event:
```jsx
function ThemeToggle() {
  const [isDark, setIsDark] = useState(
    document.documentElement.getAttribute('data-theme') === 'dark'
  );
  useEffect(() => {
    const handler = (e) => setIsDark(e.detail === 'dark');
    window.addEventListener('reach:theme', handler);
    return () => window.removeEventListener('reach:theme', handler);
  }, []);
  // ...
}
```

---

### 3.2 [P1] `useAuth` — `refreshUser` not called on tab focus after idle

**Finding:** If a user leaves the app open for 60+ minutes (access token expiry) and comes back, the next API call returns 401, the `reach:logout` event fires, and they're kicked out with no warning. On mobile where tabs are backgrounded frequently, this is a constant annoyance.

**Fix:**
```jsx
useEffect(() => {
  const onFocus = async () => {
    const token = tokenStore.get();
    if (!token) return;
    // Check expiry from JWT payload
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    if (Date.now() / 1000 > exp - 120) {
      // Refresh 2 minutes before expiry
      try { await api.refresh(); } catch { logout(); }
    }
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onFocus();
  });
  return () => {
    window.removeEventListener('focus', onFocus);
  };
}, []);
```

---

### 3.3 [P1] `AttendLayout` — undo timer and check-in rollback don't call an API undo endpoint

**Finding:** The undo functionality in `AttendLayout` sets local state back but there's no corresponding API call to undo the check-in on the server. The next page refresh will show the person as checked in again.

**Fix:** Add `POST /attendance/undo-check-in` endpoint:
```python
@router.post("/attendance/undo-check-in")
async def undo_check_in(body: CheckInBody, user=..., db=...):
    contact = db.query(Contact).filter(Contact.id == body.contact_id, ...).first()
    contact.attended = False
    contact.attended_at = None
    db.query(Attendance).filter(Attendance.contact_id == body.contact_id, ...).delete()
    db.commit()
```

---

### 3.4 [P1] `ContactsList` — status update sends `code` directly but backend expects `status_code`

**Finding:** `api.updateStatus(selected.id, code)` calls `PATCH /contacts/{id}/status` with body `{ status: code }`. The backend schema may expect `{ status_code: code }`. This mismatch causes silent 422 errors — the toast says "Status updated" (optimistic), but the server rejects it.

**Fix:** Verify the exact field name the backend expects and align. One canonical approach:
```python
# backend schema
class StatusUpdateBody(BaseModel):
    status: ContactStatusCode  # or status_code — pick one and use it everywhere
```
```js
// frontend api.js
updateStatus(id, code) { return request('PATCH', `/contacts/${id}/status`, { status: code }); }
```

---

### 3.5 [P2] `MinisterLayout` — "Invite Hub Leader" button in page header calls `() => {}` (no-op)

**Finding:**
```jsx
<button className="btn btn-primary btn-sm" onClick={() => {}}>
  + Invite Hub Leader
</button>
```
The dashboard header button does nothing. The invite modal is only accessible from `MinisterVolunteers` page.

**Fix:** Either remove the dashboard button or wire it to open the invite modal (needs modal state lifted or a navigation trigger to `/admin-panel/volunteers`).

---

### 3.6 [P2] `DecisionsLayout` — form clear button uses `setForm(EMPTY_FORM)` but doesn't reset collapsible state

**Finding:** After clearing the form, `bgOpen` (background section toggle) stays in its previous state. If the user had the background section open, it stays open on the next entry — potentially confusing for fast-paced altar call data entry.

**Fix:**
```jsx
<button onClick={() => { setForm(EMPTY_FORM); setBgOpen(false); }}>Clear</button>
```

---

### 3.7 [P2] `cache.js` — background refresh fires even when component unmounts

**Finding:**
```js
if (entry && now - entry.ts < ttlMs) {
    fetchFn().then(fresh => CACHE.set(key, { data: fresh, ts: now })).catch(() => {});
    return Promise.resolve(entry.data);
}
```
The background `fetchFn()` Promise has no cancellation. If the component unmounts before it resolves, it still sets the cache — which is fine — but also triggers React state updates if `then()` chains are attached downstream, causing "setState on unmounted component" warnings and potential memory leaks.

**Fix:** The cache itself is fine. The issue is callers doing `.then(setData)` on the result. Use `useEffect` cleanup:
```jsx
useEffect(() => {
  let alive = true;
  cached('key', fetchFn, ttl).then(d => { if (alive) setData(d); });
  return () => { alive = false; };
}, []);
```

---

### 3.8 [P2] `LoginPage` — hub selection step calls `verifyOtp` again with the same OTP

**Finding:** Step 3 (hub selection) calls `api.verifyOtp(channel, identifier, otp, name, hubId)`. But the OTP session was already consumed in step 2. The second call will fail with "OTP expired or not found" because the session was deleted after the first successful verify.

**Fix:** The backend `verify-otp` response on step 2 should return a short-lived `setup_token` (separate from the access token) that step 3 exchanges for a full token:
```python
# Step 2 response for new users:
{ "status": "pending", "setup_token": "...", "is_new_user": true }

# Step 3: POST /auth/complete-setup
{ "setup_token": "...", "hub_id": "...", "name": "..." }
```
Or alternatively, pass `hub_id` and `name` in the original step 2 verify call so the second round-trip isn't needed.

---

### 3.9 [P3] `OTPInput` — paste handler assumes pasted content starts at cell 0 regardless of focused cell

**Finding:** If a user clicks cell 3 and pastes a 6-digit code, it fills from index 0 — not from the cursor position. Minor UX issue but noticeable.

**Fix:** Track which cell triggered the paste:
```jsx
function handlePaste(e, startIdx) {
  e.preventDefault();
  const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6 - startIdx);
  const next = digits.slice();
  pasted.split('').forEach((ch, i) => { if (startIdx + i < 6) next[startIdx + i] = ch; });
  onChange(next.join(''));
}
// On each cell: onPaste={e => handlePaste(e, i)}
```

---

### 3.10 [P3] `global.css` — `.btn-full` desktop cap conflicts with form footers

**Finding:**
```css
@media (min-width: 768px) {
  .btn-full:not(.btn-full-force) { max-width: 320px; }
}
```
Form sticky footers need full-width buttons even on desktop (`.btn-full-force` handles this). But several modal footers use `.btn-full` without `.btn-full-force` — they get capped at 320px inside a 480px modal, leaving dead space on the right.

**Fix:** Add an exception: inside `.modal`, `.btn-full` should always be 100%:
```css
.modal .btn-full { max-width: 100%; }
```

---

## 4. Database

### 4.1 [P0] No partial index on `contacts(phone, campaign_id)` — uniqueness check is a full table scan on large campaigns

**Finding:** The unique constraint `UNIQUE (phone, campaign_id)` uses a regular B-tree index. On a campaign with 50,000 contacts, every `INSERT` triggers a full index scan for uniqueness. For bulk inserts this is O(n²).

**Fix:**
```sql
-- Drop and recreate as a partial index (excludes deleted contacts)
ALTER TABLE contacts DROP CONSTRAINT uq_contact_phone_campaign;
CREATE UNIQUE INDEX uix_contacts_phone_campaign_active
  ON contacts(phone, campaign_id)
  WHERE deleted_at IS NULL;
```

---

### 4.2 [P1] `contact_statuses` has no constraint ensuring only one status per contact at a time

**Finding:** The table stores status history (correct), but no application logic prevents inserting two statuses for the same contact with the same timestamp. The `current_status` property uses `statuses[-1]` — if two statuses have identical `updated_at`, the result is non-deterministic.

**Fix:**
```sql
-- Ensure microsecond uniqueness
ALTER TABLE contact_statuses
  ADD CONSTRAINT uq_contact_status_time UNIQUE (contact_id, updated_at);
```
And in the application, add 1 microsecond if there's a collision.

---

### 4.3 [P1] `attendances` table allows duplicate check-ins for the same contact

**Finding:** A contact can have multiple rows in `attendances` for the same `campaign_id` — nothing prevents it at the DB level. The application logic is supposed to prevent it, but there's no DB constraint as the final guard.

**Fix:**
```sql
CREATE UNIQUE INDEX uix_attendances_contact_campaign
  ON attendances(contact_id, campaign_id)
  WHERE contact_id IS NOT NULL;
```

---

### 4.4 [P1] `decisions` table — `phone_1` has no E.164 check constraint

**Finding:** `contacts.phone` has `CHECK (phone ~ '^\+[1-9]\d{7,14}$')`. `decisions.phone_1` has no such constraint. Walk-in decision entries with malformed phone numbers silently persist.

**Fix:**
```sql
ALTER TABLE decisions
  ADD CONSTRAINT chk_decision_phone_e164
  CHECK (phone_1 ~ '^\+[1-9]\d{7,14}$');
```

---

### 4.5 [P1] No `updated_at` trigger on `decisions` table

**Finding:** `decisions.updated_at` is set via SQLAlchemy `onupdate=func.now()` — but this only fires when the ORM is used. Direct SQL updates (migration patches, Supabase dashboard edits) won't update `updated_at`.

**Fix:**
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_decisions_updated_at
  BEFORE UPDATE ON decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Apply to logistics table too
CREATE TRIGGER trg_logistics_updated_at
  BEFORE UPDATE ON logistics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

### 4.6 [P2] `refresh_tokens` table grows unboundedly — no TTL cleanup job

**Finding:** Expired and revoked refresh tokens are never deleted. After 6 months of production use with hundreds of volunteers logging in daily, this table will have tens of thousands of dead rows affecting query performance.

**Fix:** Add a cleanup job (GitHub Actions, cron, or Supabase pg_cron):
```sql
-- Run weekly via pg_cron or GitHub Actions
DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '7 days';
DELETE FROM otp_sessions WHERE expires_at < NOW() - INTERVAL '1 day';
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
```

---

### 4.7 [P2] `otp_sessions` `identifier_hash` is UNIQUE — but a volunteer with both phone and email login attempts creates two sessions that aren't linked

**Finding:** If a user tries phone login, creates an OTP session, then tries email login for the same account, they create a second OTP session with a different `identifier_hash`. The phone session stays locked if they exceeded attempts, but the email session is fresh with 0 attempts. This partially defeats the lockout.

**Fix:** Link OTP sessions to `user_id` when the user is known:
```sql
ALTER TABLE otp_sessions ADD COLUMN user_id UUID REFERENCES users(id);
```
And check lockout by `user_id` in addition to `identifier_hash`.

---

### 4.8 [P2] Missing index on `follow_up_queues(assigned_to, status)`

**Finding:** The call queue page queries follow-up items by `assigned_to = volunteer_id AND status IN ('pending', 'in_progress')`. Without a composite index, this is a sequential scan on the full table.

**Fix:**
```sql
CREATE INDEX ix_follow_up_queues_assigned_status
  ON follow_up_queues(assigned_to, status)
  WHERE status IN ('pending', 'in_progress');
```

---

### 4.9 [P3] Supabase free tier has 500MB storage limit — no monitoring

**Finding:** No alert exists for when the database approaches capacity. At 1,100 contacts with status history, audit logs, and OTP sessions, the DB is ~10MB. At 50,000 contacts (large crusade), it approaches ~400MB. No warning system means a surprise outage.

**Fix:** Add a GitHub Actions weekly check:
```yaml
- name: Check DB size
  run: |
    SIZE=$(psql "$DATABASE_URL" -t -c "SELECT pg_database_size(current_database())")
    echo "DB size: $SIZE bytes"
    if [ $SIZE -gt 450000000 ]; then
      echo "WARNING: DB approaching 500MB Supabase free limit"
      exit 1
    fi
```

---

### 4.10 [P3] `campaigns` table — `created_by` has no foreign key constraint

**Finding:**
```python
created_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
```
The model has the FK defined but the `schema.sql` does not include `REFERENCES users(id)` on `campaigns.created_by`. If the schema.sql is the source of truth for fresh databases, this constraint is missing there.

**Fix:** Update `schema.sql`:
```sql
created_by UUID REFERENCES users(id),
```

---

## 5. Architecture

### 5.1 [P1] No API versioning — breaking changes will break existing app sessions

**Finding:** All routes are at `/auth/*`, `/contacts/*` etc. with no version prefix. When you ship a breaking API change, all clients on the old frontend version will break simultaneously — including volunteers mid-field during an event.

**Fix:** Prefix all routes: `/v1/auth/*`, `/v1/contacts/*`. Add version header: `X-API-Version: 1`. The frontend `api.js` `BASE` variable makes this a one-line change.

---

### 5.2 [P1] Service Worker not implemented — offline-first architecture is documented but not shipped

**Finding:** `docs/ARCHITECTURE.md` and the master plan describe a Service Worker for offline caching and sync queues. `lib/offline.js` has IndexedDB helpers. But there is no `public/sw.js` and no Service Worker registration in `main.jsx`. The offline feature is documented and partially stubbed but not functional.

**Fix:** Register a Service Worker:
```js
// main.jsx
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}
```
Implement `public/sw.js` with Workbox or a minimal cache-first strategy for the app shell.

---

### 5.3 [P2] No request deduplication — rapid navigation causes race conditions

**Finding:** `cached()` in `lib/cache.js` fires a background refresh on cache hit. If a user navigates quickly between tabs, multiple background refreshes run simultaneously for the same key. The last one to resolve wins — which may be the stale one if network responses arrive out of order.

**Fix:** Track in-flight requests:
```js
const INFLIGHT = new Map(); // key → Promise

export function cached(key, fetchFn, ttlMs = 30_000) {
  const entry = CACHE.get(key);
  const now   = Date.now();
  if (entry && now - entry.ts < ttlMs) {
    if (!INFLIGHT.has(key)) {
      const p = fetchFn().then(fresh => { CACHE.set(key, { data: fresh, ts: now }); INFLIGHT.delete(key); }).catch(() => INFLIGHT.delete(key));
      INFLIGHT.set(key, p);
    }
    return Promise.resolve(entry.data);
  }
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);
  const p = fetchFn().then(data => { CACHE.set(key, { data, ts: now }); INFLIGHT.delete(key); return data; });
  INFLIGHT.set(key, p);
  return p;
}
```

---

### 5.4 [P2] Render free tier cold start UX — the "Starting up…" screen is not implemented

**Finding:** The master plan specifies: "If first API call takes >2.5s, show a branded 'Starting up…' screen." This is not in the current code. On cold start, users see a spinner forever with no feedback.

**Fix:**
```js
// api.js — wrap the first request
let isFirstRequest = true;
async function request(method, path, body, signal) {
  const start = Date.now();
  if (isFirstRequest) {
    const timeout = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('reach:slow-start'));
    }, 2500);
    try {
      const res = await fetch(...);
      clearTimeout(timeout);
      isFirstRequest = false;
      return res;
    } catch (e) { clearTimeout(timeout); throw e; }
  }
  return fetch(...);
}
```

---

### 5.5 [P3] `frontend/src/components/ui/index.js` exports components that no longer match the updated implementations

**Finding:** The original codebase had a `components/ui/index.js` barrel file. The new `Badge.jsx` and `OTPInput.jsx` implementations may not be re-exported from there, causing import path inconsistencies across the codebase (some files import from `../../components/UI`, others from `../../components/ui/Badge`).

**Fix:** Audit all imports. Standardise on two paths: `../components/UI` for the main barrel (Spinner, EmptyState, Modal, Skeleton, Badge) and direct imports for specialised components.

---

## 6. Performance

### 6.1 [P2] `MinisterDemographics` loads recharts without lazy loading — adds ~200KB to initial bundle

**Finding:** `MinisterDemographics` imports recharts at the top level. This is a minister-only page that most users (volunteers) never see, but they pay the bundle cost on every load.

**Fix:**
```jsx
const MinisterDemographics = lazy(() => import('./minister/MinisterDemographics'));
```
Already done for `AttendLayout` and `DecisionsLayout` — apply consistently to all minister pages.

---

### 6.2 [P2] No `Connection: keep-alive` ping — Supabase EU-West connection pool times out on idle

**Finding:** Supabase with SQLAlchemy uses `pool_pre_ping=True` (connection is pinged before each query). But if the pool idles for >10 minutes, the ping on the next request adds ~50–100ms latency to every first query after idle — compounding with the Render cold start.

**Fix:** Add a pool heartbeat:
```python
# main.py lifespan
async def heartbeat():
    while True:
        await asyncio.sleep(300)  # 5 minutes
        try:
            db = SessionLocal()
            db.execute(text("SELECT 1"))
            db.close()
        except Exception: pass

asyncio.create_task(heartbeat())
```

---

### 6.3 [P3] `demographics` endpoint recomputes aggregations on every request — no materialised view

**Finding:** The demographics endpoint runs `COUNT`, `GROUP BY`, and multi-join aggregations on every request. With 10,000+ contacts, these queries will take 500ms–2s. The 60s HTTP cache helps, but the first user each minute pays the full cost.

**Fix:** Use a PostgreSQL materialised view, refreshed every 5 minutes:
```sql
CREATE MATERIALIZED VIEW mv_demographics AS
  SELECT
    c.campaign_id,
    cs.status_code,
    COUNT(*) as count,
    c.location
  FROM contacts c
  LEFT JOIN LATERAL (
    SELECT status_code FROM contact_statuses
    WHERE contact_id = c.id ORDER BY updated_at DESC LIMIT 1
  ) cs ON true
  WHERE c.deleted_at IS NULL
  GROUP BY c.campaign_id, cs.status_code, c.location;

CREATE UNIQUE INDEX ON mv_demographics (campaign_id, status_code, location);

-- Refresh via pg_cron or a background task:
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_demographics;
```

---

## 7. Testing — Gaps

### 7.1 [P1] Zero automated tests — no CI test suite exists

**Finding:** The project has no test files anywhere. There is a `.github/workflows/ci.yml` file referenced in the directory listing but it presumably only lints or deploys. Zero test coverage on:
- Auth flow (OTP issue → verify → token → refresh → logout)
- Invite claim (valid / expired / already claimed)
- Contact status transitions
- Attendance check-in idempotency
- Decision entry validation

**Minimum test suite to add:**

```python
# backend/tests/test_auth.py
def test_send_otp_creates_session(client, db): ...
def test_verify_otp_returns_token(client, db): ...
def test_verify_otp_wrong_code_increments_attempts(client, db): ...
def test_verify_otp_lockout_after_5_attempts(client, db): ...
def test_refresh_token_rotation(client, db): ...
def test_invite_preview_valid(client, db): ...
def test_invite_preview_expired(client, db): ...
def test_claim_invite_creates_user(client, db): ...
```

**Recommended stack:** `pytest` + `httpx.AsyncClient` + `pytest-asyncio` + SQLite in-memory for speed.

---

### 7.2 [P2] No E2E test for the attendance gate flow

**Finding:** The gate search + check-in flow is the most critical user journey on event day. A regression here (search returns wrong results, check-in doesn't persist, walk-in duplicate detection broken) has immediate real-world impact with no time to fix.

**Recommended:** Add a single Playwright test:
```js
test('gate search finds contact and checks them in', async ({ page }) => {
  await page.goto('/attend');
  await page.fill('[placeholder*="Search"]', 'Blessing');
  await expect(page.locator('.attend-row')).toHaveCount(1);
  await page.click('.attend-row');
  await page.click('button:has-text("Check In")');
  await expect(page.locator('.attend-row.checked-in')).toBeVisible();
});
```

---

## 8. Summary — Priority Order

| # | Severity | Finding | Effort |
|---|---|---|---|
| 1.1 | P0 | JWT secret rotation mechanism | Medium |
| 1.2 | P0 | Refresh token family not revoked on invite claim | Small |
| 2.6 | P1 | Volunteer dashboard route may not exist | Small |
| 2.7 | P1 | Decisions export route shadowed by `/{id}` route | Small |
| 3.8 | P1 | LoginPage hub selection re-calls verifyOtp with consumed OTP | Medium |
| 3.2 | P1 | No token refresh on tab focus — users kicked out mid-session | Small |
| 3.3 | P1 | Attendance undo has no API call | Small |
| 3.4 | P1 | Status update field name mismatch (status vs status_code) | Tiny |
| 1.5 | P1 | OTP lockout bypassable by re-requesting OTP | Small |
| 4.3 | P1 | No DB constraint preventing duplicate check-ins | Tiny |
| 2.5 | P1 | Walk-in double-tap creates 500 not 409 | Small |
| 3.1 | P1 | ThemeToggle icon doesn't update reactively | Tiny |
| 3.5 | P2 | Dashboard invite button is a no-op | Tiny |
| 5.2 | P1 | Service Worker not implemented — offline is undone | Large |
| 7.1 | P1 | Zero automated tests | Large |
| 4.6 | P2 | refresh_tokens grows unboundedly | Small |
| 6.1 | P2 | Recharts not lazy-loaded for minister pages | Tiny |
| 5.4 | P2 | Cold start UX screen not implemented | Small |
| All others | P2–P3 | See sections above | Varies |

---

## 9. What is solid — don't break it

- **Enum serialisation fix** (`str, Enum` inheritance) is correct and comprehensive.
- **Cookie config** (`httponly=True`, `secure=True`, `samesite="none"`) is correct for cross-origin Vercel ↔ Render.
- **Row-level access control** is implemented at query level (not just frontend) — this is architecturally correct and important.
- **Optimistic UI pattern** in contacts and logistics is implemented correctly with proper rollback.
- **`lib/labels.js`** single source of truth for all enum labels — the right pattern, eliminates the status display bug permanently.
- **Schema idempotency** — all `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` — safe to re-run on production.
- **Security headers** (HSTS, CSP, X-Frame-Options, Referrer-Policy) — correct and comprehensive.
- **`cached()` SWR pattern** — architecturally sound, serves stale immediately and refreshes in background.
- **`OTPInput` 6-cell component** — auto-advance, backspace, paste — correct implementation.
- **`confettiBurst`** — scoped CSS, no library dependency — correct.

---

*This audit covers commit state as of v1.0.0. Re-audit after P0/P1 fixes ship.*
