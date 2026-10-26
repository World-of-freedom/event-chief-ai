import { cn } from "@/lib/utils";

import { StatusPill, type Tone } from "@/components/StatusPill";
import { Progress } from "@/components/ui/progress";
import type { ScoreComponent } from "@/types/domain";

export function scoreTone(score: number): Tone {
  if (score >= 75) return "success";
  if (score >= 55) return "info";
  if (score >= 35) return "warning";
  return "neutral";
}

const matchLabels: Record<string, string> = {
  event_topic_alignment: "Event & topic alignment",
  target_audience_alignment: "Target audience alignment",
  contribution_fit: "Contribution fit",
  sponsorship_program_evidence: "Sponsorship/program evidence",
  geographic_relevance: "Geographic relevance",
  scale_and_eligibility_fit: "Scale & eligibility fit",
  timing_and_contact_route: "Timing & contact route",
};

const confidenceLabels: Record<string, string> = {
  company_identity_and_official_domain: "Identity & official domain",
  sponsorship_evidence_reliability: "Sponsorship evidence",
  contact_provenance_and_authenticity: "Contact provenance",
  deterministic_contact_checks: "Free contact checks",
  freshness_and_corroboration: "Freshness & corroboration",
};

function ComponentBreakdown({ components, labels }: { components: Record<string, ScoreComponent>; labels: Record<string, string> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {Object.entries(components).map(([key, component]) => (
        <div key={key} className="space-y-1.5">
          <div className="flex justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">{labels[key] || key.replace(/_/g, " ")}</dt>
            <dd className="shrink-0 font-medium text-foreground">{component.score}/{component.weight}</dd>
          </div>
          <Progress value={(component.score / component.weight) * 100} aria-label={`${labels[key] || key}: ${component.score} of ${component.weight}`} />
          {component.evidence?.[0] ? <p className="text-[11px] leading-relaxed text-muted-foreground">{component.evidence[0]}</p> : null}
        </div>
      ))}
    </dl>
  );
}

export function ScoreBadge({
  matchScore,
  confidenceScore,
  showBreakdown = false,
  matchComponents,
  confidenceComponents,
}: {
  matchScore: number;
  confidenceScore: number;
  showBreakdown?: boolean;
  matchComponents?: Record<string, ScoreComponent> | null;
  confidenceComponents?: Record<string, ScoreComponent> | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <StatusPill tone={scoreTone(matchScore)} className="h-6 w-fit px-2.5 text-xs">
          Match <span className="font-bold">{matchScore}</span>/100
        </StatusPill>
        <StatusPill tone={scoreTone(confidenceScore)} className="h-6 w-fit px-2.5 text-xs">
          Confidence <span className="font-bold">{confidenceScore}</span>/100
        </StatusPill>
      </div>

      {showBreakdown && matchComponents ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Match score</h3>
          <ComponentBreakdown components={matchComponents} labels={matchLabels} />
        </section>
      ) : null}

      {showBreakdown && confidenceComponents ? (
        <section className={cn("space-y-3", matchComponents && "border-t pt-4")}>
          <h3 className="text-sm font-semibold">Confidence score</h3>
          <ComponentBreakdown components={confidenceComponents} labels={confidenceLabels} />
        </section>
      ) : null}
    </div>
  );
}
