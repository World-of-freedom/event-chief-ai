"""Owner-scoped loaders for the sponsorship domain."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.events import Event, ResourceNeed
from app.models.outreach import FollowUpTask, Offer
from app.models.prospects import Opportunity, Prospect


def get_owned_event(db: Session, owner_id: UUID, event_id: UUID) -> Event | None:
    return db.scalar(select(Event).where(Event.id == event_id, Event.owner_id == owner_id))


def get_owned_need(db: Session, owner_id: UUID, need_id: UUID) -> ResourceNeed | None:
    return db.scalar(
        select(ResourceNeed)
        .join(Event, ResourceNeed.event_id == Event.id)
        .where(ResourceNeed.id == need_id, Event.owner_id == owner_id)
    )


def get_owned_prospect(db: Session, owner_id: UUID, prospect_id: UUID) -> Prospect | None:
    return db.scalar(select(Prospect).where(Prospect.id == prospect_id, Prospect.owner_id == owner_id))


def get_owned_opportunity(db: Session, owner_id: UUID, opportunity_id: UUID) -> Opportunity | None:
    return db.scalar(
        select(Opportunity)
        .join(Event, Opportunity.event_id == Event.id)
        .options(joinedload(Opportunity.prospect), joinedload(Opportunity.event))
        .where(Opportunity.id == opportunity_id, Event.owner_id == owner_id)
    )


def get_owned_offer(db: Session, owner_id: UUID, offer_id: UUID) -> Offer | None:
    return db.scalar(
        select(Offer)
        .join(Opportunity, Offer.opportunity_id == Opportunity.id)
        .join(Event, Opportunity.event_id == Event.id)
        .where(Offer.id == offer_id, Event.owner_id == owner_id)
    )


def get_owned_task(db: Session, owner_id: UUID, task_id: UUID) -> FollowUpTask | None:
    return db.scalar(
        select(FollowUpTask)
        .join(Event, FollowUpTask.event_id == Event.id)
        .options(
            joinedload(FollowUpTask.event),
            joinedload(FollowUpTask.opportunity).joinedload(Opportunity.prospect),
        )
        .where(FollowUpTask.id == task_id, Event.owner_id == owner_id, FollowUpTask.owner_id == owner_id)
    )
