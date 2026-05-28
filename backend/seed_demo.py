import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import argparse
import random
from datetime import datetime, timedelta, timezone
from itertools import product

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.models import (
    Organisation, Campaign, Hub, User, Contact, ContactStatus,
    MessageTemplate, Logistics, FollowUpQueue,
    UserRole, UserStatus, ContactStatusCode, TransportStatus,
    FollowUpQueueType, FollowUpStatus, CampaignStatus,
)

# ── Args ──────────────────────────────────────────────────────────────────────
p = argparse.ArgumentParser()
p.add_argument("--email", default=os.environ.get("SEED_ADMIN_EMAIL"))
p.add_argument("--phone", default=os.environ.get("SEED_ADMIN_PHONE"))
p.add_argument("--org",   default=os.environ.get("SEED_ADMIN_ORG", "The Standing Church"))
p.add_argument("--count", type=int, default=100, help="Number of contacts to seed (default 100)")
args = p.parse_args()

if not args.email or not args.phone:
    p.error("Provide --email and --phone (or set SEED_ADMIN_EMAIL / SEED_ADMIN_PHONE)")

_base, _domain = args.email.split("@")
def sub(tag): return f"{_base}+{tag}@{_domain}"
def e164(p):  return "+234" + p[1:] if p.startswith("0") else p

engine  = create_engine(settings.DATABASE_URL, pool_pre_ping=True,
                        connect_args={"options": "-c statement_timeout=0"})
Session = sessionmaker(bind=engine)
rng     = random.Random(42)

# ── Name pools ────────────────────────────────────────────────────────────────
FIRST_NAMES = [
    "Adebisi","Ngozi","Emeka","Fatima","Chinyere","Bode","Aisha","Tunde",
    "Amaka","Segun","Blessing","Kelechi","Hauwa","Sunday","Chioma","Remi",
    "Patience","Yetunde","Taiwo","Kehinde","Nkechi","Funke","Chukwudi",
    "Abosede","Adaeze","Mustapha","Oluwakemi","Ebele","Ifeoma","Damilola",
    "Onyeka","Toyin","Chinonso","Bolanle","Hassan","Ugo","Sade","Chika",
    "Aminu","Tope","Adunola","Ikenna","Precious","Gbenga","Chiamaka",
    "Musa","Bisi","Chukwuebuka","Olabisi","Adewale","Ngozi","Tijani",
    "Okonkwo","Ify","Bello","Adaora","Chidinma","Gbemi","Emmanuel",
    "Yemi","Oluwaseun","Maryam","Obinna","Titilayo","Kanyinsola","Nnamdi",
    "Oluwatobi","Imaobong","Chinyelu","Rufus","Christiana","Olumide",
    "Adenike","Ifunanya","Kazeem","Grace","Chibundo","Temi","Oluwafemi",
    "Priscilla","Victor","Blessing","Miracle","Deborah","Zainab","Hafsat",
    "Bashir","Ibrahim","Lukman","Mariam","Rahmat","Saliu","Taiwo",
    "Ayomide","Bamidele","Celestina","Damola","Ebunoluwa","Fola","Gbola",
    "Hezekiah","Ibukun","Joke","Kunle","Lola","Moyo","Nike","Olu",
    "Peter","Queen","Richard","Samuel","Tokunbo","Uche","Vivian","Wale",
    "Xavier","Yemi","Zainab","Ade","Bola","Chidi","Dupe","Eze",
    "Faith","Glory","Hope","Ife","Joy","Kola","Love","Mike","Nneka",
    "Ola","Pele","Ria","Sola","Tobi","Uma","Voke","Wura","Xola","Yinka",
]

