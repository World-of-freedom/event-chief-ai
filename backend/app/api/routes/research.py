"""API endpoints for the sponsor discovery research pipeline.

Enables organizers to:
- Launch a new sponsor discovery research job
- Track live job progress (percentage & status message)
- Retrieve ranked sponsor leads with full scoring breakdown and evidence
- View individual lead details and outreach status
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.auth import get_current_user
from app.core.database import get_db_session
from app.core.settings import Settings, get_settings
from app.models.enums import LeadVerificationStatus, OutreachLeadStatus, ResearchJobStatus
from app.models.research import LeadContact, LeadContactVerification, LeadEvidence, LeadOutreach, ResearchJob, SponsorLead
from app.repositories.sponsorship import get_owned_event
from app.schemas.research import (
    LeadEvidenceOut,
    ResearchJobCreate,
    ResearchJobOut,
    ResearchJobWithLeads,
    SponsorLeadOut,
    VerifyLeadContactsRequest,
    VerifyLeadContactsResponse,
)
from app.services.research.orchestrator import run_research_job
from app.services.research.contact_checks import display_status_for_contact
from app.services.research.hunter import verify_email

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
    if body.event_id and not get_owned_event(db, owner_id, body.event_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
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
        eligibility_constraints=body.eligibility_constraints,
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


@router.post("/{job_id}/retry", response_model=ResearchJobOut, status_code=status.HTTP_201_CREATED)
def retry_research_job(
    job_id: UUID,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
):
    """Retry by creating a new immutable run from a failed/cancelled job snapshot."""
    owner_id = _user_uuid(current_user)
    previous = db.scalar(select(ResearchJob).where(ResearchJob.id == job_id, ResearchJob.owner_id == owner_id))
    if not previous:
        raise HTTPException(status_code=404, detail="Research job not found.")
    if previous.status not in (ResearchJobStatus.FAILED, ResearchJobStatus.CANCELLED):
        raise HTTPException(status_code=409, detail="Only failed or cancelled research jobs can be retried.")
    copied_fields = (
        "event_id", "event_name", "event_type", "event_theme", "event_description",
        "venue_city", "venue_state", "venue_name", "start_date", "end_date", "event_format",
        "expected_footfall", "primary_audience", "audience_age_range", "academic_disciplines",
        "institution_name", "budget_target_inr", "support_types_needed", "sponsorship_tiers",
        "sponsor_benefits", "eligibility_constraints", "previous_edition_count", "previous_sponsors_hint", "additional_notes",
    )
    job = ResearchJob(
        owner_id=owner_id,
        **{field: getattr(previous, field) for field in copied_fields},
        status=ResearchJobStatus.PENDING,
        progress_percent=0,
        progress_message=f"Retry of {previous.public_id} queued for research.",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    background_tasks.add_task(run_research_job, job.id, settings)
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


@router.get("/by-public-id/{public_id}", response_model=ResearchJobOut)
def get_research_job_by_public_id(
    public_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    """Look up a research job by the short public ID used in frontend URLs."""
    owner_id = _user_uuid(current_user)
    job = (
        db.query(ResearchJob)
        .filter(ResearchJob.public_id == public_id, ResearchJob.owner_id == owner_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research job not found.")
    return job


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
            selectinload(ResearchJob.leads).selectinload(SponsorLead.evidence),
            selectinload(ResearchJob.leads).selectinload(SponsorLead.contacts).selectinload(LeadContact.verifications),
        )
        .filter(ResearchJob.id == job_id, ResearchJob.owner_id == owner_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research job not found.")

    # Fit ranks first; confidence answers how much of that fit is evidenced.
    job.leads.sort(key=lambda lead: (lead.match_score, lead.confidence_score), reverse=True)
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
        .options(
            selectinload(SponsorLead.evidence),
            selectinload(SponsorLead.contacts).selectinload(LeadContact.verifications),
        )
        .join(ResearchJob, SponsorLead.job_id == ResearchJob.id)
        .filter(SponsorLead.id == lead_id, ResearchJob.owner_id == owner_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor lead not found.")
    return lead


@leads_router.post("/{lead_id}/contacts/verify", response_model=VerifyLeadContactsResponse)
async def verify_selected_lead_contacts(
    lead_id: UUID,
    body: VerifyLeadContactsRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
):
    """Spend Hunter credits only for explicitly selected sourced email contacts."""
    if not settings.configured_hunter:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Hunter email verification is not configured.")

    owner_id = _user_uuid(current_user)
    lead = (
        db.query(SponsorLead)
        .options(selectinload(SponsorLead.contacts).selectinload(LeadContact.verifications))
        .join(ResearchJob, SponsorLead.job_id == ResearchJob.id)
        .filter(SponsorLead.id == lead_id, ResearchJob.owner_id == owner_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor lead not found.")

    requested_ids = set(body.contact_ids)
    contacts = [contact for contact in lead.contacts if contact.id in requested_ids]
    if len(contacts) != len(requested_ids):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Every selected contact must belong to this sponsor lead.")
    if any(contact.kind != "email" for contact in contacts):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Hunter verification supports selected email contacts only.")

    hunter_key = settings.hunter_api_key.get_secret_value() if settings.hunter_api_key else ""
    credits_used = 0
    for contact in contacts:
        verification = await verify_email(contact.normalized_value or contact.value, hunter_key)
        if not verification:
            # An unavailable provider response is not a failed mailbox.
            contact.display_status = "could_not_confirm"
            continue
        credits_used += verification.credits_used
        contact.display_status = display_status_for_contact(contact, verification.status)
        db.add(LeadContactVerification(
            contact_id=contact.id,
            provider="hunter",
            provider_status=verification.status,
            provider_result=verification.result,
            credits_used=verification.credits_used,
            verified_at=datetime.now(timezone.utc),
        ))

    if credits_used:
        db.execute(
            update(ResearchJob)
            .where(ResearchJob.id == lead.job_id)
            .values(hunter_credits_used=ResearchJob.hunter_credits_used + credits_used)
        )
    db.commit()
    for contact in contacts:
        db.refresh(contact)
    return VerifyLeadContactsResponse(contacts=contacts, credits_used=credits_used)
