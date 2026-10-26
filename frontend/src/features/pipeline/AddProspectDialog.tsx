import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { EventSelect } from "@/components/EventSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { createOpportunityWithProspect } from "@/lib/api/sponsorship";
import type { EventRecord } from "@/types/sponsorship";
import { ProspectFields, emptyProspect, prospectSchema, prospectToInput, type ProspectFormValues } from "@/features/pipeline/ProspectFields";

export function AddProspectDialog({ events, defaultEventId }: { events: EventRecord[]; defaultEventId: string | null }) {
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(defaultEventId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProspectFormValues>({
    resolver: zodResolver(prospectSchema),
    defaultValues: emptyProspect,
  });
  useEffect(() => {
    if (open) {
      reset(emptyProspect);
      setEventId(defaultEventId ?? events[0]?.id ?? null);
    }
  }, [open, defaultEventId, events, reset]);

  const mutation = useMutation({
    mutationFn: (values: ProspectFormValues) => createOpportunityWithProspect(eventId!, prospectToInput(values)),
    onSuccess: (opportunity) => {
      void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", opportunity.event_id] });
      toast.success(`${opportunity.prospect.company_name} added to the pipeline`);
      setOpen(false);
      navigate(`/pipeline/${opportunity.id}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) mutation.reset(); }}>
      <DialogTrigger asChild>
        <Button disabled={!events.length}><Plus />Add prospect</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a prospect manually</DialogTitle>
          <DialogDescription>
            Enter a company you found yourself. It starts as unverified. To add an AI-discovered lead, use “Add to pipeline” in Sponsor discovery.
          </DialogDescription>
        </DialogHeader>
        <form id="add-prospect-form" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="ap-event">Event *</FieldLabel>
              <EventSelect id="ap-event" events={events} value={eventId} onChange={setEventId} className="w-full" />
            </Field>
            <ProspectFields register={register} errors={errors} />
          </FieldGroup>
          {mutation.error ? <ErrorAlert className="mt-4 border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="add-prospect-form" disabled={mutation.isPending || !eventId}>
            {mutation.isPending ? <Spinner /> : null}
            Add to pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
