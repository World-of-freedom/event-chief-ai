"""Approval-gated outreach service contracts."""

from typing import Protocol


class EmailGateway(Protocol):
    def send(self, *, recipient: str, subject: str, body: str, idempotency_key: str) -> str: ...


class OutreachService(Protocol):
    def create_draft(self, *, opportunity_id: str, owner_id: str) -> dict: ...
    def approve(self, *, message_id: str, owner_id: str) -> dict: ...
    def send_approved(self, *, message_id: str, owner_id: str) -> dict: ...


# TODO: implement the service only after reviewer/approval and Resend retry policy are agreed.
