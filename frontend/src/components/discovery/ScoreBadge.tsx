import { cn } from "@/lib/utils";

import { StatusPill, type Tone } from "@/components/StatusPill";
import { Progress } from "@/components/ui/progress";

interface ScoreBreakdown {
  relevance: number;
  industryFit: number;
  sponsorshipHistory: number;
  geographicFit: number;
  budgetCompatibility: number;
  contactability: number;
}

interface ScoreBadgeProps {
  score: number;
  showBreakdown?: boolean;
  breakdown?: ScoreBreakdown;
}

export function scoreTone(score: number): Tone {
  if (score >= 75) return "success";
  if (score >= 55) return "info";
  if (score >= 35) return "warning";
  return "neutral";
}

const breakdownRows: { key: keyof ScoreBreakdown; label: string; max: number }[] = [
  { key: "relevance", label: "Relevance", max: 25 },
  { key: "industryFit", label: "Industry fit", max: 20 },
  { key: "sponsorshipHistory", label: "Sponsorships", max: 20 },
  { key: "geographicFit", label: "Geography", max: 15 },
  { key: "budgetCompatibility", label: "Budget fit", max: 10 },
  { key: "contactability", label: "Contactability", max: 10 },
];

export function ScoreBadge({ score, showBreakdown = false, breakdown }: ScoreBadgeProps) {
  return (
    <div className="flex flex-col gap-4">
      <StatusPill tone={scoreTone(score)} className="h-6 w-fit px-2.5 text-xs">
        Match <span className="font-bold">{score}</span>/100
      </StatusPill>

      {showBreakdown && breakdown ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {breakdownRows.map(({ key, label, max }) => (
            <div key={key} className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className={cn("font-medium text-foreground")}>{breakdown[key]}/{max}</dd>
              </div>
              <Progress value={(breakdown[key] / max) * 100} aria-label={`${label}: ${breakdown[key]} of ${max}`} />
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
