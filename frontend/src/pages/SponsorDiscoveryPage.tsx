import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { TemplateNotice } from "@/components/TemplateNotice";
import { discoveryIndustryOptions, discoveryProspectTemplates } from "@/lib/discovery-fixtures";

export function SponsorDiscoveryPage() {
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("all");

  const visibleTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return discoveryProspectTemplates.filter((prospect) => {
      const matchesIndustry = industry === "all" || prospect.industry === industry;
      const searchable = [prospect.companyName, prospect.industry, prospect.location, ...prospect.tags].join(" ").toLowerCase();
      return matchesIndustry && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [industry, query]);

  return (
    <>
      <PageHeader
        title="Sponsor discovery"
        description="A templated prospect workspace with no live sourcing, ranking, or outreach actions."
        actions={<button className="button button-secondary" disabled title="TODO: connect reviewed prospect creation">Add prospect</button>}
      />
      <TemplateNotice>
        These are fictional interface fixtures. Replace <code>src/lib/discovery-fixtures.ts</code> with a reviewed API client; do not treat any record as a real sponsor lead.
      </TemplateNotice>
      <section className="toolbar" aria-label="Discovery template filters">
        <label>
          <span>Search placeholders</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Company, industry, or tag" />
        </label>
        <label>
          <span>Industry</span>
          <select value={industry} onChange={(event) => setIndustry(event.target.value)}>
            {discoveryIndustryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </section>
      <section className="prospect-grid" aria-live="polite">
        {visibleTemplates.map((prospect) => (
          <article className="prospect-card" key={prospect.id}>
            <div className="card-topline"><span>{prospect.industry}</span><StatusBadge status={prospect.verificationStatus} /></div>
            <h2>{prospect.companyName}</h2>
            <p className="muted">{prospect.location}</p>
            <p>{prospect.fitReason}</p>
            <div className="tag-row">{prospect.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
            <div className="card-footer">
              <span>{prospect.sourceLabel}</span>
              <Link to={`/discovery/${prospect.id}`}>View template</Link>
            </div>
          </article>
        ))}
      </section>
      {visibleTemplates.length === 0 ? <p className="no-results">No placeholder records match these display filters.</p> : null}
    </>
  );
}
