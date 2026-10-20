import { Link, useParams } from "react-router-dom";

import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { TemplateNotice } from "@/components/TemplateNotice";
import { discoveryProspectTemplates } from "@/lib/discovery-fixtures";

export function ProspectDetailPage() {
  const { prospectId } = useParams();
  const prospect = discoveryProspectTemplates.find((item) => item.id === prospectId);
  if (!prospect) {
    return <><PageHeader title="Prospect template not found" description="This route accepts a fixture identifier while discovery is in template mode." /><Link to="/discovery">Back to Sponsor discovery</Link></>;
  }

  return (
    <>
      <PageHeader title={prospect.companyName} description="Templated prospect detail route; no contact or pipeline action is enabled." />
      <TemplateNotice>This view uses placeholder data only. Wire a protected prospect-detail query before displaying real contact information.</TemplateNotice>
      <section className="detail-grid">
        <article className="detail-card"><h2>Verification</h2><StatusBadge status={prospect.verificationStatus} /><p>{prospect.fitReason}</p></article>
        <article className="detail-card"><h2>Source</h2>{prospect.sourceUrl ? <a href={prospect.sourceUrl} target="_blank" rel="noreferrer">{prospect.sourceLabel}</a> : <p>{prospect.sourceLabel}</p>}<p className="muted">TODO: store source evidence and review history.</p></article>
        <article className="detail-card"><h2>Contact</h2>{prospect.contact ? <p>{prospect.contact.name} · {prospect.contact.role}</p> : <p>No placeholder contact provided.</p>}<p className="muted">TODO: show authorized contact data only after approval.</p></article>
      </section>
      <button className="button" disabled title="TODO: implement approved pipeline action">Add to event pipeline</button>
    </>
  );
}
