"""Deterministic, evidence-backed sponsor scoring.

The LLM may classify retrieved facts, but it never assigns the final ranking.
Both scores are computed here from retained evidence and contact checks so a
result can always explain how it was ranked.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse


MATCH_WEIGHTS: dict[str, int] = {
    "event_topic_alignment": 20,
    "target_audience_alignment": 20,
    "contribution_fit": 20,
    "sponsorship_program_evidence": 15,
    "geographic_relevance": 10,
    "scale_and_eligibility_fit": 10,
    "timing_and_contact_route": 5,
}

CONFIDENCE_WEIGHTS: dict[str, int] = {
    "company_identity_and_official_domain": 20,
    "sponsorship_evidence_reliability": 25,
    "contact_provenance_and_authenticity": 25,
    "deterministic_contact_checks": 20,
    "freshness_and_corroboration": 10,
}

SCORING_VERSION = "sponsor-discovery-v2"

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

SUPPORT_KEYWORDS: dict[str, list[str]] = {
    "cloud_credits": ["cloud", "hosting", "developer tools", "api", "software", "saas"],
    "food": ["food", "beverage", "restaurant", "cafe", "snack", "qsr"],
    "prizes": ["gaming", "electronics", "gadget", "merchandise", "hardware"],
    "equipment": ["hardware", "electronics", "audio", "camera", "equipment"],
    "speakers": ["education", "consulting", "developer", "technology"],
    "mentors": ["education", "consulting", "developer", "technology"],
    "venue": ["hotel", "coworking", "venue", "conference"],
    "merchandise": ["apparel", "merchandise", "printing", "fashion"],
}


@dataclass
class CandidateContact:
    kind: str  # email | phone | contact_form
    value: str
    source_url: str
    source_title: str | None = None
    source_excerpt: str | None = None
    source_quality: str = "secondary"  # official | secondary
    role: str | None = None
    name: str | None = None
    normalized_value: str | None = None
    basic_check_status: str = "not_checked"
    basic_check_results: dict[str, Any] = field(default_factory=dict)
    display_status: str = "needs_review"


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

    # Compatibility projection for existing lead imports. ``contacts`` is
    # authoritative for all new discovery records.
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
    contacts: list[CandidateContact] = field(default_factory=list)

    match_score: int = 0
    confidence_score: int = 0
    match_score_components: dict[str, dict[str, Any]] = field(default_factory=dict)
    confidence_score_components: dict[str, dict[str, Any]] = field(default_factory=dict)
    ranking_explanation: str = ""
    confidence: str = "low"

    # Retained for old clients and lead imports; derived from v2 factors.
    score_relevance: int = 0
    score_industry_fit: int = 0
    score_sponsorship_history: int = 0
    score_geographic_fit: int = 0
    score_budget_compatibility: int = 0
    score_contactability: int = 0
    score_total: int = 0


def normalize_domain(url_or_domain: str | None) -> str | None:
    """Return a canonical host name without scheme or ``www``."""
    if not url_or_domain or not url_or_domain.strip():
        return None
    value = url_or_domain.strip()
    parsed = urlparse(value if "://" in value else f"https://{value}")
    return (parsed.hostname or "").lower().removeprefix("www.") or None


def is_official_source(domain: str | None, source_url: str | None) -> bool:
    source_domain = normalize_domain(source_url)
    return bool(domain and source_domain and (source_domain == domain or source_domain.endswith(f".{domain}")))


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    d_lat, d_lon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _text(candidate: CandidateLead) -> str:
    evidence_text = " ".join(f"{item.get('claim', '')} {item.get('source_excerpt', '')}" for item in candidate.evidence)
    return " ".join(filter(None, [candidate.industry, candidate.description, evidence_text])).lower()


def _matches_any(text: str, values: list[str]) -> bool:
    return any(value in text for value in values)


def _factor(rating: int, weight: int, evidence: list[str]) -> dict[str, Any]:
    rating = max(0, min(5, int(rating)))
    return {"rating": rating, "weight": weight, "score": round(rating * weight / 5), "evidence": evidence}


def _evidence_of_type(candidate: CandidateLead, *types: str) -> list[dict[str, Any]]:
    return [item for item in candidate.evidence if item.get("evidence_type") in types]


def _evidence_summary(items: list[dict[str, Any]], maximum: int = 2) -> list[str]:
    return [str(item.get("claim", ""))[:180] for item in items[:maximum] if item.get("claim")]


def _event_topic_rating(candidate: CandidateLead, event: dict[str, Any]) -> tuple[int, list[str]]:
    text = _text(candidate)
    keywords = EVENT_TYPE_INDUSTRY_MAP.get((event.get("event_type") or "").lower().replace("-", "_"), [])
    sponsorship = _evidence_of_type(candidate, "sponsorship_history", "brand_partnership", "sponsorship_program")
    if _matches_any(text, keywords) and sponsorship:
        return 5, _evidence_summary(sponsorship)
    if _matches_any(text, keywords):
        return 4, ["Company products or services align with the event topic."]
    if sponsorship:
        return 3, _evidence_summary(sponsorship)
    return 1, ["No specific event-topic evidence was retrieved."]


def _audience_rating(candidate: CandidateLead, event: dict[str, Any]) -> tuple[int, list[str]]:
    text, audience = _text(candidate), (event.get("primary_audience") or "").lower()
    matched = [key for key, industries in AUDIENCE_INDUSTRY_MAP.items() if key in audience and _matches_any(text, industries)]
    evidence = _evidence_of_type(candidate, "audience_alignment")
    if matched and evidence:
        return 5, _evidence_summary(evidence)
    if matched:
        return 4, [f"Product/category appears relevant to the {matched[0]} audience."]
    if evidence:
        return 3, _evidence_summary(evidence)
    return 1, ["No audience-specific evidence was retrieved."]


def _contribution_rating(candidate: CandidateLead, event: dict[str, Any]) -> tuple[int, list[str]]:
    text = _text(candidate)
    needs = event.get("support_types_needed") or []
    matched = [need for need in needs if need != "cash" and _matches_any(text, SUPPORT_KEYWORDS.get(need, []))]
    evidence = _evidence_of_type(candidate, "contribution_fit", "sponsorship_program", "brand_partnership")
    if matched and evidence:
        return 5, [f"Evidence supports {', '.join(matched[:2]).replace('_', ' ')} contribution capability."]
    if matched:
        return 4, [f"Company offering is compatible with {', '.join(matched[:2]).replace('_', ' ')}."]
    if "cash" in needs and evidence:
        return 3, _evidence_summary(evidence)
    return 1, ["No evidenced contribution capability matches the event needs."]


def _program_rating(candidate: CandidateLead) -> tuple[int, list[str]]:
    items = _evidence_of_type(candidate, "sponsorship_history", "sponsorship_program", "brand_partnership")
    official = [item for item in items if item.get("source_quality") == "official"]
    if len(official) >= 2:
        return 5, _evidence_summary(official)
    if official:
        return 4, _evidence_summary(official)
    if len(items) >= 2:
        return 3, _evidence_summary(items)
    if candidate.sponsorship_page_url:
        return 3, ["A possible sponsorship or partnership route was retrieved."]
    return 0, ["No sponsorship program or partnership evidence was retrieved."]


def _geography_rating(candidate: CandidateLead, event: dict[str, Any], venue_coords: tuple[float, float] | None) -> tuple[int, list[str]]:
    city = (event.get("venue_city") or "").lower().strip()
    state = (event.get("venue_state") or "").lower().strip()
    location = (candidate.location or "").lower()
    if venue_coords and candidate.latitude is not None and candidate.longitude is not None:
        candidate.distance_km = round(haversine_distance_km(*venue_coords, candidate.latitude, candidate.longitude), 2)
        if candidate.distance_km <= 10:
            return 5, [f"Confirmed within {candidate.distance_km:.1f} km of the venue."]
        if candidate.distance_km <= 50:
            return 4, [f"Confirmed within {candidate.distance_km:.0f} km of the venue."]
        if candidate.distance_km <= 250:
            return 3, [f"Confirmed within {candidate.distance_km:.0f} km of the venue."]
        return 2, ["Physical presence is far from the venue."]
    if city and city in location:
        return 5, ["Local presence is cited in the event city."]
    if state and state in location:
        return 3, ["Presence is cited in the event state."]
    if (event.get("event_format") or "").lower() in {"online", "hybrid"}:
        return 3, ["The event can support a non-local partner."]
    return 2, ["Geographic relevance is not yet confirmed."]


def _scale_rating(candidate: CandidateLead) -> tuple[int, list[str]]:
    text = _text(candidate)
    if _matches_any(text, ["enterprise", "multinational", "publicly listed", "global", "series b", "series c", "unicorn"]):
        return 4, ["Retrieved evidence indicates capacity at an enterprise or scaled-company level."]
    if _matches_any(text, ["startup", "small business", "local business"]):
        return 3, ["Company scale appears compatible with a local or in-kind sponsorship approach."]
    return 2, ["Scale and eligibility are not confirmed; this is not treated as a rejection."]


def _route_rating(candidate: CandidateLead) -> tuple[int, list[str]]:
    contacts = candidate.contacts
    official_email = any(c.kind == "email" and c.source_quality == "official" and c.basic_check_status == "passed" for c in contacts)
    official_phone = any(c.kind == "phone" and c.source_quality == "official" and c.basic_check_status == "passed" for c in contacts)
    official_form = any(c.kind == "contact_form" and c.source_quality == "official" for c in contacts)
    if official_email and (candidate.sponsorship_page_url or official_form):
        return 5, ["Official email and a sponsorship/contact route are available."]
    if official_email or official_phone:
        return 4, ["A checked official contact route is available."]
    if official_form or candidate.sponsorship_page_url:
        return 3, ["An official contact or sponsorship route is available."]
    if contacts:
        return 2, ["A contact was found but its source or basic check needs review."]
    return 0, ["No contact route was retrieved."]


def _identity_confidence(candidate: CandidateLead) -> tuple[int, list[str]]:
    official = [item for item in candidate.evidence if item.get("source_quality") == "official"]
    if candidate.domain and candidate.website_url and official:
        return 5, ["Canonical domain and official source are retained."]
    if candidate.domain and candidate.website_url:
        return 4, ["Canonical domain is available, but official page evidence is limited."]
    if candidate.domain:
        return 3, ["A canonical domain is available."]
    return 1, ["Company identity is based on secondary discovery evidence only."]


def _sponsorship_confidence(candidate: CandidateLead) -> tuple[int, list[str]]:
    items = _evidence_of_type(candidate, "sponsorship_history", "sponsorship_program", "brand_partnership")
    official = [item for item in items if item.get("source_quality") == "official"]
    if len(official) >= 2:
        return 5, _evidence_summary(official)
    if official:
        return 4, _evidence_summary(official)
    if len(items) >= 2:
        return 3, _evidence_summary(items)
    if items:
        return 2, _evidence_summary(items)
    return 0, ["No sponsorship evidence was retained."]


def _contact_provenance_confidence(candidate: CandidateLead) -> tuple[int, list[str]]:
    official = [c for c in candidate.contacts if c.source_quality == "official"]
    if len(official) >= 2:
        return 5, ["Multiple contacts are cited from official pages."]
    if official:
        return 4, ["A contact is cited from an official page."]
    if candidate.contacts:
        return 2, ["Contacts are retained with secondary-source provenance."]
    if candidate.sponsorship_page_url:
        return 2, ["A contact route is retained but no direct contact was found."]
    return 0, ["No contact provenance is available."]


def _checks_confidence(candidate: CandidateLead) -> tuple[int, list[str]]:
    contacts = [c for c in candidate.contacts if c.kind in {"email", "phone"}]
    passed = [c for c in contacts if c.basic_check_status == "passed"]
    needs_review = [c for c in contacts if c.basic_check_status == "needs_review"]
    if contacts and len(passed) == len(contacts):
        return 5, ["All discovered email/phone contacts passed deterministic checks."]
    if passed:
        return 4, ["At least one contact passed deterministic syntax/domain or numbering-plan checks."]
    if needs_review:
        return 2, ["Contact checks were inconclusive and need review."]
    if contacts:
        return 1, ["Discovered contact values did not pass deterministic checks."]
    return 1, ["No direct contact was found; this does not prove the sponsor is unsuitable."]


def _freshness_confidence(candidate: CandidateLead) -> tuple[int, list[str]]:
    urls = {item.get("source_url") for item in candidate.evidence if item.get("source_url")}
    official_urls = {item.get("source_url") for item in candidate.evidence if item.get("source_quality") == "official" and item.get("source_url")}
    if len(urls) >= 3 and official_urls:
        return 5, ["Several current sources corroborate the record, including an official source."]
    if len(urls) >= 2:
        return 4, ["More than one retained source corroborates the record."]
    if urls:
        return 2, ["Only one retained source supports the record."]
    return 0, ["No retrievable sources were retained."]


def _set_legacy_scores(candidate: CandidateLead) -> None:
    match = candidate.match_score_components
    candidate.score_relevance = int(match["event_topic_alignment"]["score"] + match["target_audience_alignment"]["score"])
    candidate.score_industry_fit = int(match["contribution_fit"]["score"])
    candidate.score_sponsorship_history = int(match["sponsorship_program_evidence"]["score"])
    candidate.score_geographic_fit = int(match["geographic_relevance"]["score"])
    candidate.score_budget_compatibility = int(match["scale_and_eligibility_fit"]["score"])
    candidate.score_contactability = int(match["timing_and_contact_route"]["score"])
    candidate.score_total = candidate.match_score


def _explanation(candidate: CandidateLead) -> str:
    strengths = [key.replace("_", " ") for key, detail in candidate.match_score_components.items() if detail["rating"] >= 4]
    gaps = [key.replace("_", " ") for key, detail in candidate.confidence_score_components.items() if detail["rating"] <= 2]
    parts: list[str] = []
    if strengths:
        parts.append(f"Strong on {', '.join(strengths[:3])}.")
    if gaps:
        parts.append(f"Evidence still limited for {', '.join(gaps[:2])}.")
    return " ".join(parts) or "The lead has limited retained evidence and should be reviewed before outreach."


def score_candidate(candidate: CandidateLead, event: dict[str, Any], venue_coords: tuple[float, float] | None = None) -> CandidateLead:
    """Calculate v2 match and confidence scores for one evidence-backed lead."""
    event_topic = _event_topic_rating(candidate, event)
    audience = _audience_rating(candidate, event)
    contribution = _contribution_rating(candidate, event)
    program = _program_rating(candidate)
    geography = _geography_rating(candidate, event, venue_coords)
    scale = _scale_rating(candidate)
    route = _route_rating(candidate)
    candidate.match_score_components = {
        "event_topic_alignment": _factor(event_topic[0], MATCH_WEIGHTS["event_topic_alignment"], event_topic[1]),
        "target_audience_alignment": _factor(audience[0], MATCH_WEIGHTS["target_audience_alignment"], audience[1]),
        "contribution_fit": _factor(contribution[0], MATCH_WEIGHTS["contribution_fit"], contribution[1]),
        "sponsorship_program_evidence": _factor(program[0], MATCH_WEIGHTS["sponsorship_program_evidence"], program[1]),
        "geographic_relevance": _factor(geography[0], MATCH_WEIGHTS["geographic_relevance"], geography[1]),
        "scale_and_eligibility_fit": _factor(scale[0], MATCH_WEIGHTS["scale_and_eligibility_fit"], scale[1]),
        "timing_and_contact_route": _factor(route[0], MATCH_WEIGHTS["timing_and_contact_route"], route[1]),
    }
    candidate.match_score = sum(detail["score"] for detail in candidate.match_score_components.values())

    identity = _identity_confidence(candidate)
    sponsorship = _sponsorship_confidence(candidate)
    contact_provenance = _contact_provenance_confidence(candidate)
    checks = _checks_confidence(candidate)
    freshness = _freshness_confidence(candidate)
    candidate.confidence_score_components = {
        "company_identity_and_official_domain": _factor(identity[0], CONFIDENCE_WEIGHTS["company_identity_and_official_domain"], identity[1]),
        "sponsorship_evidence_reliability": _factor(sponsorship[0], CONFIDENCE_WEIGHTS["sponsorship_evidence_reliability"], sponsorship[1]),
        "contact_provenance_and_authenticity": _factor(contact_provenance[0], CONFIDENCE_WEIGHTS["contact_provenance_and_authenticity"], contact_provenance[1]),
        "deterministic_contact_checks": _factor(checks[0], CONFIDENCE_WEIGHTS["deterministic_contact_checks"], checks[1]),
        "freshness_and_corroboration": _factor(freshness[0], CONFIDENCE_WEIGHTS["freshness_and_corroboration"], freshness[1]),
    }
    candidate.confidence_score = sum(detail["score"] for detail in candidate.confidence_score_components.values())
    candidate.confidence = "high" if candidate.confidence_score >= 75 else "medium" if candidate.confidence_score >= 45 else "low"
    _set_legacy_scores(candidate)
    candidate.ranking_explanation = _explanation(candidate)
    return candidate


def score_and_rank_candidates(candidates: list[CandidateLead], event: dict[str, Any], venue_coords: tuple[float, float] | None = None) -> list[CandidateLead]:
    """Score deterministically and sort fit first, then information confidence."""
    for candidate in candidates:
        score_candidate(candidate, event, venue_coords)
    return sorted(candidates, key=lambda item: (item.match_score, item.confidence_score, item.company_name.lower()), reverse=True)
