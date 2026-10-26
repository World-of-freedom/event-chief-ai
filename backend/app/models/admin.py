from __future__ import annotations

from uuid import UUID

from sqlalchemy import ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin


class PlatformAdmin(CreatedAtMixin, Base):
    """Server-managed administrator grants. There is intentionally no browser RLS policy."""

    __tablename__ = "platform_admins"

    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("auth.users.id", ondelete="CASCADE"), primary_key=True)
    granted_by: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("auth.users.id", ondelete="SET NULL"))
