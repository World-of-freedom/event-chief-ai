import { useEffect, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTask, useUpdateTask } from "@/features/tasks/useTaskMutations";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import type { FollowUpTask } from "@/types/sponsorship";

const schema = z.object({
  title: z.string().trim().min(1, "Enter what needs doing").max(200),
  due_at: z.string(),
  description: z.string(),
});
type Values = z.infer<typeof schema>;

export function NewTaskDialog({ opportunityId, eventId, trigger }: { opportunityId: string; eventId: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const mutation = useCreateTask(opportunityId, eventId);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", due_at: "", description: "" },
  });

  useEffect(() => {
    if (open) reset({ title: "", due_at: "", description: "" });
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) mutation.reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New follow-up</DialogTitle>
          <DialogDescription>A reminder for you, linked to this sponsor.</DialogDescription>
        </DialogHeader>
        <form
          id="new-task-form"
          noValidate
          onSubmit={handleSubmit((values) =>
            mutation.mutate(
              { title: values.title.trim(), due_at: fromDateTimeLocal(values.due_at), description: values.description.trim() || null },
              { onSuccess: () => setOpen(false) },
            ),
          )}
        >
          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="task-title">What needs doing *</FieldLabel>
              <Input id="task-title" placeholder="e.g. Send the sponsorship deck" aria-invalid={!!errors.title} {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-due">Due</FieldLabel>
              <Input id="task-due" type="datetime-local" {...register("due_at")} />
              <FieldDescription>In your local time.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="task-description">Details</FieldLabel>
              <Textarea id="task-description" rows={3} {...register("description")} />
            </Field>
          </FieldGroup>
          {mutation.error ? <ErrorAlert className="mt-4 border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="new-task-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : null}
            Add follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RescheduleDialog({ task, open, onOpenChange }: { task: FollowUpTask; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [due, setDue] = useState(toDateTimeLocal(task.due_at));
  const mutation = useUpdateTask();

  useEffect(() => {
    if (open) setDue(toDateTimeLocal(task.due_at));
  }, [open, task.due_at]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule follow-up</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="reschedule-due">New due date and time</FieldLabel>
          <Input id="reschedule-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <FieldDescription>Leave empty to remove the due date.</FieldDescription>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { task, changes: { due_at: fromDateTimeLocal(due) }, message: "Follow-up rescheduled" },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {mutation.isPending ? <Spinner /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
