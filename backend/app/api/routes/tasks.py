"""Offer and follow-up task route placeholders."""

from fastapi import APIRouter

from app.api.routes._stubs import not_implemented
from app.schemas.sponsorship import OfferInput, TaskInput

router = APIRouter(tags=["offers", "tasks"])


@router.get("/opportunities/{opportunity_id}/offers")
def list_offers(opportunity_id: str) -> None:
    not_implemented("Offer listing")


@router.post("/opportunities/{opportunity_id}/offers")
def create_offer(opportunity_id: str, _: OfferInput) -> None:
    not_implemented("Offer creation")


@router.patch("/offers/{offer_id}")
def update_offer(offer_id: str, _: OfferInput) -> None:
    not_implemented("Offer updates")


@router.get("/tasks")
def list_tasks() -> None:
    not_implemented("Follow-up listing")


@router.post("/opportunities/{opportunity_id}/tasks")
def create_task(opportunity_id: str, _: TaskInput) -> None:
    not_implemented("Follow-up creation")


@router.patch("/tasks/{task_id}")
def update_task(task_id: str, _: TaskInput) -> None:
    not_implemented("Follow-up updates")
