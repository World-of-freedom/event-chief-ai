import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill, confidenceTone, type Tone } from "@/components/StatusPill";
import { LeadEvidenceList } from "@/components/discovery/LeadEvidenceList";
import { ScoreBadge, scoreTone } from "@/components/discovery/ScoreBadge";
import { LinkedinIcon, TwitterIcon } from "@/components/icons/SocialIcons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getLeadDetails, getResearchJob } from "@/lib/api/research";
import { AddLeadToPipelineDialog } from "@/features/pipeline/AddLeadToPipelineDialog";
import type { SponsorLead } from "@/types/domain";

const leadVerification: Record<SponsorLead["verification_status"], { label: string; tone: Tone }> = {
  raw: { label: "Unverified", tone: "neutral" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

function ExternalRow({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-2 rounded-lg border bg-background p-3 text-sm transition-colors hover:border-primary/60 [&_svg]:size-3.5"
    >
      <span className="inline-flex items-center gap-1.5">{icon} {label}</span>
      <ExternalLink className="text-muted-foreground" />
    </a>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 text-sm font-medium">{value}</p>
    </div>
  );
}

export function ProspectDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const [lead, setLead] = useState<SponsorLead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const location = useLocation();
  // Return to the research run the lead was opened from, when we know it.
  const backTo = (location.state as { from?: string } | null)?.from ?? "/discovery";
  const backLabel = backTo === "/discovery" ? "Back to sponsor discovery" : "Back to research run";

  useEffect(() => {
    if (!leadId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    getLeadDetails(leadId)
      .then((data) => {
        if (isMounted) setLead(data);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Failed to load sponsor lead details.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [leadId]);

  const handleCopyEmail = async () => {
    if (!lead?.contact_email) return;
    try {
      await navigator.clipboard.writeText(lead.contact_email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      // Clipboard can be blocked (e.g. non-secure context); the email stays visible to copy manually.
    }
  };

  const jobQuery = useQuery({
    queryKey: ["research-job", lead?.job_id],
    queryFn: () => getResearchJob(lead!.job_id),
    enabled: !!lead?.job_id,
  });

  if (isLoading) {
    return <LoadingState label="Loading sponsor lead…" />;
  }

  const backButton = (
    <Button asChild variant="outline">
      <Link to={backTo}>
        <ArrowLeft />
        {lead ? "Back" : backLabel}
      </Link>
    </Button>
  );

  if (error || !lead) {
    return (
      <EmptyState
        icon={<Building2 />}
        title="Sponsor lead not found"
        description={error || "This sponsor lead could not be found."}
        action={backButton}
      />
    );
  }

  const websiteHref = lead.website_url
    ? lead.website_url.startsWith("http") ? lead.website_url : `https://${lead.website_url}`
    : null;

  return (
    <>
      <PageHeader
        title={lead.company_name}
        description={`${lead.verification_status === "verified" ? "Verified sponsor lead" : "Sponsor lead"} discovered via ${lead.discovery_source || "live web research"}.`}
        actions={
          <>
            {backButton}
            <AddLeadToPipelineDialog
              leadId={lead.id}
              companyName={lead.company_name}
              defaultEventId={jobQuery.data?.event_id}
              trigger={<Button variant="outline"><Plus />Add to pipeline</Button>}
            />
            {websiteHref ? (
              <Button asChild>
                <a href={websiteHref} target="_blank" rel="noopener noreferrer">
                  <Globe />
                  Official website
                  <ExternalLink className="size-3" />
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={scoreTone(lead.score_total)}>Match score {lead.score_total}/100</StatusPill>
              <StatusPill tone={confidenceTone(lead.confidence)} className="capitalize">{lead.confidence} confidence</StatusPill>
              <StatusPill tone={leadVerification[lead.verification_status].tone}>{leadVerification[lead.verification_status].label}</StatusPill>
              {lead.location ? (
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {lead.location}
                </span>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Fact label="Industry" value={lead.industry || "General"} />
              <Fact label="Domain" value={lead.domain || "Not listed"} />
              <Fact label="Discovery source" value={lead.discovery_source || "Live web research"} />
              <Fact label="Created" value={new Date(lead.created_at).toLocaleDateString()} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="space-y-6">
            {lead.ranking_explanation ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    Why this match
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground">{lead.ranking_explanation}</p>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  Sponsor fit overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreBadge
                  score={lead.score_total}
                  showBreakdown
                  breakdown={{
                    relevance: lead.score_relevance,
                    industryFit: lead.score_industry_fit,
                    sponsorshipHistory: lead.score_sponsorship_history,
                    geographicFit: lead.score_geographic_fit,
                    budgetCompatibility: lead.score_budget_compatibility,
                    contactability: lead.score_contactability,
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  Cited evidence ({lead.evidence?.length ?? 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LeadEvidenceList evidence={lead.evidence || []} />
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contact &amp; links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {lead.contact_email ? (
                  <div className="rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" /> Email</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon-xs" onClick={() => void handleCopyEmail()} aria-label={copiedEmail ? "Email copied" : "Copy email"}>
                            {copiedEmail ? <Check className="text-success" /> : <Copy />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{copiedEmail ? "Copied" : "Copy email"}</TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="mt-2 font-medium break-all">{lead.contact_email}</p>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-3 text-muted-foreground">No direct email found</p>
                )}

                {lead.contact_phone ? (
                  <div className="rounded-lg border bg-background p-3">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Phone className="size-3.5" /> Phone</span>
                    <p className="mt-2 font-medium">{lead.contact_phone}</p>
                  </div>
                ) : null}

                {lead.sponsorship_page_url ? <ExternalRow href={lead.sponsorship_page_url} icon={<Globe className="text-info" />} label="Sponsorship page" /> : null}
                {lead.linkedin_url ? <ExternalRow href={lead.linkedin_url} icon={<LinkedinIcon />} label="LinkedIn" /> : null}
                {lead.twitter_url ? <ExternalRow href={lead.twitter_url} icon={<TwitterIcon />} label="X / Twitter" /> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y text-sm">
                  {[
                    ["Domain", lead.domain || "Not available"],
                    ["Location", lead.location || "Not specified"],
                    ["Distance", lead.distance_km != null ? `${lead.distance_km} km` : "N/A"],
                    ["Verification", leadVerification[lead.verification_status].label],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium capitalize">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
