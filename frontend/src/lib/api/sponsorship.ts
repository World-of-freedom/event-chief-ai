import { apiBlob, apiClient } from "@/lib/api/client";
import type { OpportunityStatus } from "@/types/domain";
import type {
  Dashboard,
  EventInput,
  EventRecord,
  FollowUpTask,
  Offer,
  OfferInput,
  OfferPatch,
  OpportunityDetail,
  OpportunityListItem,
  Prospect,
  ProspectInput,
  ResourceNeed,
  ResourceNeedInput,
  TaskStatus,
  VoiceCall,
  VoiceCallPreferences,
} from "@/types/sponsorship";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

function query(params: Record<string, string | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "" && value !== false) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

// Events & needs
export const listEvents = () => apiClient<EventRecord[]>("/events");
export const getEvent = (id: string) => apiClient<EventRecord>(`/events/${id}`);
export const createEvent = (input: EventInput) => apiClient<EventRecord>("/events", json("POST", input));
export const updateEvent = (id: string, input: Partial<EventInput>) => apiClient<EventRecord>(`/events/${id}`, json("PATCH", input));
export const deleteEvent = (id: string) => apiClient<void>(`/events/${id}`, { method: "DELETE" });
export const getDashboard = (eventId: string) => apiClient<Dashboard>(`/events/${eventId}/dashboard`);

export const listNeeds = (eventId: string) => apiClient<ResourceNeed[]>(`/events/${eventId}/needs`);
export const createNeed = (eventId: string, input: ResourceNeedInput) => apiClient<ResourceNeed>(`/events/${eventId}/needs`, json("POST", input));
export const updateNeed = (id: string, input: Partial<ResourceNeedInput>) => apiClient<ResourceNeed>(`/events/needs/${id}`, json("PATCH", input));
export const deleteNeed = (id: string) => apiClient<void>(`/events/needs/${id}`, { method: "DELETE" });

// Prospects & opportunities
export const updateProspect = (id: string, input: Partial<ProspectInput> & { opted_out?: true; opt_out_reason?: string | null }) =>
  apiClient<Prospect>(`/prospects/${id}`, json("PATCH", input));

export const listOpportunities = (filters: { event_id?: string; status?: OpportunityStatus | ""; q?: string }) =>
  apiClient<OpportunityListItem[]>(`/opportunities${query(filters)}`);
export const getOpportunity = (id: string) => apiClient<OpportunityDetail>(`/opportunities/${id}`);
export const updateOpportunity = (
  id: string,
  input: { status?: OpportunityStatus; status_reason?: string | null; organizer_notes?: string | null; next_action?: string | null; next_action_due_at?: string | null },
) => apiClient<OpportunityDetail>(`/opportunities/${id}`, json("PATCH", input));
export const listProspects = (filters: { q?: string } = {}) => apiClient<Prospect[]>(`/prospects${query(filters)}`);
export const createOpportunity = (eventId: string, prospectId: string) =>
  apiClient<OpportunityDetail>(`/events/${eventId}/opportunities`, json("POST", { prospect_id: prospectId }));
export const createOpportunityWithProspect = (eventId: string, prospect: ProspectInput, organizerNotes?: string) =>
  apiClient<OpportunityDetail>(`/events/${eventId}/opportunities/with-prospect`, json("POST", { prospect, organizer_notes: organizerNotes || null }));
export const createOpportunityFromLead = (eventId: string, leadId: string) =>
  apiClient<OpportunityDetail>(`/events/${eventId}/opportunities/from-lead`, json("POST", { lead_id: leadId }));

// Offers & tasks
export const createOffer = (opportunityId: string, input: OfferInput) => apiClient<Offer>(`/opportunities/${opportunityId}/offers`, json("POST", input));
export const updateOffer = (id: string, input: OfferPatch) => apiClient<Offer>(`/offers/${id}`, json("PATCH", input));

export const listTasks = (filters: { event_id?: string; status?: TaskStatus | ""; overdue_only?: boolean }) =>
  apiClient<FollowUpTask[]>(`/tasks${query(filters)}`);
export const createTask = (opportunityId: string, input: { title: string; due_at?: string | null; description?: string | null }) =>
  apiClient<FollowUpTask>(`/opportunities/${opportunityId}/tasks`, json("POST", input));
export const createEventTask = (input: { event_id: string; title: string; due_at?: string | null; description?: string | null }) =>
  apiClient<FollowUpTask>("/tasks", json("POST", input));
export const updateTask = (id: string, input: { title?: string; due_at?: string | null; description?: string | null; status?: TaskStatus }) =>
  apiClient<FollowUpTask>(`/tasks/${id}`, json("PATCH", input));

export type OutreachMessage = {
  id: string;
  channel: string;
  direction: string;
  message_type: string;
  recipient: string | null;
  subject: string | null;
  body: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
};
export const createEmailDraft = (opportunityId: string) => apiClient<OutreachMessage>(`/opportunities/${opportunityId}/emails/draft`, json("POST", {}));
export const updateEmailDraft = (messageId: string, input: { recipient: string; subject: string; body: string }) =>
  apiClient<OutreachMessage>(`/outreach/${messageId}/draft`, json("PATCH", input));
export const deleteEmailDraft = (messageId: string) => apiClient<void>(`/outreach/${messageId}/draft`, { method: "DELETE" });
export const approveEmail = (messageId: string) => apiClient<OutreachMessage>(`/outreach/${messageId}/approve`, json("POST", {}));
export const sendEmail = (messageId: string) => apiClient<OutreachMessage>(`/outreach/${messageId}/send`, json("POST", {}));
export const recordManualInteraction = (opportunityId: string, input: { direction: "outbound" | "inbound"; body: string; subject?: string | null; follow_up_title?: string | null; follow_up_due_at?: string | null }) =>
  apiClient<OutreachMessage>(`/opportunities/${opportunityId}/responses`, json("POST", input));

export const approveVoiceCall = (opportunityId: string, input: { instructions?: string | null; consent_confirmed: true }) =>
  apiClient<VoiceCall>(`/opportunities/${opportunityId}/calls`, json("POST", input));
export const getVoiceCall = (callId: string) => apiClient<VoiceCall>(`/calls/${callId}`);
export const getVoiceCallRecording = (callId: string) => apiBlob(`/calls/${callId}/recording`);
export const cancelVoiceCall = (callId: string) => apiClient<VoiceCall>(`/calls/${callId}/cancel`, json("POST", {}));
export const reviewVoiceCall = (callId: string, input: { extracted_fields: Record<string, unknown>; review_status: "reviewed" | "corrected" }) =>
  apiClient<VoiceCall>(`/calls/${callId}/review`, json("POST", input));
export const getVoiceCallPreferences = () => apiClient<VoiceCallPreferences>("/voice-preferences");
export const saveVoiceCallPreferences = (input: Omit<VoiceCallPreferences, "updated_at">) =>
  apiClient<VoiceCallPreferences>("/voice-preferences", json("PUT", input));

export type AdminMe = { is_platform_admin: boolean };
export type AdminUser = { id: string; email: string | null; created_at: string | null; email_confirmed_at: string | null; banned_until: string | null; is_platform_admin: boolean };
export const getAdminMe = () => apiClient<AdminMe>("/admin/me");
export const listAdminUsers = () => apiClient<AdminUser[]>("/admin/users");
export const updateAdminRole = (id: string, isPlatformAdmin: boolean) => apiClient<{ is_platform_admin: boolean }>(`/admin/users/${id}/role`, json("PATCH", { is_platform_admin: isPlatformAdmin }));
