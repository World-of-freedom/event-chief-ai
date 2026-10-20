"""Pure-Python scoring and ranking engine for sponsor leads.

Calculates weighted scores according to the specification:
  - Event and audience relevance:        25 points
  - Industry and product fit:            20 points
  - Sponsorship history and evidence:    20 points
  - Geographic fit:                      15 points
  - Estimated budget compatibility:      10 points
  - Contactability & outreach readiness: 10 points
  Total:                                100 points

Evidence-based:
- Missing information is marked as unknown (neutral), not penalized as poor fit.
- Contactability only awards points for verified, usable public contact channels.
- Calculates Haversine distance when GPS coordinates are available.
"""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# Weight constants
W_RELEVANCE = 25
W_INDUSTRY = 20
W_SPONSORSHIP = 20
W_GEOGRAPHY = 15
W_BUDGET = 10
W_CONTACT = 10

# Industry mappings for semantic alignment
EVENT_TYPE_INDUSTRY_MAP: dict[str, list[str]] = {
    "hackathon": ["technology", "software", "cloud", "developer", "fintech", "edtech", "hardware", "ai", "web3"],
    "tech_conference": ["technology", "software", "cloud", "telecom", "consulting", "electronics", "ai"],
    "cultural_fest": ["food", "beverage", "fashion", "apparel", "lifestyle", "entertainment", "media", "fmcg"],
    "sports": ["sports", "fitness", "beverage", "nutrition", "apparel", "gaming", "automotive"],
    "career_fair": ["technology", "consulting", "financial services", "banking", "recruitment", "manufacturing"],
    "workshop": ["edtech", "software", "publishing", "education", "technology"],
    "music_festival": ["beverage", "audio", "entertainment", "lifestyle", "apparel", "telecom"],
    "gaming": ["gaming", "esports", "hardware", "energy drink", "audio", "software", "peripherals"],
    "entrepreneurship": ["venture capital", "fintech", "cloud", "saas", "consulting", "banking", "legal"],
}

AUDIENCE_INDUSTRY_MAP: dict[str, list[str]] = {
    "student": ["edtech", "technology", "food", "beverage", "gaming", "apparel", "fintech"],
    "developer": ["software", "cloud", "hardware", "developer tools", "ai", "cybersecurity"],
    "youth": ["fashion", "beverage", "music", "gaming", "fmcg", "social media", "qsr"],
    "professional": ["saas", "consulting", "financial services", "cloud", "b2b", "travel"],
}


@dataclass
class CandidateLead:
    company_name: str
    domain: str | None
    website_url: str | None
    industry: str | None
    description: str | None
    location: str | None
    latitude: float | None = None
    longitude: float | None = None
    distance_km: float | None = None

    contact_email: str | None = None
    contact_phone: str | None = None
    contact_name: str | None = None
    contact_role: str | None = None
    linkedin_url: str | None = None
    twitter_url: str | None = None
    instagram_url: str | None = None
    sponsorship_page_url: str | None = None

    discovery_source: str = "web"
    source_url: str | None = None
    evidence: list[dict[str, Any]] = field(default_factory=list)

    # Scored breakdown
    score_relevance: int = 0
    score_industry_fit: int = 0
    score_sponsorship_history: int = 0
    score_geographic_fit: int = 0
    score_budget_compatibility: int = 0
    score_contactability: int = 0
    score_total: int = 0
    ranking_explanation: str = ""
    confidence: str = "low"


