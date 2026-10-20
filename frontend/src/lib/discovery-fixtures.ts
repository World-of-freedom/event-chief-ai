import type { DiscoveryFilterOption, SponsorProspectTemplate } from "@/types/domain";

/**
 * Template-only data. Replace this module with a reviewed API query once the
 * discovery source, ownership rules, and matching policy are approved.
 * Do not represent these examples as verified sponsor relationships.
 */
export const discoveryProspectTemplates: SponsorProspectTemplate[] = [
  {
    id: "template-cloud-partner",
    companyName: "Cloud Partner Example",
    industry: "Cloud infrastructure",
    location: "India",
    verificationStatus: "reviewed",
    sourceUrl: "https://example.com/partners",
    sourceLabel: "Example partner directory",
    fitReason: "Placeholder: map cloud-credit needs to a verified program and explain the evidence here.",
    tags: ["cloud credits", "student programs"],
    contact: { name: "Program contact", role: "Developer relations" },
  },
  {
    id: "template-prize-partner",
    companyName: "Prize Partner Example",
    industry: "Consumer technology",
    location: "Remote",
    verificationStatus: "unverified",
    sourceLabel: "No source connected",
    fitReason: "Placeholder: this card demonstrates an unverified record requiring research before outreach.",
    tags: ["prizes", "campus audience"],
    contact: null,
  },
  {
    id: "template-food-partner",
    companyName: "Food Partner Example",
    industry: "Food & beverage",
    location: "Local",
    verificationStatus: "verified",
    sourceUrl: "https://example.com/community",
    sourceLabel: "Example community page",
    fitReason: "Placeholder: local-location relevance and attendee fit would be calculated by the future service.",
    tags: ["food", "local"],
    contact: { name: "Partnerships team", role: "Community" },
  },
];

export const discoveryIndustryOptions: DiscoveryFilterOption[] = [
  { value: "all", label: "All industries" },
  { value: "Cloud infrastructure", label: "Cloud infrastructure" },
  { value: "Consumer technology", label: "Consumer technology" },
  { value: "Food & beverage", label: "Food & beverage" },
];
