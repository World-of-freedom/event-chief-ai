"""Event, resource-need and dashboard routes (all owner-scoped)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db_session
from app.models.enums import ResourceCategory, ResourceNeedStatus
from app.models.events import Event, ResourceNeed
from app.models.outreach import Call, FollowUpTask, Offer
from app.models.prospects import Opportunity, Prospect
from app.repositories.sponsorship import get_owned_event, get_owned_need
from app.schemas.events import (
    DashboardOut,
    EventCreateInput,
    EventInput,
    EventOut,
    EventPatch,
    InKindOfferOut,
    RecentCallOut,
    ResourceNeedInput,
    ResourceNeedOut,
    ResourceNeedPatch,
    check_need_details,
)
from app.services.dashboard import (
    SECURED_OFFER_STATUSES,
    NeedRow,
    OfferRow,
    TaskRow,
    count_by_status,
    count_tasks,
    summarize_cash,
)

router = APIRouter(prefix="/events", tags=["events"])


def _require_event(db: Session, user: CurrentUser, event_id: UUID) -> Event:
    event = get_owned_event(db, user.uuid, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
    return event


def _require_need(db: Session, user: CurrentUser, need_id: UUID) -> ResourceNeed:
    need = get_owned_need(db, user.uuid, need_id)
    if not need:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource need not found.")
    return need


def _json_values(payload: dict) -> dict:
    """Pydantic URL types are stored as plain strings."""
    return {key: (str(value) if key.endswith("_url") and value is not None else value) for key, value in payload.items()}


def _descendant_ids(db: Session, owner_id: UUID, root_id: UUID) -> set[UUID]:
    """Return a complete event subtree without relying on database-specific CTEs."""
    rows = db.execute(select(Event.id, Event.parent_event_id).where(Event.owner_id == owner_id)).all()
    children: dict[UUID, list[UUID]] = {}
    for event_id, parent_id in rows:
        if parent_id:
            children.setdefault(parent_id, []).append(event_id)
    found = {root_id}
    pending = [root_id]
    while pending:
        parent_id = pending.pop()
        for child_id in children.get(parent_id, []):
            if child_id not in found:
                found.add(child_id)
                pending.append(child_id)
    return found


def _validate_parent_event(db: Session, user: CurrentUser, event: Event | None, parent_id: UUID | None) -> Event | None:
    if parent_id is None:
        return None
    parent = _require_event(db, user, parent_id)
    if event is None:
        return parent
    if parent.id == event.id:
        raise HTTPException(status_code=422, detail="An event cannot be its own parent.")
    if parent.id in _descendant_ids(db, user.uuid, event.id):
        raise HTTPException(status_code=422, detail="An event cannot be linked to one of its descendants.")
    return parent


# ── Events ───────────────────────────────────────────────────────────────────


@router.get("", response_model=list[EventOut])
def list_events(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    return db.scalars(
        select(Event).where(Event.owner_id == user.uuid).order_by(desc(Event.start_date), desc(Event.created_at))
    ).all()


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(body: EventCreateInput, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    data = body.model_dump(exclude={"resource_needs"})
    parent = _validate_parent_event(db, user, None, data.get("parent_event_id"))
    data["is_subevent"] = parent is not None
    event = Event(owner_id=user.uuid, **_json_values(data))
    db.add(event)
    db.flush()
    for need_input in body.resource_needs:
        db.add(ResourceNeed(event_id=event.id, **need_input.model_dump()))
    db.commit()
    db.refresh(event)
    return event


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    return _require_event(db, user, event_id)


@router.patch("/{event_id}", response_model=EventOut)
def update_event(
    event_id: UUID,
    body: EventPatch,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    event = _require_event(db, user, event_id)
    changes = _json_values(body.model_dump(exclude_unset=True))
    for required in ("name", "event_type", "institution", "start_date", "is_online"):
        if required in changes and changes[required] is None:
            raise HTTPException(status_code=422, detail=f"{required} cannot be empty.")
    start = changes.get("start_date", event.start_date)
    end = changes.get("end_date", event.end_date)
    if start and end and end < start:
        raise HTTPException(status_code=422, detail="end_date cannot be before start_date")
    if "parent_event_id" in changes:
        parent = _validate_parent_event(db, user, event, changes["parent_event_id"])
        changes["is_subevent"] = parent is not None
    for key, value in changes.items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    event = _require_event(db, user, event_id)
    db.delete(event)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Dashboard ────────────────────────────────────────────────────────────────


@router.get("/{event_id}/dashboard", response_model=DashboardOut)
def event_dashboard(event_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    event = _require_event(db, user, event_id)

    # Parent dashboards roll up every nested event while a child dashboard
    # remains scoped to that child's own branch.
    event_ids = _descendant_ids(db, user.uuid, event.id)
    needs = db.scalars(select(ResourceNeed).where(ResourceNeed.event_id.in_(event_ids)).order_by(ResourceNeed.created_at)).all()
    offer_rows = db.execute(
        select(Offer, Prospect.company_name)
        .join(Opportunity, Offer.opportunity_id == Opportunity.id)
        .join(Prospect, Opportunity.prospect_id == Prospect.id)
        .where(Opportunity.event_id.in_(event_ids))
    ).all()
    opportunity_statuses = db.scalars(select(Opportunity.status).where(Opportunity.event_id.in_(event_ids))).all()
    tasks = db.scalars(
        select(FollowUpTask)
        .where(FollowUpTask.event_id.in_(event_ids), FollowUpTask.owner_id == user.uuid)
    ).all()
    calls = db.execute(
        select(Call, Prospect.company_name)
        .join(Opportunity, Call.opportunity_id == Opportunity.id)
        .join(Prospect, Opportunity.prospect_id == Prospect.id)
        .where(Opportunity.event_id.in_(event_ids))
        .order_by(desc(Call.created_at))
        .limit(5)
    ).all()

    cash = summarize_cash(
        [NeedRow(n.category, n.target_amount, n.currency, n.status) for n in needs],
        [OfferRow(o.support_type, o.stated_value, o.currency, o.status) for o, _ in offer_rows],
    )
    open_tasks, overdue_tasks = count_tasks([TaskRow(t.status, t.due_at) for t in tasks], datetime.now(timezone.utc))

    return DashboardOut(
        event_id=event.id,
        cash=cash.__dict__,
        open_in_kind_needs=[
            n for n in needs if n.category != ResourceCategory.CASH and n.status != ResourceNeedStatus.COVERED
        ],
        in_kind_secured=[
            InKindOfferOut(
                id=o.id,
                opportunity_id=o.opportunity_id,
                company_name=company,
                support_type=o.support_type.value,
                stated_value=o.stated_value,
                currency=o.currency,
                quantity=o.quantity,
                status=o.status.value,
            )
            for o, company in offer_rows
            if o.support_type != ResourceCategory.CASH and o.status in SECURED_OFFER_STATUSES
        ],
        opportunities_by_status=count_by_status([s.value for s in opportunity_statuses]),
        open_task_count=open_tasks,
        overdue_task_count=overdue_tasks,
        recent_calls=[
            RecentCallOut(
                id=c.id,
                opportunity_id=c.opportunity_id,
                company_name=company,
                status=c.status.value,
                outcome=c.outcome.value if c.outcome else None,
                created_at=c.created_at,
            )
            for c, company in calls
        ],
    )


# ── Resource needs ───────────────────────────────────────────────────────────


@router.get("/{event_id}/needs", response_model=list[ResourceNeedOut])
def list_needs(
    event_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    event = _require_event(db, user, event_id)
    return db.scalars(select(ResourceNeed).where(ResourceNeed.event_id == event.id).order_by(ResourceNeed.created_at)).all()


@router.post("/{event_id}/needs", response_model=ResourceNeedOut, status_code=status.HTTP_201_CREATED)
def create_need(
    event_id: UUID,
    body: ResourceNeedInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    event = _require_event(db, user, event_id)
    need = ResourceNeed(event_id=event.id, **body.model_dump())
    db.add(need)
    db.commit()
    db.refresh(need)
    return need


@router.patch("/needs/{need_id}", response_model=ResourceNeedOut)
def update_need(
    need_id: UUID,
    body: ResourceNeedPatch,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    need = _require_need(db, user, need_id)
    changes = body.model_dump(exclude_unset=True)
    for required in ("category", "title", "currency", "priority", "status"):
        if required in changes and changes[required] is None:
            raise HTTPException(status_code=422, detail=f"{required} cannot be empty.")
    category = changes.get("category", need.category.value if hasattr(need.category, "value") else need.category)
    amount = changes.get("target_amount", need.target_amount)
    quantity = changes.get("target_quantity", need.target_quantity)
    details = changes.get("details", need.details) or {}
    try:
        check_need_details(category, amount, quantity, details)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    for key, value in changes.items():
        setattr(need, key, value)
    db.commit()
    db.refresh(need)
    return need


@router.delete("/needs/{need_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_need(need_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    need = _require_need(db, user, need_id)
    db.delete(need)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
