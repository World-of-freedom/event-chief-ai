"""Prospect and discovery route placeholders; no data discovery is implemented."""

from fastapi import APIRouter

from app.api.routes._stubs import not_implemented
from app.schemas.sponsorship import OpportunityInput, OpportunityPatch, ProspectInput

router = APIRouter(tags=["prospects", "opportunities"])


@router.get("/prospects")
def list_prospects() -> None:
    not_implemented("Prospect search")


@router.post("/prospects")
def create_prospect(_: ProspectInput) -> None:
    not_implemented("Prospect creation")


@router.patch("/prospects/{prospect_id}")
def update_prospect(prospect_id: str, _: ProspectInput) -> None:
    not_implemented("Prospect updates")


@router.get("/events/{event_id}/prospect-recommendations")
def recommendations(event_id: str, limit: int = 10) -> None:
    not_implemented("Sponsor discovery recommendations")


@router.get("/events/{event_id}/opportunities")
def list_opportunities(event_id: str) -> None:
    not_implemented("Opportunity pipeline")


@router.post("/events/{event_id}/opportunities")
def create_opportunity(event_id: str, _: OpportunityInput) -> None:
    not_implemented("Opportunity creation")


@router.get("/opportunities/{opportunity_id}")
def get_opportunity(opportunity_id: str) -> None:
    not_implemented("Opportunity detail")


@router.patch("/opportunities/{opportunity_id}")
def update_opportunity(opportunity_id: str, _: OpportunityPatch) -> None:
    not_implemented("Opportunity updates")
