import pytest
from pydantic import ValidationError

from app.core.settings import DatabaseSettings, Settings


def test_database_settings_accepts_supabase_connection_string_alias() -> None:
    settings = DatabaseSettings(
        _env_file=None,
        SUPABASE_CONNECTION_STRING="postgresql://postgres:password@localhost:5432/postgres",
    )

    assert settings.require_database_url().startswith("postgresql+psycopg://")


def test_supabase_url_rejects_a_postgres_connection_string() -> None:
    with pytest.raises(ValidationError, match="SUPABASE_URL must be the HTTPS project URL"):
        Settings(_env_file=None, SUPABASE_URL="postgresql://postgres:password@localhost:5432/postgres")
