from functools import lru_cache
from typing import Literal

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
    # Match the project’s actual env contract: SUPABASE_URL, SUPABASE_CONNECTION_STRING, SUPABASE_KEY.
    supabase_url: AnyHttpUrl | None = Field(default=None, validation_alias="SUPABASE_URL")
    supabase_key: str | None = Field(default=None, validation_alias="SUPABASE_KEY")
    resend_api_key: str | None = Field(default=None, alias="RESEND_API_KEY")
    resend_from_email: str | None = Field(default=None, alias="RESEND_FROM_EMAIL")
    resend_test_mode: bool = Field(default=False, alias="RESEND_TEST_MODE")
    resend_test_recipient: str | None = Field(default=None, alias="RESEND_TEST_RECIPIENT")
    email_provider: Literal["resend", "gmail"] = Field(default="resend", alias="EMAIL_PROVIDER")
    gmail_sender_email: str | None = Field(default=None, alias="GMAIL_SENDER_EMAIL")
    gmail_app_password: SecretStr | None = Field(default=None, alias="GMAIL_APP_PASSWORD")
    bolna_api_key: str | None = Field(default=None, alias="BOLNA_API_KEY")
    bolna_agent_id: str | None = Field(default=None, alias="BOLNA_AGENT_ID")
    bolna_from_phone_number: str | None = Field(default=None, alias="BOLNA_FROM_PHONE_NUMBER")
    bolna_webhook_secret: str | None = Field(default=None, alias="BOLNA_WEBHOOK_SECRET")
    worker_poll_interval: int = Field(default=10, ge=1, le=300, alias="WORKER_POLL_INTERVAL")
    worker_lease_seconds: int = Field(default=120, ge=15, le=3600, alias="WORKER_LEASE_SECONDS")
    worker_max_attempts: int = Field(default=3, ge=1, le=10, alias="WORKER_MAX_ATTEMPTS")
    frontend_origin: str = Field(default="http://localhost:5173", alias="FRONTEND_ORIGIN")
    app_env: str = Field(default="development", alias="APP_ENV")
    platform_admin_emails: str = Field(default="", alias="PLATFORM_ADMIN_EMAILS")

    # ── Sponsor Discovery ────────────────────────────────────────────────────
    # LLM provider — set LLM_PROVIDER to switch between gemini / openai / anthropic
    llm_provider: Literal["gemini", "openai", "anthropic"] = Field(
        default="gemini", alias="LLM_PROVIDER"
    )
    llm_model: str | None = Field(
        default=None,
        alias="LLM_MODEL",
        description=(
            "Override the default model name for the selected LLM provider. "
            "Defaults: gemini→gemini-3.5-flash-lite, openai→gpt-4o-mini, anthropic→claude-3-5-haiku-latest"
        ),
    )
    gemini_api_key: SecretStr | None = Field(default=None, alias="GEMINI_API_KEY")
    openai_api_key: SecretStr | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: SecretStr | None = Field(default=None, alias="ANTHROPIC_API_KEY")

    # Web search
    tavily_api_key: SecretStr | None = Field(default=None, alias="TAVILY_API_KEY")
    brave_search_api_key: SecretStr | None = Field(default=None, alias="BRAVE_SEARCH_API_KEY")

    # Local business discovery
    google_places_api_key: SecretStr | None = Field(default=None, alias="GOOGLE_PLACES_API_KEY")

    # Email discovery and verification
    hunter_api_key: SecretStr | None = Field(default=None, alias="HUNTER_API_KEY")

    # Research job limits (tune during testing)
    research_max_searches: int = Field(default=8, alias="RESEARCH_MAX_SEARCHES")
    research_max_candidates: int = Field(default=30, alias="RESEARCH_MAX_CANDIDATES")
    research_max_verified: int = Field(default=15, alias="RESEARCH_MAX_VERIFIED")
    research_max_targeted_searches: int = Field(default=12, ge=1, le=30, alias="RESEARCH_MAX_TARGETED_SEARCHES")
    research_phone_default_region: str = Field(default="IN", min_length=2, max_length=2, alias="RESEARCH_PHONE_DEFAULT_REGION")

    @property
    def configured_resend(self) -> bool:
        if not self.resend_api_key or not self.resend_from_email:
            return False
        return bool(self.resend_test_recipient) if self.resend_test_mode else True

    @property
    def configured_gmail(self) -> bool:
        return bool(self.gmail_sender_email and self.gmail_app_password)

    @property
    def configured_email_delivery(self) -> bool:
        return self.configured_resend if self.email_provider == "resend" else self.configured_gmail

    @property
    def configured_bolna(self) -> bool:
        return bool(self.bolna_api_key and self.bolna_agent_id and self.bolna_webhook_secret)

    @property
    def bootstrap_admin_emails(self) -> set[str]:
        """Server-only allowlist used to bootstrap the first platform administrator."""
        return {email.strip().lower() for email in self.platform_admin_emails.split(",") if email.strip()}

    @property
    def configured_llm(self) -> bool:
        if self.llm_provider == "gemini":
            return bool(self.gemini_api_key)
        if self.llm_provider == "openai":
            return bool(self.openai_api_key)
        if self.llm_provider == "anthropic":
            return bool(self.anthropic_api_key)
        return False

    @property
    def configured_tavily(self) -> bool:
        return bool(self.tavily_api_key)

    @property
    def configured_places(self) -> bool:
        return bool(self.google_places_api_key)

    @property
    def configured_hunter(self) -> bool:
        return bool(self.hunter_api_key)

    def effective_llm_model(self) -> str:
        """Return the configured model name, or the provider default."""
        if self.llm_model:
            return self.llm_model
        defaults = {
            "gemini": "gemini-3.5-flash-lite",
            "openai": "gpt-4o-mini",
            "anthropic": "claude-3-5-haiku-latest",
        }
        return defaults[self.llm_provider]

    @field_validator("supabase_url", mode="before")
    @classmethod
    def reject_database_url_in_auth_setting(cls, value: str | None) -> str | None:
        if value and value.startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
            raise ValueError(
                "SUPABASE_URL must be the HTTPS project URL (https://<project-ref>.supabase.co). "
                "Put the PostgreSQL URL in SUPABASE_CONNECTION_STRING or DATABASE_URL instead."
            )
        return value

    @field_validator("supabase_key", mode="before")
    @classmethod
    def normalize_supabase_key(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()

    def require_supabase_auth_key(self) -> str:
        """Return the configured Supabase auth key used by the backend for token validation."""
        if self.supabase_key:
            return self.supabase_key
        raise RuntimeError(
            "Configure SUPABASE_KEY with the Supabase auth key before enabling token validation."
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_database_settings() -> DatabaseSettings:
    return DatabaseSettings()


def get_database_url() -> str:
    return get_database_settings().require_database_url()
