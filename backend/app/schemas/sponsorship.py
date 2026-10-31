"""Prospect, opportunity, offer and follow-up API types.

Email and voice-call DTOs used by the sponsorship workflow.
"""

from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import phonenumbers
from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, StringConstraints, field_validator

# Must match ResourceCategory (models/enums.py) and the DB check constraint from migration 20261025_06.
SupportType = Literal[
    "cash", "cloud_credits", "equipment", "speakers", "mentors", "venue", "volunteers",
    "prizes", "food", "merchandise", "other",
]
OpportunityStatus = Literal[
    "prospect_found", "outreach_approved", "contact_attempted", "interested",
    "proposal_requested", "proposal_sent", "offer_received", "accepted", "fulfilled",
    "not_interested", "opted_out",
]
OfferStatus = Literal["proposed", "under_review", "accepted", "rejected", "fulfilled"]
TaskStatus = Literal["open", "in_progress", "completed", "canceled"]
ProspectVerification = Literal["unverified", "reviewed", "verified"]
VoiceCallStatus = Literal[
    "queued", "processing", "initiated", "in_progress", "retry_scheduled",
    "completed", "failed", "no_answer", "blocked", "submission_unknown", "cancelled",
]

Text160 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Text180 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)]
Text200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text500 = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Currency = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Z]{3}$")]
Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]


def normalize_phone(value: str | None) -> str | None:
    """Validate a phone number and store it in E.164 form (Indian numbers may omit +91)."""
    if value is None or not value.strip():
        return None
    try:
        parsed = phonenumbers.parse(value, "IN")
    except phonenumbers.NumberParseException as exc:
        raise ValueError("Enter a valid phone number") from exc
    if not phonenumbers.is_valid_number(parsed):
        raise ValueError("Enter a valid phone number")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


class _PhoneMixin(BaseModel):
    @field_validator("phone", mode="before", check_fields=False)
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return normalize_phone(value)


# ── Prospects ────────────────────────────────────────────────────────────────


class ProspectInput(_PhoneMixin):
    company_name: Text180
    website_url: HttpUrl | None = None
    industry: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    description: str | None = None
    contact_name: Text160 | None = None
    contact_role: Text160 | None = None
    email: EmailStr | None = None
    phone: str | None = None
    location: Text160 | None = None
    source_url: HttpUrl | None = None
    source_notes: str | None = None
    fit_reason: str | None = None
    verification_status: ProspectVerification = "unverified"


class ProspectPatch(_PhoneMixin):
    """Partial update. `opted_out` can only be switched on: an opt-out is never silently undone."""

    company_name: Text180 | None = None
    website_url: HttpUrl | None = None
    industry: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    description: str | None = None
    contact_name: Text160 | None = None
    contact_role: Text160 | None = None
    email: EmailStr | None = None
    phone: str | None = None
    location: Text160 | None = None
    source_url: HttpUrl | None = None
    source_notes: str | None = None
    fit_reason: str | None = None
    verification_status: ProspectVerification | None = None
    opted_out: Literal[True] | None = None
    opt_out_reason: str | None = None


class ProspectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_name: str
    website_url: str | None
    industry: str | None
    description: str | None
    contact_name: str | None
    contact_role: str | None
    email: str | None
    phone: str | None
    location: str | None
    source_url: str | None
    source_notes: str | None
    fit_reason: str | None
    verification_status: ProspectVerification
    opted_out: bool
    opted_out_at: datetime | None
    opt_out_reason: str | None
    created_at: datetime
    updated_at: datetime


# ── Opportunities ────────────────────────────────────────────────────────────


class OpportunityInput(BaseModel):
    prospect_id: UUID
    organizer_notes: str | None = None


class OpportunityWithProspectInput(BaseModel):
    """Create a new prospect manually and add it to an event's pipeline in one step."""

    prospect: ProspectInput
    organizer_notes: str | None = None


class OpportunityFromLeadInput(BaseModel):
    lead_id: UUID
    organizer_notes: str | None = None


class OpportunityPatch(BaseModel):
    status: OpportunityStatus | None = None
    status_reason: Text500 | None = None
    organizer_notes: str | None = None
    next_action: Text500 | None = None
    next_action_due_at: datetime | None = None


class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    previous_status: OpportunityStatus | None
    new_status: OpportunityStatus
    changed_by: UUID
    reason: str | None
    created_at: datetime


class ProspectSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_name: str
    contact_name: str | None
    industry: str | None
    email: str | None
    phone: str | None
    location: str | None
    verification_status: ProspectVerification
    opted_out: bool


class OpportunityListItemOut(BaseModel):
    id: UUID
    event_id: UUID
    event_name: str
    status: OpportunityStatus
    prospect: ProspectSummaryOut
    next_action: str | None
    next_action_due_at: datetime | None
    last_contacted_at: datetime | None
    latest_call_id: UUID | None = None
    latest_call_status: VoiceCallStatus | None = None
    offer_count: int
    open_task_count: int
    created_at: datetime
    updated_at: datetime


class MessageSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    channel: str
    direction: str
    message_type: str
    recipient: str | None
    subject: str | None
    body: str
    status: str
    sent_at: datetime | None
    error_message: str | None
    created_at: datetime


class CallSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    outcome: str | None
    review_status: str
    created_at: datetime


class CallAttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    attempt_number: int
    status: str
    bolna_call_id: str | None
    submitted_at: datetime | None
    started_at: datetime | None
    ended_at: datetime | None
    error_message: str | None
    created_at: datetime


