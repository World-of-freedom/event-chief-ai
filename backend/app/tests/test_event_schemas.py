from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.events import EventCreateInput, ResourceNeedInput


def test_event_create_accepts_an_optional_parent_and_phone() -> None:
    event = EventCreateInput(
        name="AI Summit",
        event_type="tech_conference",
        institution="Example Institute",
        start_date=date(2026, 11, 1),
        organizer_phone="+91 90000 00000",
        parent_event_id="f6bea4b3-4b76-4c27-9fdd-25e16e25ddbd",
    )

    assert str(event.parent_event_id) == "f6bea4b3-4b76-4c27-9fdd-25e16e25ddbd"
    assert event.organizer_phone == "+91 90000 00000"


def test_resource_requirements_enforce_category_fields_and_common_requirements() -> None:
    requirement = ResourceNeedInput(
        category="equipment",
        target_quantity=20,
        details={"equipment_type": "Laptops"},
        description="Twenty laptops for participant project teams.",
    )

    assert requirement.title == "Equipment"
    with pytest.raises(ValidationError, match="equipment type"):
        ResourceNeedInput(category="equipment", target_quantity=20, description="Laptops for teams")
    with pytest.raises(ValidationError, match="Cash funding requires an amount"):
        ResourceNeedInput(category="cash", details={"funding_purpose": "Prize pool"}, description="Prize funding")
