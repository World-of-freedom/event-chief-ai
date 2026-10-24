"""Status rules for opportunities, offers and follow-up tasks.

These are pure functions so they can be unit-tested without a database. Routes call
them before writing anything, so the rules are enforced server-side, not only in the UI.
"""

from __future__ import annotations

from app.models.enums import OfferStatus, OpportunityStatus, TaskStatus

S = OpportunityStatus

# Opportunity pipeline, as specified in docs/IMPLEMENTATION_PLAN.md (section 3.5):
#
#   prospect_found → outreach_approved → contact_attempted → interested
#                                                ↘ not_interested / opted_out
#   interested → proposal_requested → proposal_sent → offer_received → accepted → fulfilled
#                                                       ↘ not_interested / opted_out
#
# Addition: `opted_out` is reachable from every non-terminal status, because an
# opt-out must always be honoured no matter where the conversation is.
TERMINAL_STATUSES: frozenset[OpportunityStatus] = frozenset({S.FULFILLED, S.NOT_INTERESTED, S.OPTED_OUT})

_FORWARD: dict[OpportunityStatus, set[OpportunityStatus]] = {
    S.PROSPECT_FOUND: {S.OUTREACH_APPROVED},
    S.OUTREACH_APPROVED: {S.CONTACT_ATTEMPTED},
    S.CONTACT_ATTEMPTED: {S.INTERESTED, S.NOT_INTERESTED},
    S.INTERESTED: {S.PROPOSAL_REQUESTED, S.NOT_INTERESTED},
    S.PROPOSAL_REQUESTED: {S.PROPOSAL_SENT, S.NOT_INTERESTED},
    S.PROPOSAL_SENT: {S.OFFER_RECEIVED, S.NOT_INTERESTED},
    S.OFFER_RECEIVED: {S.ACCEPTED, S.NOT_INTERESTED},
    S.ACCEPTED: {S.FULFILLED},
}

OPPORTUNITY_TRANSITIONS: dict[OpportunityStatus, frozenset[OpportunityStatus]] = {
    status: frozenset(_FORWARD.get(status, set()) | ({S.OPTED_OUT} if status not in TERMINAL_STATUSES else set()))
    for status in OpportunityStatus
}

# Statuses where no further email or call may be started for the prospect.
OUTREACH_BLOCKED_STATUSES: frozenset[OpportunityStatus] = frozenset({S.OPTED_OUT, S.NOT_INTERESTED})


class TransitionError(ValueError):
    """Raised when a requested status change is not allowed."""


def allowed_opportunity_transitions(current: OpportunityStatus) -> list[OpportunityStatus]:
    """Next statuses in pipeline order (stable for UI menus)."""
    allowed = OPPORTUNITY_TRANSITIONS[current]
    return [status for status in OpportunityStatus if status in allowed]


def ensure_opportunity_transition(current: OpportunityStatus, target: OpportunityStatus) -> None:
    if target == current:
        raise TransitionError(f"Opportunity is already '{current.value}'.")
    if target not in OPPORTUNITY_TRANSITIONS[current]:
        raise TransitionError(f"Cannot move an opportunity from '{current.value}' to '{target.value}'.")


# Offers: proposed → under_review → accepted | rejected; accepted → fulfilled.
O = OfferStatus
OFFER_TRANSITIONS: dict[OfferStatus, frozenset[OfferStatus]] = {
    O.PROPOSED: frozenset({O.UNDER_REVIEW}),
    O.UNDER_REVIEW: frozenset({O.ACCEPTED, O.REJECTED}),
    O.ACCEPTED: frozenset({O.FULFILLED}),
    O.REJECTED: frozenset(),
    O.FULFILLED: frozenset(),
}


def allowed_offer_transitions(current: OfferStatus) -> list[OfferStatus]:
    allowed = OFFER_TRANSITIONS[current]
    return [status for status in OfferStatus if status in allowed]


def ensure_offer_transition(
    current: OfferStatus,
    target: OfferStatus,
    *,
    evidence_notes: str | None,
    evidence_url: str | None,
    confirm_verified: bool,
) -> None:
    """Validate an offer status change.

    Accepting an offer needs proof: an evidence note, an evidence URL, or an explicit
    organizer confirmation (plan section 6.2). Unproven offers never count as secured.
    """
    if target == current:
        raise TransitionError(f"Offer is already '{current.value}'.")
    if target not in OFFER_TRANSITIONS[current]:
        raise TransitionError(f"Cannot move an offer from '{current.value}' to '{target.value}'.")
    if target == O.ACCEPTED:
        has_evidence = bool((evidence_notes or "").strip() or (evidence_url or "").strip())
        if not (has_evidence or confirm_verified):
            raise TransitionError("Accepting an offer needs an evidence note, an evidence URL, or explicit verification.")


# Tasks: open ⇄ in_progress; either can be completed or canceled; finished tasks can be reopened.
T = TaskStatus
TASK_TRANSITIONS: dict[TaskStatus, frozenset[TaskStatus]] = {
    T.OPEN: frozenset({T.IN_PROGRESS, T.COMPLETED, T.CANCELED}),
    T.IN_PROGRESS: frozenset({T.OPEN, T.COMPLETED, T.CANCELED}),
    T.COMPLETED: frozenset({T.OPEN}),
    T.CANCELED: frozenset({T.OPEN}),
}

ACTIVE_TASK_STATUSES: frozenset[TaskStatus] = frozenset({T.OPEN, T.IN_PROGRESS})


def ensure_task_transition(current: TaskStatus, target: TaskStatus) -> None:
    if target != current and target not in TASK_TRANSITIONS[current]:
        raise TransitionError(f"Cannot move a task from '{current.value}' to '{target.value}'.")
