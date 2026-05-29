"""
REACH — Admin Seed Script
=========================
Creates three test accounts (minister, hub_leader, volunteer) so you can
log in as any role from a single Gmail inbox.

  minister   → EMAIL          (phone: PHONE)
  hub_leader → EMAIL+hub@...  (email or phone login)
  volunteer  → EMAIL+vol@...  (email or phone login)

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

IMPORTANT
---------
  For a full demo with 5 hubs, 20 volunteers, and 5000 contacts,
  run seed_demo.py instead. seed_admin.py is for quick single-account
  bootstrapping only. The default --org matches seed_demo.py so both
  scripts target the same organisation when used together.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import argparse
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, or_
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.models import (
    User, UserRole, UserStatus,
    Organisation, Campaign, Hub, CampaignStatus,
)

# ── Parse args ───────────────────────────────────────────────────────────────
p = argparse.ArgumentParser(description="Seed REACH admin accounts.")
p.add_argument("--email", default=os.environ.get("SEED_ADMIN_EMAIL"))
p.add_argument("--phone", default=os.environ.get("SEED_ADMIN_PHONE"))
p.add_argument("--org",   default=os.environ.get("SEED_ADMIN_ORG", "The Standing Church"),
               help="Organisation name (default: The Standing Church)")
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

# Predictable demo phone numbers for hub leader and volunteer
HL_PHONE    = "+2348011110001"
VOL_PHONE   = "+2348021110001"

# ── Engine ────────────────────────────────────────────────────────────────────
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
        print(f"\n  REACH seed starting — org: {args.org}\n")

        # ── Organisation ──────────────────────────────────────────────
        org = db.query(Organisation).filter(Organisation.name == args.org).first()
        if not org:
            # Safe slug with counter-based collision guard
            base_slug = args.org.lower().replace(" ", "-")
            slug      = base_slug
            counter   = 1
            while db.query(Organisation).filter(
                Organisation.slug == slug
            ).first():
                slug = f"{base_slug}-{counter}"
                counter += 1

            org = Organisation(name=args.org, slug=slug)
            db.add(org); db.commit(); db.refresh(org)
            print(f"  ✓  Created org:      {org.name}")
        else:
            print(f"  –  Org exists:      {org.name}")

        # ── Campaign ──────────────────────────────────────────────────
        campaign = (
            db.query(Campaign)
            .filter(Campaign.organisation_id == org.id)
            .first()
        )
        if not campaign:
            campaign = Campaign(
                organisation_id=org.id,
                name="Times of Refreshing 2026",
                status=CampaignStatus.active,
                programme_date=datetime.now(timezone.utc) + timedelta(days=14),
                venue="Teslim Balogun Stadium, Surulere",
                target_count=5000,
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
                name="Surulere Hub",
                zone="Lagos Island",
                location="Bode Thomas / Shitta axis, Surulere",
                description="Covers Surulere, Orile, Iganmu and Eric Moore.",
            )
            db.add(hub); db.commit(); db.refresh(hub)
            print(f"  ✓  Created hub:      {hub.name}")
        else:
            print(f"  –  Hub exists:       {hub.name}")

        # ── User upsert helper ────────────────────────────────────────
        def upsert(role, name, email=None, phone=None, hub_id=None,
                   is_reg=False, is_dec=False):
            q = db.query(User).filter(User.organisation_id == org.id)
            # Match existing user by email OR phone (if provided).
            existing = None
            if email and phone:
                existing = q.filter(or_(User.email == email, User.phone == phone)).first()
            elif email:
                existing = q.filter(User.email == email).first()
            elif phone:
                existing = q.filter(User.phone == phone).first()
            if existing:
                existing.role                = role
                existing.status              = UserStatus.active
                existing.name                = name
                existing.is_registration_team = is_reg
                existing.is_decisions_team   = is_dec
                if hub_id:
                    existing.hub_id = hub_id
                db.commit()
                label = email or phone
                print(f"  –  Updated  [{role.value:<17}] {label}")
                return existing

            u = User(
                organisation_id=org.id,
                role=role,
                status=UserStatus.active,
                name=name,
                email=email,
                phone=phone,
                hub_id=hub_id,
                is_registration_team=is_reg,
                is_decisions_team=is_dec,
            )
            db.add(u); db.commit(); db.refresh(u)
            label = email or phone
            print(f"  ✓  Created  [{role.value:<17}] {label}")
            return u

        # ── Three accounts ────────────────────────────────────────────
        upsert(
            UserRole.minister,
            name="Pastor Tara",
            email=ADMIN_EMAIL,
            phone=ADMIN_PHONE,
        )
        upsert(
            UserRole.hub_leader,
            name="Blessing Okafor",
            email=HL_EMAIL,
            phone=HL_PHONE,
            hub_id=hub.id,
            is_reg=True,
            is_dec=True,
        )
        upsert(
            UserRole.volunteer,
            name="Chukwuemeka Eze",
            email=VOL_EMAIL,
            phone=VOL_PHONE,
            hub_id=hub.id,
            is_reg=True,
        )

        # ── Summary ───────────────────────────────────────────────────
        print("""
  ────────────────────────────────────────────────────────
  LOGIN CREDENTIALS
  ────────────────────────────────────────────────────────""")
        print(f"  Minister    {ADMIN_EMAIL}")
        print(f"              phone: {ADMIN_PHONE}")
        print(f"              → /admin")
        print()
        print(f"  Hub Leader  {HL_EMAIL}")
        print(f"              phone: {HL_PHONE}")
        print(f"              → /hub-login  (email or phone tab)")
        print()
        print(f"  Volunteer   {VOL_EMAIL}")
        print(f"              phone: {VOL_PHONE}")
        print(f"              → /login  (email or phone tab)")
        print("""
  All OTPs land in your main Gmail inbox (email) or via SMS (phone).
  ────────────────────────────────────────────────────────
""")

    except Exception as e:
        db.rollback()
        print(f"\n  ✗  Seed failed: {e}\n")
        import traceback; traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()