"""
REACH — Invite Router

Ministers generate signed, one-time invite tokens for all role types.

POST  /auth/invite           Minister — generate invite (hub_leader | registration_team | decisions_team)
GET   /auth/invite/preview   Validate token + return preview data
POST  /auth/invite/send-otp  Hub leader requests OTP during invite claim
POST  /auth/claim-invite     Claim invite, create account, issue tokens
GET   /admin/event-team      Minister — list registration + decisions team members
"""
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
import uuid

from ..database import get_db
from ..models import (
    User, UserRole, UserStatus, Hub, Organisation,
    OTPSession, RefreshToken, InviteToken
)
from ..schemas import (
    InviteCreate, InviteOut, ClaimInviteRequest, InvitePreview, TokenResponse
)
from ..auth import (
    generate_otp, hash_value, verify_hash, sha256_hash,
    dispatch_otp, create_access_token, create_refresh_token_value,
)
from ..dependencies import require_minister, get_current_user_allow_pending, log_action, get_client_ip
from ..config import settings

router = APIRouter(prefix="/auth", tags=["invites"])
admin_router = APIRouter(prefix="/admin", tags=["admin"])

INVITE_EXPIRE_HOURS  = 48
REFRESH_TOKEN_COOKIE = "reach_refresh"
OTP_EXPIRE_MINUTES   = 10
OTP_MAX_ATTEMPTS     = 5
OTP_LOCKOUT_MINUTES  = 30

ALLOWED_INVITE_ROLES = {
    UserRole.hub_leader,
    UserRole.registration_team,
    UserRole.decisions_team,
}


def _make_invite_token() -> tuple:
    raw    = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


# ─── Generate Invite ──────────────────────────────────────────────────────────

class ExtendedInviteCreate(BaseModel):
    name_hint: Optional[str] = None
    phone:     Optional[str] = None
    email:     Optional[str] = None
    channel:   str = "sms"
    role:      str = "hub_leader"
    hub_id:    Optional[str] = None


