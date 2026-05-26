"""
REACH — Pydantic Schemas
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator
import re


def validate_phone(v: str) -> str:
    """Normalise to E.164 and validate."""
    if not v:
        raise ValueError("Phone number is required.")
    # Strip spaces, dashes, parens
    cleaned = re.sub(r'[\s\-\(\)]', '', str(v))
    # Nigerian: 080xxxxxxxx → +23480xxxxxxxx
    if re.match(r'^0[789]\d{9}$', cleaned):
        cleaned = '+234' + cleaned[1:]
    # If no +, assume Nigeria
    if not cleaned.startswith('+'):
        cleaned = '+' + cleaned
    # Validate E.164
    if not re.match(r'^\+[1-9]\d{7,14}$', cleaned):
        raise ValueError(f"Invalid phone number: {v}. Use E.164 format, e.g. +2348012345678")
    return cleaned


def validate_email_address(v: str) -> str:
    """Validate email format."""
    if not v:
        raise ValueError("Email is required.")
    # Simple email validation
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', str(v)):
        raise ValueError(f"Invalid email address: {v}")
    return v.lower()


class InviteCreate(BaseModel):
    name_hint: Optional[str] = None
    phone:     Optional[str] = None
    email:     Optional[str] = None
    channel:   str = "sms"
    role:      str = "hub_leader"
    hub_id:    Optional[str] = None


class InviteOut(BaseModel):
    invite_url: str
    expires_at: datetime
    phone:      Optional[str] = None
    hub_name:   Optional[str] = None


class InvitePreview(BaseModel):
    valid:      bool
    error:      Optional[str] = None
    hub_name:   Optional[str] = None
    hub_zone:   Optional[str] = None
    name_hint:  Optional[str] = None
    phone_hint: Optional[str] = None
    expires_at: Optional[datetime] = None
    role:       Optional[str] = None


class ClaimInviteRequest(BaseModel):
    token: str
    phone: str
    otp:   str
    name:  Optional[str] = None

    @field_validator("phone")
    @classmethod
    def phone_e164(cls, v):
        return validate_phone(v)


# ─── OTP Auth Schemas ─────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    phone:   Optional[str] = None
    email:   Optional[str] = None
    channel: str = "sms"  # "sms" or "email"


class SendOTPResponse(BaseModel):
    detail:      str
    is_returning: bool


class VerifyOTPRequest(BaseModel):
    phone:   Optional[str] = None
    email:   Optional[str] = None
    channel: str = "sms"
    otp:     str
    name:    Optional[str] = None
    hub_id:  Optional[str] = None


class RefreshResponse(BaseModel):
    access_token: str
    expires_in:   int


class UserOut(BaseModel):
    id:       str
    name:     str
    email:    Optional[str] = None
    phone:    Optional[str] = None
    role:     str
    status:   str


class ActiveSessionOut(BaseModel):
    token_id:    str
    device_hint: Optional[str] = None
    created_at:  datetime
    expires_at:  datetime


class HubLeaderSummary(BaseModel):
    hub_id:            str
    hub_name:          str
    hub_zone:          Optional[str] = None
    leader_name:       Optional[str] = None
    leader_avatar_url: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    user_id:      str
    role:         str
    status:       str
    name:         Optional[str] = None
    is_new_user:  bool = False


# ─── Contact schemas (referenced by contacts router) ─────────────────────────
from typing import List
from enum import Enum as PyEnum

class ContactCreate(BaseModel):
    name:               str
    phone:              str
    location:           str
    notes:              Optional[str] = None
    needs_transport:    bool = False
    transport_location: Optional[str] = None
    source:             str = "volunteer"
    how_did_you_hear:   Optional[str] = None
    email:              Optional[str] = None

    @field_validator("phone")
    @classmethod
    def phone_e164(cls, v): return validate_phone(v)


class ContactBulkCreate(BaseModel):
    contacts: List[ContactCreate]


class ContactSyncBatch(BaseModel):
    contacts: List[ContactCreate]


class ContactListItem(BaseModel):
    id:             str
    name:           str
    phone:          str
    location:       str
    current_status: Optional[str] = None
    needs_transport:bool = False
    message_sent_count: int = 0


class ContactDetail(ContactListItem):
    notes:              Optional[str] = None
    transport_location: Optional[str] = None
    email:              Optional[str] = None
    source:             str = "volunteer"
    how_did_you_hear:   Optional[str] = None
    attended:           bool = False


class StatusUpdate(BaseModel):
    # P1-3.4: Field is status_code — frontend must send { status_code: "coming" }
    status_code: str
    note:        Optional[str] = None


class MessageSendLog(BaseModel):
    contact_id:  str
    template_id: str


class ContactSyncResult(BaseModel):
    created:    int = 0
    duplicates: int = 0
    errors:     List[str] = []


# ─── Template Schemas ─────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    label:      str
    body:       str
    expires_at: Optional[datetime] = None


class TemplateOut(BaseModel):
    id:         str
    label:      str
    body:       str
    is_active:  bool
    created_at: datetime


# ─── Management Schemas ──────────────────────────────────────────────────────

class LogisticsUpdate(BaseModel):
    transport_status:  str
    coordinator_note: Optional[str] = None


class ContactReassign(BaseModel):
    to_volunteer_id: str


class ApprovalAction(BaseModel):
    action: str


class CampaignCreate(BaseModel):
    name:           str
    target_count:   Optional[int] = None
    programme_date: Optional[datetime] = None
    venue:          Optional[str] = None
