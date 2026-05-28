# ─── REACH — Makefile ────────────────────────────────────────────────────────
# Requires: DATABASE_URL set in your shell (or a .env file exported)
#
#   export DATABASE_URL="postgresql://postgres.xxx:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
#   export SEED_ADMIN_EMAIL=you@gmail.com
#   export SEED_ADMIN_PHONE=+2341234567890
#
# Then just: make seed  (or make db  on a fresh database)
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help db migrate seed ping clean-otps

help:
	@echo ""
	@echo "  REACH database commands"
	@echo ""
	@echo "  make db          — Apply full schema to a fresh Supabase database"
	@echo "  make migrate     — Apply incremental migration (indexes + fixes)"
	@echo "  make seed        — Create admin test accounts (set SEED_ADMIN_EMAIL + SEED_ADMIN_PHONE)"
	@echo "  make ping        — Check the database connection"
	@echo "  make clean-otps  — Delete expired OTP sessions and revoked refresh tokens"
	@echo ""
	@echo "  Required env vars:"
	@echo "    DATABASE_URL        — Supabase pooler connection string"
	@echo "    SEED_ADMIN_EMAIL    — Your Gmail address"
	@echo "    SEED_ADMIN_PHONE    — Your phone in E.164 format (+234...)"
	@echo ""

# Apply the full schema (run once on a fresh database)
db:
	@echo "→ Applying full schema …"
	psql "$(DATABASE_URL)" -f migrations/schema.sql
	@echo "✓ Schema applied."

# Apply incremental migration only
migrate:
	@echo "→ Applying incremental migration …"
	psql "$(DATABASE_URL)" -f migrations/indexes_and_fixes.sql
	@echo "✓ Migration applied."

# Seed admin accounts
seed:
	@test -n "$(SEED_ADMIN_EMAIL)" || (echo "✗  Set SEED_ADMIN_EMAIL first" && exit 1)
	@test -n "$(SEED_ADMIN_PHONE)" || (echo "✗  Set SEED_ADMIN_PHONE first" && exit 1)
	python -m backend.seed_admin

# Quick connection test
ping:
	@echo "→ Pinging database …"
	psql "$(DATABASE_URL)" -c "SELECT version();" -t | head -1
	@echo "✓ Connected."

# Clean up expired sessions (safe to run any time)
clean-otps:
	@echo "→ Cleaning expired OTP sessions and revoked refresh tokens …"
	psql "$(DATABASE_URL)" -c "DELETE FROM otp_sessions WHERE expires_at < now() - INTERVAL '24 hours';"
	psql "$(DATABASE_URL)" -c "DELETE FROM refresh_tokens WHERE revoked = TRUE AND expires_at < now() - INTERVAL '7 days';"
	@echo "✓ Done."

seed:
	python -m backend.seed_demo --email $(SEED_EMAIL) --phone $(SEED_PHONE) --count 5000
	psql $(DATABASE_URL) -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_demographics;"
	python -m backend.seed_attendance --email $(SEED_EMAIL) --phone $(SEED_PHONE) --count 500
	@echo "✓ Seed complete."
