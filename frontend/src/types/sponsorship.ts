// Mirrors backend/app/schemas/events.py and sponsorship.py.
import type { NeedCategory, OpportunityStatus, VerificationStatus } from "@/types/domain";

export type NeedPriority = "low" | "medium" | "high";
export type NeedStatus = "open" | "in_progress" | "partially_covered" | "covered";
export type OfferStatus = "proposed" | "under_review" | "accepted" | "rejected" | "fulfilled";
export type TaskStatus = "open" | "in_progress" | "completed" | "canceled";
/** Money comes back from the API as a decimal string. */
export type Money = string;

export interface EventRecord {
  id: string;
  name: string;
  event_type: string;
  institution: string;
  start_date: string;
  end_date: string | null;
  description: string | null;
  location: string | null;
  is_online: boolean;
  expected_attendees: number | null;
  target_audience: string | null;
  website_url: string | null;
  organizer_name: string | null;
  organizer_email: string | null;
  created_at: string;
  updated_at: string;
}

export type EventInput = Omit<EventRecord, "id" | "created_at" | "updated_at">;

export interface ResourceNeed {
  id: string;
  event_id: string;
  category: NeedCategory;
  title: string;
  description: string | null;
  target_amount: Money | null;
  currency: string;
  target_quantity: number | null;
  deadline: string | null;
  priority: NeedPriority;
  status: NeedStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ResourceNeedInput = Omit<ResourceNeed, "id" | "event_id" | "created_at" | "updated_at">;

export interface Dashboard {
  event_id: string;
  cash: {
    currency: string;
    target: Money;
    accepted: Money;
    fulfilled: Money;
    secured: Money;
    gap: Money;
    pending_offer_count: number;
    unknown_value_secured_count: number;
    other_currency_count: number;
  };
  open_in_kind_needs: ResourceNeed[];
  in_kind_secured: {
    id: string;
    opportunity_id: string;
    company_name: string;
    support_type: NeedCategory;
    stated_value: Money | null;
    currency: string;
    quantity: number | null;
    status: "accepted" | "fulfilled";
  }[];
  opportunities_by_status: Partial<Record<OpportunityStatus, number>>;
  open_task_count: number;
  overdue_task_count: number;
  recent_calls: { id: string; opportunity_id: string; company_name: string; status: string; outcome: string | null; created_at: string }[];
}

export interface Prospect {
  id: string;
  company_name: string;
  website_url: string | null;
  industry: string | null;
  description: string | null;
  contact_name: string | null;
  contact_role: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  source_url: string | null;
  source_notes: string | null;
  fit_reason: string | null;
  verification_status: VerificationStatus;
  opted_out: boolean;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type ProspectInput = Partial<Omit<Prospect, "id" | "opted_out" | "opted_out_at" | "opt_out_reason" | "created_at" | "updated_at">> & {
  company_name: string;
};

export interface ProspectSummary {
  id: string;
  company_name: string;
  industry: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  verification_status: VerificationStatus;
  opted_out: boolean;
}

export interface OpportunityListItem {
  id: string;
  event_id: string;
  event_name: string;
  status: OpportunityStatus;
  prospect: ProspectSummary;
  next_action: string | null;
  next_action_due_at: string | null;
  last_contacted_at: string | null;
  offer_count: number;
  open_task_count: number;
  created_at: string;
  updated_at: string;
}

export interface StatusHistoryEntry {
  id: string;
  previous_status: OpportunityStatus | null;
  new_status: OpportunityStatus;
  changed_by: string;
  reason: string | null;
  created_at: string;
}

export interface Offer {
  id: string;
  opportunity_id: string;
  resource_need_id: string | null;
  support_type: NeedCategory;
  stated_value: Money | null;
  currency: string;
  quantity: number | null;
  conditions: string | null;
  eligibility_requirements: string | null;
  expected_timeline: string | null;
  status: OfferStatus;
  evidence_notes: string | null;
  evidence_url: string | null;
  organizer_verified_by: string | null;
  organizer_verified_at: string | null;
  allowed_next_statuses: OfferStatus[];
  created_at: string;
  updated_at: string;
}

export interface OfferInput {
  support_type: NeedCategory;
  resource_need_id?: string | null;
  stated_value?: string | null;
  currency?: string;
  quantity?: number | null;
  conditions?: string | null;
  eligibility_requirements?: string | null;
  expected_timeline?: string | null;
  evidence_notes?: string | null;
  evidence_url?: string | null;
}

export interface OfferPatch extends Partial<OfferInput> {
  status?: OfferStatus;
  confirm_verified?: boolean;
}

export interface FollowUpTask {
  id: string;
  opportunity_id: string;
  event_id: string;
  event_name: string;
  company_name: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: TaskStatus;
  source: string;
  completed_at: string | null;
  is_overdue: boolean;
  created_at: string;
  updated_at: string;
}

export interface OpportunityDetail extends OpportunityListItem {
  organizer_notes: string | null;
  prospect_detail: Prospect;
  allowed_next_statuses: OpportunityStatus[];
  outreach_blocked: boolean;
  status_history: StatusHistoryEntry[];
  offers: Offer[];
  tasks: FollowUpTask[];
  messages: { id: string; channel: string; direction: string; message_type: string; subject: string | null; status: string; sent_at: string | null; created_at: string }[];
  calls: { id: string; status: string; outcome: string | null; review_status: string; created_at: string }[];
}
