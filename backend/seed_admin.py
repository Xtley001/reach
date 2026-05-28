"""
REACH — Admin Seed Script
=========================
Creates three test accounts (minister, hub_leader, volunteer) so you can
log in as any role from a single Gmail inbox.

  minister   → EMAIL          (phone: PHONE)
  hub_leader → EMAIL+hub@...  (email login only)
  volunteer  → EMAIL+vol@...  (email login only)

All three OTPs land in your main Gmail inbox via + addressing.

USAGE
-----
  # Option A — env vars (recommended, set once in your shell or .env)
  export SEED_ADMIN_EMAIL=you@gmail.com
  export SEED_ADMIN_PHONE=+2349158523342
  python -m backend.seed_admin

  # Option B — flags
  python -m backend.seed_admin --email you@gmail.com --phone +2349158523342

NOTES
-----
  • Assumes migrations have already been applied (via Supabase SQL editor).
    This script does NOT run CREATE TABLE — use migrations/schema.sql for that.
  • Safe to re-run; skips anything that already exists.
  • Works over the Supabase session pooler URL (port 5432).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import argparse
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from backend.config import settings
from backend.models import User, UserRole, UserStatus, Organisation, Campaign, Hub, CampaignStatus

# ── Parse args ───────────────────────────────────────────────────────────────

p = argparse.ArgumentParser(description="Seed REACH admin accounts.")
p.add_argument("--email", default=os.environ.get("SEED_ADMIN_EMAIL"))
p.add_argument("--phone", default=os.environ.get("SEED_ADMIN_PHONE"))
p.add_argument("--org",   default=os.environ.get("SEED_ADMIN_ORG", "Ministry"),
               help="Organisation name (default: Ministry)")
args = p.parse_args()

if not args.email or not args.phone:
    p.error(
        "Provide --email and --phone, or set SEED_ADMIN_EMAIL / SEED_ADMIN_PHONE.\n"
        "  Example:\n"
        "    python -m backend.seed_admin --email you@gmail.com --phone +2349158523342"
    )

ADMIN_EMAIL = args.email
ADMIN_PHONE = args.phone
_parts      = ADMIN_EMAIL.split("@")
HL_EMAIL    = f"{_parts[0]}+hub@{_parts[1]}"
VOL_EMAIL   = f"{_parts[0]}+vol@{_parts[1]}"

# ── Engine with timeout disabled at connection level ─────────────────────────
# SET LOCAL requires an open transaction to stick; connect_args applies it
# before any query is sent, so Supabase's role-level timeout cannot override it.
_engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"options": "-c statement_timeout=0"},
)
_Session = sessionmaker(bind=_engine)

# ── Seed ─────────────────────────────────────────────────────────────────────

def seed():
    db = _Session()

    try:
        print("\n  REACH seed starting …\n")

        # ── Organisation ──────────────────────────────────────────────
        org = db.query(Organisation).filter(Organisation.name == args.org).first()
        if not org:
            slug = args.org.lower().replace(" ", "-")
            # Handle slug collision
            existing_slug = db.query(Organisation).filter(Organisation.slug == slug).first()
            if existing_slug:
                slug = f"{slug}-{existing_slug.id[:4]}"
            org = Organisation(name=args.org, slug=slug)
            db.add(org); db.commit(); db.refresh(org)
            print(f"  ✓  Created org:      {org.name}")
        else:
            print(f"  –  Org exists:      {org.name}")

        # ── Campaign ──────────────────────────────────────────────────
        # Hub requires a campaign_id (NOT NULL), so we need one first.
        campaign = (
            db.query(Campaign)
            .filter(Campaign.organisation_id == org.id)
            .first()
        )
        if not campaign:
            campaign = Campaign(
                organisation_id=org.id,
                name="Admin Campaign",
                status=CampaignStatus.active,
            )
            db.add(campaign); db.commit(); db.refresh(campaign)
            print(f"  ✓  Created campaign: {campaign.name}")
        else:
            print(f"  –  Campaign exists:  {campaign.name}")

        # ── Hub ───────────────────────────────────────────────────────
        hub = (
            db.query(Hub)
            .filter(Hub.organisation_id == org.id)
            .first()
        )
        if not hub:
            hub = Hub(
                organisation_id=org.id,
                campaign_id=campaign.id,
                name="Admin Hub",
                zone="Central",
            )
            db.add(hub); db.commit(); db.refresh(hub)
            print(f"  ✓  Created hub:      {hub.name}")
        else:
            print(f"  –  Hub exists:       {hub.name}")

        # ── User upsert helper ────────────────────────────────────────
        def upsert(role, email=None, phone=None, hub_id=None):
            q = db.query(User).filter(User.organisation_id == org.id)
            existing = (
                q.filter(User.email == email).first() if email
                else q.filter(User.phone == phone).first() if phone
                else None
            )
            if existing:
                existing.role   = role
                existing.status = UserStatus.active
                if hub_id:
                    existing.hub_id = hub_id
                db.commit()
                label = email or phone
                print(f"  –  Updated  [{role.value:<12}] {label}")
                return existing

            u = User(
                organisation_id=org.id,
                role=role,
                status=UserStatus.active,
                name="Admin",
                email=email,
                phone=phone,
                hub_id=hub_id,
            )
            db.add(u); db.commit(); db.refresh(u)
            label = email or phone
            print(f"  ✓  Created  [{role.value:<12}] {label}")
            return u

        # ── Create the three accounts ─────────────────────────────────
        upsert(UserRole.minister,   email=ADMIN_EMAIL, phone=ADMIN_PHONE)
        upsert(UserRole.hub_leader, email=HL_EMAIL,    hub_id=hub.id)
        upsert(UserRole.volunteer,  email=VOL_EMAIL,   hub_id=hub.id)

        # ── Summary ───────────────────────────────────────────────────
        print("""
  ────────────────────────────────────────────────
  LOGIN CREDENTIALS
  ────────────────────────────────────────────────""")
        print(f"  Minister   {ADMIN_EMAIL}")
        print(f"             phone: {ADMIN_PHONE}")
        print(f"             → /admin")
        print()
        print(f"  Hub Leader {HL_EMAIL}")
        print(f"             → /hub-login")
        print()
        print(f"  Volunteer  {VOL_EMAIL}")
        print(f"             → /login  (toggle to email)")
        print("""
  All OTPs land in your main Gmail inbox.
  ────────────────────────────────────────────────
""")

    except Exception as e:
        db.rollback()
        print(f"\n  ✗  Seed failed: {e}\n")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()