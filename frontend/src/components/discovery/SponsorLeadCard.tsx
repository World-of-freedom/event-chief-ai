import { Building2, ExternalLink, Globe, MapPin, Plus } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { StatusPill, confidenceTone } from "@/components/StatusPill";
import { scoreTone } from "@/components/discovery/ScoreBadge";
import { AddLeadToPipelineDialog } from "@/features/pipeline/AddLeadToPipelineDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { SponsorLead } from "@/types/domain";

export function SponsorLeadCard({ lead, eventId }: { lead: SponsorLead; eventId?: string | null }) {
  const location = useLocation();

  return (
    <Card className="transition-shadow hover:shadow-md hover:ring-primary/40">
      <CardHeader className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary">
          <Building2 className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{lead.industry || "General industry"}</p>
          <CardTitle className="text-lg leading-tight">{lead.company_name}</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {lead.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {lead.location}
              {lead.distance_km != null ? <span className="font-medium text-primary">({lead.distance_km} km)</span> : null}
            </span>
          ) : null}
          {lead.website_url ? (
            <a
              href={lead.website_url.startsWith("http") ? lead.website_url : `https://${lead.website_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Globe className="size-3.5" />
              {lead.domain || "Website"}
              <ExternalLink className="size-2.5" />
            </a>
          ) : null}
        </div>

        {lead.description ? <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{lead.description}</p> : null}

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <StatusPill tone={scoreTone(lead.score_total)}>Match {lead.score_total}/100</StatusPill>
          <StatusPill tone={confidenceTone(lead.confidence)} className="capitalize">{lead.confidence} confidence</StatusPill>
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <Button asChild variant="outline" className="flex-1">
          <Link to={`/discovery/leads/${lead.id}`} state={{ from: location.pathname }}>View details</Link>
        </Button>
        <AddLeadToPipelineDialog
          leadId={lead.id}
          companyName={lead.company_name}
          defaultEventId={eventId}
          trigger={<Button className="flex-1"><Plus />Add to pipeline</Button>}
        />
      </CardFooter>
    </Card>
  );
}
