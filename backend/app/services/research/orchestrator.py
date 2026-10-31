"""Evidence-first sponsor discovery orchestration.

The pipeline deliberately separates discovery from contact verification:
Gemini plans and extracts only source-backed information, Tavily/Places find
the evidence, Python calculates scores, and Hunter is never called here.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select, update

from app.core.database import get_session_factory
from app.core.settings import Settings
from app.models.enums import EvidenceType, LeadVerificationStatus, ResearchJobStatus
from app.models.research import LeadContact, LeadEvidence, ResearchJob, SponsorLead
from app.services.research.contact_checks import run_free_contact_checks
from app.services.research.cache import hydrate_cached_company_research, store_company_research
from app.services.research.extractor import ExtractedCompanyRecord, extract_companies_batch
from app.services.research.llm_factory import get_llm
from app.services.research.places_researcher import PlaceBusiness, search_nearby_places
from app.services.research.scorer import (
    SCORING_VERSION,
    CandidateContact,
    CandidateLead,
    is_official_source,
    normalize_domain,
    score_and_rank_candidates,
)
from app.services.research.search_planner import EventAnalysis, SearchPlan, generate_search_plan, get_fallback_search_plan
from app.services.research.web_researcher import SearchResult, run_searches

logger = logging.getLogger(__name__)


def update_job_progress(job_id: UUID, percent: int, message: str) -> None:
    session_factory = get_session_factory()
    with session_factory() as session:
        session.execute(
            update(ResearchJob)
            .where(ResearchJob.id == job_id)
            .values(progress_percent=percent, progress_message=message, updated_at=datetime.now(timezone.utc))
        )
        session.commit()


def mark_job_failed(job_id: UUID, error_text: str) -> None:
    session_factory = get_session_factory()
    with session_factory() as session:
        session.execute(
            update(ResearchJob)
            .where(ResearchJob.id == job_id)
            .values(
                status=ResearchJobStatus.FAILED,
                error_message=error_text[:2000],
                progress_percent=0,
                progress_message="Research job failed.",
                updated_at=datetime.now(timezone.utc),
            )
        )
        session.commit()


def _safe_evidence_type(raw_type: str | None) -> EvidenceType:
    try:
        return EvidenceType(raw_type or "other")
    except ValueError:
        return EvidenceType.OTHER


def _normalized_brief(job: ResearchJob) -> dict[str, Any]:
    """Create a JSON-safe, complete snapshot used by every pipeline stage."""
    return {
        "event_name": job.event_name,
        "event_type": job.event_type,
        "event_theme": job.event_theme,
        "event_description": job.event_description,
        "location": {"city": job.venue_city, "state": job.venue_state, "venue": job.venue_name},
        "dates": {
            "start": job.start_date.isoformat() if job.start_date else None,
            "end": job.end_date.isoformat() if job.end_date else None,
            "format": job.event_format,
        },
        "audience": {
            "expected_footfall": job.expected_footfall,
            "primary": job.primary_audience,
            "age_range": job.audience_age_range,
            "disciplines": job.academic_disciplines,
            "institution": job.institution_name,
        },
        "requirements": {
            "budget_target_inr": float(job.budget_target_inr) if job.budget_target_inr is not None else None,
            "support_types": job.support_types_needed or [],
            "resource_needs": _resource_need_context(job),
            "benefits": job.sponsor_benefits,
            "eligibility_constraints": job.eligibility_constraints,
        },
        "history_and_constraints": {
            "custom_constraints": job.additional_notes,
        },
    }


def _resource_need_context(job: ResearchJob) -> list[dict[str, Any]]:
    """Serialize selected event requirements into the immutable search brief."""
    return [
        {
            "title": need.title,
            "category": need.category.value if hasattr(need.category, "value") else str(need.category),
            "description": need.description,
            "details": need.details or {},
            "target_amount": float(need.target_amount) if need.target_amount is not None else None,
            "currency": need.currency,
            "target_quantity": need.target_quantity,
            "deadline": need.deadline.isoformat() if need.deadline else None,
            "priority": need.priority.value if hasattr(need.priority, "value") else str(need.priority),
        }
        for need in job.resource_needs
    ]


def _event_context(job: ResearchJob) -> dict[str, Any]:
    """Flat scoring/search context retained for backwards-compatible helpers."""
    return {
        "event_name": job.event_name,
        "event_type": job.event_type,
        "event_theme": job.event_theme,
        "event_description": job.event_description,
        "venue_city": job.venue_city,
        "venue_state": job.venue_state,
        "venue_name": job.venue_name,
        "event_format": job.event_format,
        "expected_footfall": job.expected_footfall,
        "primary_audience": job.primary_audience,
        "audience_age_range": job.audience_age_range,
        "academic_disciplines": job.academic_disciplines,
        "institution_name": job.institution_name,
        "budget_target_inr": float(job.budget_target_inr) if job.budget_target_inr is not None else None,
        "support_types_needed": job.support_types_needed or [],
        "resource_requirements": _resource_need_context(job),
        "sponsor_benefits": job.sponsor_benefits,
        "eligibility_constraints": job.eligibility_constraints,
        "additional_notes": job.additional_notes,
    }


def _evidence_from_record(record: ExtractedCompanyRecord, candidate_domain: str | None, fallback_url: str, fallback_title: str, fallback_content: str) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    for item in record.evidence:
        source_url = item.source_url or fallback_url
        evidence.append(
            {
                "claim": item.claim,
                "evidence_type": item.evidence_type,
                "source_url": source_url,
                "source_title": item.source_title or fallback_title,
                "source_excerpt": item.source_excerpt or fallback_content[:600],
                "source_quality": "official" if is_official_source(candidate_domain, source_url) else "secondary",
                "is_llm_inferred": bool(item.is_llm_inferred),
            }
        )
    return evidence


def _contacts_from_record(record: ExtractedCompanyRecord, candidate_domain: str | None, fallback_url: str, fallback_title: str, fallback_content: str) -> list[CandidateContact]:
    contact = record.contact
    contacts: list[CandidateContact] = []
    source_quality = "official" if is_official_source(candidate_domain, fallback_url) else "secondary"
    if contact.email:
        contacts.append(
            CandidateContact(
                kind="email",
                value=contact.email,
                source_url=fallback_url,
                source_title=fallback_title,
                source_excerpt=contact.email_source_excerpt or fallback_content[:600],
                source_quality=source_quality,
                role=contact.role,
                name=contact.name,
            )
        )
    if contact.phone:
        contacts.append(
            CandidateContact(
                kind="phone",
                value=contact.phone,
                source_url=fallback_url,
                source_title=fallback_title,
                source_excerpt=contact.phone_source_excerpt or fallback_content[:600],
                source_quality=source_quality,
                role=contact.role,
                name=contact.name,
            )
        )
    if contact.sponsorship_page_url:
        route_domain = normalize_domain(contact.sponsorship_page_url)
        contacts.append(
            CandidateContact(
                kind="contact_form",
                value=contact.sponsorship_page_url,
                source_url=contact.sponsorship_page_url,
                source_title=fallback_title,
                source_excerpt=contact.contact_route_source_excerpt or fallback_content[:600],
                source_quality="official" if candidate_domain and route_domain and is_official_source(candidate_domain, contact.sponsorship_page_url) else "secondary",
            )
        )
    return contacts


def _candidate_from_record(record: ExtractedCompanyRecord, result: SearchResult) -> CandidateLead | None:
    domain = normalize_domain(record.official_website) or normalize_domain(result.url)
    if not record.company_name.strip() or not domain:
        return None
    candidate = CandidateLead(
        company_name=record.company_name.strip(),
        domain=domain,
        website_url=record.official_website or f"https://{domain}",
        industry=record.industry,
        description=record.description,
        location=record.location,
        sponsorship_page_url=record.contact.sponsorship_page_url,
        discovery_source=result.source,
        source_url=result.url,
    )
    candidate.evidence.extend(_evidence_from_record(record, domain, result.url, result.title, result.content))
    candidate.contacts.extend(_contacts_from_record(record, domain, result.url, result.title, result.content))
    return candidate


def _default_research_evidence(candidate: CandidateLead, result: SearchResult) -> dict[str, Any]:
    text = f"{result.title} {result.content}".lower()
    if any(word in text for word in ("sponsor", "sponsorship", "partner", "partnership", "community program")):
        evidence_type = "brand_partnership"
        claim = f"Research result references a potential partnership or sponsorship route: {result.title}"[:2000]
    elif any(word in text for word in ("contact", "reach us", "get in touch")):
        evidence_type = "contact_page"
        claim = f"Research result exposes a potential official contact route: {result.title}"[:2000]
    else:
        evidence_type = "other"
        claim = f"Targeted company research retrieved: {result.title}"[:2000]
    return {
        "claim": claim,
        "evidence_type": evidence_type,
        "source_url": result.url,
        "source_title": result.title,
        "source_excerpt": result.content[:600],
        "source_quality": "official" if is_official_source(candidate.domain, result.url) else "secondary",
        "is_llm_inferred": False,
    }


def _merge_candidate(target: CandidateLead, incoming: CandidateLead) -> None:
    if not target.website_url and incoming.website_url:
        target.website_url = incoming.website_url
    if not target.industry and incoming.industry:
        target.industry = incoming.industry
    if not target.description and incoming.description:
        target.description = incoming.description
    if not target.location and incoming.location:
        target.location = incoming.location
    if not target.sponsorship_page_url and incoming.sponsorship_page_url:
        target.sponsorship_page_url = incoming.sponsorship_page_url
    target.evidence.extend(incoming.evidence)
    target.contacts.extend(incoming.contacts)


def _deduplicate_candidates(candidates: list[CandidateLead]) -> list[CandidateLead]:
    deduped: dict[str, CandidateLead] = {}
    for candidate in candidates:
        key = candidate.domain or candidate.company_name.lower().strip()
        if not key:
            continue
        if key in deduped:
            _merge_candidate(deduped[key], candidate)
        else:
            deduped[key] = candidate
    for candidate in deduped.values():
        seen_evidence: set[tuple[str, str]] = set()
        candidate.evidence = [
            item for item in candidate.evidence
            if item.get("source_url") and item.get("claim") and not ((str(item["source_url"]), str(item["claim"])) in seen_evidence or seen_evidence.add((str(item["source_url"]), str(item["claim"]))))
        ]
    return list(deduped.values())


async def _discover_places(analysis: EventAnalysis, city: str, api_key: str | None) -> tuple[list[PlaceBusiness], int]:
    if not api_key or not city:
        return [], 0
    themes = analysis.local_business_queries[:2] or ["event sponsors", "coworking spaces and local businesses"]
    results = await asyncio.gather(
        *(search_nearby_places(query=theme, city=city, api_key=api_key, max_results=5) for theme in themes),
        return_exceptions=True,
    )
    businesses: list[PlaceBusiness] = []
    calls = 0
    for result in results:
        if isinstance(result, tuple):
            found, count = result
            businesses.extend(found)
            calls += count
    return businesses, calls


def _place_candidate(place: PlaceBusiness, city: str) -> CandidateLead:
    domain = normalize_domain(place.website)
    maps_url = f"https://www.google.com/maps/place/?q=place_id:{place.place_id}"
    candidate = CandidateLead(
        company_name=place.name,
        domain=domain,
        website_url=place.website,
        industry="Local Business",
        description=f"Local business discovered in {city}.",
        location=place.address or city,
        latitude=place.latitude,
        longitude=place.longitude,
        discovery_source="places",
        source_url=maps_url,
        evidence=[{
            "claim": f"Local business presence located at {place.address or city}.",
            "evidence_type": "local_presence",
            "source_url": maps_url,
            "source_title": place.name,
            "source_excerpt": place.address or city,
            "source_quality": "secondary",
            "is_llm_inferred": False,
        }],
    )
    if place.phone:
        candidate.contacts.append(CandidateContact(kind="phone", value=place.phone, source_url=maps_url, source_title=place.name, source_excerpt=place.address, source_quality="secondary"))
    return candidate


async def _targeted_research(
    candidates: list[CandidateLead],
    llm: Any,
    event: dict[str, Any],
    tavily_key: str | None,
    brave_key: str | None,
    max_candidates: int,
) -> tuple[int, list[CandidateLead]]:
    """Research a bounded shortlist, favoring official sites and contact pages."""
    shortlist = candidates[:max_candidates]

    async def research_one(candidate: CandidateLead) -> tuple[CandidateLead, int]:
        query = (
            f"site:{candidate.domain} (sponsorship OR partnership OR community OR \"contact us\")"
            if candidate.domain
            else f'"{candidate.company_name}" official sponsorship partnership contact'
        )
        results, credits = await run_searches([query], tavily_key, brave_key, max_results_per_query=3)
        for result in results:
            candidate.evidence.append(_default_research_evidence(candidate, result))

        # Call 3 is conditional: simple candidates already have a sourced
        # direct route, while ambiguous records get a strict evidence/contact
        # assessment of the targeted pages.
        needs_assessment = bool(llm and results and not any(contact.source_quality == "official" for contact in candidate.contacts))
        if needs_assessment:
            records = await extract_companies_batch(
                llm=llm,
                search_results=[{"url": item.url, "title": item.title, "content": item.content} for item in results],
                event_context=event,
                max_concurrency=2,
            )
            for record in records:
                record_domain = normalize_domain(record.official_website) or candidate.domain
                if record_domain != candidate.domain:
                    continue
                matching = next((item for item in results if normalize_domain(item.url) == candidate.domain), results[0])
                enriched = _candidate_from_record(record, matching)
                if enriched:
                    _merge_candidate(candidate, enriched)
        return candidate, credits

    researched = await asyncio.gather(*(research_one(candidate) for candidate in shortlist), return_exceptions=True)
    credits = 0
    for item in researched:
        if isinstance(item, tuple):
            credits += item[1]
    return credits, candidates


async def run_research_job(job_id: UUID, settings: Settings) -> None:
    """Run the full source-backed workflow in the background."""
    session_factory = get_session_factory()
    with session_factory() as session:
        job = session.scalar(select(ResearchJob).where(ResearchJob.id == job_id))
        if not job:
            logger.error("Research job %s not found", job_id)
            return
        event = _event_context(job)
        normalized_brief = _normalized_brief(job)
        owner_id = job.owner_id
        job.status = ResearchJobStatus.RUNNING
        job.progress_percent = 5
        job.progress_message = "Normalizing event requirements and planning research…"
        job.normalized_event_brief = normalized_brief
        job.scoring_version = SCORING_VERSION
        session.commit()

    try:
        llm = None
        if settings.configured_llm:
            secret = settings.gemini_api_key or settings.openai_api_key or settings.anthropic_api_key
            try:
                llm = get_llm(settings.llm_provider, settings.effective_llm_model(), secret.get_secret_value() if secret else "")
            except Exception as exc:
                logger.warning("Unable to initialize configured LLM: %s", exc)

        update_job_progress(job_id, 12, "Analyzing the event and planning targeted searches…")
        if llm:
            plan = await generate_search_plan(llm, event, settings.research_max_searches)
        else:
            plan = get_fallback_search_plan(event, settings.research_max_searches)
        if not plan.queries:
            plan = get_fallback_search_plan(event, settings.research_max_searches)
        with session_factory() as session:
            session.execute(update(ResearchJob).where(ResearchJob.id == job_id).values(search_plan=plan.model_dump(mode="json")))
            session.commit()

        update_job_progress(job_id, 28, "Discovering source-backed sponsor candidates…")
        tavily_key = settings.tavily_api_key.get_secret_value() if settings.tavily_api_key else None
        brave_key = settings.brave_search_api_key.get_secret_value() if settings.brave_search_api_key else None
        places_key = settings.google_places_api_key.get_secret_value() if settings.google_places_api_key else None
        web_task = run_searches([query.query for query in plan.queries], tavily_key, brave_key, max_results_per_query=4)
        places_task = _discover_places(plan.analysis, event["venue_city"], places_key) if event.get("event_format") != "online" else asyncio.sleep(0, result=([], 0))
        (web_results, discovery_credits), (places, places_calls) = await asyncio.gather(web_task, places_task)
        with session_factory() as session:
            session.execute(update(ResearchJob).where(ResearchJob.id == job_id).values(tavily_credits_used=discovery_credits, places_api_calls=places_calls))
            session.commit()

        update_job_progress(job_id, 48, "Extracting companies supported by retrieved evidence…")
        candidates = [_place_candidate(place, event["venue_city"]) for place in places]
        if llm and web_results:
            records = await extract_companies_batch(
                llm=llm,
                search_results=[{"url": item.url, "title": item.title, "content": item.content} for item in web_results[:settings.research_max_candidates]],
                event_context=event,
                max_concurrency=4,
            )
            for record in records:
                source_url = record.evidence[0].source_url if record.evidence else record.official_website
                source = next(
                    (item for item in web_results if item.url == source_url),
                    SearchResult(
                        title=record.evidence[0].source_title if record.evidence else record.company_name,
                        url=source_url or record.official_website or "",
                        content=record.evidence[0].source_excerpt if record.evidence and record.evidence[0].source_excerpt else "",
                    ),
                )
                candidate = _candidate_from_record(record, source)
                if candidate:
                    candidates.append(candidate)

        candidates = _deduplicate_candidates(candidates)[:settings.research_max_candidates]
        cached_domains = hydrate_cached_company_research(owner_id, candidates)
        research_targets = [candidate for candidate in candidates if not candidate.domain or candidate.domain not in cached_domains]
        update_job_progress(
            job_id,
            67,
            f"Researching official sites for {min(len(research_targets), settings.research_max_targeted_searches)} companies; reusing {len(cached_domains)} recent cited records…",
        )
        targeted_credits, _ = await _targeted_research(
            research_targets,
            llm,
            event,
            tavily_key,
            brave_key,
            settings.research_max_targeted_searches,
        )
        with session_factory() as session:
            session.execute(update(ResearchJob).where(ResearchJob.id == job_id).values(tavily_credits_used=discovery_credits + targeted_credits))
            session.commit()

        update_job_progress(job_id, 82, "Running free email and phone checks; no paid verification is being used…")
        for candidate in candidates:
            run_free_contact_checks(candidate, settings.research_phone_default_region)
        candidates = _deduplicate_candidates(candidates)
        # Save only fresh targeted research. Cached records retain their prior
        # retrieval timestamp rather than pretending they were just fetched.
        store_company_research(owner_id, research_targets)

        update_job_progress(job_id, 90, "Calculating explainable match and confidence scores…")
        ranked = score_and_rank_candidates(candidates, event)[:settings.research_max_verified]

        update_job_progress(job_id, 96, "Saving cited evidence, contacts, and ranked results…")
        with session_factory() as session:
            for candidate in ranked:
                lead = SponsorLead(
                    job_id=job_id,
                    company_name=candidate.company_name[:200],
                    domain=candidate.domain[:255] if candidate.domain else None,
                    website_url=candidate.website_url,
                    industry=candidate.industry[:120] if candidate.industry else None,
                    description=candidate.description,
                    location=candidate.location[:200] if candidate.location else None,
                    latitude=candidate.latitude,
                    longitude=candidate.longitude,
                    distance_km=candidate.distance_km,
                    contact_email=candidate.contact_email[:320] if candidate.contact_email else None,
                    contact_phone=candidate.contact_phone[:32] if candidate.contact_phone else None,
                    contact_name=candidate.contact_name[:200] if candidate.contact_name else None,
                    contact_role=candidate.contact_role[:200] if candidate.contact_role else None,
                    linkedin_url=candidate.linkedin_url,
                    twitter_url=candidate.twitter_url,
                    instagram_url=candidate.instagram_url,
                    sponsorship_page_url=candidate.sponsorship_page_url,
                    discovery_source=candidate.discovery_source[:80],
                    source_url=candidate.source_url,
                    score_total=candidate.score_total,
                    score_relevance=candidate.score_relevance,
                    score_industry_fit=candidate.score_industry_fit,
                    score_sponsorship_history=candidate.score_sponsorship_history,
                    score_geographic_fit=candidate.score_geographic_fit,
                    score_budget_compatibility=candidate.score_budget_compatibility,
                    score_contactability=candidate.score_contactability,
                    match_score=candidate.match_score,
                    confidence_score=candidate.confidence_score,
                    match_score_components=candidate.match_score_components,
                    confidence_score_components=candidate.confidence_score_components,
                    scoring_version=SCORING_VERSION,
                    ranking_explanation=candidate.ranking_explanation,
                    confidence=candidate.confidence,
                    verification_status=LeadVerificationStatus.RAW,
                    website_reachable=None,
                    verified_at=None,
                )
                session.add(lead)
                session.flush()
                for evidence in candidate.evidence:
                    if not evidence.get("source_url") or not evidence.get("claim"):
                        continue
                    session.add(LeadEvidence(
                        lead_id=lead.id,
                        evidence_type=_safe_evidence_type(evidence.get("evidence_type")),
                        claim=str(evidence["claim"])[:2000],
                        source_url=str(evidence["source_url"])[:2000],
                        source_title=str(evidence.get("source_title", ""))[:500] or None,
                        source_excerpt=str(evidence.get("source_excerpt", ""))[:4000] or None,
                        source_quality="official" if evidence.get("source_quality") == "official" else "secondary",
                        retrieved_at=datetime.now(timezone.utc),
                        verified_date=date.today(),
                        is_llm_inferred=bool(evidence.get("is_llm_inferred", False)),
                    ))
                for index, contact in enumerate(candidate.contacts):
                    session.add(LeadContact(
                        lead_id=lead.id,
                        kind=contact.kind,
                        value=contact.value,
                        normalized_value=contact.normalized_value,
                        contact_name=contact.name,
                        contact_role=contact.role,
                        source_url=contact.source_url,
                        source_title=contact.source_title,
                        source_excerpt=contact.source_excerpt,
                        source_quality=contact.source_quality,
                        basic_check_status=contact.basic_check_status,
                        basic_check_results=contact.basic_check_results,
                        display_status=contact.display_status,
                        is_primary=index == 0,
                        retrieved_at=datetime.now(timezone.utc),
                    ))
            session.execute(
                update(ResearchJob)
                .where(ResearchJob.id == job_id)
                .values(
                    status=ResearchJobStatus.COMPLETED,
                    progress_percent=100,
                    progress_message=f"Discovered and ranked {len(ranked)} evidence-backed sponsor candidates. Hunter verification is available only for selected emails.",
                    updated_at=datetime.now(timezone.utc),
                )
            )
            session.commit()
        logger.info("Completed evidence-first research job %s with %d leads", job_id, len(ranked))
    except Exception as exc:
        logger.exception("Research job %s failed", job_id)
        mark_job_failed(job_id, str(exc))
