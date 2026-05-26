"""
REACH — Contacts Router
POST   /contacts              — add single contact
POST   /contacts/bulk         — add up to 10 contacts
GET    /contacts              — list volunteer's contacts (no phone in response)
GET    /contacts/:id          — full contact detail with phone (ownership enforced)
PATCH  /contacts/:id/status   — update status
DELETE /contacts/:id          — hard delete with audit log
GET    /contacts/to-call      — call queue sorted by priority
POST   /contacts/sync         — offline sync batch
POST   /message-sends         — log a WhatsApp send
"""
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_

from ..database import get_db
from ..models import (
    Contact, ContactStatus, ContactStatusCode, MessageSend,
    MessageTemplate, Logistics, User, UserRole, Campaign, CampaignStatus
)
from ..schemas import (
    ContactCreate, ContactBulkCreate, ContactSyncBatch,
    ContactListItem, ContactDetail, StatusUpdate,
    MessageSendLog, ContactSyncResult
)
from ..dependencies import (
    get_current_user, require_hub_leader,
    verify_contact_ownership, log_action, get_client_ip
)

router = APIRouter(tags=["contacts"])


def _active_campaign(user: User, db: Session) -> Campaign:
    """Get the active campaign for the user's organisation."""
    campaign = db.query(Campaign).filter(
        Campaign.organisation_id == user.organisation_id,
        Campaign.status == CampaignStatus.active,
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="No active campaign found")
    return campaign


def _contact_list_item(contact: Contact, db: Session) -> ContactListItem:
    """Build a ContactListItem from a Contact ORM object."""
    latest_status = None
    if contact.statuses:
        latest_status = sorted(contact.statuses, key=lambda s: s.updated_at)[-1].status_code

    send_count = len(contact.message_sends)

    return ContactListItem(
        id=contact.id,
        name=contact.name,
        location=contact.location,
        needs_transport=contact.needs_transport,
        current_status=latest_status,
        message_sent_count=send_count,
        created_at=contact.created_at,
    )


# ─── Add Single Contact ───────────────────────────────────────────────────────

@router.post("/contacts", status_code=201)
async def add_contact(
    body: ContactCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)

    # Duplicate detection: same phone in same campaign
    existing = db.query(Contact).filter(
        Contact.phone == body.phone,
        Contact.campaign_id == campaign.id,
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This number was already added in this campaign.",
                "existing_contact_id": existing.id,
                "added_by_you": existing.added_by == user.id,
            },
        )

    contact = Contact(
        campaign_id=campaign.id,
        added_by=user.id,
        organisation_id=user.organisation_id,
        name=body.name,
        phone=body.phone,
        location=body.location,
        notes=body.notes,
        needs_transport=body.needs_transport,
        transport_location=body.transport_location,
    )
    db.add(contact)
    db.flush()  # Get ID without committing

    # Create logistics record if transport needed
    if body.needs_transport:
        logistics = Logistics(
            contact_id=contact.id,
            organisation_id=user.organisation_id,
        )
        db.add(logistics)

    db.commit()
    db.refresh(contact)

    log_action(db, user, "contact.created", "contact", contact.id, get_client_ip(request))

    return {"id": contact.id, "detail": "Contact added"}


# ─── Bulk Add ─────────────────────────────────────────────────────────────────

