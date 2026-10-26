"""Small provider boundary for organizer-approved Resend delivery."""

from __future__ import annotations

import httpx


class OutreachDeliveryError(RuntimeError):
    pass


def send_with_resend(*, api_key: str, sender: str, recipient: str, subject: str, body: str, idempotency_key: str) -> str:
    """Send one already-approved email without exposing provider credentials to the browser."""
    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Idempotency-Key": idempotency_key},
            json={"from": sender, "to": [recipient], "subject": subject, "text": body},
            timeout=20,
        )
        response.raise_for_status()
        provider_id = response.json().get("id")
    except (httpx.HTTPError, ValueError) as exc:
        raise OutreachDeliveryError(str(exc)) from exc
    if not provider_id:
        raise OutreachDeliveryError("Resend did not return a delivery id.")
    return str(provider_id)
