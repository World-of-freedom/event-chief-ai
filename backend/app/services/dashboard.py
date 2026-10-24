"""Event dashboard maths (docs/IMPLEMENTATION_PLAN.md section 2.3), kept pure for unit tests.

Rules:
- Only offers the organizer has *accepted* or marked *fulfilled* count as secured.
  `proposed` and `under_review` offers are reported as pending, never as secured.
- Cash and in-kind support are reported separately; in-kind value never reduces the cash gap.
- Offers with an unknown amount stay unknown: they are counted, not summed as zero.
- Sums only include the event's reporting currency (INR); other currencies are counted.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.models.enums import OfferStatus, ResourceCategory, ResourceNeedStatus, TaskStatus

REPORTING_CURRENCY = "INR"
SECURED_OFFER_STATUSES = frozenset({OfferStatus.ACCEPTED, OfferStatus.FULFILLED})
PENDING_OFFER_STATUSES = frozenset({OfferStatus.PROPOSED, OfferStatus.UNDER_REVIEW})


@dataclass(frozen=True)
class NeedRow:
    category: ResourceCategory
    target_amount: Decimal | None
    currency: str
    status: ResourceNeedStatus


@dataclass(frozen=True)
class OfferRow:
    support_type: ResourceCategory
    stated_value: Decimal | None
    currency: str
    status: OfferStatus


@dataclass(frozen=True)
class TaskRow:
    status: TaskStatus
    due_at: datetime | None


@dataclass(frozen=True)
class CashSummary:
    currency: str
    target: Decimal
    accepted: Decimal
    fulfilled: Decimal
    secured: Decimal
    gap: Decimal
    pending_offer_count: int
    unknown_value_secured_count: int
    other_currency_count: int


def summarize_cash(needs: list[NeedRow], offers: list[OfferRow]) -> CashSummary:
    zero = Decimal("0")
    target = sum(
        (n.target_amount or zero for n in needs
         if n.category == ResourceCategory.CASH and n.currency == REPORTING_CURRENCY),
        zero,
    )
    accepted = fulfilled = zero
    pending = unknown = other_currency = 0
    for offer in offers:
        if offer.support_type != ResourceCategory.CASH:
            continue
        if offer.status in PENDING_OFFER_STATUSES:
            pending += 1
            continue
        if offer.status not in SECURED_OFFER_STATUSES:
            continue
        if offer.currency != REPORTING_CURRENCY:
            other_currency += 1
            continue
        if offer.stated_value is None:
            unknown += 1
            continue
        if offer.status == OfferStatus.ACCEPTED:
            accepted += offer.stated_value
        else:
            fulfilled += offer.stated_value
    secured = accepted + fulfilled
    return CashSummary(
        currency=REPORTING_CURRENCY,
        target=target,
        accepted=accepted,
        fulfilled=fulfilled,
        secured=secured,
        gap=max(target - secured, zero),
        pending_offer_count=pending,
        unknown_value_secured_count=unknown,
        other_currency_count=other_currency,
    )


def count_tasks(tasks: list[TaskRow], now: datetime) -> tuple[int, int]:
    """Return (open, overdue). Open includes in-progress; overdue = open and past due."""
    active = [t for t in tasks if t.status in (TaskStatus.OPEN, TaskStatus.IN_PROGRESS)]
    overdue = [t for t in active if t.due_at is not None and t.due_at < now]
    return len(active), len(overdue)


def count_by_status(statuses: list[str]) -> dict[str, int]:
    return dict(Counter(statuses))
