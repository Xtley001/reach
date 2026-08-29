"""
REACH — Call Logging Router (backlog Section F)

POST /contacts/{id}/calls        — log a call attempt (receptivity, optional availability + comment)
GET  /contacts/{id}/calls        — F-73: per-contact call timeline, newest first
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import (
    Contact, CallLog, ReceptivityCode, AvailabilityCode, User,
    Logistics, FollowUpQueue, FollowUpQueueType, FollowUpStatus,
)
from ..schemas import CallLogCreate, CallLogOut
from ..dependencies import get_current_user, verify_contact_ownership, log_action, get_client_ip
from ..limiter import limiter

router = APIRouter(tags=["call-logs"])


def _call_log_out(cl: CallLog) -> CallLogOut:
    return CallLogOut(
        id=cl.id,
        called_by=cl.called_by,
        called_by_name=cl.called_by_user.name if cl.called_by_user else None,
        called_at=cl.called_at,
        receptivity_code=cl.receptivity_code.value if hasattr(cl.receptivity_code, "value") else cl.receptivity_code,
        availability_code=(cl.availability_code.value if cl.availability_code and hasattr(cl.availability_code, "value") else cl.availability_code),
        comment=cl.comment,
        remind_at=cl.remind_at,
    )


@router.post("/contacts/{contact_id}/calls", status_code=201)
@limiter.limit("60/minute")
async def log_call(
    request: Request,
    contact_id: str,
    body: CallLogCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    F-66/67/69/70: one row per call attempt. `availability_code` MUST stay
    null unless receptivity is 'picked_up' — enforced here (and again by the
    DB CHECK constraint chk_call_logs_availability_requires_pickup as a
    belt-and-suspenders backstop) so a bad client can't write nonsensical
    state like "no_answer" + "coming" in the same row.
    """
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=403, detail="Access denied")
    verify_contact_ownership(contact, user, db)

    try:
        receptivity = ReceptivityCode(body.receptivity_code)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid receptivity_code: {body.receptivity_code}")

    availability = None
    if body.availability_code:
        if receptivity != ReceptivityCode.picked_up:
            raise HTTPException(
                status_code=422,
                detail="availability_code can only be set when receptivity_code is 'picked_up'.",
            )
        try:
            availability = AvailabilityCode(body.availability_code)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid availability_code: {body.availability_code}")

    call = CallLog(
        contact_id=contact_id,
        called_by=user.id,
        receptivity_code=receptivity,
        availability_code=availability,
        comment=(body.comment or None),
        # F-76: only meaningful alongside needs_reminder, but we don't hard-block
        # other combinations — a volunteer might set this after the fact.
        remind_at=body.remind_at,
    )
    db.add(call)

    # F-72: needs_bus wires straight into the existing needs_transport /
    # transport_location fields already used by HubLogistics.jsx — not a
    # second, disconnected flag.
    if availability == AvailabilityCode.needs_bus and not contact.needs_transport:
        contact.needs_transport = True
        if not contact.logistics:
            db.add(Logistics(contact_id=contact_id, organisation_id=user.organisation_id))

    # F-71: auto-escalation — after 2 consecutive no_answer logs with no
    # picked_up in between, auto-flag for a different approach. We check the
    # last 2 *prior* rows (not counting the one we're about to add) plus this
    # new one, so "3rd consecutive no_answer" doesn't re-trigger repeatedly.
    db.flush()
    recent = db.query(CallLog).filter(CallLog.contact_id == contact_id) \
        .order_by(CallLog.called_at.desc()).limit(2).all()
    if (
        len(recent) == 2
        and all(r.receptivity_code == ReceptivityCode.no_answer for r in recent)
    ):
        existing_fq = db.query(FollowUpQueue).filter(
            FollowUpQueue.contact_id == contact_id,
            FollowUpQueue.status == FollowUpStatus.pending,
        ).first()
        if not existing_fq:
            # FollowUpQueue's existing schema has no free-text "reason"
            # column — queue_type is the closest existing enum value
            # ("soft_checkin": needs a different, gentler approach than a
            # straight re-dial). campaign_id/organisation_id copied from the
            # contact since the table requires both.
            db.add(FollowUpQueue(
                contact_id=contact_id,
                campaign_id=contact.campaign_id,
                organisation_id=contact.organisation_id,
                queue_type=FollowUpQueueType.soft_checkin,
                status=FollowUpStatus.pending,
            ))
            log_action(db, user, "contact.auto_escalated", "contact", contact_id,
                       get_client_ip(request), metadata={"reason": "2x_no_answer"})

    db.commit()

    log_action(
        db, user, "contact.call_logged", "contact", contact_id, get_client_ip(request),
        metadata={"receptivity": receptivity.value, "availability": availability.value if availability else None},
    )

    return {"detail": "Call logged", "id": call.id}


@router.get("/contacts/{contact_id}/calls")
async def get_call_timeline(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """F-73: full call timeline for a contact, newest first — who called,
    when, receptivity, availability, comment."""
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=403, detail="Access denied")
    verify_contact_ownership(contact, user, db)

    logs = db.query(CallLog).options(joinedload(CallLog.called_by_user)) \
        .filter(CallLog.contact_id == contact_id) \
        .order_by(CallLog.called_at.desc()).all()

    return {"calls": [_call_log_out(cl).model_dump() for cl in logs]}


@router.get("/calls/reminders")
async def get_my_reminders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    F-76: "surfaced back into their own call queue" — due or upcoming
    call-back reminders this volunteer set, newest-due first. Only includes
    reminders on contacts the volunteer still owns (they may have been
    reassigned since).
    """
    from datetime import timedelta

    horizon = datetime.now(timezone.utc) + timedelta(days=14)
    logs = db.query(CallLog).options(joinedload(CallLog.contact)).filter(
        CallLog.called_by == user.id,
        CallLog.remind_at.isnot(None),
        CallLog.remind_at <= horizon,
    ).order_by(CallLog.remind_at.asc()).all()

    return {
        "reminders": [
            {
                "call_id": cl.id,
                "contact_id": cl.contact_id,
                "contact_name": cl.contact.name if cl.contact else None,
                "contact_phone": cl.contact.phone if cl.contact else None,
                "remind_at": cl.remind_at,
                "comment": cl.comment,
            }
            for cl in logs
            if cl.contact and cl.contact.added_by == user.id  # still owned by this volunteer
        ]
    }
