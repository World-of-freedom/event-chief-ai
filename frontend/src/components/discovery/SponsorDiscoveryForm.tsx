import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronLeft, ChevronRight, CirclePlus, MapPin, Sparkles, Trash2, Users } from "lucide-react";

import { EventSelect } from "@/components/EventSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { fieldsFor, requirementTitle } from "@/features/needs/requirementFields";
import { listEvents, listNeeds } from "@/lib/api/sponsorship";
import { eventTypeLabel } from "@/lib/event-types";
import { formatDate, formatMoney, needCategoryLabels, needPriorityLabels } from "@/lib/format";
import type { CreateResearchJobInput, NeedCategory } from "@/types/domain";
import type { EventRecord, NeedPriority, ResourceNeed, ResourceNeedInput } from "@/types/sponsorship";

type RequirementDraft = {
  category: NeedCategory;
  target_amount: string;
  target_quantity: string;
  details: Record<string, string>;
  deadline: string;
  priority: NeedPriority;
  description: string;
  notes: string;
};

interface SponsorDiscoveryFormProps {
  onSubmit: (input: CreateResearchJobInput) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  initialEventId?: string | null;
}

const categories: NeedCategory[] = ["cash", "cloud_credits", "equipment", "speakers", "mentors", "venue", "volunteers", "prizes", "food", "merchandise", "other"];
const money = /^\d{1,10}(\.\d{1,2})?$/;

const blankRequirement = (): RequirementDraft => ({
  category: "cash",
  target_amount: "",
  target_quantity: "",
  details: {},
  deadline: "",
  priority: "medium",
  description: "",
  notes: "",
});

function requirementSummary(need: ResourceNeed) {
  if (need.target_amount) return formatMoney(need.target_amount, need.currency);
  if (need.target_quantity) return `${need.target_quantity.toLocaleString()} requested`;
  return need.description || "Details to be agreed";
}

function requirementError(draft: RequirementDraft) {
  if (draft.target_amount && !money.test(draft.target_amount)) return "Enter a valid amount before continuing.";
  if (draft.target_quantity && (!/^\d+$/.test(draft.target_quantity) || Number(draft.target_quantity) < 1)) return "Enter a whole-number quantity of at least 1.";
  if (!draft.description.trim()) return "Describe what is needed.";
  for (const field of fieldsFor(draft.category)) {
    const value = field.valueKey === "target_amount" ? draft.target_amount : field.valueKey === "target_quantity" ? draft.target_quantity : draft.details[field.key] ?? "";
    if (field.required && !value.trim()) return `${field.label} is required.`;
  }
  return null;
}

function toResourceNeedInput(draft: RequirementDraft): ResourceNeedInput {
  return {
    category: draft.category,
    title: requirementTitle(draft.category),
    target_amount: draft.target_amount || null,
    currency: "INR",
    target_quantity: draft.target_quantity ? Number(draft.target_quantity) : null,
    deadline: draft.deadline || null,
    priority: draft.priority,
    status: "open",
    description: draft.description.trim(),
    notes: draft.notes.trim() || null,
    details: Object.fromEntries(Object.entries(draft.details).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()])),
  };
}

function EventSnapshot({ event }: { event: EventRecord }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-3">
      <div><p className="text-xs text-muted-foreground">Event</p><p className="font-medium">{eventTypeLabel(event.event_type)}</p></div>
      <div className="flex gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{formatDate(event.start_date)}</p></div></div>
      <div className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{event.is_online ? "Online" : event.location || "Not specified"}</p></div></div>
      {event.target_audience ? <div className="flex gap-2 sm:col-span-2"><Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Audience</p><p className="font-medium">{event.target_audience}</p></div></div> : null}
    </div>
  );
}

