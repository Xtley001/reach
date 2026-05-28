import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import argparse
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.models import (
    Organisation, Campaign, Hub, User, Contact, ContactStatus,
    MessageTemplate, MessageSend, Logistics, FollowUpQueue,
    UserRole, UserStatus, ContactStatusCode, TransportStatus,
    FollowUpQueueType, FollowUpStatus, CampaignStatus,
)

# ── Args ──────────────────────────────────────────────────────────────────────
p = argparse.ArgumentParser()
p.add_argument("--email", default=os.environ.get("SEED_ADMIN_EMAIL"))
p.add_argument("--phone", default=os.environ.get("SEED_ADMIN_PHONE"))
p.add_argument("--org",   default=os.environ.get("SEED_ADMIN_ORG", "The Standing Church"))
p.add_argument("--count", type=int, default=5000, help="Number of contacts to seed (default 5000)")
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
    "Priscilla","Victor","Miracle","Deborah","Zainab","Hafsat",
    "Bashir","Ibrahim","Lukman","Mariam","Rahmat","Saliu",
    "Ayomide","Bamidele","Celestina","Damola","Ebunoluwa","Fola","Gbola",
    "Hezekiah","Ibukun","Joke","Kunle","Lola","Moyo","Nike","Olu",
    "Peter","Queen","Richard","Samuel","Tokunbo","Uche","Vivian","Wale",
    "Faith","Glory","Hope","Ife","Joy","Kola","Love","Mike","Nneka",
    "Ola","Sola","Tobi","Voke","Wura","Yinka",
]

LAST_NAMES = [
    "Olatunde","Anyanwu","Dike","Musa","Okafor","Akintola","Usman",
    "Olaosebikan","Eze","Adeyemi","Nwosu","Chukwu","Ibrahim","Okonkwo",
    "Uchenna","Adesanya","Egwu","Obi","Badmus","Olawale","Igwe","Lawal",
    "Adegoke","Nwofor","Fadahunsi","Okeke","Bakare","Akin","Onwudiwe",
    "Nzekwe","Ajayi","Oduya","Bello","Abdullahi","Oyelaran","Obiechina",
    "Garba","Olutayo","Bankole","Oni","Nwogu","Olatunji","Obiora",
    "Aliyu","Ogunwale","Nwachukwu","Oguike","Rasheed","Folasade",
    "Obasi","Oladele","Abiodun","Ugwu","Afolabi","Akindele","Effiong",
    "Nweke","Ogundele","Fashola","Olawuyi","Odunbaku","Adekunle",
    "Oluwole","Babatunde","Adeniran","Adeoye","Adeola","Babajide",
    "Adesola","Adetola","Adewumi","Adetunji","Agboola","Akerele",
    "Akinsanya","Akinwale","Akinwunmi","Alabi","Alao","Alatise",
    "Alebiosu","Alese","Aluko","Amadi","Amara",
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
    "Ilasan, Lekki","Ikate, Lekki","Osapa, Lekki",
    # Isolo / Festac
    "Isolo, Lagos","Ejigbo, Lagos","Ikotun, Lagos","Egbeda, Lagos",
    "Idimu, Lagos","Festac Town","Mile 2, Lagos","Amuwo-Odofin",
    "Satellite Town","Orile, Lagos",
    # Outskirts
    "Ifo, Ogun","Sango, Ogun","Otta, Ogun","Abule Egba","Alakuko",
    "Meiran, Lagos","Agbado, Lagos","Dopemu, Lagos","Ipaja, Lagos",
]

