from datetime import datetime, time, timezone
import json
import logging
from uuid import UUID

import httpx
import pytest

from app.models.outreach import VoiceCallPreference
from app.services.bolna import BolnaClient, BolnaRetryableError, BolnaSubmissionUnknownError, normalize_webhook
from app.workers.bolna_worker import BolnaWorker, ClaimedAttempt, next_permitted_at, retry_at


def test_default_window_defers_before_9am_india_time() -> None:
    # 03:00 UTC is 08:30 in Asia/Kolkata on this Saturday.
    now = datetime(2026, 10, 31, 3, 0, tzinfo=timezone.utc)

    assert next_permitted_at(now, None) == datetime(2026, 10, 31, 3, 30, tzinfo=timezone.utc)


def test_preference_skips_unpermitted_weekend() -> None:
    preference = VoiceCallPreference(
        user_id="00000000-0000-0000-0000-000000000001",
        calling_window_start=time(9, 0),
        calling_window_end=time(22, 0),
        allowed_weekdays=[1, 2, 3, 4, 5],
        timezone="Asia/Kolkata",
    )
    # Saturday 11:00 IST → the following Monday 09:00 IST.
    now = datetime(2026, 10, 31, 5, 30, tzinfo=timezone.utc)

    assert next_permitted_at(now, preference) == datetime(2026, 11, 2, 3, 30, tzinfo=timezone.utc)


def test_retry_backoff_is_moved_to_calling_window() -> None:
    # A five-minute retry from 21:58 IST lands after the 22:00 cut-off.
    now = datetime(2026, 10, 31, 16, 28, tzinfo=timezone.utc)

    assert retry_at(now, 1, None) == datetime(2026, 11, 1, 3, 30, tzinfo=timezone.utc)


def test_bolna_client_returns_provider_execution_id() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/call"
        assert request.headers["Authorization"] == "Bearer test-key"
        assert json.loads(request.content) == {
            "agent_id": "agent-1",
            "recipient_phone_number": "+919876543210",
            "user_data": {"request_token": "test"},
        }
        return httpx.Response(200, json={"execution_id": "execution-1"})

    client = BolnaClient(api_key="test-key", client=httpx.Client(transport=httpx.MockTransport(handler)))

    assert client.start_call(agent_id="agent-1", recipient_phone_number="+919876543210", user_data={"request_token": "test"}) == "execution-1"


def test_bolna_client_includes_configured_caller_id() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["from_phone_number"] == "+919876500000"
        return httpx.Response(200, json={"execution_id": "execution-1"})

    client = BolnaClient(api_key="test-key", client=httpx.Client(transport=httpx.MockTransport(handler)))

    assert client.start_call(
        agent_id="agent-1",
        recipient_phone_number="+919876543210",
        user_data={},
        from_phone_number="+919876500000",
    ) == "execution-1"


def test_bolna_rate_limit_is_retryable() -> None:
    client = BolnaClient(api_key="test-key", client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(429))))

    with pytest.raises(BolnaRetryableError):
        client.start_call(agent_id="agent-1", recipient_phone_number="+919876543210", user_data={})


def test_bolna_read_timeout_is_submission_unknown() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("lost response", request=request)

    client = BolnaClient(api_key="test-key", client=httpx.Client(transport=httpx.MockTransport(handler)))

    with pytest.raises(BolnaSubmissionUnknownError):
        client.start_call(agent_id="agent-1", recipient_phone_number="+919876543210", user_data={})


def test_webhook_normalization_is_stable_for_duplicate_payload() -> None:
    payload = {"execution_id": "execution-1", "status": "in-progress", "summary": "Talking", "extracted_data": {"outcome": "interested"}}

    first = normalize_webhook(payload)
    second = normalize_webhook(payload)

    assert first == second
    assert first.status == "in_progress"
    assert first.outcome == "interested"


def test_webhook_normalization_reads_bolna_transcript_and_telephony_recording() -> None:
    update = normalize_webhook(
        {
            "id": "execution-1",
            "status": "completed",
            "transcript": "assistant: Hello\nuser: Please send details",
            "summary": "Sponsor requested follow-up details.",
            "extracted_data": {"outcome": "needs_information"},
            "telephony_data": {"recording_url": "https://storage.example.test/recording.mp3"},
        }
    )

    assert update.provider_call_id == "execution-1"
    assert update.status == "completed"
    assert update.transcript_text == "assistant: Hello\nuser: Please send details"
    assert update.summary == "Sponsor requested follow-up details."
    assert update.recording_url == "https://storage.example.test/recording.mp3"
    assert update.outcome == "needs_information"


def test_bolna_recording_is_fetched_with_server_credentials() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://storage.example.test/recording.mp3"
        assert request.headers["Authorization"] == "Bearer test-key"
        return httpx.Response(200, content=b"audio", headers={"content-type": "audio/mpeg"})

    client = BolnaClient(api_key="test-key", client=httpx.Client(transport=httpx.MockTransport(handler)))

    assert client.get_recording("https://storage.example.test/recording.mp3") == (b"audio", "audio/mpeg")


def test_worker_log_names_the_organizer_and_sponsor_without_call_media(caplog: pytest.LogCaptureFixture) -> None:
    claimed = ClaimedAttempt(
        call_id=UUID("00000000-0000-0000-0000-000000000001"),
        attempt_id=UUID("00000000-0000-0000-0000-000000000002"),
        attempt_number=1,
        organizer_id=UUID("00000000-0000-0000-0000-000000000003"),
        organizer_name="Techfest Team",
        event_name="Techfest 2026",
        sponsor_name="Acme Cloud",
        sponsor_contact_name="Priya Shah",
    )

    with caplog.at_level(logging.INFO):
        BolnaWorker._log_call("voice_call_queue_picked", claimed)

    assert "voice_call_queue_picked" in caplog.text
    assert "organizer='Techfest Team'" in caplog.text
    assert "sponsor='Acme Cloud'" in caplog.text
    assert "recording" not in caplog.text
    assert "transcript" not in caplog.text
