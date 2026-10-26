"""Import every model here so Alembic can discover a complete metadata graph."""

from app.models.base import Base
from app.models.admin import PlatformAdmin
from app.models.events import Event, ResourceNeed
from app.models.outreach import Call, FollowUpTask, Offer, OutreachMessage, WebhookEvent
from app.models.prospects import Opportunity, OpportunityStatusHistory, Prospect
from app.models.research import CompanyResearchCache, LeadContact, LeadContactVerification, LeadEvidence, LeadOutreach, ResearchJob, SponsorLead

__all__ = [
    "Base",
    "Call",
    "Event",
    "FollowUpTask",
    "LeadEvidence",
    "CompanyResearchCache",
    "LeadContact",
    "LeadContactVerification",
    "LeadOutreach",
    "Offer",
    "PlatformAdmin",
    "Opportunity",
    "OpportunityStatusHistory",
    "OutreachMessage",
    "Prospect",
    "ResearchJob",
    "ResourceNeed",
    "SponsorLead",
    "WebhookEvent",
]
