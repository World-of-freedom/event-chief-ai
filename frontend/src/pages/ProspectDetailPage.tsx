import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { LinkedinIcon, TwitterIcon } from "@/components/icons/SocialIcons";

import { PageHeader } from "@/components/PageHeader";
import { LeadEvidenceList } from "@/components/discovery/LeadEvidenceList";
import { ScoreBadge } from "@/components/discovery/ScoreBadge";
import { getLeadDetails } from "@/lib/api/research";
import type { SponsorLead } from "@/types/domain";

export function ProspectDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const [lead, setLead] = useState<SponsorLead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    if (!leadId) return;

    let isMounted = true;
    setIsLoading(true);

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

  const handleCopyEmail = () => {
    if (lead?.contact_email) {
      navigator.clipboard.writeText(lead.contact_email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        <p className="text-sm text-[var(--muted)]">Loading sponsor lead details…</p>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 border border-[var(--line)] bg-[var(--surface-raised)] rounded-2xl text-center">
        <Building2 className="w-12 h-12 text-[var(--muted)] mx-auto mb-3" />
        <h2 className="text-xl font-bold text-[var(--text)] m-0">Sponsor Lead Not Found</h2>
        <p className="text-sm text-[var(--muted)] mt-2 mb-6">
          {error || "The requested sponsor candidate could not be found or has not been verified."}
        </p>
        <Link to="/discovery" className="button inline-flex items-center gap-2 text-xs">
          <ArrowLeft className="w-4 h-4" /> Back to Sponsor Discovery
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <Link
          to="/discovery"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--accent)] font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Sponsor Discovery
        </Link>
      </div>

      <PageHeader
        title={lead.company_name}
        description={`Verified sponsor lead discovered via ${lead.discovery_source || "live web research"}.`}
        actions={
          <div className="flex items-center gap-2">
            {lead.website_url && (
              <a
                href={lead.website_url.startsWith("http") ? lead.website_url : `https://${lead.website_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="button text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                Official Website
                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </a>
            )}
          </div>
        }
      />

      <div className="my-6 space-y-6">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
                Match score {lead.score_total}/100
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                  lead.confidence === "high"
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : lead.confidence === "medium"
                    ? "bg-[var(--info-soft)] text-[var(--info)]"
                    : "bg-[var(--warning-soft)] text-[var(--warning)]"
                }`}
              >
                {lead.confidence} confidence
              </span>
              {lead.location && (
                <span className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)]">
                  <MapPin className="h-3.5 w-3.5" />
                  {lead.location}
                </span>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Industry</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">{lead.industry || "General"}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Domain</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">{lead.domain || "Not listed"}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Discovery source</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">{lead.discovery_source || "Live web research"}</p>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">Created</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text)]">{new Date(lead.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="space-y-6">
            {lead.ranking_explanation && (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                  <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                  Why this match
                </h3>
                <p className="m-0 text-sm leading-relaxed text-[var(--muted-strong)]">{lead.ranking_explanation}</p>
              </div>
            )}

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
                Sponsor fit overview
              </h3>

              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <ScoreBadge
                  score={lead.score_total}
                  showBreakdown={true}
                  breakdown={{
                    relevance: lead.score_relevance,
                    industryFit: lead.score_industry_fit,
                    sponsorshipHistory: lead.score_sponsorship_history,
                    geographicFit: lead.score_geographic_fit,
                    budgetCompatibility: lead.score_budget_compatibility,
                    contactability: lead.score_contactability,
                  }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                Evidence
              </h3>
              <LeadEvidenceList evidence={lead.evidence || []} />
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
              <h3 className="mb-4 text-sm font-bold text-[var(--text)]">Contact & links</h3>

              <div className="space-y-3 text-sm">
                {lead.contact_email ? (
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                    <div className="flex items-center justify-between gap-2 text-[var(--muted)]">
                      <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</span>
                      <button onClick={handleCopyEmail} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]" title="Copy email">
                        {copiedEmail ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="mt-2 break-all text-[var(--text)] font-medium">{lead.contact_email}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-3 text-[var(--muted)]">No direct email found</div>
                )}

                {lead.contact_phone && (
                  <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                    <div className="inline-flex items-center gap-1.5 text-[var(--muted)]"><Phone className="h-3.5 w-3.5" /> Phone</div>
                    <p className="mt-2 text-[var(--text)] font-medium">{lead.contact_phone}</p>
                  </div>
                )}

                {lead.sponsorship_page_url && (
                  <a
                    href={lead.sponsorship_page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] hover:border-[var(--accent)]"
                  >
                    <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-[var(--info)]" /> Sponsorship page</span>
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)]" />
                  </a>
                )}

                {lead.linkedin_url && (
                  <a
                    href={lead.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] hover:border-[var(--accent)]"
                  >
                    <span className="inline-flex items-center gap-1.5"><LinkedinIcon className="h-3.5 w-3.5" /> LinkedIn</span>
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)]" />
                  </a>
                )}

                {lead.twitter_url && (
                  <a
                    href={lead.twitter_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] hover:border-[var(--accent)]"
                  >
                    <span className="inline-flex items-center gap-1.5"><TwitterIcon className="h-3.5 w-3.5" /> X / Twitter</span>
                    <ExternalLink className="h-3.5 w-3.5 text-[var(--muted)]" />
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5">
              <h3 className="mb-3 text-sm font-bold text-[var(--text)]">Profile</h3>
              <div className="space-y-3 text-sm text-[var(--muted)]">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2">
                  <span>Domain</span>
                  <span className="font-medium text-[var(--text)]">{lead.domain || "Not available"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2">
                  <span>Location</span>
                  <span className="font-medium text-[var(--text)]">{lead.location || "Not specified"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-2">
                  <span>Distance</span>
                  <span className="font-medium text-[var(--text)]">{lead.distance_km !== null ? `${lead.distance_km} km` : "N/A"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 pb-1">
                  <span>Verification</span>
                  <span className="font-medium text-[var(--text)] capitalize">{lead.verification_status}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
