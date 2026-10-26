import type { NeedCategory, OpportunityStatus } from "@/types/domain";
import type { NeedPriority, NeedStatus, OfferStatus, TaskStatus } from "@/types/sponsorship";
import type { Tone } from "@/components/StatusPill";

export function formatMoney(value: string | number | null | undefined, currency = "INR"): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-IN")}`;
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Plain dates ("2026-11-15") are shown as-is in local format without timezone shifts.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** ISO timestamp → value for <input type="datetime-local"> in the viewer's timezone. */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value (viewer's timezone) → ISO timestamp with offset. */
export function fromDateTimeLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export const needCategoryLabels: Record<NeedCategory, string> = {
  cash: "Cash",
  cloud_credits: "Cloud & API credits",
  equipment: "Equipment",
  speakers: "Speakers",
  mentors: "Mentors",
  venue: "Venue",
  volunteers: "Volunteers",
  prizes: "Prizes",
  food: "Food & beverage",
  merchandise: "Merchandise",
  other: "Other",
};

export const needPriorityLabels: Record<NeedPriority, string> = { low: "Low", medium: "Medium", high: "High" };

export const needStatusLabels: Record<NeedStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  partially_covered: "Partially covered",
  covered: "Covered",
};

export const opportunityStatusLabels: Record<OpportunityStatus, string> = {
  prospect_found: "Prospect found",
  outreach_approved: "Outreach approved",
  contact_attempted: "Contact attempted",
  interested: "Interested",
  proposal_requested: "Proposal requested",
  proposal_sent: "Proposal sent",
  offer_received: "Offer received",
  accepted: "Accepted",
  fulfilled: "Fulfilled",
  not_interested: "Not interested",
  opted_out: "Opted out",
};

export const opportunityStatusOrder = Object.keys(opportunityStatusLabels) as OpportunityStatus[];

export function opportunityTone(status: OpportunityStatus): Tone {
  if (status === "accepted" || status === "fulfilled") return "success";
  if (status === "not_interested" || status === "opted_out") return "neutral";
  if (status === "interested" || status === "proposal_requested" || status === "proposal_sent" || status === "offer_received") return "brand";
  return "info";
}

export const offerStatusLabels: Record<OfferStatus, string> = {
  proposed: "Proposed",
  under_review: "Under review",
  accepted: "Accepted",
  rejected: "Rejected",
  fulfilled: "Fulfilled",
};

export function offerTone(status: OfferStatus): Tone {
  if (status === "accepted" || status === "fulfilled") return "success";
  if (status === "rejected") return "neutral";
  if (status === "under_review") return "warning";
  return "info";
}

export const taskStatusLabels: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  canceled: "Canceled",
};

export function taskTone(status: TaskStatus, overdue = false): Tone {
  if (overdue) return "danger";
  if (status === "completed") return "success";
  if (status === "canceled") return "neutral";
  return "info";
}
