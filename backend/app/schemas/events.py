"""Event, resource-need and dashboard API types.

Validation lives here (and in services), never only in the UI.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, StringConstraints, model_validator

NeedCategory = Literal["cash", "cloud_credits", "prizes", "food", "merchandise", "other"]
NeedPriority = Literal["low", "medium", "high"]
NeedStatus = Literal["open", "in_progress", "partially_covered", "covered"]

Name160 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Short80 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Location200 = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Currency = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Z]{3}$")]
Attendees = Annotated[int, Field(ge=1, le=1_000_000)]


def _check_date_range(start: date | None, end: date | None) -> None:
    if start and end and end < start:
        raise ValueError("end_date cannot be before start_date")


class EventInput(BaseModel):
    name: Name160
    event_type: Short80
    institution: Name160
    start_date: date
    end_date: date | None = None
    description: str | None = None
    location: Location200 | None = None
    is_online: bool = False
    expected_attendees: Attendees | None = None
    target_audience: str | None = None
    website_url: HttpUrl | None = None
    organizer_name: Name160 | None = None
    organizer_email: EmailStr | None = None

    @model_validator(mode="after")
    def _valid_dates(self) -> EventInput:
        _check_date_range(self.start_date, self.end_date)
        return self


class EventPatch(BaseModel):
    """Partial update. The merged start/end range is re-checked in the route."""

    name: Name160 | None = None
    event_type: Short80 | None = None
    institution: Name160 | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None
    location: Location200 | None = None
    is_online: bool | None = None
    expected_attendees: Attendees | None = None
    target_audience: str | None = None
    website_url: HttpUrl | None = None
    organizer_name: Name160 | None = None
    organizer_email: EmailStr | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    event_type: str
    institution: str
    start_date: date
    end_date: date | None
    description: str | None
    location: str | None
    is_online: bool
    expected_attendees: int | None
    target_audience: str | None
    website_url: str | None
    organizer_name: str | None
    organizer_email: str | None
    created_at: datetime
    updated_at: datetime


def check_need_amounts(category: str, target_amount: Decimal | None) -> None:
    """Cash needs require a positive target amount; in-kind needs may use quantity and/or value."""
    if category == "cash" and (target_amount is None or target_amount <= 0):
        raise ValueError("Cash needs require a target_amount greater than 0")


class ResourceNeedInput(BaseModel):
    category: NeedCategory
    title: Name160
    description: str | None = None
    target_amount: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] | None = None
    currency: Currency = "INR"
    target_quantity: Annotated[int, Field(ge=1)] | None = None
    deadline: date | None = None
    priority: NeedPriority = "medium"
    status: NeedStatus = "open"
    notes: str | None = None

    @model_validator(mode="after")
    def _cash_needs_amount(self) -> ResourceNeedInput:
        check_need_amounts(self.category, self.target_amount)
        return self


class ResourceNeedPatch(BaseModel):
    """Partial update. The cash-amount rule is re-checked on the merged record in the route."""

    category: NeedCategory | None = None
    title: Name160 | None = None
    description: str | None = None
    target_amount: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] | None = None
    currency: Currency | None = None
    target_quantity: Annotated[int, Field(ge=1)] | None = None
    deadline: date | None = None
    priority: NeedPriority | None = None
    status: NeedStatus | None = None
    notes: str | None = None


class ResourceNeedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_id: UUID
    category: NeedCategory
    title: str
    description: str | None
    target_amount: Decimal | None
    currency: str
    target_quantity: int | None
    deadline: date | None
    priority: NeedPriority
    status: NeedStatus
    notes: str | None
    created_at: datetime
    updated_at: datetime


class CashSummaryOut(BaseModel):
    currency: str
    target: Decimal
    accepted: Decimal
    fulfilled: Decimal
    secured: Decimal
    gap: Decimal
    pending_offer_count: int
    unknown_value_secured_count: int
    other_currency_count: int


class InKindOfferOut(BaseModel):
    id: UUID
    opportunity_id: UUID
    company_name: str
    support_type: NeedCategory
    stated_value: Decimal | None
    currency: str
    quantity: int | None
    status: Literal["accepted", "fulfilled"]


class RecentCallOut(BaseModel):
    id: UUID
    opportunity_id: UUID
    company_name: str
    status: str
    outcome: str | None
    created_at: datetime


class DashboardOut(BaseModel):
    event_id: UUID
    cash: CashSummaryOut
    open_in_kind_needs: list[ResourceNeedOut]
    in_kind_secured: list[InKindOfferOut]
    opportunities_by_status: dict[str, int]
    open_task_count: int
    overdue_task_count: int
    recent_calls: list[RecentCallOut]
