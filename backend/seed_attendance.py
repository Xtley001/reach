"""
REACH — Attendance & Decisions Seed Script
============================================
Populates attendance records and decisions for The Standing Church
event (Times of Refreshing 2026).

Creates realistic data linked to seed_demo.py data:
  • Pastor Tara as the minister
  • Volunteers from The Standing Church hubs
  • 73% of seeded contacts as confirmed attendees
  • 27% of outreach contacts as walk-ins
  • Additional new walk-in attendees
  • ~60% of attendees have decision cards filled
  • Decision types: salvation, rededication, prayer, healing, holy_spirit
  • ~22% of decisions request a church referral
  • Various counsellors (hub leaders, pastor) handling decisions

USAGE
-----
  python -m backend.seed_attendance --email you@gmail.com --phone +2349158523342 [--count 2000]

NOTES
-----
  • Must run AFTER seed_demo.py (needs contacts, campaign, volunteers)
  • Linked to "The Standing Church" organisation and "Times of Refreshing 2026" campaign
  • Deterministic random seed for reproducibility
  • Safe to re-run; skips existing attendance records
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import argparse
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.models import (
    Organisation, Campaign, Contact, User, Hub,
    Attendance, Decision,
    UserRole, UserStatus, ContactStatus, ContactStatusCode,
)

# ── Args ──────────────────────────────────────────────────────────────────────
p = argparse.ArgumentParser(description="Seed attendance & decisions.")
p.add_argument("--email", default=os.environ.get("SEED_ADMIN_EMAIL"))
p.add_argument("--phone", default=os.environ.get("SEED_ADMIN_PHONE"))
p.add_argument("--org",   default=os.environ.get("SEED_ADMIN_ORG", "The Standing Church"))
p.add_argument("--count", type=int, default=2000,
               help="Number of brand-new walk-in attendees (default 2000)")
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

AGE_RANGES  = ["18-25", "26-35", "36-45", "46-55", "56-65", "66+"]
GENDERS     = ["male", "female"]
OCCUPATIONS = [
    "Student","Trader","Nurse","Teacher","Engineer","House wife",
    "Mechanic","Driver","Accountant","Businesswoman","Retailer",
    "Artisan","Welder","Electrician","Cleaner","Security","Unemployed",
]

DECISION_TYPES = [
    ("salvation",    0.45),
    ("rededication", 0.25),
    ("prayer",       0.15),
    ("healing",      0.10),
    ("holy_spirit",  0.05),
]

ATTENDING_STATUS = ["yes", "no", "used_to"]

# Hub-aware areas for decision cards
HUB_AREAS = {
    "Surulere Hub":  ["Surulere", "Orile", "Iganmu", "Eric Moore", "Aguda"],
    "Ikeja Hub":     ["Ikeja", "Ogba", "Agidingbi", "Omole", "Berger", "Ojodu"],
    "Lekki Hub":     ["Lekki Phase 1", "Lekki Phase 2", "Ajah", "Sangotedo", "Chevron"],
    "Oshodi Hub":    ["Oshodi", "Mushin", "Isolo", "Mafoluku", "Ejigbo"],
    "Festac Hub":    ["Festac", "Amuwo-Odofin", "Mile 2", "Satellite Town", "Orile"],
}
ALL_AREAS = [a for areas in HUB_AREAS.values() for a in areas]

REFERRAL_AREAS = [
    "Surulere", "Ikeja", "Lekki", "Oshodi", "Festac",
    "Yaba", "Gbagada", "Ketu", "Ikorodu", "Agege",
]

DECISION_NOTES = [
    "Very open to follow-up visit",
    "Cried during altar call — genuine moment",
    "Has been away from church for 5 years",
    "Wants to join a small group",
    "Brought two friends who also responded",
    "First time at a crusade",
    "Elderly woman — asked for home visit",
    "Young man, said he was running from God",
    "Requested Bible",
    "Asked about baptism",
    None, None, None,
]

BROUGHT_BY_POOL = [
    "A friend from church",
    "My sister",
    "My neighbour",
    "A colleague at work",
    "Someone from the bus",
    None, None, None, None,
]

WALKIN_NOTES = [
    "Came with a group of 3",
    "Found at the main gate",
    "Referred by a friend already inside",
    "Came back after leaving earlier",
    "Picked up flyer outside",
    None, None, None,
]

LANDMARKS = [
    "Bus Stop", "Market", "Church", "School",
    "Community Center", "Hospital", "Police Station", "Filling Station",
]


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
        print(f"\n  REACH attendance & decisions seed — org: {args.org}\n")

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

        volunteers = db.query(User).filter(
            User.organisation_id == org.id,
            User.role == UserRole.volunteer,
        ).all()
        if not volunteers:
            print(f"  ✗  No volunteers found. Run seed_demo.py first.\n")
            return

        print(f"  ✓  Campaign:   {campaign.name}")
        print(f"  ✓  Volunteers: {len(volunteers)}")

        # ── Build hub → volunteer map for correct check-in attribution ─
        hub_volunteers: dict = {}
        for v in volunteers:
            hub_volunteers.setdefault(v.hub_id, []).append(v)

        def checkin_vol(contact):
            """Return a volunteer from the same hub as the contact's adder."""
            if contact:
                adder = db.query(User).filter(User.id == contact.added_by).first()
                if adder and adder.hub_id in hub_volunteers:
                    return rng.choice(hub_volunteers[adder.hub_id])
            return rng.choice(volunteers)

        # ── Derive realistic event-day check-in window ────────────────
        # Event day: programme_date from the campaign (14 days out from seed)
        event_day = campaign.programme_date or (
            datetime.now(timezone.utc) + timedelta(days=14)
        )
        event_start = event_day.replace(hour=15, minute=0, second=0, microsecond=0)

        def checkin_time():
            """Random time within the 5-hour event window (3 pm – 8 pm)."""
            return event_start + timedelta(minutes=rng.randint(0, 300))

        # ── Counsellors for decisions ─────────────────────────────────
        counsellors = db.query(User).filter(
            User.organisation_id == org.id,
            User.role.in_([UserRole.hub_leader, UserRole.minister]),
        ).all()
        if not counsellors:
            counsellors = volunteers

        # ── Fetch contact IDs only (avoid loading 5000 full objects) ─────
        print(f"\n  Creating attendance records …\n")
        BATCH = 200

        contact_ids = [
            row[0] for row in
            db.query(Contact.id).filter(
                Contact.campaign_id == campaign.id
            ).all()
        ]
        rng.shuffle(contact_ids)

        split_point        = int(len(contact_ids) * 0.73)
        confirmed_ids      = contact_ids[:split_point]
        walkin_ids         = contact_ids[split_point:]

        # ── 73 %: confirmed outreach attendees ───────────────────────
        outreach_confirmed = 0
        for batch_start in range(0, len(confirmed_ids), BATCH):
            batch_ids = confirmed_ids[batch_start:batch_start + BATCH]
            contacts  = db.query(Contact).filter(Contact.id.in_(batch_ids)).all()
            for contact in contacts:
                existing = db.query(Attendance).filter(
                    Attendance.contact_id == contact.id
                ).first()
                if existing:
                    continue

                attend_time = checkin_time()
                db.add(Attendance(
                    campaign_id=campaign.id,
                    organisation_id=org.id,
                    contact_id=contact.id,
                    checked_in_by=checkin_vol(contact).id,
                    checked_in_at=attend_time,
                    is_walk_in=False,
                    source=rng.choice(["gate_search", "paper_form"]),
                    how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                    notes="Confirmed attendee from outreach" if rng.random() > 0.6 else None,
                ))
                contact.attended    = True
                contact.attended_at = attend_time
                db.add(ContactStatus(
                    contact_id=contact.id,
                    status_code=ContactStatusCode.coming,
                    updated_by=checkin_vol(contact).id,
                    updated_at=attend_time,
                ))
                outreach_confirmed += 1

            db.commit()
            print(f"  –  confirmed {outreach_confirmed} / {len(confirmed_ids)} …")

        print(f"  ✓  {outreach_confirmed} confirmed outreach attendees")

        # ── 27 %: outreach contacts who came as walk-ins ──────────────
        outreach_walkin = 0
        for batch_start in range(0, len(walkin_ids), BATCH):
            batch_ids = walkin_ids[batch_start:batch_start + BATCH]
            contacts  = db.query(Contact).filter(Contact.id.in_(batch_ids)).all()
            for contact in contacts:
                existing = db.query(Attendance).filter(
                    Attendance.contact_id == contact.id
                ).first()
                if existing:
                    continue

                attend_time = checkin_time()
                db.add(Attendance(
                    campaign_id=campaign.id,
                    organisation_id=org.id,
                    contact_id=contact.id,
                    checked_in_by=checkin_vol(contact).id,
                    checked_in_at=attend_time,
                    is_walk_in=True,
                    source="walk-in",
                    how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                    notes=rng.choice(WALKIN_NOTES),
                ))
                contact.attended    = True
                contact.attended_at = attend_time
                outreach_walkin += 1

            db.commit()
            print(f"  –  walk-ins {outreach_walkin} / {len(walkin_ids)} …")

        print(f"  ✓  {outreach_walkin} outreach contacts as walk-ins")

        # ── New walk-ins (no prior contact record) ────────────────────
        new_walkin = 0
        for i in range(args.count):
            db.add(Attendance(
                campaign_id=campaign.id,
                organisation_id=org.id,
                contact_id=None,
                checked_in_by=rng.choice(volunteers).id,
                checked_in_at=checkin_time(),
                is_walk_in=True,
                source="walk-in",
                how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                notes=rng.choice(WALKIN_NOTES),
            ))
            new_walkin += 1
            if new_walkin % 100 == 0:
                db.commit()
                print(f"  –  {new_walkin}/{args.count} new walk-ins …")

        db.commit()
        print(f"  ✓  {new_walkin} new walk-in attendees")

        total_attendees = outreach_confirmed + outreach_walkin + new_walkin
        print(f"\n  ✓  Total attendees: {total_attendees}")

        # ── Decisions: ~60 % of all attendees ────────────────────────
        print(f"\n  Creating decision cards …\n")

        attendance_ids = [
            row[0] for row in
            db.query(Attendance.id).filter(
                Attendance.campaign_id == campaign.id
            ).all()
        ]

        decision_count = 0
        for outer_start in range(0, len(attendance_ids), BATCH):
            batch_att_ids = attendance_ids[outer_start:outer_start + BATCH]
            attendees     = db.query(Attendance).filter(
                Attendance.id.in_(batch_att_ids)
            ).all()
            for idx, att in enumerate(attendees, start=outer_start):
                if rng.random() > 0.60:
                    continue

                decision_type = rng.choices(
                    [d[0] for d in DECISION_TYPES],
                    weights=[d[1] for d in DECISION_TYPES],
                )[0]

                # Identity — pull from contact if available
                if att.contact_id:
                    contact = db.query(Contact).filter(
                        Contact.id == att.contact_id
                    ).first()
                    name    = contact.name
                    phone_1 = contact.phone or gen_phone(idx)
                    # Area from the contact's hub
                    adder    = db.query(User).filter(User.id == contact.added_by).first()
                    hub_name = adder.hub.name if (adder and adder.hub) else None
                    area     = rng.choice(HUB_AREAS.get(hub_name, ALL_AREAS))
                else:
                    name    = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
                    phone_1 = gen_phone(idx)
                    area    = rng.choice(ALL_AREAS)

                wants_referral = rng.random() < 0.22

                decision = Decision(
                    campaign_id=campaign.id,
                    organisation_id=org.id,
                    contact_id=att.contact_id,
                    counsellor_id=rng.choice(counsellors).id,
                    source=rng.choices(
                        ["real_time", "paper_form"], weights=[65, 35]
                    )[0],

                    # Identity
                    name=name,
                    phone_1=phone_1,
                    phone_2=gen_phone(idx + 10000) if rng.random() > 0.7 else None,
                    whatsapp_number=phone_1 if rng.random() > 0.4 else None,
                    email=(f"{name.lower().replace(' ', '')}@gmail.com"
                           if rng.random() > 0.7 else None),
                    area=area,
                    nearest_landmark=rng.choice(LANDMARKS),

                    # Decision
                    decision_type=decision_type,
                    decision_type_other=None,
                    first_time=(decision_type == "salvation"),
                    currently_attending=rng.choice(ATTENDING_STATUS),
                    current_church=rng.choice(CHURCH_NAMES) if rng.random() > 0.4 else None,
                    wants_church_referral=wants_referral,
                    referral_area=rng.choice(REFERRAL_AREAS) if wants_referral else None,

                    # Background
                    age_range=rng.choice(AGE_RANGES),
                    gender=rng.choice(GENDERS),
                    occupation=rng.choice(OCCUPATIONS),
                    how_did_you_hear=rng.choice(HOW_DID_YOU_HEAR),
                    brought_by=rng.choice(BROUGHT_BY_POOL),
                    notes=rng.choice(DECISION_NOTES),
                )
                db.add(decision)
                decision_count += 1
                if decision_count % 50 == 0:
                    db.commit()
                    print(f"  –  {decision_count} decisions …")

        db.commit()
        print(f"  ✓  {decision_count} decision cards recorded")

        # ── Summary ───────────────────────────────────────────────────
        referral_count = int(decision_count * 0.22)
        print(f"""
  ════════════════════════════════════════════════════════
  ATTENDANCE & DECISIONS SEEDED ✓
  ════════════════════════════════════════════════════════

  Attendance Breakdown:
    • Confirmed outreach:    {outreach_confirmed} (73%)
    • Walk-in from contacts: {outreach_walkin} (27%)
    • New walk-ins:          {new_walkin}
    ─────────────────────────────────
    • TOTAL:                 {total_attendees}

  Decisions:
    • Cards filled:          {decision_count}
    • Conversion rate:       {int(100 * decision_count / total_attendees) if total_attendees else 0}%
    • Church referrals:      ~{referral_count}

  Decision Breakdown (approx):""")
        for dtype, weight in DECISION_TYPES:
            print(f"    • {dtype.replace('_',' ').title():<22} ~{int(decision_count * weight)}")
        print("""
  Your dashboard is now fully populated for testing! 🎉
  ════════════════════════════════════════════════════════
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
