import { useEffect, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { fieldsFor, requirementTitle } from "@/features/needs/requirementFields";
import { createNeed, updateNeed } from "@/lib/api/sponsorship";
import { needCategoryLabels, needPriorityLabels, needStatusLabels } from "@/lib/format";
import type { NeedCategory } from "@/types/domain";
import type { NeedPriority, NeedStatus, ResourceNeed, ResourceNeedInput } from "@/types/sponsorship";

const categories = ["cash", "cloud_credits", "equipment", "speakers", "mentors", "venue", "volunteers", "prizes", "food", "merchandise", "other"] as const;
const money = /^\d{1,10}(\.\d{1,2})?$/;

const schema = z.object({
  category: z.enum(categories),
  target_amount: z.string().trim().refine((value) => value === "" || money.test(value), "Enter an amount like 50000 or 2500.50"),
  target_quantity: z.string().trim().refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 1), "Enter a whole number of 1 or more"),
  details: z.record(z.string()),
  deadline: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["open", "in_progress", "partially_covered", "covered"]),
  description: z.string().trim().min(1, "Describe what is needed"),
  notes: z.string(),
}).superRefine((value, ctx) => {
  for (const field of fieldsFor(value.category)) {
    const current = field.valueKey === "target_amount" ? value.target_amount : field.valueKey === "target_quantity" ? value.target_quantity : value.details[field.key] ?? "";
    if (field.required && !current.trim()) {
      ctx.addIssue({ code: "custom", path: field.valueKey === "details" ? ["details", field.key] : [field.valueKey], message: `${field.label} is required` });
    }
  }
});

type FormValues = z.infer<typeof schema>;

function toValues(need?: ResourceNeed): FormValues {
  return {
    category: need?.category ?? "cash",
    target_amount: need?.target_amount ? String(Number(need.target_amount)) : "",
    target_quantity: need?.target_quantity ? String(need.target_quantity) : "",
    details: Object.fromEntries(Object.entries(need?.details ?? {}).map(([key, value]) => [key, String(value)])),
    deadline: need?.deadline ?? "",
    priority: need?.priority ?? "medium",
    status: need?.status ?? "open",
    description: need?.description ?? "",
    notes: need?.notes ?? "",
  };
}

function toInput(values: FormValues): ResourceNeedInput {
  const details = Object.fromEntries(Object.entries(values.details).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
  return {
    category: values.category,
    title: requirementTitle(values.category),
    target_amount: values.target_amount || null,
    currency: "INR",
    target_quantity: values.target_quantity ? Number(values.target_quantity) : null,
    deadline: values.deadline || null,
    priority: values.priority,
    status: values.status,
    description: values.description.trim(),
    notes: values.notes.trim() || null,
    details,
  };
}

interface NeedFormDialogProps {
  eventId: string;
  need?: ResourceNeed;
  trigger: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NeedFormDialog({ eventId, need, trigger, defaultOpen = false, onOpenChange }: NeedFormDialogProps) {
  const [open, setOpenState] = useState(defaultOpen);
  const setOpen = (next: boolean) => { setOpenState(next); onOpenChange?.(next); };
  const queryClient = useQueryClient();
  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(need) });
  const category = watch("category");

  useEffect(() => { if (open) reset(toValues(need)); }, [open, need, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => need ? updateNeed(need.id, toInput(values)) : createNeed(eventId, toInput(values)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["needs"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", eventId] });
      toast.success(need ? "Requirement updated" : "Requirement added");
      setOpen(false);
    },
  });

  return <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) mutation.reset(); }}>
    {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
    <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{need ? "Edit resource requirement" : "Add resource requirement"}</DialogTitle><DialogDescription>Choose a category first to reveal only the information relevant to that resource.</DialogDescription></DialogHeader>
      <form id="need-form" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2"><FieldLabel htmlFor="need-category">Category *</FieldLabel><Controller control={control} name="category" render={({ field }) => <Select value={field.value} onValueChange={(value) => field.onChange(value as NeedCategory)}><SelectTrigger id="need-category" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(needCategoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>} /></Field>
          {fieldsFor(category).map((field) => {
            const error = field.valueKey === "details" ? errors.details?.[field.key] : errors[field.valueKey];
            const name = field.valueKey === "details" ? `details.${field.key}` as const : field.valueKey;
            return <Field key={`${category}-${field.key}`} data-invalid={!!error}>
              <FieldLabel htmlFor={`need-${field.key}`}>{field.label}{field.required ? " *" : ""}</FieldLabel>
              <Input id={`need-${field.key}`} inputMode={field.inputMode} placeholder={field.placeholder} aria-invalid={!!error} {...register(name)} />
              <FieldError errors={[error]} />
            </Field>;
          })}
          <Field className="sm:col-span-2" data-invalid={!!errors.description}><FieldLabel htmlFor="need-description">Requirements *</FieldLabel><Textarea id="need-description" rows={3} placeholder="Describe exactly what is needed, expected quality, timing or constraints." aria-invalid={!!errors.description} {...register("description")} /><FieldError errors={[errors.description]} /></Field>
          <Field className="sm:col-span-2"><FieldLabel htmlFor="need-notes">Notes</FieldLabel><Textarea id="need-notes" rows={2} placeholder="Optional internal notes" {...register("notes")} /></Field>
          <Field><FieldLabel htmlFor="need-deadline">Deadline</FieldLabel><Input id="need-deadline" type="date" {...register("deadline")} /></Field>
          <Field><FieldLabel htmlFor="need-priority">Priority</FieldLabel><Controller control={control} name="priority" render={({ field }) => <Select value={field.value} onValueChange={(value) => field.onChange(value as NeedPriority)}><SelectTrigger id="need-priority" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(needPriorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>} /></Field>
          {need ? <Field className="sm:col-span-2"><FieldLabel htmlFor="need-status">Status</FieldLabel><Controller control={control} name="status" render={({ field }) => <Select value={field.value} onValueChange={(value) => field.onChange(value as NeedStatus)}><SelectTrigger id="need-status" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(needStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>} /><FieldDescription>Covered in-kind requirements drop off the dashboard's open list.</FieldDescription></Field> : null}
        </FieldGroup>
        {mutation.error ? <ErrorAlert className="mt-4 border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
      </form>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="need-form" disabled={mutation.isPending}>{mutation.isPending ? <Spinner /> : null}{need ? "Save changes" : "Add requirement"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
