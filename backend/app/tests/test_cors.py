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
