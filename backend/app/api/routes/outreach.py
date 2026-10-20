"""Outreach and call integration endpoints are explicitly non-operational stubs."""

from fastapi import APIRouter

from app.api.routes._stubs import not_implemented
from app.schemas.sponsorship import CallReviewInput, EmailDraftInput

router = APIRouter(tags=["outreach", "calls"])


@router.post("/opportunities/{opportunity_id}/emails/draft")
def create_email_draft(opportunity_id: str, _: EmailDraftInput) -> None:
    not_implemented("Email drafting")


@router.post("/outreach/{message_id}/approve")
def approve_email(message_id: str) -> None:
    not_implemented("Email approval")


@router.post("/outreach/{message_id}/send")
def send_email(message_id: str) -> None:
    not_implemented("Resend delivery")


@router.post("/opportunities/{opportunity_id}/responses")
def record_response(opportunity_id: str) -> None:
    not_implemented("Manual response logging")


@router.post("/opportunities/{opportunity_id}/calls")
def initiate_call(opportunity_id: str) -> None:
    not_implemented("Bolna call initiation")


@router.get("/calls/{call_id}")
def get_call(call_id: str) -> None:
    not_implemented("Call retrieval")


@router.post("/calls/{call_id}/review")
def review_call(call_id: str, _: CallReviewInput) -> None:
    not_implemented("Call review")

