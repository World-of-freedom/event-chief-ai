"""Shared test setup.

Tests marked `integration` write to the configured Postgres database (they clean up
after themselves). They are skipped automatically when no database URL is set, e.g. in CI.
"""

import pytest

from app.core.settings import get_database_settings


def _database_configured() -> bool:
    return bool(get_database_settings().database_url)


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if _database_configured():
        return
    skip = pytest.mark.skip(reason="No DATABASE_URL / SUPABASE_CONNECTION_STRING configured")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)
