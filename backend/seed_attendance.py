"""
REACH — Attendance & Decisions Seed Script
============================================
Populates attendance records and decisions for event testing.

Creates realistic data:
  • 73 contacts from outreach who attended
  • 300+ walk-in attendees
  • ~60% of attendees have decision cards filled
  • Decision types: accepted_jesus, rededication, referral, info_only
  • Various counsellors and volunteers handling decisions

USAGE
-----
  python -m backend.seed_attendance --email you@gmail.com --phone +2349158523342 [--count 300]

NOTES
-----
  • Must run AFTER seed_demo.py (needs contacts, campaign, volunteers)
  • Deterministic random seed for reproducibility
  • Safe to re-run; updates existing attendance records
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import argparse
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.models import (
    Organisation, Campaign, Contact, User, Attendance, Decision,
    UserRole, UserStatus,
)

# ── Args ──────────────────────────────────────────────────────────────────────
p = argparse.ArgumentParser(description="Seed attendance & decisions.")
p.add_argument("--email", default=os.environ.get("SEED_ADMIN_EMAIL"))
p.add_argument("--phone", default=os.environ.get("SEED_ADMIN_PHONE"))
p.add_argument("--org",   default=os.environ.get("SEED_ADMIN_ORG", "Living Faith Outreach"))
p.add_argument("--count", type=int, default=300, help="Number of walk-in attendees (default 300)")
args = p.parse_args()

if not args.email or not args.phone:
    p.error("Provide --email and --phone (or set SEED_ADMIN_EMAIL / SEED_ADMIN_PHONE)")

engine  = create_engine(settings.DATABASE_URL, pool_pre_ping=True,
                        connect_args={"options": "-c statement_timeout=0"})
Session = sessionmaker(bind=engine)
rng     = random.Random(42)

# ── Name pools for walk-ins ───────────────────────────────────────────────────
FIRST_NAMES = [
    "Adebisi","Ngozi","Emeka","Fatima","Chinyere","Bode","Aisha","Tunde",
    "Amaka","Segun","Blessing","Kelechi","Hauwa","Sunday","Chioma","Remi",
    "Patience","Yetunde","Taiwo","Kehinde","Nkechi","Funke","Chukwudi",
    "Abosede","Adaeze","Mustapha","Oluwakemi","Ebele","Ifeoma","Damilola",
    "Onyeka","Toyin","Chinonso","Bolanle","Hassan","Ugo","Sade","Chika",
    "Aminu","Tope","Adunola","Ikenna","Precious","Gbenga","Chiamaka",
]

LAST_NAMES = [
    "Olatunde","Anyanwu","Dike","Musa","Okafor","Akintola","Usman",
    "Eze","Adeyemi","Nwosu","Chukwu","Ibrahim","Okonkwo","Uchenna",
    "Adesanya","Egwu","Obi","Badmus","Olawale","Igwe","Lawal","Adegoke",
    "Nwofor","Fadahunsi","Okeke","Bakare","Akin","Onwudiwe","Nzekwe",
    "Ajayi","Oduya","Bello","Abdullahi","Oyelaran","Obiechina","Garba",
]

HOW_DID_YOU_HEAR = [
    "Invitation from a friend",
    "Saw the flyer",
    "Word of mouth",
    "Social media",
    "Family member",
    "Church announcement",
    "Passed by and noticed",
    "Radio advert",
]

CHURCH_NAMES = [
    "Redeemed Christian Church of God (RCCG)",
    "Foursquare Gospel Church",
    "Assemblies of God",
    "Deeper Life Bible Church",
    "CAC (Apostolic Church)",
    "Living Faith Outreach",
    "Mountain of Fire and Miracles Ministry",
    "Winners Chapel",
    "Christ Embassy",
    "Royal House Chapel",
]

AGE_RANGES = ["18-25", "26-35", "36-45", "46-55", "56-65", "66+"]
GENDERS = ["male", "female"]
OCCUPATIONS = [
    "Student","Trader","Nurse","Teacher","Engineer","House wife",
    "Mechanic","Driver","Accountant","Businesswoman","Retailer",
    "Artisan","Welder","Electrician","Cleaner","Security","Unemployed",
]

DECISION_TYPES = [
    ("accepted_jesus", 0.45),
    ("rededication",   0.25),
    ("referral",       0.20),
    ("info_only",      0.10),
]

SOURCE_TYPES = ["gate_search", "walk-in", "paper_form"]


def gen_phone(i):
    """Deterministic Nigerian E.164 phone."""
    prefixes = ["801","802","803","805","806","808","810","813","814","901","903","907"]
    px = prefixes[i % len(prefixes)]
    suffix = str((i * 7919 + 1000000) % 10000000).zfill(7)
    return f"+234{px}{suffix}"


# ── Main ──────────────────────────────────────────────────────────────────────

def seed():
    db = Session()
    try:
        print(f"\n  REACH attendance & decisions seed\n")
        print(f"  Target: 73 outreach contacts + {args.count} walk-ins\n")

        # ── Fetch key entities ────────────────────────────────────────
        org = db.query(Organisation).filter(
            Organisation.name == args.org
        ).first()
        if not org:
            print(f"  ✗  Org '{args.org}' not found. Run seed_demo.py first.\n")
            return

        campaign = db.query(Campaign).filter(
            Campaign.organisation_id == org.id
        ).first()
        if not campaign:
            print(f"  ✗  Campaign not found. Run seed_demo.py first.\n")
            return

        # ── Get volunteers who will check people in ──────────────────
        volunteers = db.query(User).filter(
            User.organisation_id == org.id,
            User.role == UserRole.volunteer
        ).all()
        if not volunteers:
            print(f"  ✗  No volunteers found. Run seed_demo.py first.\n")
            return

        print(f"  ✓  Campaign: {campaign.name}")
        print(f"  ✓  Volunteers available: {len(volunteers)}")

        # ── Attendance: 73 from outreach ──────────────────────────────
        print(f"\n  Creating attendance records …\n")

        contacts = db.query(Contact).filter(
            Contact.campaign_id == campaign.id
        ).limit(73).all()

        outreach_count = 0
        for contact in contacts:
            existing = db.query(Attendance).filter(
                Attendance.contact_id == contact.id
            ).first()
            if existing:
                continue

            attendance = Attendance(
                campaign_id=campaign.id,
                organisation_id=org.id,
                contact_id=contact.id,
                checked_in_by=rng.choice(volunteers).id,
                checked_in_at=datetime.now(timezone.utc) - timedelta(hours=rng.randint(0, 4)),
                is_walk_in=False,
                source=rng.choice(SOURCE_TYPES[:2]),  # gate_search or paper_form
                how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                notes="Confirmed attendee from outreach" if rng.random() > 0.6 else None,
            )
            db.add(attendance)
            outreach_count += 1

        db.commit()
        print(f"  ✓  {outreach_count} outreach attendees recorded")

        # ── Attendance: Walk-ins (generative) ─────────────────────────
        walkin_count = 0
        for i in range(args.count):
            attendance = Attendance(
                campaign_id=campaign.id,
                organisation_id=org.id,
                contact_id=None,  # walk-ins don't have pre-contacts
                checked_in_by=rng.choice(volunteers).id,
                checked_in_at=datetime.now(timezone.utc) - timedelta(
                    hours=rng.randint(1, 6),
                    minutes=rng.randint(0, 59)
                ),
                is_walk_in=True,
                source="walk-in",
                how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                notes="Walk-in attendee" if rng.random() > 0.8 else None,
            )
            db.add(attendance)
            walkin_count += 1
            if walkin_count % 100 == 0:
                db.commit()
                print(f"  –  {walkin_count}/{args.count} walk-ins …")

        db.commit()
        print(f"  ✓  {walkin_count} walk-in attendees recorded")

        total_attendees = outreach_count + walkin_count
        print(f"\n  ✓  Total attendees: {total_attendees}")

        # ── Decisions: ~60% of all attendees ──────────────────────────
        print(f"\n  Creating decision cards …\n")

        # Get all attendees
        attendees = db.query(Attendance).filter(
            Attendance.campaign_id == campaign.id
        ).all()

        # Counsellors = hub leaders + minister + registration team
        counsellors = db.query(User).filter(
            User.organisation_id == org.id,
            User.role.in_([UserRole.hub_leader, UserRole.minister, UserRole.registration_team])
        ).all()

        if not counsellors:
            print(f"  ✗  No counsellors found. Using volunteers.\n")
            counsellors = volunteers

        decision_count = 0
        for idx, att in enumerate(attendees):
            # ~60% probability of having a decision
            if rng.random() > 0.60:
                continue

            # Determine decision type
            decision_type = rng.choices(
                [d[0] for d in DECISION_TYPES],
                weights=[d[1] for d in DECISION_TYPES],
            )[0]

            # Generate name + phone for decision
            if att.contact_id:
                contact = db.query(Contact).filter(Contact.id == att.contact_id).first()
                name = contact.name
                phone_1 = contact.phone or gen_phone(idx)
            else:
                # Walk-in: generate a new name
                name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
                phone_1 = gen_phone(idx)

            decision = Decision(
                campaign_id=campaign.id,
                organisation_id=org.id,
                contact_id=att.contact_id,
                counsellor_id=rng.choice(counsellors).id,
                source="real_time",

                # Identity
                name=name,
                phone_1=phone_1,
                phone_2=gen_phone(idx + 10000) if rng.random() > 0.7 else None,
                whatsapp_number=phone_1 if rng.random() > 0.4 else None,
                email=None if rng.random() > 0.3 else f"{name.lower().replace(' ', '')}@gmail.com",
                area=rng.choice(["Surulere", "Ikeja", "Lekki", "Oshodi", "Festac", "Mainland"]),
                nearest_landmark=rng.choice([
                    "Bus Stop", "Market", "Church", "School",
                    "Community Center", "Hospital", "Police Station"
                ]),

                # Decision
                decision_type=decision_type,
                decision_type_other=None,
                first_time=(decision_type == "accepted_jesus"),
                currently_attending=rng.choice(["yes", "no", "sometimes"]),
                current_church=rng.choice(CHURCH_NAMES) if rng.random() > 0.4 else None,
                wants_church_referral=(decision_type == "referral"),
                referral_area=rng.choice(["Surulere", "Ikeja", "Lekki"]) if decision_type == "referral" else None,

                # Background
                age_range=rng.choice(AGE_RANGES),
                gender=rng.choice(GENDERS),
                occupation=rng.choice(OCCUPATIONS),
                how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                brought_by=None,
                notes=None if rng.random() > 0.5 else f"{decision_type.replace('_', ' ').title()} decision",
            )
            db.add(decision)
            decision_count += 1
            if decision_count % 50 == 0:
                db.commit()
                print(f"  –  {decision_count} decisions …")

        db.commit()
        print(f"  ✓  {decision_count} decision cards recorded")

        # ── Summary ───────────────────────────────────────────────────
        print(f"""
  ════════════════════════════════════════════════════════
  ATTENDANCE & DECISIONS SEEDED
  ════════════════════════════════════════════════════════

  Attendance:
    • Outreach contacts:    {outreach_count}
    • Walk-in attendees:    {walkin_count}
    • Total:                {total_attendees}

  Decisions:
    • Cards filled:         {decision_count}
    • Conversion rate:      {int(100 * decision_count / total_attendees)}%

  Breakdown by type:
    • Accepted Jesus:       ~{int(decision_count * 0.45)}
    • Rededication:         ~{int(decision_count * 0.25)}
    • Church Referral:      ~{int(decision_count * 0.20)}
    • Information Only:     ~{int(decision_count * 0.10)}

  Your dashboard is now fully populated.
  ════════════════════════════════════════════════════════
""")

    except Exception as e:
        db.rollback()
        print(f"\n  ✗  Seed failed: {e}\n")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
