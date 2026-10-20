"""Hunter.io client for discovering public, verified domain email contacts.

Hunter free tier provides 50 credits/month.
Only called for verified domains to conserve API quota.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

HUNTER_DOMAIN_SEARCH_URL = "https://api.hunter.io/v2/domain-search"


@dataclass
class HunterContact:
    email: str
    first_name: str | None
    last_name: str | None
    position: str | None
    confidence: int  # 0 to 100
    source_url: str | None


async def find_domain_contacts(
    domain: str,
    api_key: str,
    limit: int = 2,
    department: str = "marketing",
) -> tuple[list[HunterContact], int]:
    """Find public corporate contacts for a domain.

    Returns:
        (contacts, credits_consumed)
    """
    if not domain or not api_key:
        return [], 0

    clean_domain = domain.lower().strip()
    if clean_domain.startswith("www."):
        clean_domain = clean_domain[4:]

    params = {
        "domain": clean_domain,
        "api_key": api_key,
        "limit": limit,
        "department": department,
        "type": "generic",  # e.g. sponsor@, partnerships@, marketing@
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(HUNTER_DOMAIN_SEARCH_URL, params=params)
            response.raise_for_status()
            data = response.json()

            emails_data = data.get("data", {}).get("emails", [])
            contacts: list[HunterContact] = []

            for item in emails_data[:limit]:
                contacts.append(
                    HunterContact(
                        email=item.get("value", ""),
                        first_name=item.get("first_name"),
                        last_name=item.get("last_name"),
                        position=item.get("position"),
                        confidence=int(item.get("confidence", 0)),
                        source_url=item.get("sources", [{}])[0].get("uri") if item.get("sources") else None,
                    )
                )

            return contacts, 1

        except httpx.HTTPStatusError as exc:
            logger.warning("Hunter API HTTP %s for domain %s: %s", exc.response.status_code, domain, exc)
            return [], 0
        except Exception as exc:
            logger.warning("Hunter API error for domain %s: %s", domain, exc)
            return [], 0
