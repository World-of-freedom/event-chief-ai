from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AdminUserOut(BaseModel):
    id: UUID
    email: str | None
    created_at: datetime | None
    email_confirmed_at: datetime | None
    banned_until: datetime | None
    is_platform_admin: bool


class AdminRolePatch(BaseModel):
    is_platform_admin: bool