@router.post("/contacts/bulk", status_code=201)
async def bulk_add_contacts(
    body: ContactBulkCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    campaign = _active_campaign(user, db)
    results = []

    # P1-2.8: Check for duplicates within the batch itself before hitting DB
    phones_in_batch = [c.phone for c in body.contacts]
    dupes_in_batch  = [p for p in phones_in_batch if phones_in_batch.count(p) > 1]
    if dupes_in_batch:
        raise HTTPException(
            status_code=422,
            detail=f"Duplicate phone numbers in batch: {list(set(dupes_in_batch))}",
        )

    # API-07: one query for all duplicates, not N individual queries
    phones        = [c.phone for c in body.contacts]
    existing_rows = db.query(Contact.phone).filter(
        Contact.phone.in_(phones),
        Contact.campaign_id == campaign.id,
    ).all()
    existing_phones = {row.phone for row in existing_rows}

    for c in body.contacts:
        if c.phone in existing_phones:
            results.append({"phone": c.phone, "status": "duplicate", "message": "Already in campaign"})
            continue

        contact = Contact(
            campaign_id=campaign.id,
            added_by=user.id,
            organisation_id=user.organisation_id,
            name=c.name,
            phone=c.phone,
            location=c.location,
            notes=c.notes,
            needs_transport=c.needs_transport,
            transport_location=c.transport_location,
        )
        db.add(contact)
        db.flush()

        if c.needs_transport:
            db.add(Logistics(contact_id=contact.id, organisation_id=user.organisation_id))

        results.append({"phone": c.phone, "status": "saved", "id": contact.id})

    db.commit()
    log_action(
        db, user, "contact.bulk_created", ip_address=get_client_ip(request),
        metadata={"count": len(body.contacts)}
    )

    saved = sum(1 for r in results if r["status"] == "saved")
    return {"saved": saved, "results": results}


# ─── List Contacts ────────────────────────────────────────────────────────────

@router.get("/contacts")
async def list_contacts(
    filter: Optional[str] = Query(None, description="all|needs_call|confirmed|undecided|issues"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns volunteer's contacts for active campaign.
    Phone number NOT included in list response (security requirement).
    """
    campaign = _active_campaign(user, db)

    query = db.query(Contact).options(
        joinedload(Contact.statuses),
        joinedload(Contact.message_sends),
    ).filter(
        Contact.added_by == user.id,
        Contact.campaign_id == campaign.id,
    )

    contacts = query.order_by(Contact.created_at.desc()).all()

    # Apply filter
    items = []
    for contact in contacts:
        item = _contact_list_item(contact, db)

        if filter == "confirmed" and item.current_status != ContactStatusCode.coming:
            continue
        elif filter == "needs_call" and item.current_status not in (
            ContactStatusCode.no_answer, ContactStatusCode.message_sent,
            ContactStatusCode.undecided, None
        ):
            continue
        elif filter == "undecided" and item.current_status != ContactStatusCode.undecided:
            continue
        elif filter == "issues" and item.current_status not in (
            ContactStatusCode.wrong_number, ContactStatusCode.not_coming
        ):
            continue

        items.append(item)

    return {"contacts": [i.model_dump() for i in items], "total": len(items)}


# ─── Contact Detail (with phone) ──────────────────────────────────────────────

@router.get("/contacts/{contact_id}")
async def get_contact(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full contact detail including phone. Ownership verified."""
    contact = db.query(Contact).options(
        joinedload(Contact.statuses),
        joinedload(Contact.message_sends),
    ).filter(Contact.id == contact_id).first()

    if not contact:
        # 403 not 404 — don't confirm existence to unauthorised callers
        raise HTTPException(status_code=403, detail="Access denied")

    verify_contact_ownership(contact, user)

    # Hub leader access: log it
    if user.role == UserRole.hub_leader and contact.added_by != user.id:
        log_action(db, user, "contact.viewed_by_hub_leader", "contact", contact_id)

    latest_status = None
    if contact.statuses:
        latest_status = sorted(contact.statuses, key=lambda s: s.updated_at)[-1].status_code

    return ContactDetail(
        id=contact.id,
        name=contact.name,
        phone=contact.phone,
        location=contact.location,
        notes=contact.notes,
        needs_transport=contact.needs_transport,
        transport_location=contact.transport_location,
        current_status=latest_status,
        message_sent_count=len(contact.message_sends),
        created_at=contact.created_at,
    ).model_dump()


# ─── Update Status ────────────────────────────────────────────────────────────

@router.patch("/contacts/{contact_id}/status", status_code=200)
async def update_status(
    contact_id: str,
    body: StatusUpdate,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=403, detail="Access denied")

    verify_contact_ownership(contact, user)

    status_entry = ContactStatus(
        contact_id=contact_id,
        status_code=body.status_code,
        updated_by=user.id,
        note=body.note,
    )
    db.add(status_entry)

    # If flagging as needs_transport, create logistics record if missing
    if body.status_code == ContactStatusCode.needs_transport and not contact.needs_transport:
        contact.needs_transport = True
        if not contact.logistics:
            db.add(Logistics(contact_id=contact_id, organisation_id=user.organisation_id))

    db.commit()

    log_action(
        db, user, "contact.status_changed", "contact", contact_id,
        get_client_ip(request),
        metadata={"new_status": body.status_code}
    )

    return {"detail": "Status updated", "status": body.status_code}


# ─── Delete Contact ───────────────────────────────────────────────────────────

@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(
    contact_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=403, detail="Access denied")

    verify_contact_ownership(contact, user)

    # Log before deletion (can't reference ID after delete)
    log_action(db, user, "contact.deleted", "contact", contact_id, get_client_ip(request))

    # SEC-05: Soft delete — preserves audit trail and FK integrity
    contact.deleted_at = datetime.now(timezone.utc)
    db.commit()


# ─── Call Queue ───────────────────────────────────────────────────────────────

@router.get("/contacts/queue/to-call")
async def contacts_to_call(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns contacts needing a call, sorted by priority:
    1. No answer (tried, no pickup)
    2. Message sent but no response
    3. Undecided
    """
    campaign = _active_campaign(user, db)
    contacts = db.query(Contact).options(
        joinedload(Contact.statuses),
    ).filter(
        Contact.added_by == user.id,
        Contact.campaign_id == campaign.id,
    ).all()

    priority_order = {
        ContactStatusCode.no_answer: 0,
        ContactStatusCode.message_sent: 1,
        ContactStatusCode.undecided: 2,
        None: 3,
    }

    call_list = []
    for contact in contacts:
        latest = None
        if contact.statuses:
            latest = sorted(contact.statuses, key=lambda s: s.updated_at)[-1].status_code

        if latest in (ContactStatusCode.coming, ContactStatusCode.not_coming,
                      ContactStatusCode.wrong_number, ContactStatusCode.unreachable):
            continue  # Skip resolved contacts

        priority = priority_order.get(latest, 99)
        call_list.append((priority, contact))

    call_list.sort(key=lambda x: x[0])

    return {
        "contacts": [
            {
                "id": c.id,
                "name": c.name,
                "phone": c.phone,  # Phone included here for tap-to-call
                "location": c.location,
                "current_status": sorted(c.statuses, key=lambda s: s.updated_at)[-1].status_code
                if c.statuses else None,
            }
            for _, c in call_list
        ]
    }


# ─── Offline Sync ─────────────────────────────────────────────────────────────

@router.post("/contacts/sync", status_code=200)
async def sync_contacts(
    body: ContactSyncBatch,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Accepts a batch of locally-queued contacts.
    Returns sync results with server IDs for each local contact.
    Deduplicates before saving.
    """
    campaign = _active_campaign(user, db)
    results: List[ContactSyncResult] = []

    for c in body.contacts:
        try:
            existing = db.query(Contact).filter(
                Contact.phone == c.phone,
                Contact.campaign_id == campaign.id,
            ).first()

            if existing:
                results.append(ContactSyncResult(
                    local_id=c.local_id,
                    server_id=existing.id,
                    status="duplicate",
                    message="Already in campaign",
                ))
                continue

            contact = Contact(
                campaign_id=campaign.id,
                added_by=user.id,
                organisation_id=user.organisation_id,
                name=c.name,
                phone=c.phone,
                location=c.location,
                notes=c.notes,
                needs_transport=c.needs_transport,
                transport_location=c.transport_location,
            )
            db.add(contact)
            db.flush()  # API-08: flush not commit — keep atomic per contact

            if c.needs_transport:
                db.add(Logistics(contact_id=contact.id, organisation_id=user.organisation_id))

            db.commit()  # API-08: one commit per contact with individual rollback on failure
            results.append(ContactSyncResult(local_id=c.local_id, server_id=contact.id, status="synced"))

        except Exception:
            db.rollback()
            results.append(ContactSyncResult(local_id=c.local_id, status="error", message="Save failed"))

    synced = sum(1 for r in results if r.status == "synced")
    log_action(db, user, "contact.synced", ip_address=get_client_ip(request), metadata={"synced": synced})

    return {"results": [r.model_dump() for r in results]}


# ─── Log Message Send ─────────────────────────────────────────────────────────

@router.post("/message-sends", status_code=201)
async def log_message_send(
    body: MessageSendLog,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log that a WhatsApp deep link was triggered for a contact."""
    contact = db.query(Contact).filter(Contact.id == body.contact_id).first()
    if not contact:
        raise HTTPException(status_code=403, detail="Access denied")
    verify_contact_ownership(contact, user)

    # Verify template is active and not expired
    template = db.query(MessageTemplate).filter(MessageTemplate.id == body.template_id).first()
    if not template or not template.is_active:
        raise HTTPException(status_code=400, detail="Template is not active")

    now = datetime.now(timezone.utc)
    if template.expires_at and template.expires_at < now:
        raise HTTPException(status_code=400, detail="Template has expired")

    send = MessageSend(
        contact_id=body.contact_id,
        template_id=body.template_id,
        sent_by=user.id,
    )
    db.add(send)

    # Auto-update status to message_sent
    status_entry = ContactStatus(
        contact_id=body.contact_id,
        status_code=ContactStatusCode.message_sent,
        updated_by=user.id,
    )
    db.add(status_entry)
    db.commit()

    log_action(db, user, "message.sent", "contact", body.contact_id, get_client_ip(request))

    return {"detail": "Message send logged"}


# ─── Minister Hard Delete (NDPR erasure) ─────────────────────────────────────

@router.post("/contacts/{contact_id}/hard-delete", status_code=204)
async def hard_delete_contact(
    contact_id: str,
    request:    Request,
    user:       User    = Depends(require_hub_leader),
    db:         Session = Depends(get_db),
):
    """Permanent erasure for NDPR right-to-erasure requests. Minister/hub-leader only."""
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    log_action(db, user, "contact.hard_deleted", "contact", contact_id, get_client_ip(request))
    db.delete(contact)
    db.commit()
