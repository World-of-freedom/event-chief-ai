import type { DiscoveryFilterOption, SponsorProspectTemplate } from "@/types/domain";

/**
 * Fictional sample fixtures have been removed in favor of live LangChain & verified web discovery.
 */
export const discoveryProspectTemplates: SponsorProspectTemplate[] = [];

export const discoveryIndustryOptions: DiscoveryFilterOption[] = [
  { value: "all", label: "All industries" },
  { value: "Technology", label: "Technology & Software" },
  { value: "Fintech", label: "Fintech & Banking" },
  { value: "EdTech", label: "EdTech & Education" },
  { value: "Food & Beverage", label: "Food & Beverage" },
  { value: "Gaming", label: "Gaming & Esports" },
  { value: "Retail", label: "Retail & Consumer Goods" },
  { value: "Local Business", label: "Local Businesses" },
];
