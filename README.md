# REACH

**Ministry Outreach Platform** — log contacts in 30 seconds, follow up on every one before the programme.

---

## What it does

REACH is a mobile-first web app for ministry outreach teams. Volunteers log contacts at events, hub leaders coordinate follow-up, and ministers track programme-wide progress in real time.

**Roles**
- **Volunteer** — logs contacts, tracks their call queue
- **Hub Leader** — approves volunteers, manages their hub's contacts
- **Minister** — full dashboard, campaign management, exports
- **Registration Team** — gate check-in at the programme
- **Decisions Team** — records decisions at the event

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, React Router 6, Vite |
| Backend | FastAPI, SQLAlchemy, Pydantic v2 |
| Database | PostgreSQL (Supabase) |
| Auth | OTP (email via Brevo, SMS via Brevo) + JWT + httpOnly refresh tokens |
| Avatars | Cloudinary (free tier: 25 GB storage) |
| Deploy | Frontend → Vercel · Backend → Render |

---

## Local Development

**Prerequisites:** Python 3.11+, Node 18+

```bash
# Backend
cd backend
cp .env.example .env          # fill in values
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

**First run — seed the database:**
```bash
# Run schema in Supabase SQL Editor (migrations/schema.sql)
# Then seed the first admin:
python backend/seed_admin.py
```

See `docs/SEED.md` for full seeding guide including demo data.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✓ | Supabase postgres connection string |
| `JWT_SECRET` | ✓ | 64-byte hex (`openssl rand -hex 64`) |
| `JWT_SECRET_V1` | | Retired key for rotation |
| `OTP_PROVIDER` | ✓ | `brevo` (production) or `console` (dev) |
| `BREVO_API_KEY` | ✓ | Brevo transactional API key |
| `BREVO_SENDER` | ✓ | Verified sender email in Brevo |
| `ADMIN_BACKUP_EMAIL` | | CC address for OTP debug |
| `ADMIN_OTP_CC_ENABLED` | | `false` (default) — set `true` for staging only |
| `CLOUDINARY_CLOUD_NAME` | ✓ | Avatar uploads |
| `CLOUDINARY_API_KEY` | ✓ | |
| `CLOUDINARY_API_SECRET` | ✓ | |
| `ENVIRONMENT` | ✓ | `development` or `production` |
| `ALLOWED_ORIGINS` | ✓ | Comma-separated frontend URLs |

### Frontend (`frontend/.env`)

```
VITE_API_BASE=http://localhost:8000/api
```

---

## Auth Flows

**New Volunteer** → `/signup`
```
Name + photo (optional) → Contact → Hub selection → OTP → /pending
```
Avatar is uploaded immediately after account creation. Hub leader sees the photo when approving.

**Returning Volunteer** → `/login`
```
Contact → OTP → /vol/home
```

**Hub Leader** → `/hub-login` (known URL)

**Minister** → `/admin` (known URL, not linked publicly)

---

## Key Design Decisions

- **OTP-only auth** — no passwords, no sessions to manage. Tokens rotate on every use.
- **Atomic signup** — name, hub, and OTP verified in one step. No ghost users.
- **Pending approval** — volunteers can't act until a hub leader approves them. Prevents abuse.
- **Hub leader avatar** — shown during volunteer hub selection so volunteers pick the right person.
- **Volunteer avatar** — uploaded at signup so hub leaders can visually identify approval requests.

---

## Project Structure

```
reach/
├── backend/
│   ├── routers/          # auth, users, contacts, invites, management …
│   ├── models.py         # SQLAlchemy models
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── auth.py           # OTP, JWT, token helpers
│   ├── config.py         # Settings (pydantic-settings)
│   ├── storage.py        # Cloudinary avatar upload
│   ├── seed_admin.py     # Seeds first minister account
│   └── seed_demo.py      # Seeds demo data for staging
├── frontend/
│   └── src/
│       ├── pages/        # Route-level components
│       │   ├── LoginPage.jsx      # Returning users
│       │   ├── SignupPage.jsx     # New volunteer registration
│       │   ├── HubLoginPage.jsx   # Hub leader auth
│       │   ├── AdminLoginPage.jsx # Minister auth
│       │   └── …
│       ├── components/   # Shared UI (UI.jsx, AvatarLightbox, OTPInput …)
│       ├── hooks/        # useAuth, useTheme, useOfflineSync
│       ├── lib/          # api.js, toast, cache, offline, labels
│       └── styles/       # global.css, responsive.css
├── migrations/
│   └── schema.sql        # Full DB schema — idempotent, run to reset
├── docs/
│   ├── ARCHITECTURE.md   # System design decisions
│   ├── CHANGELOG.md      # Audit findings and fixes applied
│   ├── DEPLOYMENT.md     # Full deploy guide (Render + Vercel + Supabase)
│   └── SEED.md           # Database seeding guide
├── scripts/
│   └── ops/backup.sh     # Daily DB backup (Render cron)
└── alembic/              # DB migration tooling
```

---

## Deployment

See `docs/DEPLOYMENT.md` for the full step-by-step guide covering Supabase, Render, Vercel, Brevo, and Cloudinary setup.

**Quick reference:**
- Backend (Render): `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Frontend (Vercel): root = `frontend/`, build = `npm run build`, output = `dist`

---

## Database

Schema lives in `migrations/schema.sql` — idempotent, safe to re-run.

To reset completely: run the drop script in `docs/DEPLOYMENT.md §Database Reset`, then re-run `schema.sql`, then `python backend/seed_admin.py`.

---

## License

Private — ministry use only.
