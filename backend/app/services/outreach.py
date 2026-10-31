"""Small provider boundary for organizer-approved Gmail or Resend delivery."""

from __future__ import annotations

from email.message import EmailMessage
import smtplib
import ssl

import httpx


class OutreachDeliveryError(RuntimeError):
    pass


def send_with_gmail(*, sender: str, app_password: str, recipient: str, subject: str, body: str, idempotency_key: str) -> str:
    """Send through one shared Gmail account using its app password."""
    email = EmailMessage()
    email["From"] = sender
    email["To"] = recipient
    email["Subject"] = subject
    email.set_content(body)
    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(sender, app_password.replace(" ", ""))
            smtp.send_message(email)
    except (OSError, smtplib.SMTPException, ValueError) as exc:
        raise OutreachDeliveryError(str(exc)) from exc
    return f"gmail-{idempotency_key}"


def _resend_error(response: httpx.Response) -> str:
    """Keep the provider's useful error text for the organizer-facing retry flow."""
    try:
        payload = response.json()
    except ValueError:
        payload = None
    if isinstance(payload, dict):
        detail = payload.get("message") or payload.get("error") or payload.get("name")
        if detail:
            return str(detail)
    return response.text or response.reason_phrase or "Unknown provider error"


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
    except httpx.HTTPStatusError as exc:
        raise OutreachDeliveryError(f"Resend returned {exc.response.status_code}: {_resend_error(exc.response)[:1000]}") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise OutreachDeliveryError(str(exc)) from exc
    if not provider_id:
        raise OutreachDeliveryError("Resend did not return a delivery id.")
    return str(provider_id)
