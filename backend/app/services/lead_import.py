"""Turn an AI-discovered sponsor lead into a pipeline prospect.

The imported prospect always starts as `unverified`: AI/Hunter findings (including
contact emails) stay untrusted until the organizer reviews them.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import VerificationStatus
from app.models.prospects import Prospect
from app.models.research import ResearchJob, SponsorLead


def normalize_domain(url_or_domain: str | None) -> str | None:
    if not url_or_domain or not url_or_domain.strip():
        return None
    value = url_or_domain.strip().lower()
    host = urlparse(value if "://" in value else f"https://{value}").hostname or ""
    host = host.removeprefix("www.")
    return host or None


def prospect_fields_from_lead(lead: SponsorLead, job: ResearchJob) -> dict[str, Any]:
    evidence_count = len(lead.evidence or [])
    notes = [
        f"Imported from AI sponsor discovery run \"{job.event_name}\" (lead {lead.id}).",
        f"Discovery source: {lead.discovery_source or 'live web research'}.",
        f"Match score {lead.score_total}/100, {lead.confidence} confidence, {evidence_count} cited evidence item(s).",
        "Contact details were found automatically and are unverified until reviewed.",
    ]
    website = lead.website_url or (f"https://{lead.domain}" if lead.domain else None)
    return {
        "company_name": lead.company_name[:180],
        "website_url": website,
        "industry": (lead.industry or None) and lead.industry[:100],
        "description": lead.description,
        "contact_name": (lead.contact_name or None) and lead.contact_name[:160],
        "contact_role": (lead.contact_role or None) and lead.contact_role[:160],
        "email": (lead.contact_email or None) and lead.contact_email[:320],
        "phone": (lead.contact_phone or None) and lead.contact_phone[:32],
        "location": (lead.location or None) and lead.location[:160],
        "source_url": lead.sponsorship_page_url or lead.source_url or website,
        "source_notes": " ".join(notes),
        "fit_reason": lead.ranking_explanation,
        "verification_status": VerificationStatus.UNVERIFIED,
    }


def find_matching_prospect(db: Session, owner_id: UUID, lead: SponsorLead) -> Prospect | None:
    """Reuse an existing prospect for the same company (same website domain, else same name)."""
    lead_domain = normalize_domain(lead.domain or lead.website_url)
    candidates = db.scalars(select(Prospect).where(Prospect.owner_id == owner_id)).all()
    if lead_domain:
        for prospect in candidates:
            if normalize_domain(prospect.website_url) == lead_domain:
                return prospect
    name = lead.company_name.strip().lower()
    return db.scalar(
        select(Prospect).where(Prospect.owner_id == owner_id, func.lower(func.trim(Prospect.company_name)) == name)
    )
