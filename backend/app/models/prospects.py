from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import OpportunityStatus, VerificationStatus, db_enum

if TYPE_CHECKING:
    from app.models.events import Event
    from app.models.outreach import Call, FollowUpTask, Offer, OutreachMessage


class Prospect(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "prospects"

    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(180), nullable=False)
    website_url: Mapped[str | None] = mapped_column(Text)
    industry: Mapped[str | None] = mapped_column(String(100), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    contact_name: Mapped[str | None] = mapped_column(String(160))
    contact_role: Mapped[str | None] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(32))
    location: Mapped[str | None] = mapped_column(String(160))
    source_url: Mapped[str | None] = mapped_column(Text)
    source_notes: Mapped[str | None] = mapped_column(Text)
    fit_reason: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[VerificationStatus] = mapped_column(db_enum(VerificationStatus, "verification_status"), nullable=False, default=VerificationStatus.UNVERIFIED, server_default="unverified", index=True)
    opted_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    opted_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opt_out_reason: Mapped[str | None] = mapped_column(Text)

    opportunities: Mapped[list[Opportunity]] = relationship(back_populates="prospect")


class Opportunity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "opportunities"

    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    prospect_id: Mapped[UUID] = mapped_column(ForeignKey("prospects.id", ondelete="RESTRICT"), nullable=False, index=True)
    status: Mapped[OpportunityStatus] = mapped_column(db_enum(OpportunityStatus, "opportunity_status"), nullable=False, default=OpportunityStatus.PROSPECT_FOUND, server_default="prospect_found", index=True)
    organizer_notes: Mapped[str | None] = mapped_column(Text)
    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_action: Mapped[str | None] = mapped_column(String(500))
    next_action_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    event: Mapped[Event] = relationship(back_populates="opportunities")
    prospect: Mapped[Prospect] = relationship(back_populates="opportunities")
    status_history: Mapped[list[OpportunityStatusHistory]] = relationship(back_populates="opportunity", cascade="all, delete-orphan")
    messages: Mapped[list[OutreachMessage]] = relationship(back_populates="opportunity", cascade="all, delete-orphan")
    calls: Mapped[list[Call]] = relationship(back_populates="opportunity", cascade="all, delete-orphan")
    offers: Mapped[list[Offer]] = relationship(back_populates="opportunity", cascade="all, delete-orphan")
    tasks: Mapped[list[FollowUpTask]] = relationship(back_populates="opportunity", cascade="all, delete-orphan")


class OpportunityStatusHistory(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "opportunity_status_history"

    opportunity_id: Mapped[UUID] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_status: Mapped[OpportunityStatus | None] = mapped_column(db_enum(OpportunityStatus, "opportunity_status_previous"))
    new_status: Mapped[OpportunityStatus] = mapped_column(db_enum(OpportunityStatus, "opportunity_status_next"), nullable=False)
    changed_by: Mapped[UUID] = mapped_column(Uuid, ForeignKey("auth.users.id"), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)

    opportunity: Mapped[Opportunity] = relationship(back_populates="status_history")