function RequirementPicker({ needs, selectedIds, onToggle }: { needs: ResourceNeed[]; selectedIds: string[]; onToggle: (needId: string) => void }) {
  if (!needs.length) return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">This event has no open requirements yet. Add one below if sponsor research should focus on a specific resource.</p>;
  return <div className="grid gap-2">{needs.map((need) => {
    const checked = selectedIds.includes(need.id);
    return <label key={need.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
      <Checkbox checked={checked} onCheckedChange={() => onToggle(need.id)} aria-label={`Include ${need.title}`} className="mt-0.5" />
      <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span className="font-medium">{need.title}</span><span className="text-xs text-muted-foreground">{requirementSummary(need)}</span></span><span className="mt-0.5 block text-xs text-muted-foreground">{needCategoryLabels[need.category]}{need.description ? ` · ${need.description}` : ""}</span></span>
    </label>;
  })}</div>;
}

function NewRequirementCard({ draft, index, error, onChange, onRemove }: { draft: RequirementDraft; index: number; error: string | null; onChange: (patch: Partial<RequirementDraft>) => void; onRemove: () => void }) {
  const fields = fieldsFor(draft.category);
  const setDetail = (key: string, value: string) => onChange({ details: { ...draft.details, [key]: value } });
  return <div className="space-y-4 rounded-lg border bg-background p-4" data-invalid={!!error}>
    <div className="flex items-center justify-between gap-3"><div><p className="font-medium">New requirement {index + 1}</p><p className="text-xs text-muted-foreground">It will be saved to this event when research starts.</p></div><Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={onRemove} aria-label={`Remove new requirement ${index + 1}`}><Trash2 /></Button></div>
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      <Field className="sm:col-span-2"><FieldLabel>Resource type *</FieldLabel><Select value={draft.category} onValueChange={(value) => onChange({ category: value as NeedCategory })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{needCategoryLabels[category]}</SelectItem>)}</SelectContent></Select></Field>
      {fields.map((field) => {
        const value = field.valueKey === "target_amount" ? draft.target_amount : field.valueKey === "target_quantity" ? draft.target_quantity : draft.details[field.key] ?? "";
        const setValue = (next: string) => field.valueKey === "target_amount" ? onChange({ target_amount: next }) : field.valueKey === "target_quantity" ? onChange({ target_quantity: next }) : setDetail(field.key, next);
        return <Field key={`${draft.category}-${field.key}`}><FieldLabel>{field.label}{field.required ? " *" : ""}</FieldLabel><Input inputMode={field.inputMode} placeholder={field.placeholder} value={value} onChange={(event) => setValue(event.target.value)} /></Field>;
      })}
      <Field className="sm:col-span-2"><FieldLabel>Requirements *</FieldLabel><Textarea rows={3} placeholder="Describe exactly what is needed, expected quality, timing or constraints." value={draft.description} onChange={(event) => onChange({ description: event.target.value })} /></Field>
      <Field><FieldLabel>Deadline</FieldLabel><Input type="date" value={draft.deadline} onChange={(event) => onChange({ deadline: event.target.value })} /></Field>
      <Field><FieldLabel>Priority</FieldLabel><Select value={draft.priority} onValueChange={(value) => onChange({ priority: value as NeedPriority })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(needPriorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></Field>
      <Field className="sm:col-span-2"><FieldLabel>Notes</FieldLabel><Textarea rows={2} placeholder="Optional internal notes" value={draft.notes} onChange={(event) => onChange({ notes: event.target.value })} /></Field>
    </FieldGroup>
    {error ? <p className="text-sm text-destructive">{error}</p> : null}
  </div>;
}

export function SponsorDiscoveryForm({ onSubmit, onCancel, isSubmitting = false, initialEventId = null }: SponsorDiscoveryFormProps) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [eventId, setEventId] = useState<string | null>(null);
  const [selectedNeedIds, setSelectedNeedIds] = useState<string[]>([]);
  const [newRequirements, setNewRequirements] = useState<RequirementDraft[]>([]);
  const [newRequirementErrors, setNewRequirementErrors] = useState<Array<string | null>>([]);
  const [sponsorBenefits, setSponsorBenefits] = useState("");
  const [eligibilityConstraints, setEligibilityConstraints] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const selectedEvent = (eventsQuery.data ?? []).find((event) => event.id === eventId) ?? null;
  const needsQuery = useQuery({ queryKey: ["needs", eventId], queryFn: () => listNeeds(eventId!), enabled: !!eventId });
  const openNeeds = (needsQuery.data ?? []).filter((need) => need.status !== "covered");

  useEffect(() => {
    if (!eventId && initialEventId && eventsQuery.data?.some((event) => event.id === initialEventId)) setEventId(initialEventId);
  }, [eventId, eventsQuery.data, initialEventId]);

  const changeEvent = (nextEventId: string | null) => {
    setEventId(nextEventId);
    setSelectedNeedIds([]);
    setNewRequirements([]);
    setNewRequirementErrors([]);
    setStage(1);
  };
  const toggleNeed = (needId: string) => setSelectedNeedIds((current) => current.includes(needId) ? current.filter((id) => id !== needId) : [...current, needId]);
  const updateNewRequirement = (index: number, patch: Partial<RequirementDraft>) => setNewRequirements((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft));
  const removeNewRequirement = (index: number) => {
    setNewRequirements((current) => current.filter((_, draftIndex) => draftIndex !== index));
    setNewRequirementErrors((current) => current.filter((_, draftIndex) => draftIndex !== index));
  };

  const continueToSponsorDetails = (event: MouseEvent<HTMLButtonElement>) => {
    // React may reconcile this button into the stage-two submit button before
    // the browser processes the click's default form action. Explicitly cancel
    // it so only the dedicated stage-two action can start a discovery.
    event.preventDefault();
    event.stopPropagation();
    const errors = newRequirements.map(requirementError);
    setNewRequirementErrors(errors);
    if (!eventId || errors.some(Boolean)) return;
    setStage(2);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (stage !== 2) return;
    const errors = newRequirements.map(requirementError);
    setNewRequirementErrors(errors);
    if (!eventId || errors.some(Boolean)) {
      setStage(1);
      return;
    }
    await onSubmit({
      event_id: eventId,
      resource_need_ids: selectedNeedIds,
      new_resource_needs: newRequirements.map(toResourceNeedInput),
      sponsor_benefits: sponsorBenefits.trim() || undefined,
      eligibility_constraints: eligibilityConstraints.trim() || undefined,
      additional_notes: additionalNotes.trim() || undefined,
    });
  };

  return <form onSubmit={submit} className="mx-auto max-w-4xl">
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="size-5 text-primary" />Launch sponsor discovery</CardTitle>
        <CardDescription>Start from an existing event so research uses its actual format, audience, timing and location.</CardDescription>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {([1, 2] as const).map((value) => <div key={value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${stage === value ? "border-primary/50 bg-primary/5 text-foreground" : "text-muted-foreground"}`}><span className={`grid size-5 place-items-center rounded-full text-xs ${stage > value ? "bg-primary text-primary-foreground" : stage === value ? "border border-primary text-primary" : "border"}`}>{stage > value ? <Check className="size-3" /> : value}</span><span className="font-medium">{value === 1 ? "Resource requirements" : "Sponsor details"}</span></div>)}
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {stage === 1 ? <div className="space-y-6">
          <Field><FieldLabel htmlFor="discovery-event">Event *</FieldLabel>{eventsQuery.isLoading ? <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground"><Spinner />Loading events…</div> : eventsQuery.data?.length ? <EventSelect id="discovery-event" events={eventsQuery.data} value={eventId} onChange={changeEvent} className="w-full" /> : <FieldDescription>No saved events yet. Create an event before beginning sponsor discovery.</FieldDescription>}</Field>
          {selectedEvent ? <EventSnapshot event={selectedEvent} /> : null}
          {selectedEvent ? <section className="space-y-4"><div><h2 className="font-medium">Choose requirements to research</h2><p className="mt-1 text-sm text-muted-foreground">Select every open event requirement that sponsorship should help fulfil. You can continue without one for broad partner research.</p></div>{needsQuery.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner />Loading requirements…</div> : <RequirementPicker needs={openNeeds} selectedIds={selectedNeedIds} onToggle={toggleNeed} />}<div className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">Need something else?</p><p className="text-sm text-muted-foreground">Add it here using the same requirement fields as the event. It is saved only when you launch this discovery.</p></div><Button type="button" variant="outline" size="sm" onClick={() => { setNewRequirements((current) => [...current, blankRequirement()]); setNewRequirementErrors((current) => [...current, null]); }}><CirclePlus />Add requirement</Button></div>{newRequirements.map((draft, index) => <NewRequirementCard key={index} draft={draft} index={index} error={newRequirementErrors[index] ?? null} onChange={(patch) => updateNewRequirement(index, patch)} onRemove={() => removeNewRequirement(index)} />)}</div></section> : null}
        </div> : <div className="space-y-5"><div className="rounded-lg border bg-muted/30 p-4"><p className="font-medium">{selectedEvent?.name}</p><p className="mt-1 text-sm text-muted-foreground">{selectedNeedIds.length + newRequirements.length ? `${selectedNeedIds.length + newRequirements.length} requirement${selectedNeedIds.length + newRequirements.length === 1 ? "" : "s"} included in this research.` : "No specific requirements selected — research will use the event brief."}</p></div><FieldGroup><Field><FieldLabel htmlFor="discovery-benefits">Benefits offered to sponsors</FieldLabel><Textarea id="discovery-benefits" rows={4} maxLength={2000} placeholder="e.g. on-stage mention, branded booth, hiring access, logo placement, social posts" value={sponsorBenefits} onChange={(event) => setSponsorBenefits(event.target.value)} /><FieldDescription>Describe the value a sponsor receives in return.</FieldDescription></Field><Field><FieldLabel htmlFor="discovery-eligibility">Eligibility or partner constraints</FieldLabel><Textarea id="discovery-eligibility" rows={4} maxLength={2000} placeholder="e.g. brands that serve students, no competing beverage partners, must support in-kind delivery in Bengaluru" value={eligibilityConstraints} onChange={(event) => setEligibilityConstraints(event.target.value)} /></Field><Field><FieldLabel htmlFor="discovery-notes">Additional notes</FieldLabel><Textarea id="discovery-notes" rows={3} maxLength={2000} placeholder="Anything else that should shape the research" value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} /></Field></FieldGroup></div>}
      </CardContent>
      <CardFooter className="justify-between gap-3"><div>{stage === 2 ? <Button type="button" variant="outline" onClick={() => setStage(1)}><ChevronLeft />Back</Button> : onCancel ? <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button> : null}</div>{stage === 1 ? <Button key="continue-stage" type="button" onClick={continueToSponsorDetails} disabled={!eventId || needsQuery.isLoading}><ChevronRight />Continue</Button> : <Button key="submit-stage" type="submit" disabled={isSubmitting}>{isSubmitting ? <Spinner /> : <Sparkles />}Start sponsor discovery</Button>}</CardFooter>
    </Card>
  </form>;
}
