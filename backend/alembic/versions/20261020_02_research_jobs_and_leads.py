"""Add research_jobs, sponsor_leads, lead_evidence and lead_outreach tables.

Revision ID: 20261020_02
Revises: 20261020_01
Create Date: 2026-10-20
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261020_02"
down_revision: str | Sequence[str] | None = "20261020_01"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _id() -> sa.Column:
    return sa.Column("id", sa.Uuid(), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()"))


def _created_at() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())"))


def _updated_at() -> sa.Column:
    return sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())"))


def _enum(*values: str, name: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True)


def _create_updated_at_trigger(table_name: str) -> None:
    op.execute(
        f"CREATE TRIGGER trg_{table_name}_updated_at BEFORE UPDATE ON public.{table_name} "
        "FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"
    )


def upgrade() -> None:
    # ── research_jobs ──────────────────────────────────────────────────────
    op.create_table(
        "research_jobs",
        _id(),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("auth.users(id)", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", sa.Uuid(), sa.ForeignKey("events.id", ondelete="SET NULL"), nullable=True),

        # Event snapshot
        sa.Column("event_name", sa.String(200), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("event_theme", sa.String(200), nullable=True),
        sa.Column("event_description", sa.Text(), nullable=True),
        sa.Column("venue_city", sa.String(120), nullable=False),
        sa.Column("venue_state", sa.String(120), nullable=True),
        sa.Column("venue_name", sa.String(200), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("event_format", sa.String(40), nullable=False, server_default="in_person"),
        sa.Column("expected_footfall", sa.Integer(), nullable=True),
        sa.Column("primary_audience", sa.String(200), nullable=True),
        sa.Column("audience_age_range", sa.String(80), nullable=True),
        sa.Column("academic_disciplines", sa.Text(), nullable=True),
        sa.Column("institution_name", sa.String(200), nullable=True),
        sa.Column("budget_target_inr", sa.Numeric(14, 2), nullable=True),
        sa.Column("support_types_needed", sa.JSON(), nullable=True),
        sa.Column("sponsorship_tiers", sa.Text(), nullable=True),
        sa.Column("sponsor_benefits", sa.Text(), nullable=True),
        sa.Column("previous_edition_count", sa.Integer(), nullable=True),
        sa.Column("previous_sponsors_hint", sa.Text(), nullable=True),
        sa.Column("additional_notes", sa.Text(), nullable=True),

        # Job state
        sa.Column("status", _enum("pending", "running", "completed", "failed", "cancelled", name="research_job_status"),
                  nullable=False, server_default="pending"),
        sa.Column("progress_message", sa.Text(), nullable=True),
        sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),

        # API usage
        sa.Column("tavily_credits_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("places_api_calls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hunter_credits_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("llm_tokens_used", sa.Integer(), nullable=False, server_default="0"),

        _created_at(),
        _updated_at(),
    )
    op.create_index("ix_research_jobs_owner_id", "research_jobs", ["owner_id"])
    op.create_index("ix_research_jobs_event_id", "research_jobs", ["event_id"])
    _create_updated_at_trigger("research_jobs")

    # RLS
    op.execute("ALTER TABLE public.research_jobs ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.research_jobs FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_jobs TO authenticated")
    op.execute(
        "CREATE POLICY research_jobs_all ON public.research_jobs "
        "TO authenticated USING ((select auth.uid()) = owner_id) WITH CHECK ((select auth.uid()) = owner_id)"
    )

    # ── sponsor_leads ──────────────────────────────────────────────────────
    op.create_table(
        "sponsor_leads",
        _id(),
        sa.Column("job_id", sa.Uuid(), sa.ForeignKey("research_jobs.id", ondelete="CASCADE"), nullable=False),

        sa.Column("company_name", sa.String(200), nullable=False),
        sa.Column("domain", sa.String(255), nullable=True),
        sa.Column("website_url", sa.Text(), nullable=True),
        sa.Column("industry", sa.String(120), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("latitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("longitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("distance_km", sa.Numeric(8, 2), nullable=True),

        sa.Column("contact_email", sa.String(320), nullable=True),
        sa.Column("contact_phone", sa.String(32), nullable=True),
        sa.Column("contact_name", sa.String(200), nullable=True),
        sa.Column("contact_role", sa.String(200), nullable=True),
        sa.Column("linkedin_url", sa.Text(), nullable=True),
        sa.Column("twitter_url", sa.Text(), nullable=True),
        sa.Column("instagram_url", sa.Text(), nullable=True),
        sa.Column("sponsorship_page_url", sa.Text(), nullable=True),

        sa.Column("discovery_source", sa.String(80), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),

        sa.Column("score_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score_relevance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score_industry_fit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score_sponsorship_history", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score_geographic_fit", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score_budget_compatibility", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("score_contactability", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ranking_explanation", sa.Text(), nullable=True),
        sa.Column("confidence", sa.String(20), nullable=False, server_default="low"),

        sa.Column("verification_status", _enum("raw", "verified", "rejected", name="lead_verification_status"),
                  nullable=False, server_default="raw"),
        sa.Column("website_reachable", sa.Boolean(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),

        _created_at(),
        _updated_at(),
        sa.UniqueConstraint("job_id", "domain", name="uq_sponsor_leads_job_domain"),
    )
    op.create_index("ix_sponsor_leads_job_id", "sponsor_leads", ["job_id"])
    _create_updated_at_trigger("sponsor_leads")

    # RLS via join to research_jobs (which is owner-scoped)
    op.execute("ALTER TABLE public.sponsor_leads ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.sponsor_leads FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.sponsor_leads TO authenticated")
    op.execute(
        "CREATE POLICY sponsor_leads_all ON public.sponsor_leads TO authenticated "
        "USING (EXISTS (SELECT 1 FROM public.research_jobs rj "
        "WHERE rj.id = sponsor_leads.job_id AND rj.owner_id = (select auth.uid())))"
    )

    # ── lead_evidence ──────────────────────────────────────────────────────
    op.create_table(
        "lead_evidence",
        _id(),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("sponsor_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("evidence_type", _enum(
            "sponsorship_history", "brand_partnership", "local_presence",
            "audience_alignment", "contact_page", "social_media", "news_mention", "other",
            name="lead_evidence_type",
        ), nullable=False),
        sa.Column("claim", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_title", sa.String(500), nullable=True),
        sa.Column("verified_date", sa.Date(), nullable=True),
        sa.Column("is_llm_inferred", sa.Boolean(), nullable=False, server_default="false"),
        _created_at(),
    )
    op.create_index("ix_lead_evidence_lead_id", "lead_evidence", ["lead_id"])
    op.execute("ALTER TABLE public.lead_evidence ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.lead_evidence FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_evidence TO authenticated")
    op.execute(
        "CREATE POLICY lead_evidence_all ON public.lead_evidence TO authenticated "
        "USING (EXISTS ("
        "SELECT 1 FROM public.sponsor_leads sl "
        "JOIN public.research_jobs rj ON rj.id = sl.job_id "
        "WHERE sl.id = lead_evidence.lead_id AND rj.owner_id = (select auth.uid())"
        "))"
    )

    # ── lead_outreach ──────────────────────────────────────────────────────
    op.create_table(
        "lead_outreach",
        _id(),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("sponsor_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("auth.users(id)", ondelete="CASCADE"), nullable=False),
        sa.Column("status", _enum("shortlisted", "contacted", "responded", "rejected", "converted",
                                  name="lead_outreach_status"), nullable=False, server_default="shortlisted"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("contacted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        _updated_at(),
    )
    op.create_index("ix_lead_outreach_lead_id", "lead_outreach", ["lead_id"])
    op.create_index("ix_lead_outreach_owner_id", "lead_outreach", ["owner_id"])
    _create_updated_at_trigger("lead_outreach")
    op.execute("ALTER TABLE public.lead_outreach ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.lead_outreach FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_outreach TO authenticated")
    op.execute(
        "CREATE POLICY lead_outreach_all ON public.lead_outreach "
        "TO authenticated USING ((select auth.uid()) = owner_id) WITH CHECK ((select auth.uid()) = owner_id)"
    )


def downgrade() -> None:
    # Drop triggers first
    for tbl in ("lead_outreach", "sponsor_leads", "research_jobs"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{tbl}_updated_at ON public.{tbl}")

    op.drop_table("lead_outreach")
    op.drop_table("lead_evidence")
    op.drop_table("sponsor_leads")
    op.drop_table("research_jobs")

    # Drop enums
    for name in ("lead_outreach_status", "lead_evidence_type", "lead_verification_status", "research_job_status"):
        op.execute(f"DROP TYPE IF EXISTS {name}")
