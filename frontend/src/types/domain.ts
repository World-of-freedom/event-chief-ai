export type NeedCategory =
  | "cash"
  | "cloud_credits"
  | "equipment"
  | "speakers"
  | "mentors"
  | "venue"
  | "volunteers"
  | "prizes"
  | "food"
  | "merchandise"
  | "other";
export type VerificationStatus = "unverified" | "reviewed" | "verified";
export type LeadVerificationStatus = "raw" | "verified" | "rejected";
export type ResearchJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

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

export type OutreachLeadStatus =
  | "shortlisted"
  | "contacted"
  | "responded"
  | "rejected"
  | "converted";

export interface LeadEvidence {
  id: string;
  evidence_type: string;
  claim: string;
  source_url: string;
  source_title: string | null;
  verified_date: string | null;
  source_excerpt: string | null;
  retrieved_at: string | null;
  source_quality: "official" | "secondary";
  is_llm_inferred: boolean;
  created_at: string;
}

export interface LeadContactVerification {
  id: string;
  provider: string;
  provider_status: string;
  provider_result: Record<string, unknown> | null;
  credits_used: number;
  verified_at: string;
  created_at: string;
}

export interface LeadContact {
  id: string;
  lead_id: string;
  kind: "email" | "phone" | "contact_form";
  value: string;
  normalized_value: string | null;
  contact_name: string | null;
  contact_role: string | null;
  source_url: string;
  source_title: string | null;
  source_excerpt: string | null;
  source_quality: "official" | "secondary";
  basic_check_status: "not_checked" | "passed" | "needs_review" | "failed";
  basic_check_results: Record<string, unknown> | null;
  display_status: string;
  is_primary: boolean;
  retrieved_at: string | null;
  verifications: LeadContactVerification[];
  created_at: string;
  updated_at: string;
}

export interface SponsorLead {
  id: string;
  job_id: string;
  company_name: string;
  domain: string | null;
  website_url: string | null;
  industry: string | null;
  description: string | null;
  location: string | null;
  distance_km: number | null;

  contact_email: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  contact_role: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  instagram_url: string | null;
  sponsorship_page_url: string | null;

  discovery_source: string | null;
  source_url: string | null;

  score_total: number;
  score_relevance: number;
  score_industry_fit: number;
  score_sponsorship_history: number;
  score_geographic_fit: number;
  score_budget_compatibility: number;
  score_contactability: number;
  ranking_explanation: string | null;
  confidence: "low" | "medium" | "high";

  match_score: number;
  confidence_score: number;
  match_score_components: Record<string, ScoreComponent> | null;
  confidence_score_components: Record<string, ScoreComponent> | null;
  scoring_version: string;

  verification_status: LeadVerificationStatus;
  website_reachable: boolean | null;
  verified_at: string | null;

  evidence: LeadEvidence[];
  contacts: LeadContact[];
  created_at: string;
  updated_at: string;
}

export interface ScoreComponent {
  rating: number;
  weight: number;
  score: number;
  evidence: string[];
}

export interface ResearchJob {
  id: string;
  /** Short Nano ID–style ID used in URLs. Missing until the public_id migration is applied. */
  public_id?: string;
  owner_id: string;
  event_id: string | null;

  event_name: string;
  event_type: string;
  event_theme: string | null;
  venue_city: string;
  venue_state: string | null;
  expected_footfall: number | null;
  primary_audience: string | null;
  budget_target_inr: number | null;
  support_types_needed: string[] | null;
  eligibility_constraints: string | null;

  status: ResearchJobStatus;
  progress_message: string | null;
  progress_percent: number;
  error_message: string | null;

  tavily_credits_used: number;
  places_api_calls: number;
  hunter_credits_used: number;
  llm_tokens_used: number;
  lead_count: number;

  normalized_event_brief: Record<string, unknown> | null;
  search_plan: Record<string, unknown> | null;
  scoring_version: string;

  created_at: string;
  updated_at: string;
  leads?: SponsorLead[];
}

export interface CreateResearchJobInput {
  event_name: string;
  event_type: string;
  event_theme?: string;
  event_description?: string;

  venue_city: string;
  venue_state?: string;
  venue_name?: string;
  start_date?: string;
  end_date?: string;
  event_format?: "in_person" | "online" | "hybrid";

  expected_footfall?: number;
  primary_audience?: string;
  audience_age_range?: string;
  academic_disciplines?: string;
  institution_name?: string;

  budget_target_inr?: number;
  support_types_needed?: string[];
  sponsorship_tiers?: string;
  sponsor_benefits?: string;
  eligibility_constraints?: string;

  previous_edition_count?: number;
  previous_sponsors_hint?: string;
  additional_notes?: string;

  event_id?: string;
}

export interface FeatureRoute {
  label: string;
  to: string;
  isComingSoon?: boolean;
}
