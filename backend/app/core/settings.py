from functools import lru_cache

from pydantic import AliasChoices, AnyHttpUrl, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Settings used by Alembic and SQLAlchemy only.

    Keeping this configuration separate means migrations do not need the Auth
    client configuration and never accidentally validate browser-facing values.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: SecretStr | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL", "SUPABASE_CONNECTION_STRING"),
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_driver(cls, value: str | None) -> str | None:
        """Use psycopg v3 even when a Supabase Connect string starts with postgresql://."""
        if not value:
            return value
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    def require_database_url(self) -> str:
        if not self.database_url:
            raise RuntimeError(
                "DATABASE_URL or SUPABASE_CONNECTION_STRING is required for Alembic. "
                "Copy the server-only Direct connection string from Supabase Connect."
            )
        return self.database_url.get_secret_value()


class Settings(DatabaseSettings):
    # Optional in the scaffold so `/health` works before integrations are configured.
    supabase_url: AnyHttpUrl | None = Field(default=None, validation_alias="SUPABASE_URL")
    supabase_publishable_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_KEY"),
    )
    supabase_service_role_key: str | None = Field(default=None, validation_alias="SUPABASE_SERVICE_ROLE_KEY")
    resend_api_key: str | None = Field(default=None, alias="RESEND_API_KEY")
    resend_from_email: str | None = Field(default=None, alias="RESEND_FROM_EMAIL")
    bolna_api_key: str | None = Field(default=None, alias="BOLNA_API_KEY")
    bolna_agent_id: str | None = Field(default=None, alias="BOLNA_AGENT_ID")
    bolna_webhook_secret: str | None = Field(default=None, alias="BOLNA_WEBHOOK_SECRET")
    frontend_origin: str = Field(default="http://localhost:5173", alias="FRONTEND_ORIGIN")
    app_env: str = Field(default="development", alias="APP_ENV")

    @property
    def configured_resend(self) -> bool:
        return bool(self.resend_api_key and self.resend_from_email)

    @property
    def configured_bolna(self) -> bool:
        return bool(self.bolna_api_key and self.bolna_agent_id and self.bolna_webhook_secret)

    @field_validator("supabase_url", mode="before")
    @classmethod
    def reject_database_url_in_auth_setting(cls, value: str | None) -> str | None:
        if value and value.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
            raise ValueError(
                "SUPABASE_URL must be the HTTPS project URL (https://<project-ref>.supabase.co). "
                "Put the PostgreSQL URL in SUPABASE_CONNECTION_STRING or DATABASE_URL instead."
            )
        return value

    def require_supabase_auth_key(self) -> str:
        """Use service role when available; publishable key only verifies bearer tokens."""
        if self.supabase_service_role_key:
            return self.supabase_service_role_key
        if self.supabase_publishable_key:
            return self.supabase_publishable_key
        raise RuntimeError(
            "Configure SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY before enabling token validation."
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_database_settings() -> DatabaseSettings:
    return DatabaseSettings()


def get_database_url() -> str:
    return get_database_settings().require_database_url()
