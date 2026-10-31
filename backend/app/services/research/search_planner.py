"""LangChain search query planner.

Constructs targeted queries across 5 research categories:
  1. Previous sponsorships (companies that sponsored similar events in the same region)
  2. Brand partnerships (brands active in student/youth event partnerships)
  3. Local businesses (cafes, venues, retailers near the location)
  4. Audience-aligned brands (brands matching target audience demographics)
  5. Official contact discovery (sponsorship page, brand partnership contact)

The LLM helps plan search queries; it NEVER hallucinates company details here.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class SearchQuery(BaseModel):
    query: str = Field(description="Search engine query string")
    category: str = Field(
        description="Category: previous_sponsorships | brand_partnerships | local_businesses | audience_aligned | contact_discovery"
    )


class EventAnalysis(BaseModel):
    """Call-one output: a normalized, reviewable search brief."""

    sponsor_categories: list[str] = Field(default_factory=list)
    contribution_types: list[str] = Field(default_factory=list)
    eligibility_constraints: list[str] = Field(default_factory=list)
    local_business_queries: list[str] = Field(default_factory=list)


class SearchPlan(BaseModel):
    analysis: EventAnalysis = Field(default_factory=EventAnalysis)
    queries: list[SearchQuery] = Field(default_factory=list)


PLANNER_SYSTEM_PROMPT = """You are an expert event sponsorship strategist.
Your task is to generate realistic, targeted search queries to discover potential real-world sponsors for an event.

CRITICAL RULES:
1. Generate specific, effective search queries for real search engines (Google, Tavily).
2. Cover the 5 essential categories:
   - previous_sponsorships: Companies/brands that sponsored similar events in the location/region
   - brand_partnerships: Brands actively partnering with college, youth, tech, or cultural events in India
   - local_businesses: Relevant local cafes, retailers, hubs near the venue location
   - audience_aligned: Brands targeting the specific demographic, interests, or majors of the attendees
   - contact_discovery: Queries to locate official sponsor/partnership pages and contact details
3. Do NOT hallucinate fabricated company names or pretend companies exist.
4. Always generate between 6 and 10 queries total.
5. Return JSON with "analysis" and "queries". The analysis must identify sponsor categories, contribution types, eligibility constraints, and (only when location matters) local-business query themes.
"""

PLANNER_HUMAN_PROMPT = """Plan sponsorship search queries for this event:
- Event Name: {event_name}
- Event Type: {event_type}
- Theme: {event_theme}
- Location: {venue_city}, {venue_state}
- Expected Footfall: {expected_footfall}
- Primary Audience: {primary_audience}
- Academic Disciplines / Focus: {academic_disciplines}
- Selected resource requirements: {resource_requirements}
- Institution: {institution_name}
- Eligibility / partner constraints: {eligibility_constraints}
- Benefits offered to sponsors: {sponsor_benefits}
- Notes: {additional_notes}

