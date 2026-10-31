"""Add the Postgres-backed Bolna call worker queue fields.

Revision ID: 20261031_10
Revises: 20261028_09
Create Date: 2026-10-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261031_10"
down_revision: str | Sequence[str] | None = "20261028_09"
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


def upgrade() -> None:
    # `call_status` is a non-native enum (a varchar/check constraint), so extend
    # its allowed values before the worker begins writing the new lifecycle states.
    op.execute("ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS ck_calls_call_status")
    op.execute("ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS call_status")
    op.create_check_constraint(
        "call_status",
        "calls",
        "status IN ('queued', 'processing', 'initiated', 'in_progress', 'retry_scheduled', 'completed', 'failed', 'no_answer', 'blocked', 'submission_unknown', 'cancelled')",
    )
    op.add_column("calls", sa.Column("recipient_phone", sa.String(length=32)))
    op.add_column("calls", sa.Column("instructions", sa.Text()))
    op.add_column("calls", sa.Column("context_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.add_column("calls", sa.Column("next_attempt_at", sa.DateTime(timezone=True)))
    op.add_column("calls", sa.Column("lease_expires_at", sa.DateTime(timezone=True)))
    op.add_column("calls", sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("calls", sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"))
    op.add_column("calls", sa.Column("last_error", sa.Text()))
    op.add_column("calls", sa.Column("cancelled_at", sa.DateTime(timezone=True)))
    op.create_index("ix_calls_status_next_attempt_at", "calls", ["status", "next_attempt_at"])
    op.create_index("ix_calls_lease_expires_at", "calls", ["lease_expires_at"])

    op.create_table(
        "call_attempts",
        _id(),
        sa.Column("call_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            _enum("claimed", "submitting", "submitted", "in_progress", "completed", "failed", "submission_unknown", name="call_attempt_status"),
            nullable=False,
            server_default="claimed",
        ),
        sa.Column("bolna_call_id", sa.String(length=255)),
        sa.Column("request_token", sa.String(length=255), nullable=False),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text()),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("call_id", "attempt_number", name="call_attempts_call_attempt_number"),
        sa.UniqueConstraint("bolna_call_id", name="call_attempts_bolna_call_id"),
        sa.UniqueConstraint("request_token", name="call_attempts_request_token"),
    )
    op.create_index("ix_call_attempts_call_id", "call_attempts", ["call_id"])

    op.create_table(
        "voice_call_preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("calling_window_start", sa.Time(), nullable=False, server_default="09:00:00"),
        sa.Column("calling_window_end", sa.Time(), nullable=False, server_default="22:00:00"),
        sa.Column("allowed_weekdays", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[1,2,3,4,5,6,7]'::jsonb")),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="Asia/Kolkata"),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(["user_id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.execute(
        "CREATE TRIGGER trg_call_attempts_updated_at BEFORE UPDATE ON public.call_attempts "
        "FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"
    )
    op.execute(
        "CREATE TRIGGER trg_voice_call_preferences_updated_at BEFORE UPDATE ON public.voice_call_preferences "
        "FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()"
    )

    op.execute("ALTER TABLE public.call_attempts ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.call_attempts FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_attempts TO authenticated")
    op.execute(
        "CREATE POLICY call_attempts_all ON public.call_attempts TO authenticated "
        "USING (EXISTS (SELECT 1 FROM public.calls c JOIN public.opportunities o ON o.id = c.opportunity_id "
        "JOIN public.events e ON e.id = o.event_id WHERE c.id = call_id AND e.owner_id = (select auth.uid()))) "
        "WITH CHECK (EXISTS (SELECT 1 FROM public.calls c JOIN public.opportunities o ON o.id = c.opportunity_id "
        "JOIN public.events e ON e.id = o.event_id WHERE c.id = call_id AND e.owner_id = (select auth.uid())))"
    )
    op.execute("ALTER TABLE public.voice_call_preferences ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.voice_call_preferences FROM anon")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_call_preferences TO authenticated")
    op.execute(
        "CREATE POLICY voice_call_preferences_all ON public.voice_call_preferences TO authenticated "
        "USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))"
    )


def downgrade() -> None:
    op.drop_table("voice_call_preferences")
    op.drop_table("call_attempts")
    op.drop_index("ix_calls_lease_expires_at", table_name="calls")
    op.drop_index("ix_calls_status_next_attempt_at", table_name="calls")
    for column in (
        "cancelled_at", "last_error", "max_attempts", "attempt_count", "lease_expires_at",
        "next_attempt_at", "context_snapshot", "instructions", "recipient_phone",
    ):
        op.drop_column("calls", column)
    op.execute("ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS ck_calls_call_status")
    op.create_check_constraint(
        "call_status",
        "calls",
        "status IN ('queued', 'initiated', 'in_progress', 'completed', 'failed', 'no_answer')",
    )
