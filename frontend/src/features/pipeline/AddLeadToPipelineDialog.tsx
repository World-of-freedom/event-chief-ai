import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { EventSelect } from "@/components/EventSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api/client";
import { createOpportunityFromLead, listEvents } from "@/lib/api/sponsorship";

interface AddLeadToPipelineDialogProps {
  leadId: string;
  companyName: string;
  /** The event the discovery run was linked to, if any. */
  defaultEventId?: string | null;
  trigger: ReactNode;
}

export function AddLeadToPipelineDialog({ leadId, companyName, defaultEventId, trigger }: AddLeadToPipelineDialogProps) {
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(defaultEventId ?? null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents, enabled: open });
  const events = eventsQuery.data ?? [];

  useEffect(() => {
    if (open && !eventId) setEventId(defaultEventId ?? events[0]?.id ?? null);
  }, [open, eventId, defaultEventId, events]);

  const mutation = useMutation({
    mutationFn: () => createOpportunityFromLead(eventId!, leadId),
    onSuccess: (opportunity) => {
      void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", opportunity.event_id] });
      toast.success(`${companyName} added to the ${opportunity.event_name} pipeline`, {
        action: { label: "Open", onClick: () => navigate(`/pipeline/${opportunity.id}`) },
      });
      setOpen(false);
    },
  });

  const alreadyAdded = mutation.error instanceof ApiError && mutation.error.status === 409;

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) mutation.reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {companyName} to a pipeline</DialogTitle>
          <DialogDescription>
            This creates a prospect from the lead (or reuses an existing one for the same company) and starts it at “Prospect found”.
            Contact details found by the AI stay unverified until you review them.
          </DialogDescription>
        </DialogHeader>
        {eventsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading events…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don't have any events yet. <Link className="text-primary hover:underline" to="/events">Create an event</Link> first.
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor="lead-event">Event</FieldLabel>
            <EventSelect id="lead-event" events={events} value={eventId} onChange={(id) => { setEventId(id); mutation.reset(); }} className="w-full" />
            {defaultEventId ? <FieldDescription>Pre-selected: the event this discovery run is linked to.</FieldDescription> : null}
          </Field>
        )}
        {alreadyAdded ? (
          <ErrorAlert
            className="border-warning/30 bg-warning-soft text-warning"
            message={`${errorMessage(mutation.error)} Open the pipeline to find it.`}
          />
        ) : mutation.error ? (
          <ErrorAlert className="border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} />
        ) : null}
        <DialogFooter>
          {alreadyAdded && eventId ? (
            <Button asChild variant="outline"><Link to={`/pipeline?event=${eventId}`}>Open pipeline</Link></Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          )}
          <Button disabled={!eventId || mutation.isPending || alreadyAdded} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Spinner /> : null}
            Add to pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
