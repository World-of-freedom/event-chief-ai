import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Globe,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Building2,
  Sparkles,
} from "lucide-react";
import { LinkedinIcon, TwitterIcon } from "@/components/icons/SocialIcons";
import type { SponsorLead } from "@/types/domain";
import { ScoreBadge } from "./ScoreBadge";
import { LeadEvidenceList } from "./LeadEvidenceList";

interface SponsorLeadCardProps {
  lead: SponsorLead;
}

export function SponsorLeadCard({ lead }: SponsorLeadCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleCopyEmail = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (lead.contact_email) {
      navigator.clipboard.writeText(lead.contact_email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const confidenceBadge = (conf: string) => {
    switch (conf) {
      case "high":
        return <span className="status-badge status-verified">High Confidence</span>;
      case "medium":
        return <span className="status-badge status-reviewed">Medium Confidence</span>;
      default:
        return <span className="status-badge status-unverified">Low Confidence</span>;
    }
  };

  return (
    <article className="prospect-card border border-[var(--line)] bg-[var(--surface-raised)] rounded-xl p-5 flex flex-col justify-between">
      {/* Top Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--surface-muted)] flex items-center justify-center text-[var(--accent)] flex-shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider block">
                {lead.industry || "General Industry"}
              </span>
              <h2 className="text-lg font-bold text-[var(--text)] m-0 leading-tight">
                {lead.company_name}
              </h2>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <ScoreBadge
              score={lead.score_total}
              showBreakdown={showScoreBreakdown}
              breakdown={{
                relevance: lead.score_relevance,
                industryFit: lead.score_industry_fit,
                sponsorshipHistory: lead.score_sponsorship_history,
                geographicFit: lead.score_geographic_fit,
                budgetCompatibility: lead.score_budget_compatibility,
                contactability: lead.score_contactability,
              }}
            />
            {confidenceBadge(lead.confidence)}
          </div>
        </div>

        {/* Location & Website bar */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
          {lead.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[var(--muted)]" />
              {lead.location}
              {lead.distance_km !== null && (
                <span className="text-[11px] font-semibold text-[var(--accent)]">
                  ({lead.distance_km} km away)
                </span>
              )}
            </span>
          )}

          {lead.website_url && (
            <a
              href={lead.website_url.startsWith("http") ? lead.website_url : `https://${lead.website_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Globe className="w-3.5 h-3.5" />
              {lead.domain || "Website"}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>

        {/* Description / snippet */}
        {lead.description && (
          <p className="text-xs text-[var(--muted-strong)] line-clamp-2 leading-relaxed m-0">
            {lead.description}
          </p>
        )}

        {/* Ranking Explanation */}
        {lead.ranking_explanation && (
          <div className="p-2.5 rounded-lg bg-[var(--surface-muted)] border border-[var(--line)] text-xs text-[var(--text)] flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
            <div className="leading-snug">
              <strong className="text-[var(--text)] font-semibold">Why this match: </strong>
              <span className="text-[var(--muted-strong)]">{lead.ranking_explanation}</span>
            </div>
          </div>
        )}

        {/* Verified Contact Details Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--line)] text-xs">
          {lead.contact_email ? (
            <button
              onClick={handleCopyEmail}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[var(--accent-soft)] text-[var(--accent)] hover:opacity-90 font-medium transition-colors"
              title="Click to copy email address"
            >
              {copiedEmail ? <Check className="w-3 h-3 text-[var(--success)]" /> : <Mail className="w-3 h-3" />}
              <span>{lead.contact_email}</span>
              <Copy className="w-2.5 h-2.5 opacity-60 ml-0.5" />
            </button>
          ) : (
            <span className="text-[11px] text-[var(--muted)] italic">No direct email found</span>
          )}

          {lead.sponsorship_page_url && (
            <a
              href={lead.sponsorship_page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--surface-muted)] text-[var(--text)] hover:underline border border-[var(--line)]"
            >
              <ExternalLink className="w-3 h-3 text-[var(--info)]" />
              Sponsorship Portal
            </a>
          )}

          {lead.contact_phone && (
            <span className="inline-flex items-center gap-1 text-[var(--muted)]">
              <Phone className="w-3 h-3" />
              {lead.contact_phone}
            </span>
          )}

          {lead.linkedin_url && (
            <a
              href={lead.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--muted)] hover:text-[var(--accent)]"
              title="LinkedIn Profile"
            >
              <LinkedinIcon className="w-3.5 h-3.5" />
            </a>
          )}

          {lead.twitter_url && (
            <a
              href={lead.twitter_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--muted)] hover:text-[var(--accent)]"
              title="Twitter / X Profile"
            >
              <TwitterIcon className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Footer controls & Evidence Toggle */}
      <div className="mt-4 pt-3 border-t border-[var(--line)] flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowScoreBreakdown(!showScoreBreakdown)}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)] underline cursor-pointer"
            >
              {showScoreBreakdown ? "Hide score breakdown" : "Score breakdown"}
            </button>

            {lead.evidence && lead.evidence.length > 0 && (
              <button
                type="button"
                onClick={() => setShowEvidence(!showEvidence)}
                className="inline-flex items-center gap-1 text-xs text-[var(--accent)] font-medium hover:underline cursor-pointer ml-2"
              >
                <span>{lead.evidence.length} evidence sources</span>
                {showEvidence ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          <Link
            to={`/discovery/${lead.id}`}
            className="button button-secondary text-xs px-2.5 py-1"
          >
            Full Details
          </Link>
        </div>

        {/* Collapsible Evidence Section */}
        {showEvidence && lead.evidence && (
          <div className="pt-2">
            <LeadEvidenceList evidence={lead.evidence} />
          </div>
        )}
      </div>
    </article>
  );
}
