"""Web research service using Tavily API (primary) and Brave Search API (fallback).

Fetches genuine web search results to ensure candidates are discovered
from live web data, avoiding hallucination.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

TAVILY_SEARCH_URL = "https://api.tavily.com/search"
BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


@dataclass
class SearchResult:
    title: str
    url: str
    content: str
    score: float = 0.0
    source: str = "tavily"


@dataclass
class WebResearchResult:
    results: list[SearchResult] = field(default_factory=list)
    credits_used: int = 0
    source_used: str = "tavily"


async def search_tavily(
    query: str,
    api_key: str,
    max_results: int = 5,
    search_depth: str = "basic",
) -> WebResearchResult:
    """Execute search query using Tavily API."""
    payload = {
        "query": query,
        "max_results": max_results,
        "search_depth": search_depth,
        "include_answer": False,
        "include_raw_content": False,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(
                TAVILY_SEARCH_URL,
                json=payload,
                headers={"Authorization": f"Bearer {api_key}"},
            )
            response.raise_for_status()
            data = response.json()

            results = [
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    content=item.get("content", ""),
                    score=float(item.get("score", 0.0)),
                    source="tavily",
                )
                for item in data.get("results", [])
                if item.get("url")
            ]
            credits_used = 2 if search_depth == "advanced" else 1
            return WebResearchResult(results=results, credits_used=credits_used, source_used="tavily")

        except httpx.HTTPStatusError as exc:
            logger.warning("Tavily search HTTP %s: %s for query %r", exc.response.status_code, exc, query)
            return WebResearchResult()
        except Exception as exc:
            logger.warning("Tavily search failed: %s for query %r", exc, query)
            return WebResearchResult()


async def search_brave(
    query: str,
    api_key: str,
    max_results: int = 5,
) -> WebResearchResult:
    """Execute search query using Brave Search API."""
    params = {"q": query, "count": min(max_results, 20)}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.get(
                BRAVE_SEARCH_URL,
                params=params,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": api_key,
                },
            )
            response.raise_for_status()
            data = response.json()

            web_results = data.get("web", {}).get("results", [])
            results = [
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    content=item.get("description", ""),
                    score=0.5,
                    source="brave",
                )
                for item in web_results
                if item.get("url")
            ]
            return WebResearchResult(results=results, credits_used=0, source_used="brave")

        except httpx.HTTPStatusError as exc:
            logger.warning("Brave search HTTP %s: %s for query %r", exc.response.status_code, exc, query)
            return WebResearchResult()
        except Exception as exc:
            logger.warning("Brave search failed: %s for query %r", exc, query)
            return WebResearchResult()


async def run_searches(
    queries: list[str],
    tavily_api_key: str | None,
    brave_api_key: str | None,
    max_results_per_query: int = 5,
) -> tuple[list[SearchResult], int]:
    """Run search queries concurrently across configured providers and deduplicate by URL.

    Returns:
        (deduplicated_results, total_tavily_credits_used)
    """
    if not tavily_api_key and not brave_api_key:
        logger.info("No search API keys configured. Web search skipped.")
        return [], 0

    tasks = []
    for q in queries:
        if tavily_api_key:
            tasks.append(search_tavily(q, tavily_api_key, max_results=max_results_per_query))
        elif brave_api_key:
            tasks.append(search_brave(q, brave_api_key, max_results=max_results_per_query))

    batch_results = await asyncio.gather(*tasks, return_exceptions=True)

    all_results: list[SearchResult] = []
    seen_urls: set[str] = set()
    total_credits = 0

    for item in batch_results:
        if isinstance(item, WebResearchResult):
            total_credits += item.credits_used
            for res in item.results:
                clean_url = res.url.split("?")[0].rstrip("/")
                if clean_url not in seen_urls:
                    seen_urls.add(clean_url)
                    all_results.append(res)

    return all_results, total_credits