class VoiceCallOut(CallSummaryOut):
    opportunity_id: UUID
    recipient_phone: str | None
    instructions: str | None
    next_attempt_at: datetime | None
    lease_expires_at: datetime | None
    attempt_count: int
    max_attempts: int
    last_error: str | None
    cancelled_at: datetime | None
    summary: str | None
    transcript_text: str | None
    recording_url: str | None
    extracted_fields: dict[str, Any]
    approved_at: datetime | None
    consent_confirmed_at: datetime | None
    started_at: datetime | None
    ended_at: datetime | None
    updated_at: datetime
    attempts: list[CallAttemptOut] = []


class VoiceCallApprovalInput(BaseModel):
    instructions: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None
    consent_confirmed: Literal[True]


class VoiceCallPreferenceInput(BaseModel):
    calling_window_start: time = time(9, 0)
    calling_window_end: time = time(22, 0)
    allowed_weekdays: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5, 6, 7])
    timezone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)] = "Asia/Kolkata"

    @field_validator("allowed_weekdays")
    @classmethod
    def weekdays(cls, value: list[int]) -> list[int]:
        unique = sorted(set(value))
        if not unique or any(day < 1 or day > 7 for day in unique):
            raise ValueError("allowed_weekdays must contain one or more ISO weekday numbers from 1 to 7")
        return unique

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("timezone must be a valid IANA timezone") from exc
        return value

    @field_validator("calling_window_end")
    @classmethod
    def same_day_window(cls, value: time, info) -> time:
        start = info.data.get("calling_window_start")
        if start and value <= start:
            raise ValueError("calling_window_end must be later than calling_window_start")
        return value


class VoiceCallPreferenceOut(VoiceCallPreferenceInput):
    model_config = ConfigDict(from_attributes=True)

    updated_at: datetime | None = None


# ── Offers ───────────────────────────────────────────────────────────────────


class OfferInput(BaseModel):
    support_type: SupportType
    resource_need_id: UUID | None = None
    stated_value: Money | None = None
    currency: Currency = "INR"
    quantity: Annotated[int, Field(ge=0)] | None = None
    conditions: str | None = None
    eligibility_requirements: str | None = None
    expected_timeline: str | None = None
    evidence_notes: str | None = None
    evidence_url: HttpUrl | None = None


class OfferPatch(BaseModel):
    support_type: SupportType | None = None
    resource_need_id: UUID | None = None
    stated_value: Money | None = None
    currency: Currency | None = None
    quantity: Annotated[int, Field(ge=0)] | None = None
    conditions: str | None = None
    eligibility_requirements: str | None = None
    expected_timeline: str | None = None
    evidence_notes: str | None = None
    evidence_url: HttpUrl | None = None
    status: OfferStatus | None = None
    confirm_verified: bool = False


class OfferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    opportunity_id: UUID
    resource_need_id: UUID | None
    support_type: SupportType
    stated_value: Decimal | None
    currency: str
    quantity: int | None
    conditions: str | None
    eligibility_requirements: str | None
    expected_timeline: str | None
    status: OfferStatus
    evidence_notes: str | None
    evidence_url: str | None
    organizer_verified_by: UUID | None
    organizer_verified_at: datetime | None
    allowed_next_statuses: list[OfferStatus] = []
    created_at: datetime
    updated_at: datetime


# ── Follow-up tasks ──────────────────────────────────────────────────────────


class TaskInput(BaseModel):
    event_id: UUID | None = None
    title: Text200
    due_at: datetime | None = None
    description: str | None = None


class TaskPatch(BaseModel):
    title: Text200 | None = None
    due_at: datetime | None = None
    description: str | None = None
    status: TaskStatus | None = None


class TaskOut(BaseModel):
    id: UUID
    opportunity_id: UUID | None
    event_id: UUID
    event_name: str
    company_name: str | None
    title: str
    description: str | None
    due_at: datetime | None
    status: TaskStatus
    source: str
    completed_at: datetime | None
    is_overdue: bool
    created_at: datetime
    updated_at: datetime


class OpportunityDetailOut(OpportunityListItemOut):
    organizer_notes: str | None
    prospect_detail: ProspectOut
    allowed_next_statuses: list[OpportunityStatus]
    outreach_blocked: bool
    status_history: list[StatusHistoryOut]
    offers: list[OfferOut]
    tasks: list[TaskOut]
    messages: list[MessageSummaryOut]
    calls: list[CallSummaryOut]


# ── Outreach inputs ─────────────────────────────────────────────────────────


class EmailDraftInput(BaseModel):
    message_type: Literal["initial", "follow_up", "proposal", "reply", "other"] = "initial"
    recipient: EmailStr | None = None
    subject: str | None = None
    body: str | None = None


class EmailDraftUpdateInput(BaseModel):
    recipient: EmailStr
    subject: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000)]


class ManualInteractionInput(BaseModel):
    direction: Literal["outbound", "inbound"] = "outbound"
    message_type: Literal["initial", "follow_up", "proposal", "reply", "other"] = "other"
    subject: str | None = Field(default=None, max_length=200)
    body: str = Field(min_length=1)
    recipient: EmailStr | None = None
    follow_up_title: Text200 | None = None
    follow_up_due_at: datetime | None = None


class CallReviewInput(BaseModel):
    extracted_fields: dict[str, Any] = Field(default_factory=dict)
    review_status: Literal["reviewed", "corrected"]
