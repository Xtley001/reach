"""
REACH — Attendance Router

POST   /attendance/check-in          Registration Team — check in a contact
POST   /attendance/walk-in           Registration Team — register walk-in
GET    /attendance/status            Hub leader / Minister — live counts
GET    /attendance/contacts          Registration Team — full contacts list
POST   /attendance/bulk              Registration Team — bulk paper forms
PATCH  /campaigns/{id}/attendance    Minister — open / close attendance mode
"""
import io
import csv
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

from ..database import get_db
from ..models import (
    Contact, ContactStatus, ContactStatusCode,
    Attendance, Campaign, CampaignStatus, User, UserRole, Organisation
)
from ..schemas import validate_phone
from ..dependencies import get_current_user, require_minister, log_action, get_client_ip

router = APIRouter(tags=["attendance"])


def _require_registration_team(user: User = Depends(get_current_user)):
    allowed = {UserRole.registration_team, UserRole.minister, UserRole.hub_leader}
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Registration Team access required.")
    return user


def _active_campaign(user: User, db: Session) -> Campaign:
    c = db.query(Campaign).filter(
        Campaign.organisation_id == user.organisation_id,
        Campaign.status == CampaignStatus.active,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="No active campaign.")
    return c


# ─── Check In ─────────────────────────────────────────────────────────────────

class CheckInBody(BaseModel):
    contact_id: str


