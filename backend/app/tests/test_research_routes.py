import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db_session, get_session_factory
from app.main import app
from app.models.research import ResearchJob


@pytest.fixture
def mock_user():
    return CurrentUser(id="d2ef35aa-e1d4-4ea4-bd28-867d590527ae", email="organizer@example.com")


def test_list_and_create_research_jobs(mock_user):
    # Override auth dependency
    app.dependency_overrides[get_current_user] = lambda: mock_user

    client = TestClient(app)

    # 1. Test GET /api/v1/research-jobs
    get_res = client.get("/api/v1/research-jobs")
    assert get_res.status_code == 200
    assert isinstance(get_res.json(), list)

    # 2. Test POST /api/v1/research-jobs with background task mocked
    payload = {
        "event_name": "Hackathon 2026",
        "event_type": "hackathon",
        "venue_city": "Bengaluru",
        "venue_state": "Karnataka",
        "event_format": "in_person",
        "expected_footfall": 500,
        "primary_audience": "Tech students & developers",
        "support_types_needed": ["cash", "cloud_credits"],
    }

    with patch("app.api.routes.research.run_research_job") as mock_run:
        post_res = client.post("/api/v1/research-jobs", json=payload)
        assert post_res.status_code == 201
        data = post_res.json()
        assert data["event_name"] == "Hackathon 2026"
        assert data["venue_city"] == "Bengaluru"
        assert data["owner_id"] == "d2ef35aa-e1d4-4ea4-bd28-867d590527ae"
        created_job_id = data["id"]

    # 3. Test GET single job
    job_res = client.get(f"/api/v1/research-jobs/{created_job_id}")
    assert job_res.status_code == 200
    assert job_res.json()["id"] == created_job_id

    # 4. Clean up created job from DB
    session_factory = get_session_factory()
    with session_factory() as session:
        job = session.get(ResearchJob, uuid.UUID(created_job_id))
        if job:
            session.delete(job)
            session.commit()

    # Reset dependency overrides
    app.dependency_overrides.clear()
