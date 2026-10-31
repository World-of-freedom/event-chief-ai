import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  FileText,
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
import { StatusPill, type Tone } from "@/components/StatusPill";
import { LeadEvidenceList } from "@/components/discovery/LeadEvidenceList";
import { ScoreBadge } from "@/components/discovery/ScoreBadge";
import { LinkedinIcon, TwitterIcon } from "@/components/icons/SocialIcons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getLeadDetails, getResearchJob } from "@/lib/api/research";
import { AddLeadToPipelineDialog } from "@/features/pipeline/AddLeadToPipelineDialog";
import type { LeadContact, SponsorLead } from "@/types/domain";

const leadVerification: Record<SponsorLead["verification_status"], { label: string; tone: Tone }> = {
  raw: { label: "Unverified", tone: "neutral" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

const contactStatus: Record<string, string> = {
  source_confirmed_mailbox_unverified: "Source confirmed · Mailbox unverified",
  deliverability_checked: "Deliverability checked · Provider result",
  could_not_confirm: "Could not confirm",
  source_confirmed_reachability_unchecked: "Source confirmed · Reachability unchecked",
  official_route_available: "Official contact route",
  route_needs_review: "Contact route needs review",
  needs_review: "Not found or needs review",
};

function contactTone(contact: LeadContact): Tone {
  if (contact.display_status === "deliverability_checked") return "success";
  if (contact.display_status.includes("confirmed") || contact.display_status === "official_route_available") return "info";
  if (contact.display_status === "could_not_confirm" || contact.display_status === "needs_review") return "warning";
  return "neutral";
}

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

function ScoreDetailsDialog({
  lead,
  kind,
}: {
  lead: SponsorLead;
  kind: "match" | "confidence";
}) {
  const isMatch = kind === "match";
  const score = isMatch ? lead.match_score : lead.confidence_score;
  const components = isMatch ? lead.match_score_components : lead.confidence_score_components;
  const title = isMatch ? "Match score" : "Confidence score";
  const description = isMatch
    ? "How closely this sponsor aligns with the event and its sponsorship needs."
    : "How strong and reliable the retained research evidence is.";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-auto w-full min-w-0 flex-1 flex-col items-start gap-1.5 p-4 text-left whitespace-normal hover:border-primary/60 sm:w-auto">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</span>
          <span className="font-heading text-2xl font-semibold">{score}<span className="text-sm text-muted-foreground">/100</span></span>
          <span className="text-xs text-primary">View breakdown</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="min-w-0 max-h-[calc(100svh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-2xl"
        style={{ width: "min(42rem, calc(100vw - 2rem))" }}
      >
        <DialogHeader>
          <DialogTitle>{title}: {score}/100</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ScoreBadge
          matchScore={lead.match_score}
          confidenceScore={lead.confidence_score}
          showScores={false}
          showBreakdown
          breakdown={kind}
          matchComponents={lead.match_score_components}
          confidenceComponents={lead.confidence_score_components}
        />
        {!components ? (
          <p className="text-sm text-muted-foreground">No detailed score factors were retained for this lead.</p>
        ) : null}
        {isMatch && lead.ranking_explanation ? (
          <div className="border-t pt-4">
            <p className="text-sm font-medium">Why this sponsor matches</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{lead.ranking_explanation}</p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CitationsDialog({ evidence }: { evidence: SponsorLead["evidence"] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="inline-flex min-w-0 items-center gap-2"><FileText className="text-primary" />Citations</span>
          <span className="text-muted-foreground">{evidence.length} source{evidence.length === 1 ? "" : "s"} · View</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="min-w-0 max-h-[calc(100svh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-2xl"
        style={{ width: "min(42rem, calc(100vw - 2rem))" }}
      >
        <DialogHeader>
          <DialogTitle>Cited evidence</DialogTitle>
          <DialogDescription>Each citation links to the source used for this sponsor record.</DialogDescription>
        </DialogHeader>
        <LeadEvidenceList evidence={evidence} />
      </DialogContent>
    </Dialog>
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

  const handleCopyEmail = async (email = lead?.contact_email) => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
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

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.9fr)]">
          <section className="min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  Sponsor fit overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <ScoreDetailsDialog lead={lead} kind="match" />
                  <ScoreDetailsDialog lead={lead} kind="confidence" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  Citations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">Source-backed claims are kept available without crowding the sponsor overview.</p>
                <CitationsDialog evidence={lead.evidence || []} />
              </CardContent>
            </Card>
          </section>

          <aside className="min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contact &amp; links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {lead.contacts.length ? lead.contacts.map((contact) => (
                  <div key={contact.id} className="space-y-2 rounded-lg border bg-background p-3">
                    <div className="flex items-start justify-between gap-2 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        {contact.kind === "email" ? <Mail className="size-3.5" /> : contact.kind === "phone" ? <Phone className="size-3.5" /> : <Globe className="size-3.5" />}
                        {contact.kind.replace("_", " ")}
                      </span>
                      {contact.kind === "email" ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon-xs" onClick={() => void handleCopyEmail(contact.normalized_value || contact.value)} aria-label={copiedEmail ? "Email copied" : "Copy email"}>
                              {copiedEmail ? <Check className="text-success" /> : <Copy />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{copiedEmail ? "Copied" : "Copy email"}</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                    {contact.kind === "contact_form" ? (
                      <a className="font-medium text-primary hover:underline" href={contact.value} target="_blank" rel="noopener noreferrer">Open contact route</a>
                    ) : contact.kind === "email" ? (
                      <a className="block truncate font-medium text-primary hover:underline" href={`mailto:${contact.normalized_value || contact.value}`}>{contact.normalized_value || contact.value}</a>
                    ) : (
                      <a className="block break-all font-medium text-primary hover:underline" href={`tel:${contact.normalized_value || contact.value}`}>{contact.normalized_value || contact.value}</a>
                    )}
                    {contact.contact_role ? <p className="text-xs text-muted-foreground">{contact.contact_role}</p> : null}
                    <StatusPill tone={contactTone(contact)}>{contactStatus[contact.display_status] || "Needs review"}</StatusPill>
                    <a href={contact.source_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">
                      Source: {contact.source_title || contact.source_url}
                    </a>
                    {contact.retrieved_at ? <p className="text-[11px] text-muted-foreground">Retrieved {new Date(contact.retrieved_at).toLocaleDateString()}</p> : null}
                  </div>
                )) : (
                  <p className="rounded-lg border border-dashed p-3 text-muted-foreground">No direct contact found. Use the official contact or sponsorship route when available.</p>
                )}

                {lead.sponsorship_page_url ? <ExternalRow href={lead.sponsorship_page_url} icon={<Globe className="text-info" />} label="Sponsorship page" /> : null}
                {lead.linkedin_url ? <ExternalRow href={lead.linkedin_url} icon={<LinkedinIcon />} label="LinkedIn" /> : null}
                {lead.twitter_url ? <ExternalRow href={lead.twitter_url} icon={<TwitterIcon />} label="X / Twitter" /> : null}
                {lead.instagram_url ? <ExternalRow href={lead.instagram_url} icon={<Globe className="text-info" />} label="Instagram" /> : null}
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
