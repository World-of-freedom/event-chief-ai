"""Event and resource-need routes.

TODO: add auth dependency, ownership checks, service calls, and response models
when a repository implementation is selected.
"""

from fastapi import APIRouter

from app.api.routes._stubs import not_implemented
from app.schemas.events import EventInput, EventPatch, ResourceNeedInput

router = APIRouter(prefix="/events", tags=["events"])


@router.get("")
def list_events() -> None:
    not_implemented("Event listing")


@router.post("")
def create_event(_: EventInput) -> None:
    not_implemented("Event creation")


@router.get("/{event_id}")
def get_event(event_id: str) -> None:
    not_implemented("Event detail")


@router.patch("/{event_id}")
def update_event(event_id: str, _: EventPatch) -> None:
    not_implemented("Event updates")


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: str) -> None:
    not_implemented("Event deletion")


@router.get("/{event_id}/dashboard")
def event_dashboard(event_id: str) -> None:
    not_implemented("Dashboard aggregation")


@router.get("/{event_id}/needs")
def list_needs(event_id: str) -> None:
    not_implemented("Resource-need listing")


@router.post("/{event_id}/needs")
def create_need(event_id: str, _: ResourceNeedInput) -> None:
    not_implemented("Resource-need creation")


@router.patch("/needs/{need_id}")
def update_need(need_id: str, _: ResourceNeedInput) -> None:
    not_implemented("Resource-need updates")


@router.delete("/needs/{need_id}", status_code=204)
def delete_need(need_id: str) -> None:
    not_implemented("Resource-need deletion")
