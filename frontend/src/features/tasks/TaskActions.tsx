import { useState } from "react";
import { CalendarClock, Check, MoreHorizontal, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RescheduleDialog } from "@/features/tasks/TaskDialogs";
import { useUpdateTask } from "@/features/tasks/useTaskMutations";
import type { FollowUpTask } from "@/types/sponsorship";

/** Complete / reschedule / cancel / reopen controls for one follow-up. */
export function TaskActions({ task }: { task: FollowUpTask }) {
  const [rescheduling, setRescheduling] = useState(false);
  const mutation = useUpdateTask();
  const active = task.status === "open" || task.status === "in_progress";

  return (
    <div className="flex items-center justify-end gap-1">
      {active ? (
        <Button
          variant="outline"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ task, changes: { status: "completed" }, message: "Follow-up completed" })}
        >
          <Check />
          Done
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${task.title}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {active ? (
            <>
              <DropdownMenuItem onSelect={() => setRescheduling(true)}><CalendarClock />Reschedule</DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => mutation.mutate({ task, changes: { status: "canceled" }, message: "Follow-up canceled" })}
              >
                <X />Cancel follow-up
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => mutation.mutate({ task, changes: { status: "open" }, message: "Follow-up reopened" })}>
              <RotateCcw />Reopen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <RescheduleDialog task={task} open={rescheduling} onOpenChange={setRescheduling} />
    </div>
  );
}