HUBS = [
    {
        "name": "Surulere Hub",
        "zone": "Lagos Island",
        "tag":  "sur",
        "location":    "Bode Thomas / Shitta axis, Surulere",
        "description": "Covers Surulere, Orile, Iganmu and Eric Moore.",
    },
    {
        "name": "Ikeja Hub",
        "zone": "Lagos Mainland",
        "tag":  "ikj",
        "location":    "Allen Avenue / Oregun, Ikeja",
        "description": "Covers Ikeja GRA, Agidingbi, Omole, Ojodu and Berger.",
    },
    {
        "name": "Lekki Hub",
        "zone": "Lekki-Ajah",
        "tag":  "lkk",
        "location":    "Lekki Phase 1 roundabout",
        "description": "Covers Lekki Phase 1 & 2, Ajah, Sangotedo and Chevron.",
    },
    {
        "name": "Oshodi Hub",
        "zone": "Oshodi-Isolo",
        "tag":  "osh",
        "location":    "Oshodi underbridge / Mafoluku",
        "description": "Covers Oshodi, Mushin, Isolo and Ejigbo.",
    },
    {
        "name": "Festac Hub",
        "zone": "Amuwo-Festac",
        "tag":  "fst",
        "location":    "Festac Town 2nd Avenue",
        "description": "Covers Festac, Amuwo-Odofin, Mile 2 and Satellite Town.",
    },
]

HUB_LEADERS = [
    {"name": "Blessing Okafor",   "hub": 0, "phone": "+2348011110001"},
    {"name": "Emeka Nwosu",       "hub": 1, "phone": "+2348011110002"},
    {"name": "Funmilayo Adeyemi", "hub": 2, "phone": "+2348011110003"},
    {"name": "Gbenga Olatunji",   "hub": 3, "phone": "+2348011110004"},
    {"name": "Chidinma Okafor",   "hub": 4, "phone": "+2348011110005"},
]

VOLUNTEERS = [
    {"name": "Chukwuemeka Eze",      "hub": 0, "tag": "v01", "phone": "+2348021110001"},
    {"name": "Ngozi Obi",            "hub": 0, "tag": "v02", "phone": "+2348021110002"},
    {"name": "Seun Afolabi",         "hub": 0, "tag": "v03", "phone": "+2348021110003"},
    {"name": "Amara Okonkwo",        "hub": 0, "tag": "v04", "phone": "+2348021110004"},
    {"name": "Tunde Babatunde",      "hub": 1, "tag": "v05", "phone": "+2348021110005"},
    {"name": "Yetunde Adeyemo",      "hub": 1, "tag": "v06", "phone": "+2348021110006"},
    {"name": "Ifeanyi Chibuike",     "hub": 1, "tag": "v07", "phone": "+2348021110007"},
    {"name": "Kemi Olatunji",        "hub": 1, "tag": "v08", "phone": "+2348021110008"},
    {"name": "Obinna Nwofor",        "hub": 2, "tag": "v09", "phone": "+2348021110009"},
    {"name": "Adaeze Nwachukwu",     "hub": 2, "tag": "v10", "phone": "+2348021110010"},
    {"name": "Damilola Ogundimu",    "hub": 2, "tag": "v11", "phone": "+2348021110011"},
    {"name": "Chiamaka Uchenna",     "hub": 2, "tag": "v12", "phone": "+2348021110012"},
    {"name": "Olusegun Badmus",      "hub": 3, "tag": "v13", "phone": "+2348021110013"},
    {"name": "Patience Egwu",        "hub": 3, "tag": "v14", "phone": "+2348021110014"},
    {"name": "Rasheed Aliyu",        "hub": 3, "tag": "v15", "phone": "+2348021110015"},
    {"name": "Ifeoma Nzekwe",        "hub": 3, "tag": "v16", "phone": "+2348021110016"},
    {"name": "Chukwudi Nwofor",      "hub": 4, "tag": "v17", "phone": "+2348021110017"},
    {"name": "Toyin Bello",          "hub": 4, "tag": "v18", "phone": "+2348021110018"},
    {"name": "Maryam Musa",          "hub": 4, "tag": "v19", "phone": "+2348021110019"},
    {"name": "Ikenna Eze",           "hub": 4, "tag": "v20", "phone": "+2348021110020"},
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

STATUS_NOTES = {
    ContactStatusCode.coming:           [
        "Confirmed over the phone", "Very excited to come",
        "Said she'll bring her sister", "Confirmed — will bring 2 friends", "",
    ],
    ContactStatusCode.undecided:        [
        "Said he needs to check with his wife", "Will let us know by Friday",
        "Seems interested but not sure about transport", "",
    ],
    ContactStatusCode.no_answer:        [
        "Tried twice, no answer", "Phone rings out", "Tried morning and evening", "",
    ],
    ContactStatusCode.needs_transport:  [
        "No car, lives far from venue", "Elderly, needs bus",
        "Group of 3 needing pickup", "Far from any bus route",
    ],
    ContactStatusCode.message_sent:     [
        "WhatsApp message sent", "SMS delivered", "Sent invite message",
    ],
    ContactStatusCode.not_coming:       [
        "Has a work commitment that day", "Travelling that weekend", "",
    ],
    ContactStatusCode.unreachable:      [
        "Number not going through", "Phone switched off repeatedly", "",
    ],
}

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
    "", "", "", "",  # weight towards no notes
]

