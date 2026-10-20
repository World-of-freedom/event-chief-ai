"""Shared repository conventions.

TODO: choose one concrete data-access strategy (Supabase Python client, SQLAlchemy,
or another adapter) before implementing repositories. Do not mix strategies.
"""

from typing import Protocol


class UnitOfWork(Protocol):
    def commit(self) -> None: ...

    def rollback(self) -> None: ...
