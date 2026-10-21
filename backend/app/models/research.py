"""ORM models for the sponsor discovery research pipeline.

Tables: research_jobs · sponsor_leads · lead_evidence · lead_outreach
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import (
    EvidenceType,
    LeadVerificationStatus,
    OutreachLeadStatus,
    ResearchJobStatus,
    db_enum,
)


class ResearchJob(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Tracks a single sponsor-discovery research run for an event."""

    __tablename__ = "research_jobs"

    # Owner and event linkage (event_id is optional — jobs can be run without a saved event)
    owner_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Event details snapshot — captured at job creation so the job is self-contained
    event_name: Mapped[str] = mapped_column(String(200), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    event_theme: Mapped[str | None] = mapped_column(String(200), nullable=True)
    event_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    venue_city: Mapped[str] = mapped_column(String(120), nullable=False)
    venue_state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    venue_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    event_format: Mapped[str] = mapped_column(String(40), nullable=False, server_default="in_person")  # in_person | online | hybrid
    expected_footfall: Mapped[int | None] = mapped_column(Integer, nullable=True)
    primary_audience: Mapped[str | None] = mapped_column(String(200), nullable=True)
    audience_age_range: Mapped[str | None] = mapped_column(String(80), nullable=True)
    academic_disciplines: Mapped[str | None] = mapped_column(Text, nullable=True)
    institution_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    budget_target_inr: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    support_types_needed: Mapped[list | None] = mapped_column(JSON, nullable=True)  # ["cash", "cloud_credits", ...]
    sponsorship_tiers: Mapped[str | None] = mapped_column(Text, nullable=True)
    sponsor_benefits: Mapped[str | None] = mapped_column(Text, nullable=True)
    previous_edition_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_sponsors_hint: Mapped[str | None] = mapped_column(Text, nullable=True)
    additional_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Job state
    status: Mapped[ResearchJobStatus] = mapped_column(
        db_enum(ResearchJobStatus, "research_job_status"),
        nullable=False,
        default=ResearchJobStatus.PENDING,
        server_default=ResearchJobStatus.PENDING.value,
    )
    progress_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # API usage tracking
    tavily_credits_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    places_api_calls: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    hunter_credits_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    llm_tokens_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Relationships
    leads: Mapped[list[SponsorLead]] = relationship("SponsorLead", back_populates="job", cascade="all, delete-orphan")


class SponsorLead(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A discovered and ranked sponsor candidate from a research job."""

    __tablename__ = "sponsor_leads"
    __table_args__ = (UniqueConstraint("job_id", "domain", name="uq_sponsor_leads_job_domain"),)

    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("research_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Company identity
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)  # normalised website domain
    website_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    distance_km: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)

    # Contact information (only from verified public sources)
    contact_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_role: Mapped[str | None] = mapped_column(String(200), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    twitter_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    instagram_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    sponsorship_page_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Discovery source
    discovery_source: Mapped[str | None] = mapped_column(String(80), nullable=True)  # tavily | places | manual
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Scores (0–100 per factor; total out of 100)
    score_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    score_relevance: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")       # 25 pts
    score_industry_fit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")    # 20 pts
    score_sponsorship_history: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")  # 20 pts
    score_geographic_fit: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")  # 15 pts
    score_budget_compatibility: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")  # 10 pts
    score_contactability: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")  # 10 pts
    ranking_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[str] = mapped_column(String(20), nullable=False, server_default="low")  # low | medium | high

    # Verification
    verification_status: Mapped[LeadVerificationStatus] = mapped_column(
        db_enum(LeadVerificationStatus, "lead_verification_status"),
        nullable=False,
        default=LeadVerificationStatus.RAW,
        server_default=LeadVerificationStatus.RAW.value,
    )
    website_reachable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    job: Mapped[ResearchJob] = relationship("ResearchJob", back_populates="leads")
    evidence: Mapped[list[LeadEvidence]] = relationship("LeadEvidence", back_populates="lead", cascade="all, delete-orphan")
    outreach: Mapped[list[LeadOutreach]] = relationship("LeadOutreach", back_populates="lead", cascade="all, delete-orphan")


class LeadEvidence(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """A verified piece of evidence supporting a claim about a sponsor lead."""

    __tablename__ = "lead_evidence"

    lead_id: Mapped[UUID] = mapped_column(
        ForeignKey("sponsor_leads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    evidence_type: Mapped[EvidenceType] = mapped_column(
        db_enum(EvidenceType, "lead_evidence_type"),
        nullable=False,
    )
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    verified_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_llm_inferred: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Relationship
    lead: Mapped[SponsorLead] = relationship("SponsorLead", back_populates="evidence")


class LeadOutreach(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Tracks per-lead outreach decisions and pipeline status."""

    __tablename__ = "lead_outreach"

    lead_id: Mapped[UUID] = mapped_column(
        ForeignKey("sponsor_leads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    owner_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("auth.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[OutreachLeadStatus] = mapped_column(
        db_enum(OutreachLeadStatus, "lead_outreach_status"),
        nullable=False,
        default=OutreachLeadStatus.SHORTLISTED,
        server_default=OutreachLeadStatus.SHORTLISTED.value,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationship
    lead: Mapped[SponsorLead] = relationship("SponsorLead", back_populates="outreach")
