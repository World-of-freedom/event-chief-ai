"""Small per-organizer cache for source-backed company research.

Cached records contain only public, cited company research. Event-specific match
scores are intentionally excluded: every event recalculates them from scratch.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.core.database import get_session_factory
from app.models.research import CompanyResearchCache
from app.services.research.scorer import CandidateContact, CandidateLead

CACHE_TTL = timedelta(days=7)


def _snapshot(candidate: CandidateLead) -> dict[str, Any]:
    return {
        "company_name": candidate.company_name,
        "domain": candidate.domain,
        "website_url": candidate.website_url,
        "industry": candidate.industry,
        "description": candidate.description,
        "location": candidate.location,
        "latitude": candidate.latitude,
        "longitude": candidate.longitude,
        "sponsorship_page_url": candidate.sponsorship_page_url,
        "source_url": candidate.source_url,
        "evidence": candidate.evidence,
        "contacts": [
            {
                "kind": contact.kind,
                "value": contact.value,
                "source_url": contact.source_url,
                "source_title": contact.source_title,
                "source_excerpt": contact.source_excerpt,
                "source_quality": contact.source_quality,
                "role": contact.role,
                "name": contact.name,
                "normalized_value": contact.normalized_value,
                "basic_check_status": contact.basic_check_status,
                "basic_check_results": contact.basic_check_results,
                "display_status": contact.display_status,
            }
            for contact in candidate.contacts
        ],
    }


def _merge_snapshot(candidate: CandidateLead, snapshot: dict[str, Any]) -> None:
    for field in ("website_url", "industry", "description", "location", "latitude", "longitude", "sponsorship_page_url", "source_url"):
        if getattr(candidate, field, None) is None and snapshot.get(field) is not None:
            setattr(candidate, field, snapshot[field])
    candidate.evidence.extend(item for item in snapshot.get("evidence", []) if isinstance(item, dict))
    for item in snapshot.get("contacts", []):
        if not isinstance(item, dict) or not item.get("kind") or not item.get("value") or not item.get("source_url"):
            continue
        candidate.contacts.append(CandidateContact(**item))


def hydrate_cached_company_research(owner_id: UUID, candidates: list[CandidateLead]) -> set[str]:
    """Merge fresh cached research and return domains that do not need a lookup."""
    domains = {candidate.domain for candidate in candidates if candidate.domain}
    if not domains:
        return set()
    cutoff = datetime.now(timezone.utc) - CACHE_TTL
    session_factory = get_session_factory()
    with session_factory() as session:
        rows = session.scalars(
            select(CompanyResearchCache).where(
                CompanyResearchCache.owner_id == owner_id,
                CompanyResearchCache.canonical_domain.in_(domains),
                CompanyResearchCache.retrieved_at >= cutoff,
            )
        ).all()
    snapshots = {row.canonical_domain: row.research_snapshot for row in rows}
    hit_domains: set[str] = set()
    for candidate in candidates:
        if candidate.domain and isinstance(snapshots.get(candidate.domain), dict):
            _merge_snapshot(candidate, snapshots[candidate.domain])
            hit_domains.add(candidate.domain)
    return hit_domains


def store_company_research(owner_id: UUID, candidates: list[CandidateLead]) -> None:
    """Upsert newly targeted research, retaining source excerpts and contacts."""
    now = datetime.now(timezone.utc)
    session_factory = get_session_factory()
    with session_factory() as session:
        for candidate in candidates:
            if not candidate.domain:
                continue
            row = session.scalar(
                select(CompanyResearchCache).where(
                    CompanyResearchCache.owner_id == owner_id,
                    CompanyResearchCache.canonical_domain == candidate.domain,
                )
            )
            if row:
                row.research_snapshot = _snapshot(candidate)
                row.retrieved_at = now
            else:
                session.add(CompanyResearchCache(
                    owner_id=owner_id,
                    canonical_domain=candidate.domain,
                    research_snapshot=_snapshot(candidate),
                    retrieved_at=now,
                ))
        session.commit()
