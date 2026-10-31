import { useEffect, useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Download, MapPin, PackageCheck, Plus, Search, Sparkles, Users } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill, jobStatusTone } from "@/components/StatusPill";
import { SponsorDiscoveryForm } from "@/components/discovery/SponsorDiscoveryForm";
import { ResearchJobProgress } from "@/components/discovery/ResearchJobProgress";
import { SponsorLeadCard } from "@/components/discovery/SponsorLeadCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createResearchJob,
  getJobLeads,
  getResearchJob,
  getResearchJobByPublicId,
  listResearchJobs,
} from "@/lib/api/research";
import { ApiError } from "@/lib/api/client";
import type { CreateResearchJobInput, ResearchJob, SponsorLead } from "@/types/domain";
import { formatDate, needCategoryLabels } from "@/lib/format";

const slugifyResearchName = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "research";

// URLs look like /discovery/<name-slug>-<public_id>; the name part is only for readability.
const PUBLIC_ID_PATTERN = /^[0-9a-z]{10}$/;

const getResearchRoute = (job: ResearchJob) => {
  const slug = slugifyResearchName(job.event_name);
  return `/discovery/${job.public_id ? `${slug}-${job.public_id}` : slug}`;
};

const publicIdFromRouteParam = (param: string | undefined) => {
  const candidate = param?.split("-").pop();
  return candidate && PUBLIC_ID_PATTERN.test(candidate) ? candidate : null;
};

