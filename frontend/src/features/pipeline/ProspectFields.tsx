import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { z } from "zod";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProspectInput } from "@/types/sponsorship";

const url = z.string().trim().refine((v) => v === "" || /^https?:\/\/\S+\.\S+/.test(v), "Enter a full URL starting with https://");
const optional = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

export const prospectSchema = z.object({
  company_name: z.string().trim().min(1, "Enter the company name").max(180),
  website_url: url,
  industry: optional(100),
  location: optional(160),
  contact_name: optional(160),
  contact_role: optional(160),
  email: z.string().trim().refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email"),
  // The API validates and normalizes phone numbers (Indian numbers may omit +91).
  phone: optional(32),
  source_url: url,
  source_notes: z.string(),
  fit_reason: z.string(),
  description: z.string(),
});

export type ProspectFormValues = z.infer<typeof prospectSchema>;

export const emptyProspect: ProspectFormValues = {
  company_name: "", website_url: "", industry: "", location: "", contact_name: "", contact_role: "",
  email: "", phone: "", source_url: "", source_notes: "", fit_reason: "", description: "",
};

export function prospectToInput(values: ProspectFormValues): ProspectInput {
  const clean = (value: string) => (value.trim() === "" ? null : value.trim());
  return {
    company_name: values.company_name.trim(),
    website_url: clean(values.website_url),
    industry: clean(values.industry),
    location: clean(values.location),
    contact_name: clean(values.contact_name),
    contact_role: clean(values.contact_role),
    email: clean(values.email),
    phone: clean(values.phone),
    source_url: clean(values.source_url),
    source_notes: clean(values.source_notes),
    fit_reason: clean(values.fit_reason),
    description: clean(values.description),
  };
}

interface ProspectFieldsProps {
  register: UseFormRegister<ProspectFormValues>;
  errors: FieldErrors<ProspectFormValues>;
}

/** Shared prospect inputs used by "Add prospect" and "Edit prospect". */
export function ProspectFields({ register, errors }: ProspectFieldsProps) {
  const text = (name: keyof ProspectFormValues, label: string, props: Record<string, unknown> = {}) => (
    <Field data-invalid={!!errors[name]} className={props.wide ? "sm:col-span-2" : undefined}>
      <FieldLabel htmlFor={`pf-${name}`}>{label}</FieldLabel>
      <Input id={`pf-${name}`} aria-invalid={!!errors[name]} {...(props.input as object)} {...register(name)} />
      <FieldError errors={[errors[name]]} />
    </Field>
  );
  return (
    <>
      {text("company_name", "Company name *", { wide: true })}
      {text("website_url", "Website", { input: { type: "url", placeholder: "https://" } })}
      {text("industry", "Industry")}
      {text("location", "Location")}
      {text("contact_name", "Contact name")}
      {text("contact_role", "Contact role")}
      {text("email", "Email", { input: { type: "email" } })}
      {text("phone", "Phone", { input: { type: "tel", placeholder: "+91…" } })}
      {text("source_url", "Source link", { wide: true, input: { type: "url", placeholder: "Where this information comes from" } })}
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="pf-fit_reason">Why they fit</FieldLabel>
        <Textarea id="pf-fit_reason" rows={2} {...register("fit_reason")} />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="pf-source_notes">Source notes</FieldLabel>
        <Textarea id="pf-source_notes" rows={2} {...register("source_notes")} />
      </Field>
    </>
  );
}