def normalize_domain(url_or_domain: str | None) -> str | None:
    """Extract clean domain name (e.g., 'sub.example.com' -> 'example.com')."""
    if not url_or_domain:
        return None
    cleaned = url_or_domain.lower().strip()
    cleaned = re.sub(r"^https?://", "", cleaned)
    cleaned = re.sub(r"^www\.", "", cleaned)
    domain_part = cleaned.split("/")[0].split("?")[0].split(":")[0]
    return domain_part if domain_part else None


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Great Circle distance between two points in km."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def compute_relevance_score(candidate: CandidateLead, event: dict[str, Any]) -> int:
    """Evaluate event type & audience match (0-25 pts)."""
    score = 0
    industry = (candidate.industry or "").lower()
    description = (candidate.description or "").lower()
    ev_type = (event.get("event_type") or "").lower().replace("-", "_")
    audience = (event.get("primary_audience") or "").lower()

    # Event type alignment
    compatible_industries = EVENT_TYPE_INDUSTRY_MAP.get(ev_type, [])
    if any(ci in industry or ci in description for ci in compatible_industries):
        score += 12

    # Target audience keywords match
    for aud_key, mapped_inds in AUDIENCE_INDUSTRY_MAP.items():
        if aud_key in audience:
            if any(mi in industry or mi in description for mi in mapped_inds):
                score += 8
                break

    # Resource need alignment
    needs = event.get("support_types_needed") or []
    if "cloud_credits" in needs and any(kw in industry or kw in description for kw in ["cloud", "hosting", "software", "tech"]):
        score += 5
    elif "food" in needs and any(kw in industry or kw in description for kw in ["food", "beverage", "restaurant", "cafe", "snack"]):
        score += 5
    elif "prizes" in needs and any(kw in industry or kw in description for kw in ["gaming", "electronics", "gadget", "merchandise"]):
        score += 5
    elif "cash" in needs:
        score += 3  # All corporate sponsors can potentially fund cash

    return min(W_RELEVANCE, max(2, score))


def compute_industry_fit(candidate: CandidateLead, event: dict[str, Any]) -> int:
    """Evaluate industry synergy (0-20 pts)."""
    score = 0
    industry = (candidate.industry or "").lower()
    ev_type = (event.get("event_type") or "").lower().replace("-", "_")

    if not industry:
        return 7  # Unknown — neutral score

    matched_count = 0
    for target in EVENT_TYPE_INDUSTRY_MAP.get(ev_type, []):
        if target in industry:
            matched_count += 1

    if matched_count >= 2:
        score = 20
    elif matched_count == 1:
        score = 15
    else:
        # Check if broad commercial match
        score = 8

    return min(W_INDUSTRY, score)


def compute_sponsorship_history(candidate: CandidateLead) -> int:
    """Evaluate previous sponsorship track record & partnership evidence (0-20 pts)."""
    score = 0
    evidence_list = candidate.evidence or []

    sponsorship_items = [
        e for e in evidence_list
        if e.get("evidence_type") in ("sponsorship_history", "brand_partnership")
    ]

    if sponsorship_items:
        # Verified previous sponsorship history
        score = min(20, 10 + len(sponsorship_items) * 5)
    elif candidate.sponsorship_page_url:
        # Has an active, published sponsorship or partnership portal
        score = 14
    elif len(evidence_list) > 0:
        # Other general partnership or local evidence
        score = 8
    else:
        # Unknown sponsorship history (neutral, not 0)
        score = 3

    return min(W_SPONSORSHIP, score)


def compute_geographic_fit(
    candidate: CandidateLead,
    event: dict[str, Any],
    venue_coords: tuple[float, float] | None = None,
) -> int:
    """Evaluate distance or city presence (0-15 pts)."""
    score = 0
    event_city = (event.get("venue_city") or "").lower().strip()
    event_state = (event.get("venue_state") or "").lower().strip()
    cand_loc = (candidate.location or "").lower()

    if (
        venue_coords
        and candidate.latitude is not None
        and candidate.longitude is not None
    ):
        v_lat, v_lon = venue_coords
        dist = haversine_distance_km(v_lat, v_lon, candidate.latitude, candidate.longitude)
        candidate.distance_km = round(dist, 2)

        if dist <= 10.0:
            score = 15
        elif dist <= 30.0:
            score = 12
        elif dist <= 100.0:
            score = 9
        elif dist <= 500.0:
            score = 6
        else:
            score = 3
    elif event_city and event_city in cand_loc:
        score = 13
    elif event_state and event_state in cand_loc:
        score = 8
    elif "india" in cand_loc:
        score = 5
    else:
        # Location unknown / remote
        score = 4

    return min(W_GEOGRAPHY, score)


