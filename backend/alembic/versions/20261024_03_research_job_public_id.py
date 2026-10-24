"""Add a short public_id (Nano ID style) to research_jobs for frontend URLs.

Revision ID: 20261024_03
Revises: 20261020_02
Create Date: 2026-10-24
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

from app.core.ids import PUBLIC_ID_LENGTH, generate_public_id


revision: str = "20261024_03"
down_revision: str | Sequence[str] | None = "20261020_02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("research_jobs", sa.Column("public_id", sa.String(PUBLIC_ID_LENGTH), nullable=True))

    # Give every existing job an ID before the column becomes required.
    conn = op.get_bind()
    job_ids = conn.execute(sa.text("SELECT id FROM public.research_jobs WHERE public_id IS NULL")).scalars().all()
    used: set[str] = set()
    for job_id in job_ids:
        public_id = generate_public_id()
        while public_id in used:
            public_id = generate_public_id()
        used.add(public_id)
        conn.execute(
            sa.text("UPDATE public.research_jobs SET public_id = :public_id WHERE id = :id"),
            {"public_id": public_id, "id": job_id},
        )

    op.alter_column("research_jobs", "public_id", nullable=False)
    op.create_index("ix_research_jobs_public_id", "research_jobs", ["public_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_research_jobs_public_id", table_name="research_jobs")
    op.drop_column("research_jobs", "public_id")
