"""ORM models for evidence-backed sponsor discovery.

Contacts and provider verifications are separate from a lead, so a sourced
contact route is never confused with a verified mailbox or phone line.
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
    Table,
    Text,
    UniqueConstraint,
    Uuid,
    Column,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.ids import PUBLIC_ID_LENGTH, generate_public_id
from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.events import ResourceNeed
from app.models.enums import (
    EvidenceType,
    LeadVerificationStatus,
    OutreachLeadStatus,
    ResearchJobStatus,
    db_enum,
)


# A discovery run can focus on several of an event's resource requirements.
# Keep this as a relation rather than a JSON list so ownership, deletion and
# the detail view all remain consistent with the event requirement workflow.
research_job_resource_needs = Table(
    "research_job_resource_needs",
    Base.metadata,
    Column("research_job_id", ForeignKey("research_jobs.id", ondelete="CASCADE"), primary_key=True),
    Column("resource_need_id", ForeignKey("resource_needs.id", ondelete="CASCADE"), primary_key=True),
)


class ResearchJob(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Tracks a single sponsor-discovery research run for an event."""

    __tablename__ = "research_jobs"

    # Short ID used in frontend URLs (e.g. /discovery/codestorm-2026-x8k2m9q4ab)
    public_id: Mapped[str] = mapped_column(
        String(PUBLIC_ID_LENGTH),
        nullable=False,
        unique=True,
        default=generate_public_id,
    )

    # New jobs are always linked to an event. The column remains nullable only
    # so pre-event-linkage historical runs can continue to be read.
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
    eligibility_constraints: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    # Reproducible run records. The raw event snapshot above is useful for the
    # UI; these JSON documents retain the normalized brief and Call-1 plan.
    normalized_event_brief: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    search_plan: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    scoring_version: Mapped[str] = mapped_column(String(80), nullable=False, server_default="sponsor-discovery-v2")

    # Relationships
    leads: Mapped[list[SponsorLead]] = relationship("SponsorLead", back_populates="job", cascade="all, delete-orphan")
    resource_needs: Mapped[list[ResourceNeed]] = relationship(
        "ResourceNeed",
        secondary=research_job_resource_needs,
        order_by="ResourceNeed.created_at",
    )

    @property
    def lead_count(self) -> int:
        return len(self.leads)


class CompanyResearchCache(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Per-organizer cache of public, cited company research (not event scores)."""

    __tablename__ = "company_research_cache"
    __table_args__ = (UniqueConstraint("owner_id", "canonical_domain", name="uq_company_research_cache_owner_domain"),)

    owner_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonical_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    research_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


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

    # v2 scores preserve the requested distinction between event fit and the
    # reliability of the retained research record.
    match_score: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    confidence_score: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    match_score_components: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    confidence_score_components: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    scoring_version: Mapped[str] = mapped_column(String(80), nullable=False, server_default="sponsor-discovery-v2")

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
    contacts: Mapped[list[LeadContact]] = relationship("LeadContact", back_populates="lead", cascade="all, delete-orphan")
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
    source_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_quality: Mapped[str] = mapped_column(String(20), nullable=False, server_default="secondary")
    is_llm_inferred: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Relationship
    lead: Mapped[SponsorLead] = relationship("SponsorLead", back_populates="evidence")


class LeadContact(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A cited contact value or official contact route for a sponsor lead."""

    __tablename__ = "lead_contacts"

    lead_id: Mapped[UUID] = mapped_column(
        ForeignKey("sponsor_leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)  # email | phone | contact_form
    value: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_role: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_quality: Mapped[str] = mapped_column(String(20), nullable=False, server_default="secondary")
    basic_check_status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="not_checked")
    basic_check_results: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    display_status: Mapped[str] = mapped_column(String(80), nullable=False, server_default="needs_review")
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    lead: Mapped[SponsorLead] = relationship("SponsorLead", back_populates="contacts")
    verifications: Mapped[list[LeadContactVerification]] = relationship(
        "LeadContactVerification", back_populates="contact", cascade="all, delete-orphan"
    )


class LeadContactVerification(Base, UUIDPrimaryKeyMixin, CreatedAtMixin):
    """Immutable provider result for an explicit contact verification request."""

    __tablename__ = "lead_contact_verifications"

    contact_id: Mapped[UUID] = mapped_column(
        ForeignKey("lead_contacts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    provider_status: Mapped[str] = mapped_column(String(80), nullable=False)
    provider_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    credits_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    contact: Mapped[LeadContact] = relationship("LeadContact", back_populates="verifications")


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
