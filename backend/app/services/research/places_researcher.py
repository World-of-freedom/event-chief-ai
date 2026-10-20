"""Google Places API client for nearby business discovery.

Discovers local businesses (cafes, retailers, tech hubs, hotels) near the venue.
Complies with Google Maps Platform policies:
- Never indiscriminately stores raw Places API responses.
- Resolves and verifies the company's official website and name independently.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

# Limited safe fields to prevent unexpected billing and comply with terms
SAFE_FIELDS = "name,website,formatted_address,formatted_phone_number,geometry,types"


@dataclass
class PlaceBusiness:
    name: str
    website: str | None
    address: str | None
    phone: str | None
    latitude: float | None
    longitude: float | None
    place_types: list[str]
    place_id: str


async def search_nearby_places(
    query: str,
    city: str,
    api_key: str,
    max_results: int = 5,
) -> tuple[list[PlaceBusiness], int]:
    """Search for relevant local businesses in the city.

    Returns:
        (list_of_businesses, api_calls_count)
    """
    search_query = f"{query} in {city}"
    api_calls = 0

    async with httpx.AsyncClient(timeout=12.0) as client:
        try:
            api_calls += 1
            response = await client.get(
                PLACES_TEXT_SEARCH_URL,
                params={"query": search_query, "key": api_key},
            )
            response.raise_for_status()
            data = response.json()

            status = data.get("status")
            if status not in ("OK", "ZERO_RESULTS"):
                logger.warning("Places API text search status: %s", status)
                return [], api_calls

            candidates = data.get("results", [])[:max_results]
            businesses: list[PlaceBusiness] = []

            for place in candidates:
                place_id = place.get("place_id")
                if not place_id:
                    continue

                # Fetch details for official website & contact
                detail_business, calls = await _get_place_details(place_id, api_key, client)
                api_calls += calls
                if detail_business:
                    businesses.append(detail_business)

            return businesses, api_calls

        except httpx.HTTPStatusError as exc:
            logger.warning("Places search HTTP %s: %s", exc.response.status_code, exc)
            return [], api_calls
        except Exception as exc:
            logger.warning("Places search error: %s", exc)
            return [], api_calls


async def _get_place_details(
    place_id: str,
    api_key: str,
    client: httpx.AsyncClient,
) -> tuple[PlaceBusiness | None, int]:
    """Fetch website and contact details for place_id."""
    try:
        response = await client.get(
            PLACES_DETAILS_URL,
            params={"place_id": place_id, "fields": SAFE_FIELDS, "key": api_key},
        )
        response.raise_for_status()
        data = response.json()

        if data.get("status") != "OK":
            return None, 1

        result = data.get("result", {})
        geometry = result.get("geometry", {}).get("location", {})

        business = PlaceBusiness(
            name=result.get("name", ""),
            website=result.get("website"),
            address=result.get("formatted_address"),
            phone=result.get("formatted_phone_number"),
            latitude=geometry.get("lat"),
            longitude=geometry.get("lng"),
            place_types=result.get("types", []),
            place_id=place_id,
        )
        return business, 1

    except Exception as exc:
        logger.warning("Places details fetch error for %s: %s", place_id, exc)
        return None, 1
