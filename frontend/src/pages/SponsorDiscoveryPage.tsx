import React, { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Plus,
  RefreshCw,
  Download,
  Search,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { EventDetailsForm } from "@/components/discovery/EventDetailsForm";
import { ResearchJobProgress } from "@/components/discovery/ResearchJobProgress";
import { SponsorLeadCard } from "@/components/discovery/SponsorLeadCard";
import {
  createResearchJob,
  getJobLeads,
  getResearchJob,
  listResearchJobs,
} from "@/lib/api/research";
import type { CreateResearchJobInput, ResearchJob, SponsorLead } from "@/types/domain";

export function SponsorDiscoveryPage() {
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ResearchJob | null>(null);
  const [leads, setLeads] = useState<SponsorLead[]>([]);

  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [hasEmailOnly, setHasEmailOnly] = useState(false);

  // ── Load User's Research Jobs ──────────────────────────────────────────────
  const fetchJobs = async () => {
    try {
      setIsLoadingJobs(true);
      setErrorMessage(null);
      const data = await listResearchJobs();
      setJobs(data);

      if (data.length > 0 && !selectedJobId) {
        setSelectedJobId(data[0].id);
      }
    } catch (err: any) {
      console.warn("Could not load research jobs:", err);
      // In offline/initial dev mode, leave jobs empty
      setErrorMessage(err.message || "Failed to load jobs");
    } finally {
      setIsLoadingJobs(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // ── Load Leads for Selected Job ────────────────────────────────────────────
  const loadJobDetails = async (jobId: string) => {
    try {
      setIsLoadingLeads(true);
      const jobWithLeads = await getJobLeads(jobId);
      setActiveJob(jobWithLeads);
      setLeads(jobWithLeads.leads || []);
    } catch (err: any) {
      console.error("Failed to fetch job leads:", err);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  useEffect(() => {
    if (!selectedJobId) return;

    loadJobDetails(selectedJobId);

    // If job is in progress, poll until completion
    const pollInterval = setInterval(async () => {
      try {
        const updated = await getResearchJob(selectedJobId);
        setActiveJob((prev) => (prev ? { ...prev, ...updated } : updated));

        if (updated.status === "completed" || updated.status === "failed") {
          clearInterval(pollInterval);
          if (updated.status === "completed") {
            loadJobDetails(selectedJobId);
          }
        }
      } catch (e) {
        clearInterval(pollInterval);
      }
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [selectedJobId]);

  // ── Handle New Job Creation ────────────────────────────────────────────────
  const handleCreateJob = async (input: CreateResearchJobInput) => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const newJob = await createResearchJob(input);
      setJobs((prev) => [newJob, ...prev]);
      setSelectedJobId(newJob.id);
      setActiveJob(newJob);
      setLeads([]);
      setShowCreateForm(false);
    } catch (err: any) {
      const message = err?.message || "Failed to launch research job.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Filter & Search Computation ───────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        lead.company_name.toLowerCase().includes(q) ||
        (lead.industry && lead.industry.toLowerCase().includes(q)) ||
        (lead.location && lead.location.toLowerCase().includes(q)) ||
        (lead.description && lead.description.toLowerCase().includes(q));

      const matchesIndustry =
        selectedIndustry === "all" ||
        (lead.industry && lead.industry.toLowerCase() === selectedIndustry.toLowerCase());

      const matchesConfidence =
        confidenceFilter === "all" || lead.confidence === confidenceFilter;

      const matchesScore = lead.score_total >= minScoreFilter;

      const matchesEmail = !hasEmailOnly || Boolean(lead.contact_email);

      return (
        matchesSearch &&
        matchesIndustry &&
        matchesConfidence &&
        matchesScore &&
        matchesEmail
      );
    });
  }, [
    leads,
    searchQuery,
    selectedIndustry,
    confidenceFilter,
    minScoreFilter,
    hasEmailOnly,
  ]);

  // Extract distinct industries from leads for filter dropdown
  const uniqueIndustries = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.industry) set.add(l.industry);
    });
    return Array.from(set);
  }, [leads]);

  // ── Export Leads to CSV ────────────────────────────────────────────────────
  const exportToCsv = () => {
    if (!filteredLeads.length) return;

    const headers = [
      "Company Name",
      "Total Score",
      "Confidence",
      "Industry",
      "Location",
      "Website",
      "Contact Email",
      "Contact Phone",
      "Sponsorship Page",
      "Ranking Explanation",
    ];

    const rows = filteredLeads.map((l) => [
      `"${l.company_name.replace(/"/g, '""')}"`,
      l.score_total,
      l.confidence,
      `"${(l.industry || "").replace(/"/g, '""')}"`,
      `"${(l.location || "").replace(/"/g, '""')}"`,
      `"${(l.website_url || "").replace(/"/g, '""')}"`,
      `"${(l.contact_email || "").replace(/"/g, '""')}"`,
      `"${(l.contact_phone || "").replace(/"/g, '""')}"`,
      `"${(l.sponsorship_page_url || "").replace(/"/g, '""')}"`,
      `"${(l.ranking_explanation || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sponsor_leads_${activeJob?.event_name || "event"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <PageHeader
        title="Sponsor Discovery"
        description="Autonomous LangChain research engine: finds real brand sponsors via live search, extracts verified evidence, and scores leads."
        actions={
          <div className="flex items-center gap-2">
            {jobs.length > 0 && (
              <button
                onClick={() => fetchJobs()}
                className="button button-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
                title="Refresh research jobs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            )}

            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="button text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5 shadow-sm"
            >
              {showCreateForm ? "Close Form" : <><Plus className="w-4 h-4" /> New Sponsor Discovery</>}
            </button>
          </div>
        }
      />

      {/* Creation Form (Collapsible) */}
      {showCreateForm && (
        <section className="mb-8" aria-label="New Sponsor Discovery Job">
          <EventDetailsForm
            onSubmit={handleCreateJob}
            onCancel={() => setShowCreateForm(false)}
            isSubmitting={isSubmitting}
          />
        </section>
      )}

      {/* Main Content Area */}
      {jobs.length === 0 && !showCreateForm && !isLoadingJobs ? (
        <div className="empty-state border border-[var(--line)] bg-[var(--surface-raised)] rounded-2xl p-10 text-center my-6">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text)] m-0">No Sponsor Research Jobs Yet</h2>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto mt-2 mb-6">
            Input your event parameters (city, footfall, target audience, budget, support types) to discover and rank verified sponsors.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="button text-sm font-bold px-5 py-2.5 inline-flex items-center gap-2 shadow"
          >
            <Plus className="w-4 h-4" />
            Launch First Sponsor Discovery
          </button>
        </div>
      ) : (
        <div className="discovery-shell">
          {errorMessage && (
            <div className="discovery-error" role="alert">
              {errorMessage}
            </div>
          )}

          {/* Job Selector Bar (when multiple jobs exist) */}
          {jobs.length > 0 && (
            <div className="discovery-panel discovery-summary flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--muted-strong)]">Active Research Run:</span>
                <select
                  value={selectedJobId || ""}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="bg-[var(--surface-raised)] border border-[var(--line)] rounded-lg px-2.5 py-1 text-xs font-semibold text-[var(--text)]"
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.event_name} ({j.venue_city}) — {j.status.toUpperCase()} ({new Date(j.created_at).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              {activeJob && (
                <div className="flex items-center gap-3 text-[var(--muted)]">
                  <span>
                    Audience: <strong className="text-[var(--text)]">{activeJob.primary_audience || "General"}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Footfall: <strong className="text-[var(--text)]">{activeJob.expected_footfall || "N/A"}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Target: <strong className="text-[var(--text)]">{activeJob.budget_target_inr ? `₹${Number(activeJob.budget_target_inr).toLocaleString()}` : "Open"}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Active Job Progress Widget */}
          {activeJob && (
            <section aria-label="Job progress">
              <ResearchJobProgress job={activeJob} />
            </section>
          )}

          {/* Filter Toolbar (Visible when leads are present or job completed) */}
          {leads.length > 0 && (
            <section className="flex flex-col gap-3 p-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]" aria-label="Discovery filters">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Search query */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--muted)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter leads by company, keyword, or city…"
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>

                {/* Export button */}
                <button
                  onClick={exportToCsv}
                  className="button button-secondary text-xs px-3 py-2 flex items-center gap-1.5 flex-shrink-0"
                  title="Export filtered sponsor leads to CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Leads ({filteredLeads.length})
                </button>
              </div>

              {/* Filter controls row */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--line)] text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--muted)] font-medium">Industry:</span>
                  <select
                    value={selectedIndustry}
                    onChange={(e) => setSelectedIndustry(e.target.value)}
                    className="text-xs py-1 px-2 rounded border border-[var(--line)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="all">All Industries</option>
                    {uniqueIndustries.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--muted)] font-medium">Confidence:</span>
                  <select
                    value={confidenceFilter}
                    onChange={(e) => setConfidenceFilter(e.target.value)}
                    className="text-xs py-1 px-2 rounded border border-[var(--line)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="all">All Confidences</option>
                    <option value="high">High Confidence Only</option>
                    <option value="medium">Medium +</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--muted)] font-medium">Min Score:</span>
                  <select
                    value={minScoreFilter}
                    onChange={(e) => setMinScoreFilter(parseInt(e.target.value))}
                    className="text-xs py-1 px-2 rounded border border-[var(--line)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value={0}>Any Score</option>
                    <option value={40}>40+ Points</option>
                    <option value={60}>60+ Points</option>
                    <option value={75}>75+ Points</option>
                  </select>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer ml-auto text-[var(--muted-strong)] font-medium">
                  <input
                    type="checkbox"
                    checked={hasEmailOnly}
                    onChange={(e) => setHasEmailOnly(e.target.checked)}
                    className="rounded text-[var(--accent)]"
                  />
                  Has Verified Email Only
                </label>
              </div>
            </section>
          )}

          {/* Leads Grid */}
          <section aria-label="Ranked sponsor leads" className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted)]">
              <span>
                Showing <strong className="text-[var(--text)]">{filteredLeads.length}</strong> ranked sponsor candidates
                {filteredLeads.length !== leads.length && ` (filtered from ${leads.length})`}
              </span>
              <span>Sorted by composite match score (100 pts)</span>
            </div>

            {filteredLeads.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLeads.map((lead) => (
                  <SponsorLeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            ) : (
              activeJob?.status === "completed" && (
                <div className="p-8 text-center border border-[var(--line)] bg-[var(--surface-raised)] rounded-xl">
                  <p className="text-sm text-[var(--muted)] m-0">
                    No leads matched the current filter criteria. Try adjusting or clearing your filters.
                  </p>
                </div>
              )
            )}
          </section>
        </div>
      )}
    </>
  );
}
