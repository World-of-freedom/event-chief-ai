"""Small, provider-specific boundary for Bolna outbound calls and webhooks."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from typing import Any, Protocol

import httpx


@dataclass(frozen=True)
class NormalizedCallUpdate:
    provider_call_id: str
    status: str
    event_key: str
    summary: str | None = None
    transcript_text: str | None = None
    recording_url: str | None = None
    outcome: str | None = None
    extracted_fields: dict[str, Any] | None = None


class BolnaError(RuntimeError):
    """Base error for a failed provider request."""


class BolnaPermanentError(BolnaError):
    """The request was rejected and should not be retried."""


class BolnaRetryableError(BolnaError):
    """The provider definitely did not accept the request; a retry is safe."""


class BolnaSubmissionUnknownError(BolnaError):
    """The request may have reached Bolna but no execution ID was returned."""


class BolnaAdapter(Protocol):
    def start_call(
        self,
        *,
        agent_id: str,
        recipient_phone_number: str,
        user_data: dict[str, str],
        from_phone_number: str | None = None,
    ) -> str: ...

    def normalize_webhook(self, payload: dict[str, Any]) -> NormalizedCallUpdate: ...


class BolnaClient:
    """Synchronous HTTP client used by the standalone worker, never by browsers."""

    base_url = "https://api.bolna.ai"

    def __init__(self, *, api_key: str, client: httpx.Client | None = None) -> None:
        self._api_key = api_key
        self._client = client or httpx.Client(timeout=httpx.Timeout(20.0, connect=8.0))

    def start_call(
        self,
        *,
        agent_id: str,
        recipient_phone_number: str,
        user_data: dict[str, str],
        from_phone_number: str | None = None,
    ) -> str:
        if not self._api_key or not agent_id:
            raise BolnaPermanentError("Bolna API key and agent ID must be configured before a call can start.")
        payload = {
            "agent_id": agent_id,
            "recipient_phone_number": recipient_phone_number,
            "user_data": user_data,
        }
        if from_phone_number:
            payload["from_phone_number"] = from_phone_number
        try:
            response = self._client.post(
                f"{self.base_url}/call",
                headers={"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"},
                json=payload,
            )
        except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.RemoteProtocolError) as exc:
            raise BolnaSubmissionUnknownError("Bolna submission outcome is unknown; no automatic redial was attempted.") from exc
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout) as exc:
            raise BolnaRetryableError("Could not reach Bolna before submitting the call.") from exc
        except httpx.HTTPError as exc:
            raise BolnaSubmissionUnknownError("Bolna submission outcome is unknown.") from exc

        if response.status_code in {400, 401, 403, 404, 422}:
            raise BolnaPermanentError(f"Bolna rejected the call request ({response.status_code}).")
        if response.status_code == 429:
            raise BolnaRetryableError("Bolna rate limited the call request.")
        if response.status_code >= 500:
            # A provider-side error can be returned after the provider accepted work.
            raise BolnaSubmissionUnknownError(f"Bolna returned {response.status_code}; submission may have succeeded.")
        try:
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise BolnaSubmissionUnknownError("Bolna returned an unreadable call response.") from exc

        provider_id = _provider_id(body)
        if not provider_id:
            raise BolnaSubmissionUnknownError("Bolna did not return an execution ID.")
        return provider_id

    def get_call_details(self, provider_call_id: str) -> dict[str, Any]:
        """Fetch a known execution when reconciling a stale, already-submitted call."""
        try:
            response = self._client.get(
                f"{self.base_url}/execution/{provider_call_id}",
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise BolnaRetryableError("Could not fetch the existing Bolna execution.") from exc
        if not isinstance(body, dict):
            raise BolnaRetryableError("Bolna returned an invalid execution response.")
        return body

    def get_recording(self, recording_url: str) -> tuple[bytes, str | None]:
        """Fetch a recording server-side so the browser never needs the Bolna API key."""
        if not self._api_key:
            raise BolnaPermanentError("Bolna API key must be configured before a recording can be played.")
        try:
            response = self._client.get(recording_url, headers={"Authorization": f"Bearer {self._api_key}"})
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise BolnaRetryableError("Could not retrieve the call recording from Bolna.") from exc
        return response.content, response.headers.get("content-type")

    def normalize_webhook(self, payload: dict[str, Any]) -> NormalizedCallUpdate:
        return normalize_webhook(payload)


def _provider_id(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("execution_id", "call_id", "id"):
        value = payload.get(key)
        if value:
            return str(value)
    nested = payload.get("data") or payload.get("execution")
    return _provider_id(nested)


def _text(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
        joined = "\n".join(part.strip() for part in parts if part.strip())
        return joined or None
    return None


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _first(*values: Any) -> Any:
    return next((value for value in values if value is not None), None)


def normalize_webhook(payload: dict[str, Any]) -> NormalizedCallUpdate:
    """Map the small common subset of Bolna execution payloads to application values."""
    execution = _mapping(payload.get("execution")) or _mapping(payload.get("data")) or payload
    telephony = _mapping(payload.get("telephony_data")) or _mapping(execution.get("telephony_data"))
    provider_call_id = _provider_id(payload) or _provider_id(execution)
    if not provider_call_id:
        raise BolnaPermanentError("Bolna webhook did not include an execution ID.")

    raw_status = str(_first(payload.get("status"), execution.get("status"), "")).strip().lower().replace("_", "-")
    status_map = {
        "scheduled": "initiated",
        "queued": "initiated",
        "initiated": "initiated",
        "in-progress": "in_progress",
        "inprogress": "in_progress",
        "completed": "completed",
        "complete": "completed",
        "no-answer": "no_answer",
        "noanswer": "no_answer",
        "busy": "no_answer",
        "failed": "failed",
        "stopped": "failed",
        "error": "failed",
        "balance-low": "failed",
        "cancelled": "cancelled",
        "canceled": "cancelled",
    }
    status = status_map.get(raw_status, "initiated")
    extracted = _first(
        payload.get("extracted_fields"),
        payload.get("extracted_data"),
        execution.get("extracted_fields"),
        execution.get("extracted_data"),
    )
    if not isinstance(extracted, dict):
        extracted = {}
    outcome = _first(payload.get("outcome"), execution.get("outcome"), extracted.get("outcome"), extracted.get("call_outcome"))
    outcome_text = str(outcome).lower() if outcome else None
    valid_outcomes = {"interested", "needs_information", "offer_mentioned", "declined", "callback_requested", "opt_out", "no_answer", "other"}
    if outcome_text not in valid_outcomes:
        outcome_text = "no_answer" if status == "no_answer" else None

    event_marker = payload.get("event_id") or payload.get("webhook_id")
    if event_marker:
        event_key = str(event_marker)
    else:
        changed_at = _first(payload.get("updated_at"), payload.get("timestamp"), execution.get("updated_at"), "")
        digest = sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]
        event_key = f"{provider_call_id}:{raw_status}:{changed_at}:{digest}"

    return NormalizedCallUpdate(
        provider_call_id=provider_call_id,
        status=status,
        event_key=event_key[:255],
        summary=_text(_first(payload.get("summary"), payload.get("call_summary"), execution.get("summary"))),
        transcript_text=_text(_first(payload.get("transcript"), execution.get("transcript"))),
        recording_url=_text(_first(
            payload.get("recording_url"),
            payload.get("recording"),
            execution.get("recording_url"),
            telephony.get("recording_url"),
        )),
        outcome=outcome_text,
        extracted_fields=extracted,
    )
