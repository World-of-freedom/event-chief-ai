import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { EventSelect } from "@/components/EventSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createOpportunity, createOpportunityWithProspect, listProspects } from "@/lib/api/sponsorship";
import type { EventRecord } from "@/types/sponsorship";
import { ProspectFields, emptyProspect, prospectSchema, prospectToInput, type ProspectFormValues } from "@/features/pipeline/ProspectFields";

export function AddProspectDialog({ events, defaultEventId }: { events: EventRecord[]; defaultEventId: string | null }) {
  const [open, setOpen] = useState(false);
  const [eventId, setEventId] = useState<string | null>(defaultEventId);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [prospectId, setProspectId] = useState<string>("");
  const prospectsQuery = useQuery({ queryKey: ["prospects"], queryFn: () => listProspects(), enabled: open && mode === "existing" });
  const prospects = prospectsQuery.data ?? [];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProspectFormValues>({
    resolver: zodResolver(prospectSchema),
    defaultValues: emptyProspect,
  });
  useEffect(() => {
    if (open) {
      reset(emptyProspect);
      setMode("new");
      setProspectId("");
      setEventId(defaultEventId ?? events[0]?.id ?? null);
    }
  }, [open, defaultEventId, events, reset]);

  const mutation = useMutation({
    mutationFn: (values: ProspectFormValues | null) =>
      values ? createOpportunityWithProspect(eventId!, prospectToInput(values)) : createOpportunity(eventId!, prospectId),
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
          <DialogTitle>Add a prospect</DialogTitle>
          <DialogDescription>
            Enter a new company, or add one you already track to another event. To add an AI-discovered lead, use “Add to pipeline” in Sponsor discovery.
          </DialogDescription>
        </DialogHeader>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(value) => { if (value) { setMode(value as "new" | "existing"); mutation.reset(); } }}
          aria-label="Prospect source"
        >
          <ToggleGroupItem value="new">New company</ToggleGroupItem>
          <ToggleGroupItem value="existing">Existing prospect</ToggleGroupItem>
        </ToggleGroup>
        <form
          id="add-prospect-form"
          noValidate
          onSubmit={mode === "new" ? handleSubmit((values) => mutation.mutate(values)) : (e) => { e.preventDefault(); if (prospectId) mutation.mutate(null); }}
        >
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="ap-event">Event *</FieldLabel>
              <EventSelect id="ap-event" events={events} value={eventId} onChange={setEventId} className="w-full" />
            </Field>
            {mode === "new" ? (
              <ProspectFields register={register} errors={errors} />
            ) : (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="ap-prospect">Prospect *</FieldLabel>
                {prospectsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading prospects…</p>
                ) : prospects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">You don't have any prospects yet. Switch to “New company” to add one.</p>
                ) : (
                  <Select value={prospectId} onValueChange={setProspectId}>
                    <SelectTrigger id="ap-prospect" className="w-full"><SelectValue placeholder="Choose a company" /></SelectTrigger>
                    <SelectContent>
                      {prospects.map((prospect) => (
                        <SelectItem key={prospect.id} value={prospect.id} disabled={prospect.opted_out}>
                          {prospect.company_name}
                          {prospect.industry ? ` · ${prospect.industry}` : ""}
                          {prospect.opted_out ? " (opted out)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            )}
          </FieldGroup>
          {mutation.error ? <ErrorAlert className="mt-4 border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="add-prospect-form" disabled={mutation.isPending || !eventId || (mode === "existing" && !prospectId)}>
            {mutation.isPending ? <Spinner /> : null}
            Add to pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
