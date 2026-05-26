"""
REACH — Hub Leader & Minister Management Routers
Hub Leader:
  GET    /hub/volunteers          — list volunteers in hub
  POST   /hub/volunteers/:id/approve
  POST   /hub/volunteers/:id/reject
  POST   /hub/volunteers/:id/force-logout
  GET    /hub/logistics           — transport-flagged contacts
  PATCH  /hub/logistics/:id       — update transport status
  POST   /hub/contacts/:id/reassign
  GET    /hub/stale               — contacts untouched > 48h

Minister:
  GET    /minister/volunteers     — all volunteers
  GET    /minister/demographics   — aggregated stats
  POST   /campaigns               — create campaign
  GET    /campaigns               — list campaigns
  POST   /campaigns/:id/archive
"""
import io
import csv
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import (
    User, UserStatus, UserRole, Contact, ContactStatus, ContactStatusCode,
    Logistics, TransportStatus, Campaign, CampaignStatus, RefreshToken,
    FollowUpQueue, FollowUpQueueType, Hub
)
from ..schemas import ApprovalAction, ContactReassign, LogisticsUpdate, CampaignCreate
from ..dependencies import (
    get_current_user, require_hub_leader, require_minister,
    log_action, get_client_ip
)

hub_router = APIRouter(prefix="/hub", tags=["hub-leader"])
minister_router = APIRouter(prefix="/minister", tags=["minister"])
campaign_router = APIRouter(prefix="/campaigns", tags=["campaigns"])


# ─────────────────────────────────────────────
# HUB LEADER
# ─────────────────────────────────────────────

