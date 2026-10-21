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


def test_supabase_key_uses_project_env_alias() -> None:
    settings = Settings(
        _env_file=None,
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_KEY="sb_publishable_test-key",
    )

    assert settings.require_supabase_auth_key() == "sb_publishable_test-key"


def test_supabase_key_accepts_database_connection_string_when_project_uses_that_contract() -> None:
    settings = Settings(
        _env_file=None,
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_CONNECTION_STRING="postgresql://postgres:password@db.example.supabase.co:5432/postgres",
        SUPABASE_KEY="postgresql://postgres:password@db.example.supabase.co:5432/postgres",
    )

    assert settings.database_url.get_secret_value().startswith("postgresql+")
    assert settings.require_supabase_auth_key() == "postgresql://postgres:password@db.example.supabase.co:5432/postgres"
