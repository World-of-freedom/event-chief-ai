"""PostgreSQL-backed worker that submits organizer-approved calls to Bolna."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import logging
import signal
import sys
from threading import Event
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from app.core.database import get_session_factory
from app.core.settings import Settings, get_settings
from app.models.enums import CallAttemptStatus, CallStatus
from app.models.outreach import Call, CallAttempt, VoiceCallPreference
from app.models.prospects import Opportunity
from app.schemas.sponsorship import normalize_phone
from app.services.bolna import BolnaClient, BolnaPermanentError, BolnaRetryableError, BolnaSubmissionUnknownError

logger = logging.getLogger(__name__)
UTC = timezone.utc
ACTIVE_CLAIM_STATUSES = (CallStatus.QUEUED, CallStatus.RETRY_SCHEDULED)


@dataclass(frozen=True)
class CallingWindow:
    start: Any
    end: Any
    weekdays: tuple[int, ...]
    timezone_name: str


@dataclass(frozen=True)
class ClaimedAttempt:
    call_id: UUID
    attempt_id: UUID
    attempt_number: int
    organizer_id: UUID
    organizer_name: str | None
    event_name: str
    sponsor_name: str
    sponsor_contact_name: str | None


def _now() -> datetime:
    return datetime.now(UTC)


def effective_window(preference: VoiceCallPreference | None) -> CallingWindow:
    if preference is None:
        from datetime import time

        return CallingWindow(time(9, 0), time(22, 0), (1, 2, 3, 4, 5, 6, 7), "Asia/Kolkata")
    return CallingWindow(
        preference.calling_window_start,
        preference.calling_window_end,
        tuple(sorted(set(preference.allowed_weekdays))),
        preference.timezone,
    )


def next_permitted_at(now: datetime, preference: VoiceCallPreference | None) -> datetime:
    """Return now when callable; otherwise return the next configured local window in UTC."""
    window = effective_window(preference)
    try:
        zone = ZoneInfo(window.timezone_name)
    except ZoneInfoNotFoundError:
        zone = ZoneInfo("Asia/Kolkata")
    local_now = now.astimezone(zone)
    for offset in range(0, 8):
        day = local_now.date() + timedelta(days=offset)
        if day.isoweekday() not in window.weekdays:
            continue
        start = datetime.combine(day, window.start, tzinfo=zone)
        end = datetime.combine(day, window.end, tzinfo=zone)
        if offset == 0 and start <= local_now < end:
            return now
        if start > local_now:
            return start.astimezone(UTC)
    # Validation requires a nonempty day set, but retain a deterministic fallback.
    return now + timedelta(days=1)


def retry_at(now: datetime, attempt_count: int, preference: VoiceCallPreference | None) -> datetime:
    minutes = (5, 15, 60)
    candidate = now + timedelta(minutes=minutes[min(max(attempt_count - 1, 0), len(minutes) - 1)])
    return next_permitted_at(candidate, preference)


def _safe_context(data: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in data.items():
        if value is None:
            continue
        result[key] = value if isinstance(value, str) else json.dumps(value, default=str)
    return result


class BolnaWorker:
    def __init__(self, settings: Settings, client: BolnaClient | None = None) -> None:
        self.settings = settings
        self.client = client or BolnaClient(api_key=settings.bolna_api_key or "")
        self.stop_requested = Event()

    def request_shutdown(self, *_: object) -> None:
        logger.info("bolna_worker_shutdown_requested")
        self.stop_requested.set()

    @staticmethod
    def _log_call(stage: str, claimed: ClaimedAttempt, *, level: int = logging.INFO, detail: str | None = None) -> None:
        """Emit a readable lifecycle event without exposing phone, transcript, or recording data."""
        logger.log(
            level,
            "%s call_id=%s attempt_id=%s attempt=%s organizer_id=%s organizer=%r event=%r sponsor=%r contact=%r%s",
            stage,
            claimed.call_id,
            claimed.attempt_id,
            claimed.attempt_number,
            claimed.organizer_id,
            claimed.organizer_name or "Not provided",
            claimed.event_name,
            claimed.sponsor_name,
            claimed.sponsor_contact_name or "Not provided",
            f" detail={detail!r}" if detail else "",
        )

    def run_forever(self) -> None:
        logger.info(
            "bolna_worker_started poll_interval=%s lease_seconds=%s max_attempts=%s",
            self.settings.worker_poll_interval,
            self.settings.worker_lease_seconds,
            self.settings.worker_max_attempts,
        )
        while not self.stop_requested.is_set():
            try:
                self.recover_expired_leases()
                claimed = self.claim_due_calls()
                for item in claimed:
                    if self.stop_requested.is_set():
                        break
                    self.process_claimed_attempt(item)
                logger.debug("bolna_worker_cycle claimed=%s", len(claimed))
            except Exception:  # noqa: BLE001 - the worker must keep polling after an unexpected failure.
                logger.exception("bolna_worker_cycle_failed")
            self.stop_requested.wait(self.settings.worker_poll_interval)
        logger.info("bolna_worker_stopped")

    def recover_expired_leases(self, now: datetime | None = None) -> int:
        now = now or _now()
        recovered = 0
        db = get_session_factory()()
        try:
            with db.begin():
                calls = db.scalars(
                    select(Call)
                    .where(Call.status == CallStatus.PROCESSING, Call.lease_expires_at.is_not(None), Call.lease_expires_at < now)
                    .with_for_update(skip_locked=True)
                ).all()
                for call in calls:
                    attempt = db.scalar(
                        select(CallAttempt)
                        .where(CallAttempt.call_id == call.id)
                        .order_by(CallAttempt.attempt_number.desc())
                        .limit(1)
                    )
                    if attempt and attempt.status == CallAttemptStatus.SUBMITTING:
                        attempt.status = CallAttemptStatus.SUBMISSION_UNKNOWN
                        attempt.error_message = "Worker lease expired while Bolna submission was in progress."
                        attempt.lease_expires_at = None
                        call.status = CallStatus.SUBMISSION_UNKNOWN
                        call.last_error = "Bolna submission needs reconciliation before another call can be made."
                    else:
                        if attempt and attempt.status == CallAttemptStatus.CLAIMED:
                            attempt.status = CallAttemptStatus.FAILED
                            attempt.error_message = "Worker lease expired before provider submission."
                            attempt.lease_expires_at = None
                        call.status = CallStatus.QUEUED
                        call.next_attempt_at = now
                        call.lease_expires_at = None
                    recovered += 1
            if recovered:
                logger.info("bolna_worker_recovered_expired_leases count=%s", recovered)
            return recovered
        finally:
            db.close()

    def claim_due_calls(self, now: datetime | None = None, limit: int = 10) -> list[ClaimedAttempt]:
        now = now or _now()
        claimed: list[ClaimedAttempt] = []
        db = get_session_factory()()
        try:
            with db.begin():
                calls = db.scalars(
                    select(Call)
                    .join(Opportunity, Call.opportunity_id == Opportunity.id)
                    .where(Call.status.in_(ACTIVE_CLAIM_STATUSES), Call.next_attempt_at <= now)
                    .order_by(Call.next_attempt_at, Call.created_at)
                    .limit(limit)
                    .with_for_update(skip_locked=True)
                ).all()
                for call in calls:
                    preference = db.get(VoiceCallPreference, call.opportunity.event.owner_id)
                    permitted_at = next_permitted_at(now, preference)
                    if permitted_at > now:
                        call.next_attempt_at = permitted_at
                        continue
                    blocked_reason = self._blocked_reason(call)
                    if blocked_reason:
                        call.status = CallStatus.BLOCKED
                        call.last_error = blocked_reason
                        call.lease_expires_at = None
                        continue
                    if call.attempt_count >= call.max_attempts:
                        call.status = CallStatus.FAILED
                        call.last_error = "Maximum voice-call attempts reached."
                        call.lease_expires_at = None
                        continue
                    call.attempt_count += 1
                    call.status = CallStatus.PROCESSING
                    call.lease_expires_at = now + timedelta(seconds=self.settings.worker_lease_seconds)
                    attempt = CallAttempt(
                        call_id=call.id,
                        attempt_number=call.attempt_count,
                        status=CallAttemptStatus.CLAIMED,
                        request_token=f"call:{call.id}:attempt:{call.attempt_count}:{uuid4()}",
                        lease_expires_at=call.lease_expires_at,
                    )
                    db.add(attempt)
                    db.flush()
                    claimed.append(
                        ClaimedAttempt(
                            call_id=call.id,
                            attempt_id=attempt.id,
                            attempt_number=attempt.attempt_number,
                            organizer_id=call.opportunity.event.owner_id,
                            organizer_name=call.opportunity.event.organizer_name,
                            event_name=call.opportunity.event.name,
                            sponsor_name=call.opportunity.prospect.company_name,
                            sponsor_contact_name=call.opportunity.prospect.contact_name,
                        )
                    )
            for item in claimed:
                self._log_call("voice_call_queue_picked", item)
            return claimed
        finally:
            db.close()

    @staticmethod
    def _blocked_reason(call: Call) -> str | None:
        if call.cancelled_at or call.status == CallStatus.CANCELLED:
            return "Voice call was cancelled."
        if not call.approved_by or not call.approved_at:
            return "Voice call is not approved."
        if not call.consent_confirmed_by or not call.consent_confirmed_at:
            return "Required voice-call consent was not confirmed."
        if call.opportunity.prospect.opted_out:
            return "This sponsor has opted out of outreach."
        try:
            normalized = normalize_phone(call.recipient_phone)
        except ValueError:
            return "The sponsor phone number is invalid."
        if not normalized:
            return "The sponsor does not have a phone number."
        return None

    def process_claimed_attempt(self, claimed: ClaimedAttempt) -> None:
        prepared = self._mark_submitting(claimed)
        if not prepared:
            return
        recipient_phone, context = prepared
        try:
            provider_id = self.client.start_call(
                agent_id=self.settings.bolna_agent_id or "",
                recipient_phone_number=recipient_phone,
                user_data=context,
                from_phone_number=self.settings.bolna_from_phone_number,
            )
        except BolnaPermanentError as exc:
            self._finish_failure(claimed, str(exc), retryable=False)
        except BolnaRetryableError as exc:
            self._finish_failure(claimed, str(exc), retryable=True)
        except BolnaSubmissionUnknownError as exc:
            self._mark_submission_unknown(claimed, str(exc))
        except Exception:  # noqa: BLE001 - unknown transport state must never trigger an automatic redial.
            logger.exception("bolna_submission_unexpected_error call_id=%s attempt_id=%s", claimed.call_id, claimed.attempt_id)
            self._mark_submission_unknown(claimed, "Unexpected error while submitting to Bolna; outcome is unknown.")
        else:
            self._finish_submission(claimed, provider_id)

    def _mark_submitting(self, claimed: ClaimedAttempt) -> tuple[str, dict[str, str]] | None:
        db = get_session_factory()()
        try:
            with db.begin():
                call = db.scalar(
                    select(Call)
                    .where(Call.id == claimed.call_id)
                    .with_for_update()
                )
                attempt = db.get(CallAttempt, claimed.attempt_id, with_for_update=True)
                now = _now()
                if not call or not attempt or call.status != CallStatus.PROCESSING or attempt.status != CallAttemptStatus.CLAIMED:
                    return None
                if not call.lease_expires_at or call.lease_expires_at < now:
                    attempt.status = CallAttemptStatus.FAILED
                    attempt.error_message = "Worker lease expired before Bolna submission."
                    attempt.lease_expires_at = None
                    call.status = CallStatus.RETRY_SCHEDULED
                    call.next_attempt_at = now
                    call.lease_expires_at = None
                    call.last_error = attempt.error_message
                    return None
                blocked_reason = self._blocked_reason(call)
                if blocked_reason:
                    attempt.status = CallAttemptStatus.FAILED
                    attempt.error_message = blocked_reason
                    attempt.lease_expires_at = None
                    call.status = CallStatus.BLOCKED
                    call.lease_expires_at = None
                    call.last_error = blocked_reason
                    return None
                attempt.status = CallAttemptStatus.SUBMITTING
                context = _safe_context({**call.context_snapshot, "request_token": attempt.request_token, "call_id": str(call.id)})
                self._log_call("voice_call_initiating", claimed)
                return normalize_phone(call.recipient_phone) or "", context
        finally:
            db.close()

    def _finish_submission(self, claimed: ClaimedAttempt, provider_id: str) -> None:
        db = get_session_factory()()
        try:
            with db.begin():
                call = db.get(Call, claimed.call_id, with_for_update=True)
                attempt = db.get(CallAttempt, claimed.attempt_id, with_for_update=True)
                if not call or not attempt or attempt.status != CallAttemptStatus.SUBMITTING:
                    return
                now = _now()
                attempt.status = CallAttemptStatus.SUBMITTED
                attempt.bolna_call_id = provider_id
                attempt.submitted_at = now
                attempt.lease_expires_at = None
                call.bolna_call_id = provider_id
                call.status = CallStatus.INITIATED
                call.lease_expires_at = None
                call.last_error = None
            self._log_call("voice_call_initiated", claimed, detail=f"provider_call_id={provider_id}")
        finally:
            db.close()

    def _finish_failure(self, claimed: ClaimedAttempt, message: str, *, retryable: bool) -> None:
        db = get_session_factory()()
        try:
            with db.begin():
                call = db.scalar(
                    select(Call)
                    .where(Call.id == claimed.call_id)
                    .with_for_update()
                )
                attempt = db.get(CallAttempt, claimed.attempt_id, with_for_update=True)
                if not call or not attempt or attempt.status != CallAttemptStatus.SUBMITTING:
                    return
                now = _now()
                attempt.status = CallAttemptStatus.FAILED
                attempt.error_message = message[:2000]
                attempt.lease_expires_at = None
                call.lease_expires_at = None
                call.last_error = message[:2000]
                if retryable and call.attempt_count < call.max_attempts:
                    preference = db.get(VoiceCallPreference, call.opportunity.event.owner_id)
                    call.status = CallStatus.RETRY_SCHEDULED
                    call.next_attempt_at = retry_at(now, call.attempt_count, preference)
                else:
                    call.status = CallStatus.FAILED
            self._log_call(
                "voice_call_retry_scheduled" if retryable else "voice_call_failed",
                claimed,
                level=logging.WARNING,
                detail=message[:300],
            )
        finally:
            db.close()

    def _mark_submission_unknown(self, claimed: ClaimedAttempt, message: str) -> None:
        db = get_session_factory()()
        try:
            with db.begin():
                call = db.get(Call, claimed.call_id, with_for_update=True)
                attempt = db.get(CallAttempt, claimed.attempt_id, with_for_update=True)
                if not call or not attempt or attempt.status != CallAttemptStatus.SUBMITTING:
                    return
                attempt.status = CallAttemptStatus.SUBMISSION_UNKNOWN
                attempt.error_message = message[:2000]
                attempt.lease_expires_at = None
                call.status = CallStatus.SUBMISSION_UNKNOWN
                call.lease_expires_at = None
                call.last_error = message[:2000]
            self._log_call("voice_call_submission_unknown", claimed, level=logging.WARNING, detail=message[:300])
        finally:
            db.close()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )
    settings = get_settings()
    worker = BolnaWorker(settings)
    signal.signal(signal.SIGINT, worker.request_shutdown)
    signal.signal(signal.SIGTERM, worker.request_shutdown)
    worker.run_forever()


if __name__ == "__main__":
    main()
