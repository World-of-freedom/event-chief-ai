"""Dependency registration point.

TODO: replace the stub factory with configured concrete repository and service
adapters during the implementation phase.
"""

from app.repositories.sponsorship import SponsorshipRepositoryStub


def get_sponsorship_repository() -> SponsorshipRepositoryStub:
    return SponsorshipRepositoryStub()