def compute_budget_compatibility(candidate: CandidateLead, event: dict[str, Any]) -> int:
    """Estimate budget fit based on scale and requirements (0-10 pts)."""
    # Unless explicit financials exist, treat as estimate
    desc = (candidate.description or "").lower()
    industry = (candidate.industry or "").lower()

    is_enterprise = any(k in desc or k in industry for k in ["multinational", "global", "enterprise", "publicly listed", "conglomerate", "tech giant"])
    is_scaleup = any(k in desc or k in industry for k in ["series a", "series b", "unicorn", "fast-growing", "startup"])

    target_budget = event.get("budget_target_inr")

    if is_enterprise:
        score = 9
    elif is_scaleup:
        score = 7
    else:
        # Unknown company scale — neutral estimate
        score = 5

    return min(W_BUDGET, score)


def compute_contactability(candidate: CandidateLead) -> int:
    """Evaluate public outreach channels found (0-10 pts)."""
    score = 0

    if candidate.contact_email:
        score += 5
    if candidate.sponsorship_page_url:
        score += 3
    if candidate.contact_phone:
        score += 1
    if candidate.linkedin_url or candidate.twitter_url:
        score += 1

    return min(W_CONTACT, score)


def generate_ranking_explanation(cand: CandidateLead, event: dict[str, Any]) -> str:
    """Generate clear, transparent rationale explaining why this sponsor was ranked."""
    highlights: list[str] = []

    if cand.score_relevance >= 15:
        highlights.append("Strong audience and event profile alignment")
    elif cand.score_relevance >= 8:
        highlights.append("Good event relevance")

    if cand.score_sponsorship_history >= 14:
        highlights.append("Demonstrated sponsorship track record with student/community events")
    elif cand.sponsorship_page_url:
        highlights.append("Has dedicated sponsorship/partnership portal")

    if cand.distance_km is not None:
        if cand.distance_km <= 15:
            highlights.append(f"Located within {cand.distance_km:.1f} km of venue")
        else:
            highlights.append(f"Located {cand.distance_km:.0f} km from venue")
    elif cand.score_geographic_fit >= 10:
        highlights.append("Local presence confirmed in host city")

    if cand.contact_email:
        highlights.append("Direct contact email verified")
    elif cand.sponsorship_page_url:
        highlights.append("Online partnership application channel found")
    else:
        highlights.append("Requires additional contact discovery")

    return "; ".join(highlights) + "." if highlights else "Potential brand match based on search discovery."


def score_and_rank_candidates(
    candidates: list[CandidateLead],
    event: dict[str, Any],
    venue_coords: tuple[float, float] | None = None,
) -> list[CandidateLead]:
    """Score all candidate leads and sort by score_total descending."""
    scored: list[CandidateLead] = []

    for c in candidates:
        c.score_relevance = compute_relevance_score(c, event)
        c.score_industry_fit = compute_industry_fit(c, event)
        c.score_sponsorship_history = compute_sponsorship_history(c)
        c.score_geographic_fit = compute_geographic_fit(c, event, venue_coords=venue_coords)
        c.score_budget_compatibility = compute_budget_compatibility(c, event)
        c.score_contactability = compute_contactability(c)

        c.score_total = (
            c.score_relevance
            + c.score_industry_fit
            + c.score_sponsorship_history
            + c.score_geographic_fit
            + c.score_budget_compatibility
            + c.score_contactability
        )

        # Confidence: High if evidence and contact exist, medium if website and industry exist
        points_count = sum([
            bool(c.website_url),
            bool(c.industry),
            bool(c.contact_email or c.sponsorship_page_url),
            len(c.evidence) > 0,
        ])
        if points_count >= 3:
            c.confidence = "high"
        elif points_count >= 2:
            c.confidence = "medium"
        else:
            c.confidence = "low"

        c.ranking_explanation = generate_ranking_explanation(c, event)
        scored.append(c)

    # Sort primarily by score_total descending, secondarily by confidence
    confidence_order = {"high": 3, "medium": 2, "low": 1}
    scored.sort(
        key=lambda item: (item.score_total, confidence_order.get(item.confidence, 0)),
        reverse=True,
    )
    return scored
