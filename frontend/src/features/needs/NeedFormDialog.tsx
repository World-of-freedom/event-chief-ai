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
import { createNeed, updateNeed } from "@/lib/api/sponsorship";
import { needCategoryLabels, needPriorityLabels, needStatusLabels } from "@/lib/format";
import type { NeedCategory } from "@/types/domain";
import type { NeedPriority, NeedStatus, ResourceNeed, ResourceNeedInput } from "@/types/sponsorship";

const money = /^\d{1,10}(\.\d{1,2})?$/;

const schema = z
  .object({
    category: z.enum(["cash", "cloud_credits", "prizes", "food", "merchandise", "other"]),
    title: z.string().trim().min(1, "Enter a short title").max(160),
    target_amount: z.string().trim().refine((v) => v === "" || money.test(v), "Enter an amount like 50000 or 2500.50"),
    target_quantity: z.string().trim(),
    deadline: z.string(),
    priority: z.enum(["low", "medium", "high"]),
    status: z.enum(["open", "in_progress", "partially_covered", "covered"]),
    description: z.string(),
    notes: z.string(),
  })
  .refine((v) => v.category === "cash" || v.target_quantity === "" || (/^\d+$/.test(v.target_quantity) && Number(v.target_quantity) >= 1), {
    path: ["target_quantity"],
    message: "Enter a whole number of 1 or more",
  })
  // Same rule as the API: cash needs require a target amount above zero.
  .refine((v) => v.category !== "cash" || (v.target_amount !== "" && Number(v.target_amount) > 0), {
    path: ["target_amount"],
    message: "Cash needs need a target amount above 0",
  });

type FormValues = z.infer<typeof schema>;

function toValues(need?: ResourceNeed): FormValues {
  return {
    category: need?.category ?? "cash",
    title: need?.title ?? "",
    target_amount: need?.target_amount ? String(Number(need.target_amount)) : "",
    target_quantity: need?.target_quantity ? String(need.target_quantity) : "",
    deadline: need?.deadline ?? "",
    priority: need?.priority ?? "medium",
    status: need?.status ?? "open",
    description: need?.description ?? "",
    notes: need?.notes ?? "",
  };
}

function toInput(values: FormValues): ResourceNeedInput {
  return {
    category: values.category,
    title: values.title.trim(),
    target_amount: values.target_amount || null,
    currency: "INR",
    target_quantity: values.category !== "cash" && values.target_quantity ? Number(values.target_quantity) : null,
    deadline: values.deadline || null,
    priority: values.priority,
    status: values.status,
    description: values.description.trim() || null,
    notes: values.notes.trim() || null,
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
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const queryClient = useQueryClient();
  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(need),
  });
  const category = watch("category");

  useEffect(() => {
    if (open) reset(toValues(need));
  }, [open, need, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => (need ? updateNeed(need.id, toInput(values)) : createNeed(eventId, toInput(values))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["needs", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", eventId] });
      toast.success(need ? "Need updated" : "Need added");
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) mutation.reset(); }}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{need ? "Edit resource need" : "Add resource need"}</DialogTitle>
          <DialogDescription>Cash needs need a target amount. In-kind needs can use a quantity, a value, or both.</DialogDescription>
        </DialogHeader>
        <form id="need-form" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="need-category">Category *</FieldLabel>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => field.onChange(value as NeedCategory)}>
                    <SelectTrigger id="need-category" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(needCategoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="need-title">Title *</FieldLabel>
              <Input id="need-title" placeholder="e.g. Prize pool" aria-invalid={!!errors.title} {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={!!errors.target_amount}>
              <FieldLabel htmlFor="need-amount">Target amount (₹){category === "cash" ? " *" : ""}</FieldLabel>
              <Input id="need-amount" inputMode="decimal" placeholder="e.g. 50000" aria-invalid={!!errors.target_amount} {...register("target_amount")} />
              <FieldError errors={[errors.target_amount]} />
            </Field>
            {category !== "cash" ? (
              <Field data-invalid={!!errors.target_quantity}>
                <FieldLabel htmlFor="need-quantity">Target quantity</FieldLabel>
                <Input id="need-quantity" inputMode="numeric" placeholder="e.g. 300" aria-invalid={!!errors.target_quantity} {...register("target_quantity")} />
                <FieldError errors={[errors.target_quantity]} />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="need-deadline">Deadline</FieldLabel>
              <Input id="need-deadline" type="date" {...register("deadline")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="need-priority">Priority</FieldLabel>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => field.onChange(value as NeedPriority)}>
                    <SelectTrigger id="need-priority" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(needPriorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            {need ? (
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="need-status">Status</FieldLabel>
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(value) => field.onChange(value as NeedStatus)}>
                      <SelectTrigger id="need-status" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(needStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>Covered in-kind needs drop off the dashboard's open list.</FieldDescription>
              </Field>
            ) : null}
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="need-description">Description</FieldLabel>
              <Textarea id="need-description" rows={2} {...register("description")} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="need-notes">Notes</FieldLabel>
              <Textarea id="need-notes" rows={2} {...register("notes")} />
            </Field>
          </FieldGroup>
          {mutation.error ? <ErrorAlert className="mt-4 border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="need-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : null}
            {need ? "Save changes" : "Add need"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
