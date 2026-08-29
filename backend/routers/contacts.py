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
from sqlalchemy.exc import IntegrityError

from ..database import get_db
from ..models import (
    Contact, ContactStatus, ContactStatusCode, MessageSend,
    MessageTemplate, Logistics, User, UserRole, Campaign, CampaignStatus,
    ContactTag, TagDefinition
)
from ..schemas import (
    ContactCreate, ContactBulkCreate, ContactSyncBatch,
    ContactListItem, ContactDetail, StatusUpdate,
    MessageSendLog, ContactSyncResult,
    TagDefinitionOut, TagToggleRequest, ContactTagOut,
    PasteImportRequest, PasteImportResponse, PasteImportResultRow,
)
from ..dependencies import (
    get_current_user, require_hub_leader,
    verify_contact_ownership, log_action, get_client_ip
)
from ..limiter import limiter

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
        phone=contact.phone,
        location=contact.location,
        needs_transport=contact.needs_transport,
        current_status=latest_status,
        message_sent_count=send_count,
        created_at=contact.created_at,
        # B-21: tags surfaced on the list item so ContactsList can render
        # chips without a per-row round trip.
        tags=[t.tag_code for t in contact.tags],
        is_incomplete=contact.is_incomplete,
    )


# ─── B: Contact outcome tags ───────────────────────────────────────────────────

@router.get("/contacts/{contact_id}/tags")
async def get_contact_tags(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=403, detail="Access denied")
    verify_contact_ownership(contact, user, db)
    return {
        "tags": [
            ContactTagOut(
                tag_code=t.tag_code, set_by=t.set_by, set_at=t.set_at, note=t.note
            ).model_dump()
            for t in contact.tags
        ]
    }


