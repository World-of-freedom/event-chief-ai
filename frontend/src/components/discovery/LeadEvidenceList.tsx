import { AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";

import { StatusPill } from "@/components/StatusPill";
import type { LeadEvidence } from "@/types/domain";

const evidenceLabels: Record<string, string> = {
  sponsorship_history: "Sponsorship history",
  brand_partnership: "Brand partnership",
  local_presence: "Local presence",
  audience_alignment: "Audience alignment",
  contact_page: "Official contact page",
  social_media: "Social media",
  news_mention: "News mention",
};

const formatEvidenceType = (type: string) => evidenceLabels[type] ?? type.replace(/_/g, " ");

export function LeadEvidenceList({ evidence }: { evidence: LeadEvidence[] }) {
  if (!evidence || evidence.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        No cited evidence extracted yet. Verification may be required.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {evidence.map((item, idx) => (
        <li key={item.id || idx} className="flex flex-col gap-2 rounded-lg border bg-background p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <StatusPill tone="brand">
              <CheckCircle2 />
              {formatEvidenceType(item.evidence_type)}
            </StatusPill>
            {item.source_quality === "official" ? (
              <span className="font-medium text-success">Official source</span>
            ) : item.is_llm_inferred ? (
              <span className="flex items-center gap-1 text-warning" title="Inferred from context">
                <AlertCircle className="size-3" /> Inferred
              </span>
            ) : (
              <span className="text-muted-foreground">From source</span>
            )}
          </div>

          <p className="leading-relaxed text-foreground">{item.claim}</p>
          {item.source_excerpt ? (
            <blockquote className="border-l-2 border-primary/40 pl-2 text-muted-foreground">
              “{item.source_excerpt}”
            </blockquote>
          ) : null}

          {item.source_url ? (
            <div className="flex items-center justify-between gap-3 border-t pt-2">
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="size-3 shrink-0" />
                <span className="truncate">{item.source_title || item.source_url}</span>
              </a>
              {(item.retrieved_at || item.verified_date) ? <span className="shrink-0 text-muted-foreground">Retrieved {new Date(item.retrieved_at || item.verified_date!).toLocaleDateString()}</span> : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
