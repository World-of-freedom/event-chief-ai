import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { updateProspect } from "@/lib/api/sponsorship";
import type { VerificationStatus } from "@/types/domain";
import type { Prospect } from "@/types/sponsorship";
import { ProspectFields, prospectSchema, prospectToInput, type ProspectFormValues } from "@/features/pipeline/ProspectFields";

export const verificationLabels: Record<VerificationStatus, string> = {
  unverified: "Unverified",
  reviewed: "Reviewed",
  verified: "Verified",
};

function useRefreshProspect() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["opportunity"] });
    void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

function toValues(p: Prospect): ProspectFormValues {
  return {
    company_name: p.company_name, website_url: p.website_url ?? "", industry: p.industry ?? "", location: p.location ?? "",
    contact_name: p.contact_name ?? "", contact_role: p.contact_role ?? "", email: p.email ?? "", phone: p.phone ?? "",
    source_url: p.source_url ?? "", source_notes: p.source_notes ?? "", fit_reason: p.fit_reason ?? "", description: p.description ?? "",
  };
}

export function EditProspectDialog({ prospect, open, onOpenChange }: { prospect: Prospect; open: boolean; onOpenChange: (open: boolean) => void }) {
  const refresh = useRefreshProspect();
  const [verification, setVerification] = useState<VerificationStatus>(prospect.verification_status);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProspectFormValues>({
    resolver: zodResolver(prospectSchema),
    defaultValues: toValues(prospect),
  });

  useEffect(() => {
    if (open) {
      reset(toValues(prospect));
      setVerification(prospect.verification_status);
    }
  }, [open, prospect, reset]);

  const mutation = useMutation({
    mutationFn: (values: ProspectFormValues) => updateProspect(prospect.id, { ...prospectToInput(values), verification_status: verification }),
    onSuccess: () => {
      refresh();
      toast.success("Prospect updated");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) mutation.reset(); }}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit prospect</DialogTitle>
          <DialogDescription>Changes apply everywhere this company appears in your pipeline.</DialogDescription>
        </DialogHeader>
        <form id="edit-prospect-form" noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <ProspectFields register={register} errors={errors} />
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="prospect-verification">Verification</FieldLabel>
              <Select value={verification} onValueChange={(value) => setVerification(value as VerificationStatus)}>
                <SelectTrigger id="prospect-verification" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(verificationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldDescription>Mark as verified only after checking the source and contact details yourself.</FieldDescription>
            </Field>
          </FieldGroup>
          {mutation.error ? <ErrorAlert className="mt-4 border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="edit-prospect-form" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OptOutDialog({ prospect, open, onOpenChange }: { prospect: Prospect; open: boolean; onOpenChange: (open: boolean) => void }) {
  const refresh = useRefreshProspect();
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => updateProspect(prospect.id, { opted_out: true, opt_out_reason: reason.trim() || null }),
    onSuccess: () => {
      refresh();
      toast.success(`${prospect.company_name} marked as opted out`);
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) mutation.reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {prospect.company_name} as opted out?</DialogTitle>
          <DialogDescription>
            Every pipeline this company is in will close as “Opted out”, and no further outreach can be started. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="opt-out-reason">Reason</FieldLabel>
          <Textarea id="opt-out-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Asked not to be contacted again" />
        </Field>
        {mutation.error ? <ErrorAlert className="border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Spinner /> : null}
            Mark as opted out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
