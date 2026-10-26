from app.models import Base
from app.models.events import Event, ResourceNeed
from app.models.outreach import FollowUpTask
from app.models.prospects import Opportunity
from app.models.research import LeadOutreach, ResearchJob


def test_initial_schema_contract_registers_all_application_tables() -> None:
    expected_tables = {
        "events",
        "resource_needs",
        "prospects",
        "opportunities",
        "opportunity_status_history",
        "outreach_messages",
        "calls",
        "offers",
        "follow_up_tasks",
        "webhook_events",
        "platform_admins",
    }

    assert expected_tables <= set(Base.metadata.tables)


def test_research_auth_foreign_keys_target_supabase_users_table() -> None:
    research_owner_fk = next(iter(ResearchJob.__table__.c.owner_id.foreign_keys)).target_fullname
    lead_owner_fk = next(iter(LeadOutreach.__table__.c.owner_id.foreign_keys)).target_fullname

    assert research_owner_fk == "auth.users.id"
    assert lead_owner_fk == "auth.users.id"


def test_auth_users_foreign_keys_resolve_without_error() -> None:
    from sqlalchemy.sql import ddl
    import sqlalchemy as sa

    # Ensure sort_tables does not raise NoReferencedTableError
    sorted_tables = ddl.sort_tables(list(Base.metadata.tables.values()))
    table_names = [t.fullname for t in sorted_tables]
    assert "auth.users" in table_names
    assert "research_jobs" in table_names
    assert "sponsor_leads" in table_names

    # Ensure every FK targeting auth.users resolves to a real Column and is sa.Uuid
    for table in Base.metadata.tables.values():
        for col in table.columns:
            for fk in col.foreign_keys:
                if fk.target_fullname == "auth.users.id":
                    assert fk.column is not None
                    assert isinstance(col.type, sa.types.Uuid)


def test_event_hierarchy_is_available_on_every_full_event_record() -> None:
    assert Event.__table__.c.parent_event_id.nullable is True
    assert Event.__table__.c.is_subevent.nullable is False
    assert ResourceNeed.__table__.c.event_id.nullable is False
    assert "sub_event_id" not in ResourceNeed.__table__.c
    assert "sub_event_id" not in Opportunity.__table__.c
    assert "sub_event_id" not in ResearchJob.__table__.c
    assert FollowUpTask.__table__.c.event_id.nullable is False
    assert FollowUpTask.__table__.c.opportunity_id.nullable is True
