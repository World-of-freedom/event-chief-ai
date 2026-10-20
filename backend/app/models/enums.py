from enum import Enum

from sqlalchemy import Enum as SqlEnum


class ResourceCategory(str, Enum):
    CASH = "cash"
    CLOUD_CREDITS = "cloud_credits"
    PRIZES = "prizes"
    FOOD = "food"
    MERCHANDISE = "merchandise"
    OTHER = "other"


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ResourceNeedStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    PARTIALLY_COVERED = "partially_covered"
    COVERED = "covered"


class VerificationStatus(str, Enum):
    UNVERIFIED = "unverified"
    REVIEWED = "reviewed"
    VERIFIED = "verified"


class OpportunityStatus(str, Enum):
    PROSPECT_FOUND = "prospect_found"
    OUTREACH_APPROVED = "outreach_approved"
    CONTACT_ATTEMPTED = "contact_attempted"
    INTERESTED = "interested"
    PROPOSAL_REQUESTED = "proposal_requested"
    PROPOSAL_SENT = "proposal_sent"
    OFFER_RECEIVED = "offer_received"
    ACCEPTED = "accepted"
    FULFILLED = "fulfilled"
    NOT_INTERESTED = "not_interested"
    OPTED_OUT = "opted_out"


class MessageChannel(str, Enum):
    EMAIL = "email"
    MANUAL = "manual"


class MessageDirection(str, Enum):
    OUTBOUND = "outbound"
    INBOUND = "inbound"


class MessageType(str, Enum):
    INITIAL = "initial"
    FOLLOW_UP = "follow_up"
    PROPOSAL = "proposal"
    REPLY = "reply"
    OTHER = "other"


class MessageStatus(str, Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    SENDING = "sending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    RECEIVED = "received"


class CallStatus(str, Enum):
    QUEUED = "queued"
    INITIATED = "initiated"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    NO_ANSWER = "no_answer"


class CallOutcome(str, Enum):
    INTERESTED = "interested"
    NEEDS_INFORMATION = "needs_information"
    OFFER_MENTIONED = "offer_mentioned"
    DECLINED = "declined"
    CALLBACK_REQUESTED = "callback_requested"
    OPT_OUT = "opt_out"
    NO_ANSWER = "no_answer"
    OTHER = "other"


class ReviewStatus(str, Enum):
    NEEDS_REVIEW = "needs_review"
    REVIEWED = "reviewed"
    CORRECTED = "corrected"


class OfferStatus(str, Enum):
    PROPOSED = "proposed"
    UNDER_REVIEW = "under_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    FULFILLED = "fulfilled"


class TaskStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELED = "canceled"


class TaskSource(str, Enum):
    MANUAL = "manual"
    EMAIL = "email"
    CALL = "call"
    SYSTEM = "system"


class WebhookProcessingStatus(str, Enum):
    RECEIVED = "received"
    PROCESSED = "processed"
    IGNORED = "ignored"
    FAILED = "failed"


def db_enum(enum_class: type[Enum], name: str) -> SqlEnum:
    """Store enum values, not Python member names, with a named check constraint."""
    return SqlEnum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        values_callable=lambda members: [member.value for member in members],
    )