/** Resolve a route param to a job: by public ID first, then by name slug (older links). */
async function findResearchJob(param: string): Promise<ResearchJob | null> {
  const publicId = publicIdFromRouteParam(param);
  if (publicId) {
    try {
      return await getResearchJobByPublicId(publicId);
    } catch (err) {
      // A 404 can just mean the last slug word looked like an ID (e.g. "innovation"); fall back to the name.
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
  }
  const jobs = await listResearchJobs();
  return jobs.find((job) => slugifyResearchName(job.event_name) === param) ?? null;
}

const formatEventType = (value: string) => {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mb-6 border-destructive/30 bg-destructive-soft">
      <AlertCircle />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function NewDiscoveryButton() {
  return (
    <Button asChild>
      <Link to="/discovery/new">
        <Plus />
        New sponsor discovery
      </Link>
    </Button>
  );
}

function BackButton({ to, label = "Back" }: { to: string; label?: string }) {
  return (
    <Button asChild variant="outline">
      <Link to={to}>
        <ArrowLeft />
        {label}
      </Link>
    </Button>
  );
}

function RequirementTags({ job, compact = false }: { job: ResearchJob; compact?: boolean }) {
  const needs = job.resource_needs ?? [];
  const labels = needs.length ? needs.map((need) => need.title) : (job.support_types_needed ?? []).map((type) => needCategoryLabels[type as keyof typeof needCategoryLabels] ?? type.replace(/_/g, " "));
  if (!labels.length) return <p className="text-xs text-muted-foreground">No specific resource requirements selected.</p>;
  const visible = compact ? labels.slice(0, 3) : labels;
  return <div className="flex flex-wrap gap-1.5">{visible.map((label) => <span key={label} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{label}</span>)}{compact && labels.length > visible.length ? <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">+{labels.length - visible.length}</span> : null}</div>;
}

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
  const [jobs, setJobs] = useState<ResearchJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listResearchJobs()
      .then((data) => {
        if (active) setJobs(data);
      })
      .catch((err: unknown) => {
        console.warn("Could not load research jobs:", err);
        if (active) setErrorMessage(err instanceof Error ? err.message : "Failed to load research runs.");
      })
      .finally(() => {
        if (active) setIsLoadingJobs(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Sponsor discovery"
        description="Research runs grouped by event, with the exact sponsorship requirements that guided each search."
        actions={<NewDiscoveryButton />}
      />

      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

      {isLoadingJobs ? (
        <LoadingState label="Loading research runs…" />
      ) : jobs.length === 0 ? (
        errorMessage ? null : (
          <EmptyState
            icon={<Sparkles />}
            title="No research runs yet"
            description="Choose an event, focus the search on its resource requirements, then find and score the best-fit partners."
            action={<NewDiscoveryButton />}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <Link key={job.id} to={getResearchRoute(job)} className="group rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <Card className="h-full transition-shadow group-hover:shadow-md group-hover:ring-primary/40">
                <CardHeader>
                  <CardDescription className="text-[11px] font-medium tracking-wide uppercase">{formatEventType(job.event_type)}</CardDescription>
                  <CardTitle className="text-lg leading-tight">{job.event_name}</CardTitle>
                  <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
                    <StatusPill tone={jobStatusTone(job.status)} className="capitalize">{job.status}</StatusPill>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />{formatDate(job.start_date)}</span>
                    <span className="flex items-center gap-1.5"><MapPin className="size-3.5" />{job.venue_city}</span>
                  </div>
                  <div className="space-y-1.5"><p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><PackageCheck className="size-3.5" />Sponsorship requirements</p><RequirementTags job={job} compact /></div>
                  <div className="flex justify-between gap-3 border-t pt-3 text-xs"><span className="text-muted-foreground">{job.lead_count} leads found</span><span className="text-muted-foreground">Started {new Date(job.created_at).toLocaleDateString()}</span></div>
                </CardContent>
                <CardFooter className="justify-between text-xs font-medium text-primary">
                  Open research
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function ResearchDetailPage() {
  const { researchName } = useParams<{ researchName: string }>();
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
      const matched = researchName ? await findResearchJob(researchName) : null;
      setSelectedJobId(matched?.id ?? null);
      if (!matched) {
        setActiveJob(null);
        setLeads([]);
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
      setErrorMessage(err?.message || "Failed to load the leads for this research run.");
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

      const matchesConfidence =
        confidenceFilter === "all" ||
        (confidenceFilter === "medium"
          ? lead.confidence === "medium" || lead.confidence === "high"
          : lead.confidence === confidenceFilter);
      const matchesScore = lead.match_score >= minScoreFilter;
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
      "Match Score",
      "Confidence Score",
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
      lead.match_score,
      lead.confidence_score,
      `"${(lead.industry || "").replace(/"/g, '""')}"`,
      `"${(lead.location || "").replace(/"/g, '""')}"`,
      `"${(lead.website_url || "").replace(/"/g, '""')}"`,
      `"${(lead.contact_email || "").replace(/"/g, '""')}"`,
      `"${(lead.contact_phone || "").replace(/"/g, '""')}"`,
      `"${(lead.sponsorship_page_url || "").replace(/"/g, '""')}"`,
      `"${(lead.ranking_explanation || "").replace(/"/g, '""')}"`,
    ]);

    // A Blob avoids the data-URI pitfalls (a "#" in any field used to cut the file short).
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sponsor_leads_${slugifyResearchName(activeJob?.event_name || "event")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Also wait while the matched job's details load, so "not found" never flashes first.
  if (isLoadingJobs || (selectedJobId && !activeJob && !errorMessage)) {
    return <LoadingState label="Loading research run…" />;
  }

  if (!activeJob && !isLoadingLeads && !errorMessage) {
    return (
      <EmptyState
        icon={<Sparkles />}
        title="Research run not found"
        description="The research run you requested could not be found."
        action={<BackButton to="/discovery" label="Back to sponsor discovery" />}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={activeJob?.event_name || "Sponsor discovery"}
        description={
          activeJob
            ? `${formatEventType(activeJob.event_type)} · ${activeJob.venue_city}. ${activeJob.progress_message || "Review the sponsor recommendations generated for this event."}`
            : "Research record"
        }
        actions={
          <>
            <BackButton to="/discovery" />
            <NewDiscoveryButton />
          </>
        }
      />

      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

      {activeJob ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card size="sm"><CardHeader><CardTitle>Event brief</CardTitle><CardDescription>The saved event context used for this research run.</CardDescription></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><div className="flex gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{formatDate(activeJob.start_date)}{activeJob.end_date && activeJob.end_date !== activeJob.start_date ? ` – ${formatDate(activeJob.end_date)}` : ""}</p></div></div><div className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{activeJob.event_format === "online" ? "Online" : activeJob.venue_city}</p></div></div><div className="flex gap-2 sm:col-span-2"><Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Audience</p><p className="font-medium">{activeJob.primary_audience || "Not specified"}</p></div></div></CardContent></Card>
            <Card size="sm"><CardHeader><CardTitle>Sponsor brief</CardTitle><CardDescription>What this discovery run asks of potential partners.</CardDescription></CardHeader><CardContent className="space-y-4"><div><p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><PackageCheck className="size-3.5" />Resource requirements</p><RequirementTags job={activeJob} /></div>{activeJob.sponsor_benefits ? <BriefItem label="Benefits offered" value={activeJob.sponsor_benefits} /> : null}{activeJob.eligibility_constraints ? <BriefItem label="Partner constraints" value={activeJob.eligibility_constraints} /> : null}{activeJob.additional_notes ? <BriefItem label="Additional notes" value={activeJob.additional_notes} /> : null}</CardContent></Card>
          </div>

          <ResearchJobProgress job={activeJob} />
        </div>
      ) : null}

      {activeJob && leads.length > 0 ? (
        <Card size="sm" className="mt-6" aria-label="Discovery filters">
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter leads by company, keyword, or city…"
                  aria-label="Filter leads"
                  className="pl-8"
                />
              </div>
              <Button variant="outline" onClick={exportToCsv} disabled={!filteredLeads.length} title="Export filtered sponsor leads to CSV">
                <Download />
                Export leads ({filteredLeads.length})
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                <SelectTrigger size="sm" aria-label="Industry"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All industries</SelectItem>
                  {uniqueIndustries.map((industry) => (
                    <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
                <SelectTrigger size="sm" aria-label="Confidence"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any confidence</SelectItem>
                  <SelectItem value="high">High only</SelectItem>
                  <SelectItem value="medium">Medium &amp; high</SelectItem>
                  <SelectItem value="low">Low only</SelectItem>
                </SelectContent>
              </Select>

              <Select value={String(minScoreFilter)} onValueChange={(value) => setMinScoreFilter(parseInt(value, 10))}>
                <SelectTrigger size="sm" aria-label="Minimum score"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any score</SelectItem>
                  <SelectItem value="40">40+ points</SelectItem>
                  <SelectItem value="60">60+ points</SelectItem>
                  <SelectItem value="75">75+ points</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 sm:ml-auto">
                <Checkbox id="has-email-only" checked={hasEmailOnly} onCheckedChange={(checked) => setHasEmailOnly(checked === true)} />
                <Label htmlFor="has-email-only" className="font-normal">Has email only</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeJob ? (
        <section aria-label="Ranked sponsor leads" className="mt-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Showing <span className="font-semibold text-foreground">{filteredLeads.length}</span> ranked sponsor candidates
              {filteredLeads.length !== leads.length ? ` (filtered from ${leads.length})` : null}
            </span>
            <span>Sorted by deterministic match score, then evidence confidence</span>
          </div>

          {filteredLeads.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredLeads.map((lead) => (
                <SponsorLeadCard key={lead.id} lead={lead} eventId={activeJob.event_id} />
              ))}
            </div>
          ) : activeJob.status === "completed" ? (
            <EmptyState
              icon={<Search />}
              title="No matching leads"
              description={leads.length ? "No leads match the current filters. Try adjusting or clearing them." : "This research run finished without any sponsor leads."}
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function BriefItem({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed">{value}</p></div>;
}

function NewResearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
        title="New sponsor discovery"
        description="Choose an event, focus its requirements, and launch live sponsor research."
        actions={<BackButton to="/discovery" />}
      />

      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

      {currentJob ? (
        <ResearchJobProgress job={currentJob} />
      ) : (
        <SponsorDiscoveryForm onSubmit={handleCreateJob} onCancel={() => navigate("/discovery")} isSubmitting={isSubmitting} initialEventId={searchParams.get("event")} />
      )}
    </>
  );
}
