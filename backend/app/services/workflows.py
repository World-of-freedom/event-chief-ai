"""Future workflow policies.

TODO: define and test approved status-transition maps before enabling writes.
TODO: define accepted/fulfilled evidence requirements with product owners.
TODO: decide whether a reviewed call can create an offer/task in one transaction.
"""

from typing import Protocol


class OpportunityWorkflow(Protocol):
    def transition(self, *, opportunity_id: str, next_status: str, actor_id: str, reason: str | None = None) -> dict: ...
