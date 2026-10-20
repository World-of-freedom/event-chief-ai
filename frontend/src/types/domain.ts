export type NeedCategory = "cash" | "cloud_credits" | "prizes" | "food" | "merchandise" | "other";
export type VerificationStatus = "unverified" | "reviewed" | "verified";
export type OpportunityStatus =
  | "prospect_found"
  | "outreach_approved"
  | "contact_attempted"
  | "interested"
  | "proposal_requested"
  | "proposal_sent"
  | "offer_received"
  | "accepted"
  | "fulfilled"
  | "not_interested"
  | "opted_out";

export interface SponsorProspectTemplate {
  id: string;
  companyName: string;
  industry: string;
  location: string;
  verificationStatus: VerificationStatus;
  sourceUrl?: string;
  sourceLabel: string;
  fitReason: string;
  tags: string[];
  contact: { name: string; role: string; email?: string; phone?: string } | null;
}

export interface DiscoveryFilterOption {
  value: string;
  label: string;
}

export interface FeatureRoute {
  label: string;
  to: string;
  isComingSoon?: boolean;
}
