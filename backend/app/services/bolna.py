"""Bolna adapter contract.

Keep provider payload shape here. Routes, repositories, and the frontend should
only consume application DTOs after this adapter has normalized them.
"""

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class NormalizedCallUpdate:
    provider_call_id: str
    status: str
    event_key: str
    summary: str | None = None
    transcript_text: str | None = None
    extracted_fields: dict[str, Any] | None = None


class BolnaAdapter(Protocol):
    def start_call(self, *, agent_id: str, recipient_phone_number: str, user_data: dict[str, str]) -> str: ...
    def normalize_webhook(self, payload: dict[str, Any]) -> NormalizedCallUpdate: ...


# TODO: validate the current Bolna outbound-call and webhook contract in staging,
# then implement signature/header verification and idempotency handling here.
