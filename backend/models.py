"""
REACH — Database Models
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, DateTime, Date,
    ForeignKey, Enum, CheckConstraint, Index, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from .database import Base


# ─────────────────────────────────────────────
# Enums — all inherit (str, enum.Enum) so .value serialises correctly
# ─────────────────────────────────────────────

class UserRole(str, enum.Enum):
    volunteer         = "volunteer"
    hub_leader        = "hub_leader"
    minister          = "minister"
    registration_team = "registration_team"
    decisions_team    = "decisions_team"


class UserStatus(str, enum.Enum):
    pending  = "pending"
    active   = "active"
    rejected = "rejected"


class CampaignStatus(str, enum.Enum):
    active   = "active"
    archived = "archived"


class ContactStatusCode(str, enum.Enum):
    message_sent    = "message_sent"
    coming          = "coming"
    undecided       = "undecided"
    not_coming      = "not_coming"
    no_answer       = "no_answer"
    wrong_number    = "wrong_number"
    needs_transport = "needs_transport"
    unreachable     = "unreachable"


class TransportStatus(str, enum.Enum):
    pending  = "pending"
    arranged = "arranged"


class FollowUpQueueType(str, enum.Enum):
    thank_you    = "thank_you"
    missed_you   = "missed_you"
    soft_checkin = "soft_checkin"
    discipleship = "discipleship"


class FollowUpStatus(str, enum.Enum):
    pending     = "pending"
    in_progress = "in_progress"
    done        = "done"


# ─────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────

def new_uuid():
    return str(uuid.uuid4())


# ─────────────────────────────────────────────
# Tables
# ─────────────────────────────────────────────

class Organisation(Base):
    __tablename__ = "organisations"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    name       = Column(String(200), nullable=False)
    slug       = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    campaigns = relationship("Campaign", back_populates="organisation")
    users     = relationship("User", back_populates="organisation")


class Campaign(Base):
    __tablename__ = "campaigns"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)
    name            = Column(String(200), nullable=False)
    target_count    = Column(Integer, nullable=True)
    programme_date  = Column(DateTime(timezone=True), nullable=True)
    event_date      = Column(Date, nullable=True)
    venue           = Column(String(300), nullable=True)
    status          = Column(Enum(CampaignStatus), nullable=False, default=CampaignStatus.active)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    created_by      = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    # Attendance mode
    attendance_mode_open  = Column(Boolean, nullable=False, default=False)
    attendance_opened_at  = Column(DateTime(timezone=True), nullable=True)
    attendance_closed_at  = Column(DateTime(timezone=True), nullable=True)

    organisation = relationship("Organisation", back_populates="campaigns")
    hubs         = relationship("Hub", back_populates="campaign")
    contacts     = relationship("Contact", back_populates="campaign")
    templates    = relationship("MessageTemplate", back_populates="campaign")
    attendances  = relationship("Attendance", back_populates="campaign")
    decisions    = relationship("Decision", back_populates="campaign")


class Hub(Base):
    __tablename__ = "hubs"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    campaign_id     = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=False)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)
    name            = Column(String(200), nullable=False)
    zone            = Column(String(100), nullable=True)
    location        = Column(Text, nullable=True)
    description     = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    campaign = relationship("Campaign", back_populates="hubs")
    users    = relationship("User", back_populates="hub")


class User(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)
    hub_id          = Column(UUID(as_uuid=False), ForeignKey("hubs.id"), nullable=True)

    phone      = Column(String(20),  nullable=True, comment="E.164 format")
    email      = Column(String(254), nullable=True)
    name       = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)

    role       = Column(Enum(UserRole),   nullable=False, default=UserRole.volunteer)
    status     = Column(Enum(UserStatus), nullable=False, default=UserStatus.pending)
    created_at     = Column(DateTime(timezone=True), server_default=func.now())
    last_active_at = Column(DateTime(timezone=True), nullable=True)

    # Event team role flags
    is_registration_team = Column(Boolean, nullable=False, default=False)
    is_decisions_team    = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("phone", "organisation_id", name="uq_user_phone_org"),
        UniqueConstraint("email", "organisation_id", name="uq_user_email_org"),
        CheckConstraint(r"phone ~ '^\+[1-9]\d{7,14}$'", name="chk_phone_e164"),
        Index("ix_users_hub_id",  "hub_id"),
        Index("ix_users_status",  "status"),
        Index("ix_users_org_role","organisation_id", "role"),
    )

    organisation   = relationship("Organisation", back_populates="users")
    hub            = relationship("Hub", back_populates="users")
    contacts       = relationship("Contact", foreign_keys="Contact.added_by", back_populates="volunteer")
    refresh_tokens = relationship("RefreshToken", back_populates="user")
    audit_logs     = relationship("AuditLog", back_populates="user")


class Contact(Base):
    __tablename__ = "contacts"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    campaign_id     = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=False)
    added_by        = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)

    name               = Column(String(100), nullable=False)
    phone              = Column(String(20), nullable=False, comment="E.164 format")
    location           = Column(String(200), nullable=False)
    notes              = Column(String(1000), nullable=True)
    needs_transport    = Column(Boolean, nullable=False, default=False)
    transport_location = Column(String(200), nullable=True)

    # New columns
    source          = Column(String(20), nullable=False, default="volunteer")
    how_did_you_hear= Column(String(200), nullable=True)
    email           = Column(String(254), nullable=True)
    second_phone    = Column(String(20),  nullable=True)
    attended        = Column(Boolean, nullable=False, default=False)
    attended_at     = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("phone", "campaign_id", name="uq_contact_phone_campaign"),
        CheckConstraint(r"phone ~ '^\+[1-9]\d{7,14}$'", name="chk_contact_phone_e164"),
        CheckConstraint("source IN ('volunteer','walk-in','paper_form')", name="chk_contact_source"),
        Index("ix_contacts_added_by",        "added_by"),
        Index("ix_contacts_campaign_id",      "campaign_id"),
        Index("ix_contacts_deleted_at",       "deleted_at"),
        Index("ix_contacts_organisation_id",  "organisation_id"),
        Index("ix_contacts_needs_transport",  "needs_transport"),
        Index("ix_contacts_attended",         "attended", "campaign_id"),
        Index("ix_contacts_source",           "source"),
    )

    campaign         = relationship("Campaign", back_populates="contacts")
    volunteer        = relationship("User", foreign_keys=[added_by], back_populates="contacts")
    statuses         = relationship("ContactStatus", back_populates="contact",
                                    order_by=lambda: ContactStatus.updated_at)
    message_sends    = relationship("MessageSend", back_populates="contact")
    logistics        = relationship("Logistics", back_populates="contact", uselist=False)
    follow_up_queues = relationship("FollowUpQueue", back_populates="contact")
    attendances      = relationship("Attendance", back_populates="contact")

    @property
    def current_status(self):
        if self.statuses:
            return self.statuses[-1].status_code
        return None


class ContactStatus(Base):
    __tablename__ = "contact_statuses"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    contact_id  = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=False)
    status_code = Column(Enum(ContactStatusCode), nullable=False)
    updated_by  = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    updated_at  = Column(DateTime(timezone=True), server_default=func.now())
    note        = Column(String(500), nullable=True)

    contact         = relationship("Contact", back_populates="statuses")
    updated_by_user = relationship("User")

    __table_args__ = (
        Index("ix_contact_statuses_contact_id",     "contact_id"),
        Index("ix_contact_statuses_updated_by",     "updated_by"),
        Index("ix_contact_statuses_contact_updated","contact_id", "updated_at"),
        Index("ix_contact_statuses_code",           "status_code"),
    )


class MessageTemplate(Base):
    __tablename__ = "message_templates"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    campaign_id     = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=False)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)
    label           = Column(String(100), nullable=False)
    body            = Column(Text, nullable=False)
    created_by      = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    is_active       = Column(Boolean, nullable=False, default=True)
    expires_at      = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    campaign      = relationship("Campaign", back_populates="templates")
    message_sends = relationship("MessageSend", back_populates="template")


class MessageSend(Base):
    __tablename__ = "message_sends"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    contact_id  = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=False)
    template_id = Column(UUID(as_uuid=False), ForeignKey("message_templates.id"), nullable=False)
    sent_by     = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    sent_at     = Column(DateTime(timezone=True), server_default=func.now())

    contact  = relationship("Contact", back_populates="message_sends")
    template = relationship("MessageTemplate", back_populates="message_sends")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    user_id         = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=True)
    action          = Column(String(100), nullable=False)
    entity_type     = Column(String(50),  nullable=True)
    entity_id       = Column(String(100), nullable=True)
    ip_address      = Column(String(45),  nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    log_metadata    = Column(Text, nullable=True)

    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_logs_user_id",    "user_id"),
        Index("ix_audit_logs_created_at", "created_at"),
    )


class OTPSession(Base):
    __tablename__ = "otp_sessions"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    identifier_hash = Column(String(200), nullable=False, unique=True)
    user_id         = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    channel         = Column(String(10),  nullable=False, default="sms")
    otp_hash        = Column(String(200), nullable=False)
    attempts        = Column(Integer, nullable=False, default=0)
    expires_at      = Column(DateTime(timezone=True), nullable=False)
    locked_until    = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_otp_sessions_hash", "identifier_hash"),
    )


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    token_hash  = Column(String(200), nullable=False, unique=True)
    user_id     = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    family_id   = Column(UUID(as_uuid=False), nullable=False)
    device_hint = Column(String(200), nullable=True)
    used_at     = Column(DateTime(timezone=True), nullable=True)
    revoked     = Column(Boolean, nullable=False, default=False)
    expires_at  = Column(DateTime(timezone=True), nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="refresh_tokens")

    __table_args__ = (
        Index("ix_refresh_tokens_family_id", "family_id"),
        Index("ix_refresh_tokens_user_id",   "user_id"),
        Index("ix_refresh_tokens_hash",      "token_hash"),
    )


class Logistics(Base):
    __tablename__ = "logistics"

    id               = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    contact_id       = Column(UUID(as_uuid=False), ForeignKey("contacts.id"),
                               nullable=False, unique=True)
    organisation_id  = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)
    transport_status = Column(Enum(TransportStatus), nullable=False,
                               default=TransportStatus.pending)
    coordinator_note = Column(String(500), nullable=True)
    updated_by       = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    updated_at       = Column(DateTime(timezone=True), server_default=func.now(),
                               onupdate=func.now())

    contact = relationship("Contact", back_populates="logistics")


class FollowUpQueue(Base):
    __tablename__ = "follow_up_queues"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    contact_id      = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=False)
    campaign_id     = Column(UUID(as_uuid=False), ForeignKey("campaigns.id"), nullable=False)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)
    queue_type      = Column(Enum(FollowUpQueueType), nullable=False)
    assigned_to     = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    status          = Column(Enum(FollowUpStatus), nullable=False, default=FollowUpStatus.pending)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    contact = relationship("Contact", back_populates="follow_up_queues")


class InviteToken(Base):
    """One-time invite tokens. Raw token never stored — only SHA-256 hash."""
    __tablename__ = "invite_tokens"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    token_hash  = Column(String(200), nullable=False, unique=True)
    role        = Column(Enum(UserRole), nullable=False, default=UserRole.hub_leader)
    hub_id      = Column(UUID(as_uuid=False), ForeignKey("hubs.id"), nullable=True)
    phone       = Column(String(20),  nullable=True)
    email       = Column(String(254), nullable=True)
    channel     = Column(String(10),  nullable=False, default="sms")
    invited_by  = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    name_hint   = Column(String(100), nullable=True)
    expires_at  = Column(DateTime(timezone=True), nullable=False)
    claimed_at  = Column(DateTime(timezone=True), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    hub             = relationship("Hub")
    invited_by_user = relationship("User", foreign_keys=[invited_by])

    __table_args__ = (
        Index("ix_invite_tokens_token_hash", "token_hash"),
    )


# ─── New: Attendance ──────────────────────────────────────────────────────────

class Attendance(Base):
    __tablename__ = "attendances"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    campaign_id     = Column(UUID(as_uuid=False), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    contact_id      = Column(UUID(as_uuid=False), ForeignKey("contacts.id"),  nullable=True)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)
    checked_in_by   = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    checked_in_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    is_walk_in      = Column(Boolean, nullable=False, default=False)
    source          = Column(String(20), nullable=False, default="gate_search")
    how_did_you_hear= Column(String(200), nullable=True)
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    campaign      = relationship("Campaign", back_populates="attendances")
    contact       = relationship("Contact", back_populates="attendances")
    checked_in_by_user = relationship("User", foreign_keys=[checked_in_by])

    __table_args__ = (
        CheckConstraint("source IN ('gate_search','walk-in','paper_form')", name="chk_att_source"),
        Index("ix_attendances_campaign",   "campaign_id"),
        Index("ix_attendances_contact",    "contact_id"),
        Index("ix_attendances_source",     "source"),
        Index("ix_attendances_checked_in", "checked_in_at"),
    )


# ─── New: Decision ────────────────────────────────────────────────────────────

class Decision(Base):
    __tablename__ = "decisions"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    campaign_id     = Column(UUID(as_uuid=False), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)
    contact_id      = Column(UUID(as_uuid=False), ForeignKey("contacts.id"), nullable=True)
    counsellor_id   = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    source          = Column(String(20), nullable=False, default="real_time")

    # Identity
    name             = Column(String(100), nullable=False)
    phone_1          = Column(String(20),  nullable=False)
    phone_2          = Column(String(20),  nullable=True)
    whatsapp_number  = Column(String(20),  nullable=True)
    email            = Column(String(254), nullable=True)
    area             = Column(String(200), nullable=True)
    nearest_landmark = Column(String(200), nullable=True)

    # Decision
    decision_type        = Column(String(30),  nullable=False)
    decision_type_other  = Column(String(200), nullable=True)
    first_time           = Column(Boolean, nullable=True)
    currently_attending  = Column(String(10), nullable=True)
    current_church       = Column(String(200), nullable=True)
    wants_church_referral= Column(Boolean, nullable=True)
    referral_area        = Column(String(200), nullable=True)

    # Background
    age_range        = Column(String(20),  nullable=True)
    gender           = Column(String(30),  nullable=True)
    occupation       = Column(String(200), nullable=True)
    how_did_you_hear = Column(String(200), nullable=True)
    brought_by       = Column(String(200), nullable=True)
    notes            = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    campaign   = relationship("Campaign", back_populates="decisions")
    counsellor = relationship("User", foreign_keys=[counsellor_id])

    __table_args__ = (
        CheckConstraint(
            "source IN ('real_time','paper_form')", name="chk_dec_source"
        ),
        CheckConstraint(
            "decision_type IN ('salvation','rededication','holy_spirit','healing','prayer','other')",
            name="chk_dec_type"
        ),
        Index("ix_decisions_campaign",   "campaign_id"),
        Index("ix_decisions_counsellor", "counsellor_id"),
        Index("ix_decisions_type",       "decision_type"),
        Index("ix_decisions_created",    "created_at"),
    )


# ─── New: Export Log ──────────────────────────────────────────────────────────

class ExportLog(Base):
    __tablename__ = "export_log"

    id              = Column(UUID(as_uuid=False), primary_key=True, default=new_uuid)
    organisation_id = Column(UUID(as_uuid=False), ForeignKey("organisations.id"), nullable=False)
    exported_by     = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    export_type     = Column(String(60),  nullable=False)
    filter_hub_id   = Column(UUID(as_uuid=False), nullable=True)
    filter_status   = Column(String(30),  nullable=True)
    date_range_from = Column(Date, nullable=True)
    date_range_to   = Column(Date, nullable=True)
    row_count       = Column(Integer, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    exported_by_user = relationship("User", foreign_keys=[exported_by])

    __table_args__ = (
        Index("ix_export_log_org", "organisation_id"),
        Index("ix_export_log_by",  "exported_by"),
    )
