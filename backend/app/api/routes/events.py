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
    EventInput,
    EventOut,
    EventPatch,
    InKindOfferOut,
    RecentCallOut,
    ResourceNeedInput,
    ResourceNeedOut,
    ResourceNeedPatch,
    check_need_amounts,
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


# ── Events ───────────────────────────────────────────────────────────────────


@router.get("", response_model=list[EventOut])
def list_events(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    return db.scalars(
        select(Event).where(Event.owner_id == user.uuid).order_by(desc(Event.start_date), desc(Event.created_at))
    ).all()


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(body: EventInput, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    event = Event(owner_id=user.uuid, **_json_values(body.model_dump()))
    db.add(event)
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

    needs = db.scalars(select(ResourceNeed).where(ResourceNeed.event_id == event.id).order_by(ResourceNeed.created_at)).all()
    offer_rows = db.execute(
        select(Offer, Prospect.company_name)
        .join(Opportunity, Offer.opportunity_id == Opportunity.id)
        .join(Prospect, Opportunity.prospect_id == Prospect.id)
        .where(Opportunity.event_id == event.id)
    ).all()
    opportunity_statuses = db.scalars(select(Opportunity.status).where(Opportunity.event_id == event.id)).all()
    tasks = db.scalars(
        select(FollowUpTask)
        .join(Opportunity, FollowUpTask.opportunity_id == Opportunity.id)
        .where(Opportunity.event_id == event.id, FollowUpTask.owner_id == user.uuid)
    ).all()
    calls = db.execute(
        select(Call, Prospect.company_name)
        .join(Opportunity, Call.opportunity_id == Opportunity.id)
        .join(Prospect, Opportunity.prospect_id == Prospect.id)
        .where(Opportunity.event_id == event.id)
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
def list_needs(event_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
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
    try:
        check_need_amounts(category, amount)
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
