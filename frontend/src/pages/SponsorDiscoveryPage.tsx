import React, { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
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

const slugifyResearchName = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "research";

const getResearchRoute = (job: ResearchJob) => `/discovery/${slugifyResearchName(job.event_name)}`;

export function SponsorDiscoveryPage() {
  return (
    <Routes>
      <Route index element={<ResearchJobsOverviewPage />} />
      <Route path="new" element={<NewResearchPage />} />
      <Route path=":researchName" element={<ResearchDetailPage />} />
    </Routes>
  );
}

function ResearchJobsOverviewPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      setIsLoadingJobs(true);
      setErrorMessage(null);
      const data = await listResearchJobs();
      setJobs(data);
    } catch (err: any) {
      console.warn("Could not load research jobs:", err);
      setErrorMessage(err.message || "Failed to load jobs");
    } finally {
      setIsLoadingJobs(false);
    }
  };

  useEffect(() => {
    void fetchJobs();
  }, []);

  return (
    <>
      <PageHeader
        title="Sponsor Discovery"
        description="Autonomous LangChain research engine: finds real brand sponsors via live search, extracts verified evidence, and scores leads."
        actions={
          <button
            onClick={() => navigate("/discovery/new")}
            className="button text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Sponsor Discovery
          </button>
        }
      />

      {errorMessage && (
        <div className="discovery-error" role="alert">
          {errorMessage}
        </div>
      )}

      {isLoadingJobs ? (
        <div className="flex justify-center py-12 text-sm text-[var(--muted)]">Loading research entries…</div>
      ) : jobs.length === 0 ? (
        <div className="empty-state border border-[var(--line)] bg-[var(--surface-raised)] rounded-2xl p-10 text-center my-6">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text)] m-0">No Sponsor Research Jobs Yet</h2>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto mt-2 mb-6">
            Launch a sponsor discovery workflow to gather and score the best-fit partners for your next event.
          </p>
          <button
            onClick={() => navigate("/discovery/new")}
            className="button text-sm font-bold px-5 py-2.5 inline-flex items-center gap-2 shadow"
          >
            <Plus className="w-4 h-4" />
            New Sponsor Discovery
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={getResearchRoute(job)}
              className="group block rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {job.event_type}
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-[var(--text)] m-0">{job.event_name}</h3>
                </div>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                    job.status === "completed"
                      ? "bg-[var(--success-soft)] text-[var(--success)]"
                      : job.status === "failed"
                        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                        : "bg-[var(--info-soft)] text-[var(--info)]"
                  }`}
                >
                  {job.status}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm text-[var(--muted-strong)]">
                <div className="flex items-center justify-between gap-3">
                  <span>Location</span>
                  <span className="font-semibold text-[var(--text)]">{job.venue_city}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Created</span>
                  <span className="font-semibold text-[var(--text)]">{new Date(job.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Leads</span>
                  <span className="font-semibold text-[var(--text)]">{job.leads?.length ?? 0}</span>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
                {job.progress_message || "Research run recorded."}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs font-medium text-[var(--accent)]">
                <span>Open research</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function ResearchDetailPage() {
  const { researchName } = useParams<{ researchName: string }>();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ResearchJob | null>(null);
  const [leads, setLeads] = useState<SponsorLead[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndustry, setSelectedIndustry] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [hasEmailOnly, setHasEmailOnly] = useState(false);

  const fetchJobs = async () => {
    try {
      setIsLoadingJobs(true);
      setErrorMessage(null);
      const data = await listResearchJobs();
      setJobs(data);
      const matched = data.find((job) => slugifyResearchName(job.event_name) === researchName);
      if (matched) {
        setSelectedJobId(matched.id);
      }
    } catch (err: any) {
      console.warn("Could not load research jobs:", err);
      setErrorMessage(err.message || "Failed to load this research run.");
    } finally {
      setIsLoadingJobs(false);
    }
  };

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
    void fetchJobs();
  }, [researchName]);

  useEffect(() => {
    if (!selectedJobId) return;
    void loadJobDetails(selectedJobId);

    const pollInterval = setInterval(async () => {
      try {
        const updated = await getResearchJob(selectedJobId);
        setActiveJob((prev) => (prev ? { ...prev, ...updated } : updated));

        if (updated.status === "completed" || updated.status === "failed") {
          clearInterval(pollInterval);
          if (updated.status === "completed") {
            void loadJobDetails(selectedJobId);
          }
        }
      } catch (e) {
        clearInterval(pollInterval);
      }
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [selectedJobId]);

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

      const matchesConfidence = confidenceFilter === "all" || lead.confidence === confidenceFilter;
      const matchesScore = lead.score_total >= minScoreFilter;
      const matchesEmail = !hasEmailOnly || Boolean(lead.contact_email);

      return matchesSearch && matchesIndustry && matchesConfidence && matchesScore && matchesEmail;
    });
  }, [leads, searchQuery, selectedIndustry, confidenceFilter, minScoreFilter, hasEmailOnly]);

  const uniqueIndustries = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((lead) => {
      if (lead.industry) set.add(lead.industry);
    });
    return Array.from(set);
  }, [leads]);

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

    const rows = filteredLeads.map((lead) => [
      `"${lead.company_name.replace(/"/g, '""')}"`,
      lead.score_total,
      lead.confidence,
      `"${(lead.industry || "").replace(/"/g, '""')}"`,
      `"${(lead.location || "").replace(/"/g, '""')}"`,
      `"${(lead.website_url || "").replace(/"/g, '""')}"`,
      `"${(lead.contact_email || "").replace(/"/g, '""')}"`,
      `"${(lead.contact_phone || "").replace(/"/g, '""')}"`,
      `"${(lead.sponsorship_page_url || "").replace(/"/g, '""')}"`,
      `"${(lead.ranking_explanation || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sponsor_leads_${activeJob?.event_name || "event"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoadingJobs) {
    return <div className="flex justify-center py-12 text-sm text-[var(--muted)]">Loading research details…</div>;
  }

  if (!activeJob && !isLoadingLeads && !errorMessage) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 border border-[var(--line)] bg-[var(--surface-raised)] rounded-2xl text-center">
        <Sparkles className="w-12 h-12 text-[var(--muted)] mx-auto mb-3" />
        <h2 className="text-xl font-bold text-[var(--text)] m-0">Research Run Not Found</h2>
        <p className="text-sm text-[var(--muted)] mt-2 mb-6">
          The research entry you requested could not be found.
        </p>
        <Link to="/discovery" className="button inline-flex items-center gap-2 text-xs">
          <ArrowLeft className="w-4 h-4" /> Back to Sponsor Discovery
        </Link>
      </div>
    );
  }

  const pageTitle = activeJob?.event_name || "Sponsor Discovery";

  return (
    <>
      <PageHeader
        title={pageTitle}
        description={
          activeJob
            ? `Research record for ${activeJob.venue_city}. ${activeJob.progress_message || "Review the sponsor recommendations generated for this event."}`
            : "Research record"
        }
        actions={
          <div className="flex items-center gap-2">
            <Link to="/discovery" className="button button-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </Link>
            <button
              onClick={() => navigate("/discovery/new")}
              className="button text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Sponsor Discovery
            </button>
          </div>
        }
      />

      {errorMessage && (
        <div className="discovery-error" role="alert">
          {errorMessage}
        </div>
      )}

      {activeJob && (
        <>
          <div className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--muted)]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] font-semibold">Research summary</span>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span><strong className="text-[var(--text)]">City:</strong> {activeJob.venue_city}</span>
                  <span><strong className="text-[var(--text)]">Audience:</strong> {activeJob.primary_audience || "General"}</span>
                  <span><strong className="text-[var(--text)]">Budget:</strong> {activeJob.budget_target_inr ? `₹${Number(activeJob.budget_target_inr).toLocaleString()}` : "Open"}</span>
                </div>
              </div>
              <button
                onClick={() => navigate("/discovery/new")}
                className="button button-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Start another run
              </button>
            </div>
          </div>

          <ResearchJobProgress job={activeJob} />
        </>
      )}

      {activeJob && leads.length > 0 && (
        <section className="mt-6 flex flex-col gap-3 p-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]" aria-label="Discovery filters">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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

            <button
              onClick={exportToCsv}
              className="button button-secondary text-xs px-3 py-2 flex items-center gap-1.5 flex-shrink-0"
              title="Export filtered sponsor leads to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Export Leads ({filteredLeads.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--line)] text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--muted)] font-medium">Industry:</span>
              <select
                value={selectedIndustry}
                onChange={(e) => setSelectedIndustry(e.target.value)}
                className="text-xs py-1 px-2 rounded border border-[var(--line)] bg-[var(--surface)] text-[var(--text)]"
              >
                <option value="all">All Industries</option>
                {uniqueIndustries.map((industry) => (
                  <option key={industry} value={industry}>{industry}</option>
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
                onChange={(e) => setMinScoreFilter(parseInt(e.target.value, 10))}
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

      {activeJob && (
        <section aria-label="Ranked sponsor leads" className="mt-6 flex flex-col gap-4">
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
            activeJob.status === "completed" && (
              <div className="p-8 text-center border border-[var(--line)] bg-[var(--surface-raised)] rounded-xl">
                <p className="text-sm text-[var(--muted)] m-0">
                  No leads matched the current filter criteria. Try adjusting or clearing your filters.
                </p>
              </div>
            )
          )}
        </section>
      )}
    </>
  );
}

function NewResearchPage() {
  const navigate = useNavigate();
  const [currentJob, setCurrentJob] = useState<ResearchJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreateJob = async (input: CreateResearchJobInput) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const newJob = await createResearchJob(input);
      setCurrentJob(newJob);
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to launch research job.");
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!currentJob || !(currentJob.status === "pending" || currentJob.status === "running")) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const updated = await getResearchJob(currentJob.id);
        setCurrentJob(updated);

        if (updated.status === "completed") {
          clearInterval(interval);
          navigate(getResearchRoute(updated), { replace: true });
        }

        if (updated.status === "failed") {
          clearInterval(interval);
          setErrorMessage(updated.error_message || "Research failed and no sponsor list was generated.");
          setIsSubmitting(false);
        }
      } catch (err: any) {
        clearInterval(interval);
        setErrorMessage(err?.message || "Unable to track the research status.");
        setIsSubmitting(false);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [currentJob, navigate]);

  return (
    <>
      <PageHeader
        title="New Sponsor Discovery"
        description="Define your event and launch a live sponsor research run."
        actions={
          <Link to="/discovery" className="button button-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to list
          </Link>
        }
      />

      {errorMessage && (
        <div className="discovery-error" role="alert">
          {errorMessage}
        </div>
      )}

      {currentJob ? (
        <div className="mt-6">
          <ResearchJobProgress job={currentJob} />
        </div>
      ) : (
        <div className="mt-6">
          <EventDetailsForm
            onSubmit={handleCreateJob}
            onCancel={() => navigate("/discovery")}
            isSubmitting={isSubmitting}
          />
        </div>
      )}
    </>
  );
}
