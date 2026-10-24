import { useEffect, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createOffer, listNeeds, updateOffer } from "@/lib/api/sponsorship";
import { formatMoney, needCategoryLabels } from "@/lib/format";
import type { NeedCategory } from "@/types/domain";
import type { Offer, OfferPatch } from "@/types/sponsorship";

const NO_NEED = "__none__";
const money = /^\d{1,10}(\.\d{1,2})?$/;
const url = z.string().trim().refine((v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v), "Enter a full URL starting with https://");

function useRefreshOffers(opportunityId: string, eventId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["opportunity", opportunityId] });
    void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", eventId] });
  };
}

const offerSchema = z.object({
  support_type: z.enum(["cash", "cloud_credits", "prizes", "food", "merchandise", "other"]),
  resource_need_id: z.string(),
  // Unknown amounts stay empty; they are never turned into 0.
  stated_value: z.string().trim().refine((v) => v === "" || money.test(v), "Enter an amount like 50000"),
  quantity: z.string().trim().refine((v) => v === "" || /^\d+$/.test(v), "Enter a whole number"),
  conditions: z.string(),
  eligibility_requirements: z.string(),
  expected_timeline: z.string(),
  evidence_notes: z.string(),
  evidence_url: url,
});
type OfferValues = z.infer<typeof offerSchema>;
const emptyOffer: OfferValues = {
  support_type: "cash", resource_need_id: NO_NEED, stated_value: "", quantity: "", conditions: "",
  eligibility_requirements: "", expected_timeline: "", evidence_notes: "", evidence_url: "",
};

