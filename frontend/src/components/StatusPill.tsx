import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";

export type Tone = "success" | "warning" | "info" | "danger" | "brand" | "neutral";

const toneClasses: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-destructive-soft text-destructive",
  brand: "bg-brand-soft text-primary",
  neutral: "bg-muted text-muted-foreground",
};

/** Soft, colored badge used for statuses across the app. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <Badge variant="secondary" className={cn(toneClasses[tone], className)}>{children}</Badge>;
}

export function jobStatusTone(status: string): Tone {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "cancelled") return "neutral";
  return "info";
}

export function confidenceTone(confidence: string): Tone {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "info";
  return "warning";
}
