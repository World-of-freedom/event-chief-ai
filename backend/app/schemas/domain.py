"""Compatibility exports for domain API types.

Prefer importing from `schemas.events` or `schemas.sponsorship` in new modules.
"""

from app.schemas.events import EventInput, EventPatch, ResourceNeedInput
from app.schemas.sponsorship import (
    CallReviewInput,
    EmailDraftInput,
    OfferInput,
    OpportunityInput,
    OpportunityPatch,
    ProspectInput,
    TaskInput,
)

__all__ = [
    "CallReviewInput",
    "EmailDraftInput",
    "EventInput",
    "EventPatch",
    "OfferInput",
    "OpportunityInput",
    "OpportunityPatch",
    "ProspectInput",
    "ResourceNeedInput",
    "TaskInput",
]
