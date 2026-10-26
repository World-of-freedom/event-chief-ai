from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_describes_sponsorship_mvp_mode() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json()["mode"] == "sponsorship-mvp"


def test_feature_route_is_declared_in_openapi() -> None:
    paths = TestClient(app).get("/openapi.json").json()["paths"]

    assert "/api/v1/events" in paths
    assert "/api/v1/auth/me" in paths


def test_feature_routes_require_a_bearer_token() -> None:
    response = TestClient(app).get("/api/v1/events")

    assert response.status_code == 401


def test_provider_webhook_is_not_browser_authenticated() -> None:
    response = TestClient(app).post("/api/v1/webhooks/bolna")

    assert response.status_code == 501