Generate targeted search queries to discover live sponsor candidates. Output JSON with "analysis" and "queries": [{{"query": "...", "category": "..."}}]."""


def _fallback_analysis(event_details: dict[str, Any]) -> EventAnalysis:
    support = event_details.get("support_types_needed") or ["cash", "in-kind"]
    event_type = event_details.get("event_type") or "event"
    audience = event_details.get("primary_audience") or "attendees"
    return EventAnalysis(
        sponsor_categories=[f"brands relevant to {event_type}", "companies with community or partnership programs"],
        contribution_types=[str(value) for value in support],
        eligibility_constraints=[f"audience: {audience}"],
        local_business_queries=["relevant local businesses", "coworking spaces and community venues"],
    )


def get_fallback_search_plan(event_details: dict[str, Any], n_queries: int = 8) -> SearchPlan:
    """Deterministic equivalent of Call 1 when the LLM is unavailable."""
    return SearchPlan(
        analysis=_fallback_analysis(event_details),
        queries=get_fallback_queries(event_details, n_queries=n_queries),
    )


async def generate_search_plan(
    llm: BaseChatModel,
    event_details: dict[str, Any],
    n_queries: int = 8,
) -> SearchPlan:
    """Generate the persisted Call-1 event analysis and targeted queries."""
    prompt = ChatPromptTemplate.from_messages([
        ("system", PLANNER_SYSTEM_PROMPT),
        ("human", PLANNER_HUMAN_PROMPT),
    ])

    try:
        chain = prompt | llm | JsonOutputParser()
        result = await chain.ainvoke({
            "event_name": event_details.get("event_name", "Event"),
            "event_type": event_details.get("event_type", "event"),
            "event_theme": event_details.get("event_theme") or "General",
            "venue_city": event_details.get("venue_city", "India"),
            "venue_state": event_details.get("venue_state") or "",
            "expected_footfall": event_details.get("expected_footfall") or "Hundreds",
            "primary_audience": event_details.get("primary_audience") or "college students and youth",
            "academic_disciplines": event_details.get("academic_disciplines") or "all majors",
            "resource_requirements": "; ".join(
                f"{need.get('title', need.get('category', 'Requirement'))}: {need.get('description') or need.get('category', '')}"
                for need in event_details.get("resource_requirements", [])
            ) or ", ".join(event_details.get("support_types_needed") or ["cash", "in-kind"]),
            "institution_name": event_details.get("institution_name") or "college/university",
            "eligibility_constraints": event_details.get("eligibility_constraints") or "None specified",
            "sponsor_benefits": event_details.get("sponsor_benefits") or "Not specified",
            "additional_notes": event_details.get("additional_notes") or "",
        })

        raw_queries = result.get("queries", [])
        parsed: list[SearchQuery] = []
        for item in raw_queries:
            if isinstance(item, dict) and item.get("query"):
                parsed.append(
                    SearchQuery(
                        query=item["query"].strip(),
                        category=item.get("category", "brand_partnerships"),
                    )
                )

        if parsed:
            raw_analysis = result.get("analysis", {}) if isinstance(result, dict) else {}
            return SearchPlan(
                analysis=EventAnalysis(
                    sponsor_categories=[str(item)[:160] for item in raw_analysis.get("sponsor_categories", [])[:8]],
                    contribution_types=[str(item)[:120] for item in raw_analysis.get("contribution_types", [])[:8]],
                    eligibility_constraints=[str(item)[:240] for item in raw_analysis.get("eligibility_constraints", [])[:8]],
                    local_business_queries=[str(item)[:160] for item in raw_analysis.get("local_business_queries", [])[:3]],
                ),
                queries=parsed[:n_queries],
            )

    except Exception as exc:
        logger.warning("LLM search query generation failed: %s. Using default search queries.", exc)

    return get_fallback_search_plan(event_details, n_queries=n_queries)


async def generate_search_queries(
    llm: BaseChatModel,
    event_details: dict[str, Any],
    n_queries: int = 8,
) -> list[SearchQuery]:
    """Compatibility wrapper for callers that only need the query list."""
    return (await generate_search_plan(llm, event_details, n_queries)).queries


def get_fallback_queries(event_details: dict[str, Any], n_queries: int = 8) -> list[SearchQuery]:
    """Deterministic high-quality fallback queries when LLM is unavailable or times out."""
    city = event_details.get("venue_city") or "India"
    event_type = event_details.get("event_type") or "hackathon"
    audience = event_details.get("primary_audience") or "students"
    inst = event_details.get("institution_name") or ""

    queries = [
        SearchQuery(
            query=f"brands that sponsored {event_type} {city} India",
            category="previous_sponsorships",
        ),
        SearchQuery(
            query=f"companies sponsoring college {event_type} in {city}",
            category="previous_sponsorships",
        ),
        SearchQuery(
            query=f"technology brands student event sponsorship community partnerships India",
            category="brand_partnerships",
        ),
        SearchQuery(
            query=f"companies accepting campus event sponsorship proposals India",
            category="brand_partnerships",
        ),
        SearchQuery(
            query=f"cafes restaurants student hangout places near {city} partnerships",
            category="local_businesses",
        ),
        SearchQuery(
            query=f"brands targeting {audience} collegiate marketing India",
            category="audience_aligned",
        ),
        SearchQuery(
            query=f"startup student event sponsorship grants cloud credits India",
            category="audience_aligned",
        ),
        SearchQuery(
            query=f"company sponsorship page partnership email student events India",
            category="contact_discovery",
        ),
    ]
    return queries[:n_queries]
