"""Server-only Supabase management client used for token validation.

This module is deliberately separate from SQLAlchemy: the Supabase client talks
to Auth/Data APIs, while Alembic and repositories use a direct Postgres URL.
"""

from functools import lru_cache

from supabase import Client, create_client

from app.core.settings import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    if not settings.supabase_url:
        raise RuntimeError("Configure SUPABASE_URL with the HTTPS project URL before enabling token validation")
    return create_client(str(settings.supabase_url), settings.require_supabase_auth_key())
