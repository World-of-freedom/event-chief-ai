"""Small, server-enforced platform administration surface."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db_session
from app.core.settings import Settings, get_settings
from app.models.admin import PlatformAdmin
from app.schemas.admin import AdminRolePatch, AdminUserOut

router = APIRouter(prefix="/admin", tags=["admin"])


def is_platform_admin(db: Session, user: CurrentUser, settings: Settings) -> bool:
    """Only a server-side grant or deployment allowlist can confer admin access."""
    if user.email and user.email.strip().lower() in settings.bootstrap_admin_emails:
        return True
    return db.get(PlatformAdmin, user.uuid) is not None


def require_platform_admin(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if not is_platform_admin(db, user, settings):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform administrator access is required.")
    return user


@router.get("/me")
def get_admin_me(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> dict[str, bool]:
    return {"is_platform_admin": is_platform_admin(db, user, settings)}


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    _: CurrentUser = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
):
    rows = db.execute(
        text(
            "SELECT id, email, created_at, email_confirmed_at, banned_until "
            "FROM auth.users ORDER BY created_at DESC LIMIT 500"
        )
    ).mappings().all()
    admin_ids = set(db.scalars(select(PlatformAdmin.user_id)).all())
    return [
        AdminUserOut(
            id=row["id"],
            email=row["email"],
            created_at=row["created_at"],
            email_confirmed_at=row["email_confirmed_at"],
            banned_until=row["banned_until"],
            is_platform_admin=row["id"] in admin_ids,
        )
        for row in rows
    ]


@router.patch("/users/{user_id}/role", response_model=dict[str, bool])
def update_admin_role(
    user_id: UUID,
    body: AdminRolePatch,
    actor: CurrentUser = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
):
    if user_id == actor.uuid:
        raise HTTPException(status_code=403, detail="Administrators cannot change their own role.")
    exists = db.scalar(text("SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = :id)"), {"id": user_id})
    if not exists:
        raise HTTPException(status_code=404, detail="User not found.")
    grant = db.get(PlatformAdmin, user_id)
    if body.is_platform_admin and not grant:
        db.add(PlatformAdmin(user_id=user_id, granted_by=actor.uuid))
    elif not body.is_platform_admin and grant:
        db.delete(grant)
    db.commit()
    return {"is_platform_admin": body.is_platform_admin}