@hub_router.get("/volunteers")
async def list_hub_volunteers(
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    volunteers = db.query(User).filter(
        User.hub_id == user.hub_id,
        User.role == UserRole.volunteer,
    ).all()

    return {"volunteers": [
        {
            "id":             v.id,
            "name":           v.name,
            "phone":          v.phone,
            "email":          v.email,
            "avatar_url":     v.avatar_url,
            "status":         v.status,
            "created_at":     v.created_at.isoformat(),
            "last_active_at": v.last_active_at.isoformat() if v.last_active_at else None,
        }
        for v in volunteers
    ]}


@hub_router.get("/volunteers/pending")
async def pending_volunteers(
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    pending = db.query(User).filter(
        User.hub_id == user.hub_id,
        User.status == UserStatus.pending,
    ).all()
    return {"pending": [{"id": v.id, "name": v.name, "phone": v.phone, "created_at": v.created_at.isoformat()} for v in pending]}


@hub_router.post("/volunteers/{volunteer_id}/approve", status_code=200)
async def approve_volunteer(
    volunteer_id: str,
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    volunteer = db.query(User).filter(
        User.id == volunteer_id,
        User.hub_id == user.hub_id,
        User.status == UserStatus.pending,
    ).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found or already processed")

    volunteer.status = UserStatus.active
    db.commit()
    log_action(db, user, "volunteer.approved", "user", volunteer_id)
    # In production: send SMS/WhatsApp notification to volunteer
    return {"detail": "Volunteer approved"}


@hub_router.post("/volunteers/{volunteer_id}/reject", status_code=200)
async def reject_volunteer(
    volunteer_id: str,
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    volunteer = db.query(User).filter(
        User.id == volunteer_id,
        User.hub_id == user.hub_id,
    ).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    volunteer.status = UserStatus.rejected
    db.commit()
    log_action(db, user, "volunteer.rejected", "user", volunteer_id)
    return {"detail": "Volunteer rejected"}


@hub_router.post("/volunteers/{volunteer_id}/force-logout", status_code=200)
async def force_logout_volunteer(
    volunteer_id: str,
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    """Revoke all refresh tokens for a volunteer (e.g. lost phone)."""
    volunteer = db.query(User).filter(
        User.id == volunteer_id,
        User.hub_id == user.hub_id,
    ).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    db.query(RefreshToken).filter(
        RefreshToken.user_id == volunteer_id,
        RefreshToken.revoked == False,
    ).update({"revoked": True})
    db.commit()
    log_action(db, user, "volunteer.force_logout", "user", volunteer_id)
    return {"detail": "All sessions revoked"}


@hub_router.get("/logistics")
async def get_logistics(
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    """All contacts flagged for transport in this hub."""
    hub_volunteers = db.query(User).filter(User.hub_id == user.hub_id).all()
    vol_ids = [v.id for v in hub_volunteers]

    contacts = db.query(Contact).options(
        joinedload(Contact.logistics)
    ).filter(
        Contact.added_by.in_(vol_ids),
        Contact.needs_transport == True,
    ).all()

    return {"logistics": [
        {
            "contact_id":         str(c.id),
            "contact_name":       c.name,
            "phone":              c.phone,
            "transport_location": c.transport_location,
            "transport_status":   str(c.logistics.transport_status).split(".")[-1] if c.logistics else "pending",
            "coordinator_note":   c.logistics.coordinator_note if c.logistics else None,
            "updated_by":         str(c.logistics.updated_by) if c.logistics and c.logistics.updated_by else None,
        }
        for c in contacts
    ]}


@hub_router.patch("/logistics/{contact_id}", status_code=200)
async def update_logistics(
    contact_id: str,
    body: LogisticsUpdate,
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    logistics = db.query(Logistics).filter(Logistics.contact_id == contact_id).first()
    if not logistics:
        raise HTTPException(status_code=404, detail="Logistics record not found")

    logistics.transport_status = body.transport_status
    logistics.coordinator_note = body.coordinator_note
    logistics.updated_by = user.id
    db.commit()
    log_action(db, user, "logistics.updated", "contact", contact_id)
    return {"detail": "Logistics updated"}




@hub_router.get("/contacts")
async def get_hub_contacts(
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    """All contacts for this hub — BUG-07: single user query for IDs and name map."""
    # BUG-07: one query yields both the ID list and name map (no second query)
    hub_volunteers   = db.query(User).filter(User.hub_id == user.hub_id).all()
    hub_volunteer_ids = [v.id for v in hub_volunteers]
    vol_map           = {v.id: v.name for v in hub_volunteers}

    if not hub_volunteer_ids:
        return {"contacts": [], "total": 0}

    contacts = db.query(Contact).options(
        joinedload(Contact.statuses),
    ).filter(
        Contact.added_by.in_(hub_volunteer_ids),
        Contact.deleted_at.is_(None),
    ).order_by(Contact.created_at.desc()).all()

    return {"contacts": [
        {
            "id":              c.id,
            "name":            c.name,
            "phone":           c.phone,
            "location":        c.location,
            "needs_transport": c.needs_transport,
            "current_status":  c.current_status,
            "created_at":      c.created_at.isoformat(),
            "volunteer_name":  vol_map.get(c.added_by),
        }
        for c in contacts
    ]}


@hub_router.post("/contacts/{contact_id}/reassign", status_code=200)
async def reassign_contact(
    contact_id: str,
    body: ContactReassign,
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    new_volunteer = db.query(User).filter(
        User.id == body.to_volunteer_id,
        User.hub_id == user.hub_id,
    ).first()
    if not new_volunteer:
        raise HTTPException(status_code=404, detail="Target volunteer not found in this hub")

    old_vol = contact.added_by
    contact.added_by = body.to_volunteer_id
    db.commit()
    log_action(db, user, "contact.reassigned", "contact", contact_id,
               metadata={"from": old_vol, "to": body.to_volunteer_id})
    return {"detail": "Contact reassigned"}


@hub_router.get("/stale")
async def stale_contacts(
    hours: int = Query(48, description="Hours threshold for staleness"),
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    hub_vols = db.query(User).filter(User.hub_id == user.hub_id).all()
    vol_ids = [v.id for v in hub_vols]

    contacts = db.query(Contact).options(
        joinedload(Contact.statuses)
    ).filter(Contact.added_by.in_(vol_ids)).all()

    stale = []
    for c in contacts:
        if not c.statuses:
            if c.created_at < cutoff:
                stale.append({"id": c.id, "name": c.name, "location": c.location,
                               "added_by": c.added_by, "created_at": c.created_at.isoformat()})
        else:
            latest = max(s.updated_at for s in c.statuses)
            if latest < cutoff:
                stale.append({"id": c.id, "name": c.name, "location": c.location,
                               "added_by": c.added_by, "last_action": latest.isoformat()})

    return {"stale_contacts": stale, "count": len(stale)}


# ─────────────────────────────────────────────
# MINISTER
# ─────────────────────────────────────────────

@minister_router.get("/volunteers")
async def all_volunteers(
    hub_id: Optional[str] = None,
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(
        User.organisation_id == user.organisation_id,
        User.role == UserRole.volunteer,
    )
    if hub_id:
        query = query.filter(User.hub_id == hub_id)

    volunteers = query.all()
    return {"volunteers": [
        {
            "id": v.id,
            "name": v.name,
            "phone": v.phone,
            "hub_id": v.hub_id,
            "status": v.status,
            "last_active_at": v.last_active_at.isoformat() if v.last_active_at else None,
        }
        for v in volunteers
    ]}


@minister_router.get("/demographics")
async def demographics(
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    """Aggregated demographics — status breakdown, top locations, hub comparison, weekly trend."""
    from sqlalchemy import func
    from collections import defaultdict
    from datetime import date, timedelta as td
    from ..models import Campaign

    campaign = db.query(Campaign).filter(
        Campaign.organisation_id == user.organisation_id,
        Campaign.status == CampaignStatus.active,
    ).first()

    if not campaign:
        return {"locations": [], "status_breakdown": {}, "hub_breakdown": [], "weekly_trend": [], "total_contacts": 0}

    # Location breakdown
    location_counts = db.query(
        Contact.location,
        func.count(Contact.id).label("count")
    ).filter(
        Contact.campaign_id == campaign.id
    ).group_by(Contact.location).order_by(func.count(Contact.id).desc()).limit(20).all()

    # Status breakdown
    all_contacts = db.query(Contact).options(
        joinedload(Contact.statuses)
    ).filter(Contact.campaign_id == campaign.id).all()

    status_counts = {}
    for c in all_contacts:
        if c.statuses:
            s = sorted(c.statuses, key=lambda x: x.updated_at)[-1].status_code
        else:
            s = "no_status"
        status_counts[str(s)] = status_counts.get(str(s), 0) + 1

    total = len(all_contacts)

    # Hub breakdown
    hubs = db.query(Hub).join(Campaign, Hub.campaign_id == Campaign.id).filter(
        Campaign.organisation_id == user.organisation_id,
    ).all()
    hub_ids = [h.id for h in hubs]
    hub_by_id = {h.id: h for h in hubs}

    vol_rows = db.query(
        User.hub_id, func.count(User.id).label("cnt")
    ).filter(
        User.hub_id.in_(hub_ids), User.role == UserRole.volunteer,
    ).group_by(User.hub_id).all()
    vol_count = {r.hub_id: r.cnt for r in vol_rows}

    # contacts per hub via volunteers
    contact_rows = db.query(
        User.hub_id, func.count(Contact.id).label("cnt")
    ).join(Contact, Contact.added_by == User.id).filter(
        User.hub_id.in_(hub_ids),
        Contact.campaign_id == campaign.id,
    ).group_by(User.hub_id).all()
    c_count = {r.hub_id: r.cnt for r in contact_rows}

    confirmed_rows = db.query(
        User.hub_id, func.count(Contact.id).label("cnt")
    ).join(Contact, Contact.added_by == User.id).join(
        ContactStatus, ContactStatus.contact_id == Contact.id
    ).filter(
        User.hub_id.in_(hub_ids),
        Contact.campaign_id == campaign.id,
        ContactStatus.status_code == ContactStatusCode.coming,
    ).group_by(User.hub_id).all()
    conf_count = {r.hub_id: r.cnt for r in confirmed_rows}

    hub_breakdown = []
    for hid in hub_ids:
        h = hub_by_id[hid]
        vc = vol_count.get(hid, 0)
        cc = c_count.get(hid, 0)
        cf = conf_count.get(hid, 0)
        hub_breakdown.append({
            "hub_id":     hid,
            "hub_name":   h.name,
            "volunteers": vc,
            "contacts":   cc,
            "confirmed":  cf,
            "pct":        round(cf / cc * 100, 1) if cc else 0,
        })
    hub_breakdown.sort(key=lambda x: x["contacts"], reverse=True)

    # Weekly trend — contacts added per week for last 8 weeks
    eight_weeks_ago = datetime.now(timezone.utc) - td(weeks=8)
    weekly_contacts = db.query(Contact).filter(
        Contact.campaign_id == campaign.id,
        Contact.created_at >= eight_weeks_ago,
    ).all()
    week_buckets: dict = {}
    for c in weekly_contacts:
        monday = (c.created_at.date() - td(days=c.created_at.weekday()))
        key = monday.isoformat()
        week_buckets[key] = week_buckets.get(key, 0) + 1
    weekly_trend = [{"week": k, "added": v} for k, v in sorted(week_buckets.items())]

    return {
        "locations":       [{"location": loc, "count": cnt} for loc, cnt in location_counts],
        "status_breakdown": {k: {"count": v, "pct": round(v/total*100, 1) if total else 0}
                              for k, v in status_counts.items()},
        "total_contacts":  total,
        "hub_breakdown":   hub_breakdown,
        "weekly_trend":    weekly_trend,
    }


@minister_router.get("/export/confirmed")
async def export_confirmed(
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    """CSV export of confirmed contacts. Streamed — not stored on disk."""
    campaign = db.query(Campaign).filter(
        Campaign.organisation_id == user.organisation_id,
        Campaign.status == CampaignStatus.active,
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="No active campaign")

    contacts = db.query(Contact).options(
        joinedload(Contact.statuses)
    ).filter(Contact.campaign_id == campaign.id).all()

    confirmed = []
    for c in contacts:
        if c.statuses:
            latest = sorted(c.statuses, key=lambda s: s.updated_at)[-1].status_code
            if latest == ContactStatusCode.coming:
                confirmed.append(c)

    log_action(db, user, "export.confirmed", metadata={"count": len(confirmed)})

    def generate():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Name", "Phone", "Location", "Notes", "Transport Needed", "Pickup Location"])
        yield output.getvalue()
        output.truncate(0); output.seek(0)

        for c in confirmed:
            writer.writerow([c.name, c.phone, c.location, c.notes or "",
                             "Yes" if c.needs_transport else "No",
                             c.transport_location or ""])
            yield output.getvalue()
            output.truncate(0); output.seek(0)

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=confirmed_{campaign.id[:8]}.csv"}
    )


@minister_router.get("/export/logistics")
async def export_logistics(
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    """CSV export of transport-flagged contacts."""
    # SEC-07: scoped to active campaign only — no cross-campaign data leak
    campaign = db.query(Campaign).filter(
        Campaign.organisation_id == user.organisation_id,
        Campaign.status          == CampaignStatus.active,
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="No active campaign")

    contacts = db.query(Contact).options(
        joinedload(Contact.logistics)
    ).filter(
        Contact.campaign_id     == campaign.id,
        Contact.needs_transport == True,
    ).all()

    log_action(db, user, "export.logistics", metadata={"count": len(contacts)})

    def generate():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Name", "Phone", "Pickup Location", "Transport Status", "Coordinator Note"])
        yield output.getvalue()
        output.truncate(0); output.seek(0)
        for c in contacts:
            status = c.logistics.transport_status if c.logistics else "pending"
            note = c.logistics.coordinator_note if c.logistics else ""
            writer.writerow([c.name, c.phone, c.transport_location or "", status, note or ""])
            yield output.getvalue()
            output.truncate(0); output.seek(0)

    return StreamingResponse(
        generate(), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=logistics.csv"}
    )


# ─────────────────────────────────────────────
# CAMPAIGNS
# ─────────────────────────────────────────────

@campaign_router.get("")
async def list_campaigns(
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    campaigns = db.query(Campaign).filter(
        Campaign.organisation_id == user.organisation_id
    ).order_by(Campaign.created_at.desc()).all()
    return {"campaigns": [
        {"id": c.id, "name": c.name, "status": c.status,
         "programme_date": c.programme_date.isoformat() if c.programme_date else None,
         "created_at": c.created_at.isoformat()}
        for c in campaigns
    ]}


@campaign_router.post("", status_code=201)
async def create_campaign(
    body: CampaignCreate,
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    campaign = Campaign(
        organisation_id=user.organisation_id,
        name=body.name,
        target_count=body.target_count,
        programme_date=body.programme_date,
        venue=body.venue,
        created_by=user.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    log_action(db, user, "campaign.created", "campaign", campaign.id)
    return {"id": campaign.id, "detail": "Campaign created"}




@campaign_router.patch("/{campaign_id}", status_code=200)
async def update_campaign(
    campaign_id: str,
    body:        CampaignCreate,
    user:        User    = Depends(require_minister),
    db:          Session = Depends(get_db),
):
    """API-10: Edit campaign name, target_count, programme_date, or venue."""
    campaign = db.query(Campaign).filter(
        Campaign.id              == campaign_id,
        Campaign.organisation_id == user.organisation_id,
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status == CampaignStatus.archived:
        raise HTTPException(status_code=400, detail="Archived campaigns cannot be edited")
    if body.name:           campaign.name           = body.name
    if body.target_count:   campaign.target_count   = body.target_count
    if body.programme_date: campaign.programme_date = body.programme_date
    if body.venue:          campaign.venue          = body.venue
    db.commit()
    log_action(db, user, "campaign.updated", "campaign", campaign_id)
    return {"detail": "Campaign updated", "id": campaign.id}
@campaign_router.post("/{campaign_id}/archive", status_code=200)
async def archive_campaign(
    campaign_id: str,
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.organisation_id == user.organisation_id,
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    campaign.status = CampaignStatus.archived
    db.commit()
    log_action(db, user, "campaign.archived", "campaign", campaign_id)
    return {"detail": "Campaign archived"}


# ─────────────────────────────────────────────
# HUB LEADER — Volunteer Detail (drilldown)
# ─────────────────────────────────────────────

@hub_router.get("/volunteers/{volunteer_id}/detail")
async def get_volunteer_detail(
    volunteer_id: str,
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    """Full volunteer profile for hub leader: stats + full contact list."""
    volunteer = db.query(User).filter(
        User.id == volunteer_id,
        User.hub_id == user.hub_id,
    ).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found in your hub")

    contacts = db.query(Contact).options(
        joinedload(Contact.statuses),
        joinedload(Contact.message_sends),
    ).filter(
        Contact.added_by == volunteer_id,
        Contact.deleted_at.is_(None),
    ).all()

    confirmed     = sum(1 for c in contacts if c.current_status == ContactStatusCode.coming)
    messages_sent = sum(len(c.message_sends) for c in contacts)
    pending_calls = sum(
        1 for c in contacts
        if c.current_status in (ContactStatusCode.no_answer, ContactStatusCode.undecided, None)
    )

    hub_obj = None
    if volunteer.hub_id:
        hub_obj = db.query(Hub).filter(Hub.id == volunteer.hub_id).first()

    return {
        "id":             volunteer.id,
        "name":           volunteer.name,
        "phone":          volunteer.phone,
        "email":          volunteer.email,
        "avatar_url":     volunteer.avatar_url,
        "status":         volunteer.status,
        "role":           volunteer.role,
        "hub_id":         volunteer.hub_id,
        "hub_name":       hub_obj.name if hub_obj else None,
        "created_at":     volunteer.created_at.isoformat(),
        "last_active_at": volunteer.last_active_at.isoformat() if volunteer.last_active_at else None,
        "total_contacts": len(contacts),
        "confirmed":      confirmed,
        "messages_sent":  messages_sent,
        "pending_calls":  pending_calls,
        "contacts": [
            {
                "id":              c.id,
                "name":            c.name,
                "location":        c.location,
                "needs_transport": c.needs_transport,
                "current_status":  c.current_status,
                "created_at":      c.created_at.isoformat(),
            }
            for c in contacts
        ],
    }


# ─────────────────────────────────────────────
# MINISTER — Volunteer Detail (org-wide drilldown)
# ─────────────────────────────────────────────

@minister_router.get("/volunteers/{volunteer_id}/detail")
async def get_minister_volunteer_detail(
    volunteer_id: str,
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    """Full volunteer profile for minister: queries across all hubs in the org."""
    volunteer = db.query(User).filter(
        User.id == volunteer_id,
        User.organisation_id == user.organisation_id,
    ).first()
    if not volunteer:
        raise HTTPException(status_code=404, detail="Volunteer not found")

    contacts = db.query(Contact).options(
        joinedload(Contact.statuses),
        joinedload(Contact.message_sends),
    ).filter(
        Contact.added_by == volunteer_id,
        Contact.deleted_at.is_(None),
    ).all()

    confirmed     = sum(1 for c in contacts if c.current_status == ContactStatusCode.coming)
    messages_sent = sum(len(c.message_sends) for c in contacts)
    pending_calls = sum(
        1 for c in contacts
        if c.current_status in (ContactStatusCode.no_answer, ContactStatusCode.undecided, None)
    )

    hub_obj = None
    if volunteer.hub_id:
        hub_obj = db.query(Hub).filter(Hub.id == volunteer.hub_id).first()

    return {
        "id":             volunteer.id,
        "name":           volunteer.name,
        "phone":          volunteer.phone,
        "email":          volunteer.email,
        "avatar_url":     volunteer.avatar_url,
        "status":         volunteer.status,
        "role":           volunteer.role,
        "hub_id":         volunteer.hub_id,
        "hub_name":       hub_obj.name if hub_obj else None,
        "created_at":     volunteer.created_at.isoformat(),
        "last_active_at": volunteer.last_active_at.isoformat() if volunteer.last_active_at else None,
        "total_contacts": len(contacts),
        "confirmed":      confirmed,
        "messages_sent":  messages_sent,
        "pending_calls":  pending_calls,
        "contacts": [
            {
                "id":              c.id,
                "name":            c.name,
                "location":        c.location,
                "current_status":  str(c.current_status) if c.current_status else None,
                "needs_transport": c.needs_transport,
                "created_at":      c.created_at.isoformat(),
            }
            for c in contacts
        ],
    }


# ─────────────────────────────────────────────
# MINISTER — Hub Detail (drilldown)
# ─────────────────────────────────────────────

@minister_router.get("/hubs")
async def list_hubs(
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    """List all hubs with summary stats. batch queries, not N+1."""
    from sqlalchemy import func

    hubs = db.query(Hub).join(Campaign, Hub.campaign_id == Campaign.id).filter(
        Campaign.organisation_id == user.organisation_id
    ).all()

    if not hubs:
        return {"hubs": []}

    hub_ids = [h.id for h in hubs]

    # Batch 1: all hub leaders in one query
    leaders = db.query(User).filter(
        User.hub_id.in_(hub_ids),
        User.role == UserRole.hub_leader,
    ).all()
    leader_by_hub = {l.hub_id: l for l in leaders}

    # Batch 2: volunteer counts per hub
    vol_rows = db.query(
        User.hub_id,
        func.count(User.id).label("cnt"),
    ).filter(
        User.hub_id.in_(hub_ids),
        User.role == UserRole.volunteer,
    ).group_by(User.hub_id).all()
    vol_count = {r.hub_id: r.cnt for r in vol_rows}

    # Batch 3: contact counts per hub
    contact_rows = db.query(
        User.hub_id,
        func.count(Contact.id).label("cnt"),
    ).join(Contact, Contact.added_by == User.id).filter(
        User.hub_id.in_(hub_ids),
    ).group_by(User.hub_id).all()
    contact_count = {r.hub_id: r.cnt for r in contact_rows}

    return {"hubs": [
        {
            "hub_id":          h.id,
            "hub_name":        h.name,
            "hub_zone":        h.zone,
            "leader_name":     leader_by_hub[h.id].name       if h.id in leader_by_hub else None,
            "leader_avatar":   leader_by_hub[h.id].avatar_url if h.id in leader_by_hub else None,
            "volunteer_count": vol_count.get(h.id, 0),
            "contact_count":   contact_count.get(h.id, 0),
        }
        for h in hubs
    ]}


@minister_router.get("/hubs/{hub_id}/detail")
async def get_hub_detail(
    hub_id: str,
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    """Full hub profile: leader info + all volunteers with stats."""
    hub = db.query(Hub).filter(Hub.id == hub_id).first()
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")

    leader = db.query(User).filter(
        User.hub_id == hub_id,
        User.role == UserRole.hub_leader,
    ).first()

    volunteers = db.query(User).filter(
        User.hub_id == hub_id,
        User.role == UserRole.volunteer,
    ).all()

    vol_summaries = []
    total_contacts  = 0
    total_confirmed = 0

    if volunteers:
        from collections import defaultdict
        vol_ids = [v.id for v in volunteers]
        # Single batch query replaces N per-volunteer queries 
        # BUG-08: joinedload statuses — c.current_status accesses .statuses, causing N+1 without this
        all_contacts = db.query(Contact).options(
            joinedload(Contact.statuses),
        ).filter(
            Contact.added_by.in_(vol_ids),
            Contact.deleted_at.is_(None),
        ).all()
        contacts_by_vol = defaultdict(list)
        for contact in all_contacts:
            contacts_by_vol[contact.added_by].append(contact)

        for v in volunteers:
            vol_contacts     = contacts_by_vol[v.id]
            confirmed        = sum(1 for c in vol_contacts if c.current_status == ContactStatusCode.coming)
            total_contacts  += len(vol_contacts)
            total_confirmed += confirmed
            vol_summaries.append({
                "id":             v.id,
                "name":           v.name,
                "avatar_url":     v.avatar_url,
                "status":         v.status,
                "total_contacts": len(vol_contacts),
                "confirmed":      confirmed,
                "last_active_at": v.last_active_at.isoformat() if v.last_active_at else None,
            })

    return {
        "hub_id":         hub.id,
        "hub_name":       hub.name,
        "hub_zone":       hub.zone,
        "leader_id":      leader.id if leader else None,
        "leader_name":    leader.name if leader else None,
        "leader_avatar":  leader.avatar_url if leader else None,
        "leader_phone":   leader.phone if leader else None,
        "total_contacts": total_contacts,
        "confirmed":      total_confirmed,
        "volunteers":     vol_summaries,
    }

