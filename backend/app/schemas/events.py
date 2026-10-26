"""Event, resource-need and dashboard API types.

Validation lives here (and in services), never only in the UI.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, StringConstraints, model_validator

NeedCategory = Literal[
    "cash", "cloud_credits", "equipment", "speakers", "mentors", "venue", "volunteers",
    "prizes", "food", "merchandise", "other",
]
NeedPriority = Literal["low", "medium", "high"]
NeedStatus = Literal["open", "in_progress", "partially_covered", "covered"]

Name160 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Short80 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Location200 = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Currency = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Z]{3}$")]
Attendees = Annotated[int, Field(ge=1, le=1_000_000)]
Phone32 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=32)]
RequirementText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000)]

RESOURCE_TITLES: dict[str, str] = {
    "cash": "Cash funding",
    "cloud_credits": "Cloud & API credits",
    "equipment": "Equipment",
    "speakers": "Speakers",
    "mentors": "Mentors",
    "venue": "Venue",
    "volunteers": "Volunteers",
    "prizes": "Prizes",
    "food": "Food & beverage",
    "merchandise": "Merchandise",
    "other": "Other requirement",
}

# Values in ``details`` are category-specific metadata. The familiar generic
# amount and quantity columns remain useful for totals, offers and reporting.
DETAILS_REQUIRED: dict[str, tuple[str, ...]] = {
    "cash": ("funding_purpose",),
    "cloud_credits": ("quantity",),
    "equipment": ("equipment_type",),
    "speakers": ("speaker_profile",),
    "mentors": ("expertise_required",),
    "venue": ("venue_type",),
    "volunteers": ("volunteer_roles",),
    "prizes": ("prize_type",),
    "food": ("service_type",),
    "merchandise": ("merchandise_type",),
    "other": ("requirement_type",),
}
AMOUNT_REQUIRED = {"cash", "cloud_credits", "prizes"}
QUANTITY_REQUIRED = {"equipment", "speakers", "mentors", "venue", "volunteers", "prizes", "food", "merchandise"}


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
    organizer_phone: Phone32 | None = None
    parent_event_id: UUID | None = None

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
    organizer_phone: Phone32 | None = None
    parent_event_id: UUID | None = None


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
    organizer_phone: str | None
    parent_event_id: UUID | None
    is_subevent: bool
    created_at: datetime
    updated_at: datetime


def check_need_details(
    category: str,
    target_amount: Decimal | None,
    target_quantity: int | None,
    details: dict[str, str | int | float],
) -> None:
    """Ensure each resource category captures the information organizers need."""
    if category in AMOUNT_REQUIRED and (target_amount is None or target_amount <= 0):
        raise ValueError(f"{RESOURCE_TITLES[category]} requires an amount greater than 0")
    if category in QUANTITY_REQUIRED and (target_quantity is None or target_quantity < 1):
        raise ValueError(f"{RESOURCE_TITLES[category]} requires a quantity of at least 1")
    for field in DETAILS_REQUIRED[category]:
        value = details.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValueError(f"{field.replace('_', ' ')} is required for {RESOURCE_TITLES[category]}")


class ResourceNeedInput(BaseModel):
    category: NeedCategory
    title: Name160 | None = None
    description: RequirementText
    details: dict[str, str | int | float] = Field(default_factory=dict)
    target_amount: Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)] | None = None
    currency: Currency = "INR"
    target_quantity: Annotated[int, Field(ge=1)] | None = None
    deadline: date | None = None
    priority: NeedPriority = "medium"
    status: NeedStatus = "open"
    notes: str | None = None

    @model_validator(mode="after")
    def _valid_requirement(self) -> ResourceNeedInput:
        check_need_details(self.category, self.target_amount, self.target_quantity, self.details)
        if not self.title:
            self.title = RESOURCE_TITLES[self.category]
        return self


class ResourceNeedPatch(BaseModel):
    """Partial update. The cash-amount rule is re-checked on the merged record in the route."""

    category: NeedCategory | None = None
    title: Name160 | None = None
    description: RequirementText | None = None
    details: dict[str, str | int | float] | None = None
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
    details: dict[str, str | int | float]
    target_amount: Decimal | None
    currency: str
    target_quantity: int | None
    deadline: date | None
    priority: NeedPriority
    status: NeedStatus
    notes: str | None
    created_at: datetime
    updated_at: datetime


class EventCreateInput(EventInput):
    """Event creation stays short while allowing optional in-context requirements."""

    resource_needs: list[ResourceNeedInput] = Field(default_factory=list, max_length=25)


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
