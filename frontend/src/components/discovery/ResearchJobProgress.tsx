import { AlertTriangle, CheckCircle, Mail, MapPin, Search, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import { StatusPill, jobStatusTone } from "@/components/StatusPill";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type { ResearchJob } from "@/types/domain";

export function ResearchJobProgress({ job }: { job: ResearchJob }) {
  const isRunning = job.status === "running" || job.status === "pending";
  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";

  const metrics: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Search, label: "Tavily searches", value: `${job.tavily_credits_used} credits` },
    { icon: MapPin, label: "Google Places", value: `${job.places_api_calls} calls` },
    { icon: Mail, label: "Hunter emails", value: `${job.hunter_credits_used} lookups` },
    { icon: Sparkles, label: "LLM extraction", value: isRunning ? "Active" : isCompleted ? "Done" : "Stopped" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-full",
              isRunning && "bg-info-soft text-info",
              isCompleted && "bg-success-soft text-success",
              isFailed && "bg-destructive-soft text-destructive",
            )}
          >
            {isRunning ? <Spinner /> : isCompleted ? <CheckCircle className="size-4" /> : <AlertTriangle className="size-4" />}
          </span>
          {isRunning ? "Research in progress" : isCompleted ? "Research complete" : "Research failed"}
          <StatusPill tone={jobStatusTone(job.status)} className="capitalize">{job.status}</StatusPill>
        </CardTitle>
        <CardDescription>
          Event: <span className="font-medium text-foreground">{job.event_name}</span> ({job.venue_city})
        </CardDescription>
        <CardAction className="text-2xl font-semibold tabular-nums">{job.progress_percent}%</CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress
          value={Math.max(job.progress_percent, 5)}
          className={cn(
            "h-2",
            isFailed && "[&>[data-slot=progress-indicator]]:bg-destructive",
            isCompleted && "[&>[data-slot=progress-indicator]]:bg-success",
          )}
          aria-label="Research progress"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <Sparkles className="size-3.5 text-primary" />
            {job.progress_message || "Processing live research queries…"}
          </span>
          {isFailed && job.error_message ? (
            <span className="max-w-md truncate font-medium text-destructive" title={job.error_message}>
              {job.error_message}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
          {metrics.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border bg-background p-2.5">
              <Icon className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground">{label}</div>
                <div className="truncate text-xs font-semibold">{value}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
