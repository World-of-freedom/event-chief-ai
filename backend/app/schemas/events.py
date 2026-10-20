"""Event and resource-need API types.

TODO: add field-level validation after the product team signs off on required
fields and locale/date rules. Keep validation in schema/service layers, never UI only.
"""

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr, HttpUrl

NeedCategory = Literal["cash", "cloud_credits", "prizes", "food", "merchandise", "other"]
NeedPriority = Literal["low", "medium", "high"]


class EventInput(BaseModel):
    name: str
    event_type: str
    institution: str
    start_date: date
    end_date: date | None = None
    description: str | None = None
    location: str | None = None
    is_online: bool = False
    expected_attendees: int | None = None
    target_audience: str | None = None
    website_url: HttpUrl | None = None
    organizer_name: str | None = None
    organizer_email: EmailStr | None = None


class EventPatch(BaseModel):
    name: str | None = None
    event_type: str | None = None
    institution: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None
    location: str | None = None
    is_online: bool | None = None
    expected_attendees: int | None = None
    target_audience: str | None = None
    website_url: HttpUrl | None = None
    organizer_name: str | None = None
    organizer_email: EmailStr | None = None


class ResourceNeedInput(BaseModel):
    category: NeedCategory
    title: str
    description: str | None = None
    target_amount: Decimal | None = None
    currency: str = "INR"
    target_quantity: int | None = None
    deadline: date | None = None
    priority: NeedPriority = "medium"
    notes: str | None = None
