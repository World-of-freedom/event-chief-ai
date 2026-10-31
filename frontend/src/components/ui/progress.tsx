import * as React from "react"
import { cn } from "cn"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 bg-primary transition-all"
        // Clamp to 0–100 so a NaN or out-of-range value can't overflow or hide the bar.
        style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, Number(value) || 0))}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
