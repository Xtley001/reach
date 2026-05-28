"""
REACH — Decisions Router

POST   /decisions          Decisions Team — single entry
POST   /decisions/bulk     Decisions Team — bulk paper forms
GET    /decisions          Hub leader / Minister — list decisions
GET    /decisions/{id}     Hub leader / Minister — decision detail
GET    /decisions/export   Minister — CSV export
"""
import io
import csv
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import (
    Decision, Campaign, CampaignStatus, User, UserRole, ExportLog, Contact
)
from ..schemas import validate_phone
from ..dependencies import (
    get_current_user, require_minister, require_hub_leader,
    log_action, get_client_ip
)

router = APIRouter(tags=["decisions"])

DECISION_TYPES = {"salvation", "rededication", "holy_spirit", "healing", "prayer", "other"}


def _require_decisions_team(user: User = Depends(get_current_user)):
    allowed = {UserRole.decisions_team, UserRole.minister, UserRole.hub_leader}
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Decisions Team access required.")
    return user


def _active_campaign(user: User, db: Session) -> Campaign:
    c = db.query(Campaign).filter(
        Campaign.organisation_id == user.organisation_id,
        Campaign.status == CampaignStatus.active,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="No active campaign.")
    return c


# ─── Decision Entry Schema ────────────────────────────────────────────────────

class DecisionEntry(BaseModel):
    # Identity
    name:             str
    phone_1:          str
    phone_2:          Optional[str] = None
    whatsapp_number:  Optional[str] = None
    email:            Optional[str] = None
    area:             Optional[str] = None
    nearest_landmark: Optional[str] = None

    # Decision
    decision_type:          str
    decision_type_other:    Optional[str] = None
    first_time:             Optional[bool] = None
    currently_attending:    Optional[str]  = None
    current_church:         Optional[str]  = None
    wants_church_referral:  Optional[bool] = None
    referral_area:          Optional[str]  = None

    # Background
    age_range:        Optional[str] = None
    gender:           Optional[str] = None
    occupation:       Optional[str] = None
    how_did_you_hear: Optional[str] = None
    brought_by:       Optional[str] = None
    notes:            Optional[str] = None

    source: str = "real_time"

    @field_validator("phone_1")
    @classmethod
    def phone_e164(cls, v):
        return validate_phone(v)

    @field_validator("decision_type")
    @classmethod
    def valid_type(cls, v):
        if v not in DECISION_TYPES:
            raise ValueError(f"decision_type must be one of {DECISION_TYPES}")
        return v

    @field_validator("currently_attending")
    @classmethod
    def valid_attending(cls, v):
        # P1-2.3: Enforce lowercase constraint values — prevent DB CHECK violation
        if v is None:
            return v
        v = v.lower().strip()
        if v not in ("yes", "no", "used_to", ""):
            raise ValueError("currently_attending must be yes, no, or used_to")
        return v or None


# ─── Create Decision ──────────────────────────────────────────────────────────

