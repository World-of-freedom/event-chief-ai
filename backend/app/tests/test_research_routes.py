import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db_session, get_session_factory
from app.main import app
from app.models.events import Event
from app.models.research import ResearchJob


@pytest.fixture
def mock_user():
    return CurrentUser(id="d2ef35aa-e1d4-4ea4-bd28-867d590527ae", email="organizer@example.com")


@pytest.mark.integration
def test_list_and_create_research_jobs(mock_user):
    # Override auth dependency
    app.dependency_overrides[get_current_user] = lambda: mock_user

    client = TestClient(app)

    # 1. Test GET /api/v1/research-jobs
    get_res = client.get("/api/v1/research-jobs")
    assert get_res.status_code == 200
    assert isinstance(get_res.json(), list)

    # 2. Discovery must start from a saved event and its requirements.
    event_res = client.post(
        "/api/v1/events",
        json={
            "name": "Hackathon 2026",
            "event_type": "hackathon",
            "institution": "Example Institute",
            "start_date": "2026-11-15",
            "location": "Bengaluru",
            "expected_attendees": 500,
            "target_audience": "Tech students & developers",
            "resource_needs": [{
                "category": "cash",
                "target_amount": "500000",
                "details": {"funding_purpose": "Prize pool"},
                "description": "Prize funding for the finalist teams.",
            }],
        },
    )
    assert event_res.status_code == 201
    event = event_res.json()
    needs_res = client.get(f"/api/v1/events/{event['id']}/needs")
    assert needs_res.status_code == 200
    existing_need_id = needs_res.json()[0]["id"]

    # 3. Test POST /api/v1/research-jobs with background task mocked.
    # The second requirement is deliberately created only with the job.
    payload = {
        "event_id": event["id"],
        "resource_need_ids": [existing_need_id],
        "new_resource_needs": [{
            "category": "cloud_credits",
            "target_amount": "100000",
            "details": {"quantity": "100 API accounts"},
            "description": "Cloud credits for every finalist team.",
        }],
        "sponsor_benefits": "Booth space and a branded challenge track.",
        "eligibility_constraints": "Partner must support student builders.",
    }

    with patch("app.api.routes.research.run_research_job") as mock_run:
        post_res = client.post("/api/v1/research-jobs", json=payload)
        assert post_res.status_code == 201
        data = post_res.json()
        assert data["event_name"] == "Hackathon 2026"
        assert data["venue_city"] == "Bengaluru"
        assert data["owner_id"] == "d2ef35aa-e1d4-4ea4-bd28-867d590527ae"
        assert data["event_id"] == event["id"]
        assert {need["category"] for need in data["resource_needs"]} == {"cash", "cloud_credits"}
        assert data["sponsor_benefits"] == "Booth space and a branded challenge track."
        created_job_id = data["id"]

    # 4. Test GET single job
    job_res = client.get(f"/api/v1/research-jobs/{created_job_id}")
    assert job_res.status_code == 200
    assert job_res.json()["id"] == created_job_id

    # 4b. Test lookup by the short public ID used in frontend URLs
    public_id = data["public_id"]
    assert len(public_id) == 10 and public_id.isalnum()
    by_public = client.get(f"/api/v1/research-jobs/by-public-id/{public_id}")
    assert by_public.status_code == 200
    assert by_public.json()["id"] == created_job_id
    assert client.get("/api/v1/research-jobs/by-public-id/zzzzzzzzzz").status_code == 404

    # 5. Clean up created job and event from DB
    session_factory = get_session_factory()
    with session_factory() as session:
        job = session.get(ResearchJob, uuid.UUID(created_job_id))
        if job:
            session.delete(job)
            session.flush()
        saved_event = session.get(Event, uuid.UUID(event["id"]))
        if saved_event:
            session.delete(saved_event)
        session.commit()

    # Reset dependency overrides
    app.dependency_overrides.clear()
