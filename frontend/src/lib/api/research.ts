import { apiClient } from "@/lib/api/client";
import type {
  CreateResearchJobInput,
  LeadContact,
  ResearchJob,
  SponsorLead,
} from "@/types/domain";

export async function createResearchJob(
  input: CreateResearchJobInput
): Promise<ResearchJob> {
  return apiClient<ResearchJob>("/research-jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listResearchJobs(): Promise<ResearchJob[]> {
  return apiClient<ResearchJob[]>("/research-jobs");
}

export async function getResearchJob(jobId: string): Promise<ResearchJob> {
  return apiClient<ResearchJob>(`/research-jobs/${jobId}`);
}

export async function getResearchJobByPublicId(publicId: string): Promise<ResearchJob> {
  return apiClient<ResearchJob>(`/research-jobs/by-public-id/${encodeURIComponent(publicId)}`);
}

export async function getJobLeads(jobId: string): Promise<ResearchJob> {
  return apiClient<ResearchJob>(`/research-jobs/${jobId}/leads`);
}

export async function getLeadDetails(leadId: string): Promise<SponsorLead> {
  return apiClient<SponsorLead>(`/leads/${leadId}`);
}

export async function retryResearchJob(jobId: string): Promise<ResearchJob> {
  return apiClient<ResearchJob>(`/research-jobs/${jobId}/retry`, { method: "POST", body: "{}" });
}

export async function verifySelectedLeadEmails(leadId: string, contactIds: string[]): Promise<{ contacts: LeadContact[]; credits_used: number }> {
  return apiClient<{ contacts: LeadContact[]; credits_used: number }>(`/leads/${leadId}/contacts/verify`, {
    method: "POST",
    body: JSON.stringify({ contact_ids: contactIds }),
  });
}
