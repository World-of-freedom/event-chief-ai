import { cn } from "@/lib/utils";

import { Spinner } from "@/components/ui/spinner";

export function LoadingState({ label, fullScreen = false }: { label: string; fullScreen?: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground",
        fullScreen && "min-h-svh",
      )}
    >
      <Spinner className="size-5 text-primary" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
