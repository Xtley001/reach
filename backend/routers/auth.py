"""
REACH — Auth Router  

Changes:
  - POST /auth/send-otp  → now returns { detail, is_returning: bool }
    Frontend uses is_returning to decide which login flow to render.
  - POST /auth/verify-otp → name + hub_id arrive WITH otp (atomic creation),
    no more CompleteProfile redirect needed.

Endpoints:
  POST /auth/send-otp
  POST /auth/verify-otp
  POST /auth/refresh
  POST /auth/logout
  POST /auth/revoke-all     (minister only)
  GET  /auth/me
  GET  /auth/sessions
  DELETE /auth/sessions/:id
  GET  /onboarding/hubs
"""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import uuid

from ..database import get_db
from ..models import User, UserStatus, UserRole, OTPSession, RefreshToken, Hub, Organisation
from ..schemas import (
    SendOTPRequest, SendOTPResponse, VerifyOTPRequest, TokenResponse,
    RefreshResponse, UserOut, ActiveSessionOut, HubLeaderSummary
)
from ..auth import (
    generate_otp, hash_value, verify_hash, sha256_hash,
    dispatch_otp, create_access_token, create_refresh_token_value,
    decode_access_token
)
from ..dependencies import (
    get_current_user, get_current_user_allow_pending,
    require_minister, log_action, get_client_ip
)
from ..config import settings

router = APIRouter(prefix="/auth", tags=["auth"])
onboarding_router = APIRouter(prefix="/onboarding", tags=["onboarding"])

REFRESH_TOKEN_COOKIE  = "reach_refresh"
OTP_EXPIRE_MINUTES    = 10
OTP_MAX_ATTEMPTS      = 5
OTP_LOCKOUT_MINUTES   = 30


# ─── Onboarding: list hubs for volunteer hub selection ────────────────────────

@onboarding_router.get("/hubs", response_model=list[HubLeaderSummary])
async def list_hubs_for_signup(db: Session = Depends(get_db)):
    """
    Public endpoint — returns available hubs + hub leader name/avatar.
    single batch query instead of N+1 (eliminates 4,500 ms delay).
    """
    # API-09: only hubs tied to active campaigns
    from ..models import Campaign, CampaignStatus as CS
    active_ids = [c.id for c in db.query(Campaign).filter(Campaign.status == CS.active).all()]
    hubs = db.query(Hub).filter(Hub.campaign_id.in_(active_ids)).all() if active_ids else []
    if not hubs:
        return []

    hub_ids     = [h.id for h in hubs]
    leaders     = db.query(User).filter(
        User.hub_id.in_(hub_ids),
        User.role   == UserRole.hub_leader,
        User.status == UserStatus.active,
    ).all()
    by_hub = {l.hub_id: l for l in leaders}

    return [
        HubLeaderSummary(
            hub_id            = h.id,
            hub_name          = h.name,
            hub_zone          = h.zone,
            leader_name       = by_hub[h.id].name       if h.id in by_hub else None,
            leader_avatar_url = by_hub[h.id].avatar_url if h.id in by_hub else None,
        )
        for h in hubs
    ]


# ─── Send OTP ─────────────────────────────────────────────────────────────────

@router.post("/send-otp", response_model=SendOTPResponse, status_code=200)
async def send_otp(body: SendOTPRequest, request: Request, db: Session = Depends(get_db)):
    """
    Returns is_returning to let the frontend decide which flow to show.
      is_returning=True  → short flow: phone → OTP → dashboard
      is_returning=False → full flow:  name → phone → hub → OTP → pending
    """
    identifier = body.phone if body.channel == "sms" else body.email
    identifier_hash = sha256_hash(identifier)
    now = datetime.now(timezone.utc)

    # Check if the user already exists (determines flow variant)
    if body.channel == "sms":
        existing_user = db.query(User).filter(User.phone == identifier).first()
    else:
        existing_user = db.query(User).filter(User.email == identifier).first()
    is_returning = existing_user is not None

    session = db.query(OTPSession).filter(
        OTPSession.identifier_hash == identifier_hash
    ).first()

    if session and session.locked_until and session.locked_until > now:
        wait = int((session.locked_until - now).total_seconds() / 60)
        raise HTTPException(
            status_code=429,
            detail=f"Too many attempts. Try again in {wait} minutes.",
            headers={"Retry-After": str(int((session.locked_until - now).total_seconds()))},
        )

    # P2-4.7: Also check lockout via user_id — prevents bypass by switching channels
    existing_user = db.query(User).filter(
        (User.phone == identifier) | (User.email == identifier),
    ).first()
    if existing_user:
        locked_by_user = db.query(OTPSession).filter(
            OTPSession.user_id == existing_user.id,
            OTPSession.locked_until > now,
        ).first()
        if locked_by_user:
            wait = int((locked_by_user.locked_until - now).total_seconds() / 60)
            raise HTTPException(
                status_code=429,
                detail=f"Too many attempts. Try again in {wait} minutes.",
                headers={"Retry-After": str(int((locked_by_user.locked_until - now).total_seconds()))},
            )
        # Link session to user_id for future cross-channel checks
        if session:
            session.user_id = existing_user.id

    otp = generate_otp()
    otp_hash = hash_value(otp)
    expires = now + timedelta(minutes=OTP_EXPIRE_MINUTES)

    if session:
        # P1-1.5: Preserve attempts counter — never reset on resend.
        # Locked sessions are rejected above before reaching here.
        session.otp_hash   = otp_hash
        session.expires_at = expires
        session.channel    = body.channel
        # Do NOT reset session.attempts or session.locked_until
    else:
        session = OTPSession(
            identifier_hash=identifier_hash,
            channel=body.channel,
            otp_hash=otp_hash,
            attempts=0,
            expires_at=expires,
        )
        db.add(session)

    db.commit()

    ok = await dispatch_otp(identifier, otp, body.channel)
    if not ok:
        raise HTTPException(status_code=503, detail="OTP delivery failed. Please try again.")

    log_action(db, None, "auth.otp_sent", ip_address=get_client_ip(request))
    return SendOTPResponse(detail="OTP sent. Valid for 10 minutes.", is_returning=is_returning)


