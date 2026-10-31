from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.routes.health import router as health_router
from app.core.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    # Vite may use 127.0.0.1 instead of localhost, or move to the next port
    # when 5173 is occupied. Both are safe loopback origins during local
    # development, but must not broaden production CORS.
    local_dev_origin_regex = (
        r"^https?://(localhost|127\.0\.0\.1)(?::\d+)?$"
        if settings.app_env.lower() == "development"
        else None
    )
    app = FastAPI(
        title="Event Chief AI API",
        version="0.1.0",
        description="Event Chief AI sponsorship workflow API.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_origin_regex=local_dev_origin_regex,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],  # PUT: /voice-preferences
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )
    app.include_router(health_router)
    app.include_router(api_router)
    return app


app = create_app()
