import type { FeatureRoute } from "@/types/domain";

export const appRoutes: FeatureRoute[] = [
  { label: "Dashboard", to: "/" },
  { label: "Events", to: "/events" },
  { label: "Sponsor discovery", to: "/discovery" },
  { label: "Pipeline", to: "/pipeline" },
  { label: "Tasks & follow-ups", to: "/follow-ups" },
];

export const comingSoonRoutes: FeatureRoute[] = [
  { label: "Speakers & judges", to: "/coming-soon/speakers", isComingSoon: true },
  { label: "Vendors & volunteers", to: "/coming-soon/vendors", isComingSoon: true },
  { label: "Ticketing & check-in", to: "/coming-soon/ticketing", isComingSoon: true },
];

const extraLabels: Record<string, string> = {
  "/auth": "Sign in",
  "/admin": "User management",
};

export function routeLabelForPath(pathname: string) {
  const exact = [...appRoutes, ...comingSoonRoutes].find((route) => route.to === pathname);
  if (exact) return exact.label;
  if (pathname === "/discovery/new") return "New sponsor discovery";
  if (pathname.startsWith("/discovery/leads/")) return "Prospect";
  if (pathname.startsWith("/pipeline/")) return "Opportunity";
  if (pathname.startsWith("/discovery/")) return "Sponsor discovery";
  if (pathname.startsWith("/outreach/")) return "Outreach";
  if (pathname.startsWith("/calls/")) return "Call review";
  return extraLabels[pathname] ?? "Workspace";
}
