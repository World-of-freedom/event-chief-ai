"""Support the complete set of resource requirement categories.

Revision ID: 20261025_06
Revises: 20261025_05
Create Date: 2026-10-25
"""

from collections.abc import Sequence

from alembic import op


revision: str = "20261025_06"
down_revision: str | Sequence[str] | None = "20261025_05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_PREVIOUS_VALUES = "'cash', 'cloud_credits', 'prizes', 'food', 'merchandise', 'other'"
_VALUES = "'cash', 'cloud_credits', 'equipment', 'speakers', 'mentors', 'venue', 'volunteers', 'prizes', 'food', 'merchandise', 'other'"


def _replace_category_constraints(values: str) -> None:
    # These are named check constraints because resource_category is a
    # SQLAlchemy non-native enum. The same value set is used for needs and offers.
    op.execute("ALTER TABLE public.resource_needs DROP CONSTRAINT IF EXISTS resource_category")
    op.execute(f"ALTER TABLE public.resource_needs ADD CONSTRAINT resource_category CHECK (category IN ({values}))")
    op.execute("ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS resource_category")
    op.execute(f"ALTER TABLE public.offers ADD CONSTRAINT resource_category CHECK (support_type IN ({values}))")


def upgrade() -> None:
    _replace_category_constraints(_VALUES)


def downgrade() -> None:
    op.execute(
        f"""
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM public.resource_needs WHERE category NOT IN ({_PREVIOUS_VALUES})
            UNION ALL
            SELECT 1 FROM public.offers WHERE support_type NOT IN ({_PREVIOUS_VALUES})
          ) THEN
            RAISE EXCEPTION 'Cannot downgrade while expanded resource categories are in use';
          END IF;
        END $$;
        """
    )
    _replace_category_constraints(_PREVIOUS_VALUES)
