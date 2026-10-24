export const eventTypeOptions = [
  { value: "hackathon", label: "Hackathon / Coding Sprint" },
  { value: "tech_conference", label: "Tech Conference / Summit" },
  { value: "cultural_fest", label: "College Cultural Festival" },
  { value: "sports", label: "Sports Tournament" },
  { value: "career_fair", label: "Career Fair / Expo" },
  { value: "workshop", label: "Technical Workshop / Bootcamp" },
  { value: "gaming", label: "Esports / Gaming Tournament" },
  { value: "entrepreneurship", label: "E-Summit / Startup Pitch" },
];

export function eventTypeLabel(value: string): string {
  return eventTypeOptions.find((option) => option.value === value)?.label ?? value.replace(/_/g, " ");
}
