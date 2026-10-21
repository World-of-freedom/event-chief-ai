from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from app.core.supabase import get_supabase


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None

    @property
    def uuid(self) -> UUID:
        return UUID(self.id)


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    try:
        response = get_supabase().auth.get_user(token)
        user = response.user
    except Exception as exc:  # Supabase intentionally hides token-validation details.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return CurrentUser(id=str(user.id), email=user.email)


AuthenticatedUser = Depends(get_current_user)
