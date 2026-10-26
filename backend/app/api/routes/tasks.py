"""Offer and follow-up task routes, all owner-scoped."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, select
from sqlalchemy.orm import Session, joinedload

from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db_session
from app.models.enums import OfferStatus as OfferStatusEnum
from app.models.enums import TaskSource
from app.models.enums import TaskStatus as TaskStatusEnum
from app.models.events import Event, ResourceNeed
from app.models.outreach import FollowUpTask, Offer
from app.models.prospects import Opportunity
from app.repositories.sponsorship import get_owned_offer, get_owned_opportunity, get_owned_task
from app.schemas.sponsorship import OfferInput, OfferOut, OfferPatch, TaskInput, TaskOut, TaskPatch, TaskStatus
from app.services.pipeline import (
    ACTIVE_TASK_STATUSES,
    TransitionError,
    allowed_offer_transitions,
    ensure_offer_transition,
    ensure_task_transition,
)

router = APIRouter(tags=["offers", "tasks"])


def _as_utc(value: datetime | None) -> datetime | None:
    """Treat timestamps without a timezone as UTC so comparisons are consistent."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def offer_out(offer: Offer) -> OfferOut:
    out = OfferOut.model_validate(offer)
    out.allowed_next_statuses = [s.value for s in allowed_offer_transitions(offer.status)]
    return out