export function AddOfferDialog({ opportunityId, eventId, trigger }: { opportunityId: string; eventId: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const refresh = useRefreshOffers(opportunityId, eventId);
  const needsQuery = useQuery({ queryKey: ["needs", eventId], queryFn: () => listNeeds(eventId), enabled: open });
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<OfferValues>({
    resolver: zodResolver(offerSchema),
    defaultValues: emptyOffer,
  });

  useEffect(() => {
    if (open) reset(emptyOffer);
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: OfferValues) =>
      createOffer(opportunityId, {
        support_type: values.support_type,
        resource_need_id: values.resource_need_id === NO_NEED ? null : values.resource_need_id,
        stated_value: values.stated_value || null,
        quantity: values.quantity ? Number(values.quantity) : null,
        conditions: values.conditions.trim() || null,
        eligibility_requirements: values.eligibility_requirements.trim() || null,
        expected_timeline: values.expected_timeline.trim() || null,
        evidence_notes: values.evidence_notes.trim() || null,
        evidence_url: values.evidence_url.trim() || null,
      }),
    onSuccess: () => {
      refresh();
      toast.success("Offer recorded as proposed");
      setOpen(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) mutation.reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record an offer</DialogTitle>
          <DialogDescription>New offers start as “proposed” and don't count as secured until you review and accept them.</DialogDescription>
        </DialogHeader>
        <form id="offer-form" noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="offer-type">Support type *</FieldLabel>
              <Controller
                control={control}
                name="support_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => field.onChange(value as NeedCategory)}>
                    <SelectTrigger id="offer-type" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(needCategoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="offer-need">Covers need</FieldLabel>
              <Controller
                control={control}
                name="resource_need_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="offer-need" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_NEED}>Not linked</SelectItem>
                      {(needsQuery.data ?? []).map((need) => <SelectItem key={need.id} value={need.id}>{need.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field data-invalid={!!errors.stated_value}>
              <FieldLabel htmlFor="offer-value">Value (₹)</FieldLabel>
              <Input id="offer-value" inputMode="decimal" placeholder="Leave empty if unknown" aria-invalid={!!errors.stated_value} {...register("stated_value")} />
              <FieldError errors={[errors.stated_value]} />
            </Field>
            <Field data-invalid={!!errors.quantity}>
              <FieldLabel htmlFor="offer-quantity">Quantity</FieldLabel>
              <Input id="offer-quantity" inputMode="numeric" aria-invalid={!!errors.quantity} {...register("quantity")} />
              <FieldError errors={[errors.quantity]} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="offer-conditions">Conditions</FieldLabel>
              <Textarea id="offer-conditions" rows={2} placeholder="e.g. Logo on main stage, 10-minute talk" {...register("conditions")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="offer-eligibility">Eligibility requirements</FieldLabel>
              <Input id="offer-eligibility" {...register("eligibility_requirements")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="offer-timeline">Expected timeline</FieldLabel>
              <Input id="offer-timeline" placeholder="e.g. Before 1 Nov" {...register("expected_timeline")} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="offer-evidence">Evidence notes</FieldLabel>
              <Textarea id="offer-evidence" rows={2} placeholder="Where did this offer come from?" {...register("evidence_notes")} />
            </Field>
            <Field className="sm:col-span-2" data-invalid={!!errors.evidence_url}>
              <FieldLabel htmlFor="offer-evidence-url">Evidence link</FieldLabel>
              <Input id="offer-evidence-url" type="url" placeholder="https://" aria-invalid={!!errors.evidence_url} {...register("evidence_url")} />
              <FieldError errors={[errors.evidence_url]} />
            </Field>
          </FieldGroup>
          {mutation.error ? <ErrorAlert className="mt-4 border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="offer-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : null}
            Record offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useOfferStatusMutation(opportunityId: string, eventId: string) {
  const refresh = useRefreshOffers(opportunityId, eventId);
  return useMutation({
    mutationFn: ({ offer, patch }: { offer: Offer; patch: OfferPatch }) => updateOffer(offer.id, patch),
    onSuccess: () => {
      refresh();
      toast.success("Offer updated");
    },
  });
}

/** Accepting needs evidence (a note or link) or an explicit confirmation, same as the API rule. */
export function AcceptOfferDialog({
  offer,
  opportunityId,
  eventId,
  open,
  onOpenChange,
}: {
  offer: Offer;
  opportunityId: string;
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [notes, setNotes] = useState(offer.evidence_notes ?? "");
  const [link, setLink] = useState(offer.evidence_url ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useOfferStatusMutation(opportunityId, eventId);

  useEffect(() => {
    if (open) {
      setNotes(offer.evidence_notes ?? "");
      setLink(offer.evidence_url ?? "");
      setConfirmed(false);
      mutation.reset();
    }
  }, [open]);

  const linkInvalid = link.trim() !== "" && !/^https?:\/\/\S+\.\S+/.test(link.trim());
  const ready = !linkInvalid && (notes.trim() !== "" || link.trim() !== "" || confirmed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept this offer?</DialogTitle>
          <DialogDescription>
            {needCategoryLabels[offer.support_type]}
            {offer.stated_value ? ` · ${formatMoney(offer.stated_value, offer.currency)}` : " · value unknown"}. Accepted offers count as secured support on the dashboard.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="accept-notes">Evidence notes</FieldLabel>
            <Textarea id="accept-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Confirmed by email from their marketing lead on 12 Oct" />
          </Field>
          <Field data-invalid={linkInvalid}>
            <FieldLabel htmlFor="accept-link">Evidence link</FieldLabel>
            <Input id="accept-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" aria-invalid={linkInvalid} />
            {linkInvalid ? <FieldError>Enter a full URL starting with https://</FieldError> : null}
          </Field>
          <div className="flex items-start gap-2">
            <Checkbox id="accept-confirm" checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} className="mt-0.5" />
            <Label htmlFor="accept-confirm" className="leading-snug font-normal">
              I've verified this offer directly with the sponsor.
            </Label>
          </div>
          <FieldDescription>Add a note or link, or tick the box. One of them is required.</FieldDescription>
        </FieldGroup>
        {mutation.error ? <ErrorAlert className="border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!ready || mutation.isPending}
            onClick={() =>
              mutation.mutate(
                {
                  offer,
                  patch: {
                    status: "accepted",
                    evidence_notes: notes.trim() || null,
                    evidence_url: link.trim() || null,
                    confirm_verified: confirmed,
                  },
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {mutation.isPending ? <Spinner /> : null}
            Accept offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
