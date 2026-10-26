"""Pydantic schemas for the sponsor discovery research pipeline."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


# ── Request schemas ────────────────────────────────────────────────────────────


class ResearchJobCreate(BaseModel):
    """Input for creating a new sponsor-discovery research job."""

    # Core event identity
    event_name: str = Field(min_length=2, max_length=200)
    event_type: str = Field(min_length=2, max_length=80, description="e.g. hackathon, cultural_fest, tech_conference")
    event_theme: str | None = Field(default=None, max_length=200)
    event_description: str | None = Field(default=None, max_length=2000)

    # Logistics
    venue_city: str = Field(min_length=1, max_length=120)
    venue_state: str | None = Field(default=None, max_length=120)
    venue_name: str | None = Field(default=None, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    event_format: str = Field(default="in_person", pattern="^(in_person|online|hybrid)$")

    # Audience profile
    expected_footfall: int | None = Field(default=None, ge=1, le=10_000_000)
    primary_audience: str | None = Field(default=None, max_length=200)
    audience_age_range: str | None = Field(default=None, max_length=80, description="e.g. 18-25")
    academic_disciplines: str | None = Field(default=None, max_length=500)
    institution_name: str | None = Field(default=None, max_length=200)

    # Sponsorship goals
    budget_target_inr: Decimal | None = Field(default=None, ge=0)
    support_types_needed: list[str] | None = Field(default=None, description="e.g. ['cash', 'cloud_credits', 'food']")
    sponsorship_tiers: str | None = Field(default=None, max_length=1000)
    sponsor_benefits: str | None = Field(default=None, max_length=2000)
    eligibility_constraints: str | None = Field(default=None, max_length=2000)

    # Context
    previous_edition_count: int | None = Field(default=None, ge=0)
    previous_sponsors_hint: str | None = Field(default=None, max_length=1000)
    additional_notes: str | None = Field(default=None, max_length=2000)

    # Optional linkage to a saved event
    event_id: UUID | None = None


# ── Response schemas ───────────────────────────────────────────────────────────


class LeadEvidenceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    evidence_type: str
    claim: str
    source_url: str
    source_title: str | None
    verified_date: date | None
    source_excerpt: str | None = None
    retrieved_at: datetime | None = None
    source_quality: str = "secondary"
    is_llm_inferred: bool
    created_at: datetime


class LeadContactVerificationOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    provider: str
    provider_status: str
    provider_result: dict[str, Any] | None
    credits_used: int
    verified_at: datetime
    created_at: datetime


class LeadContactOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    lead_id: UUID
    kind: str
    value: str
    normalized_value: str | None
    contact_name: str | None
    contact_role: str | None
    source_url: str
    source_title: str | None
    source_excerpt: str | None
    source_quality: str
    basic_check_status: str
    basic_check_results: dict[str, Any] | None
    display_status: str
    is_primary: bool
    retrieved_at: datetime | None = None
    verifications: list[LeadContactVerificationOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class SponsorLeadOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    job_id: UUID

    company_name: str
    domain: str | None
    website_url: str | None
    industry: str | None
    description: str | None
    location: str | None
    distance_km: float | None

    contact_email: str | None
    contact_phone: str | None
    contact_name: str | None
    contact_role: str | None
    linkedin_url: str | None
    twitter_url: str | None
    instagram_url: str | None
    sponsorship_page_url: str | None

    discovery_source: str | None
    source_url: str | None

    score_total: int
    score_relevance: int
    score_industry_fit: int
    score_sponsorship_history: int
    score_geographic_fit: int
    score_budget_compatibility: int
    score_contactability: int
    ranking_explanation: str | None
    confidence: str

    match_score: int = 0
    confidence_score: int = 0
    match_score_components: dict[str, Any] | None = None
    confidence_score_components: dict[str, Any] | None = None
    scoring_version: str = "sponsor-discovery-v2"

    verification_status: str
    website_reachable: bool | None
    verified_at: datetime | None

    evidence: list[LeadEvidenceOut] = Field(default_factory=list)
    contacts: list[LeadContactOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ResearchJobOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    public_id: str
    owner_id: UUID
    event_id: UUID | None

    event_name: str
    event_type: str
    event_theme: str | None
    venue_city: str
    venue_state: str | None
    expected_footfall: int | None
    primary_audience: str | None
    budget_target_inr: Decimal | None
    support_types_needed: list[str] | None
    eligibility_constraints: str | None

    status: str
    progress_message: str | None
    progress_percent: int
    error_message: str | None

    tavily_credits_used: int
    places_api_calls: int
    hunter_credits_used: int
    llm_tokens_used: int
    lead_count: int = 0

    normalized_event_brief: dict[str, Any] | None = None
    search_plan: dict[str, Any] | None = None
    scoring_version: str = "sponsor-discovery-v2"

    created_at: datetime
    updated_at: datetime


class ResearchJobWithLeads(ResearchJobOut):
    leads: list[SponsorLeadOut] = Field(default_factory=list)


class VerifyLeadContactsRequest(BaseModel):
    """Explicit selected email contacts, never an implicit bulk verification."""

    contact_ids: list[UUID] = Field(min_length=1, max_length=10)


class VerifyLeadContactsResponse(BaseModel):
    contacts: list[LeadContactOut]
    credits_used: int
