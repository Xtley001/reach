# REACH — Architecture

## System overview

```
Clients (browser / mobile)
        │ HTTPS
        ▼
Vercel — React + Vite (CDN)          /vol/* /hub/* /admin-panel/* /attend /decisions
        │ HTTPS cross-origin
        ▼
Render — FastAPI Python 3.11         /auth/* /contacts/* /hub/* /attendance/* /decisions/*
        │                   │
        ▼                   ▼
Supabase PostgreSQL     Upstash Redis
```

## Authentication

OTP login (SMS or email via Brevo) → JWT access token (60 min) + rotating refresh token cookie (30 days, `httponly`, `secure`, `samesite=none`).

Invite claim uses a separate flow: minister creates a signed one-time token, recipient claims it with OTP verification, account is created and tokens issued in one step.

## Enum serialisation fix

All Python enums inherit `(str, enum.Enum)` so `.value` serialises as `"coming"` not `"ContactStatusCode.coming"`. The frontend `lib/labels.js` also handles the prefixed form as a fallback.

## Data access control

Enforced at query level — not just frontend filtering.

| Role | Contacts visible | Users visible |
|---|---|---|
| Volunteer | Own contacts (`added_by = user.id`) | None |
| Hub Leader | Hub's contacts | Hub's volunteers |
| Minister | Entire organisation | Entire organisation |
| Registration Team | Campaign contacts (read-only) | None |
| Decisions Team | None (decisions table only) | None |

## Performance

Client-side SWR cache (`lib/cache.js`) serves stale data immediately and refreshes in background. All API calls use `cached(key, fn, ttl)`. Optimistic UI for status changes, logistics, and attendance check-ins.

HTTP `Cache-Control` headers from backend middleware: 5 min for hub list, 60s for demographics, 15s for dashboards.

All list endpoints use `joinedload` — no N+1 queries.

Render cold starts mitigated by UptimeRobot pinging `/health` every 10 minutes.

## Offline

Gate search contacts are cached locally (IndexedDB) when attendance mode opens. Search is client-side — 50ms regardless of network. All writes go to IndexedDB first, sync queue drains when connection returns. Conflict: last-write-by-timestamp wins.
