import type { FeatureRoute } from "@/types/domain";

export const appRoutes: FeatureRoute[] = [
  { label: "Dashboard", to: "/" },
  { label: "Event setup", to: "/events" },
  { label: "Resource needs", to: "/needs" },
  { label: "Sponsor discovery", to: "/discovery" },
  { label: "Pipeline", to: "/pipeline" },
  { label: "Follow-ups", to: "/follow-ups" },
];

export const comingSoonRoutes: FeatureRoute[] = [
  { label: "Speakers & judges", to: "/coming-soon/speakers", isComingSoon: true },
  { label: "Vendors & volunteers", to: "/coming-soon/vendors", isComingSoon: true },
  { label: "Ticketing & check-in", to: "/coming-soon/ticketing", isComingSoon: true },
];