@router.post("/attendance/check-in", status_code=201)
async def check_in_contact(
    body: CheckInBody,
    request: Request,
    user: User = Depends(_require_registration_team),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)

    contact = db.query(Contact).filter(
        Contact.id == body.contact_id,
        Contact.campaign_id == campaign.id,
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    # Idempotent: already checked in
    if contact.attended:
        return {"already_checked_in": True, "checked_in_at": contact.attended_at}

    now = datetime.now(timezone.utc)
    contact.attended    = True
    contact.attended_at = now

    att = Attendance(
        campaign_id=campaign.id,
        contact_id=contact.id,
        organisation_id=user.organisation_id,
        checked_in_by=user.id,
        checked_in_at=now,
        is_walk_in=False,
        source="gate_search",
    )
    db.add(att)
    db.commit()
    log_action(db, user, "attendance.check_in", entity_type="contact",
               entity_id=body.contact_id, ip_address=get_client_ip(request))
    return {"checked_in": True, "checked_in_at": now, "contact_name": contact.name}


# ─── Walk-In Registration ──────────────────────────────────────────────────────

class WalkInBody(BaseModel):
    name:             str
    phone:            str
    area:             str
    how_did_you_hear: str
    email:            Optional[str] = None
    notes:            Optional[str] = None

    @field_validator("phone")
    @classmethod
    def phone_e164(cls, v):
        return validate_phone(v)


@router.post("/attendance/walk-in", status_code=201)
async def register_walk_in(
    body: WalkInBody,
    request: Request,
    user: User = Depends(_require_registration_team),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    now = datetime.now(timezone.utc)

    # Duplicate phone check
    existing = db.query(Contact).filter(
        Contact.phone == body.phone,
        Contact.campaign_id == campaign.id,
    ).first()

    if existing:
        # Mark existing as attended
        existing.attended    = True
        existing.attended_at = now
        att = Attendance(
            campaign_id=campaign.id,
            contact_id=existing.id,
            organisation_id=user.organisation_id,
            checked_in_by=user.id,
            checked_in_at=now,
            is_walk_in=True,
            source="walk-in",
            how_did_you_hear=body.how_did_you_hear,
            notes=body.notes,
        )
        db.add(att)
        db.commit()
        return {
            "duplicate": True,
            "contact_id": existing.id,
            "contact_name": existing.name,
            "checked_in": True,
        }

    contact = Contact(
        campaign_id=campaign.id,
        added_by=user.id,
        organisation_id=user.organisation_id,
        name=body.name,
        phone=body.phone,
        location=body.area,
        email=body.email,
        notes=body.notes,
        source="walk-in",
        how_did_you_hear=body.how_did_you_hear,
        attended=True,
        attended_at=now,
    )
    db.add(contact)
    try:
        db.flush()
    except IntegrityError:
        # P1-2.5: Double-tap / race condition — phone already exists
        db.rollback()
        existing = db.query(Contact).filter(
            Contact.phone == body.phone,
            Contact.campaign_id == campaign.id,
        ).first()
        if existing:
            existing.attended = True
            existing.attended_at = now
            db.commit()
            return {"duplicate": True, "contact_id": existing.id, "contact_name": existing.name, "checked_in": True}
        raise HTTPException(status_code=409, detail="Contact with this phone already exists.")

    att = Attendance(
        campaign_id=campaign.id,
        contact_id=contact.id,
        organisation_id=user.organisation_id,
        checked_in_by=user.id,
        checked_in_at=now,
        is_walk_in=True,
        source="walk-in",
        how_did_you_hear=body.how_did_you_hear,
        notes=body.notes,
    )
    db.add(att)
    db.commit()

    log_action(db, user, "attendance.walk_in", entity_type="contact",
               entity_id=contact.id, ip_address=get_client_ip(request))
    return {"duplicate": False, "contact_id": contact.id, "checked_in": True}


# ─── Live Status ──────────────────────────────────────────────────────────────

@router.get("/attendance/status")
async def attendance_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in {UserRole.minister, UserRole.hub_leader, UserRole.registration_team}:
        raise HTTPException(status_code=403, detail="Access denied.")

    campaign = _active_campaign(user, db)

    total    = db.query(Contact).filter(Contact.campaign_id == campaign.id, Contact.deleted_at.is_(None)).count()
    attended = db.query(Contact).filter(Contact.campaign_id == campaign.id, Contact.attended == True).count()
    walk_ins = db.query(Attendance).filter(
        Attendance.campaign_id == campaign.id, Attendance.is_walk_in == True
    ).count()

    not_arrived_contacts = db.query(Contact).filter(
        Contact.campaign_id == campaign.id,
        Contact.attended == False,
        Contact.deleted_at.is_(None),
    ).all()
    not_arrived = [{"id": c.id, "name": c.name, "location": c.location} for c in not_arrived_contacts[:100]]

    return {
        "attendance_mode_open": campaign.attendance_mode_open,
        "total_pre_logged":     total,
        "checked_in":           attended,
        "walk_ins":             walk_ins,
        "not_yet_arrived":      len(not_arrived_contacts),
        "not_arrived_sample":   not_arrived,
    }


# ─── Contacts List for Gate Cache ─────────────────────────────────────────────

@router.get("/attendance/contacts")
async def attendance_contacts(
    user: User = Depends(_require_registration_team),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    contacts = db.query(Contact).options(
        joinedload(Contact.statuses)
    ).filter(
        Contact.campaign_id == campaign.id,
        Contact.deleted_at.is_(None),
    ).all()

    result = []
    for c in contacts:
        latest_status = None
        if c.statuses:
            latest_status = sorted(c.statuses, key=lambda s: s.updated_at)[-1].status_code
        result.append({
            "id":            c.id,
            "name":          c.name,
            "location":      c.location,
            "phone_last4":   c.phone[-4:] if c.phone else "",
            "current_status": str(latest_status).split(".")[-1] if latest_status else None,
            "attended":      c.attended,
            "attended_at":   c.attended_at.isoformat() if c.attended_at else None,
            "volunteer_id":  c.added_by,
        })
    return {"contacts": result, "total": len(result)}


# ─── Bulk Upload ──────────────────────────────────────────────────────────────

class BulkAttendRecord(BaseModel):
    name:             str
    phone:            str
    area:             str
    how_did_you_hear: Optional[str] = None
    email:            Optional[str] = None
    notes:            Optional[str] = None

    @field_validator("phone")
    @classmethod
    def phone_e164(cls, v):
        return validate_phone(v)


class BulkAttendBody(BaseModel):
    records: List[BulkAttendRecord]


@router.post("/attendance/bulk", status_code=201)
async def bulk_attendance(
    body: BulkAttendBody,
    request: Request,
    user: User = Depends(_require_registration_team),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    now = datetime.now(timezone.utc)
    created = 0
    duplicates = 0

    for rec in body.records:
        existing = db.query(Contact).filter(
            Contact.phone == rec.phone,
            Contact.campaign_id == campaign.id,
        ).first()
        if existing:
            existing.attended    = True
            existing.attended_at = now
            duplicates += 1
        else:
            c = Contact(
                campaign_id=campaign.id,
                added_by=user.id,
                organisation_id=user.organisation_id,
                name=rec.name,
                phone=rec.phone,
                location=rec.area,
                email=rec.email,
                notes=rec.notes,
                source="paper_form",
                how_did_you_hear=rec.how_did_you_hear,
                attended=True,
                attended_at=now,
            )
            db.add(c)
            db.flush()
            att = Attendance(
                campaign_id=campaign.id,
                contact_id=c.id,
                organisation_id=user.organisation_id,
                checked_in_by=user.id,
                checked_in_at=now,
                is_walk_in=True,
                source="paper_form",
            )
            db.add(att)
            created += 1

    db.commit()
    return {"created": created, "duplicates": duplicates}


# ─── Open / Close Attendance Mode ─────────────────────────────────────────────

class AttendanceModeBody(BaseModel):
    open: bool


@router.patch("/campaigns/{campaign_id}/attendance")
async def set_attendance_mode(
    campaign_id: str,
    body: AttendanceModeBody,
    request: Request,
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.organisation_id == user.organisation_id,
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    now = datetime.now(timezone.utc)
    campaign.attendance_mode_open = body.open
    if body.open:
        campaign.attendance_opened_at = now
    else:
        campaign.attendance_closed_at = now
    db.commit()
    action = "attendance.opened" if body.open else "attendance.closed"
    log_action(db, user, action, entity_type="campaign", entity_id=campaign_id,
               ip_address=get_client_ip(request))
    return {"attendance_mode_open": body.open}


# P1-3.3: Undo check-in — called within 10-second undo window from AttendLayout
@router.post("/attendance/undo-check-in", status_code=200)
async def undo_check_in(
    body: CheckInBody,
    request: Request,
    user: User = Depends(_require_registration_team),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)

    contact = db.query(Contact).filter(
        Contact.id == body.contact_id,
        Contact.campaign_id == campaign.id,
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    contact.attended    = False
    contact.attended_at = None

    # Remove the most recent attendance record for this contact
    from sqlalchemy import delete
    db.query(Attendance).filter(
        Attendance.contact_id == contact.id,
        Attendance.campaign_id == campaign.id,
    ).order_by(Attendance.checked_in_at.desc()).limit(1).delete(synchronize_session=False)

    db.commit()
    log_action(db, user, "attendance.undo", entity_type="contact",
               entity_id=body.contact_id, ip_address=get_client_ip(request))
    db.commit()
    return {"undone": True, "contact_name": contact.name}
