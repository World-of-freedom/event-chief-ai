"""Sponsorship domain DTOs; no workflow behavior is implemented here."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, HttpUrl

SupportType = Literal["cash", "cloud_credits", "prizes", "food", "merchandise", "other"]
OpportunityStatus = Literal[
    "prospect_found", "outreach_approved", "contact_attempted", "interested",
    "proposal_requested", "proposal_sent", "offer_received", "accepted", "fulfilled",
    "not_interested", "opted_out",
]


class ProspectInput(BaseModel):
    company_name: str
    website_url: HttpUrl | None = None
    industry: str | None = None
    description: str | None = None
    contact_name: str | None = None
    contact_role: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    location: str | None = None
    source_url: HttpUrl | None = None
    source_notes: str | None = None
    verification_status: Literal["unverified", "reviewed", "verified"] = "unverified"


class OpportunityInput(BaseModel):
    prospect_id: str
    organizer_notes: str | None = None


class OpportunityPatch(BaseModel):
    status: OpportunityStatus | None = None
    organizer_notes: str | None = None
    next_action: str | None = None
    next_action_due_at: datetime | None = None


class EmailDraftInput(BaseModel):
    message_type: Literal["initial", "follow_up", "proposal", "reply", "other"] = "initial"
    recipient: EmailStr | None = None
    subject: str | None = None
    body: str | None = None


class CallReviewInput(BaseModel):
    extracted_fields: dict[str, Any] = Field(default_factory=dict)
    review_status: Literal["reviewed", "corrected"]


class OfferInput(BaseModel):
    support_type: SupportType
    stated_value: Decimal | None = None
    currency: str = "INR"
    quantity: int | None = None
    conditions: str | None = None


class TaskInput(BaseModel):
    title: str
    due_at: datetime | None = None
    description: str | None = None