LAST_NAMES = [
    "Olatunde","Anyanwu","Dike","Musa","Okafor","Akintola","Usman",
    "Olaosebikan","Eze","Adeyemi","Nwosu","Chukwu","Ibrahim","Okonkwo",
    "Uchenna","Adesanya","Egwu","Obi","Badmus","Olawale","Igwe","Lawal",
    "Adegoke","Nwofor","Fadahunsi","Okeke","Bakare","Akin","Onwudiwe",
    "Nzekwe","Ajayi","Oduya","Bello","Abdullahi","Oyelaran","Obiechina",
    "Garba","Olutayo","Bankole","Eze","Oni","Nwogu","Olatunji","Obiora",
    "Aliyu","Ogunwale","Nwofor","Adeyemi","Okonkwo","Nwachukwu","Bakare",
    "Oguike","Rasheed","Obiora","Okafor","Folasade","Obasi","Oladele",
    "Adeyemi","Abiodun","Musa","Ugwu","Afolabi","Bello","Okonkwo","Eze",
    "Akindele","Effiong","Obi","Abiodun","Nweke","Adegoke","Olatunji",
    "Okafor","Lawal","Okeke","Ogundele","Fashola","Olawuyi","Odunbaku",
    "Adekunle","Oluwole","Babatunde","Adeniran","Oluwole","Adeoye",
    "Adeola","Babajide","Adesola","Adetola","Adewumi","Adetunji",
    "Agboola","Akerele","Akinsanya","Akinwale","Akinwunmi","Alabi",
    "Alao","Alatise","Alebiosu","Alese","Aluko","Amadi","Amara",
]

LOCATIONS = [
    # Surulere / Lagos Island
    "Surulere, Lagos","Itire Junction","Iganmu, Lagos","Orile Iganmu",
    "Bode Thomas, Surulere","Aguda, Surulere","Shitta, Surulere",
    "Eric Moore, Surulere","Ojuelegba, Lagos","Alaka Estate",
    # Mainland
    "Yaba, Lagos","Ebute Metta","Oyingbo, Lagos","Bariga, Lagos",
    "Shomolu, Lagos","Gbagada, Lagos","Anthony Village","Maryland, Lagos",
    "Palmgrove Estate","Ogudu, Lagos","Ojota, Lagos","Ketu, Lagos",
    "Alapere, Lagos","Mile 12, Lagos","Oworo, Lagos","Ilupeju, Lagos",
    # Ikeja
    "Ikeja GRA","Allen Avenue, Ikeja","Oregun, Ikeja","Alausa, Ikeja",
    "Agidingbi, Ikeja","Magodo, Lagos","Omole Phase 1","Ojodu Abiodun",
    "Berger, Lagos","Ojodu Berger","Shangisha","Ikosi Ketu","Agege, Lagos",
    # Oshodi / Mushin
    "Oshodi, Lagos","Mushin, Lagos","Mafoluku, Oshodi","Ikorodu Road",
    "Palmgrove, Lagos","Somolu, Lagos","Apapa, Lagos","Ikorodu, Lagos",
    # Lekki / VI
    "Lekki Phase 1","Lekki Phase 2","Victoria Island","Ajah, Lagos",
    "Sangotedo","Awoyaya","Igbo Efon","Chevron Drive","Jakande Estate",
    "Eti-Osa","Lakepoint, Lekki","Thomas Estate, Ajah","Ajah Roundabout",
    "Lekki Conservation","Ilasan, Lekki","Ikate, Lekki","Osapa, Lekki",
    # Isolo / Festac
    "Isolo, Lagos","Ejigbo, Lagos","Ikotun, Lagos","Egbeda, Lagos",
    "Idimu, Lagos","Festac Town","Mile 2, Lagos","Amuwo-Odofin",
    "Satellite Town","Badagry Expressway","Orile, Lagos",
    # Outskirts / Ogun
    "Ifo, Ogun","Sango, Ogun","Otta, Ogun","Sagamu, Ogun",
    "Abule Egba","Alakuko","Meiran, Lagos","Agbado, Lagos",
    "Dopemu, Lagos","Ipaja, Lagos","Abule Ado",
]

HUBS = [
    {"name": "Surulere Hub",    "zone": "Lagos Island",   "tag": "sur"},
    {"name": "Ikeja Hub",       "zone": "Lagos Mainland", "tag": "ikj"},
    {"name": "Lekki Hub",       "zone": "Lekki-Ajah",    "tag": "lkk"},
    {"name": "Oshodi Hub",      "zone": "Oshodi-Isolo",  "tag": "osh"},
    {"name": "Festac Hub",      "zone": "Amuwo-Festac",  "tag": "fst"},
]

HUB_LEADERS = [
    {"name": "Blessing Okafor",       "hub": 0},
    {"name": "Emeka Nwosu",           "hub": 1},
    {"name": "Funmilayo Adeyemi",     "hub": 2},
    {"name": "Gbenga Olatunji",       "hub": 3},
    {"name": "Chidinma Okafor",       "hub": 4},
]

