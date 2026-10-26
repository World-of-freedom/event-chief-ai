"""Approval-gated email and manually recorded sponsorship interactions."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.routes._stubs import not_implemented
from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db_session
from app.core.settings import Settings, get_settings
from app.models.enums import MessageChannel, MessageDirection, MessageStatus, MessageType, OpportunityStatus, TaskSource, TaskStatus
from app.models.outreach import FollowUpTask, OutreachMessage
from app.models.prospects import Opportunity, OpportunityStatusHistory
from app.repositories.sponsorship import get_owned_opportunity
from app.schemas.sponsorship import CallReviewInput, EmailDraftInput, ManualInteractionInput, MessageSummaryOut
from app.services.outreach import OutreachDeliveryError, send_with_resend
from app.services.pipeline import OUTREACH_BLOCKED_STATUSES, allowed_opportunity_transitions

router = APIRouter(tags=["outreach", "calls"])


def _require_opportunity(db: Session, user: CurrentUser, opportunity_id: UUID) -> Opportunity:
    opportunity = get_owned_opportunity(db, user.uuid, opportunity_id)
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found.")
    return opportunity


def _require_message(db: Session, user: CurrentUser, message_id: UUID) -> OutreachMessage:
    message = db.scalar(
        select(OutreachMessage)
        .join(Opportunity, OutreachMessage.opportunity_id == Opportunity.id)
        .options(
            joinedload(OutreachMessage.opportunity).joinedload(Opportunity.prospect),
            joinedload(OutreachMessage.opportunity).joinedload(Opportunity.event),
        )
        .where(OutreachMessage.id == message_id, Opportunity.event.has(owner_id=user.uuid))
    )
    if not message:
        raise HTTPException(status_code=404, detail="Outreach message not found.")
    return message


def _assert_outreach_allowed(opportunity: Opportunity) -> None:
    if opportunity.prospect.opted_out or opportunity.status in OUTREACH_BLOCKED_STATUSES:
        raise HTTPException(status_code=409, detail="This prospect cannot be contacted because outreach is closed.")


def _default_draft(opportunity: Opportunity) -> tuple[str, str]:
    event = opportunity.event
    contact = opportunity.prospect.contact_name or "there"
    organizer = event.organizer_name or event.institution
    subject = f"Sponsorship opportunity: {event.name}"
    body = (
        f"Hi {contact},\n\n"
        f"I'm {organizer}, organizing {event.name}. "
        f"We're reaching out because {opportunity.prospect.company_name} may be a strong fit for our audience.\n\n"
        "Would you be open to discussing a sponsorship or in-kind support opportunity? "
        "I can share the event details and proposed benefits.\n\n"
        f"Best,\n{organizer}"
    )
    return subject, body


@router.post("/opportunities/{opportunity_id}/emails/draft", response_model=MessageSummaryOut, status_code=status.HTTP_201_CREATED)
def create_email_draft(
    opportunity_id: UUID,
    body: EmailDraftInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    opportunity = _require_opportunity(db, user, opportunity_id)
    _assert_outreach_allowed(opportunity)
    default_subject, default_body = _default_draft(opportunity)
    recipient = str(body.recipient) if body.recipient else opportunity.prospect.email
    if not recipient:
        raise HTTPException(status_code=422, detail="A recipient email is required before drafting outreach.")
    message = OutreachMessage(
        opportunity_id=opportunity.id,
        channel=MessageChannel.EMAIL,
        direction=MessageDirection.OUTBOUND,
        message_type=MessageType(body.message_type),
        recipient=recipient,
        subject=(body.subject or default_subject).strip() or default_subject,
        body=(body.body or default_body).strip() or default_body,
        status=MessageStatus.DRAFT,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@router.post("/outreach/{message_id}/approve", response_model=MessageSummaryOut)
def approve_email(
    message_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    message = _require_message(db, user, message_id)
    _assert_outreach_allowed(message.opportunity)
    if message.channel != MessageChannel.EMAIL or message.direction != MessageDirection.OUTBOUND:
        raise HTTPException(status_code=409, detail="Only outbound email drafts can be approved.")
    if message.status != MessageStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Only a draft can be approved.")
    message.status = MessageStatus.APPROVED
    message.approved_by = user.uuid
    message.approved_at = datetime.now(timezone.utc)
    opportunity = message.opportunity
    if opportunity.status == OpportunityStatus.PROSPECT_FOUND:
        next_status = OpportunityStatus.OUTREACH_APPROVED
        if next_status in allowed_opportunity_transitions(opportunity.status):
            db.add(OpportunityStatusHistory(
                opportunity_id=opportunity.id,
                previous_status=opportunity.status,
                new_status=next_status,
                changed_by=user.uuid,
                reason="Organizer approved email outreach",
            ))
            opportunity.status = next_status
    db.commit()
    db.refresh(message)
    return message


@router.post("/outreach/{message_id}/send", response_model=MessageSummaryOut)
def send_email(
    message_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
):
    message = _require_message(db, user, message_id)
    _assert_outreach_allowed(message.opportunity)
    if message.status in (MessageStatus.SENT, MessageStatus.DELIVERED):
        return message
    if message.status != MessageStatus.APPROVED:
        raise HTTPException(status_code=409, detail="Explicit organizer approval is required before sending outreach.")
    if not settings.configured_resend:
        raise HTTPException(status_code=503, detail="Email delivery is not configured on this server. The approved draft was kept unchanged.")
    if not message.recipient or not message.subject:
        raise HTTPException(status_code=422, detail="Approved outreach needs a recipient and subject.")

    message.status = MessageStatus.SENDING
    db.commit()
    try:
        provider_id = send_with_resend(
            api_key=settings.resend_api_key or "",
            sender=settings.resend_from_email or "",
            recipient=message.recipient,
            subject=message.subject,
            body=message.body,
            idempotency_key=str(message.send_idempotency_key),
        )
    except OutreachDeliveryError as exc:
        message.status = MessageStatus.FAILED
        message.error_message = str(exc)[:2000]
        db.commit()
        raise HTTPException(status_code=502, detail="Email delivery failed. You can review the saved draft and retry.") from exc

    message.status = MessageStatus.SENT
    message.provider_message_id = provider_id
    message.sent_at = datetime.now(timezone.utc)
    message.error_message = None
    message.opportunity.last_contacted_at = message.sent_at
    db.commit()
    db.refresh(message)
    return message


@router.post("/opportunities/{opportunity_id}/responses", response_model=MessageSummaryOut, status_code=status.HTTP_201_CREATED)
def record_response(
    opportunity_id: UUID,
    body: ManualInteractionInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """Record a human interaction without triggering any external action."""
    opportunity = _require_opportunity(db, user, opportunity_id)
    if body.direction == "outbound":
        _assert_outreach_allowed(opportunity)
    now = datetime.now(timezone.utc)
    message = OutreachMessage(
        opportunity_id=opportunity.id,
        channel=MessageChannel.MANUAL,
        direction=MessageDirection(body.direction),
        message_type=MessageType(body.message_type),
        recipient=str(body.recipient) if body.recipient else opportunity.prospect.email,
        subject=body.subject,
        body=body.body.strip(),
        status=MessageStatus.RECEIVED if body.direction == "inbound" else MessageStatus.SENT,
        sent_at=now if body.direction == "outbound" else None,
    )
    db.add(message)
    if body.direction == "outbound":
        opportunity.last_contacted_at = now
    if body.follow_up_title:
        db.add(FollowUpTask(
            owner_id=user.uuid,
            event_id=opportunity.event_id,
            opportunity_id=opportunity.id,
            title=body.follow_up_title,
            due_at=body.follow_up_due_at,
            status=TaskStatus.OPEN,
            source=TaskSource.MANUAL,
            description="Created while recording a manual sponsor interaction.",
        ))
    db.commit()
    db.refresh(message)
    return message


# Calls remain behind the external Bolna integration boundary and stay fail-closed.
@router.post("/opportunities/{opportunity_id}/calls")
def initiate_call(opportunity_id: str) -> None:
    not_implemented("Bolna call initiation")


@router.get("/calls/{call_id}")
def get_call(call_id: str) -> None:
    not_implemented("Call retrieval")


@router.post("/calls/{call_id}/review")
def review_call(call_id: str, _: CallReviewInput) -> None:
    not_implemented("Call review")
