"""Prospect and opportunity (pipeline) routes, all owner-scoped."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.routes.tasks import offer_out, task_out
from app.core.auth import CurrentUser, get_current_user
from app.core.database import get_db_session
from app.models.enums import OpportunityStatus as OpportunityStatusEnum
from app.models.events import Event
from app.models.outreach import FollowUpTask, Offer
from app.models.prospects import Opportunity, OpportunityStatusHistory, Prospect
from app.models.research import ResearchJob, SponsorLead
from app.repositories.sponsorship import get_owned_event, get_owned_opportunity, get_owned_prospect
from app.schemas.sponsorship import (
    OpportunityDetailOut,
    OpportunityFromLeadInput,
    OpportunityInput,
    OpportunityListItemOut,
    OpportunityPatch,
    OpportunityStatus,
    OpportunityWithProspectInput,
    ProspectInput,
    ProspectOut,
    ProspectPatch,
    ProspectSummaryOut,
)
from app.services.lead_import import find_matching_prospect, prospect_fields_from_lead
from app.services.pipeline import (
    ACTIVE_TASK_STATUSES,
    OUTREACH_BLOCKED_STATUSES,
    TransitionError,
    allowed_opportunity_transitions,
    ensure_opportunity_transition,
)
router = APIRouter(tags=["prospects", "opportunities"])


def _url_strings(payload: dict) -> dict:
    return {key: (str(value) if key.endswith("_url") and value is not None else value) for key, value in payload.items()}


def _require_prospect(db: Session, user: CurrentUser, prospect_id: UUID) -> Prospect:
    prospect = get_owned_prospect(db, user.uuid, prospect_id)
    if not prospect:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prospect not found.")
    return prospect


def _require_opportunity(db: Session, user: CurrentUser, opportunity_id: UUID) -> Opportunity:
    opportunity = get_owned_opportunity(db, user.uuid, opportunity_id)
    if not opportunity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")
    return opportunity


def _require_event(db: Session, user: CurrentUser, event_id: UUID) -> Event:
    event = get_owned_event(db, user.uuid, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
    return event


def _mark_prospect_opted_out(prospect: Prospect, reason: str | None) -> None:
    if not prospect.opted_out:
        prospect.opted_out = True
        prospect.opted_out_at = datetime.now(timezone.utc)
        prospect.opt_out_reason = reason


def _create_opportunity(
    db: Session, user: CurrentUser, event: Event, prospect: Prospect, notes: str | None
) -> Opportunity:
    existing = db.scalar(
        select(Opportunity).where(Opportunity.event_id == event.id, Opportunity.prospect_id == prospect.id)
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{prospect.company_name} is already in the pipeline for {event.name}.",
            headers={"X-Existing-Opportunity-Id": str(existing.id)},
        )
    initial = OpportunityStatusEnum.OPTED_OUT if prospect.opted_out else OpportunityStatusEnum.PROSPECT_FOUND
    opportunity = Opportunity(event_id=event.id, prospect_id=prospect.id, status=initial, organizer_notes=notes)
    db.add(opportunity)
    db.flush()
    db.add(
        OpportunityStatusHistory(
            opportunity_id=opportunity.id,
            previous_status=None,
            new_status=initial,
            changed_by=user.uuid,
            reason="Added to pipeline" + (" (prospect has opted out)" if prospect.opted_out else ""),
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:  # concurrent double-submit hit the unique constraint
        db.rollback()
        raise HTTPException(status_code=409, detail=f"{prospect.company_name} is already in this pipeline.") from exc
    return opportunity


def _list_items(db: Session, opportunities: list[Opportunity]) -> list[OpportunityListItemOut]:
    ids = [o.id for o in opportunities]
    offer_counts = dict(
        db.execute(select(Offer.opportunity_id, func.count()).where(Offer.opportunity_id.in_(ids)).group_by(Offer.opportunity_id)).all()
    ) if ids else {}
    task_counts = dict(
        db.execute(
            select(FollowUpTask.opportunity_id, func.count())
            .where(FollowUpTask.opportunity_id.in_(ids), FollowUpTask.status.in_(list(ACTIVE_TASK_STATUSES)))
            .group_by(FollowUpTask.opportunity_id)
        ).all()
    ) if ids else {}
    return [
        OpportunityListItemOut(
            id=o.id,
            event_id=o.event_id,
            event_name=o.event.name,
            status=o.status.value,
            prospect=ProspectSummaryOut.model_validate(o.prospect),
            next_action=o.next_action,
            next_action_due_at=o.next_action_due_at,
            last_contacted_at=o.last_contacted_at,
            offer_count=offer_counts.get(o.id, 0),
            open_task_count=task_counts.get(o.id, 0),
            created_at=o.created_at,
            updated_at=o.updated_at,
        )
        for o in opportunities
    ]


def _detail(db: Session, opportunity_id: UUID, user: CurrentUser) -> OpportunityDetailOut:
    opportunity = db.scalar(
        select(Opportunity)
        .join(Event, Opportunity.event_id == Event.id)
        .options(
            selectinload(Opportunity.prospect),
            selectinload(Opportunity.event),
            selectinload(Opportunity.status_history),
            selectinload(Opportunity.offers),
            selectinload(Opportunity.tasks),
            selectinload(Opportunity.messages),
            selectinload(Opportunity.calls),
        )
        .where(Opportunity.id == opportunity_id, Event.owner_id == user.uuid)
    )
    if not opportunity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Opportunity not found.")
    now = datetime.now(timezone.utc)
    base = _list_items(db, [opportunity])[0]
    return OpportunityDetailOut(
        **base.model_dump(),
        organizer_notes=opportunity.organizer_notes,
        prospect_detail=ProspectOut.model_validate(opportunity.prospect),
        allowed_next_statuses=[s.value for s in allowed_opportunity_transitions(opportunity.status)],
        outreach_blocked=opportunity.prospect.opted_out or opportunity.status in OUTREACH_BLOCKED_STATUSES,
        status_history=sorted(opportunity.status_history, key=lambda h: h.created_at, reverse=True),
        offers=[offer_out(o) for o in sorted(opportunity.offers, key=lambda o: o.created_at, reverse=True)],
        tasks=[task_out(t, opportunity, now) for t in sorted(opportunity.tasks, key=lambda t: t.created_at, reverse=True)],
        messages=sorted(opportunity.messages, key=lambda m: m.created_at, reverse=True),
        calls=sorted(opportunity.calls, key=lambda c: c.created_at, reverse=True),
    )


# ── Prospects ────────────────────────────────────────────────────────────────


@router.get("/prospects", response_model=list[ProspectOut])
def list_prospects(
    q: str | None = Query(default=None, max_length=200),
    verification_status: str | None = Query(default=None, pattern="^(unverified|reviewed|verified)$"),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    query = select(Prospect).where(Prospect.owner_id == user.uuid)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Prospect.company_name.ilike(like), Prospect.industry.ilike(like), Prospect.location.ilike(like)))
    if verification_status:
        query = query.where(Prospect.verification_status == verification_status)
    return db.scalars(query.order_by(Prospect.company_name)).all()


@router.post("/prospects", response_model=ProspectOut, status_code=status.HTTP_201_CREATED)
def create_prospect(body: ProspectInput, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    prospect = Prospect(owner_id=user.uuid, **_url_strings(body.model_dump()))
    db.add(prospect)
    db.commit()
    db.refresh(prospect)
    return prospect


@router.get("/prospects/{prospect_id}", response_model=ProspectOut)
def get_prospect(prospect_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    return _require_prospect(db, user, prospect_id)


@router.patch("/prospects/{prospect_id}", response_model=ProspectOut)
def update_prospect(
    prospect_id: UUID,
    body: ProspectPatch,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    prospect = _require_prospect(db, user, prospect_id)
    changes = _url_strings(body.model_dump(exclude_unset=True))
    if "company_name" in changes and not changes["company_name"]:
        raise HTTPException(status_code=422, detail="company_name cannot be empty.")
    if "verification_status" in changes and changes["verification_status"] is None:
        raise HTTPException(status_code=422, detail="verification_status cannot be empty.")
    opt_out = changes.pop("opted_out", None)
    reason = changes.pop("opt_out_reason", None)
    for key, value in changes.items():
        setattr(prospect, key, value)
    if opt_out:
        _mark_prospect_opted_out(prospect, reason)
        # An opt-out ends outreach in every pipeline this prospect is part of.
        for opportunity in db.scalars(select(Opportunity).where(Opportunity.prospect_id == prospect.id)).all():
            if opportunity.status != OpportunityStatusEnum.OPTED_OUT and OpportunityStatusEnum.OPTED_OUT in allowed_opportunity_transitions(opportunity.status):
                db.add(OpportunityStatusHistory(
                    opportunity_id=opportunity.id,
                    previous_status=opportunity.status,
                    new_status=OpportunityStatusEnum.OPTED_OUT,
                    changed_by=user.uuid,
                    reason=reason or "Prospect opted out",
                ))
                opportunity.status = OpportunityStatusEnum.OPTED_OUT
    db.commit()
    db.refresh(prospect)
    return prospect


# ── Opportunities ────────────────────────────────────────────────────────────


@router.get("/opportunities", response_model=list[OpportunityListItemOut])
def list_opportunities(
    event_id: UUID | None = None,
    status_filter: OpportunityStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=200),
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    query = (
        select(Opportunity)
        .join(Event, Opportunity.event_id == Event.id)
        .join(Prospect, Opportunity.prospect_id == Prospect.id)
        .options(selectinload(Opportunity.prospect), selectinload(Opportunity.event))
        .where(Event.owner_id == user.uuid)
    )
    if event_id:
        query = query.where(Opportunity.event_id == event_id)
    if status_filter:
        query = query.where(Opportunity.status == status_filter)
    if q and q.strip():
        query = query.where(Prospect.company_name.ilike(f"%{q.strip()}%"))
    opportunities = db.scalars(query.order_by(desc(Opportunity.updated_at))).all()
    return _list_items(db, list(opportunities))


@router.post("/events/{event_id}/opportunities", response_model=OpportunityDetailOut, status_code=status.HTTP_201_CREATED)
def create_opportunity(
    event_id: UUID,
    body: OpportunityInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    event = _require_event(db, user, event_id)
    prospect = _require_prospect(db, user, body.prospect_id)
    opportunity = _create_opportunity(db, user, event, prospect, body.organizer_notes)
    return _detail(db, opportunity.id, user)


@router.post("/events/{event_id}/opportunities/with-prospect", response_model=OpportunityDetailOut, status_code=status.HTTP_201_CREATED)
def create_opportunity_with_prospect(
    event_id: UUID,
    body: OpportunityWithProspectInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    event = _require_event(db, user, event_id)
    prospect = Prospect(owner_id=user.uuid, **_url_strings(body.prospect.model_dump()))
    db.add(prospect)
    db.flush()
    opportunity = _create_opportunity(db, user, event, prospect, body.organizer_notes)
    return _detail(db, opportunity.id, user)


@router.post("/events/{event_id}/opportunities/from-lead", response_model=OpportunityDetailOut, status_code=status.HTTP_201_CREATED)
def create_opportunity_from_lead(
    event_id: UUID,
    body: OpportunityFromLeadInput,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """Add an AI-discovered lead to an event's pipeline (reusing an existing prospect for the same company)."""
    event = _require_event(db, user, event_id)
    lead = db.scalar(
        select(SponsorLead)
        .join(ResearchJob, SponsorLead.job_id == ResearchJob.id)
        .options(selectinload(SponsorLead.evidence), selectinload(SponsorLead.job))
        .where(SponsorLead.id == body.lead_id, ResearchJob.owner_id == user.uuid)
    )
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor lead not found.")
    prospect = find_matching_prospect(db, user.uuid, lead)
    if not prospect:
        prospect = Prospect(owner_id=user.uuid, **prospect_fields_from_lead(lead, lead.job))
        db.add(prospect)
        db.flush()
    opportunity = _create_opportunity(db, user, event, prospect, body.organizer_notes)
    return _detail(db, opportunity.id, user)


