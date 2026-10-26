import type { NeedCategory } from "@/types/domain";

export type RequirementField = {
  key: string;
  label: string;
  required?: boolean;
  inputMode?: "numeric" | "decimal" | "text";
  placeholder?: string;
  valueKey: "target_amount" | "target_quantity" | "details";
};

const amount = (label: string, required = false): RequirementField => ({ key: "target_amount", label, required, inputMode: "decimal", placeholder: "e.g. 50000", valueKey: "target_amount" });
const quantity = (label: string, required = false): RequirementField => ({ key: "target_quantity", label, required, inputMode: "numeric", placeholder: "e.g. 100", valueKey: "target_quantity" });
const detail = (key: string, label: string, required = false, inputMode: RequirementField["inputMode"] = "text", placeholder?: string): RequirementField => ({ key, label, required, inputMode, placeholder, valueKey: "details" });

export const requirementFields: Record<NeedCategory, RequirementField[]> = {
  cash: [amount("Target amount (₹)", true), detail("funding_purpose", "Funding purpose", true, "text", "What will the funding cover?")],
  cloud_credits: [amount("Estimated credit value (₹)", true), detail("quantity", "Quantity", true, "text", "e.g. 50 API accounts or 100 licences")],
  equipment: [detail("equipment_type", "Equipment type", true, "text", "e.g. laptops, projectors"), quantity("Quantity", true), amount("Estimated budget (₹)")],
  speakers: [quantity("Number of speakers", true), detail("speaker_profile", "Speaker profile", true, "text", "e.g. AI founders, developer advocates"), amount("Honorarium budget (₹)")],
  mentors: [quantity("Number of mentors", true), detail("expertise_required", "Expertise required", true, "text", "e.g. product, cloud architecture"), amount("Honorarium budget (₹)")],
  venue: [detail("venue_type", "Venue type", true, "text", "e.g. auditorium, co-working space"), quantity("Expected capacity", true), amount("Venue budget (₹)")],
  volunteers: [quantity("Number of volunteers", true), detail("volunteer_roles", "Volunteer roles", true, "text", "e.g. registration, logistics, media")],
  prizes: [detail("prize_type", "Prize type", true, "text", "e.g. cash, gadgets, vouchers"), quantity("Number of prizes", true), amount("Total prize value (₹)", true)],
  food: [detail("service_type", "Service type", true, "text", "e.g. lunch, refreshments"), quantity("Number of people to serve", true), detail("budget_per_person", "Budget per person (₹)", false, "decimal", "e.g. 350")],
  merchandise: [detail("merchandise_type", "Merchandise type", true, "text", "e.g. T-shirts, stickers"), quantity("Quantity", true), amount("Estimated budget (₹)")],
  other: [detail("requirement_type", "Requirement type", true, "text", "Describe the resource"), amount("Estimated budget (₹)"), quantity("Quantity")],
};

export function fieldsFor(category: NeedCategory) {
  return requirementFields[category];
}

export function requirementTitle(category: NeedCategory) {
  return category === "cloud_credits" ? "Cloud & API credits" : category === "food" ? "Food & beverage" : category[0].toUpperCase() + category.slice(1);
}