VOLUNTEERS = [
    {"name": "Chukwuemeka Eze",       "hub": 0, "tag": "v01"},
    {"name": "Ngozi Obi",             "hub": 0, "tag": "v02"},
    {"name": "Seun Afolabi",          "hub": 0, "tag": "v03"},
    {"name": "Amara Okonkwo",         "hub": 0, "tag": "v04"},
    {"name": "Tunde Babatunde",       "hub": 1, "tag": "v05"},
    {"name": "Yetunde Adeyemo",       "hub": 1, "tag": "v06"},
    {"name": "Ifeanyi Chibuike",      "hub": 1, "tag": "v07"},
    {"name": "Kemi Olatunji",         "hub": 1, "tag": "v08"},
    {"name": "Obinna Nwofor",         "hub": 2, "tag": "v09"},
    {"name": "Adaeze Nwachukwu",      "hub": 2, "tag": "v10"},
    {"name": "Damilola Ogundimu",     "hub": 2, "tag": "v11"},
    {"name": "Chiamaka Uchenna",      "hub": 2, "tag": "v12"},
    {"name": "Olusegun Badmus",       "hub": 3, "tag": "v13"},
    {"name": "Patience Egwu",         "hub": 3, "tag": "v14"},
    {"name": "Rasheed Aliyu",         "hub": 3, "tag": "v15"},
    {"name": "Ifeoma Nzekwe",         "hub": 3, "tag": "v16"},
    {"name": "Chukwudi Nwofor",       "hub": 4, "tag": "v17"},
    {"name": "Toyin Bello",           "hub": 4, "tag": "v18"},
    {"name": "Maryam Musa",           "hub": 4, "tag": "v19"},
    {"name": "Ikenna Eze",            "hub": 4, "tag": "v20"},
]

STATUS_WEIGHTS = [
    (ContactStatusCode.coming,          30),
    (ContactStatusCode.undecided,       22),
    (ContactStatusCode.no_answer,       18),
    (ContactStatusCode.needs_transport, 12),
    (ContactStatusCode.message_sent,    10),
    (ContactStatusCode.not_coming,       5),
    (ContactStatusCode.unreachable,      3),
]
STATUS_POOL = [s for s, w in STATUS_WEIGHTS for _ in range(w)]

NOTES_POOL = [
    "Very interested — met at bus stop",
    "Came up to us first at the market",
    "Has family members who want to come too",
    "Old mama, very open to the gospel",
    "Works nearby, confirmed he can attend",
    "Said she'd bring her neighbour",
    "Met at the filling station",
    "Was at someone else's door when we knocked",
    "Picked up the flyer and asked questions",
    "Invited by a friend already coming",
    "Seemed unsure but took the address",
    "Very warm, gave us water",
    "Three-time no-answer, try evening",
    "Left a note with the gateman",
    "",  # many contacts have no notes
    "", "", "",  # weight towards no notes
]

TRANSPORT_NOTES = [
    "Pickup from {loc} bus stop",
    "Old resident — needs pickup from {loc}",
    "Requested bus from {loc} junction",
    "Group of 3 from {loc}",
    "Lives far — needs transport from {loc}",
]


def gen_phone(i):
    """Deterministic fake Nigerian E.164 phone."""
    prefixes = ["801","802","803","805","806","808","810","813","814","901","903","907","912"]
    px = prefixes[i % len(prefixes)]
    suffix = str((i * 7919 + 10000000) % 10000000).zfill(7)
    return f"+234{px}{suffix}"


