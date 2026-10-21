from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, Numeric, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import Priority, ResourceCategory, ResourceNeedStatus, db_enum

if TYPE_CHECKING:
    from app.models.prospects import Opportunity


class Event(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("end_date is null or end_date >= start_date", name="events_valid_date_range"),
    )

    owner_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    institution: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    location: Mapped[str | None] = mapped_column(String(200))
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    expected_attendees: Mapped[int | None] = mapped_column(Integer)
    target_audience: Mapped[str | None] = mapped_column(Text)
    website_url: Mapped[str | None] = mapped_column(Text)
    organizer_name: Mapped[str | None] = mapped_column(String(160))
    organizer_email: Mapped[str | None] = mapped_column(String(320))

    resource_needs: Mapped[list[ResourceNeed]] = relationship(back_populates="event", cascade="all, delete-orphan")
    opportunities: Mapped[list[Opportunity]] = relationship(back_populates="event", cascade="all, delete-orphan")


class ResourceNeed(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "resource_needs"
    __table_args__ = (
        CheckConstraint("target_amount is null or target_amount >= 0", name="resource_needs_nonnegative_amount"),
        CheckConstraint("target_quantity is null or target_quantity >= 0", name="resource_needs_nonnegative_quantity"),
    )

    event_id: Mapped[UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    category: Mapped[ResourceCategory] = mapped_column(db_enum(ResourceCategory, "resource_category"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    target_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")
    target_quantity: Mapped[int | None] = mapped_column(Integer)
    deadline: Mapped[date | None] = mapped_column(Date)
    priority: Mapped[Priority] = mapped_column(db_enum(Priority, "need_priority"), nullable=False, default=Priority.MEDIUM, server_default="medium")
    status: Mapped[ResourceNeedStatus] = mapped_column(db_enum(ResourceNeedStatus, "resource_need_status"), nullable=False, default=ResourceNeedStatus.OPEN, server_default="open")
    notes: Mapped[str | None] = mapped_column(Text)

    event: Mapped[Event] = relationship(back_populates="resource_needs")
