# REACH — TODO (carry-over from church-release backlog)

Everything below is what's LEFT after working through `UPDATE.md` and
`UPDATE-02.md`. See `IMPLEMENTATION-STATUS.md` for the full item-by-item
scorecard of what's already done. This file is just the "still to do" list,
so it's easy to pick back up later without re-reading both backlog docs.

---

## ⛔ Blocked — need something from you before these can be finished

1. **D-51 — Account-lockout alerting.**
   Lockout logic + audit-log trail (`auth.account_locked`) are built and
   working. Still need: **which channel should alerts go to?**
   (Slack webhook / admin email via existing Brevo provider / SMS). Once
   decided, wiring it in is a small follow-up.

2. **E-59 / I-101 — Uptime monitoring.**
   `/health` endpoint exists and works. Needs a third-party account
   (UptimeRobot, Better Uptime, or similar) to actually register it and get
   alerted on downtime — can't create that account on your behalf.

3. **I-99 — Render paid tier.**
   `DEPLOY.md` documents the decision and reasoning (pay for Render's
   smallest always-on plan instead of free tier — removes the cold-start
   problem entirely). Actually upgrading is a billing action on your Render
   dashboard.

4. **Supabase Storage bucket creation.**
   `storage.py` and the avatar-migration script are ready and tested. Someone
   with Supabase dashboard access needs to:
   - Create a public bucket named `avatars` (Storage → New bucket)
   - Copy the `service_role` key (Settings → API) into `SUPABASE_SERVICE_ROLE_KEY`
   - Set `SUPABASE_URL` to the project's REST endpoint
   Steps are in `DEPLOY.md` under "Why Supabase Storage, not Cloudinary."
   Once set, run:
   ```bash
   cd backend
   python -m scripts.migrate_avatars_to_supabase --dry-run
   python -m scripts.migrate_avatars_to_supabase
   ```

5. **A-8 — Real logo.**
   The icon set (`frontend/public/icons/*.png`, `apple-touch-icon.png`) is a
   generated placeholder "R" mark on a dark background. Swap for the actual
   church/campaign logo before shipping. Regenerate maskable variants with
   proper safe-zone padding if the new logo isn't already square/centered.

---

## 🟡 Explicitly deferred — needs a product decision, not just engineering

6. **B-29 — Unify `Decision.decision_type` with `tag_definitions`.**
   Doc explicitly frames this as "consider" — there are currently two
   parallel outcome-type lists (`ContactStatusCode` legacy enum + new
   `contact_tags` + `Decision.decision_type`). Merging the last one in
   changes existing `Decision` semantics and decisions-team workflows.
   Needs a decision on whether decisions-team outcomes and volunteer tags
   should actually share one vocabulary, or stay separate on purpose.

7. **F-77 — Retire `message_sent` into its own axis.**
   Also explicitly "consider" in the doc. `message_sent` is really "did we
   text them" — a different axis from receptivity/availability entirely.
   Needs a decision on what that axis actually looks like (a boolean on
   Contact? Its own log table like call_logs? Folded into MessageSend,
   which already exists?) before it's worth building.

---

## ⚪ Not started — smaller scope, or needs real-world input this pass didn't have

8. **C-39 — Parse native "share contacts as text" export format.**
   Stretch parse target in the doc. The actual format varies by phone/OS
   (iOS vCard-ish text share vs Android's format vs WhatsApp's "share
   contact" text), and building a parser without real sample exports from
   an actual device risks silently mis-parsing real data. Get 2–3 real
   paste samples from different phones first, then extend
   `frontend/src/lib/pasteParse.js`.

9. **E-62 — Load-test the tag-toggle endpoint.**
   The concurrency-safety part IS done and tested (idempotent toggle +
   `UniqueConstraint` + `IntegrityError` handling, see
   `backend/tests/test_new_endpoints.py::TestContactTags`). What's NOT done
   is an actual load test against a real deployed instance — needs a
   staging Render environment to run against
   (e.g. `locust`/`k6` hitting the staging URL), which doesn't exist yet.
   Do this once staging is up, before the first real busy Sunday.

---

## Verification commands (re-run these after picking any of the above back up)

```bash
# Backend
cd backend
pip install -r requirements-dev.txt
DATABASE_URL="sqlite:///:memory:" OTP_PROVIDER=console JWT_SECRET=test python -m pytest tests/ -v

# Frontend
cd frontend
npm install
npm run test
npm run build
```

Both suites were passing clean (15 backend / 10 frontend tests) as of the
last commit in this package — if either breaks after future changes, that's
a real regression to fix before merging, not a pre-existing issue.
