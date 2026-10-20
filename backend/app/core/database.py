"""SQLAlchemy runtime session factory.

No engine is created during FastAPI startup. This prevents an application boot
from mutating or even requiring a database. Alembic owns all schema changes.
"""

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.settings import get_database_url


@lru_cache
def get_engine() -> Engine:
    return create_engine(
        get_database_url(),
        pool_pre_ping=True,
        pool_recycle=1800,
    )


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, autocommit=False, expire_on_commit=False)


def get_db_session() -> Generator[Session, None, None]:
    """FastAPI dependency for future repositories; callers own transaction boundaries."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