@router.post("/invite", response_model=InviteOut)
async def create_invite(
    body: ExtendedInviteCreate,
    request: Request,
    db: Session = Depends(get_db),
    minister: User = Depends(require_minister),
):
    try:
        invite_role = UserRole(body.role)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid role: {body.role}")

    if invite_role not in ALLOWED_INVITE_ROLES:
        raise HTTPException(status_code=422, detail=f"Cannot invite role: {body.role}")

    if invite_role == UserRole.hub_leader:
        if not body.hub_id:
            raise HTTPException(status_code=422, detail="hub_id required for hub_leader invite.")
        hub = db.query(Hub).filter(Hub.id == body.hub_id).first()
        if not hub:
            raise HTTPException(status_code=404, detail="Hub not found.")
        hub_name = hub.name
    else:
        hub_name = None

    identifier = body.phone if body.channel == "sms" else body.email
    if not identifier:
        raise HTTPException(status_code=422, detail="phone or email required.")

    now = datetime.now(timezone.utc)

    # Invalidate previous unused invites for same identifier + role
    old = db.query(InviteToken).filter(
        InviteToken.phone == (body.phone if body.channel == "sms" else None),
        InviteToken.role  == invite_role,
        InviteToken.claimed_at.is_(None),
        InviteToken.expires_at > now,
    ).all()
    for o in old:
        o.expires_at = now
    db.commit()

    raw_token, token_hash = _make_invite_token()
    expires_at = now + timedelta(hours=INVITE_EXPIRE_HOURS)

    invite = InviteToken(
        token_hash=token_hash,
        role=invite_role,
        hub_id=body.hub_id,
        phone=body.phone if body.channel == "sms" else None,
        email=body.email if body.channel == "email" else None,
        channel=body.channel,
        invited_by=minister.id,
        name_hint=body.name_hint,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()

    frontend_url = getattr(settings, "FRONTEND_URL", None)
    if frontend_url:
        frontend_base = frontend_url.rstrip("/")
    else:
        frontend_base = str(request.base_url).rstrip("/")
        if "/api" in frontend_base:
            frontend_base = frontend_base.split("/api")[0]
    invite_url = f"{frontend_base}/join?invite={raw_token}"

    log_action(db, minister, "invite.created",
               entity_type="invite", entity_id=str(invite.id),
               ip_address=get_client_ip(request),
               metadata={"role": body.role, "hub_id": body.hub_id})

    return InviteOut(
        invite_url=invite_url,
        expires_at=expires_at,
        phone=body.phone,
        hub_name=hub_name,
    )


# ─── Preview Invite ───────────────────────────────────────────────────────────

@router.get("/invite/preview", response_model=InvitePreview)
async def preview_invite(token: str, request: Request, db: Session = Depends(get_db)):
    # P1-1.6: Rate limited — 20/minute per IP
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    # Rate limit applied via middleware; identical error for all bad states (no oracle)
    INVALID_MSG = "This invite link is not valid or has expired."

    if not token:
        return InvitePreview(valid=False, error=INVALID_MSG)

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now        = datetime.now(timezone.utc)

    invite = db.query(InviteToken).filter(InviteToken.token_hash == token_hash).first()

    # Return identical message for all invalid states — prevents oracle enumeration
    if not invite or invite.claimed_at is not None or invite.expires_at < now:
        return InvitePreview(valid=False, error=INVALID_MSG)

    hub = db.query(Hub).filter(Hub.id == invite.hub_id).first() if invite.hub_id else None

    phone_hint = None
    if invite.phone:
        phone_hint = "••••••" + invite.phone[-4:]

    return InvitePreview(
        valid=True,
        hub_name=hub.name  if hub else None,
        hub_zone=hub.zone  if hub else None,
        name_hint=invite.name_hint,
        phone_hint=phone_hint,
        expires_at=invite.expires_at,
        role=invite.role,
    )


# ─── Send OTP for Invite Flow ─────────────────────────────────────────────────

class InviteOTPRequest(BaseModel):
    token: str
    phone: str


@router.post("/invite/send-otp", status_code=200)
async def send_invite_otp(
    body: InviteOTPRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    from ..schemas import validate_phone as vp
    try:
        phone = vp(body.phone)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid phone number format.")

    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    now        = datetime.now(timezone.utc)

    invite = db.query(InviteToken).filter(
        InviteToken.token_hash == token_hash,
        InviteToken.claimed_at.is_(None),
        InviteToken.expires_at > now,
    ).first()
    if not invite:
        raise HTTPException(status_code=400, detail="Invite is invalid or has expired.")

    identifier_hash = sha256_hash(phone)
    session = db.query(OTPSession).filter(OTPSession.identifier_hash == identifier_hash).first()

    if session and session.locked_until and session.locked_until > now:
        wait = int((session.locked_until - now).total_seconds() / 60)
        raise HTTPException(status_code=429, detail=f"Too many attempts. Try again in {wait} minutes.")

    otp      = generate_otp()
    otp_hash = hash_value(otp)
    expires  = now + timedelta(minutes=OTP_EXPIRE_MINUTES)

    if session:
        session.otp_hash = otp_hash; session.expires_at = expires
        session.attempts = 0; session.locked_until = None; session.channel = "sms"
    else:
        session = OTPSession(
            identifier_hash=identifier_hash, channel="sms",
            otp_hash=otp_hash, attempts=0, expires_at=expires,
        )
        db.add(session)

    db.commit()
    ok = await dispatch_otp(phone, otp, "sms")
    if not ok:
        raise HTTPException(status_code=503, detail="OTP delivery failed. Please try again.")
    return {"detail": "OTP sent. Valid for 10 minutes."}


# ─── Claim Invite ─────────────────────────────────────────────────────────────

@router.post("/claim-invite", response_model=TokenResponse)
async def claim_invite(
    body: ClaimInviteRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    now        = datetime.now(timezone.utc)

    invite = db.query(InviteToken).filter(InviteToken.token_hash == token_hash).first()
    if not invite:
        raise HTTPException(status_code=400, detail="Invite not found. Check your link.")
    if invite.claimed_at is not None:
        raise HTTPException(status_code=400, detail="This invite has already been used.")
    if invite.expires_at < now:
        raise HTTPException(status_code=400, detail="This invite has expired. Ask your minister for a new one.")

    identifier_hash = sha256_hash(body.phone)
    otp_session = db.query(OTPSession).filter(OTPSession.identifier_hash == identifier_hash).first()

    def _fail():
        if otp_session:
            otp_session.attempts += 1
            if otp_session.attempts >= OTP_MAX_ATTEMPTS:
                otp_session.locked_until = now + timedelta(minutes=OTP_LOCKOUT_MINUTES)
            db.commit()

    if not otp_session or otp_session.expires_at < now:
        raise HTTPException(status_code=400, detail="OTP expired or not found.")
    if otp_session.locked_until and otp_session.locked_until > now:
        raise HTTPException(status_code=429, detail="Account locked.")
    if not verify_hash(body.otp, otp_session.otp_hash):
        _fail()
        remaining = OTP_MAX_ATTEMPTS - otp_session.attempts
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining} attempts remaining.")

    db.delete(otp_session)

    org = db.query(Organisation).first()
    if not org:
        raise HTTPException(status_code=500, detail="Organisation not configured.")

    if invite.phone and invite.phone != body.phone:
        raise HTTPException(status_code=400, detail="This invite was not issued for this phone number.")

    existing = db.query(User).filter(
        User.phone == body.phone, User.organisation_id == org.id
    ).first()
    if existing:
        if existing.role != invite.role:
            existing.role = invite.role
        if existing.status != UserStatus.active:
            existing.status = UserStatus.active
        if invite.hub_id and not existing.hub_id:
            existing.hub_id = invite.hub_id
        user = existing
    else:
        user = User(
            organisation_id=org.id,
            phone=body.phone,
            name=body.name,
            role=invite.role,
            status=UserStatus.active,
            hub_id=invite.hub_id,
            last_active_at=now,
        )
        db.add(user)

    invite.claimed_at = now
    db.commit()
    db.refresh(user)

    log_action(db, user, "auth.invite_claimed",
               entity_type="invite", entity_id=str(invite.id),
               ip_address=get_client_ip(request))

    # Revoke any existing refresh token families for this user (P0-1.2)
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked == False,
    ).update({"revoked": True})
    db.flush()

    access_token = create_access_token(
        user_id=user.id, role=user.role,
        hub_id=user.hub_id, org_id=user.organisation_id,
    )
    raw_refresh = create_refresh_token_value()
    rt = RefreshToken(
        token_hash=sha256_hash(raw_refresh),
        user_id=user.id,
        family_id=str(uuid.uuid4()),
        device_hint=request.headers.get("User-Agent", "")[:200],
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(rt)
    db.commit()

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE, value=raw_refresh,
        httponly=True, secure=True, samesite="none",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, path="/",
    )

    return TokenResponse(
        access_token=access_token, user_id=user.id,
        role=user.role, status=user.status, name=user.name, is_new_user=True,
    )


# ─── Admin: Event Team List ────────────────────────────────────────────────────

@admin_router.get("/event-team")
async def list_event_team(
    minister: User = Depends(require_minister),
    db: Session = Depends(get_db),
):
    team = db.query(User).filter(
        User.organisation_id == minister.organisation_id,
        User.role.in_([UserRole.registration_team, UserRole.decisions_team]),
    ).all()
    return {"team": [
        {
            "id":        u.id,
            "name":      u.name,
            "role":      u.role,
            "status":    u.status,
            "phone":     u.phone,
            "email":     u.email,
            "created_at":u.created_at.isoformat() if u.created_at else None,
        }
        for u in team
    ]}
