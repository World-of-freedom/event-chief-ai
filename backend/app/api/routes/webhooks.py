"""Public provider endpoints.

TODO: verify the provider's current signature/header before parsing payloads.
Public routes must never rely on a browser bearer token.
"""

from fastapi import APIRouter

from app.api.routes._stubs import not_implemented

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/bolna")
def bolna_webhook() -> None:
    not_implemented("Bolna webhook processing")