# ─── Verify OTP ───────────────────────────────────────────────────────────────

@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    body: VerifyOTPRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    name + hub_id now arrive WITH the OTP.
    New user creation is fully atomic — no partial state, no CompleteProfile step.
    """
    identifier = body.phone if body.channel == "sms" else body.email
    identifier_hash = sha256_hash(identifier)
    now = datetime.now(timezone.utc)

    session = db.query(OTPSession).filter(
        OTPSession.identifier_hash == identifier_hash
    ).first()

    def _fail_attempt():
        if session:
            session.attempts += 1
            if session.attempts >= OTP_MAX_ATTEMPTS:
                session.locked_until = now + timedelta(minutes=OTP_LOCKOUT_MINUTES)
            db.commit()

    if not session or session.expires_at < now:
        raise HTTPException(status_code=400, detail="OTP expired or not found. Request a new one.")

    if session.locked_until and session.locked_until > now:
        raise HTTPException(status_code=429, detail="Account locked. Try again later.")

    if not verify_hash(body.otp, session.otp_hash):
        _fail_attempt()
        remaining = OTP_MAX_ATTEMPTS - (session.attempts if session else 0)
        raise HTTPException(status_code=400, detail=f"Invalid OTP. {remaining} attempts remaining.")

    db.delete(session)
    db.commit()

    # Bootstrap org if needed
    org = db.query(Organisation).first()
    if not org:
        org = Organisation(name="Ministry", slug="ministry")
        db.add(org)
        db.commit()
        db.refresh(org)

    # Find or create user
    is_new = False
    if body.channel == "sms":
        user = db.query(User).filter(
            User.phone == identifier, User.organisation_id == org.id
        ).first()
        new_kwargs = {"phone": identifier}
    else:
        user = db.query(User).filter(
            User.email == identifier, User.organisation_id == org.id
        ).first()
        new_kwargs = {"email": identifier}

    if not user:
        # New volunteer: name + hub_id must be present
        if not body.name:
            raise HTTPException(status_code=422, detail="Name is required for new volunteer registration.")
        # BIZ-02: hub_id required — volunteers without hub cannot be approved by anyone
        if not body.hub_id:
            raise HTTPException(status_code=422, detail="Hub selection is required for new volunteer registration.")
        is_new = True
        user = User(
            organisation_id=org.id,
            name=body.name,
            role=UserRole.volunteer,
            status=UserStatus.pending,
            hub_id=body.hub_id,
            **new_kwargs,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        log_action(db, user, "auth.registered", ip_address=get_client_ip(request))
    else:
        # Returning user — update name/hub if still missing
        changed = False
        if body.name and not user.name:
            user.name = body.name; changed = True
        if body.hub_id and not user.hub_id:
            user.hub_id = body.hub_id; changed = True
        if changed:
            db.commit()

    access_token = create_access_token(
        user_id=user.id, role=user.role,
        hub_id=user.hub_id, org_id=user.organisation_id,
    )

    raw_refresh = create_refresh_token_value()
    family_id   = str(uuid.uuid4())
    expires_at  = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    rt = RefreshToken(
        token_hash=sha256_hash(raw_refresh),
        user_id=user.id,
        family_id=family_id,
        device_hint=request.headers.get("User-Agent", "")[:200],
        expires_at=expires_at,
    )
    db.add(rt)
    db.commit()

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=raw_refresh,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="none",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",  # was /auth/refresh — too restrictive with /api prefix in dev
    )

    log_action(db, user, "auth.login", ip_address=get_client_ip(request))

    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        role=user.role,
        status=user.status,
        name=user.name,
        is_new_user=is_new,
    )


# ─── Refresh ──────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Rotates refresh token + checks 7-day inactivity.
    Replay attack → entire family revoked.
    """
    raw_refresh = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if not raw_refresh:
        raise HTTPException(status_code=401, detail="No refresh token")

    token_hash = sha256_hash(raw_refresh)
    now = datetime.now(timezone.utc)

    rt = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not rt:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if rt.used_at is not None:
        db.query(RefreshToken).filter(RefreshToken.family_id == rt.family_id).update({"revoked": True})
        db.commit()
        log_action(db, None, "auth.replay_attack_detected", ip_address=get_client_ip(request))
        raise HTTPException(status_code=401, detail="Token reuse detected. All sessions invalidated.")

    if rt.revoked or rt.expires_at < now:
        raise HTTPException(status_code=401, detail="Refresh token expired or revoked")

    rt.used_at = now
    db.commit()

    user = db.query(User).filter(User.id == rt.user_id).first()
    if not user or user.status not in (UserStatus.active, UserStatus.pending):
        raise HTTPException(status_code=401, detail="User not found or inactive")

    if user.last_active_at:
        inactive_for = now - user.last_active_at
        if inactive_for > timedelta(hours=settings.SESSION_INACTIVITY_HOURS):
            db.query(RefreshToken).filter(
                RefreshToken.family_id == rt.family_id
            ).update({"revoked": True})
            db.commit()
            raise HTTPException(
                status_code=401,
                detail="Session expired due to inactivity. Please log in again.",
                headers={"X-Session-Expired": "inactivity"},
            )

    access_token = create_access_token(
        user_id=user.id, role=user.role,
        hub_id=user.hub_id, org_id=user.organisation_id,
    )

    new_raw = create_refresh_token_value()
    new_rt = RefreshToken(
        token_hash=sha256_hash(new_raw),
        user_id=user.id,
        family_id=rt.family_id,
        device_hint=rt.device_hint,
        expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_rt)
    # DB-03: opportunistic cleanup of old revoked tokens for this user
    try:
        from datetime import timedelta as _td
        cutoff = now - _td(days=7)
        db.query(RefreshToken).filter(
            RefreshToken.user_id    == user.id,
            RefreshToken.revoked    == True,
            RefreshToken.expires_at  < cutoff,
        ).delete(synchronize_session=False)
    except Exception:
        pass
    db.commit()

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=new_raw,
        httponly=True,
        secure=settings.ENVIRONMENT != "development",
        samesite="none",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",  # was /auth/refresh — too restrictive with /api prefix in dev
    )

    return RefreshResponse(access_token=access_token)


