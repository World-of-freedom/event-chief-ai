import { useEffect, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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
import { fieldsFor, requirementTitle } from "@/features/needs/requirementFields";
import { createEvent, listEvents, updateEvent } from "@/lib/api/sponsorship";
import { eventTypeOptions } from "@/lib/event-types";
import { needCategoryLabels } from "@/lib/format";
import type { NeedCategory } from "@/types/domain";
import type { EventInput, EventRecord } from "@/types/sponsorship";

const categories = ["cash", "cloud_credits", "equipment", "speakers", "mentors", "venue", "volunteers", "prizes", "food", "merchandise", "other"] as const;
const money = /^\d{1,10}(\.\d{1,2})?$/;
const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

const requirementSchema = z.object({
  category: z.enum(categories),
  target_amount: z.string().trim().refine((value) => value === "" || money.test(value), "Enter an amount like 50000 or 2500.50"),
  target_quantity: z.string().trim().refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1), "Enter a whole number of 1 or more"),
  details: z.record(z.string()),
  description: z.string().trim().min(1, "Describe what is needed"),
  notes: z.string(),
}).superRefine((value, ctx) => {
  for (const field of fieldsFor(value.category)) {
    const current = field.valueKey === "target_amount" ? value.target_amount : field.valueKey === "target_quantity" ? value.target_quantity : value.details[field.key] ?? "";
    if (field.required && !current.trim()) ctx.addIssue({ code: "custom", path: field.valueKey === "details" ? ["details", field.key] : [field.valueKey], message: `${field.label} is required` });
  }
});

const schema = z.object({
  name: z.string().trim().min(1, "Enter the event name").max(160),
  event_type: z.string().min(1, "Choose an event type"),
  institution: z.string().trim().min(1, "Enter the host institution").max(160),
  start_date: z.string().min(1, "Choose a start date"),
  end_date: z.string(),
  parent_event_id: z.string(),
  location: optionalText(200),
  is_online: z.boolean(),
  expected_attendees: z.string().trim().refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 1_000_000), "Enter a whole number between 1 and 1,000,000"),
  target_audience: z.string(),
  website_url: z.string().trim().refine((value) => value === "" || /^https?:\/\/\S+\.\S+/.test(value), "Enter a full URL starting with https://"),
  organizer_name: optionalText(160),
  organizer_email: z.string().trim().refine((value) => value === "" || z.string().email().safeParse(value).success, "Enter a valid email"),
  organizer_phone: optionalText(32),
  description: z.string(),
  requirements: z.array(requirementSchema).max(25),
}).refine((value) => !value.end_date || !value.start_date || value.end_date >= value.start_date, { path: ["end_date"], message: "End date can't be before the start date" });

type FormValues = z.infer<typeof schema>;
const blankRequirement = { category: "cash" as NeedCategory, target_amount: "", target_quantity: "", details: {}, description: "", notes: "" };
const emptyToNull = (value: string) => value.trim() || null;

function toValues(event?: EventRecord, defaultParentEventId?: string | null): FormValues {
  return {
    name: event?.name ?? "", event_type: event?.event_type ?? "hackathon", institution: event?.institution ?? "", start_date: event?.start_date ?? "", end_date: event?.end_date ?? "",
    parent_event_id: event?.parent_event_id ?? defaultParentEventId ?? "", location: event?.location ?? "", is_online: event?.is_online ?? false,
    expected_attendees: event?.expected_attendees ? String(event.expected_attendees) : "", target_audience: event?.target_audience ?? "", website_url: event?.website_url ?? "",
    organizer_name: event?.organizer_name ?? "", organizer_email: event?.organizer_email ?? "", organizer_phone: event?.organizer_phone ?? "", description: event?.description ?? "", requirements: [],
  };
}

function toInput(values: FormValues): EventInput {
  return {
    name: values.name.trim(), event_type: values.event_type, institution: values.institution.trim(), start_date: values.start_date, end_date: values.end_date || null,
    parent_event_id: values.parent_event_id || null, location: emptyToNull(values.location), is_online: values.is_online,
    expected_attendees: values.expected_attendees ? Number(values.expected_attendees) : null, target_audience: emptyToNull(values.target_audience), website_url: emptyToNull(values.website_url),
    organizer_name: emptyToNull(values.organizer_name), organizer_email: emptyToNull(values.organizer_email), organizer_phone: emptyToNull(values.organizer_phone), description: emptyToNull(values.description),
    resource_needs: values.requirements.map((need) => ({
      category: need.category, title: requirementTitle(need.category), target_amount: need.target_amount || null, currency: "INR", target_quantity: need.target_quantity ? Number(need.target_quantity) : null,
      deadline: null, priority: "medium", status: "open", description: need.description.trim(), notes: emptyToNull(need.notes),
      details: Object.fromEntries(Object.entries(need.details).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])),
    })),
  };
}

