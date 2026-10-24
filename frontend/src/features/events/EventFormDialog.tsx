import { useEffect, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createEvent, updateEvent } from "@/lib/api/sponsorship";
import { eventTypeOptions } from "@/lib/event-types";
import type { EventInput, EventRecord } from "@/types/sponsorship";

const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter the event name").max(160),
    event_type: z.string().min(1, "Choose an event type"),
    institution: z.string().trim().min(1, "Enter the host institution").max(160),
    start_date: z.string().min(1, "Choose a start date"),
    end_date: z.string(),
    location: optionalText(200),
    is_online: z.boolean(),
    expected_attendees: z
      .string()
      .trim()
      .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1_000_000), "Enter a whole number between 1 and 1,000,000"),
    target_audience: z.string(),
    website_url: z.string().trim().refine((v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v), "Enter a full URL starting with https://"),
    organizer_name: optionalText(160),
    organizer_email: z.string().trim().refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email"),
    description: z.string(),
  })
  .refine((v) => !v.end_date || !v.start_date || v.end_date >= v.start_date, { path: ["end_date"], message: "End date can't be before the start date" });

type FormValues = z.infer<typeof schema>;

const emptyToNull = (value: string) => (value.trim() === "" ? null : value.trim());

function toValues(event?: EventRecord): FormValues {
  return {
    name: event?.name ?? "",
    event_type: event?.event_type ?? "hackathon",
    institution: event?.institution ?? "",
    start_date: event?.start_date ?? "",
    end_date: event?.end_date ?? "",
    location: event?.location ?? "",
    is_online: event?.is_online ?? false,
    expected_attendees: event?.expected_attendees ? String(event.expected_attendees) : "",
    target_audience: event?.target_audience ?? "",
    website_url: event?.website_url ?? "",
    organizer_name: event?.organizer_name ?? "",
    organizer_email: event?.organizer_email ?? "",
    description: event?.description ?? "",
  };
}

function toInput(values: FormValues): EventInput {
  return {
    name: values.name.trim(),
    event_type: values.event_type,
    institution: values.institution.trim(),
    start_date: values.start_date,
    end_date: values.end_date || null,
    location: emptyToNull(values.location),
    is_online: values.is_online,
    expected_attendees: values.expected_attendees ? Number(values.expected_attendees) : null,
    target_audience: emptyToNull(values.target_audience),
    website_url: emptyToNull(values.website_url),
    organizer_name: emptyToNull(values.organizer_name),
    organizer_email: emptyToNull(values.organizer_email),
    description: emptyToNull(values.description),
  };
}

interface EventFormDialogProps {
  /** Element that opens the dialog; pass null when opening it programmatically with defaultOpen. */
  trigger: ReactNode;
  event?: EventRecord;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (event: EventRecord) => void;
}

export function EventFormDialog({ trigger, event, defaultOpen = false, onOpenChange, onSaved }: EventFormDialogProps) {
  const [open, setOpenState] = useState(defaultOpen);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(event) });
  const { register, handleSubmit, control, reset, formState: { errors } } = form;

  useEffect(() => {
    if (open) reset(toValues(event));
  }, [open, event, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => (event ? updateEvent(event.id, toInput(values)) : createEvent(toInput(values))),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", saved.id] });
      toast.success(event ? "Event updated" : "Event created");
      setOpen(false);
      onSaved?.(saved);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) mutation.reset(); }}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>Events hold your resource needs, sponsor pipeline and dashboard.</DialogDescription>
        </DialogHeader>
        <form id="event-form" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" data-invalid={!!errors.name}>
              <FieldLabel htmlFor="ev-name">Event name *</FieldLabel>
              <Input id="ev-name" aria-invalid={!!errors.name} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.event_type}>
              <FieldLabel htmlFor="ev-type">Event type *</FieldLabel>
              <Controller
                control={control}
                name="event_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ev-type" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {eventTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.event_type]} />
            </Field>
            <Field data-invalid={!!errors.institution}>
              <FieldLabel htmlFor="ev-institution">Host institution *</FieldLabel>
              <Input id="ev-institution" aria-invalid={!!errors.institution} {...register("institution")} />
              <FieldError errors={[errors.institution]} />
            </Field>
            <Field data-invalid={!!errors.start_date}>
              <FieldLabel htmlFor="ev-start">Start date *</FieldLabel>
              <Input id="ev-start" type="date" aria-invalid={!!errors.start_date} {...register("start_date")} />
              <FieldError errors={[errors.start_date]} />
            </Field>
            <Field data-invalid={!!errors.end_date}>
              <FieldLabel htmlFor="ev-end">End date</FieldLabel>
              <Input id="ev-end" type="date" aria-invalid={!!errors.end_date} {...register("end_date")} />
              <FieldError errors={[errors.end_date]} />
            </Field>
            <Field data-invalid={!!errors.location}>
              <FieldLabel htmlFor="ev-location">Location</FieldLabel>
              <Input id="ev-location" placeholder="e.g. Bengaluru" {...register("location")} />
              <FieldError errors={[errors.location]} />
            </Field>
            <Field data-invalid={!!errors.expected_attendees}>
              <FieldLabel htmlFor="ev-attendees">Expected attendees</FieldLabel>
              <Input id="ev-attendees" inputMode="numeric" aria-invalid={!!errors.expected_attendees} {...register("expected_attendees")} />
              <FieldError errors={[errors.expected_attendees]} />
            </Field>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Controller
                control={control}
                name="is_online"
                render={({ field }) => <Checkbox id="ev-online" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />}
              />
              <Label htmlFor="ev-online" className="font-normal">This event runs online</Label>
            </div>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="ev-audience">Target audience</FieldLabel>
              <Input id="ev-audience" placeholder="e.g. Undergraduate CS students" {...register("target_audience")} />
            </Field>
            <Field data-invalid={!!errors.website_url}>
              <FieldLabel htmlFor="ev-website">Website</FieldLabel>
              <Input id="ev-website" type="url" placeholder="https://" aria-invalid={!!errors.website_url} {...register("website_url")} />
              <FieldError errors={[errors.website_url]} />
            </Field>
            <Field data-invalid={!!errors.organizer_name}>
              <FieldLabel htmlFor="ev-org-name">Organizer name</FieldLabel>
              <Input id="ev-org-name" {...register("organizer_name")} />
              <FieldError errors={[errors.organizer_name]} />
            </Field>
            <Field className="sm:col-span-2" data-invalid={!!errors.organizer_email}>
              <FieldLabel htmlFor="ev-org-email">Organizer email</FieldLabel>
              <Input id="ev-org-email" type="email" aria-invalid={!!errors.organizer_email} {...register("organizer_email")} />
              <FieldError errors={[errors.organizer_email]} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="ev-description">Description</FieldLabel>
              <Textarea id="ev-description" rows={3} {...register("description")} />
            </Field>
          </FieldGroup>
          {mutation.error ? <ErrorAlert className="mt-4 border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="event-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : null}
            {event ? "Save changes" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