TRANSPORT_NOTES = [
    "Pickup from {loc} bus stop",
    "Old resident — needs pickup from {loc}",
    "Requested bus from {loc} junction",
    "Group of 3 from {loc}",
    "Lives far — needs transport from {loc}",
]

HOW_HEARD_POOL = [
    "Friend invited me",
    "Saw the flyer",
    "WhatsApp message",
    "Family member",
    "Passed by the venue",
    "Social media post",
    "Church announcement",
    "Market outreach team",
    None, None, None,
]


def gen_phone(i):
    """Deterministic fake Nigerian E.164 phone."""
    prefixes = ["801","802","803","805","806","808","810","813","814","901","903","907","912"]
    px = prefixes[i % len(prefixes)]
    suffix = str((i * 7919 + 10000000) % 10000000).zfill(7)
    return f"+234{px}{suffix}"


def gen_second_phone(i):
    """Slightly different deterministic phone for second_phone field."""
    prefixes = ["802","805","810","901","907"]
    px = prefixes[i % len(prefixes)]
    suffix = str((i * 6271 + 20000000) % 10000000).zfill(7)
    return f"+234{px}{suffix}"


def upsert_user(db, org, hub, name, email, phone, role,
                is_reg=False, is_dec=False):
    q = db.query(User).filter(User.organisation_id == org.id)
    u = (q.filter(User.email == email).first() if email
         else q.filter(User.phone == phone).first() if phone else None)
    if u:
        u.role   = role
        u.status = UserStatus.active
        u.hub_id = hub.id if hub else u.hub_id
        u.is_registration_team = is_reg
        u.is_decisions_team    = is_dec
        db.commit()
        return u, False
    u = User(
        organisation_id=org.id,
        hub_id=hub.id if hub else None,
        name=name, email=email, phone=phone,
        role=role, status=UserStatus.active,
        is_registration_team=is_reg,
        is_decisions_team=is_dec,
    )
    db.add(u); db.commit(); db.refresh(u)
    return u, True


# ── Main ──────────────────────────────────────────────────────────────────────

