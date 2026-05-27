"""
REACH — Templates Router
GET  /templates/active   — up to 3 active templates for current campaign
POST /templates          — hub leader creates template
PATCH /templates/:id     — hub leader edits template
DELETE /templates/:id    — hub leader deletes template
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import MessageTemplate, Campaign, CampaignStatus, User
from ..schemas import TemplateCreate, TemplateOut
from ..dependencies import get_current_user, require_hub_leader, log_action

router = APIRouter(tags=["templates"])

MAX_ACTIVE_TEMPLATES = 3


def _active_campaign(user: User, db: Session) -> Campaign:
    c = db.query(Campaign).filter(
        Campaign.organisation_id == user.organisation_id,
        Campaign.status == CampaignStatus.active,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="No active campaign")
    return c


@router.get("/templates/active")
async def get_active_templates(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    now = datetime.now(timezone.utc)
    templates = db.query(MessageTemplate).filter(
        MessageTemplate.campaign_id == campaign.id,
        MessageTemplate.is_active == True,
    ).order_by(MessageTemplate.created_at.asc()).limit(MAX_ACTIVE_TEMPLATES).all()

    result = []
    for t in templates:
        is_expired = t.expires_at is not None and t.expires_at < now
        result.append({
            "id": t.id,
            "label": t.label,
            "body": t.body,
            "is_active": t.is_active,
            "is_expired": is_expired,
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,
            "created_at": t.created_at.isoformat(),
        })

    return {"templates": result}


@router.post("/templates", status_code=201)
async def create_template(
    body: TemplateCreate,
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)

    # Enforce max 3 active
    active_count = db.query(MessageTemplate).filter(
        MessageTemplate.campaign_id == campaign.id,
        MessageTemplate.is_active == True,
    ).count()

    if active_count >= MAX_ACTIVE_TEMPLATES:
        raise HTTPException(status_code=400, detail="Maximum 3 active templates per campaign")

    template = MessageTemplate(
        campaign_id=campaign.id,
        organisation_id=user.organisation_id,
        label=body.label,
        body=body.body,
        created_by=user.id,
        expires_at=body.expires_at,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    log_action(db, user, "template.created", "template", template.id)
    return {"id": template.id, "detail": "Template created"}


@router.patch("/templates/{template_id}")
async def edit_template(
    template_id: str,
    body: TemplateCreate,
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    t = db.query(MessageTemplate).filter(
        MessageTemplate.id == template_id,
        MessageTemplate.organisation_id == user.organisation_id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    t.label = body.label
    t.body = body.body
    if body.expires_at:
        t.expires_at = body.expires_at
    db.commit()

    log_action(db, user, "template.edited", "template", template_id)
    return {"detail": "Template updated"}


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    user: User = Depends(require_hub_leader),
    db: Session = Depends(get_db),
):
    t = db.query(MessageTemplate).filter(
        MessageTemplate.id == template_id,
        MessageTemplate.organisation_id == user.organisation_id,
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    # SEC-06: soft delete preserves FK integrity with message_sends
    t.is_active = False
    db.commit()
    log_action(db, user, "template.deleted", "template", template_id)
    return None