interface EventFormDialogProps {
  trigger: ReactNode;
  event?: EventRecord;
  defaultParentEventId?: string | null;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (event: EventRecord) => void;
}

export function EventFormDialog({ trigger, event, defaultParentEventId = null, defaultOpen = false, onOpenChange, onSaved }: EventFormDialogProps) {
  const [open, setOpenState] = useState(defaultOpen);
  const [step, setStep] = useState(1);
  const setOpen = (next: boolean) => { setOpenState(next); onOpenChange?.(next); };
  const queryClient = useQueryClient();
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents, enabled: open && !event });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(event, defaultParentEventId) });
  const { register, control, reset, trigger: validate, watch, formState: { errors } } = form;
  const { fields: requirements, append, remove } = useFieldArray({ control, name: "requirements" });
  const requirementValues = watch("requirements");
  const finalStep = event ? 2 : 3;

  useEffect(() => { if (open) { reset(toValues(event, defaultParentEventId)); setStep(1); } }, [open, event, defaultParentEventId, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => event ? updateEvent(event.id, toInput(values)) : createEvent(toInput(values)),
    onSuccess: (saved) => { void queryClient.invalidateQueries({ queryKey: ["events"] }); void queryClient.invalidateQueries({ queryKey: ["event", saved.id] }); void queryClient.invalidateQueries({ queryKey: ["dashboard", saved.id] }); toast.success(event ? "Event updated" : "Event created"); setOpen(false); onSaved?.(saved); },
  });
  const mandatoryFields = ["name", "event_type", "institution", "start_date"] as const;
  const optionalFields = ["end_date", "location", "expected_attendees", "website_url", "organizer_name", "organizer_email", "organizer_phone"] as const;
  const advance = async () => { const valid = await validate(step === 1 ? mandatoryFields : optionalFields); if (valid) setStep((current) => Math.min(current + 1, finalStep)); };
  const save = async () => {
    if (step !== finalStep || mutation.isPending) return;
    if (await validate()) mutation.mutate(form.getValues());
  };
  const savedEvents = (eventsQuery.data ?? []).filter((candidate) => candidate.id !== event?.id);

  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) mutation.reset(); }}>
    {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{event ? "Edit event" : "Create event"}</DialogTitle><DialogDescription>{event ? "Update this event's information. Its linked sub-events remain unchanged." : `Step ${step} of 3 · ${step === 1 ? "Event essentials" : step === 2 ? "Optional details" : "Resource requirements"}`}</DialogDescription></DialogHeader>
      <form id="event-form" onSubmit={(submission) => submission.preventDefault()} noValidate>
        {step === 1 ? <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" data-invalid={!!errors.name}><FieldLabel htmlFor="ev-name">Event name *</FieldLabel><Input id="ev-name" aria-invalid={!!errors.name} {...register("name")} /><FieldError errors={[errors.name]} /></Field>
          <Field data-invalid={!!errors.event_type}><FieldLabel htmlFor="ev-type">Event type *</FieldLabel><Controller control={control} name="event_type" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="ev-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{eventTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>} /><FieldError errors={[errors.event_type]} /></Field>
          <Field data-invalid={!!errors.institution}><FieldLabel htmlFor="ev-institution">Host institution *</FieldLabel><Input id="ev-institution" aria-invalid={!!errors.institution} {...register("institution")} /><FieldError errors={[errors.institution]} /></Field>
          <Field data-invalid={!!errors.start_date}><FieldLabel htmlFor="ev-start">Start date *</FieldLabel><Input id="ev-start" type="date" aria-invalid={!!errors.start_date} {...register("start_date")} /><FieldError errors={[errors.start_date]} /></Field>
          {!event ? <Field><FieldLabel htmlFor="ev-parent">Link to an existing event</FieldLabel><Controller control={control} name="parent_event_id" render={({ field }) => <Select value={field.value || "__none"} onValueChange={(value) => field.onChange(value === "__none" ? "" : value)}><SelectTrigger id="ev-parent" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Don't link to any event</SelectItem>{savedEvents.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}</SelectContent></Select>} /></Field> : null}
        </FieldGroup> : null}
        {step === 2 ? <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.end_date}><FieldLabel htmlFor="ev-end">End date</FieldLabel><Input id="ev-end" type="date" aria-invalid={!!errors.end_date} {...register("end_date")} /><FieldError errors={[errors.end_date]} /></Field>
          <Field data-invalid={!!errors.location}><FieldLabel htmlFor="ev-location">Location</FieldLabel><Input id="ev-location" placeholder="e.g. Bengaluru" {...register("location")} /><FieldError errors={[errors.location]} /></Field>
          <div className="flex items-center gap-2 sm:col-span-2"><Controller control={control} name="is_online" render={({ field }) => <Checkbox id="ev-online" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />} /><Label htmlFor="ev-online" className="font-normal">This event runs online</Label></div>
          <Field data-invalid={!!errors.expected_attendees}><FieldLabel htmlFor="ev-attendees">Expected attendees</FieldLabel><Input id="ev-attendees" inputMode="numeric" aria-invalid={!!errors.expected_attendees} {...register("expected_attendees")} /><FieldError errors={[errors.expected_attendees]} /></Field>
          <Field><FieldLabel htmlFor="ev-audience">Target audience</FieldLabel><Input id="ev-audience" placeholder="e.g. Undergraduate CS students" {...register("target_audience")} /></Field>
          <Field className="sm:col-span-2" data-invalid={!!errors.website_url}><FieldLabel htmlFor="ev-website">Website</FieldLabel><Input id="ev-website" type="url" placeholder="https://" aria-invalid={!!errors.website_url} {...register("website_url")} /><FieldError errors={[errors.website_url]} /></Field>
          <Field data-invalid={!!errors.organizer_name}><FieldLabel htmlFor="ev-org-name">Organizer name</FieldLabel><Input id="ev-org-name" {...register("organizer_name")} /><FieldError errors={[errors.organizer_name]} /></Field>
          <Field data-invalid={!!errors.organizer_email}><FieldLabel htmlFor="ev-org-email">Organizer email</FieldLabel><Input id="ev-org-email" type="email" aria-invalid={!!errors.organizer_email} {...register("organizer_email")} /><FieldError errors={[errors.organizer_email]} /></Field>
          <Field className="sm:col-span-2" data-invalid={!!errors.organizer_phone}><FieldLabel htmlFor="ev-org-phone">Organizer contact number</FieldLabel><Input id="ev-org-phone" type="tel" placeholder="Optional" aria-invalid={!!errors.organizer_phone} {...register("organizer_phone")} /><FieldError errors={[errors.organizer_phone]} /></Field>
          <Field className="sm:col-span-2"><FieldLabel htmlFor="ev-description">Description</FieldLabel><Textarea id="ev-description" rows={3} {...register("description")} /></Field>
        </FieldGroup> : null}
        {step === 3 && !event ? <div className="space-y-4"><div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4"><div><FieldLabel>Resource requirements</FieldLabel><p className="mt-1 text-sm text-muted-foreground">Optional at this point. Each requirement uses fields designed for its category.</p></div><Button type="button" variant="outline" size="sm" onClick={() => append(blankRequirement)}><Plus />Add requirement</Button></div>
          {requirements.map((requirement, index) => <div key={requirement.id} className="space-y-4 rounded-lg border bg-background p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">Requirement {index + 1}</p><Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(index)}><Trash2 />Remove</Button></div><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field className="sm:col-span-2"><FieldLabel>Category *</FieldLabel><Controller control={control} name={`requirements.${index}.category`} render={({ field }) => <Select value={field.value} onValueChange={(value) => field.onChange(value as NeedCategory)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(needCategoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>} /></Field>
            {fieldsFor(requirementValues[index]?.category ?? "cash").map((field) => { const fieldError = field.valueKey === "details" ? errors.requirements?.[index]?.details?.[field.key] : errors.requirements?.[index]?.[field.valueKey]; const name = field.valueKey === "details" ? `requirements.${index}.details.${field.key}` as const : `requirements.${index}.${field.valueKey}` as const; return <Field key={`${requirement.id}-${field.key}`} data-invalid={!!fieldError}><FieldLabel htmlFor={`initial-${index}-${field.key}`}>{field.label}{field.required ? " *" : ""}</FieldLabel><Input id={`initial-${index}-${field.key}`} inputMode={field.inputMode} placeholder={field.placeholder} aria-invalid={!!fieldError} {...register(name)} /><FieldError errors={[fieldError]} /></Field>; })}
            <Field className="sm:col-span-2" data-invalid={!!errors.requirements?.[index]?.description}><FieldLabel htmlFor={`initial-${index}-requirements`}>Requirements *</FieldLabel><Textarea id={`initial-${index}-requirements`} rows={3} aria-invalid={!!errors.requirements?.[index]?.description} {...register(`requirements.${index}.description`)} /><FieldError errors={[errors.requirements?.[index]?.description]} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor={`initial-${index}-notes`}>Notes</FieldLabel><Textarea id={`initial-${index}-notes`} rows={2} {...register(`requirements.${index}.notes`)} /></Field>
          </FieldGroup></div>)}</div> : null}
        {mutation.error ? <ErrorAlert className="mt-4 border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
      </form>
      <DialogFooter>{step > 1 ? <Button type="button" variant="outline" onClick={() => setStep((current) => current - 1)}><ArrowLeft />Back</Button> : <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>}{step < finalStep ? <Button type="button" onClick={() => void advance()}>Next</Button> : <Button type="button" disabled={mutation.isPending} onClick={() => void save()}>{mutation.isPending ? <Spinner /> : null}{event ? "Save changes" : "Create event"}</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
