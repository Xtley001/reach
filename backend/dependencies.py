"""
REACH — FastAPI Dependencies
"""
from typing import Optional
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .database import get_db
from .models import User, UserRole, UserStatus, AuditLog
from .auth import decode_access_token

bearer = HTTPBearer(auto_error=False)


def get_client_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required.")
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    if user.status == UserStatus.rejected:
        raise HTTPException(status_code=403, detail="Account rejected.")
    return user


async def get_current_user_allow_pending(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload:
        return None
    return db.query(User).filter(User.id == payload.get("sub")).first()


async def require_active_user(user: User = Depends(get_current_user)) -> User:
    if user.status != UserStatus.active:
        raise HTTPException(status_code=403, detail="Account pending approval.")
    return user


async def require_hub_leader(user: User = Depends(get_current_user)) -> User:
    if user.role not in {UserRole.hub_leader, UserRole.minister}:
        raise HTTPException(status_code=403, detail="Hub leader access required.")
    if user.status != UserStatus.active:
        raise HTTPException(status_code=403, detail="Account not active.")
    return user


async def require_minister(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.minister:
        raise HTTPException(status_code=403, detail="Minister access required.")
    if user.status != UserStatus.active:
        raise HTTPException(status_code=403, detail="Account not active.")
    return user


def verify_contact_ownership(contact, user: User, db: Session = None):
    """
    Verify that a user can access a contact.
    Volunteers can only access contacts they added.
    Hub leaders can access all contacts from their hub.
    Ministers can access all contacts.
    """
    if user.role == UserRole.minister:
        return  # Ministers can access all
    if user.role == UserRole.hub_leader:
        # Hub leaders can access contacts added by volunteers in their hub
        if db and contact.added_by:
            added_by_user = db.query(User).filter(User.id == contact.added_by).first()
            if added_by_user and added_by_user.hub_id == user.hub_id:
                return
    if user.role == UserRole.volunteer:
        if contact.added_by == user.id:
            return  # Volunteer can only access their own contacts
    raise HTTPException(status_code=403, detail="Access denied")


def log_action(
    db: Session,
    user: Optional[User],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    metadata: Optional[dict] = None,
):
    import json
    log = AuditLog(
        user_id=user.id if user else None,                        # fix: user can be None for unauthenticated actions
        organisation_id=user.organisation_id if user else None,   # fix: same
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        ip_address=ip_address,
        log_metadata=json.dumps(metadata) if metadata else None,
    )
    db.add(log) 