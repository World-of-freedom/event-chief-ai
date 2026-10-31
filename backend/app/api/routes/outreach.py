"""Approval-gated email and manually recorded sponsorship interactions."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db_session
from app.core.settings import Settings, get_settings
from app.models.enums import CallStatus, MessageChannel, MessageDirection, MessageStatus, MessageType, OpportunityStatus, ReviewStatus, TaskSource, TaskStatus
from app.models.events import ResourceNeed
from app.models.outreach import Call, FollowUpTask, OutreachMessage, VoiceCallPreference
from app.models.prospects import Opportunity, OpportunityStatusHistory
from app.repositories.sponsorship import get_owned_call, get_owned_opportunity
from app.schemas.sponsorship import (
    CallReviewInput,
    EmailDraftInput,
    EmailDraftUpdateInput,
    ManualInteractionInput,
    MessageSummaryOut,
    VoiceCallApprovalInput,
    VoiceCallOut,
    VoiceCallPreferenceInput,
    VoiceCallPreferenceOut,
    normalize_phone,
)
from app.services.bolna import BolnaError, BolnaClient
from app.services.outreach import OutreachDeliveryError, send_with_gmail, send_with_resend
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


def _voice_context(db: Session, opportunity: Opportunity, instructions: str | None) -> dict[str, str]:
    event = opportunity.event
    needs = db.scalars(select(ResourceNeed).where(ResourceNeed.event_id == event.id).order_by(ResourceNeed.created_at)).all()
    need_summary = "; ".join(
        f"{need.title} ({need.category.value})" for need in needs[:8]
    ) or "Sponsorship support"
    return {
        "event_name": event.name,
        "event_type": event.event_type,
        "event_dates": " to ".join(part for part in (str(event.start_date), str(event.end_date) if event.end_date else None) if part),
        "event_location": event.location or ("Online" if event.is_online else "Not specified"),
        "event_description": event.description or "",
        "audience_summary": event.target_audience or "",
        "expected_attendees": str(event.expected_attendees or ""),
        "sponsorship_needs": need_summary,
        "organizer_name": event.organizer_name or event.institution,
        "organizer_contact": event.organizer_email or event.organizer_phone or "",
        "sponsor_name": opportunity.prospect.company_name,
        "sponsor_contact_name": opportunity.prospect.contact_name or "",
        "sponsor_contact_role": opportunity.prospect.contact_role or "",
        "organizer_instructions": instructions or "",
    }


def _call_out(call: Call) -> VoiceCallOut:
    return VoiceCallOut.model_validate(call)


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


@router.patch("/outreach/{message_id}/draft", response_model=MessageSummaryOut)
def update_email_draft(
    message_id: UUID,
    body: EmailDraftUpdateInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """Edit an unsent, outbound email draft before organizer approval."""
    message = _require_message(db, user, message_id)
    _assert_outreach_allowed(message.opportunity)
    if message.channel != MessageChannel.EMAIL or message.direction != MessageDirection.OUTBOUND:
        raise HTTPException(status_code=409, detail="Only outbound email drafts can be edited.")
    if message.status != MessageStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Only an unapproved email draft can be edited.")
    message.recipient = str(body.recipient)
    message.subject = body.subject
    message.body = body.body
    db.commit()
    db.refresh(message)
    return message


@router.delete("/outreach/{message_id}/draft", status_code=status.HTTP_204_NO_CONTENT)
def delete_email_draft(
    message_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> Response:
    """Delete one unsent email draft without affecting any other email activity."""
    message = _require_message(db, user, message_id)
    if message.channel != MessageChannel.EMAIL or message.direction != MessageDirection.OUTBOUND:
        raise HTTPException(status_code=409, detail="Only outbound email drafts can be deleted.")
    if message.status != MessageStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Only an unapproved email draft can be deleted.")
    db.delete(message)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    if message.status not in (MessageStatus.APPROVED, MessageStatus.FAILED):
        raise HTTPException(status_code=409, detail="Explicit organizer approval is required before sending outreach.")
    if not settings.configured_email_delivery:
        raise HTTPException(status_code=503, detail="Email delivery is not configured on this server. The approved draft was kept unchanged.")
    if not message.recipient or not message.subject:
        raise HTTPException(status_code=422, detail="Approved outreach needs a recipient and subject.")

    # The Resend free test sender only delivers to the account owner's inbox.
    # Preserve the sponsor recipient in the draft while redirecting real delivery.
    recipient = (
        settings.resend_test_recipient
        if settings.email_provider == "resend" and settings.resend_test_mode
        else message.recipient
    )

    # Claim the draft atomically so two clicks/tabs can't both send it (plan section 4.4).
    claimed = db.execute(
        update(OutreachMessage)
        .where(
            OutreachMessage.id == message.id,
            OutreachMessage.status.in_([MessageStatus.APPROVED, MessageStatus.FAILED]),
        )
        .values(status=MessageStatus.SENDING)
    ).rowcount
    db.commit()
    if not claimed:
        db.refresh(message)
        if message.status in (MessageStatus.SENT, MessageStatus.DELIVERED):
            return message
        raise HTTPException(status_code=409, detail="This email is already being sent.")
    db.refresh(message)
    try:
        if settings.email_provider == "gmail":
            provider_id = send_with_gmail(
                sender=settings.gmail_sender_email or "",
                app_password=settings.gmail_app_password.get_secret_value() if settings.gmail_app_password else "",
                recipient=recipient,
                subject=message.subject,
                body=message.body,
                idempotency_key=str(message.send_idempotency_key),
            )
        else:
            provider_id = send_with_resend(
                api_key=settings.resend_api_key or "",
                sender=settings.resend_from_email or "",
                recipient=recipient,
                subject=message.subject,
                body=message.body,
                idempotency_key=str(message.send_idempotency_key),
            )
    except OutreachDeliveryError as exc:
        message.status = MessageStatus.FAILED
        message.error_message = str(exc)[:2000]
        db.commit()
        raise HTTPException(status_code=502, detail="Email delivery failed. Please retry later.") from exc

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


@router.post("/opportunities/{opportunity_id}/calls", response_model=VoiceCallOut, status_code=status.HTTP_201_CREATED)
def initiate_call(
    opportunity_id: UUID,
    body: VoiceCallApprovalInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
):
    """Persist an approved call queue item; the worker submits it later."""
    opportunity = _require_opportunity(db, user, opportunity_id)
    _assert_outreach_allowed(opportunity)
    # Serialise approvals per opportunity, so a double-click cannot enqueue two calls.
    db.execute(select(Opportunity.id).where(Opportunity.id == opportunity.id).with_for_update())
    active_call = db.scalar(
        select(Call).where(
            Call.opportunity_id == opportunity.id,
            Call.status.in_(
                (
                    CallStatus.QUEUED,
                    CallStatus.PROCESSING,
                    CallStatus.INITIATED,
                    CallStatus.IN_PROGRESS,
                    CallStatus.RETRY_SCHEDULED,
                    CallStatus.SUBMISSION_UNKNOWN,
                )
            ),
        )
    )
    if active_call:
        raise HTTPException(status_code=409, detail="This opportunity already has an active voice call.")
    now = datetime.now(timezone.utc)
    phone_error: str | None = None
    try:
        recipient_phone = normalize_phone(opportunity.prospect.phone)
    except ValueError:
        recipient_phone = None
        phone_error = "The sponsor phone number is invalid."
    if not recipient_phone:
        phone_error = phone_error or "The sponsor does not have a phone number."
    call = Call(
        opportunity_id=opportunity.id,
        recipient_phone=recipient_phone,
        status=CallStatus.BLOCKED if phone_error else CallStatus.QUEUED,
        instructions=body.instructions,
        context_snapshot=_voice_context(db, opportunity, body.instructions),
        next_attempt_at=now if not phone_error else None,
        max_attempts=settings.worker_max_attempts,
        last_error=phone_error,
        approved_by=user.uuid,
        approved_at=now,
        consent_confirmed_by=user.uuid,
        consent_confirmed_at=now,
    )
    db.add(call)
    if opportunity.status == OpportunityStatus.PROSPECT_FOUND:
        db.add(OpportunityStatusHistory(
            opportunity_id=opportunity.id,
            previous_status=opportunity.status,
            new_status=OpportunityStatus.OUTREACH_APPROVED,
            changed_by=user.uuid,
            reason="Organizer approved voice outreach",
        ))
        opportunity.status = OpportunityStatus.OUTREACH_APPROVED
    db.commit()
    db.refresh(call)
    return _call_out(call)


@router.get("/calls/{call_id}", response_model=VoiceCallOut)
def get_call(call_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    call = get_owned_call(db, user.uuid, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found.")
    return _call_out(call)


@router.get("/calls/{call_id}/recording")
def get_call_recording(
    call_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> Response:
    """Proxy the provider recording for the authorized organizer's in-app audio player."""
    call = get_owned_call(db, user.uuid, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found.")
    if not call.recording_url:
        raise HTTPException(status_code=404, detail="Bolna has not provided a recording for this call.")
    try:
        audio, content_type = BolnaClient(api_key=settings.bolna_api_key or "").get_recording(call.recording_url)
    except BolnaError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return Response(content=audio, media_type=content_type or "audio/mpeg")


@router.post("/calls/{call_id}/cancel", response_model=VoiceCallOut)
def cancel_call(call_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    call = get_owned_call(db, user.uuid, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found.")
    if call.status not in (CallStatus.QUEUED, CallStatus.RETRY_SCHEDULED, CallStatus.BLOCKED):
        raise HTTPException(status_code=409, detail="Only a call that has not been submitted can be cancelled.")
    if call.status != CallStatus.CANCELLED:
        call.status = CallStatus.CANCELLED
        call.cancelled_at = datetime.now(timezone.utc)
        call.lease_expires_at = None
        db.commit()
        db.refresh(call)
    return _call_out(call)


@router.get("/voice-preferences", response_model=VoiceCallPreferenceOut)
def get_voice_preferences(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    preference = db.get(VoiceCallPreference, user.uuid)
    if preference:
        return VoiceCallPreferenceOut.model_validate(preference)
    return VoiceCallPreferenceOut()


@router.put("/voice-preferences", response_model=VoiceCallPreferenceOut)
def save_voice_preferences(
    body: VoiceCallPreferenceInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    preference = db.get(VoiceCallPreference, user.uuid)
    if preference is None:
        preference = VoiceCallPreference(user_id=user.uuid, **body.model_dump())
        db.add(preference)
    else:
        for key, value in body.model_dump().items():
            setattr(preference, key, value)
    db.commit()
    db.refresh(preference)
    return VoiceCallPreferenceOut.model_validate(preference)


@router.post("/calls/{call_id}/review", response_model=VoiceCallOut)
def review_call(
    call_id: UUID,
    body: CallReviewInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    call = get_owned_call(db, user.uuid, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found.")
    if call.status not in (CallStatus.COMPLETED, CallStatus.NO_ANSWER, CallStatus.FAILED):
        raise HTTPException(status_code=409, detail="A call can be reviewed after it reaches a final status.")
    call.extracted_fields = body.extracted_fields
    call.review_status = ReviewStatus(body.review_status)
    db.commit()
    db.refresh(call)
    return _call_out(call)
