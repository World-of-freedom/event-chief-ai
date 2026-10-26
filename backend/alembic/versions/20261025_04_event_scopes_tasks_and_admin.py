"""Add sub-event scopes, event-level tasks, and server-managed admin grants.

Revision ID: 20261025_04
Revises: 20261024_03
Create Date: 2026-10-25

All changes are additive or backfilled. Existing event-level records retain their
current meaning; task event ids are derived from their existing opportunities.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261025_04"
down_revision: str | Sequence[str] | None = "20261024_03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _id() -> sa.Column:
    return sa.Column("id", sa.Uuid(), primary_key=True, nullable=False, server_default=sa.text("gen_random_uuid()"))


def _created_at() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())"))


def _updated_at() -> sa.Column:
    return sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())"))


def _ownership_policies(table_name: str, check: str) -> None:
    auth_check = check.replace("auth.uid()", "(select auth.uid())")
    op.execute(f"CREATE POLICY {table_name}_select ON public.{table_name} FOR SELECT TO authenticated USING ({auth_check})")
    op.execute(f"CREATE POLICY {table_name}_insert ON public.{table_name} FOR INSERT TO authenticated WITH CHECK ({auth_check})")
    op.execute(f"CREATE POLICY {table_name}_update ON public.{table_name} FOR UPDATE TO authenticated USING ({auth_check}) WITH CHECK ({auth_check})")
    op.execute(f"CREATE POLICY {table_name}_delete ON public.{table_name} FOR DELETE TO authenticated USING ({auth_check})")


def upgrade() -> None:
    op.create_table(
        "sub_events",
        _id(),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("start_at", sa.DateTime(timezone=True)),
        sa.Column("end_at", sa.DateTime(timezone=True)),
        sa.Column("location", sa.String(length=200)),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint("end_at is null or start_at is null or end_at >= start_at", name="sub_events_valid_date_range"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_sub_events_event_id", "sub_events", ["event_id"])
    op.execute(
        "CREATE TRIGGER trg_sub_events_updated_at BEFORE UPDATE ON public.sub_events "
        "FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"
    )
    op.execute("ALTER TABLE public.sub_events ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.sub_events FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_events TO authenticated")
    _ownership_policies("sub_events", "EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid())")

    for table in ("resource_needs", "opportunities", "research_jobs", "follow_up_tasks"):
        op.add_column(table, sa.Column("sub_event_id", sa.Uuid(), nullable=True))
        op.create_foreign_key(f"fk_{table}_sub_event_id_sub_events", table, "sub_events", ["sub_event_id"], ["id"], ondelete="CASCADE" if table != "research_jobs" else "SET NULL")
        op.create_index(f"ix_{table}_sub_event_id", table, ["sub_event_id"])

    # Old tasks were opportunity-only. Derive the parent event before allowing standalone event tasks.
    op.add_column("follow_up_tasks", sa.Column("event_id", sa.Uuid(), nullable=True))
    op.execute(
        "UPDATE public.follow_up_tasks t SET event_id = o.event_id "
        "FROM public.opportunities o WHERE t.opportunity_id = o.id AND t.event_id IS NULL"
    )
    op.alter_column("follow_up_tasks", "event_id", nullable=False)
    op.create_foreign_key("fk_follow_up_tasks_event_id_events", "follow_up_tasks", "events", ["event_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_follow_up_tasks_event_id", "follow_up_tasks", ["event_id"])
    op.alter_column("follow_up_tasks", "opportunity_id", existing_type=sa.Uuid(), nullable=True)

    # One prospect can have one event-level opportunity and one per sub-event.
    op.drop_constraint("opportunities_event_prospect", "opportunities", type_="unique")
    op.execute(
        "CREATE UNIQUE INDEX uq_opportunities_event_prospect_root ON public.opportunities (event_id, prospect_id) "
        "WHERE sub_event_id IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_opportunities_event_sub_event_prospect ON public.opportunities (event_id, sub_event_id, prospect_id) "
        "WHERE sub_event_id IS NOT NULL"
    )

    # Cross-table scope validation keeps child requirements, research, opportunities and tasks in their parent event.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.validate_event_scope()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.sub_event_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.sub_events s WHERE s.id = NEW.sub_event_id AND s.event_id = NEW.event_id
          ) THEN
            RAISE EXCEPTION 'sub_event_id must belong to event_id';
          END IF;
          -- `NEW` is a generic trigger record.  Access task-only fields only
          -- after identifying the task trigger; research_jobs, for example,
          -- has no opportunity_id column.
          IF TG_TABLE_NAME = 'follow_up_tasks' THEN
            IF NEW.opportunity_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM public.opportunities o
              WHERE o.id = NEW.opportunity_id AND o.event_id = NEW.event_id
                AND o.sub_event_id IS NOT DISTINCT FROM NEW.sub_event_id
            ) THEN
              RAISE EXCEPTION 'task scope must match opportunity scope';
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$;
        """
    )
    for table in ("resource_needs", "opportunities", "research_jobs", "follow_up_tasks"):
        op.execute(
            f"CREATE TRIGGER trg_{table}_validate_event_scope BEFORE INSERT OR UPDATE ON public.{table} "
            "FOR EACH ROW EXECUTE FUNCTION public.validate_event_scope()"
        )

    # Follow-ups can now belong directly to an event, so their RLS rule cannot depend on an opportunity join.
    for operation in ("select", "insert", "update", "delete"):
        op.execute(f"DROP POLICY IF EXISTS follow_up_tasks_{operation} ON public.follow_up_tasks")
    _ownership_policies(
        "follow_up_tasks",
        "owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid())",
    )

    op.create_table(
        "platform_admins",
        sa.Column("user_id", sa.Uuid(), primary_key=True, nullable=False),
        sa.Column("granted_by", sa.Uuid()),
        _created_at(),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["granted_by"], ["auth.users.id"], ondelete="SET NULL"),
    )
    op.execute("ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.platform_admins FROM anon, authenticated")


def downgrade() -> None:
    op.drop_table("platform_admins")
    for table in ("resource_needs", "opportunities", "research_jobs", "follow_up_tasks"):
        op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_validate_event_scope ON public.{table}")
    op.execute("DROP FUNCTION IF EXISTS public.validate_event_scope()")
    op.execute("DROP INDEX IF EXISTS public.uq_opportunities_event_sub_event_prospect")
    op.execute("DROP INDEX IF EXISTS public.uq_opportunities_event_prospect_root")
    op.create_unique_constraint("opportunities_event_prospect", "opportunities", ["event_id", "prospect_id"])
    op.drop_constraint("fk_follow_up_tasks_event_id_events", "follow_up_tasks", type_="foreignkey")
    op.drop_index("ix_follow_up_tasks_event_id", table_name="follow_up_tasks")
    op.drop_column("follow_up_tasks", "event_id")
    op.alter_column("follow_up_tasks", "opportunity_id", existing_type=sa.Uuid(), nullable=False)
    for table in ("resource_needs", "opportunities", "research_jobs", "follow_up_tasks"):
        op.drop_index(f"ix_{table}_sub_event_id", table_name=table)
        op.drop_constraint(f"fk_{table}_sub_event_id_sub_events", table, type_="foreignkey")
        op.drop_column(table, "sub_event_id")
    op.execute("DROP TRIGGER IF EXISTS trg_sub_events_updated_at ON public.sub_events")
    op.drop_table("sub_events")
