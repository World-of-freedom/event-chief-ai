import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Building2,
  Globe,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { LinkedinIcon, TwitterIcon } from "@/components/icons/SocialIcons";

import { PageHeader } from "@/components/PageHeader";
import { ScoreBadge } from "@/components/discovery/ScoreBadge";
import { LeadEvidenceList } from "@/components/discovery/LeadEvidenceList";
import { getLeadDetails } from "@/lib/api/research";
import type { SponsorLead } from "@/types/domain";

export function ProspectDetailPage() {
  const { prospectId } = useParams<{ prospectId: string }>();
  const [lead, setLead] = useState<SponsorLead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    if (!prospectId) return;

    let isMounted = true;
    setIsLoading(true);

    getLeadDetails(prospectId)
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
  }, [prospectId]);

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
        <p className="text-sm text-[var(--muted)]">Loading verified sponsor lead details…</p>
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
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Discovery Leads
        </Link>
      </div>

      <PageHeader
        title={lead.company_name}
        description={`Verified sponsor lead discovered via ${lead.discovery_source || "live web research"}.`}
        actions={
          <div className="flex items-center gap-2">
            {lead.contact_email && (
              <button
                onClick={handleCopyEmail}
                className="button button-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
              >
                {copiedEmail ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedEmail ? "Copied" : "Copy Email"}
              </button>
            )}

            {lead.website_url && (
              <a
                href={lead.website_url.startsWith("http") ? lead.website_url : `https://${lead.website_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="button text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                Visit Official Website
                <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
              </a>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-6">
        {/* Left Column: Company & Scoring Breakdown */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Match Score Card */}
          <div className="p-5 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                Overall Match Score
              </span>
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  lead.confidence === "high"
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : lead.confidence === "medium"
                    ? "bg-[var(--info-soft)] text-[var(--info)]"
                    : "bg-[var(--warning-soft)] text-[var(--warning)]"
                }`}
              >
                {lead.confidence} Confidence
              </span>
            </div>

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

          {/* Quick Facts */}
          <div className="p-5 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] flex flex-col gap-3 text-xs">
            <h3 className="font-bold text-sm text-[var(--text)] m-0 pb-2 border-b border-[var(--line)]">
              Company Profile
            </h3>

            <div>
              <span className="text-[var(--muted)] block">Industry Sector:</span>
              <span className="font-semibold text-[var(--text)]">{lead.industry || "General"}</span>
            </div>

            <div>
              <span className="text-[var(--muted)] block">Location & Region:</span>
              <span className="font-semibold text-[var(--text)] flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-[var(--muted)]" />
                {lead.location || "Location not specified"}
                {lead.distance_km !== null && (
                  <span className="text-[var(--accent)] font-bold">({lead.distance_km} km)</span>
                )}
              </span>
            </div>

            {lead.domain && (
              <div>
                <span className="text-[var(--muted)] block">Domain:</span>
                <span className="font-semibold text-[var(--text)]">{lead.domain}</span>
              </div>
            )}

            <div>
              <span className="text-[var(--muted)] block">Discovery Date:</span>
              <span className="font-semibold text-[var(--text)]">
                {new Date(lead.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Rationale, Contacts & Cited Evidence */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Match Rationale Card */}
          {lead.ranking_explanation && (
            <div className="p-5 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] flex flex-col gap-2">
              <h3 className="font-bold text-sm text-[var(--text)] m-0 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                AI Ranking Explanation
              </h3>
              <p className="text-sm text-[var(--muted-strong)] leading-relaxed m-0">
                {lead.ranking_explanation}
              </p>
            </div>
          )}

          {/* Verified Contact Channels */}
          <div className="p-5 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] flex flex-col gap-3">
            <h3 className="font-bold text-sm text-[var(--text)] m-0 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--accent)]" />
              Verified Public Contact Channels
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
              <div className="p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--line)] flex flex-col gap-1">
                <span className="text-[var(--muted)] flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> Direct Email
                </span>
                {lead.contact_email ? (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--text)] truncate">{lead.contact_email}</span>
                    <button
                      onClick={handleCopyEmail}
                      className="text-[var(--accent)] hover:opacity-80 p-0.5"
                      title="Copy email"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[var(--muted)] italic">Not publicly listed</span>
                )}
              </div>

              <div className="p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--line)] flex flex-col gap-1">
                <span className="text-[var(--muted)] flex items-center gap-1">
                  <ExternalLink className="w-3.5 h-3.5" /> Sponsorship Portal
                </span>
                {lead.sponsorship_page_url ? (
                  <a
                    href={lead.sponsorship_page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[var(--accent)] hover:underline truncate"
                  >
                    Open Partnership Page →
                  </a>
                ) : (
                  <span className="text-[var(--muted)] italic">No dedicated portal URL</span>
                )}
              </div>

              {lead.contact_phone && (
                <div className="p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--line)] flex flex-col gap-1">
                  <span className="text-[var(--muted)] flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" /> Phone Number
                  </span>
                  <span className="font-semibold text-[var(--text)]">{lead.contact_phone}</span>
                </div>
              )}

              {(lead.linkedin_url || lead.twitter_url) && (
                <div className="p-3 rounded-lg bg-[var(--surface-muted)] border border-[var(--line)] flex flex-col gap-1">
                  <span className="text-[var(--muted)]">Social Channels</span>
                  <div className="flex items-center gap-3 mt-0.5">
                    {lead.linkedin_url && (
                      <a
                        href={lead.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                      >
                        <LinkedinIcon className="w-3.5 h-3.5" /> LinkedIn
                      </a>
                    )}
                    {lead.twitter_url && (
                      <a
                        href={lead.twitter_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                      >
                        <TwitterIcon className="w-3.5 h-3.5" /> Twitter
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Full Evidence Citations */}
          <div className="p-5 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] flex flex-col gap-3">
            <h3 className="font-bold text-sm text-[var(--text)] m-0">
              Cited Evidence & Web Citations
            </h3>
            <LeadEvidenceList evidence={lead.evidence || []} />
          </div>
        </div>
      </div>
    </>
  );
}
