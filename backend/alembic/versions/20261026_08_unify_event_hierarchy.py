"""Represent nested events as full self-linked event records.

Revision ID: 20261026_08
Revises: 20261026_07
Create Date: 2026-10-26
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261026_08"
down_revision: str | Sequence[str] | None = "20261026_07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Full event records can now be linked recursively.  The boolean makes
    # intent clear in read models while the parent foreign key is authoritative.
    op.add_column("events", sa.Column("organizer_phone", sa.String(length=32), nullable=True))
    op.add_column("events", sa.Column("parent_event_id", sa.Uuid(), nullable=True))
    op.add_column("events", sa.Column("is_subevent", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.create_foreign_key("fk_events_parent_event_id_events", "events", "events", ["parent_event_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_events_parent_event_id", "events", ["parent_event_id"])

    # Preserve every legacy child as a complete event. Reusing its UUID lets
    # scoped requirements, research, opportunities and tasks be remapped
    # without losing their links.
    op.execute(
        """
        INSERT INTO public.events (
          id, owner_id, name, event_type, institution, description,
          start_date, end_date, location, is_online, expected_attendees,
          target_audience, website_url, organizer_name, organizer_email,
          organizer_phone, parent_event_id, is_subevent, created_at, updated_at
        )
        SELECT
          s.id, e.owner_id, s.name, e.event_type, e.institution, s.description,
          COALESCE(s.start_at::date, e.start_date),
          CASE WHEN s.end_at IS NOT NULL THEN s.end_at::date ELSE e.end_date END,
          COALESCE(s.location, e.location), e.is_online, e.expected_attendees,
          e.target_audience, e.website_url, e.organizer_name, e.organizer_email,
          NULL, s.event_id, true, s.created_at, s.updated_at
        FROM public.sub_events s
        JOIN public.events e ON e.id = s.event_id
        """
    )

    # The old trigger validates a separate sub_events table, so remove it
    # before remapping the obsolete scope columns.
    for table in ("resource_needs", "opportunities", "research_jobs", "follow_up_tasks"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_validate_event_scope ON public.{table}")

    # Move all former child-scoped work onto the newly-created child event.
    for table in ("resource_needs", "opportunities", "research_jobs", "follow_up_tasks"):
        op.execute(f"UPDATE public.{table} SET event_id = sub_event_id WHERE sub_event_id IS NOT NULL")

    for table in ("resource_needs", "opportunities", "research_jobs", "follow_up_tasks"):
        op.drop_constraint(f"fk_{table}_sub_event_id_sub_events", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_sub_event_id", table_name=table)
        op.drop_column(table, "sub_event_id")
    op.execute("DROP FUNCTION IF EXISTS public.validate_event_scope()")

    # Legacy scope indexes allowed a prospect once for the parent and once for
    # each child. Each child now has its own event id, so one normal unique
    # constraint accurately captures that same rule.
    op.execute("DROP INDEX IF EXISTS public.uq_opportunities_event_prospect_root")
    op.execute("DROP INDEX IF EXISTS public.uq_opportunities_event_sub_event_prospect")
    op.create_unique_constraint("opportunities_event_prospect", "opportunities", ["event_id", "prospect_id"])

    op.execute("DROP TRIGGER IF EXISTS trg_sub_events_updated_at ON public.sub_events")
    op.drop_table("sub_events")

    # Category-specific fields live as structured metadata while existing
    # amount/quantity columns remain reportable and offer-compatible.
    op.add_column(
        "resource_needs",
        sa.Column(
            "details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    # A hierarchy can be arbitrarily deep after this revision, whereas the old
    # schema allowed only one level. A lossy automatic downgrade would silently
    # delete or detach user records, so it is deliberately refused.
    raise RuntimeError("20261026_08 cannot be downgraded safely after nested events are created")
