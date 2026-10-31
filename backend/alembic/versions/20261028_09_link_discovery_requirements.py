"""Link sponsor discovery runs to the event requirements they research.

Revision ID: 20261028_09
Revises: 20261026_08
Create Date: 2026-10-28
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261028_09"
down_revision: str | Sequence[str] | None = "20261026_08"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "research_job_resource_needs",
        sa.Column("research_job_id", sa.Uuid(), sa.ForeignKey("research_jobs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("resource_need_id", sa.Uuid(), sa.ForeignKey("resource_needs.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_research_job_resource_needs_resource_need_id", "research_job_resource_needs", ["resource_need_id"])

    # The association is server-managed today, but it remains safe if a
    # browser-facing endpoint is added later: both linked records must belong
    # to the current organizer and the requirement must be for the job's event.
    op.execute("ALTER TABLE public.research_job_resource_needs ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.research_job_resource_needs FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_job_resource_needs TO authenticated")
    op.execute(
        "CREATE POLICY research_job_resource_needs_all ON public.research_job_resource_needs TO authenticated "
        "USING (EXISTS (SELECT 1 FROM public.research_jobs rj JOIN public.resource_needs rn ON rn.id = resource_need_id "
        "WHERE rj.id = research_job_id AND rj.owner_id = (select auth.uid()) AND rn.event_id = rj.event_id)) "
        "WITH CHECK (EXISTS (SELECT 1 FROM public.research_jobs rj JOIN public.resource_needs rn ON rn.id = resource_need_id "
        "WHERE rj.id = research_job_id AND rj.owner_id = (select auth.uid()) AND rn.event_id = rj.event_id))"
    )


def downgrade() -> None:
    op.drop_table("research_job_resource_needs")
