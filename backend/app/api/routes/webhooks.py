"""Public provider endpoints. Bolna authenticates with a configured secret header."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.core.settings import Settings, get_settings
from app.models.enums import CallAttemptStatus, CallOutcome, CallStatus, WebhookProcessingStatus
from app.models.outreach import Call, CallAttempt, WebhookEvent
from app.models.prospects import Opportunity
from app.services.bolna import BolnaPermanentError, normalize_webhook

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
TERMINAL_CALL_STATUSES = {CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.CANCELLED, CallStatus.BLOCKED}


def _attempt_status(call_status: CallStatus) -> CallAttemptStatus:
    if call_status == CallStatus.IN_PROGRESS:
        return CallAttemptStatus.IN_PROGRESS
    if call_status == CallStatus.COMPLETED:
        return CallAttemptStatus.COMPLETED
    if call_status in (CallStatus.FAILED, CallStatus.NO_ANSWER, CallStatus.CANCELLED):
        return CallAttemptStatus.FAILED
    return CallAttemptStatus.SUBMITTED


@router.post("/bolna")
async def bolna_webhook(
    request: Request,
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    expected = settings.bolna_webhook_secret
    supplied = request.headers.get("X-Bolna-Webhook-Token", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Bolna webhook is not configured.")
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid Bolna webhook token.")
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Bolna webhook body must be JSON.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Bolna webhook body must be an object.")
    try:
        update = normalize_webhook(payload)
    except BolnaPermanentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    existing = db.scalar(select(WebhookEvent.id).where(WebhookEvent.provider == "bolna", WebhookEvent.event_key == update.event_key))
    if existing:
        return {"status": "duplicate"}

    now = datetime.now(timezone.utc)
    attempt = db.scalar(
        select(CallAttempt)
        .where(CallAttempt.bolna_call_id == update.provider_call_id)
        .with_for_update()
    )
    call = attempt.call if attempt else db.scalar(
        select(Call)
        .where(Call.bolna_call_id == update.provider_call_id)
        .with_for_update()
    )
    event = WebhookEvent(
        provider="bolna",
        event_key=update.event_key,
        call_id=call.id if call else None,
        payload=payload,
        processing_status=WebhookProcessingStatus.RECEIVED,
    )
    db.add(event)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return {"status": "duplicate"}

    if not call:
        event.processing_status = WebhookProcessingStatus.IGNORED
        event.error_message = "No local call matched the Bolna execution ID."
        event.processed_at = now
        db.commit()
        return {"status": "ignored"}

    incoming_status = CallStatus(update.status)
    is_stale_attempt = bool(attempt and attempt.attempt_number < call.attempt_count)
    if attempt:
        attempt.status = _attempt_status(incoming_status)
        if incoming_status == CallStatus.IN_PROGRESS:
            attempt.started_at = attempt.started_at or now
        if incoming_status in TERMINAL_CALL_STATUSES or incoming_status == CallStatus.NO_ANSWER:
            attempt.ended_at = now
    if is_stale_attempt:
        # A later attempt is already underway. Keep its aggregate state intact,
        # while retaining this provider event and any opt-out instruction.
        if update.outcome == CallOutcome.OPT_OUT.value:
            call.opportunity.prospect.opted_out = True
            call.opportunity.prospect.opted_out_at = now
            call.opportunity.prospect.opt_out_reason = "Requested during Bolna voice call"
        event.processing_status = WebhookProcessingStatus.PROCESSED
        event.error_message = "Recorded without replacing the newer call attempt."
        event.processed_at = now
        db.commit()
        return {"status": "processed"}
    if call.status in TERMINAL_CALL_STATUSES and incoming_status not in TERMINAL_CALL_STATUSES:
        event.processing_status = WebhookProcessingStatus.IGNORED
        event.error_message = "Older provider status did not replace terminal local state."
        event.processed_at = now
        db.commit()
        return {"status": "ignored"}

    call.bolna_call_id = update.provider_call_id
    call.last_webhook_at = now
    call.lease_expires_at = None
    if update.summary:
        call.summary = update.summary
    if update.transcript_text:
        call.transcript_text = update.transcript_text
    if update.recording_url:
        call.recording_url = update.recording_url
    if update.extracted_fields:
        call.extracted_fields = update.extracted_fields
    if update.outcome:
        call.outcome = CallOutcome(update.outcome)

    if incoming_status == CallStatus.NO_ANSWER and call.attempt_count < call.max_attempts:
        call.status = CallStatus.RETRY_SCHEDULED
        call.next_attempt_at = now + timedelta(minutes=5)
        call.last_error = "No answer; retry scheduled."
    else:
        call.status = incoming_status
        if incoming_status == CallStatus.IN_PROGRESS:
            call.started_at = call.started_at or now
        if incoming_status in TERMINAL_CALL_STATUSES or incoming_status == CallStatus.NO_ANSWER:
            call.ended_at = now
    if call.outcome == CallOutcome.OPT_OUT:
        call.opportunity.prospect.opted_out = True
        call.opportunity.prospect.opted_out_at = now
        call.opportunity.prospect.opt_out_reason = "Requested during Bolna voice call"

    event.processing_status = WebhookProcessingStatus.PROCESSED
    event.processed_at = now
    db.commit()
    return {"status": "processed"}
