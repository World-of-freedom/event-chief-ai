"""Fix the shared event-scope trigger for research job inserts.

Revision ID: 20261025_05
Revises: 20261025_04
Create Date: 2026-10-25
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20261025_05"
down_revision: str | Sequence[str] | None = "20261025_04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_VALIDATE_EVENT_SCOPE_FUNCTION = """
CREATE OR REPLACE FUNCTION public.validate_event_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sub_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sub_events s WHERE s.id = NEW.sub_event_id AND s.event_id = NEW.event_id
  ) THEN
    RAISE EXCEPTION 'sub_event_id must belong to event_id';
  END IF;

  -- NEW is a generic trigger record. Only follow_up_tasks has opportunity_id.
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


def upgrade() -> None:
    op.execute(_VALIDATE_EVENT_SCOPE_FUNCTION)


def downgrade() -> None:
    op.execute(_VALIDATE_EVENT_SCOPE_FUNCTION)
