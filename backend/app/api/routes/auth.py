"""Authenticated identity boundary used by the frontend/API integration."""

from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def current_account(user: CurrentUser = Depends(get_current_user)) -> dict[str, str | None]:
    return {"id": user.id, "email": user.email}
