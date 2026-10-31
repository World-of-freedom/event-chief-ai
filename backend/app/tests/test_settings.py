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


def test_platform_admin_allowlist_is_server_side_and_normalized() -> None:
    settings = Settings(_env_file=None, PLATFORM_ADMIN_EMAILS=" Admin@Example.com, second@example.com ")

    assert settings.bootstrap_admin_emails == {"admin@example.com", "second@example.com"}


def test_gmail_delivery_requires_a_sender_and_app_password() -> None:
    configured = Settings(_env_file=None, GMAIL_SENDER_EMAIL="sumitscience2017@gmail.com", GMAIL_APP_PASSWORD="abcdefghijklmnop")
    incomplete = Settings(_env_file=None, GMAIL_SENDER_EMAIL="sumitscience2017@gmail.com")

    assert configured.configured_gmail is True
    assert incomplete.configured_gmail is False


def test_email_delivery_uses_the_selected_provider() -> None:
    resend = Settings(_env_file=None, EMAIL_PROVIDER="resend", RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="App <outreach@example.com>")
    gmail = Settings(_env_file=None, EMAIL_PROVIDER="gmail", GMAIL_SENDER_EMAIL="sumitscience2017@gmail.com", GMAIL_APP_PASSWORD="abcdefghijklmnop")

    assert resend.configured_email_delivery is True
    assert gmail.configured_email_delivery is True


def test_resend_test_mode_requires_a_test_recipient() -> None:
    missing_recipient = Settings(_env_file=None, RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="App <onboarding@resend.dev>", RESEND_TEST_MODE=True)
    configured = Settings(_env_file=None, RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="App <onboarding@resend.dev>", RESEND_TEST_MODE=True, RESEND_TEST_RECIPIENT="sumitscience2017@gmail.com")

    assert missing_recipient.configured_resend is False
    assert configured.configured_resend is True
