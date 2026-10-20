"""Persistence contracts for the sponsorship domain.

Concrete Supabase/Postgres queries intentionally do not live in the boilerplate.
Implement these contracts in a provider-specific adapter when the team's access
model, transaction strategy, and audit requirements are finalized.
"""

from __future__ import annotations

from typing import Any, Protocol


class SponsorshipRepository(Protocol):
    """Minimal interface required by future sponsorship application services."""

    def list_events(self, owner_id: str) -> list[dict[str, Any]]: ...

    def get_event(self, owner_id: str, event_id: str) -> dict[str, Any] | None: ...

    def create_event(self, owner_id: str, payload: dict[str, Any]) -> dict[str, Any]: ...

    def list_prospects(self, owner_id: str, filters: dict[str, str]) -> list[dict[str, Any]]: ...

    def get_opportunity(self, owner_id: str, opportunity_id: str) -> dict[str, Any] | None: ...

    def append_status_history(self, opportunity_id: str, actor_id: str, entry: dict[str, Any]) -> None: ...

    def record_webhook_event(self, provider: str, event_key: str, payload: dict[str, Any]) -> bool: ...


class RepositoryNotConfigured(RuntimeError):
    """Raised when a route is wired before the selected persistence adapter exists."""


class SponsorshipRepositoryStub:
    """Fail-closed placeholder; it never fabricates, stores, or returns event data."""

    def _raise(self) -> None:
        raise RepositoryNotConfigured(
            "TODO: provide a SponsorshipRepository implementation and register it in app.dependencies"
        )

    def list_events(self, owner_id: str) -> list[dict[str, Any]]:
        self._raise()

    def get_event(self, owner_id: str, event_id: str) -> dict[str, Any] | None:
        self._raise()

    def create_event(self, owner_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._raise()

    def list_prospects(self, owner_id: str, filters: dict[str, str]) -> list[dict[str, Any]]:
        self._raise()

    def get_opportunity(self, owner_id: str, opportunity_id: str) -> dict[str, Any] | None:
        self._raise()

    def append_status_history(self, opportunity_id: str, actor_id: str, entry: dict[str, Any]) -> None:
        self._raise()

    def record_webhook_event(self, provider: str, event_key: str, payload: dict[str, Any]) -> bool:
        self._raise()
