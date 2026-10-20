import React from "react";
import { ExternalLink, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";
import type { LeadEvidence } from "@/types/domain";

interface LeadEvidenceListProps {
  evidence: LeadEvidence[];
}

export function LeadEvidenceList({ evidence }: LeadEvidenceListProps) {
  if (!evidence || evidence.length === 0) {
    return (
      <div className="text-xs text-[var(--muted)] italic p-2 bg-[var(--surface-muted)] rounded">
        No direct cited evidence extracted yet. Verification may be required.
      </div>
    );
  }

  const formatEvidenceType = (type: string) => {
    switch (type) {
      case "sponsorship_history":
        return "Sponsorship History";
      case "brand_partnership":
        return "Brand Partnership";
      case "local_presence":
        return "Local Presence";
      case "audience_alignment":
        return "Audience Alignment";
      case "contact_page":
        return "Official Contact Page";
      case "social_media":
        return "Social Media";
      case "news_mention":
        return "News Mention";
      default:
        return type.replace(/_/g, " ");
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)]" />
        Verified Live Evidence ({evidence.length})
      </div>

      <div className="flex flex-col gap-2">
        {evidence.map((item, idx) => (
          <div
            key={item.id || idx}
            className="p-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-xs flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-[var(--accent-soft)] text-[var(--accent)]">
                <CheckCircle2 className="w-2.5 h-2.5" />
                {formatEvidenceType(item.evidence_type)}
              </span>

              {item.is_llm_inferred ? (
                <span className="text-[10px] text-[var(--warning)] flex items-center gap-1" title="Inferred from context">
                  <AlertCircle className="w-2.5 h-2.5" /> Inferred
                </span>
              ) : (
                <span className="text-[10px] text-[var(--muted)]">Verified from source</span>
              )}
            </div>

            <p className="text-[var(--text)] leading-relaxed m-0">{item.claim}</p>

            {item.source_url && (
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--line)]">
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline truncate max-w-[280px]"
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{item.source_title || item.source_url}</span>
                </a>

                {item.verified_date && (
                  <span className="text-[var(--muted)] text-[10px]">{item.verified_date}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
