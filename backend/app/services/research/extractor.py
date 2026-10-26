"""Structured data extraction from web results using LangChain structured output.

Extracts verifiable company information, source URLs, evidence claims,
and public contact points. Unknown values MUST remain None; the LLM
is strictly instructed never to fabricate company information.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ContactInfo(BaseModel):
    name: str | None = Field(default=None, description="Contact person name if explicitly mentioned in text")
    role: str | None = Field(default=None, description="Contact person's role or designation")
    email: str | None = Field(default=None, description="Public email literally present in this source; otherwise null")
    phone: str | None = Field(default=None, description="Public phone number literally present in this source; otherwise null")
    linkedin_url: str | None = Field(default=None, description="Company or person LinkedIn page URL")
    twitter_url: str | None = Field(default=None, description="Twitter / X profile URL")
    instagram_url: str | None = Field(default=None, description="Instagram profile URL")
    sponsorship_page_url: str | None = Field(default=None, description="Direct URL to sponsorship, partnership, or community page")
    email_source_excerpt: str | None = Field(default=None, description="Exact short text containing the extracted email")
    phone_source_excerpt: str | None = Field(default=None, description="Exact short text containing the extracted phone")
    contact_route_source_excerpt: str | None = Field(default=None, description="Exact short text supporting the contact/sponsorship route")


class ExtractedEvidence(BaseModel):
    claim: str = Field(description="Specific, factual sentence or claim extracted from source")
    evidence_type: str = Field(
        default="sponsorship_history",
        description="One of: sponsorship_history, brand_partnership, local_presence, audience_alignment, contact_page, social_media, news_mention, other",
    )
    source_url: str = Field(description="URL from which this evidence was extracted")
    source_title: str | None = Field(default=None, description="Webpage or document title")
    source_excerpt: str | None = Field(default=None, description="Exact supporting text from the source, at most 600 characters")
    is_llm_inferred: bool = Field(
        default=False,
        description="True only if reasonable inference rather than exact quote",
    )


class ExtractedCompanyRecord(BaseModel):
    company_name: str = Field(description="Real official name of the company or brand")
    official_website: str | None = Field(default=None, description="Official website URL of the company (e.g. https://company.com)")
    industry: str | None = Field(default=None, description="Industry sector (e.g. Technology, Beverage, EdTech, Fintech, Retail)")
    description: str | None = Field(default=None, description="Short 1-2 sentence description of what the company does")
    location: str | None = Field(default=None, description="City / state / country where company operates or has presence")
    contact: ContactInfo = Field(default_factory=ContactInfo)
    evidence: list[ExtractedEvidence] = Field(default_factory=list, description="List of verified sponsorship, partnership, or presence claims")
    confidence: str = Field(default="low", description="Confidence level: low | medium | high")


EXTRACTOR_SYSTEM_PROMPT = """You are an objective corporate research extractor.
Extract structured company information from the provided live web search result.

ABSOLUTE REQUIREMENTS:
1. Extract ONLY facts supported by the text.
2. NEVER invent, extrapolate, or guess emails, phone numbers, contact names, or partnerships.
3. If information is not in the text, leave it as null/empty.
4. For 'official_website', extract the company's real home domain if visible or referenced in the URL/snippet.
5. If the snippet mentions a brand sponsoring, partnering, or offering grants/credits/products to events, record it in 'evidence'.
6. Every evidence item MUST include the exact supporting excerpt from the supplied text. Do not paraphrase it as a quote.
7. An email, phone, or contact route may be returned only when it appears in the supplied text or source URL. Include its exact excerpt.
"""

EXTRACTOR_HUMAN_PROMPT = """Extract company information from this search result:

Source URL: {url}
Source Title: {title}
Content snippet:
{content}

Event context (for assessing relevance only; DO NOT fabricate company links):
- Event: {event_name} ({event_type})
- Location: {venue_city}
- Target Audience: {primary_audience}

Extract the company details strictly following the schema."""


async def extract_company_from_snippet(
    llm: BaseChatModel,
    url: str,
    title: str,
    content: str,
    event_context: dict[str, Any],
) -> ExtractedCompanyRecord | None:
    """Extract structured company record from a web snippet using LangChain structured output."""
    if not content or len(content.strip()) < 30:
        return None

    prompt = ChatPromptTemplate.from_messages([
        ("system", EXTRACTOR_SYSTEM_PROMPT),
        ("human", EXTRACTOR_HUMAN_PROMPT),
    ])

    try:
        structured_llm = llm.with_structured_output(ExtractedCompanyRecord)
        chain = prompt | structured_llm

        record: ExtractedCompanyRecord = await chain.ainvoke({
            "url": url,
            "title": title or "",
            "content": content[:2500],
            "event_name": event_context.get("event_name", "Event"),
            "event_type": event_context.get("event_type", "event"),
            "venue_city": event_context.get("venue_city", "India"),
            "primary_audience": event_context.get("primary_audience", "general"),
        })

        if not record.company_name or len(record.company_name.strip()) < 2:
            return None

        # The model only sees this source, so preserve it as the evidence and
        # contact provenance rather than guessing a separate page.
        for ev in record.evidence:
            if not ev.source_url:
                ev.source_url = url
            if not ev.source_title:
                ev.source_title = title
            if not ev.source_excerpt:
                ev.source_excerpt = content[:600]

        return record

    except Exception as exc:
        logger.warning("LLM structured extraction failed for %s: %s", url, exc)
        return None


async def extract_companies_batch(
    llm: BaseChatModel,
    search_results: list[dict[str, Any]],
    event_context: dict[str, Any],
    max_concurrency: int = 4,
) -> list[ExtractedCompanyRecord]:
    """Process a batch of search results with bounded concurrency."""
    semaphore = asyncio.Semaphore(max_concurrency)

    async def _process(item: dict[str, Any]) -> ExtractedCompanyRecord | None:
        async with semaphore:
            return await extract_company_from_snippet(
                llm=llm,
                url=item.get("url", ""),
                title=item.get("title", ""),
                content=item.get("content", ""),
                event_context=event_context,
            )

    tasks = [_process(item) for item in search_results]
    extracted = await asyncio.gather(*tasks, return_exceptions=True)

    records: list[ExtractedCompanyRecord] = []
    for res in extracted:
        if isinstance(res, ExtractedCompanyRecord) and res.company_name:
            records.append(res)

    return records