# ─── Logout ───────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=204)
async def logout(
    request: Request, response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_allow_pending),
):
    raw_refresh = request.cookies.get(REFRESH_TOKEN_COOKIE)
    if raw_refresh:
        db.query(RefreshToken).filter(
            RefreshToken.token_hash == sha256_hash(raw_refresh)
        ).update({"revoked": True})
        db.commit()
    response.delete_cookie(REFRESH_TOKEN_COOKIE, path="/")
    log_action(db, user, "auth.logout", ip_address=get_client_ip(request))


@router.post("/revoke-all", status_code=204)
async def revoke_all_sessions(
    request: Request, db: Session = Depends(get_db),
    caller: User = Depends(require_minister),
):
    db.query(RefreshToken).filter(RefreshToken.revoked.is_(False)).update({"revoked": True})
    db.commit()
    log_action(db, caller, "auth.global_revoke", ip_address=get_client_ip(request),
               metadata={"triggered_by": caller.id})


# ─── Me ───────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user_allow_pending)):
    return user


# ─── Sessions ─────────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=list[ActiveSessionOut])
async def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    tokens = db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.revoked.is_(False),
        RefreshToken.expires_at > now,
        RefreshToken.used_at.is_(None),
    ).all()
    return [
        ActiveSessionOut(
            token_id=str(t.id), device_hint=t.device_hint,
            created_at=t.created_at, expires_at=t.expires_at,
        )
        for t in tokens
    ]


@router.delete("/sessions/{token_id}", status_code=204)
async def revoke_session(
    token_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token = db.query(RefreshToken).filter(
        RefreshToken.id == token_id, RefreshToken.user_id == user.id
    ).first()
    if not token:
        raise HTTPException(status_code=404, detail="Session not found")
    token.revoked = True
    db.commit()
