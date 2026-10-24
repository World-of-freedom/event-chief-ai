import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { errorMessage } from "@/components/ErrorAlert";
import { createTask, updateTask } from "@/lib/api/sponsorship";
import type { FollowUpTask } from "@/types/sponsorship";

/** Refresh every view that shows follow-ups after a change. */
function useRefreshTasks() {
  const queryClient = useQueryClient();
  return (task: Pick<FollowUpTask, "opportunity_id" | "event_id">) => {
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["opportunity", task.opportunity_id] });
    void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", task.event_id] });
  };
}

export function useUpdateTask() {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: ({ task, changes }: { task: FollowUpTask; changes: Parameters<typeof updateTask>[1]; message?: string }) => updateTask(task.id, changes),
    onSuccess: (updated, { message }) => {
      refresh(updated);
      if (message) toast.success(message);
    },
    onError: (error) => toast.error(errorMessage(error, "Could not update the follow-up.")),
  });
}

export function useCreateTask(opportunityId: string, eventId: string) {
  const refresh = useRefreshTasks();
  return useMutation({
    mutationFn: (input: Parameters<typeof createTask>[1]) => createTask(opportunityId, input),
    onSuccess: () => {
      refresh({ opportunity_id: opportunityId, event_id: eventId });
      toast.success("Follow-up added");
    },
  });
}
