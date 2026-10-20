import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { TemplateNotice } from "@/components/TemplateNotice";

export function DashboardPage() {
  return (
    <>
      <PageHeader title="Sponsorship dashboard" description="A future summary of funding needs, pipeline health, and follow-ups." />
      <TemplateNotice>
        Dashboard aggregates are intentionally not connected. Add a dashboard query after the event, offer, and task repositories are implemented.
      </TemplateNotice>
      <div className="metric-grid" aria-label="Dashboard placeholders">
        {[
          ["Cash gap", "—"],
          ["Reviewed support", "—"],
          ["Open follow-ups", "—"],
          ["Recent calls", "—"],
        ].map(([label, value]) => (
          <section className="metric-card" key={label}>
            <span>{label}</span><strong>{value}</strong>
          </section>
        ))}
      </div>
      <EmptyState title="No event connected" description="Choose the active event model and wire a dashboard data source to populate this workspace." />
    </>
  );
}
