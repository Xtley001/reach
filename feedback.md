# REACH — Deep-Dive Codebase Feedback, Technical Audit & Roast

> **Project:** REACH (Ministry Outreach Platform)  
> **Date:** August 2026  
> **Target Audience:** Engineering Team, Product Leads & UI/UX Designers  
> **Objective:** Concrete, line-by-line review across backend and frontend, unvarnished architectural critique ("the roast"), crash analysis, and a comprehensive roadmap to double down on **ease of use and UI/UX excellence**.

---

## 1. The Roast: Reality vs. The Illusion

Before breaking down individual files, let's address the elephant in the room: **the gap between what the codebase claims to do in its comments and what the code actually does at runtime.**

1. **"Schrödinger’s Offline Sync":** The repository contains IndexedDB helpers, service workers, and sync queue models, yet `queueSync()` is **never called anywhere in the UI**. When a volunteer is on church grounds with zero cellular data and tries to add a contact, the app shows a red error toast and drops the data on the floor. Offline sync is purely theoretical.
2. **"The Ghost Enum & Phantom Models":** Entire endpoints were written targeting nonexistent entities. `ContactStatusCode.attended` does not exist in `models.py`, so checking someone in at the gate raises an immediate `AttributeError`. `AttendanceRecord` does not exist in `models.py`, so exporting attendance silently crashes in a `try...except` and downloads a 0-byte CSV.
3. **"The Call Button to Nowhere":** The backend documentation proudly states that phone numbers are stripped from `GET /contacts` for privacy. Meanwhile, the frontend `ContactsList.jsx` renders direct `<a href="tel:${c.phone}">` and `<a href="https://wa.me/${c.phone}">` links on every row card. Because `c.phone` is `undefined`, volunteers are tapping buttons that literally dial `tel:undefined` or link to `#`.
4. **"The Split Personality CSS":** `global.css` defines an Apple-inspired `:root` design token set with carefully calibrated border radii and shadows, only to have a second `:root` block 100 lines down silently overwrite those variables with completely different values.
5. **"The Import Roulette":** In `backend/routers/management.py`, approval emails try to `from ..services.email import email_client`. There is **no `services/` directory in the entire backend**. Every approval silently catches `ModuleNotFoundError`.
6. **"The In-Memory Session Wipe":** In `backend/email_client.py`, the code accesses `settings.brevo_api_key` and `settings.brevo_sender` (lowercase), whereas `config.py` declares `BREVO_API_KEY` and `BREVO_SENDER`. In Pydantic v2 `BaseSettings`, attribute access is case-sensitive. Every email OTP dispatch in staging/production crashes with `AttributeError`.

---

## 2. Critical Bugs & Showstoppers (Immediate Fixes Required)

These bugs cause runtime 500 errors, unhandled promise rejections, or silent data loss.

---

