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


class SearchPlan(BaseModel):
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
5. Return JSON with the key "queries".
"""

PLANNER_HUMAN_PROMPT = """Plan sponsorship search queries for this event:
- Event Name: {event_name}
- Event Type: {event_type}
- Theme: {event_theme}
- Location: {venue_city}, {venue_state}
- Expected Footfall: {expected_footfall}
- Primary Audience: {primary_audience}
- Academic Disciplines / Focus: {academic_disciplines}
- Support Needed: {support_types}
- Institution: {institution_name}
- Previous Sponsors Hint: {previous_sponsors_hint}
- Notes: {additional_notes}

Generate targeted search queries to discover live sponsor candidates. Output JSON with "queries": [{{"query": "...", "category": "..."}}]."""


async def generate_search_queries(
    llm: BaseChatModel,
    event_details: dict[str, Any],
    n_queries: int = 8,
) -> list[SearchQuery]:
    """Generate targeted search queries using LLM with fallback support."""
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
            "support_types": ", ".join(event_details.get("support_types_needed") or ["cash", "in-kind"]),
            "institution_name": event_details.get("institution_name") or "college/university",
            "previous_sponsors_hint": event_details.get("previous_sponsors_hint") or "None specified",
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
            return parsed[:n_queries]

    except Exception as exc:
        logger.warning("LLM search query generation failed: %s. Using default search queries.", exc)

    return get_fallback_queries(event_details, n_queries=n_queries)


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
