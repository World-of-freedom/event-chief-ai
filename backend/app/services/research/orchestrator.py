"""Sponsor discovery research orchestrator.

Coordinates:
  1. Search query generation (LangChain + Gemini / OpenAI / Anthropic)
  2. Live web data collection (Tavily search / Brave search)
  3. Nearby local business discovery (Google Places API)
  4. Structured extraction & evidence linking (LangChain Pydantic output)
  5. Deduplication by company name and domain
  6. Email contact discovery (Hunter API)
  7. Evidence-based scoring and ranking (Scorer)
  8. Database persistence (ResearchJob, SponsorLead, LeadEvidence)
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select, update

from app.core.database import get_session_factory
from app.core.settings import Settings
from app.models.enums import EvidenceType, LeadVerificationStatus, ResearchJobStatus
from app.models.research import LeadEvidence, ResearchJob, SponsorLead
from app.services.research.extractor import (
    ExtractedCompanyRecord,
    extract_companies_batch,
)
from app.services.research.hunter import find_domain_contacts
from app.services.research.llm_factory import get_llm
from app.services.research.places_researcher import PlaceBusiness, search_nearby_places
from app.services.research.scorer import (
    CandidateLead,
    normalize_domain,
    score_and_rank_candidates,
)
from app.services.research.search_planner import (
    SearchQuery,
    generate_search_queries,
    get_fallback_queries,
)
from app.services.research.web_researcher import SearchResult, run_searches

logger = logging.getLogger(__name__)


def update_job_progress(job_id: UUID, percent: int, message: str) -> None:
    """Synchronously update progress in database."""
    session_factory = get_session_factory()
    with session_factory() as session:
        session.execute(
            update(ResearchJob)
            .where(ResearchJob.id == job_id)
            .values(
                progress_percent=percent,
                progress_message=message,
                updated_at=datetime.now(timezone.utc),
            )
        )
        session.commit()


def mark_job_failed(job_id: UUID, error_text: str) -> None:
    """Record failure on the research job."""
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
    except Exception:
        return EvidenceType.OTHER


async def run_research_job(job_id: UUID, settings: Settings) -> None:
    """Execute the full research pipeline in the background."""
    logger.info("Starting research job %s", job_id)

    session_factory = get_session_factory()
    with session_factory() as session:
        job = session.execute(select(ResearchJob).where(ResearchJob.id == job_id)).scalar_one_or_none()
        if not job:
            logger.error("Job %s not found in database", job_id)
            return

        # Snapshot parameters
        event_dict: dict[str, Any] = {
            "event_name": job.event_name,
            "event_type": job.event_type,
            "event_theme": job.event_theme,
            "event_description": job.event_description,
            "venue_city": job.venue_city,
            "venue_state": job.venue_state,
            "venue_name": job.venue_name,
            "expected_footfall": job.expected_footfall,
            "primary_audience": job.primary_audience,
            "academic_disciplines": job.academic_disciplines,
            "institution_name": job.institution_name,
            "budget_target_inr": float(job.budget_target_inr) if job.budget_target_inr else None,
            "support_types_needed": job.support_types_needed or [],
            "previous_sponsors_hint": job.previous_sponsors_hint,
            "additional_notes": job.additional_notes,
        }

        # Update status to running
        job.status = ResearchJobStatus.RUNNING
        job.progress_percent = 5
        job.progress_message = "Initiating research planner…"
        session.commit()

    try:
        # ── 1. Plan Targeted Search Queries ──────────────────────────────────
        update_job_progress(job_id, 10, "Generating targeted search queries with LLM…")

        llm = None
        if settings.configured_llm:
            api_key_secret = (
                settings.gemini_api_key
                or settings.openai_api_key
                or settings.anthropic_api_key
            )
            api_key = api_key_secret.get_secret_value() if api_key_secret else ""
            try:
                llm = get_llm(
                    settings.llm_provider,
                    settings.effective_llm_model(),
                    api_key,
                )
            except Exception as exc:
                logger.warning("Failed to initialize LLM (%s): %s", settings.llm_provider, exc)

        queries: list[SearchQuery] = []
        if llm:
            queries = await generate_search_queries(
                llm,
                event_dict,
                n_queries=settings.research_max_searches,
            )
        else:
            queries = get_fallback_queries(event_dict, n_queries=settings.research_max_searches)

        query_strings = [q.query for q in queries]
        logger.info("Planned %d search queries for job %s", len(query_strings), job_id)

        # ── 2. Live Web Search Collection ────────────────────────────────────
        update_job_progress(job_id, 25, f"Searching live web across {len(query_strings)} queries…")

        tavily_key = settings.tavily_api_key.get_secret_value() if settings.tavily_api_key else None
        brave_key = settings.brave_search_api_key.get_secret_value() if settings.brave_search_api_key else None

        web_results, tavily_credits = await run_searches(
            queries=query_strings,
            tavily_api_key=tavily_key,
            brave_api_key=brave_key,
            max_results_per_query=4,
        )

        with session_factory() as session:
            session.execute(
                update(ResearchJob)
                .where(ResearchJob.id == job_id)
                .values(tavily_credits_used=tavily_credits)
            )
            session.commit()

        # ── 3. Google Places Local Search ────────────────────────────────────
        update_job_progress(job_id, 45, "Discovering nearby businesses and venues…")
        place_businesses: list[PlaceBusiness] = []
        places_calls = 0

        if settings.configured_places:
            places_key = settings.google_places_api_key.get_secret_value()
            city = event_dict.get("venue_city") or "India"
            places_queries = [
                f"event sponsors {event_dict['event_type']}",
                "coworking space technology hub",
            ]
            for pq in places_queries:
                b_list, calls = await search_nearby_places(
                    query=pq,
                    city=city,
                    api_key=places_key,
                    max_results=5,
                )
                place_businesses.extend(b_list)
                places_calls += calls

            with session_factory() as session:
                session.execute(
                    update(ResearchJob)
                    .where(ResearchJob.id == job_id)
                    .values(places_api_calls=places_calls)
                )
                session.commit()

        # ── 4. Structured Extraction with LangChain ──────────────────────────
        update_job_progress(job_id, 60, "Extracting verified company facts & evidence…")

        raw_candidates: list[CandidateLead] = []

        # Convert Google Places results into CandidateLead objects
        for pb in place_businesses:
            domain = normalize_domain(pb.website)
            raw_candidates.append(
                CandidateLead(
                    company_name=pb.name,
                    domain=domain,
                    website_url=pb.website,
                    industry="Local Business",
                    description=f"Nearby location in {city}: {pb.address or ''}".strip(),
                    location=pb.address or city,
                    latitude=pb.latitude,
                    longitude=pb.longitude,
                    contact_phone=pb.phone,
                    discovery_source="places",
                    evidence=[{
                        "claim": f"Local business presence located at {pb.address or city}",
                        "evidence_type": "local_presence",
                        "source_url": pb.website or "https://maps.google.com",
                        "source_title": pb.name,
                        "is_llm_inferred": False,
                    }],
                )
            )

        # Extract structured records from web results
        if llm and web_results:
            batch_inputs = [
                {"url": r.url, "title": r.title, "content": r.content}
                for r in web_results[: settings.research_max_candidates]
            ]
            extracted_records = await extract_companies_batch(
                llm=llm,
                search_results=batch_inputs,
                event_context=event_dict,
                max_concurrency=4,
            )

            for rec in extracted_records:
                domain = normalize_domain(rec.official_website) or normalize_domain(rec.contact.sponsorship_page_url)
                cand = CandidateLead(
                    company_name=rec.company_name,
                    domain=domain,
                    website_url=rec.official_website,
                    industry=rec.industry,
                    description=rec.description,
                    location=rec.location or event_dict.get("venue_city"),
                    contact_email=rec.contact.email,
                    contact_phone=rec.contact.phone,
                    contact_name=rec.contact.name,
                    contact_role=rec.contact.role,
                    linkedin_url=rec.contact.linkedin_url,
                    twitter_url=rec.contact.twitter_url,
                    instagram_url=rec.contact.instagram_url,
                    sponsorship_page_url=rec.contact.sponsorship_page_url,
                    discovery_source="web",
                    evidence=[
                        {
                            "claim": ev.claim,
                            "evidence_type": ev.evidence_type,
                            "source_url": ev.source_url,
                            "source_title": ev.source_title,
                            "is_llm_inferred": ev.is_llm_inferred,
                        }
                        for ev in rec.evidence
                    ],
                )
                raw_candidates.append(cand)

        elif web_results:
            # Fallback when LLM is unavailable: create clean leads from snippet titles and domains
            for r in web_results[: settings.research_max_candidates]:
                domain = normalize_domain(r.url)
                if not domain:
                    continue
                # Use title as clean name candidate
                name_guess = r.title.split("-")[0].split("|")[0].split(":")[0].strip()
                if len(name_guess) > 2:
                    raw_candidates.append(
                        CandidateLead(
                            company_name=name_guess,
                            domain=domain,
                            website_url=f"https://{domain}",
                            industry=None,
                            description=r.content[:300] if r.content else None,
                            location=event_dict.get("venue_city"),
                            discovery_source="web",
                            source_url=r.url,
                            evidence=[{
                                "claim": f"Discovered via search result for {r.title}",
                                "evidence_type": "brand_partnership",
                                "source_url": r.url,
                                "source_title": r.title,
                                "is_llm_inferred": False,
                            }],
                        )
                    )

        # ── 5. Deduplicate Candidates by Domain and Name ─────────────────────
        update_job_progress(job_id, 75, "Deduplicating candidates and verifying domains…")

        deduped: dict[str, CandidateLead] = {}
        for cand in raw_candidates:
            key = cand.domain or cand.company_name.lower().strip()
            if not key:
                continue

            if key in deduped:
                # Merge evidence and enrich missing contact info
                existing = deduped[key]
                if not existing.contact_email and cand.contact_email:
                    existing.contact_email = cand.contact_email
                if not existing.sponsorship_page_url and cand.sponsorship_page_url:
                    existing.sponsorship_page_url = cand.sponsorship_page_url
                if not existing.description and cand.description:
                    existing.description = cand.description
                if cand.evidence:
                    existing.evidence.extend(cand.evidence)
            else:
                deduped[key] = cand

        candidate_list = list(deduped.values())[: settings.research_max_candidates]
        logger.info("Deduplicated to %d candidate leads", len(candidate_list))

        # ── 6. Hunter Email Discovery (for top candidates without emails) ─────
        if settings.configured_hunter and candidate_list:
            update_job_progress(job_id, 82, "Looking up verified contact emails via Hunter…")
            hunter_key = settings.hunter_api_key.get_secret_value()
            hunter_credits = 0

            for cand in candidate_list[: settings.research_max_verified]:
                if cand.domain and not cand.contact_email:
                    contacts, credits_spent = await find_domain_contacts(
                        cand.domain,
                        hunter_key,
                        limit=2,
                        department="marketing",
                    )
                    hunter_credits += credits_spent
                    if contacts:
                        best = contacts[0]
                        cand.contact_email = best.email
                        if not cand.contact_name and (best.first_name or best.last_name):
                            cand.contact_name = f"{best.first_name or ''} {best.last_name or ''}".strip()
                        if not cand.contact_role and best.position:
                            cand.contact_role = best.position

            with session_factory() as session:
                session.execute(
                    update(ResearchJob)
                    .where(ResearchJob.id == job_id)
                    .values(hunter_credits_used=hunter_credits)
                )
                session.commit()

        # ── 7. Evidence-Based Scoring & Ranking ──────────────────────────────
        update_job_progress(job_id, 90, "Scoring and ranking leads according to spec…")
        ranked_leads = score_and_rank_candidates(candidate_list, event_dict)
        final_leads = ranked_leads[: settings.research_max_verified]

        # ── 8. Persist Leads and Evidence into Database ──────────────────────
        update_job_progress(job_id, 95, "Storing ranked sponsor leads…")

        with session_factory() as session:
            for cand in final_leads:
                lead_entity = SponsorLead(
                    job_id=job_id,
                    company_name=cand.company_name[:200],
                    domain=cand.domain[:255] if cand.domain else None,
                    website_url=cand.website_url,
                    industry=cand.industry[:120] if cand.industry else None,
                    description=cand.description,
                    location=cand.location[:200] if cand.location else None,
                    latitude=cand.latitude,
                    longitude=cand.longitude,
                    distance_km=cand.distance_km,
                    contact_email=cand.contact_email[:320] if cand.contact_email else None,
                    contact_phone=cand.contact_phone[:32] if cand.contact_phone else None,
                    contact_name=cand.contact_name[:200] if cand.contact_name else None,
                    contact_role=cand.contact_role[:200] if cand.contact_role else None,
                    linkedin_url=cand.linkedin_url,
                    twitter_url=cand.twitter_url,
                    instagram_url=cand.instagram_url,
                    sponsorship_page_url=cand.sponsorship_page_url,
                    discovery_source=cand.discovery_source[:80],
                    source_url=cand.source_url,
                    score_total=cand.score_total,
                    score_relevance=cand.score_relevance,
                    score_industry_fit=cand.score_industry_fit,
                    score_sponsorship_history=cand.score_sponsorship_history,
                    score_geographic_fit=cand.score_geographic_fit,
                    score_budget_compatibility=cand.score_budget_compatibility,
                    score_contactability=cand.score_contactability,
                    ranking_explanation=cand.ranking_explanation,
                    confidence=cand.confidence,
                    verification_status=LeadVerificationStatus.VERIFIED if cand.confidence == "high" else LeadVerificationStatus.RAW,
                    website_reachable=True if cand.website_url else None,
                    verified_at=datetime.now(timezone.utc) if cand.confidence == "high" else None,
                )
                session.add(lead_entity)
                session.flush()

                # Add evidence records
                today = date.today()
                for ev in cand.evidence:
                    evidence_entity = LeadEvidence(
                        lead_id=lead_entity.id,
                        evidence_type=_safe_evidence_type(ev.get("evidence_type")),
                        claim=str(ev.get("claim", ""))[:2000],
                        source_url=str(ev.get("source_url", cand.website_url or ""))[:2000],
                        source_title=str(ev.get("source_title", ""))[:500] if ev.get("source_title") else None,
                        verified_date=today,
                        is_llm_inferred=bool(ev.get("is_llm_inferred", False)),
                    )
                    session.add(evidence_entity)

            # Mark job complete
            session.execute(
                update(ResearchJob)
                .where(ResearchJob.id == job_id)
                .values(
                    status=ResearchJobStatus.COMPLETED,
                    progress_percent=100,
                    progress_message=f"Discovered and ranked {len(final_leads)} verified sponsor leads.",
                    updated_at=datetime.now(timezone.utc),
                )
            )
            session.commit()

        logger.info("Successfully completed research job %s with %d leads", job_id, len(final_leads))

    except Exception as exc:
        logger.exception("Error during research job %s: %s", job_id, exc)
        mark_job_failed(job_id, str(exc))
