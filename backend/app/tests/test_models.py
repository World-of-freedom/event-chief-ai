from app.models import Base


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
    }

    assert expected_tables <= set(Base.metadata.tables)
