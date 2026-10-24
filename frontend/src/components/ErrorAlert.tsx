import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ErrorAlert({ message, className }: { message: string; className?: string }) {
  return (
    <Alert variant="destructive" className={className ?? "mb-6 border-destructive/30 bg-destructive-soft"}>
      <AlertCircle />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
