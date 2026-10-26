"""Make sponsor discovery evidence-first and verification-on-demand.

Revision ID: 20261026_07
Revises: 20261025_06
Create Date: 2026-10-26
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261026_07"
down_revision: str | Sequence[str] | None = "20261025_06"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _id() -> sa.Column:
    return sa.Column("id", sa.Uuid(), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()"))


def _created_at() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())"))


def _updated_at() -> sa.Column:
    return sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())"))


def _create_updated_at_trigger(table_name: str) -> None:
    op.execute(
        f"CREATE TRIGGER trg_{table_name}_updated_at BEFORE UPDATE ON public.{table_name} "
        "FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"
    )


def upgrade() -> None:
    # Persist the event analysis and planned queries that drove each run.
    op.add_column("research_jobs", sa.Column("normalized_event_brief", sa.JSON(), nullable=True))
    op.add_column("research_jobs", sa.Column("search_plan", sa.JSON(), nullable=True))
    op.add_column("research_jobs", sa.Column("eligibility_constraints", sa.Text(), nullable=True))
    op.add_column(
        "research_jobs",
        sa.Column("scoring_version", sa.String(80), nullable=False, server_default="sponsor-discovery-v2"),
    )

    # Keep legacy score fields for old research runs and imports while adding
    # explicit fit and confidence scores for the evidence-first workflow.
    op.add_column("sponsor_leads", sa.Column("match_score", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("sponsor_leads", sa.Column("confidence_score", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("sponsor_leads", sa.Column("match_score_components", sa.JSON(), nullable=True))
    op.add_column("sponsor_leads", sa.Column("confidence_score_components", sa.JSON(), nullable=True))
    op.add_column(
        "sponsor_leads",
        sa.Column("scoring_version", sa.String(80), nullable=False, server_default="sponsor-discovery-v2"),
    )
    op.execute("UPDATE public.sponsor_leads SET match_score = score_total, confidence_score = CASE confidence WHEN 'high' THEN 75 WHEN 'medium' THEN 50 ELSE 25 END")

    op.add_column("lead_evidence", sa.Column("source_excerpt", sa.Text(), nullable=True))
    op.add_column("lead_evidence", sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("lead_evidence", sa.Column("source_quality", sa.String(20), nullable=False, server_default="secondary"))
    op.execute("UPDATE public.lead_evidence SET retrieved_at = COALESCE(created_at, timezone('utc', now()))")

    # This cache is owner-scoped and contains only cited public company facts.
    # It avoids repeat targeted searches while event-specific scores remain on
    # individual sponsor leads and are recalculated every run.
    op.create_table(
        "company_research_cache",
        _id(),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("auth.users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canonical_domain", sa.String(255), nullable=False),
        sa.Column("research_snapshot", sa.JSON(), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        _created_at(),
        _updated_at(),
        sa.UniqueConstraint("owner_id", "canonical_domain", name="uq_company_research_cache_owner_domain"),
    )
    op.create_index("ix_company_research_cache_owner_id", "company_research_cache", ["owner_id"])
    op.create_index("ix_company_research_cache_canonical_domain", "company_research_cache", ["canonical_domain"])
    _create_updated_at_trigger("company_research_cache")
    op.execute("ALTER TABLE public.company_research_cache ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.company_research_cache FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_research_cache TO authenticated")
    op.execute(
        "CREATE POLICY company_research_cache_all ON public.company_research_cache TO authenticated "
        "USING ((select auth.uid()) = owner_id) WITH CHECK ((select auth.uid()) = owner_id)"
    )

    op.create_table(
        "lead_contacts",
        _id(),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("sponsor_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("normalized_value", sa.Text(), nullable=True),
        sa.Column("contact_name", sa.String(200), nullable=True),
        sa.Column("contact_role", sa.String(200), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_title", sa.String(500), nullable=True),
        sa.Column("source_excerpt", sa.Text(), nullable=True),
        sa.Column("source_quality", sa.String(20), nullable=False, server_default="secondary"),
        sa.Column("basic_check_status", sa.String(30), nullable=False, server_default="not_checked"),
        sa.Column("basic_check_results", sa.JSON(), nullable=True),
        sa.Column("display_status", sa.String(80), nullable=False, server_default="needs_review"),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint("kind IN ('email', 'phone', 'contact_form')", name="ck_lead_contacts_kind"),
    )
    op.create_index("ix_lead_contacts_lead_id", "lead_contacts", ["lead_id"])
    _create_updated_at_trigger("lead_contacts")
    op.execute("ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.lead_contacts FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_contacts TO authenticated")
    op.execute(
        "CREATE POLICY lead_contacts_all ON public.lead_contacts TO authenticated "
        "USING (EXISTS (SELECT 1 FROM public.sponsor_leads sl "
        "JOIN public.research_jobs rj ON rj.id = sl.job_id "
        "WHERE sl.id = lead_contacts.lead_id AND rj.owner_id = (select auth.uid()))) "
        "WITH CHECK (EXISTS (SELECT 1 FROM public.sponsor_leads sl "
        "JOIN public.research_jobs rj ON rj.id = sl.job_id "
        "WHERE sl.id = lead_contacts.lead_id AND rj.owner_id = (select auth.uid())))"
    )
    # Preserve prior sourced lead fields as reviewable contact records when a
    # usable source URL exists. They deliberately remain "needs review": old
    # rows lack the exact contact excerpt required by the new workflow.
    op.execute(
        "INSERT INTO public.lead_contacts "
        "(lead_id, kind, value, normalized_value, contact_name, contact_role, source_url, source_quality, basic_check_status, display_status, is_primary) "
        "SELECT id, 'email', contact_email, contact_email, contact_name, contact_role, "
        "COALESCE(sponsorship_page_url, source_url, website_url), 'secondary', 'not_checked', 'needs_review', true "
        "FROM public.sponsor_leads "
        "WHERE contact_email IS NOT NULL AND COALESCE(sponsorship_page_url, source_url, website_url) IS NOT NULL"
    )
    op.execute(
        "INSERT INTO public.lead_contacts "
        "(lead_id, kind, value, normalized_value, contact_name, contact_role, source_url, source_quality, basic_check_status, display_status, is_primary) "
        "SELECT id, 'phone', contact_phone, contact_phone, contact_name, contact_role, "
        "COALESCE(sponsorship_page_url, source_url, website_url), 'secondary', 'not_checked', 'needs_review', contact_email IS NULL "
        "FROM public.sponsor_leads "
        "WHERE contact_phone IS NOT NULL AND COALESCE(sponsorship_page_url, source_url, website_url) IS NOT NULL"
    )

    op.create_table(
        "lead_contact_verifications",
        _id(),
        sa.Column("contact_id", sa.Uuid(), sa.ForeignKey("lead_contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(80), nullable=False),
        sa.Column("provider_status", sa.String(80), nullable=False),
        sa.Column("provider_result", sa.JSON(), nullable=True),
        sa.Column("credits_used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        _created_at(),
    )
    op.create_index("ix_lead_contact_verifications_contact_id", "lead_contact_verifications", ["contact_id"])
    op.execute("ALTER TABLE public.lead_contact_verifications ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.lead_contact_verifications FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_contact_verifications TO authenticated")
    op.execute(
        "CREATE POLICY lead_contact_verifications_all ON public.lead_contact_verifications TO authenticated "
        "USING (EXISTS (SELECT 1 FROM public.lead_contacts lc "
        "JOIN public.sponsor_leads sl ON sl.id = lc.lead_id "
        "JOIN public.research_jobs rj ON rj.id = sl.job_id "
        "WHERE lc.id = lead_contact_verifications.contact_id AND rj.owner_id = (select auth.uid()))) "
        "WITH CHECK (EXISTS (SELECT 1 FROM public.lead_contacts lc "
        "JOIN public.sponsor_leads sl ON sl.id = lc.lead_id "
        "JOIN public.research_jobs rj ON rj.id = sl.job_id "
        "WHERE lc.id = lead_contact_verifications.contact_id AND rj.owner_id = (select auth.uid())))"
    )


def downgrade() -> None:
    op.drop_table("lead_contact_verifications")
    op.execute("DROP TRIGGER IF EXISTS trg_lead_contacts_updated_at ON public.lead_contacts")
    op.drop_table("lead_contacts")
    op.execute("DROP TRIGGER IF EXISTS trg_company_research_cache_updated_at ON public.company_research_cache")
    op.drop_table("company_research_cache")
    op.drop_column("lead_evidence", "source_quality")
    op.drop_column("lead_evidence", "retrieved_at")
    op.drop_column("lead_evidence", "source_excerpt")
    op.drop_column("sponsor_leads", "scoring_version")
    op.drop_column("sponsor_leads", "confidence_score_components")
    op.drop_column("sponsor_leads", "match_score_components")
    op.drop_column("sponsor_leads", "confidence_score")
    op.drop_column("sponsor_leads", "match_score")
    op.drop_column("research_jobs", "scoring_version")
    op.drop_column("research_jobs", "search_plan")
    op.drop_column("research_jobs", "normalized_event_brief")
    op.drop_column("research_jobs", "eligibility_constraints")
