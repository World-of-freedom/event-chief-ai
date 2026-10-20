"""Sponsor discovery extension point.

This module intentionally contains no crawling, ranking, enrichment, or contact
generation. The frontend uses local placeholder fixtures until a reviewed data
source and explainable matching policy are approved.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class DiscoveryCandidate:
    prospect_id: str
    score: int
    fit_reason: str
    source_url: str | None


class DiscoveryService(Protocol):
    def recommend(self, *, event_id: str, owner_id: str, limit: int = 10) -> list[DiscoveryCandidate]: ...


class DiscoveryServiceStub:
    def recommend(self, *, event_id: str, owner_id: str, limit: int = 10) -> list[DiscoveryCandidate]:
        # TODO: inject a reviewed prospect source and deterministic scoring policy.
        raise NotImplementedError("Sponsor discovery is a template; no live data source is configured.")
