"""
REACH — Dashboard Routers
GET /dashboard/volunteer   — volunteer stats + streak
GET /dashboard/hub         — hub leader summary
GET /dashboard/minister    — campaign-wide stats
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, distinct

from ..database import get_db
from ..models import (
    Contact, ContactStatus, ContactStatusCode, MessageSend,
    User, UserStatus, UserRole, Campaign, CampaignStatus, Hub,
    ContactTag, TagDefinition, CallLog, ReceptivityCode, AvailabilityCode,
)
from ..dependencies import get_current_user, require_hub_leader, require_minister

router = APIRouter(tags=["dashboard"])


def _active_campaign(user: User, db: Session):
    return db.query(Campaign).filter(
        Campaign.organisation_id == user.organisation_id,
        Campaign.status == CampaignStatus.active,
    ).first()


def _latest_statuses(contacts):
    """For a list of Contact ORM objects, get their current status."""
    result = {}
    for c in contacts:
        if c.statuses:
            latest = sorted(c.statuses, key=lambda s: s.updated_at)[-1].status_code
        else:
            latest = None
        result[c.id] = latest
    return result


def _tag_counts(db: Session, organisation_id: str, contact_ids: list) -> dict:
    """B-26: per-tag counts for the minister/hub-leader dashboards.

    Two small, clean numbers per tag instead of forcing the reader to page
    through individual contacts to see how many were e.g. `healed` this
    week.
    """
    if not contact_ids:
        return {}
    defs = db.query(TagDefinition).filter(
        TagDefinition.organisation_id == organisation_id,
        TagDefinition.is_active == True,  # noqa: E712
    ).order_by(TagDefinition.sort_order).all()

    rows = db.query(ContactTag.tag_code, func.count(ContactTag.id)).filter(
        ContactTag.contact_id.in_(contact_ids)
    ).group_by(ContactTag.tag_code).all()
    counts_by_code = {code: count for code, count in rows}

    # Always return every active tag, even at 0, so the dashboard chart has a
    # stable set of bars rather than ones that appear/disappear as counts hit zero.
    return {d.code: {"label": d.label, "count": counts_by_code.get(d.code, 0)} for d in defs}


def _call_rollups(db: Session, contact_ids: list, since=None) -> dict:
    """F-74: two small, clean rollups — receptivity and availability counts
    — instead of one messy 8-category chart the old ContactStatusCode
    system would have produced.
    """
    empty = {
        "receptivity": {c.value: 0 for c in ReceptivityCode},
        "availability": {c.value: 0 for c in AvailabilityCode},
        "total_calls": 0,
    }
    if not contact_ids:
        return empty

    q = db.query(CallLog).filter(CallLog.contact_id.in_(contact_ids))
    if since:
        q = q.filter(CallLog.called_at >= since)
    logs = q.all()

    for log in logs:
        code = log.receptivity_code.value if hasattr(log.receptivity_code, "value") else log.receptivity_code
        empty["receptivity"][code] = empty["receptivity"].get(code, 0) + 1
        if log.availability_code:
            a_code = log.availability_code.value if hasattr(log.availability_code, "value") else log.availability_code
            empty["availability"][a_code] = empty["availability"].get(a_code, 0) + 1

    empty["total_calls"] = len(logs)
    return empty


# ─── Volunteer Dashboard ──────────────────────────────────────────────────────

@router.get("/dashboard/volunteer")
async def volunteer_dashboard(
    request: Request,
    user:    User    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    if not campaign:
        return {
            "total_contacts": 0, "confirmed": 0, "awaiting": 0,
            "unreached": 0, "needs_call": 0, "streak_days": 0, "last_active": None
        }

    from sqlalchemy.orm import joinedload
    contacts = db.query(Contact).options(
        joinedload(Contact.statuses),
        joinedload(Contact.message_sends),
    ).filter(
        Contact.added_by == user.id,
        Contact.campaign_id == campaign.id,
    ).all()

    statuses = _latest_statuses(contacts)

    total = len(contacts)
    confirmed = sum(1 for s in statuses.values() if s == ContactStatusCode.coming)
    awaiting = sum(1 for s in statuses.values() if s == ContactStatusCode.message_sent)
    unreached = sum(1 for s in statuses.values() if s in (None, ContactStatusCode.no_answer))
    needs_call = sum(1 for s in statuses.values() if s in (
        ContactStatusCode.no_answer, ContactStatusCode.message_sent, ContactStatusCode.undecided
    ))

    # Streak: consecutive days with ≥1 action
    streak = _calculate_streak(user.id, db)

    return {
        "total_contacts": total,
        "confirmed": confirmed,
        "awaiting": awaiting,
        "unreached": unreached,
        "needs_call": needs_call,
        "streak_days": streak,
        "last_active": user.last_active_at.isoformat() if user.last_active_at else None,
    }


def _calculate_streak(user_id: str, db: Session) -> int:
    """Count consecutive days with at least one contact action.
    Uses WAT (UTC+1) so midnight in Nigeria doesn't break streaks.
    """
    from ..models import ContactStatus as CS
    WAT = timezone(timedelta(hours=1))
    # Get distinct dates in WAT by shifting updated_at by +1h before truncating
    rows = db.query(
        func.date(CS.updated_at + timedelta(hours=1)).label("day")
    ).filter(
        CS.updated_by == user_id
    ).distinct().order_by(func.date(CS.updated_at + timedelta(hours=1)).desc()).all()

    if not rows:
        return 0

    today = datetime.now(WAT).date()
    streak = 0
    expected = today

    for row in rows:
        day = row.day
        if day == expected:
            streak += 1
            expected = expected - timedelta(days=1)
        elif day < expected:
            break

    return streak


# ─── Hub Leader Dashboard ─────────────────────────────────────────────────────

@router.get("/dashboard/hub")
async def hub_dashboard(
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    hub = db.query(Hub).filter(Hub.id == user.hub_id).first()
    hub_name = hub.name if hub else "Your Hub"

    # Volunteers in this hub
    hub_volunteers = db.query(User).filter(
        User.hub_id == user.hub_id,
        User.status == UserStatus.active,
    ).all()

    volunteer_ids = [v.id for v in hub_volunteers]

    pending_approvals = db.query(User).filter(
        User.hub_id == user.hub_id,
        User.status == UserStatus.pending,
    ).count()

    if not campaign or not volunteer_ids:
        return {
            "hub_name": hub_name, "total_contacts": 0, "confirmed": 0,
            "messages_sent": 0, "active_volunteers": 0,
            "pending_approvals": pending_approvals, "stale_contacts": 0,
            "tag_counts": {}, "call_rollups": _call_rollups(db, []),
        }

    from sqlalchemy.orm import joinedload
    contacts = db.query(Contact).options(
        joinedload(Contact.statuses),
        joinedload(Contact.message_sends),
    ).filter(
        Contact.added_by.in_(volunteer_ids),
        Contact.campaign_id == campaign.id,
    ).all()

    statuses = _latest_statuses(contacts)

    total = len(contacts)
    confirmed = sum(1 for s in statuses.values() if s == ContactStatusCode.coming)
    messages_sent = db.query(MessageSend).filter(
        MessageSend.sent_by.in_(volunteer_ids)
    ).count()

    # Active today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)
    active_today = db.query(User).filter(
        User.id.in_(volunteer_ids),
        User.last_active_at >= today_start,
    ).count()

    # Stale: contacts untouched > 48 hours (dialect-agnostic query — avoids SQLite syntax errors)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=48)
    if volunteer_ids:
        latest_status_subq = (
            db.query(
                ContactStatus.contact_id,
                func.max(ContactStatus.updated_at).label("last_update")
            )
            .group_by(ContactStatus.contact_id)
            .subquery()
        )
        stale = (
            db.query(func.count(Contact.id))
            .outerjoin(latest_status_subq, latest_status_subq.c.contact_id == Contact.id)
            .filter(
                Contact.added_by.in_(volunteer_ids),
                Contact.campaign_id == campaign.id,
                Contact.deleted_at.is_(None),
                func.coalesce(latest_status_subq.c.last_update, Contact.created_at) < cutoff,
            )
            .scalar()
        ) or 0
    else:
        stale = 0

    return {
        "hub_name": hub_name,
        "total_contacts": total,
        "confirmed": confirmed,
        "messages_sent": messages_sent,
        "active_volunteers": active_today,
        "pending_approvals": pending_approvals,
        "stale_contacts": stale,
        # B-26/F-74: per-tag counts + call receptivity/availability rollups
        # for this hub's contacts this week.
        "tag_counts": _tag_counts(db, user.organisation_id, [c.id for c in contacts]),
        "call_rollups": _call_rollups(
            db, [c.id for c in contacts],
            since=datetime.now(timezone.utc) - timedelta(days=7),
        ),
    }


# ─── Minister Dashboard ───────────────────────────────────────────────────────

@router.get("/dashboard/minister")
async def minister_dashboard(
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    if not campaign:
        return {"campaign_name": "No active campaign", "total_contacts": 0, "tag_counts": {}, "call_rollups": _call_rollups(db, [])}

    from sqlalchemy.orm import joinedload
    contacts = db.query(Contact).options(
        joinedload(Contact.statuses),
    ).filter(
        Contact.campaign_id == campaign.id,
        Contact.organisation_id == user.organisation_id,
    ).all()

    statuses = _latest_statuses(contacts)
    total = len(contacts)
    confirmed = sum(1 for s in statuses.values() if s == ContactStatusCode.coming)
    messages_sent = db.query(MessageSend).join(
        Contact, MessageSend.contact_id == Contact.id
    ).filter(
        Contact.campaign_id == campaign.id
    ).count()
    unreached = sum(1 for s in statuses.values() if s is None)

    total_volunteers = db.query(User).filter(
        User.organisation_id == user.organisation_id,
        User.status == UserStatus.active,
    ).count()

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)
    active_today = db.query(User).filter(
        User.organisation_id == user.organisation_id,
        User.status == UserStatus.active,
        User.last_active_at >= today_start,
    ).count()

    progress = None
    if campaign.target_count and campaign.target_count > 0:
        progress = round(confirmed / campaign.target_count * 100, 1)

    return {
        "campaign_name": campaign.name,
        "total_contacts": total,
        "confirmed": confirmed,
        "messages_sent": messages_sent,
        "unreached": unreached,
        "active_volunteers_today": active_today,
        "total_volunteers": total_volunteers,
        "target_count": campaign.target_count,
        "progress_pct": progress,
        "programme_date": campaign.programme_date.isoformat() if campaign.programme_date else None,
        "venue": campaign.venue,
        # B-26/F-74: per-tag counts + call rollups across the whole campaign.
        "tag_counts": _tag_counts(db, user.organisation_id, [c.id for c in contacts]),
        "call_rollups": _call_rollups(
            db, [c.id for c in contacts],
            since=datetime.now(timezone.utc) - timedelta(days=7),
        ),
    }

