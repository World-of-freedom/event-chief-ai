"""API endpoints for the sponsor discovery research pipeline.

Enables organizers to:
- Launch a new sponsor discovery research job
- Track live job progress (percentage & status message)
- Retrieve ranked sponsor leads with full scoring breakdown and evidence
- View individual lead details and outreach status
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.auth import get_current_user
from app.core.database import get_db_session
from app.core.settings import Settings, get_settings
from app.models.enums import LeadVerificationStatus, OutreachLeadStatus, ResearchJobStatus
from app.models.research import LeadEvidence, LeadOutreach, ResearchJob, SponsorLead
from app.schemas.research import (
    LeadEvidenceOut,
    ResearchJobCreate,
    ResearchJobOut,
    ResearchJobWithLeads,
    SponsorLeadOut,
)
from app.services.research.orchestrator import run_research_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/research-jobs", tags=["research"])
leads_router = APIRouter(prefix="/leads", tags=["leads"])


def _user_uuid(user: Any) -> UUID:
    """Normalize user id from CurrentUser or string to a UUID object."""
    uid = getattr(user, "uuid", None) or getattr(user, "id", user)
    return uid if isinstance(uid, UUID) else UUID(str(uid))


@router.post("", response_model=ResearchJobOut, status_code=status.HTTP_201_CREATED)
def create_research_job(
    body: ResearchJobCreate,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
):
    """Create a new sponsor discovery research job and trigger async research."""
    owner_id = _user_uuid(current_user)
    job = ResearchJob(
        owner_id=owner_id,
        event_id=body.event_id,
        event_name=body.event_name,
        event_type=body.event_type,
        event_theme=body.event_theme,
        event_description=body.event_description,
        venue_city=body.venue_city,
        venue_state=body.venue_state,
        venue_name=body.venue_name,
        start_date=body.start_date,
        end_date=body.end_date,
        event_format=body.event_format,
        expected_footfall=body.expected_footfall,
        primary_audience=body.primary_audience,
        audience_age_range=body.audience_age_range,
        academic_disciplines=body.academic_disciplines,
        institution_name=body.institution_name,
        budget_target_inr=body.budget_target_inr,
        support_types_needed=body.support_types_needed,
        sponsorship_tiers=body.sponsorship_tiers,
        sponsor_benefits=body.sponsor_benefits,
        previous_edition_count=body.previous_edition_count,
        previous_sponsors_hint=body.previous_sponsors_hint,
        additional_notes=body.additional_notes,
        status=ResearchJobStatus.PENDING,
        progress_percent=0,
        progress_message="Job submitted and queued for research.",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Dispatch async research pipeline
    background_tasks.add_task(run_research_job, job.id, settings)

    logger.info("Queued research job %s for user %s", job.id, current_user.id)
    return job


@router.get("", response_model=list[ResearchJobOut])
def list_research_jobs(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
    limit: int = Query(default=20, le=100),
):
    """List all research jobs created by the current user."""
    owner_id = _user_uuid(current_user)
    jobs = (
        db.query(ResearchJob)
        .filter(ResearchJob.owner_id == owner_id)
        .order_by(desc(ResearchJob.created_at))
        .limit(limit)
        .all()
    )
    return jobs


@router.get("/{job_id}", response_model=ResearchJobOut)
def get_research_job(
    job_id: UUID,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """Get status, progress percentage, and metrics of a research job."""
    owner_id = _user_uuid(current_user)
    job = (
        db.query(ResearchJob)
        .filter(ResearchJob.id == job_id, ResearchJob.owner_id == owner_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research job not found.")
    return job


@router.get("/{job_id}/leads", response_model=ResearchJobWithLeads)
def get_job_leads(
    job_id: UUID,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """Retrieve full research results: job snapshot + ranked sponsor leads with evidence."""
    owner_id = _user_uuid(current_user)
    job = (
        db.query(ResearchJob)
        .options(
            selectinload(ResearchJob.leads).selectinload(SponsorLead.evidence)
        )
        .filter(ResearchJob.id == job_id, ResearchJob.owner_id == owner_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research job not found.")

    # Sort leads by score_total descending
    job.leads.sort(key=lambda lead: lead.score_total, reverse=True)
    return job


@leads_router.get("/{lead_id}", response_model=SponsorLeadOut)
def get_lead_details(
    lead_id: UUID,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """Retrieve full details for a single sponsor lead, including evidence."""
    owner_id = _user_uuid(current_user)
    lead = (
        db.query(SponsorLead)
        .options(selectinload(SponsorLead.evidence))
        .join(ResearchJob, SponsorLead.job_id == ResearchJob.id)
        .filter(SponsorLead.id == lead_id, ResearchJob.owner_id == owner_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor lead not found.")
    return lead