def upsert_user(db, org, hub, name, email, phone, role):
    q = db.query(User).filter(User.organisation_id == org.id)
    u = (q.filter(User.email == email).first() if email
         else q.filter(User.phone == phone).first() if phone else None)
    if u:
        u.role   = role
        u.status = UserStatus.active
        u.hub_id = hub.id if hub else u.hub_id
        db.commit()
        return u, False
    u = User(
        organisation_id=org.id,
        hub_id=hub.id if hub else None,
        name=name, email=email, phone=phone,
        role=role, status=UserStatus.active,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u, True


# ── Main ──────────────────────────────────────────────────────────────────────

def seed():
    db = Session()
    try:
        print(f"\n  REACH demo seed — target: {args.count} contacts\n")

        # Org
        org = db.query(Organisation).filter(Organisation.name == args.org).first()
        if not org:
            org = Organisation(name=args.org, slug=args.org.lower().replace(" ", "-"))
            db.add(org); db.commit(); db.refresh(org)
            print(f"  ✓  Org:      {org.name}")
        else:
            print(f"  –  Org:      {org.name}")

        # Campaign
        campaign = db.query(Campaign).filter(Campaign.organisation_id == org.id).first()
        if not campaign:
            campaign = Campaign(
                organisation_id=org.id,
                name="Times of Refreshing 2026",
                target_count=args.count,
                programme_date=datetime.now(timezone.utc) + timedelta(days=14),
                venue="Teslim Balogun Stadium, Surulere",
                status=CampaignStatus.active,
            )
            db.add(campaign); db.commit(); db.refresh(campaign)
            print(f"  ✓  Campaign: {campaign.name}")
        else:
            print(f"  –  Campaign: {campaign.name}")

        # Minister
        minister, created = upsert_user(
            db, org, None,
            name="Pastor Akintara",
            email=args.email,
            phone=e164(args.phone),
            role=UserRole.minister,
        )
        print(f"  {'✓' if created else '–'}  Minister: {minister.name}")

        # Hubs + Hub Leaders
        hub_objs = []
        hl_objs  = []
        for i, hdef in enumerate(HUBS):
            hub = db.query(Hub).filter(
                Hub.organisation_id == org.id, Hub.name == hdef["name"]
            ).first()
            if not hub:
                hub = Hub(organisation_id=org.id, campaign_id=campaign.id,
                          name=hdef["name"], zone=hdef["zone"])
                db.add(hub); db.commit(); db.refresh(hub)
                print(f"  ✓  Hub:      {hub.name}")
            else:
                print(f"  –  Hub:      {hub.name}")
            hub_objs.append(hub)

            hldef = HUB_LEADERS[i]
            hl, created = upsert_user(
                db, org, hub,
                name=hldef["name"],
                email=sub(hdef["tag"]),
                phone=None,
                role=UserRole.hub_leader,
            )
            print(f"  {'✓' if created else '–'}  HL:       {hl.name}")
            hl_objs.append(hl)

        # Volunteers
        vol_objs = []
        for vdef in VOLUNTEERS:
            v, created = upsert_user(
                db, org, hub_objs[vdef["hub"]],
                name=vdef["name"],
                email=sub(vdef["tag"]),
                phone=None,
                role=UserRole.volunteer,
            )
            print(f"  {'✓' if created else '–'}  Vol:      {v.name}")
            vol_objs.append(v)

        # Templates
        tmpl_defs = [
            ("Initial Invite",
             "Hi [Name]! 🙏 It was great meeting you at [Location]. "
             "We'd love for you to join us at the Lagos Miracle Crusade this Saturday at "
             "Teslim Balogun Stadium, Surulere. It starts at 4pm — can we count you in?"),
            ("Follow-Up Reminder",
             "Hello [Name], just a reminder about the crusade this Saturday! "
             "We met you at [Location]. Programme starts 4pm, transport is available. "
             "We'd love to see you there 🙏"),
            ("Transport Confirmation",
             "Hi [Name]! Your transport from [Location] is confirmed. "
             "Bus picks up by 3pm Saturday — please be ready. Feel free to bring a friend! 🚌"),
            ("Day-Before Reminder",
             "Tomorrow is the big day, [Name]! 🎉 The Lagos Miracle Crusade is at "
             "Teslim Balogun Stadium, 4pm. We met you at [Location] and can't wait to "
             "see you there. God bless you!"),
        ]
        tmpl_objs = []
        for label, body in tmpl_defs:
            tmpl = db.query(MessageTemplate).filter(
                MessageTemplate.campaign_id == campaign.id,
                MessageTemplate.label == label
            ).first()
            if not tmpl:
                tmpl = MessageTemplate(
                    campaign_id=campaign.id, organisation_id=org.id,
                    label=label, body=body,
                    created_by=minister.id, is_active=True,
                )
                db.add(tmpl); db.commit(); db.refresh(tmpl)
            tmpl_objs.append(tmpl)
        print(f"  ✓  {len(tmpl_objs)} message templates")

        # Contacts — generate args.count
        print(f"\n  Generating {args.count} contacts …")

        # Check how many already exist
        existing_count = db.query(Contact).filter(
            Contact.campaign_id == campaign.id
        ).count()
        to_create = args.count - existing_count
        if to_create <= 0:
            print(f"  –  {existing_count} contacts already exist — skipping")
        else:
            print(f"  –  {existing_count} exist, creating {to_create} more …")

        batch      = []
        created_c  = 0
        transport_c= 0
        phone_set  = {r[0] for r in db.query(Contact.phone).filter(
                       Contact.campaign_id == campaign.id).all()}

        for idx in range(args.count * 3):  # over-generate to handle collisions
            if created_c >= to_create:
                break

            phone = gen_phone(idx + existing_count * 7 + 9999)
            if phone in phone_set:
                continue
            phone_set.add(phone)

            fn    = rng.choice(FIRST_NAMES)
            ln    = rng.choice(LAST_NAMES)
            name  = f"{fn} {ln}"
            loc   = rng.choice(LOCATIONS)
            trans = rng.random() < 0.18   # ~18% need transport
            notes = rng.choice(NOTES_POOL)
            vol   = vol_objs[idx % len(vol_objs)]
            # spread creation times over last 7 days
            created_at = datetime.now(timezone.utc) - timedelta(
                hours=rng.randint(1, 168),
                minutes=rng.randint(0, 59),
            )

            c = Contact(
                campaign_id=campaign.id,
                organisation_id=org.id,
                added_by=vol.id,
                name=name,
                phone=phone,
                location=loc,
                notes=notes or None,
                needs_transport=trans,
                transport_location=loc if trans else None,
                created_at=created_at,
            )
            db.add(c); db.flush()

            # Status
            status_code = rng.choice(STATUS_POOL)
            db.add(ContactStatus(
                contact_id=c.id,
                status_code=status_code,
                updated_by=vol.id,
                updated_at=created_at + timedelta(minutes=rng.randint(5, 180)),
            ))

            # Logistics for transport
            if trans:
                # determine hub index for the volunteer; fallback to 0 if no email (P0-2.1)
                hub_idx = 0
                if vol.email:
                    match = next((v for v in VOLUNTEERS if sub(v["tag"]) == vol.email), None)
                    if match:
                        hub_idx = match["hub"]
                db.add(Logistics(
                    contact_id=c.id,
                    organisation_id=org.id,
                    transport_status=rng.choice([
                        TransportStatus.pending,
                        TransportStatus.pending,
                        TransportStatus.arranged,
                    ]),
                    coordinator_note=rng.choice(TRANSPORT_NOTES).format(loc=loc),
                    updated_by=hl_objs[0].id,
                ))
                transport_c += 1

            # Follow-up queue for undecided / no-answer
            if status_code in (ContactStatusCode.undecided, ContactStatusCode.no_answer):
                db.add(FollowUpQueue(
                    contact_id=c.id,
                    campaign_id=campaign.id,
                    organisation_id=org.id,
                    queue_type=rng.choice([
                        FollowUpQueueType.soft_checkin,
                        FollowUpQueueType.soft_checkin,
                        FollowUpQueueType.missed_you,
                    ]),
                    assigned_to=vol.id,
                    status=rng.choice([
                        FollowUpStatus.pending,
                        FollowUpStatus.pending,
                        FollowUpStatus.in_progress,
                    ]),
                ))

            created_c += 1
            if created_c % 100 == 0:
                db.commit()
                print(f"     … {existing_count + created_c} contacts committed")

        db.commit()
        total = existing_count + created_c
        print(f"\n  ✓  {total} total contacts  ({transport_c} need transport)")

        # Print summary
        print(f"""
  ════════════════════════════════════════════════════════
  DEMO READY — {total} contacts seeded across 5 hubs
  ════════════════════════════════════════════════════════

  MINISTER   (→ /admin)
    {args.email}

  HUB LEADERS  (→ /hub-login, use email tab)
    {sub('sur'):<42}  Surulere Hub
    {sub('ikj'):<42}  Ikeja Hub
    {sub('lkk'):<42}  Lekki Hub
    {sub('osh'):<42}  Oshodi Hub
    {sub('fst'):<42}  Festac Hub

  VOLUNTEERS  (→ /login, use email tab)
    {sub('v01'):<42}  Chukwuemeka Eze   (Surulere)
    {sub('v05'):<42}  Tunde Babatunde   (Ikeja)
    {sub('v09'):<42}  Obinna Nwofor     (Lekki)
    {sub('v13'):<42}  Olusegun Badmus   (Oshodi)
    {sub('v17'):<42}  Chukwudi Nwofor   (Festac)
    … (v01–v20 all work)

  All OTPs arrive in your main Gmail inbox.
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