from fastapi.testclient import TestClient

from app.main import create_app


def test_development_allows_loopback_vite_origins() -> None:
    client = TestClient(create_app())
    response = client.options(
        "/api/v1/research-jobs",
        headers={
            "Origin": "http://127.0.0.1:5174",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5174"


def test_put_is_allowed_for_voice_preferences() -> None:
    # The frontend saves voice preferences with PUT; a blocked preflight breaks the save.
    client = TestClient(create_app())
    response = client.options(
        "/api/v1/voice-preferences",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
