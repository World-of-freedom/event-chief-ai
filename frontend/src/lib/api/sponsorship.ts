import { apiClient } from "@/lib/api/client";
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
export const updateTask = (id: string, input: { title?: string; due_at?: string | null; description?: string | null; status?: TaskStatus }) =>
  apiClient<FollowUpTask>(`/tasks/${id}`, json("PATCH", input));
