"""
REACH — Users Router  (v1.1)
PATCH /users/me/profile        — update name, email, phone, avatar
GET   /users/me/hub-leader     — returns this volunteer's hub leader info
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models import User, UserRole, UserStatus
from ..dependencies import get_current_user_allow_pending
from ..storage import upload_avatar
from ..schemas import validate_phone, validate_email_address, ProfileUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me/profile", status_code=200)
async def update_profile(
    body:   ProfileUpdate,
    db:     Session              = Depends(get_db),
    user:   User                 = Depends(get_current_user_allow_pending),
):
    """
    Update name, email, phone, and/or hub.
    Accepts JSON payload matching frontend api.updateProfile(data).
    """
    if body.name is not None and body.name.strip():
        user.name = body.name.strip()[:100]

    if body.email is not None and body.email.strip():
        user.email = validate_email_address(body.email)

    if body.phone is not None and body.phone.strip():
        user.phone = validate_phone(body.phone)

    if body.hub_id and not user.hub_id:
        from ..models import Hub
        hub = db.query(Hub).filter(Hub.id == body.hub_id).first()
        if not hub:
            raise HTTPException(status_code=404, detail="Hub not found")
        user.hub_id = body.hub_id

    db.commit()
    db.refresh(user)

    return {
        "id":         user.id,
        "name":       user.name,
        "email":      user.email,
        "phone":      user.phone,
        "avatar_url": user.avatar_url,
        "hub_id":     user.hub_id,
        "status":     user.status,
        "role":       user.role,
    }


@router.post("/me/avatar", status_code=200)
async def upload_user_avatar(
    avatar: UploadFile           = File(...),
    db:     Session              = Depends(get_db),
    user:   User                 = Depends(get_current_user_allow_pending),
):
    """Upload and update user avatar image."""
    if avatar.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=400, detail="Avatar must be JPEG, PNG, or WebP")
    data = await avatar.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Avatar must be under 5 MB")
    
    url = await upload_avatar(user_id=user.id, data=data, content_type=avatar.content_type)
    if url:
        user.avatar_url = url
        db.commit()
        db.refresh(user)

    return {
        "id":         user.id,
        "avatar_url": user.avatar_url,
    }


@router.get("/me/hub-leader")
async def get_my_hub_leader(
    user: User = Depends(get_current_user_allow_pending),
    db:   Session = Depends(get_db),
):
    """Returns the hub leader for this volunteer's hub."""
    if not user.hub_id:
        return {"leader": None}

    leader = db.query(User).filter(
        User.hub_id == user.hub_id,
        User.role == UserRole.hub_leader,
        User.status == UserStatus.active,
    ).first()

    if not leader:
        return {"leader": None}

    return {
        "leader": {
            "id":         leader.id,
            "name":       leader.name,
            "avatar_url": leader.avatar_url,
            "phone":      leader.phone,
        }
    }
