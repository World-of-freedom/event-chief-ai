import React from "react";
import { Link } from "react-router-dom";
import { Building2, ExternalLink, Globe, MapPin, Sparkles } from "lucide-react";
import type { SponsorLead } from "@/types/domain";

interface SponsorLeadCardProps {
  lead: SponsorLead;
}

export function SponsorLeadCard({ lead }: SponsorLeadCardProps) {
  const confidenceBadge = (conf: string) => {
    switch (conf) {
      case "high":
        return <span className="inline-flex items-center rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--success)]">High confidence</span>;
      case "medium":
        return <span className="inline-flex items-center rounded-full bg-[var(--info-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--info)]">Medium confidence</span>;
      default:
        return <span className="inline-flex items-center rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--warning)]">Low confidence</span>;
    }
  };

  return (
    <article className="border border-[var(--line)] bg-[var(--surface-raised)] rounded-2xl p-5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition-transform duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Building2 className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            <span>{lead.industry || "General industry"}</span>
          </div>

          <h2 className="m-0 text-xl font-bold text-[var(--text)] leading-tight">{lead.company_name}</h2>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
            {lead.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {lead.location}
                {lead.distance_km !== null && <span className="text-[var(--accent)] font-semibold">({lead.distance_km} km)</span>}
              </span>
            )}

            {lead.website_url && (
              <a
                href={lead.website_url.startsWith("http") ? lead.website_url : `https://${lead.website_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[var(--accent)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Globe className="h-3.5 w-3.5" />
                {lead.domain || "Website"}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>

          {lead.description && (
            <p className="mt-3 mb-0 text-sm leading-relaxed text-[var(--muted-strong)] line-clamp-3">
              {lead.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text)]">
              <Sparkles className="h-3 w-3 text-[var(--accent)]" />
              Match {lead.score_total}/100
            </span>
            {confidenceBadge(lead.confidence)}
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <Link
          to={`/discovery/leads/${lead.id}`}
          className="button w-full justify-center text-xs font-semibold px-3 py-2.5"
        >
          Details
        </Link>
      </div>
    </article>
  );
}