@router.get("/opportunities/{opportunity_id}", response_model=OpportunityDetailOut)
def get_opportunity(opportunity_id: UUID, user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db_session)):
    return _detail(db, opportunity_id, user)


@router.patch("/opportunities/{opportunity_id}", response_model=OpportunityDetailOut)
def update_opportunity(
    opportunity_id: UUID,
    body: OpportunityPatch,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    opportunity = _require_opportunity(db, user, opportunity_id)
    changes = body.model_dump(exclude_unset=True)
    target = changes.pop("status", None)
    reason = changes.pop("status_reason", None)

    if target is not None:
        target_status = OpportunityStatusEnum(target)
        try:
            ensure_opportunity_transition(opportunity.status, target_status)
        except TransitionError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        if opportunity.prospect.opted_out and target_status != OpportunityStatusEnum.OPTED_OUT:
            raise HTTPException(status_code=409, detail="This prospect has opted out; the opportunity can only be closed as opted out.")
        db.add(OpportunityStatusHistory(
            opportunity_id=opportunity.id,
            previous_status=opportunity.status,
            new_status=target_status,
            changed_by=user.uuid,
            reason=reason,
        ))
        opportunity.status = target_status
        if target_status == OpportunityStatusEnum.OPTED_OUT:
            _mark_prospect_opted_out(opportunity.prospect, reason)

    for key, value in changes.items():
        setattr(opportunity, key, value)
    db.commit()
    return _detail(db, opportunity.id, user)
