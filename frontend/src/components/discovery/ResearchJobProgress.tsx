import React from "react";
import { Loader2, CheckCircle, AlertTriangle, Search, MapPin, Mail, Sparkles } from "lucide-react";
import type { ResearchJob } from "@/types/domain";

interface ResearchJobProgressProps {
  job: ResearchJob;
}

export function ResearchJobProgress({ job }: ResearchJobProgressProps) {
  const isRunning = job.status === "running" || job.status === "pending";
  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          {isRunning ? (
            <div className="w-8 h-8 rounded-full bg-[var(--info-soft)] flex items-center justify-center text-[var(--info)]">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : isCompleted ? (
            <div className="w-8 h-8 rounded-full bg-[var(--success-soft)] flex items-center justify-center text-[var(--success)]">
              <CheckCircle className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-[var(--danger-soft)] flex items-center justify-center text-[var(--danger)]">
              <AlertTriangle className="w-4 h-4" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-[var(--text)] m-0">
                {isRunning
                  ? "Research Pipeline in Progress"
                  : isCompleted
                  ? "Sponsor Discovery Completed"
                  : "Research Pipeline Failed"}
              </h3>
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                  isRunning
                    ? "bg-[var(--info-soft)] text-[var(--info)]"
                    : isCompleted
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : "bg-[var(--danger-soft)] text-[var(--danger)]"
                }`}
              >
                {job.status}
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] m-0 mt-0.5">
              Event: <span className="font-medium text-[var(--text)]">{job.event_name}</span> ({job.venue_city})
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xl font-extrabold text-[var(--text)]">
            {job.progress_percent}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-[var(--surface-muted)] h-2 rounded-full overflow-hidden border border-[var(--line)]">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            isFailed
              ? "bg-[var(--danger)]"
              : isCompleted
              ? "bg-[var(--success)]"
              : "bg-[var(--accent)]"
          }`}
          style={{ width: `${Math.max(job.progress_percent, 5)}%` }}
        />
      </div>

      {/* Live status description message */}
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5 font-medium text-[var(--text)]">
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
          {job.progress_message || "Processing live research queries…"}
        </span>

        {isFailed && job.error_message && (
          <span className="text-[var(--danger)] font-medium max-w-[400px] truncate" title={job.error_message}>
            {job.error_message}
          </span>
        )}
      </div>

      {/* Live API Resource Metrics Meter */}
      <div className="pt-3 border-t border-[var(--line)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--line)] flex items-center gap-2">
          <Search className="w-4 h-4 text-[var(--accent)]" />
          <div>
            <div className="text-[10px] text-[var(--muted)]">Tavily Searches</div>
            <div className="font-bold text-[var(--text)]">{job.tavily_credits_used} credits</div>
          </div>
        </div>

        <div className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--line)] flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[var(--info)]" />
          <div>
            <div className="text-[10px] text-[var(--muted)]">Google Places</div>
            <div className="font-bold text-[var(--text)]">{job.places_api_calls} calls</div>
          </div>
        </div>

        <div className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--line)] flex items-center gap-2">
          <Mail className="w-4 h-4 text-[var(--warning)]" />
          <div>
            <div className="text-[10px] text-[var(--muted)]">Hunter Emails</div>
            <div className="font-bold text-[var(--text)]">{job.hunter_credits_used} lookups</div>
          </div>
        </div>

        <div className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--line)] flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <div>
            <div className="text-[10px] text-[var(--muted)]">LLM Extraction</div>
            <div className="font-bold text-[var(--text)]">Active</div>
          </div>
        </div>
      </div>
    </div>
  );
}
