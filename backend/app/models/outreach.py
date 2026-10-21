from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    CallOutcome, CallStatus, MessageChannel, MessageDirection, MessageStatus, MessageType,
    OfferStatus, ResourceCategory, ReviewStatus, TaskSource, TaskStatus,
    WebhookProcessingStatus, db_enum,
)

if TYPE_CHECKING:
    from app.models.prospects import Opportunity


class OutreachMessage(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "outreach_messages"

    opportunity_id: Mapped[UUID] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True)
    channel: Mapped[MessageChannel] = mapped_column(db_enum(MessageChannel, "message_channel"), nullable=False, default=MessageChannel.EMAIL, server_default="email")
    direction: Mapped[MessageDirection] = mapped_column(db_enum(MessageDirection, "message_direction"), nullable=False)
    message_type: Mapped[MessageType] = mapped_column(db_enum(MessageType, "message_type"), nullable=False)
    recipient: Mapped[str | None] = mapped_column(String(320))
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[MessageStatus] = mapped_column(db_enum(MessageStatus, "message_status"), nullable=False, default=MessageStatus.DRAFT, server_default="draft")
    approved_by: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("auth.users.id"))
    approved_at: Mapped[datetime | None] = mapped_column()
    provider_message_id: Mapped[str | None] = mapped_column(String(255))
    send_idempotency_key: Mapped[UUID] = mapped_column(nullable=False, server_default=text("gen_random_uuid()"))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(Text)

    opportunity: Mapped[Opportunity] = relationship(back_populates="messages")


class Call(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "calls"

    opportunity_id: Mapped[UUID] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True)
    bolna_call_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    status: Mapped[CallStatus] = mapped_column(db_enum(CallStatus, "call_status"), nullable=False, default=CallStatus.QUEUED, server_default="queued")
    outcome: Mapped[CallOutcome | None] = mapped_column(db_enum(CallOutcome, "call_outcome"))
    summary: Mapped[str | None] = mapped_column(Text)
    transcript_text: Mapped[str | None] = mapped_column(Text)
    recording_url: Mapped[str | None] = mapped_column(Text)
    extracted_fields: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    review_status: Mapped[ReviewStatus] = mapped_column(db_enum(ReviewStatus, "review_status"), nullable=False, default=ReviewStatus.NEEDS_REVIEW, server_default="needs_review")
    approved_by: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("auth.users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_confirmed_by: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("auth.users.id"))
    consent_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_webhook_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    opportunity: Mapped[Opportunity] = relationship(back_populates="calls")


class Offer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "offers"
    __table_args__ = (CheckConstraint("stated_value is null or stated_value >= 0", name="offers_nonnegative_value"),)

    opportunity_id: Mapped[UUID] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_need_id: Mapped[UUID | None] = mapped_column(ForeignKey("resource_needs.id", ondelete="SET NULL"))
    support_type: Mapped[ResourceCategory] = mapped_column(db_enum(ResourceCategory, "resource_category"), nullable=False)
    stated_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")
    quantity: Mapped[int | None] = mapped_column(Integer)
    conditions: Mapped[str | None] = mapped_column(Text)
    eligibility_requirements: Mapped[str | None] = mapped_column(Text)
    expected_timeline: Mapped[str | None] = mapped_column(Text)
    status: Mapped[OfferStatus] = mapped_column(db_enum(OfferStatus, "offer_status"), nullable=False, default=OfferStatus.PROPOSED, server_default="proposed")
    evidence_notes: Mapped[str | None] = mapped_column(Text)
    evidence_url: Mapped[str | None] = mapped_column(Text)
    organizer_verified_by: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("auth.users.id"))
    organizer_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sponsor_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    opportunity: Mapped[Opportunity] = relationship(back_populates="offers")


class FollowUpTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "follow_up_tasks"

    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False, index=True)
    opportunity_id: Mapped[UUID] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[TaskStatus] = mapped_column(db_enum(TaskStatus, "task_status"), nullable=False, default=TaskStatus.OPEN, server_default="open")
    source: Mapped[TaskSource] = mapped_column(db_enum(TaskSource, "task_source"), nullable=False, default=TaskSource.MANUAL, server_default="manual")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    opportunity: Mapped[Opportunity] = relationship(back_populates="tasks")


class WebhookEvent(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    __tablename__ = "webhook_events"
    __table_args__ = (UniqueConstraint("provider", "event_key", name="webhook_events_provider_event_key"),)

    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    event_key: Mapped[str] = mapped_column(String(255), nullable=False)
    call_id: Mapped[UUID | None] = mapped_column(ForeignKey("calls.id", ondelete="SET NULL"))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    processing_status: Mapped[WebhookProcessingStatus] = mapped_column(db_enum(WebhookProcessingStatus, "webhook_processing_status"), nullable=False, default=WebhookProcessingStatus.RECEIVED, server_default="received")
    error_message: Mapped[str | None] = mapped_column(Text)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