def seed():
    db = Session()
    try:
        print(f"\n  REACH demo seed — org: {args.org} | target: {args.count} contacts\n")

        # ── Org ───────────────────────────────────────────────────────
        org = db.query(Organisation).filter(Organisation.name == args.org).first()
        if not org:
            org = Organisation(
                name=args.org,
                slug=args.org.lower().replace(" ", "-"),
            )
            db.add(org); db.commit(); db.refresh(org)
            print(f"  ✓  Org:      {org.name}")
        else:
            print(f"  –  Org:      {org.name}")

        # ── Campaign ──────────────────────────────────────────────────
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

        # ── Minister ──────────────────────────────────────────────────
        minister, created = upsert_user(
            db, org, None,
            name="Pastor Tara",
            email=args.email,
            phone=e164(args.phone),
            role=UserRole.minister,
        )
        print(f"  {'✓' if created else '–'}  Minister: {minister.name}")

        # ── Hubs + Hub Leaders ────────────────────────────────────────
        hub_objs = []
        hl_objs  = []
        for i, hdef in enumerate(HUBS):
            hub = db.query(Hub).filter(
                Hub.organisation_id == org.id, Hub.name == hdef["name"]
            ).first()
            if not hub:
                hub = Hub(
                    organisation_id=org.id,
                    campaign_id=campaign.id,
                    name=hdef["name"],
                    zone=hdef["zone"],
                    location=hdef["location"],
                    description=hdef["description"],
                )
                db.add(hub); db.commit(); db.refresh(hub)
                print(f"  ✓  Hub:      {hub.name}")
            else:
                # Update location/description if blank
                if not hub.location:
                    hub.location    = hdef["location"]
                    hub.description = hdef["description"]
                    db.commit()
                print(f"  –  Hub:      {hub.name}")
            hub_objs.append(hub)

            hldef = HUB_LEADERS[i]
            hl, created = upsert_user(
                db, org, hub,
                name=hldef["name"],
                email=sub(hdef["tag"]),
                phone=hldef["phone"],
                role=UserRole.hub_leader,
                is_reg=True,
                is_dec=True,
            )
            print(f"  {'✓' if created else '–'}  HL:       {hl.name}")
            hl_objs.append(hl)

        # ── Volunteers ────────────────────────────────────────────────
        vol_objs = []
        for vdef in VOLUNTEERS:
            v, created = upsert_user(
                db, org, hub_objs[vdef["hub"]],
                name=vdef["name"],
                email=sub(vdef["tag"]),
                phone=vdef["phone"],
                role=UserRole.volunteer,
                is_reg=True,
            )
            # Stamp last_active_at so they don't look dormant
            v.last_active_at = datetime.now(timezone.utc) - timedelta(
                hours=rng.randint(1, 72)
            )
            db.commit()
            print(f"  {'✓' if created else '–'}  Vol:      {v.name}")
            vol_objs.append(v)

        # ── Templates ─────────────────────────────────────────────────
        tmpl_defs = [
            ("Initial Invite",
             "Hi [Name]! 🙏 It was great meeting you at [Location]. "
             "We'd love for you to join us at the Times of Refreshing 2026 this Saturday at "
             "Teslim Balogun Stadium, Surulere. It starts at 4pm — can we count you in?"),
            ("Follow-Up Reminder",
             "Hello [Name], just a reminder about the crusade this Saturday! "
             "We met you at [Location]. Programme starts 4pm, transport is available. "
             "We'd love to see you there 🙏"),
            ("Transport Confirmation",
             "Hi [Name]! Your transport from [Location] is confirmed. "
             "Bus picks up by 3pm Saturday — please be ready. Feel free to bring a friend! 🚌"),
            ("Day-Before Reminder",
             "Tomorrow is the big day, [Name]! 🎉 The Times of Refreshing 2026 is at "
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
                    campaign_id=campaign.id,
                    organisation_id=org.id,
                    label=label,
                    body=body,
                    created_by=minister.id,
                    is_active=True,
                )
                db.add(tmpl); db.commit(); db.refresh(tmpl)
            tmpl_objs.append(tmpl)
        print(f"  ✓  {len(tmpl_objs)} message templates")

        # ── Contacts ──────────────────────────────────────────────────
        print(f"\n  Generating {args.count} contacts …")

        existing_count = db.query(Contact).filter(
            Contact.campaign_id == campaign.id
        ).count()
        to_create = args.count - existing_count
        if to_create <= 0:
            print(f"  –  {existing_count} contacts already exist — skipping")
        else:
            print(f"  –  {existing_count} exist, creating {to_create} more …")

        # Randomised per-volunteer load weights so no two volunteers
        # end up with the same contact count
        vol_weights = [rng.randint(3, 10) for _ in vol_objs]

        batch      = []
        created_c  = 0
        transport_c = 0
        phone_set   = {r[0] for r in db.query(Contact.phone).filter(
                        Contact.campaign_id == campaign.id).all()}

        for idx in range(args.count * 3):   # over-generate to handle collisions
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

            # Weighted random volunteer — different tallies per volunteer
            vol = rng.choices(vol_objs, weights=vol_weights, k=1)[0]

            # Resolve hub index for logistics attribution
            vol_def  = next((v for v in VOLUNTEERS if sub(v["tag"]) == vol.email), None)
            hub_idx  = vol_def["hub"] if vol_def else 0

            # Spread creation times over last 7 days
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
                source="volunteer",
                how_did_you_hear=rng.choice(HOW_HEARD_POOL),
                email=(f"{fn.lower()}.{ln.lower()}@gmail.com"
                       if rng.random() < 0.15 else None),
                second_phone=(gen_second_phone(idx)
                              if rng.random() < 0.12 else None),
                created_at=created_at,
            )
            db.add(c); db.flush()

            # ── Contact Status ────────────────────────────────────────
            status_code = rng.choice(STATUS_POOL)
            note_pool   = STATUS_NOTES.get(status_code, [""])
            db.add(ContactStatus(
                contact_id=c.id,
                status_code=status_code,
                updated_by=vol.id,
                updated_at=created_at + timedelta(minutes=rng.randint(5, 180)),
                note=rng.choice(note_pool) or None,
            ))

            # ── MessageSend for message_sent contacts ─────────────────
            if status_code == ContactStatusCode.message_sent:
                db.add(MessageSend(
                    contact_id=c.id,
                    template_id=rng.choice(tmpl_objs).id,
                    sent_by=vol.id,
                    sent_at=created_at + timedelta(minutes=rng.randint(10, 300)),
                ))

            # ── Logistics for transport contacts ──────────────────────
            if trans:
                db.add(Logistics(
                    contact_id=c.id,
                    organisation_id=org.id,
                    transport_status=rng.choice([
                        TransportStatus.pending,
                        TransportStatus.pending,
                        TransportStatus.arranged,
                    ]),
                    coordinator_note=rng.choice(TRANSPORT_NOTES).format(loc=loc),
                    updated_by=hl_objs[hub_idx].id,   # correct hub leader
                ))
                transport_c += 1

            # ── Follow-up queue for undecided / no-answer ─────────────
            if status_code in (ContactStatusCode.undecided, ContactStatusCode.no_answer):
                db.add(FollowUpQueue(
                    contact_id=c.id,
                    campaign_id=campaign.id,
                    organisation_id=org.id,
                    queue_type=rng.choice([
                        FollowUpQueueType.soft_checkin,
                        FollowUpQueueType.soft_checkin,
                        FollowUpQueueType.missed_you,
                        FollowUpQueueType.thank_you,
                    ]),
                    assigned_to=vol.id,
                    status=rng.choice([
                        FollowUpStatus.pending,
                        FollowUpStatus.pending,
                        FollowUpStatus.in_progress,
                        FollowUpStatus.done,
                    ]),
                ))

            created_c += 1
            if created_c % 100 == 0:
                db.commit()
                print(f"     … {existing_count + created_c} contacts committed")

        db.commit()
        total = existing_count + created_c
        print(f"\n  ✓  {total} total contacts  ({transport_c} need transport)")

        # ── Summary ───────────────────────────────────────────────────
        print(f"""
  ════════════════════════════════════════════════════════
  DEMO READY — {total} contacts seeded across 5 hubs
  ════════════════════════════════════════════════════════

  MINISTER   (→ /admin)
    Email : {args.email}
    Phone : {e164(args.phone)}

  HUB LEADERS  (→ /hub-login, email or phone tab)
    {sub('sur'):<42}  /  +2348011110001  (Surulere)
    {sub('ikj'):<42}  /  +2348011110002  (Ikeja)
    {sub('lkk'):<42}  /  +2348011110003  (Lekki)
    {sub('osh'):<42}  /  +2348011110004  (Oshodi)
    {sub('fst'):<42}  /  +2348011110005  (Festac)

  VOLUNTEERS  (→ /login, email or phone tab)
    {sub('v01'):<42}  /  +2348021110001  Chukwuemeka Eze   (Surulere)
    {sub('v02'):<42}  /  +2348021110002  Ngozi Obi         (Surulere)
    {sub('v05'):<42}  /  +2348021110005  Tunde Babatunde   (Ikeja)
    {sub('v09'):<42}  /  +2348021110009  Obinna Nwofor     (Lekki)
    {sub('v13'):<42}  /  +2348021110013  Olusegun Badmus   (Oshodi)
    {sub('v17'):<42}  /  +2348021110017  Chukwudi Nwofor   (Festac)
    … (v01–v20 all work)

  All OTPs arrive in your main Gmail inbox (email) or via SMS (phone).
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