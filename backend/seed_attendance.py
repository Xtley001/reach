"""
REACH — Attendance & Decisions Seed Script
============================================
Populates attendance records and decisions for The Standing Church event (Times of Refreshing 2026).

Creates realistic data linked to seed_demo.py data:
  • Pastor Akintara as the minister
  • Volunteers from The Standing Church hubs
  • 73% of seeded contacts as confirmed attendees
  • Additional walk-in attendees
  • ~60% of attendees have decision cards filled
  • Decision types: salvation, rededication, prayer, healing, holy_spirit
  • Various counsellors (hub leaders, pastor, registration team) handling decisions

USAGE
-----
  python -m backend.seed_attendance --email you@gmail.com --phone +2349158523342 [--count 300]

NOTES
-----
  • Must run AFTER seed_demo.py (needs contacts, campaign, volunteers)
  • Linked to "The Standing Church" organisation and "Times of Refreshing 2026" campaign
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
p.add_argument("--org",   default=os.environ.get("SEED_ADMIN_ORG", "The Standing Church"))
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
    ("salvation",      0.45),
    ("rededication",   0.25),
    ("prayer",         0.15),
    ("healing",        0.10),
    ("holy_spirit",    0.05),
]

ATTENDING_STATUS = ["yes", "no", "used_to"]  # Valid values for currently_attending


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
        print(f"  • 73% of outreach contacts as confirmed attendees")
        print(f"  • 27% of outreach contacts as walk-ins")
        print(f"  • {args.count} additional new walk-ins\n")

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
        print(f"  ✓  Volunteers available: {len(volunteers)}\n")

        # ── Get all contacts from outreach ──────────────────────────
        print(f"  Creating attendance records …\n")
        all_contacts = db.query(Contact).filter(
            Contact.campaign_id == campaign.id
        ).all()
        
        # Randomize contacts
        rng.shuffle(all_contacts)
        
        # Split: 73% confirmed, 27% walk-in
        split_point = int(len(all_contacts) * 0.73)
        confirmed_contacts = all_contacts[:split_point]
        walkin_contacts = all_contacts[split_point:]

        outreach_confirmed = 0
        for contact in confirmed_contacts:
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
                checked_in_at=datetime.now(timezone.utc) - timedelta(
                    hours=rng.randint(0, 5),
                    minutes=rng.randint(0, 59)
                ),
                is_walk_in=False,
                source=rng.choice(["gate_search", "paper_form"]),
                how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                notes="Confirmed attendee from outreach" if rng.random() > 0.6 else None,
            )
            db.add(attendance)
            outreach_confirmed += 1

        db.commit()
        print(f"  ✓  {outreach_confirmed} confirmed outreach attendees")

        # ── Attendance: 27% from contacts as walk-ins ────────────────
        outreach_walkin = 0
        for contact in walkin_contacts:
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
                checked_in_at=datetime.now(timezone.utc) - timedelta(
                    hours=rng.randint(1, 6),
                    minutes=rng.randint(0, 59)
                ),
                is_walk_in=True,
                source="walk-in",
                how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                notes=None,
            )
            db.add(attendance)
            outreach_walkin += 1

        db.commit()
        print(f"  ✓  {outreach_walkin} outreach contacts as walk-ins")

        # ── Attendance: Additional new walk-ins ──────────────────────
        new_walkin = 0
        for i in range(args.count):
            attendance = Attendance(
                campaign_id=campaign.id,
                organisation_id=org.id,
                contact_id=None,  # completely new people
                checked_in_by=rng.choice(volunteers).id,
                checked_in_at=datetime.now(timezone.utc) - timedelta(
                    hours=rng.randint(1, 6),
                    minutes=rng.randint(0, 59)
                ),
                is_walk_in=True,
                source="walk-in",
                how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                notes=None,
            )
            db.add(attendance)
            new_walkin += 1
            if new_walkin % 100 == 0:
                db.commit()
                print(f"  –  {new_walkin}/{args.count} new walk-ins …")

        db.commit()
        print(f"  ✓  {new_walkin} new walk-in attendees")

        total_attendees = outreach_confirmed + outreach_walkin + new_walkin
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
                first_time=(decision_type == "salvation"),
                currently_attending=rng.choice(ATTENDING_STATUS),
                current_church=rng.choice(CHURCH_NAMES) if rng.random() > 0.4 else None,
                wants_church_referral=False,
                referral_area=None,

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
  ATTENDANCE & DECISIONS SEEDED ✓
  ════════════════════════════════════════════════════════

  Attendance Breakdown:
    • Confirmed outreach:   {outreach_confirmed} (73%)
    • Walk-in from contacts:{outreach_walkin} (27%)
    • New walk-ins:         {new_walkin}
    ────────────────────────────────
    • TOTAL:                {total_attendees}

  Decisions:
    • Cards filled:         {decision_count}
    • Conversion rate:      {int(100 * decision_count / total_attendees)}%

  Decision Breakdown:
    • Accepted Jesus:       ~{int(decision_count * 0.45)}
    • Rededication:         ~{int(decision_count * 0.25)}
    • Church Referral:      ~{int(decision_count * 0.20)}
    • Information Only:     ~{int(decision_count * 0.10)}

  Your dashboard is now fully populated for testing! 🎉
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
