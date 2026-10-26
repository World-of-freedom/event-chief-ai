"""End-to-end API flow against the real database, plus ownership checks.

User A must be a real Supabase auth user (rows reference auth.users). User B is a
random ID that owns nothing; it only reads/updates, so it never needs to exist.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.auth import CurrentUser, get_current_user
from app.main import app

pytestmark = pytest.mark.integration

USER_A = CurrentUser(id="d2ef35aa-e1d4-4ea4-bd28-867d590527ae", email="organizer@example.com")
USER_B = CurrentUser(id=str(uuid.uuid4()), email="stranger@example.com")


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


def act_as(user: CurrentUser) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def test_full_sponsorship_flow_and_ownership(client: TestClient) -> None:
    act_as(USER_A)
    event = client.post("/api/v1/events", json={
        "name": "Test Hackathon (automated test)", "event_type": "hackathon", "institution": "Test College",
        "start_date": "2026-11-15", "end_date": "2026-11-17", "expected_attendees": 300,
    })
    assert event.status_code == 201, event.text
    event_id = event.json()["id"]
    try:
        # Validation: end before start, cash need without amount
        bad = client.post("/api/v1/events", json={"name": "x", "event_type": "y", "institution": "z",
                                                   "start_date": "2026-11-15", "end_date": "2026-11-01"})
        assert bad.status_code == 422
        assert client.post(f"/api/v1/events/{event_id}/needs", json={"category": "cash", "title": "Prize pool"}).status_code == 422

        cash_need = client.post(f"/api/v1/events/{event_id}/needs", json={
            "category": "cash", "title": "Prize pool", "target_amount": "50000",
            "details": {"funding_purpose": "Prize pool"}, "description": "Cash prizes for finalists.",
        })
        assert cash_need.status_code == 201, cash_need.text
        credits_need = client.post(f"/api/v1/events/{event_id}/needs", json={
            "category": "cloud_credits", "title": "Cloud credits", "target_amount": "100000",
            "details": {"quantity": "100 developer accounts"}, "description": "Cloud credits for participant projects.",
        })
        assert credits_need.status_code == 201

        # Manual prospect + opportunity in one step
        opp = client.post(f"/api/v1/events/{event_id}/opportunities/with-prospect", json={
            "prospect": {"company_name": "Test Cloud Co (automated test)", "website_url": "https://example.com", "phone": "98765 43210"},
        })
        assert opp.status_code == 201, opp.text
        opp_body = opp.json()
        opp_id, prospect_id = opp_body["id"], opp_body["prospect"]["id"]
        assert opp_body["status"] == "prospect_found"
        assert opp_body["prospect_detail"]["phone"] == "+919876543210"
        assert opp_body["allowed_next_statuses"] == ["outreach_approved", "opted_out"]
        assert len(opp_body["status_history"]) == 1

        # Same prospect cannot be added twice to one event
        dup = client.post(f"/api/v1/events/{event_id}/opportunities", json={"prospect_id": prospect_id})
        assert dup.status_code == 409

        # Pipeline moves: skipping is refused, valid moves are recorded
        assert client.patch(f"/api/v1/opportunities/{opp_id}", json={"status": "interested"}).status_code == 409
        for nxt in ["outreach_approved", "contact_attempted", "interested"]:
            res = client.patch(f"/api/v1/opportunities/{opp_id}", json={"status": nxt, "status_reason": "test"})
            assert res.status_code == 200, res.text
        assert len(res.json()["status_history"]) == 4

        # Offers: proposed → under_review → accepted needs evidence
        offer = client.post(f"/api/v1/opportunities/{opp_id}/offers", json={
            "support_type": "cloud_credits", "stated_value": "100000", "resource_need_id": credits_need.json()["id"],
        })
        assert offer.status_code == 201, offer.text
        offer_id = offer.json()["id"]
        assert offer.json()["status"] == "proposed"
        assert client.patch(f"/api/v1/offers/{offer_id}", json={"status": "under_review"}).status_code == 200
        assert client.patch(f"/api/v1/offers/{offer_id}", json={"status": "accepted"}).status_code == 409
        accepted = client.patch(f"/api/v1/offers/{offer_id}", json={"status": "accepted", "evidence_notes": "Confirmed by email"})
        assert accepted.status_code == 200
        assert accepted.json()["organizer_verified_by"] == USER_A.id

        # Follow-up: overdue, then completed
        due = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        task = client.post(f"/api/v1/opportunities/{opp_id}/tasks", json={"title": "Send proposal deck", "due_at": due})
        assert task.status_code == 201
        assert task.json()["is_overdue"] is True

        # Dashboard: credits are secured separately, cash gap untouched
        dash = client.get(f"/api/v1/events/{event_id}/dashboard").json()
        assert float(dash["cash"]["target"]) == 50000
        assert float(dash["cash"]["gap"]) == 50000
        assert len(dash["in_kind_secured"]) == 1
        assert dash["overdue_task_count"] == 1
        assert dash["opportunities_by_status"] == {"interested": 1}

        done = client.patch(f"/api/v1/tasks/{task.json()['id']}", json={"status": "completed"})
        assert done.json()["completed_at"] is not None and done.json()["is_overdue"] is False

        # Ownership: user B sees nothing and can change nothing
        act_as(USER_B)
        assert client.get("/api/v1/events").json() == []
        for path in [f"/api/v1/events/{event_id}", f"/api/v1/events/{event_id}/dashboard", f"/api/v1/events/{event_id}/needs",
                     f"/api/v1/opportunities/{opp_id}", f"/api/v1/prospects/{prospect_id}", f"/api/v1/opportunities/{opp_id}/offers"]:
            assert client.get(path).status_code == 404, path
        assert client.patch(f"/api/v1/events/{event_id}", json={"name": "hijack"}).status_code == 404
        assert client.patch(f"/api/v1/offers/{offer_id}", json={"conditions": "hijack"}).status_code == 404
        assert client.patch(f"/api/v1/tasks/{task.json()['id']}", json={"title": "hijack"}).status_code == 404
        assert client.delete(f"/api/v1/needs/{cash_need.json()['id']}").status_code in (404, 405)
        assert client.delete(f"/api/v1/events/needs/{cash_need.json()['id']}").status_code == 404
        assert client.get("/api/v1/opportunities").json() == []
        assert client.get("/api/v1/tasks").json() == []

        # Opt-out: closes the opportunity and blocks further moves
        act_as(USER_A)
        out = client.patch(f"/api/v1/prospects/{prospect_id}", json={"opted_out": True, "opt_out_reason": "Asked not to be contacted"})
        assert out.json()["opted_out"] is True
        closed = client.get(f"/api/v1/opportunities/{opp_id}").json()
        assert closed["status"] == "opted_out" and closed["outreach_blocked"] is True
        assert client.patch(f"/api/v1/prospects/{prospect_id}", json={"opted_out": False}).status_code == 422
    finally:
        act_as(USER_A)
        client.delete(f"/api/v1/events/{event_id}")
        from sqlalchemy import delete
        from app.core.database import get_session_factory
        from app.models.prospects import Prospect
        with get_session_factory()() as session:
            session.execute(delete(Prospect).where(Prospect.company_name == "Test Cloud Co (automated test)"))
            session.commit()


def test_adding_a_discovered_lead_to_the_pipeline(client: TestClient) -> None:
    from sqlalchemy import delete
    from app.core.database import get_session_factory
    from app.models.prospects import Prospect
    from app.models.research import ResearchJob, SponsorLead

    act_as(USER_A)
    events = [
        client.post("/api/v1/events", json={"name": f"Lead import test {i} (automated test)", "event_type": "fest",
                                            "institution": "Test College", "start_date": "2026-12-01"}).json()["id"]
        for i in (1, 2)
    ]
    session = get_session_factory()()
    job = ResearchJob(owner_id=USER_A.uuid, event_name="Lead import test", event_type="fest", venue_city="Pune")
    session.add(job)
    session.flush()
    lead = SponsorLead(job_id=job.id, company_name="Lead Import Co (automated test)", website_url="https://www.leadimport.example",
                       contact_email="partnerships@leadimport.example", score_total=72, confidence="medium",
                       ranking_explanation="Sponsors student fests in Pune.")
    session.add(lead)
    session.commit()
    try:
        first = client.post(f"/api/v1/events/{events[0]}/opportunities/from-lead", json={"lead_id": str(lead.id)})
        assert first.status_code == 201, first.text
        prospect = first.json()["prospect_detail"]
        assert prospect["verification_status"] == "unverified"
        assert prospect["email"] == "partnerships@leadimport.example"
        assert "AI sponsor discovery" in prospect["source_notes"]

        # Adding it again to the same event is refused; another event reuses the same prospect.
        assert client.post(f"/api/v1/events/{events[0]}/opportunities/from-lead", json={"lead_id": str(lead.id)}).status_code == 409
        second = client.post(f"/api/v1/events/{events[1]}/opportunities/from-lead", json={"lead_id": str(lead.id)})
        assert second.status_code == 201
        assert second.json()["prospect"]["id"] == prospect["id"]

        # Another user cannot import someone else's lead.
        act_as(USER_B)
        assert client.post(f"/api/v1/events/{events[0]}/opportunities/from-lead", json={"lead_id": str(lead.id)}).status_code == 404
    finally:
        act_as(USER_A)
        for event_id in events:
            client.delete(f"/api/v1/events/{event_id}")
        session.execute(delete(Prospect).where(Prospect.company_name == "Lead Import Co (automated test)"))
        session.delete(session.get(ResearchJob, job.id))
        session.commit()
        session.close()