@router.post("/decisions", status_code=201)
async def create_decision(
    body: DecisionEntry,
    request: Request,
    user: User = Depends(_require_decisions_team),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)

    d = Decision(
        campaign_id=campaign.id,
        organisation_id=user.organisation_id,
        counsellor_id=user.id,
        source=body.source,
        name=body.name,
        phone_1=body.phone_1,
        phone_2=body.phone_2,
        whatsapp_number=body.whatsapp_number,
        email=body.email,
        area=body.area,
        nearest_landmark=body.nearest_landmark,
        decision_type=body.decision_type,
        decision_type_other=body.decision_type_other,
        first_time=body.first_time,
        currently_attending=body.currently_attending,
        current_church=body.current_church,
        wants_church_referral=body.wants_church_referral,
        referral_area=body.referral_area,
        age_range=body.age_range,
        gender=body.gender,
        occupation=body.occupation,
        how_did_you_hear=body.how_did_you_hear,
        brought_by=body.brought_by,
        notes=body.notes,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    log_action(db, user, "decision.created", entity_type="decision",
               entity_id=d.id, ip_address=get_client_ip(request))
    return {"id": d.id, "name": d.name, "decision_type": d.decision_type}


# ─── Bulk Decisions ───────────────────────────────────────────────────────────

class BulkDecisionBody(BaseModel):
    records: List[DecisionEntry]


@router.post("/decisions/bulk", status_code=201)
async def bulk_decisions(
    body: BulkDecisionBody,
    request: Request,
    user: User = Depends(_require_decisions_team),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    created = 0
    for rec in body.records:
        d = Decision(
            campaign_id=campaign.id,
            organisation_id=user.organisation_id,
            counsellor_id=user.id,
            source="paper_form",
            name=rec.name,
            phone_1=rec.phone_1,
            phone_2=rec.phone_2,
            whatsapp_number=rec.whatsapp_number,
            email=rec.email,
            area=rec.area,
            nearest_landmark=rec.nearest_landmark,
            decision_type=rec.decision_type,
            decision_type_other=rec.decision_type_other,
            first_time=rec.first_time,
            currently_attending=rec.currently_attending,
            current_church=rec.current_church,
            wants_church_referral=rec.wants_church_referral,
            referral_area=rec.referral_area,
            age_range=rec.age_range,
            gender=rec.gender,
            occupation=rec.occupation,
            how_did_you_hear=rec.how_did_you_hear,
            brought_by=rec.brought_by,
            notes=rec.notes,
        )
        db.add(d)
        created += 1
    db.commit()
    return {"created": created}


# ─── List Decisions ───────────────────────────────────────────────────────────

@router.get("/decisions")
async def list_decisions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in {UserRole.minister, UserRole.hub_leader, UserRole.decisions_team}:
        raise HTTPException(status_code=403, detail="Access denied.")

    campaign = _active_campaign(user, db)

    q = db.query(Decision).options(
        joinedload(Decision.counsellor)
    ).filter(Decision.campaign_id == campaign.id)

    decisions = q.order_by(Decision.created_at.desc()).all()
    return {"decisions": [
        {
            "id":            d.id,
            "name":          d.name,
            "phone_1":       d.phone_1,
            "decision_type": d.decision_type,
            "first_time":    d.first_time,
            "counsellor":    d.counsellor.name if d.counsellor else None,
            "created_at":    d.created_at.isoformat(),
            "source":        d.source,
        }
        for d in decisions
    ]}


# ─── Decision Detail ──────────────────────────────────────────────────────────

@router.get("/decisions/export/csv")
async def export_decisions(
    request: Request,
    user: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    decisions = db.query(Decision).options(
        joinedload(Decision.counsellor)
    ).filter(Decision.campaign_id == campaign.id).order_by(Decision.created_at).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    headers = [
        "Name","Phone 1","Phone 2","WhatsApp","Email","Area","Nearest Landmark",
        "Decision Type","First Time","Currently Attending Church","Church Name",
        "Wants Church Connection","Preferred Area",
        "Age Range","Gender","Occupation","How Did You Hear","Brought By",
        "Counsellor","Date","Source","Notes",
    ]
    writer.writerow(headers)

    DECISION_LABELS = {
        "salvation": "Gave Their Life",
        "rededication": "Rededicated",
        "holy_spirit": "Received the Holy Spirit",
        "healing": "Healing / Testimony",
        "prayer": "Prayer / Counselling",
        "other": "Other",
    }

    for d in decisions:
        dt_label = DECISION_LABELS.get(d.decision_type, d.decision_type)
        if d.decision_type == "other" and d.decision_type_other:
            dt_label = f"Other: {d.decision_type_other}"
        writer.writerow([
            d.name, d.phone_1, d.phone_2 or "", d.whatsapp_number or "",
            d.email or "", d.area or "", d.nearest_landmark or "",
            dt_label,
            "Yes" if d.first_time else ("No" if d.first_time is False else ""),
            d.currently_attending or "", d.current_church or "",
            "Yes" if d.wants_church_referral else ("No" if d.wants_church_referral is False else ""),
            d.referral_area or "",
            d.age_range or "", d.gender or "", d.occupation or "",
            d.how_did_you_hear or "", d.brought_by or "",
            d.counsellor.name if d.counsellor else "",
            d.created_at.strftime("%d/%m/%Y %H:%M"),
            d.source, d.notes or "",
        ])

    # Log export
    exp = ExportLog(
        organisation_id=user.organisation_id,
        exported_by=user.id,
        export_type="decisions",
        row_count=len(decisions),
    )
    db.add(exp)
    db.commit()

    buf.seek(0)
    filename = f"REACH_Decisions_{campaign.name.replace(' ','_')}_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@router.get("/decisions/{decision_id}")
async def get_decision(
    decision_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role not in {UserRole.minister, UserRole.hub_leader, UserRole.decisions_team}:
        raise HTTPException(status_code=403, detail="Access denied.")

    d = db.query(Decision).options(
        joinedload(Decision.counsellor)
    ).filter(Decision.id == decision_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Decision not found.")

    return {
        "id": d.id, "name": d.name, "phone_1": d.phone_1, "phone_2": d.phone_2,
        "whatsapp_number": d.whatsapp_number, "email": d.email,
        "area": d.area, "nearest_landmark": d.nearest_landmark,
        "decision_type": d.decision_type, "decision_type_other": d.decision_type_other,
        "first_time": d.first_time, "currently_attending": d.currently_attending,
        "current_church": d.current_church, "wants_church_referral": d.wants_church_referral,
        "referral_area": d.referral_area,
        "age_range": d.age_range, "gender": d.gender, "occupation": d.occupation,
        "how_did_you_hear": d.how_did_you_hear, "brought_by": d.brought_by, "notes": d.notes,
        "counsellor": d.counsellor.name if d.counsellor else None,
        "created_at": d.created_at.isoformat(), "source": d.source,
    }


# ─── Export Decisions ─────────────────────────────────────────────────────────
