"""Email send flow against the real database with Resend mocked (no email is sent)."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, update

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_session_factory
from app.core.settings import Settings, get_settings
from app.main import app
from app.models.enums import MessageStatus
from app.models.outreach import OutreachMessage
from app.models.prospects import Prospect

pytestmark = pytest.mark.integration

USER_A = CurrentUser(id="d2ef35aa-e1d4-4ea4-bd28-867d590527ae", email="organizer@example.com")
COMPANY = "Email Flow Co (automated test)"
SPONSOR_EMAIL = "partnerships@sponsor.example"
TEST_INBOX = "organizer-inbox@example.com"


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: USER_A
    app.dependency_overrides[get_settings] = lambda: Settings(
        EMAIL_PROVIDER="resend",
        RESEND_API_KEY="re_test",
        RESEND_FROM_EMAIL="Event Chief AI <onboarding@resend.dev>",
        RESEND_TEST_MODE=True,
        RESEND_TEST_RECIPIENT=TEST_INBOX,
    )
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_settings, None)


def test_test_mode_redirects_delivery_and_a_draft_is_sent_only_once(client: TestClient) -> None:
    event = client.post("/api/v1/events", json={
        "name": "Email flow test (automated test)", "event_type": "hackathon", "institution": "Test College",
        "start_date": "2026-12-01",
    })
    assert event.status_code == 201, event.text
    event_id = event.json()["id"]
    try:
        opp = client.post(f"/api/v1/events/{event_id}/opportunities/with-prospect", json={
            "prospect": {"company_name": COMPANY, "email": SPONSOR_EMAIL},
        })
        assert opp.status_code == 201, opp.text
        draft = client.post(f"/api/v1/opportunities/{opp.json()['id']}/emails/draft", json={})
        assert draft.status_code == 201, draft.text
        message_id = draft.json()["id"]

        # Sending needs approval first.
        assert client.post(f"/api/v1/outreach/{message_id}/send").status_code == 409
        assert client.post(f"/api/v1/outreach/{message_id}/approve").status_code == 200

        # Another request is mid-send: this one must not send again.
        with get_session_factory()() as session:
            session.execute(update(OutreachMessage).where(OutreachMessage.id == message_id).values(status=MessageStatus.SENDING))
            session.commit()
        with patch("app.api.routes.outreach.send_with_resend") as resend:
            assert client.post(f"/api/v1/outreach/{message_id}/send").status_code == 409
            resend.assert_not_called()
        with get_session_factory()() as session:
            session.execute(update(OutreachMessage).where(OutreachMessage.id == message_id).values(status=MessageStatus.APPROVED))
            session.commit()

        with patch("app.api.routes.outreach.send_with_resend", return_value="re_msg_123") as resend:
            sent = client.post(f"/api/v1/outreach/{message_id}/send")
            assert sent.status_code == 200, sent.text
            # Test mode: delivered to the test inbox, never to the sponsor.
            assert resend.call_args.kwargs["recipient"] == TEST_INBOX
            # The draft still records the real sponsor address.
            assert sent.json()["recipient"] == SPONSOR_EMAIL
            assert sent.json()["status"] == "sent"

            # Sending again is a no-op.
            again = client.post(f"/api/v1/outreach/{message_id}/send")
            assert again.status_code == 200
            assert resend.call_count == 1
    finally:
        client.delete(f"/api/v1/events/{event_id}")
        with get_session_factory()() as session:
            session.execute(delete(Prospect).where(Prospect.company_name == COMPANY))
            session.commit()