@router.post("/contacts/{contact_id}/tags", status_code=200)
async def toggle_contact_tag(
    contact_id: str,
    body: TagToggleRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    B-18/19/22: toggle add/remove — idempotent and non-blocking. A volunteer
    tapping the same chip twice in a row (double-tap, flaky network retry,
    optimistic-UI rollback-then-retry) must never 500 or create a duplicate
    row; it should behave as "make sure this tag is/isn't set" rather than
    "add a new tag application".
    """
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=403, detail="Access denied")
    verify_contact_ownership(contact, user, db)

    valid_codes = {
        d.code for d in db.query(TagDefinition).filter(
            TagDefinition.organisation_id == user.organisation_id,
            TagDefinition.is_active == True,  # noqa: E712
        ).all()
    }
    if body.tag_code not in valid_codes:
        raise HTTPException(status_code=400, detail=f"Unknown or inactive tag: {body.tag_code}")

    existing = db.query(ContactTag).filter(
        ContactTag.contact_id == contact_id,
        ContactTag.tag_code == body.tag_code,
    ).first()

    if existing:
        # Toggle off.
        db.delete(existing)
        db.commit()
        action = "removed"
    else:
        tag = ContactTag(
            contact_id=contact_id, tag_code=body.tag_code,
            set_by=user.id, note=body.note,
        )
        db.add(tag)
        try:
            db.commit()
            action = "added"
        except IntegrityError:
            # B-19: a concurrent request already added this exact tag (race
            # between two rapid taps) — unique constraint caught it. Treat as
            # success, not an error; the end state ("tag is set") is correct.
            db.rollback()
            action = "added"

    # B-20: reuse the existing AuditLog path — don't invent a second one.
    log_action(
        db, user, f"contact.tag_{action}", "contact", contact_id,
        get_client_ip(request), metadata={"tag_code": body.tag_code},
    )

    return {"tag_code": body.tag_code, "action": action}


@router.get("/tag-definitions")
async def list_tag_definitions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """B-17: config-driven tag list — frontend renders exactly these chips,
    in this order, instead of a hardcoded set baked into the bundle."""
    defs = db.query(TagDefinition).filter(
        TagDefinition.organisation_id == user.organisation_id,
        TagDefinition.is_active == True,  # noqa: E712
    ).order_by(TagDefinition.sort_order).all()
    return {"tags": [
        TagDefinitionOut(code=d.code, label=d.label, color=d.color, icon=d.icon, sort_order=d.sort_order).model_dump()
        for d in defs
    ]}


# ─── C: Mass upload — paste-to-import ──────────────────────────────────────────

MAX_PASTE_ROWS = 500  # C-36: cap paste size with a clear error, not a silent hang


@router.post("/contacts/bulk-paste", response_model=PasteImportResponse, status_code=201)
@limiter.limit("10/minute")
async def bulk_paste_import(
    request: Request,
    body: PasteImportRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    C-30/31/32/33/34/35: the paste-and-preview parsing itself happens
    client-side (lib/pasteParse.js) so it's instant and works on spotty
    church wifi (C-37) — this endpoint only receives already-normalised
    E.164 phone numbers (validated again server-side via PasteImportRow's
    validator, never trust the client) and creates minimal "incomplete"
    contact records.
    """
    if len(body.rows) > MAX_PASTE_ROWS:
        raise HTTPException(
            status_code=422,
            detail=f"Too many rows in one paste ({len(body.rows)}). Split into batches of {MAX_PASTE_ROWS} or fewer.",
        )
    if not body.rows:
        raise HTTPException(status_code=422, detail="No rows to import.")

    campaign = _active_campaign(user, db)

    phones = [r.phone for r in body.rows]
    existing_rows = db.query(Contact.phone).filter(
        Contact.phone.in_(phones),
        Contact.campaign_id == campaign.id,
    ).all()
    existing_phones = {row.phone for row in existing_rows}

    results: List[PasteImportResultRow] = []
    seen_in_batch = set()

    for row in body.rows:
        if row.phone in existing_phones or row.phone in seen_in_batch:
            results.append(PasteImportResultRow(phone=row.phone, status="duplicate", message="Already in campaign or paste"))
            continue
        seen_in_batch.add(row.phone)

        # C-33: location intentionally left blank — nullable now, this is
        # exactly the "needs completing" signal, not an error state.
        contact = Contact(
            campaign_id=campaign.id,
            added_by=user.id,
            organisation_id=user.organisation_id,
            name=row.name or "Unnamed contact",
            phone=row.phone,
            location=None,
            source="volunteer",
        )
        contact.recompute_incomplete()
        try:
            with db.begin_nested():
                db.add(contact)
                db.flush()
            results.append(PasteImportResultRow(phone=row.phone, status="saved", id=contact.id))
        except IntegrityError:
            results.append(PasteImportResultRow(phone=row.phone, status="error", message="Could not save this number"))
            continue

    db.commit()
    saved = sum(1 for r in results if r.status == "saved")
    skipped = len(results) - saved

    log_action(
        db, user, "contact.bulk_paste_imported", ip_address=get_client_ip(request),
        metadata={"saved": saved, "skipped": skipped, "total": len(body.rows)},
    )

    return PasteImportResponse(saved=saved, skipped=skipped, results=results)


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
    filter: Optional[str] = Query(None, description="all|needs_call|confirmed|undecided|issues|incomplete|tag"),
    tag: Optional[str] = Query(None, description="tag_code, used with filter=tag; also usable as A-25/B-25 filter chip"),
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
        joinedload(Contact.tags),
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
        elif filter == "needs_message" and (item.message_sent_count > 0 or item.current_status == ContactStatusCode.not_coming):
            continue
        elif filter == "undecided" and item.current_status != ContactStatusCode.undecided:
            continue
        elif filter == "issues" and item.current_status not in (
            ContactStatusCode.wrong_number, ContactStatusCode.not_coming
        ):
            continue
        # C-34/38: "Finish these {n} contacts" — the paste-import flow's
        # very next tap should land here, not on a dead-end success screen.
        elif filter == "incomplete" and not item.is_incomplete:
            continue
        elif filter == "tag" and tag and (tag not in item.tags):
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

    verify_contact_ownership(contact, user, db)

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
        tags=[t.tag_code for t in contact.tags],
        is_incomplete=contact.is_incomplete,
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

    verify_contact_ownership(contact, user, db)

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

    verify_contact_ownership(contact, user, db)

    # Log before deletion (can't reference ID after delete)
    log_action(db, user, "contact.deleted", "contact", contact_id, get_client_ip(request))

    # SEC-05: Soft delete — preserves audit trail and FK integrity
    contact.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return None


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
        local_id = getattr(c, "local_id", None)
        try:
            with db.begin_nested():
                existing = db.query(Contact).filter(
                    Contact.phone == c.phone,
                    Contact.campaign_id == campaign.id,
                ).first()

                if existing:
                    results.append(ContactSyncResult(
                        local_id=local_id,
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
                db.flush()

                if c.needs_transport:
                    db.add(Logistics(contact_id=contact.id, organisation_id=user.organisation_id))
                    db.flush()

                results.append(ContactSyncResult(local_id=local_id, server_id=contact.id, status="synced"))

        except Exception as e:
            results.append(ContactSyncResult(local_id=local_id, status="error", message=str(e) or "Save failed"))

    db.commit()

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
    verify_contact_ownership(contact, user, db)

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
    return None
