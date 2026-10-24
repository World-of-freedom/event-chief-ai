from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.models.enums import OfferStatus, OpportunityStatus as S, ResourceCategory, ResourceNeedStatus, TaskStatus
from app.schemas.sponsorship import normalize_phone
from app.services.dashboard import NeedRow, OfferRow, TaskRow, count_tasks, summarize_cash
from app.services.lead_import import normalize_domain
from app.services.pipeline import (
    TransitionError,
    allowed_opportunity_transitions,
    ensure_offer_transition,
    ensure_opportunity_transition,
    ensure_task_transition,
)


# ── Opportunity pipeline ─────────────────────────────────────────────────────

def test_happy_path_follows_the_plan_in_order() -> None:
    path = [S.PROSPECT_FOUND, S.OUTREACH_APPROVED, S.CONTACT_ATTEMPTED, S.INTERESTED, S.PROPOSAL_REQUESTED,
            S.PROPOSAL_SENT, S.OFFER_RECEIVED, S.ACCEPTED, S.FULFILLED]
    for current, nxt in zip(path, path[1:]):
        ensure_opportunity_transition(current, nxt)


@pytest.mark.parametrize("current,target", [
    (S.PROSPECT_FOUND, S.CONTACT_ATTEMPTED),   # cannot skip approval
    (S.PROSPECT_FOUND, S.ACCEPTED),
    (S.OUTREACH_APPROVED, S.NOT_INTERESTED),   # no answer can exist before contact
    (S.ACCEPTED, S.NOT_INTERESTED),
    (S.FULFILLED, S.OPTED_OUT),                # terminal
    (S.OPTED_OUT, S.INTERESTED),               # opt-out is final
    (S.NOT_INTERESTED, S.INTERESTED),
])
def test_disallowed_moves_are_rejected(current: S, target: S) -> None:
    with pytest.raises(TransitionError):
        ensure_opportunity_transition(current, target)


def test_opt_out_is_possible_from_every_active_status() -> None:
    for status in S:
        if status in (S.FULFILLED, S.NOT_INTERESTED, S.OPTED_OUT):
            assert allowed_opportunity_transitions(status) == []
        else:
            assert S.OPTED_OUT in allowed_opportunity_transitions(status)


# ── Offers ───────────────────────────────────────────────────────────────────

def test_offer_must_be_reviewed_before_acceptance() -> None:
    with pytest.raises(TransitionError):
        ensure_offer_transition(OfferStatus.PROPOSED, OfferStatus.ACCEPTED, evidence_notes="ok", evidence_url=None, confirm_verified=True)


def test_accepting_an_offer_needs_evidence_or_explicit_verification() -> None:
    with pytest.raises(TransitionError):
        ensure_offer_transition(OfferStatus.UNDER_REVIEW, OfferStatus.ACCEPTED, evidence_notes="  ", evidence_url=None, confirm_verified=False)
    ensure_offer_transition(OfferStatus.UNDER_REVIEW, OfferStatus.ACCEPTED, evidence_notes="Signed email", evidence_url=None, confirm_verified=False)
    ensure_offer_transition(OfferStatus.UNDER_REVIEW, OfferStatus.ACCEPTED, evidence_notes=None, evidence_url="https://x.test", confirm_verified=False)
    ensure_offer_transition(OfferStatus.UNDER_REVIEW, OfferStatus.ACCEPTED, evidence_notes=None, evidence_url=None, confirm_verified=True)


def test_only_accepted_offers_can_be_fulfilled() -> None:
    ensure_offer_transition(OfferStatus.ACCEPTED, OfferStatus.FULFILLED, evidence_notes=None, evidence_url=None, confirm_verified=False)
    with pytest.raises(TransitionError):
        ensure_offer_transition(OfferStatus.UNDER_REVIEW, OfferStatus.FULFILLED, evidence_notes="x", evidence_url=None, confirm_verified=True)


def test_tasks_can_be_reopened_but_not_jump_from_completed_to_canceled() -> None:
    ensure_task_transition(TaskStatus.COMPLETED, TaskStatus.OPEN)
    with pytest.raises(TransitionError):
        ensure_task_transition(TaskStatus.COMPLETED, TaskStatus.CANCELED)


# ── Dashboard maths ──────────────────────────────────────────────────────────

def _need(category, amount, status=ResourceNeedStatus.OPEN, currency="INR"):
    return NeedRow(category, Decimal(amount) if amount is not None else None, currency, status)


def _offer(kind, value, status, currency="INR"):
    return OfferRow(kind, Decimal(value) if value is not None else None, currency, status)


def test_pending_and_in_kind_offers_never_reduce_the_cash_gap() -> None:
    needs = [_need(ResourceCategory.CASH, "50000"), _need(ResourceCategory.CLOUD_CREDITS, "100000")]
    offers = [
        _offer(ResourceCategory.CASH, "20000", OfferStatus.PROPOSED),
        _offer(ResourceCategory.CASH, "5000", OfferStatus.UNDER_REVIEW),
        _offer(ResourceCategory.CLOUD_CREDITS, "100000", OfferStatus.ACCEPTED),
    ]
    cash = summarize_cash(needs, offers)
    assert cash.target == Decimal("50000")
    assert cash.secured == 0
    assert cash.gap == Decimal("50000")
    assert cash.pending_offer_count == 2


def test_accepted_and_fulfilled_cash_are_reported_separately() -> None:
    cash = summarize_cash(
        [_need(ResourceCategory.CASH, "50000")],
        [
            _offer(ResourceCategory.CASH, "10000", OfferStatus.ACCEPTED),
            _offer(ResourceCategory.CASH, "15000", OfferStatus.FULFILLED),
            _offer(ResourceCategory.CASH, None, OfferStatus.ACCEPTED),          # unknown amount: counted, not summed
            _offer(ResourceCategory.CASH, "999", OfferStatus.ACCEPTED, "USD"),  # other currency: counted, not summed
            _offer(ResourceCategory.CASH, "40000", OfferStatus.REJECTED),
        ],
    )
    assert (cash.accepted, cash.fulfilled, cash.secured, cash.gap) == (Decimal("10000"), Decimal("15000"), Decimal("25000"), Decimal("25000"))
    assert cash.unknown_value_secured_count == 1
    assert cash.other_currency_count == 1


def test_cash_gap_never_goes_negative() -> None:
    cash = summarize_cash([_need(ResourceCategory.CASH, "1000")], [_offer(ResourceCategory.CASH, "5000", OfferStatus.ACCEPTED)])
    assert cash.gap == 0


def test_overdue_counts_only_active_tasks_past_due() -> None:
    now = datetime(2026, 10, 24, tzinfo=timezone.utc)
    tasks = [
        TaskRow(TaskStatus.OPEN, now - timedelta(days=1)),
        TaskRow(TaskStatus.IN_PROGRESS, now + timedelta(days=1)),
        TaskRow(TaskStatus.COMPLETED, now - timedelta(days=3)),
        TaskRow(TaskStatus.OPEN, None),
    ]
    assert count_tasks(tasks, now) == (3, 1)


# ── Small helpers ────────────────────────────────────────────────────────────

def test_phone_numbers_are_validated_and_normalized() -> None:
    assert normalize_phone("98765 43210") == "+919876543210"
    assert normalize_phone("") is None
    with pytest.raises(ValueError):
        normalize_phone("12345")


def test_domains_are_compared_without_scheme_or_www() -> None:
    assert normalize_domain("https://www.Example.com/about") == "example.com"
    assert normalize_domain("example.com") == "example.com"
    assert normalize_domain(None) is None
