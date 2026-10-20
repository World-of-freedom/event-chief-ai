import React from "react";

interface ScoreBadgeProps {
  score: number;
  showBreakdown?: boolean;
  breakdown?: {
    relevance: number;
    industryFit: number;
    sponsorshipHistory: number;
    geographicFit: number;
    budgetCompatibility: number;
    contactability: number;
  };
}

export function ScoreBadge({ score, showBreakdown = false, breakdown }: ScoreBadgeProps) {
  const getColor = (s: number) => {
    if (s >= 75) return "var(--success)";
    if (s >= 55) return "var(--info)";
    if (s >= 35) return "var(--warning)";
    return "var(--muted)";
  };

  const getBg = (s: number) => {
    if (s >= 75) return "var(--success-soft)";
    if (s >= 55) return "var(--info-soft)";
    if (s >= 35) return "var(--warning-soft)";
    return "var(--surface-muted)";
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
        style={{
          color: getColor(score),
          backgroundColor: getBg(score),
          borderColor: `color-mix(in srgb, ${getColor(score)} 30%, transparent)`,
        }}
        title={`Overall Match Score: ${score}/100`}
      >
        <span className="text-[10px] uppercase tracking-wider opacity-80">Match</span>
        <span className="text-sm font-extrabold">{score}</span>
        <span className="text-[11px] opacity-70">/100</span>
      </div>

      {showBreakdown && breakdown && (
        <div className="mt-2 text-xs grid grid-cols-2 gap-x-3 gap-y-1 p-2 rounded-lg bg-[var(--surface-muted)] border border-[var(--line)]">
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Relevance:</span>
            <span className="font-semibold text-[var(--text)]">{breakdown.relevance}/25</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Industry Fit:</span>
            <span className="font-semibold text-[var(--text)]">{breakdown.industryFit}/20</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Sponsorships:</span>
            <span className="font-semibold text-[var(--text)]">{breakdown.sponsorshipHistory}/20</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Geography:</span>
            <span className="font-semibold text-[var(--text)]">{breakdown.geographicFit}/15</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Budget Fit:</span>
            <span className="font-semibold text-[var(--text)]">{breakdown.budgetCompatibility}/10</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--muted)]">Contactability:</span>
            <span className="font-semibold text-[var(--text)]">{breakdown.contactability}/10</span>
          </div>
        </div>
      )}
    </div>
  );
}
