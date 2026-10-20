"""Create the initial Event Chief sponsorship schema.

Revision ID: 20261020_01
Revises: None
Create Date: 2026-10-20

This revision is intentionally applied only through Alembic. It creates no data.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20261020_01"
down_revision: str | Sequence[str] | None = None
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


def _create_authenticated_ownership_policies(table_name: str, ownership_check: str) -> None:
    """Create operation-specific RLS policies for a table owned by the signed-in user."""
    auth_check = ownership_check.replace("auth.uid()", "(select auth.uid())")
    op.execute(
        f"CREATE POLICY {table_name}_select ON public.{table_name} "
        f"FOR SELECT TO authenticated USING ({auth_check})"
    )
    op.execute(
        f"CREATE POLICY {table_name}_insert ON public.{table_name} "
        f"FOR INSERT TO authenticated WITH CHECK ({auth_check})"
    )
    op.execute(
        f"CREATE POLICY {table_name}_update ON public.{table_name} "
        f"FOR UPDATE TO authenticated USING ({auth_check}) WITH CHECK ({auth_check})"
    )
    op.execute(
        f"CREATE POLICY {table_name}_delete ON public.{table_name} "
        f"FOR DELETE TO authenticated USING ({auth_check})"
    )


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.set_updated_at()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          NEW.updated_at = timezone('utc', now());
          RETURN NEW;
        END;
        $$
        """
    )

    resource_category = ("cash", "cloud_credits", "prizes", "food", "merchandise", "other")
    opportunity_status = (
        "prospect_found", "outreach_approved", "contact_attempted", "interested",
        "proposal_requested", "proposal_sent", "offer_received", "accepted", "fulfilled",
        "not_interested", "opted_out",
    )

    op.create_table(
        "events",
        _id(),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("institution", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date()),
        sa.Column("location", sa.String(length=200)),
        sa.Column("is_online", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("expected_attendees", sa.Integer()),
        sa.Column("target_audience", sa.Text()),
        sa.Column("website_url", sa.Text()),
        sa.Column("organizer_name", sa.String(length=160)),
        sa.Column("organizer_email", sa.String(length=320)),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint("end_date is null or end_date >= start_date", name="events_valid_date_range"),
        sa.ForeignKeyConstraint(["owner_id"], ["auth.users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_events_owner_id", "events", ["owner_id"])

    op.create_table(
        "resource_needs",
        _id(),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("category", _enum(*resource_category, name="resource_category"), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("target_amount", sa.Numeric(precision=12, scale=2)),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("target_quantity", sa.Integer()),
        sa.Column("deadline", sa.Date()),
        sa.Column("priority", _enum("low", "medium", "high", name="need_priority"), nullable=False, server_default="medium"),
        sa.Column("status", _enum("open", "in_progress", "partially_covered", "covered", name="resource_need_status"), nullable=False, server_default="open"),
        sa.Column("notes", sa.Text()),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint("target_amount is null or target_amount >= 0", name="resource_needs_nonnegative_amount"),
        sa.CheckConstraint("target_quantity is null or target_quantity >= 0", name="resource_needs_nonnegative_quantity"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_resource_needs_event_id", "resource_needs", ["event_id"])

    op.create_table(
        "prospects",
        _id(),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("company_name", sa.String(length=180), nullable=False),
        sa.Column("website_url", sa.Text()),
        sa.Column("industry", sa.String(length=100)),
        sa.Column("description", sa.Text()),
        sa.Column("contact_name", sa.String(length=160)),
        sa.Column("contact_role", sa.String(length=160)),
        sa.Column("email", sa.String(length=320)),
        sa.Column("phone", sa.String(length=32)),
        sa.Column("location", sa.String(length=160)),
        sa.Column("source_url", sa.Text()),
        sa.Column("source_notes", sa.Text()),
        sa.Column("fit_reason", sa.Text()),
        sa.Column("verification_status", _enum("unverified", "reviewed", "verified", name="verification_status"), nullable=False, server_default="unverified"),
        sa.Column("opted_out", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("opted_out_at", sa.DateTime(timezone=True)),
        sa.Column("opt_out_reason", sa.Text()),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(["owner_id"], ["auth.users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_prospects_owner_id", "prospects", ["owner_id"])
    op.create_index("ix_prospects_industry", "prospects", ["industry"])
    op.create_index("ix_prospects_verification_status", "prospects", ["verification_status"])

    op.create_table(
        "opportunities",
        _id(),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("prospect_id", sa.Uuid(), nullable=False),
        sa.Column("status", _enum(*opportunity_status, name="opportunity_status"), nullable=False, server_default="prospect_found"),
        sa.Column("organizer_notes", sa.Text()),
        sa.Column("last_contacted_at", sa.DateTime(timezone=True)),
        sa.Column("next_action", sa.String(length=500)),
        sa.Column("next_action_due_at", sa.DateTime(timezone=True)),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prospect_id"], ["prospects.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("event_id", "prospect_id", name="opportunities_event_prospect"),
    )
    op.create_index("ix_opportunities_event_id", "opportunities", ["event_id"])
    op.create_index("ix_opportunities_prospect_id", "opportunities", ["prospect_id"])
    op.create_index("ix_opportunities_status", "opportunities", ["status"])

    op.create_table(
        "opportunity_status_history",
        _id(),
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("previous_status", _enum(*opportunity_status, name="opportunity_status_previous")),
        sa.Column("new_status", _enum(*opportunity_status, name="opportunity_status_next"), nullable=False),
        sa.Column("changed_by", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.Text()),
        _created_at(),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by"], ["auth.users.id"]),
    )
    op.create_index("ix_opportunity_status_history_opportunity_id", "opportunity_status_history", ["opportunity_id"])

    op.create_table(
        "outreach_messages",
        _id(),
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("channel", _enum("email", "manual", name="message_channel"), nullable=False, server_default="email"),
        sa.Column("direction", _enum("outbound", "inbound", name="message_direction"), nullable=False),
        sa.Column("message_type", _enum("initial", "follow_up", "proposal", "reply", "other", name="message_type"), nullable=False),
        sa.Column("recipient", sa.String(length=320)),
        sa.Column("subject", sa.String(length=200)),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", _enum("draft", "approved", "sending", "sent", "delivered", "failed", "received", name="message_status"), nullable=False, server_default="draft"),
        sa.Column("approved_by", sa.Uuid()),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("provider_message_id", sa.String(length=255)),
        sa.Column("send_idempotency_key", sa.Uuid(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.Text()),
        _created_at(),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by"], ["auth.users.id"]),
    )
    op.create_index("ix_outreach_messages_opportunity_id", "outreach_messages", ["opportunity_id"])

    op.create_table(
        "calls",
        _id(),
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("bolna_call_id", sa.String(length=255)),
        sa.Column("status", _enum("queued", "initiated", "in_progress", "completed", "failed", "no_answer", name="call_status"), nullable=False, server_default="queued"),
        sa.Column("outcome", _enum("interested", "needs_information", "offer_mentioned", "declined", "callback_requested", "opt_out", "no_answer", "other", name="call_outcome")),
        sa.Column("summary", sa.Text()),
        sa.Column("transcript_text", sa.Text()),
        sa.Column("recording_url", sa.Text()),
        sa.Column("extracted_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("review_status", _enum("needs_review", "reviewed", "corrected", name="review_status"), nullable=False, server_default="needs_review"),
        sa.Column("approved_by", sa.Uuid()),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("consent_confirmed_by", sa.Uuid()),
        sa.Column("consent_confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("last_webhook_at", sa.DateTime(timezone=True)),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by"], ["auth.users.id"]),
        sa.ForeignKeyConstraint(["consent_confirmed_by"], ["auth.users.id"]),
        sa.UniqueConstraint("bolna_call_id", name="uq_calls_bolna_call_id"),
    )
    op.create_index("ix_calls_opportunity_id", "calls", ["opportunity_id"])

    op.create_table(
        "offers",
        _id(),
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("resource_need_id", sa.Uuid()),
        sa.Column("support_type", _enum(*resource_category, name="resource_category"), nullable=False),
        sa.Column("stated_value", sa.Numeric(precision=12, scale=2)),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("quantity", sa.Integer()),
        sa.Column("conditions", sa.Text()),
        sa.Column("eligibility_requirements", sa.Text()),
        sa.Column("expected_timeline", sa.Text()),
        sa.Column("status", _enum("proposed", "under_review", "accepted", "rejected", "fulfilled", name="offer_status"), nullable=False, server_default="proposed"),
        sa.Column("evidence_notes", sa.Text()),
        sa.Column("evidence_url", sa.Text()),
        sa.Column("organizer_verified_by", sa.Uuid()),
        sa.Column("organizer_verified_at", sa.DateTime(timezone=True)),
        sa.Column("sponsor_confirmed_at", sa.DateTime(timezone=True)),
        _created_at(),
        _updated_at(),
        sa.CheckConstraint("stated_value is null or stated_value >= 0", name="offers_nonnegative_value"),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resource_need_id"], ["resource_needs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organizer_verified_by"], ["auth.users.id"]),
    )
    op.create_index("ix_offers_opportunity_id", "offers", ["opportunity_id"])

    op.create_table(
        "follow_up_tasks",
        _id(),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("status", _enum("open", "in_progress", "completed", "canceled", name="task_status"), nullable=False, server_default="open"),
        sa.Column("source", _enum("manual", "email", "call", "system", name="task_source"), nullable=False, server_default="manual"),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        _created_at(),
        _updated_at(),
        sa.ForeignKeyConstraint(["owner_id"], ["auth.users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["opportunity_id"], ["opportunities.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_follow_up_tasks_owner_id", "follow_up_tasks", ["owner_id"])
    op.create_index("ix_follow_up_tasks_opportunity_id", "follow_up_tasks", ["opportunity_id"])
    op.create_index("ix_follow_up_tasks_due_at", "follow_up_tasks", ["due_at"])

    op.create_table(
        "webhook_events",
        _id(),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("event_key", sa.String(length=255), nullable=False),
        sa.Column("call_id", sa.Uuid()),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("processing_status", _enum("received", "processed", "ignored", "failed", name="webhook_processing_status"), nullable=False, server_default="received"),
        sa.Column("error_message", sa.Text()),
        _created_at(),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("provider", "event_key", name="webhook_events_provider_event_key"),
    )

    for table in ("events", "resource_needs", "prospects", "opportunities", "calls", "offers", "follow_up_tasks"):
        _create_updated_at_trigger(table)
    # Browser-accessible tables use explicit, authenticated operation policies.
    # The server should still perform ownership checks because its service role
    # bypasses RLS. Webhook events deliberately have no browser policy.
    ownership_policies = {
        "events": "owner_id = auth.uid()",
        "prospects": "owner_id = auth.uid()",
        "resource_needs": "EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid())",
        "opportunities": "EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.owner_id = auth.uid())",
        "opportunity_status_history": "EXISTS (SELECT 1 FROM public.opportunities o JOIN public.events e ON e.id = o.event_id WHERE o.id = opportunity_id AND e.owner_id = auth.uid())",
        "outreach_messages": "EXISTS (SELECT 1 FROM public.opportunities o JOIN public.events e ON e.id = o.event_id WHERE o.id = opportunity_id AND e.owner_id = auth.uid())",
        "calls": "EXISTS (SELECT 1 FROM public.opportunities o JOIN public.events e ON e.id = o.event_id WHERE o.id = opportunity_id AND e.owner_id = auth.uid())",
        "offers": "EXISTS (SELECT 1 FROM public.opportunities o JOIN public.events e ON e.id = o.event_id WHERE o.id = opportunity_id AND e.owner_id = auth.uid())",
        "follow_up_tasks": "owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.opportunities o JOIN public.events e ON e.id = o.event_id WHERE o.id = opportunity_id AND e.owner_id = auth.uid())",
    }
    for table_name, ownership_check in ownership_policies.items():
        op.execute(f"ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON TABLE public.{table_name} FROM anon")
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.{table_name} TO authenticated")
        _create_authenticated_ownership_policies(table_name, ownership_check)

    op.execute("ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE public.webhook_events FROM anon, authenticated")


def downgrade() -> None:
    op.drop_table("webhook_events")
    op.drop_table("follow_up_tasks")
    op.drop_table("offers")
    op.drop_table("calls")
    op.drop_table("outreach_messages")
    op.drop_table("opportunity_status_history")
    op.drop_table("opportunities")
    op.drop_table("prospects")
    op.drop_table("resource_needs")
    op.drop_table("events")
    op.execute("DROP FUNCTION IF EXISTS public.set_updated_at()")