def task_out(task: FollowUpTask, now: datetime, opportunity: Opportunity | None = None) -> TaskOut:
    due = _as_utc(task.due_at)
    linked_opportunity = opportunity or task.opportunity
    event = opportunity.event if opportunity else task.event
    return TaskOut(
        id=task.id,
        opportunity_id=task.opportunity_id,
        event_id=task.event_id,
        event_name=event.name,
        company_name=linked_opportunity.prospect.company_name if linked_opportunity else None,
        title=task.title,
        description=task.description,
        due_at=task.due_at,
        status=task.status.value,
        source=task.source.value,
        completed_at=task.completed_at,
        is_overdue=bool(due and due < now and task.status in ACTIVE_TASK_STATUSES),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _require_opportunity(db: Session, user: CurrentUser, opportunity_id: UUID) -> Opportunity:
    opportunity = get_owned_opportunity(db, user.uuid, opportunity_id)
    if not opportunity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")
    return opportunity


def _check_need_belongs_to_event(db: Session, need_id: UUID | None, event_id: UUID) -> None:
    if need_id is None:
        return
    need = db.get(ResourceNeed, need_id)
    if not need or need.event_id != event_id:
        raise HTTPException(status_code=422, detail="resource_need_id must be a need of the same event.")


def _require_owned_event(db: Session, user: CurrentUser, event_id: UUID) -> Event:
    event = db.scalar(select(Event).where(Event.id == event_id, Event.owner_id == user.uuid))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


# ── Offers ───────────────────────────────────────────────────────────────────


@router.get("/opportunities/{opportunity_id}/offers", response_model=list[OfferOut])
def list_offers(opportunity_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    opportunity = _require_opportunity(db, user, opportunity_id)
    offers = db.scalars(select(Offer).where(Offer.opportunity_id == opportunity.id).order_by(Offer.created_at)).all()
    return [offer_out(o) for o in offers]


@router.post("/opportunities/{opportunity_id}/offers", response_model=OfferOut, status_code=status.HTTP_201_CREATED)
def create_offer(
    opportunity_id: UUID,
    body: OfferInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """New offers always start as `proposed`; acceptance is a separate, evidence-backed step."""
    opportunity = _require_opportunity(db, user, opportunity_id)
    _check_need_belongs_to_event(db, body.resource_need_id, opportunity.event_id)
    data = body.model_dump()
    if data.get("evidence_url") is not None:
        data["evidence_url"] = str(data["evidence_url"])
    offer = Offer(opportunity_id=opportunity.id, status=OfferStatusEnum.PROPOSED, **data)
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer_out(offer)


@router.patch("/offers/{offer_id}", response_model=OfferOut)
def update_offer(
    offer_id: UUID,
    body: OfferPatch,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    offer = get_owned_offer(db, user.uuid, offer_id)
    if not offer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    changes = body.model_dump(exclude_unset=True)
    target = changes.pop("status", None)
    confirm_verified = changes.pop("confirm_verified", False)
    if "evidence_url" in changes and changes["evidence_url"] is not None:
        changes["evidence_url"] = str(changes["evidence_url"])
    for required in ("support_type", "currency"):
        if required in changes and changes[required] is None:
            raise HTTPException(status_code=422, detail=f"{required} cannot be empty.")
    if offer.status in (OfferStatusEnum.ACCEPTED, OfferStatusEnum.FULFILLED, OfferStatusEnum.REJECTED):
        # Settled offers keep their terms; only evidence can still be added.
        locked = set(changes) - {"evidence_notes", "evidence_url"}
        if locked:
            raise HTTPException(status_code=409, detail=f"A {offer.status.value} offer's terms can no longer be edited.")
    if "resource_need_id" in changes:
        opportunity = db.get(Opportunity, offer.opportunity_id)
        _check_need_belongs_to_event(db, changes["resource_need_id"], opportunity.event_id)

    if target is not None:
        target_status = OfferStatusEnum(target)
        try:
            ensure_offer_transition(
                offer.status,
                target_status,
                evidence_notes=changes.get("evidence_notes", offer.evidence_notes),
                evidence_url=changes.get("evidence_url", offer.evidence_url),
                confirm_verified=confirm_verified,
            )
        except TransitionError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        if target_status == OfferStatusEnum.ACCEPTED:
            offer.organizer_verified_by = user.uuid
            offer.organizer_verified_at = datetime.now(timezone.utc)
        offer.status = target_status

    for key, value in changes.items():
        setattr(offer, key, value)
    db.commit()
    db.refresh(offer)
    return offer_out(offer)


# ── Follow-up tasks ──────────────────────────────────────────────────────────


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    event_id: UUID | None = None,
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    overdue_only: bool = False,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    query = (
        select(FollowUpTask)
        .join(Event, FollowUpTask.event_id == Event.id)
        .options(
            joinedload(FollowUpTask.event),
            joinedload(FollowUpTask.opportunity).joinedload(Opportunity.prospect),
        )
        .where(FollowUpTask.owner_id == user.uuid, Event.owner_id == user.uuid)
    )
    if event_id:
        query = query.where(FollowUpTask.event_id == event_id)
    if status_filter:
        query = query.where(FollowUpTask.status == status_filter)
    now = datetime.now(timezone.utc)
    if overdue_only:
        query = query.where(FollowUpTask.due_at < now, FollowUpTask.status.in_(list(ACTIVE_TASK_STATUSES)))
    tasks = db.scalars(query.order_by(asc(FollowUpTask.due_at).nulls_last(), FollowUpTask.created_at)).unique().all()
    return [task_out(t, now) for t in tasks]


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_event_task(
    body: TaskInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    if body.event_id is None:
        raise HTTPException(status_code=422, detail="event_id is required for an event task.")
    event = _require_owned_event(db, user, body.event_id)
    task = FollowUpTask(
        owner_id=user.uuid,
        event_id=event.id,
        title=body.title,
        description=body.description,
        due_at=_as_utc(body.due_at),
        status=TaskStatusEnum.OPEN,
        source=TaskSource.MANUAL,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    task.event = event
    return task_out(task, datetime.now(timezone.utc))


@router.post("/opportunities/{opportunity_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    opportunity_id: UUID,
    body: TaskInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    opportunity = _require_opportunity(db, user, opportunity_id)
    task = FollowUpTask(
        owner_id=user.uuid,
        event_id=opportunity.event_id,
        opportunity_id=opportunity.id,
        title=body.title,
        description=body.description,
        due_at=_as_utc(body.due_at),
        status=TaskStatusEnum.OPEN,
        source=TaskSource.MANUAL,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task_out(task, datetime.now(timezone.utc), opportunity)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: UUID,
    body: TaskPatch,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    task = get_owned_task(db, user.uuid, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    changes = body.model_dump(exclude_unset=True)
    if "title" in changes and not changes["title"]:
        raise HTTPException(status_code=422, detail="title cannot be empty.")
    target = changes.pop("status", None)
    if target is not None:
        target_status = TaskStatusEnum(target)
        try:
            ensure_task_transition(task.status, target_status)
        except TransitionError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        task.status = target_status
        task.completed_at = datetime.now(timezone.utc) if target_status == TaskStatusEnum.COMPLETED else None
    if "due_at" in changes:
        changes["due_at"] = _as_utc(changes["due_at"])
    for key, value in changes.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task_out(task, datetime.now(timezone.utc))
