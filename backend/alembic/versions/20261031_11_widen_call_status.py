"""Widen calls.status so the newer call statuses fit.

Migration 20261031_10 added 'retry_scheduled' (15 chars) and 'submission_unknown'
(18 chars) to the allowed values, but the column was still VARCHAR(11) from the
initial schema, so writing those statuses failed with "value too long".

Revision ID: 20261031_11
Revises: 20261031_10
Create Date: 2026-10-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261031_11"
down_revision: str | Sequence[str] | None = "20261031_10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Widening a varchar is metadata-only in Postgres; the check constraint is kept.
    op.alter_column("calls", "status", type_=sa.String(length=18), existing_type=sa.String(length=11), existing_nullable=False)


def downgrade() -> None:
    # Fails (safely) if any call still has a status longer than 11 characters.
    op.alter_column("calls", "status", type_=sa.String(length=11), existing_type=sa.String(length=18), existing_nullable=False)
