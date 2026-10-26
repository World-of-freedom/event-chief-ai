"""Hunter.io client used only for organizer-selected email verification.

Discovery never calls Hunter: public contacts must first be found and cited from
the web. This keeps paid credits under the organizer's control.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

HUNTER_DOMAIN_SEARCH_URL = "https://api.hunter.io/v2/domain-search"
HUNTER_EMAIL_VERIFIER_URL = "https://api.hunter.io/v2/email-verifier"


@dataclass
class HunterContact:
    email: str
    first_name: str | None
    last_name: str | None
    position: str | None
    confidence: int  # 0 to 100
    source_url: str | None


@dataclass
class HunterVerification:
    email: str
    status: str
    result: dict
    credits_used: int


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


async def verify_email(email: str, api_key: str) -> HunterVerification | None:
    """Verify one organizer-selected email with Hunter's Email Verifier.

    The returned status is preserved verbatim (``valid``, ``unknown``, etc.) so
    the UI does not turn an inconclusive provider response into a false claim.
    """
    if not email or not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                HUNTER_EMAIL_VERIFIER_URL,
                params={"email": email, "api_key": api_key},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning("Hunter verifier HTTP %s for %s", exc.response.status_code, email)
        return None
    except Exception as exc:
        logger.warning("Hunter verifier error for %s: %s", email, exc)
        return None

    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    status = str(data.get("status") or "unknown").lower()
    # Store a narrow safe subset rather than the provider's full payload.
    safe_result = {
        "status": status,
        "score": data.get("score"),
        "regexp": data.get("regexp"),
        "gibberish": data.get("gibberish"),
        "disposable": data.get("disposable"),
        "webmail": data.get("webmail"),
        "mx_records": data.get("mx_records"),
        "smtp_server": data.get("smtp_server"),
        "smtp_check": data.get("smtp_check"),
        "accept_all": data.get("accept_all"),
    }
    return HunterVerification(email=email, status=status, result=safe_result, credits_used=1)