### 🚨 Bug 1: `AttributeError` on `settings.brevo_api_key` & `settings.brevo_sender`
* **File:** [backend/email_client.py](file:///c:/Users/pc/Desktop/reach/backend/email_client.py#L38-L185) (Lines 38, 125, 126, 181, 182)
* **Root Cause:** `email_client.py` uses `settings.brevo_api_key` and `settings.brevo_sender`. In [backend/config.py](file:///c:/Users/pc/Desktop/reach/backend/config.py#L23-L24), the settings class defines them as `BREVO_API_KEY: str` and `BREVO_SENDER: str`.
* **Impact:** Sending OTPs via email or admin mirror notifications crashes with `AttributeError: 'Settings' object has no attribute 'brevo_api_key'`.
* **Fix:** Change all occurrences in `email_client.py` to `settings.BREVO_API_KEY` and `settings.BREVO_SENDER`.

---

### 🚨 Bug 2: Non-existent `ContactStatusCode.attended` Enum
* **File:** [backend/routers/attendance.py](file:///c:/Users/pc/Desktop/reach/backend/routers/attendance.py#L79-L85) (Line 82)
* **Root Cause:** When checking in a contact, the code adds a `ContactStatus` with `status_code=ContactStatusCode.attended`. In [backend/models.py](file:///c:/Users/pc/Desktop/reach/backend/models.py#L45-L54), `ContactStatusCode` only defines: `message_sent`, `coming`, `undecided`, `not_coming`, `no_answer`, `wrong_number`, `needs_transport`, `unreachable`.
* **Impact:** `POST /attendance/check-in` crashes with `AttributeError: type object 'ContactStatusCode' has no attribute 'attended'`, returning a 500 Internal Server Error at the gate.
* **Fix:** Either add `attended = "attended"` to `ContactStatusCode` in `models.py` (with an Alembic migration) or record attendance solely via the `Attendance` table without pushing an invalid status code to `contact_statuses`.

---

### 🚨 Bug 3: `InvalidRequestError` on `query.limit(1).delete()` in Undo Check-In
* **File:** [backend/routers/attendance.py](file:///c:/Users/pc/Desktop/reach/backend/routers/attendance.py#L406-L410) (Line 409)
* **Root Cause:**
  ```python
  db.query(Attendance).filter(
      Attendance.contact_id == contact.id,
      Attendance.campaign_id == campaign.id,
  ).order_by(Attendance.checked_in_at.desc()).limit(1).delete(synchronize_session=False)
  ```
  SQLAlchemy ORM explicitly forbids `.delete()` after `.limit()`: `sqlalchemy.exc.InvalidRequestError: Can't call Query.update() or Query.delete() when limit() has been called`.
* **Impact:** Tapping "Undo Check-In" within the 10-second gate grace window fails with 500 Internal Server Error.
* **Fix:** Query the record first with `.first()`, then call `db.delete(rec)`:
  ```python
  last_att = db.query(Attendance).filter(
      Attendance.contact_id == contact.id,
      Attendance.campaign_id == campaign.id,
  ).order_by(Attendance.checked_in_at.desc()).first()
  if last_att:
      db.delete(last_att)
  ```

---

### 🚨 Bug 4: Offline Sync Schema Mismatch & `c.local_id` Crash
* **Files:** [backend/routers/contacts.py](file:///c:/Users/pc/Desktop/reach/backend/routers/contacts.py#L620-L660) (Lines 629, 654, 658), [backend/schemas.py](file:///c:/Users/pc/Desktop/reach/backend/schemas.py#L141-L164), [frontend/src/hooks/useOfflineSync.js](file:///c:/Users/pc/Desktop/reach/frontend/src/hooks/useOfflineSync.js#L19)
* **Root Cause:**
  1. `sync_contacts` loops over `body.contacts` (which are `ContactCreate` objects) and accesses `c.local_id`. `ContactCreate` does **not** have a `local_id` field.
  2. Accessing `c.local_id` raises `AttributeError`, dropping execution into `except Exception:`, which tries to build `ContactSyncResult(local_id=c.local_id, ...)`, raising another `AttributeError` and returning a 500.
  3. On the frontend, `useOfflineSync.js` sends `api.syncContacts(queue)` where `queue` is a raw array `[...]`. But the backend expects `ContactSyncBatch`, which requires a JSON object `{"contacts": [...]}`.
* **Impact:** Offline sync fails 100% of the time, whether triggered manually or upon reconnection.
* **Fix:**
  1. In `schemas.py`, add `local_id: Optional[str] = None` to `ContactCreate` or create a dedicated `ContactSyncItem` schema.
  2. In `lib/api.js`, wrap the array: `syncContacts(contacts) { return request('POST', '/contacts/sync', { contacts }); }`.

---

### 🚨 Bug 5: `api.updateProfile` Sends JSON to a `Form(...)` Endpoint
* **Files:** [backend/routers/users.py](file:///c:/Users/pc/Desktop/reach/backend/routers/users.py#L19-L28), [frontend/src/lib/api.js](file:///c:/Users/pc/Desktop/reach/frontend/src/lib/api.js#L251), [frontend/src/pages/volunteer/VolunteerProfile.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/volunteer/VolunteerProfile.jsx#L25), [frontend/src/pages/hub/HubProfile.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/hub/HubProfile.jsx#L20), [frontend/src/pages/minister/MinisterProfile.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/minister/MinisterProfile.jsx#L21)
* **Root Cause:** The backend endpoint `PATCH /users/me/profile` declares arguments as `name: Optional[str] = Form(None), email: Optional[str] = Form(None)`. The frontend `api.updateProfile(form)` sends `request('PATCH', '/users/me/profile', form)` which serializes to `Content-Type: application/json`. FastAPI ignores JSON payloads when resolving `Form()` fields.
* **Impact:** When volunteers, hub leaders, or ministers update their name or phone in their profile, the request succeeds with 200 OK, but **no fields are updated**.
* **Fix:** Create a JSON Pydantic schema `ProfileUpdate` for `PATCH /users/me/profile` and reserve multipart/form-data for avatar uploads via a dedicated endpoint like `POST /users/me/avatar`.

---

### 🚨 Bug 6: Manual Bulk Add Sends Array Instead of `ContactBulkCreate` Object
* **Files:** [frontend/src/pages/volunteer/BulkAddContacts.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/volunteer/BulkAddContacts.jsx#L74), [backend/schemas.py](file:///c:/Users/pc/Desktop/reach/backend/schemas.py#L157-L159), [backend/routers/contacts.py](file:///c:/Users/pc/Desktop/reach/backend/routers/contacts.py#L376-L377)
* **Root Cause:** `BulkAddContacts.jsx` calls `api.addContactsBulk(payload)` where `payload` is `[ { name: ... }, ... ]`. Backend expects `{ "contacts": [...] }`. Furthermore, the frontend success view expects `result.created` and `result.skipped`, but the backend returns `{"saved": saved, "results": results}`.
* **Impact:** Manual Bulk Add 422s on submit. If bypassed, the completion screen displays `"undefined contacts added"`.
* **Fix:** In `api.js`: `addContactsBulk(contacts) { return request('POST', '/contacts/bulk', { contacts }); }`. Update `BulkAddContacts.jsx` to read `result.saved`.

---

### 🚨 Bug 7: Broken Imports `AttendanceRecord` in Management Exports
* **File:** [backend/routers/management.py](file:///c:/Users/pc/Desktop/reach/backend/routers/management.py#L820-L866) (Lines 820 & 866)
* **Root Cause:**
  ```python
  from ..models import AttendanceRecord
  ```
  The model is named `Attendance` in [backend/models.py](file:///c:/Users/pc/Desktop/reach/backend/models.py#L546). The `try...except` block catches the `ImportError` and sets `records = []`.
* **Impact:** `GET /minister/export/attendance` and `GET /minister/export/walk_ins` always export empty CSV files with 0 data rows.
* **Fix:** Change import to `from ..models import Attendance` and update column access to match `Attendance` fields (`contact.name`, `contact.phone`, `checked_in_at`).

---

### 🚨 Bug 8: Missing `..services.email` in Hub Volunteer Approval/Rejection
* **File:** [backend/routers/management.py](file:///c:/Users/pc/Desktop/reach/backend/routers/management.py#L129-L171) (Lines 129 & 170)
* **Root Cause:**
  ```python
  from ..services.email import email_client
  ```
  There is no `services` package. The real client is `backend.email_client`.
* **Impact:** No notification email is ever sent to approved or rejected volunteers.
* **Fix:** Import and invoke `send_otp` / approval notification helpers from `backend.email_client`.

---

### 🚨 Bug 9: `bulk_paste_import` Transaction Rollback Loop Bug
* **File:** [backend/routers/contacts.py](file:///c:/Users/pc/Desktop/reach/backend/routers/contacts.py#L239-L245)
* **Root Cause:**
  ```python
  for row in body.rows:
      ...
      db.add(contact)
      try:
          db.flush()
      except IntegrityError:
          db.rollback()
          results.append(...)
          continue
  ```
  Calling `db.rollback()` on the shared session wipes out **all previously flushed contacts in the batch**.
* **Impact:** If row 10 in a 50-row paste has an integrity error, rows 1–9 that were marked `"saved"` are permanently lost.
* **Fix:** Use savepoints (`with db.begin_nested():`) to isolate row-level failures:
  ```python
  for row in body.rows:
      try:
          with db.begin_nested():
              contact = Contact(...)
              db.add(contact)
              db.flush()
          results.append(PasteImportResultRow(phone=row.phone, status="saved", id=contact.id))
      except IntegrityError:
          results.append(PasteImportResultRow(phone=row.phone, status="error", message="Duplicate or invalid"))
  db.commit()
  ```

---

### 🚨 Bug 10: PostgreSQL-Specific `= ANY(:vol_ids)` Syntax in SQLite Dev/Test
* **File:** [backend/routers/dashboard.py](file:///c:/Users/pc/Desktop/reach/backend/routers/dashboard.py#L243)
* **Root Cause:** Raw SQL string uses `WHERE c.added_by = ANY(:vol_ids)`. This is invalid syntax in SQLite.
* **Impact:** Running local dev or tests with SQLite crashes with `OperationalError: near "ANY": syntax error`.
* **Fix:** Use standard SQLAlchemy ORM query or cross-dialect SQL (`WHERE c.added_by IN :vol_ids`).

---

### 🚨 Bug 11: Non-Existent `needs_message` Filter on Backend
* **Files:** [frontend/src/pages/volunteer/VolunteerHome.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/volunteer/VolunteerHome.jsx#L150), [backend/routers/contacts.py](file:///c:/Users/pc/Desktop/reach/backend/routers/contacts.py#L411-L430)
* **Root Cause:** `VolunteerHome.jsx` calls `api.listContacts('needs_message')` to count pending WhatsApp messages. The backend `GET /contacts` endpoint does not recognize `needs_message` and defaults to returning **all contacts**.
* **Impact:** The button on the home screen displays `"📱 {total_contacts} contacts waiting for WhatsApp"`, confusing volunteers.
* **Fix:** Add `needs_message` to backend filters (`item.message_sent_count === 0 && item.current_status !== 'not_coming'`).

---

## 3. Architecture & Code Quality Audit

```
┌──────────────────────────────────────────────────────────────────┐
│                         REACH TOPOLOGY                           │
├───────────────────┬────────────────────────────┬─────────────────┤
│ Frontend (SPA)    │ Backend (FastAPI + SQLA)   │ Database & Svc  │
├───────────────────┼────────────────────────────┼─────────────────┤
│ React 18 + Vite   │ FastAPI 0.115 / Pydantic 2 │ Supabase PG     │
│ Custom CSS Tokens │ SlowAPI Rate Limiting      │ Redis (Optional)│
│ IndexedDB Cache   │ JWT + Rotated Refresh Tkns │ Brevo HTTP API  │
└───────────────────┴────────────────────────────┴─────────────────┘
```

### Architectural Deficiencies

1. **Single-Campaign Assumption:**  
   Across multiple routers ([attendance.py](file:///c:/Users/pc/Desktop/reach/backend/routers/attendance.py#L40), [contacts.py](file:///c:/Users/pc/Desktop/reach/backend/routers/contacts.py#L44), [dashboard.py](file:///c:/Users/pc/Desktop/reach/backend/routers/dashboard.py#L24), [decisions.py](file:///c:/Users/pc/Desktop/reach/backend/routers/decisions.py#L42)), active campaign resolution is done via:
   ```python
   campaign = db.query(Campaign).filter(Campaign.organisation_id == user.organisation_id, Campaign.status == CampaignStatus.active).first()
   ```
   If an organisation creates a secondary campaign or transitions between crusades, all users are silently bound to whichever row `.first()` returns. Active campaign ID should be explicit in the user context or selectable in the app header.

2. **Decoupled Auth & Role State:**  
   In [frontend/src/App.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/App.jsx#L156-L203), role routing is mutually exclusive at the root level (`user.role === 'minister'` only routes to `/admin-panel/*`). However, ministers often need to check in attendees at the gate (`/attend`) or enter decisions (`/decisions`). The root router restricts registration and decision views behind separate role walls or hardcoded redirects.

3. **Inconsistent Navigation Routing:**  
   - In Minister layout: `/admin-panel/hubs/:hubId` and `/admin-panel/volunteers/:volId` are proper URL routes.
   - In Hub Leader layout: Clicking a volunteer renders [VolunteerDetail.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/hub/VolunteerDetail.jsx) via React state (`selectedId`). This breaks browser Back/Forward navigation, bookmarking, and deep links.

4. **Duplicate Design System Declarations:**  
   In [frontend/src/styles/global.css](file:///c:/Users/pc/Desktop/reach/frontend/src/styles/global.css#L4-L65) and lines 137–183, two separate `:root` blocks define competing values for `--radius`, `--shadow`, and typography scales. This causes subtle CSS specificity bugs and broken button border-radii across dark/light mode toggles.

---

## 4. Double Down on Ease of Use & UI/UX

To make REACH the easiest, most rewarding outreach app available for church volunteers and ministers, the following UI/UX overhauls should be implemented.

```
VOLUNTEER CALL WORKFLOW (TARGET UX)
┌──────────────────────────────────────────────────────────┐
│ [📞 Dial Next: Blessing O. (+234 801 234 5678)]           │
├──────────────────────────────────────────────────────────┤
│ 1. Tap to Call → Phone opens system dialer               │
│ 2. Return to App → Auto-sheet appears: "How did it go?"  │
│ 3. One-tap Receptivity: [Picked Up] [No Answer] [Busy]   │
│ 4. If Picked Up: [✓ Coming] [? Undecided] [🚌 Needs Bus] │
│ 5. Auto-advance to next contact in queue + Haptic Ping   │
└──────────────────────────────────────────────────────────┘
```

### A. Volunteer Experience Overhaul

1. **Working Quick Actions on Contact Cards:**
   - Restore phone access for the card actions (or fetch via detail on demand) so the `Call` and `WhatsApp` buttons immediately trigger the dialer/WhatsApp.
   - **Auto-Call Disposition Sheet:** When a user taps "Call", register a focus listener on the window. When the volunteer returns to REACH, automatically pop up a minimal 2-tap bottom sheet:
     - Step 1: *Did they answer?* `[Picked Up]` / `[No Answer]` / `[Wrong Number]`
     - Step 2 (if answered): *Are they coming?* `[Coming]` / `[Undecided]` / `[Needs Bus]` / `[Not Coming]`
     - Saves in < 2 seconds and advances to the next contact.

2. **Gamification & Dopamine Loops:**
   - The Nigerian church outreach culture thrives on celebration. Add lightweight sound/haptic feedback and micro-animations when:
     - A contact is marked "Coming" (golden glow + confetti burst).
     - A streak milestone (3 days, 7 days) is hit.
     - A volunteer completes their daily call queue.

3. **Paste-to-Import "Finish Batch" Wizard:**
   - After importing 50 phone numbers via paste, instead of dumping the volunteer into a static table, provide a **Rapid Fill Mode**:
     - Shows 1 contact card at a time with keyboard auto-focused on "Area / Location".
     - Presets for popular areas in the hub (e.g., `[Surulere]`, `[Yaba]`, `[Ikeja]`, `[Lekki]`).
     - Tapping an area saves and slides to the next incomplete contact.

4. **Offline Queue Visualizer & Auto-Retry:**
   - Replace the subtle sync dot with an interactive sync indicator badge:
     - Displays `3 contacts waiting to sync`.
     - When connection resumes, shows a non-intrusive green toast: `✓ 3 contacts synced to cloud`.

---

### B. Hub Leader Experience Overhaul

1. **Bulk Contact Reassignment:**
   - When a volunteer becomes inactive or leaves the hub, the hub leader currently has to reassign contacts one by one.
   - **Solution:** Add a "Reassign All" tool on `VolunteerDetail`:
     - Select target active volunteer from dropdown.
     - Move 20 contacts in one click with audit log entry.

2. **Transport & Logistics Hub Matrix:**
   - Replace the flat list in [HubLogistics.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/hub/HubLogistics.jsx) with an **Area Clustered View**:
     - Groups contacts needing buses by Pickup Location (e.g., *Iyana Ipaja: 14 people*, *Ojota: 8 people*).
     - Single-click action to export bus manifests or share pickup lists via WhatsApp with bus captains.

3. **Direct WhatsApp Hub Broadcast Generator:**
   - Provide pre-filled WhatsApp templates for the hub leader to encourage their volunteers:
     - *"Hey team! We have reached 140 confirmed guests. Let's make 5 calls each today to cross our 200 target!"*

---

### C. Minister & Executive Experience Overhaul

1. **Crusade/Event Day Live Ticker:**
   - On event day, the minister dashboard should transform into an **Active Gate Ticker**:
     - Large live counter: Total Attendance, Pre-registered Checked In, Walk-Ins, Decisions Recorded.
     - Pulse indicator showing real-time check-ins per minute.

2. **Frictionless Decision Altar Entry ("Fast Track Mode"):**
   - Counsellors at the altar deal with loud, crowded environments. The 20-field decision form is too slow.
   - **Solution:** Add a toggle between **Fast Track Mode** (Name, Phone, Decision Type — 3 taps, 5 seconds) and **Detailed Counselling Mode** (Church background, referral area, counsellor notes).

3. **Clean Export Manager:**
   - Add pre-configured export recipes:
     - `Transport Manifest (CSV)`
     - `Follow-Up List: First-Time Decisions (CSV)`
     - `Unreached Contacts for Re-engagement (CSV)`

---

## 5. Comprehensive File-by-File Audit & Status Matrix

| Component | File Path | Status / Critical Findings | Severity |
| :--- | :--- | :--- | :--- |
| **Config** | [backend/config.py](file:///c:/Users/pc/Desktop/reach/backend/config.py) | Settings attributes uppercase (`BREVO_API_KEY`), but callers use lowercase. | 🔴 High |
| **Email** | [backend/email_client.py](file:///c:/Users/pc/Desktop/reach/backend/email_client.py) | Lowercase `settings.brevo_api_key` causes `AttributeError` on every send. | 🔴 High |
| **Database** | [backend/database.py](file:///c:/Users/pc/Desktop/reach/backend/database.py) | Connection pool configured well, SQLite pool args handled properly. | 🟢 Good |
| **Models** | [backend/models.py](file:///c:/Users/pc/Desktop/reach/backend/models.py) | Missing `ContactStatusCode.attended`; missing `AttendanceRecord` alias. | 🔴 High |
| **Auth Router** | [backend/routers/auth.py](file:///c:/Users/pc/Desktop/reach/backend/routers/auth.py) | Token rotation and lockout solid; clean single-org bootstrap fallback. | 🟢 Good |
| **Attendance Router** | [backend/routers/attendance.py](file:///c:/Users/pc/Desktop/reach/backend/routers/attendance.py) | Invalid enum value on check-in; `.limit(1).delete()` crash in undo. | 🔴 High |
| **Call Logs Router** | [backend/routers/call_logs.py](file:///c:/Users/pc/Desktop/reach/backend/routers/call_logs.py) | Auto-escalation and timeline logic sound. Check constraint enforced. | 🟢 Good |
| **Contacts Router** | [backend/routers/contacts.py](file:///c:/Users/pc/Desktop/reach/backend/routers/contacts.py) | `sync_contacts` crashes on `c.local_id`; `bulk_paste` rollback bug. | 🔴 High |
| **Dashboard Router** | [backend/routers/dashboard.py](file:///c:/Users/pc/Desktop/reach/backend/routers/dashboard.py) | Postgres-only `ANY(:vol_ids)` crashes on SQLite test suite. | 🟡 Medium |
| **Decisions Router** | [backend/routers/decisions.py](file:///c:/Users/pc/Desktop/reach/backend/routers/decisions.py) | Clean CSV export and decision type constraints. Multi-select fanout supported. | 🟢 Good |
| **Invites Router** | [backend/routers/invites.py](file:///c:/Users/pc/Desktop/reach/backend/routers/invites.py) | Hardcoded `secure=True` cookie breaks local development testing. | 🟡 Medium |
| **Management Router** | [backend/routers/management.py](file:///c:/Users/pc/Desktop/reach/backend/routers/management.py) | Broken `AttendanceRecord` and `..services.email` imports. | 🔴 High |
| **Users Router** | [backend/routers/users.py](file:///c:/Users/pc/Desktop/reach/backend/routers/users.py) | `PATCH /me/profile` expects `Form(...)`, ignoring frontend JSON payloads. | 🔴 High |
| **API Client** | [frontend/src/lib/api.js](file:///c:/Users/pc/Desktop/reach/frontend/src/lib/api.js) | `updateProfile` sends JSON to Form endpoint; `addContactsBulk` sends raw array. | 🔴 High |
| **Offline Sync** | [frontend/src/lib/offline.js](file:///c:/Users/pc/Desktop/reach/frontend/src/lib/offline.js) | IndexedDB stores defined, but `queueSync()` never called during offline add. | 🔴 High |
| **Paste Parser** | [frontend/src/lib/pasteParse.js](file:///c:/Users/pc/Desktop/reach/frontend/src/lib/pasteParse.js) | Fast, pure regex normalization with full unit test coverage. Excellent. | 🟢 Excellent |
| **Add Contact** | [frontend/src/pages/volunteer/AddContact.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/volunteer/AddContact.jsx) | Fails on offline network instead of saving to IndexedDB sync queue. | 🟡 Medium |
| **Bulk Add** | [frontend/src/pages/volunteer/BulkAddContacts.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/volunteer/BulkAddContacts.jsx) | Submits raw array instead of `{ contacts: [...] }`, 422s on submit. | 🔴 High |
| **Contacts List** | [frontend/src/pages/volunteer/ContactsList.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/volunteer/ContactsList.jsx) | `c.phone` is undefined on list cards; Call and WhatsApp buttons fail. | 🔴 High |
| **Volunteer Home** | [frontend/src/pages/volunteer/VolunteerHome.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/volunteer/VolunteerHome.jsx) | Queries non-existent `needs_message` filter, skewing count badges. | 🟡 Medium |
| **Gate Attendance** | [frontend/src/pages/AttendLayout.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/AttendLayout.jsx) | Client-side search is fast, but check-in fails due to backend enum bug. | 🔴 High |
| **Decisions Layout** | [frontend/src/pages/DecisionsLayout.jsx](file:///c:/Users/pc/Desktop/reach/frontend/src/pages/DecisionsLayout.jsx) | Multi-select checkboxes work well; needs simplified Fast Track mode. | 🟢 Good |
| **Design System** | [frontend/src/styles/global.css](file:///c:/Users/pc/Desktop/reach/frontend/src/styles/global.css) | Conflicting duplicate `:root` declarations overwrite token scales. | 🟡 Medium |

---

## 6. Comprehensive Testing Plan & QA Blueprint

To prevent regressions, the following test matrix must be implemented across backend (Pytest) and frontend (Vitest + Playwright).

### A. Automated Backend Test Matrix (`pytest`)

```python
# backend/tests/test_critical_flows.py

def test_email_client_settings_attributes():
    """Ensure BREVO settings match Settings model without AttributeError."""
    from backend.config import settings
    assert hasattr(settings, "BREVO_API_KEY")
    assert hasattr(settings, "BREVO_SENDER")

def test_attendance_checkin_success(client, seed_org_campaign_user):
    """Ensure attendance check-in does not crash on missing enum."""
    ...

def test_attendance_undo_does_not_500(client, seed_org_campaign_user):
    """Ensure undo-check-in deletes latest record without Query.limit() error."""
    ...

def test_contacts_sync_batch_with_local_id(client, seed_org_campaign_user):
    """Ensure offline sync items with local_id deserialize and return status."""
    ...

def test_bulk_paste_savepoint_isolation(client, seed_org_campaign_user):
    """Ensure single duplicate in paste batch does not roll back prior valid rows."""
    ...
```

### B. Frontend Unit & Integration Tests (`vitest`)

1. **`api.test.js`**: Verify `api.updateProfile`, `api.addContactsBulk`, and `api.syncContacts` format their request bodies strictly according to backend Pydantic schemas.
2. **`offlineSync.test.js`**: Mock navigator offline/online events and ensure records queued in IndexedDB are dispatched and pruned upon successful sync.
3. **`contactsList.test.js`**: Verify that tapping "Call" or "WhatsApp" triggers a modal or loads the contact detail rather than dialing `undefined`.

### C. Manual End-to-End Verification Checklist

- [ ] **Auth Flow:** Login via SMS OTP and Email OTP. Test 7-day token refresh and proactive tab visibility renewal.
- [ ] **Volunteer Flow:** Add single contact -> Paste import 20 contacts -> Verify "Incomplete" filter banner -> Complete missing locations -> Log 3 call attempts with receptivity/availability -> Verify auto-escalation to soft follow-up queue after 2 no-answers.
- [ ] **Hub Leader Flow:** Approve volunteer -> Reject volunteer -> Filter contacts by volunteer -> Reassign contact to another volunteer -> Export bus logistics.
- [ ] **Attendance Gate Flow:** Search attendee by name -> Search by last 4 digits -> Check in -> Tap "Undo" within 10s window -> Register walk-in with duplicate phone number.
- [ ] **Decisions Flow:** Record decision with multi-select (Salvation + Holy Spirit) -> Export decisions CSV as minister -> Verify proper formatting and non-empty rows.

---

## 7. Prioritized Implementation Roadmap

### Phase 1: Crash Fixes & Data Integrity (Day 1)
1. Fix `settings.BREVO_API_KEY` / `BREVO_SENDER` in `backend/email_client.py`.
2. Fix `ContactStatusCode` / `Attendance` check-in and undo logic in `backend/routers/attendance.py`.
3. Fix `ContactCreate.local_id` and payload wrapper in `backend/routers/contacts.py` and `frontend/src/lib/api.js`.
4. Fix `PATCH /users/me/profile` to accept JSON payload in `backend/routers/users.py`.
5. Fix `Attendance` and email imports in `backend/routers/management.py`.
6. Fix savepoint rollback isolation in `bulk_paste_import`.

### Phase 2: Core UX Repair & Navigation (Days 2–3)
1. Fix contact card phone actions in `frontend/src/pages/volunteer/ContactsList.jsx`.
2. Wire real offline storage (`queueSync`) into `AddContact.jsx` when network fails.
3. Add proper sub-routes for Hub Leader views (`/hub/volunteers/:id`, `/hub/contacts/:id`).
4. Clean up duplicate `:root` token blocks in `frontend/src/styles/global.css`.
5. Correct `VolunteerHome.jsx` filter query from `needs_message` to standard supported parameters.

### Phase 3: Delight, Gamification & Speed (Days 4–5)
1. Implement the **Auto-Call Disposition Sheet** upon returning from phone calls.
2. Build the **Fast Track Altar Mode** for decision counsellors.
3. Add **Clustered Bus Pickup Views** for Hub Leaders.
4. Implement **Live Ticker Mode** on the Minister Dashboard for event days.
5. Add haptic feedback and micro-animations for confirmed invites and daily streaks.
