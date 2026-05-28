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
from ..schemas import validate_phone, validate_email_address

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me/profile", status_code=200)
async def update_profile(
    name:   Optional[str]        = Form(None),
    email:  Optional[str]        = Form(None),
    phone:  Optional[str]        = Form(None),
    hub_id: Optional[str]        = Form(None),
    avatar: Optional[UploadFile] = File(None),
    db:     Session              = Depends(get_db),
    user:   User                 = Depends(get_current_user_allow_pending),
):
    """
    Update name, email, phone, hub, and/or profile picture.
    Available immediately after OTP verify (pending users allowed).
    Avatar arrives pre-cropped to 400×400 from the frontend crop UI.
    """
    if name:
        user.name = name.strip()[:100]

    if email:
        user.email = validate_email_address(email)

    if phone:
        user.phone = validate_phone(phone)

    if hub_id and not user.hub_id:
        # Validate hub exists
        from ..models import Hub
        hub = db.query(Hub).filter(Hub.id == hub_id).first()
        if not hub:
            raise HTTPException(status_code=404, detail="Hub not found")
        user.hub_id = hub_id

    if avatar:
        if avatar.content_type not in ("image/jpeg", "image/png", "image/webp"):
            raise HTTPException(status_code=400, detail="Avatar must be JPEG, PNG, or WebP")
        if avatar.size and avatar.size > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Avatar must be under 5 MB")
        data = await avatar.read()
        url = await upload_avatar(user_id=user.id, data=data, content_type=avatar.content_type)
        if url:
            user.avatar_url = url

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
