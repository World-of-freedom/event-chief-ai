import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Phone, PhoneCall, Search, Workflow } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { EventSelect } from "@/components/EventSelect";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { NoEventsState } from "@/features/events/NoEventsState";
import { AddProspectDialog } from "@/features/pipeline/AddProspectDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listEvents, listOpportunities } from "@/lib/api/sponsorship";
import { voiceCallStatusLabels, voiceCallTone } from "@/lib/format";
import type { OpportunityListItem, VoiceCallStatus } from "@/types/sponsorship";

const ACTIVE_CALL_STATUSES = new Set<VoiceCallStatus>(["queued", "processing", "initiated", "in_progress", "retry_scheduled", "submission_unknown"]);
type PipelineView = "ready" | "active" | "results" | "all";

function hasActiveCall(row: OpportunityListItem) {
  return Boolean(row.latest_call_status && ACTIVE_CALL_STATUSES.has(row.latest_call_status));
}

function isReadyToCall(row: OpportunityListItem) {
  return Boolean(row.prospect.phone && !row.latest_call_id);
}

function matchesView(row: OpportunityListItem, view: PipelineView) {
  if (view === "ready") return isReadyToCall(row);
  if (view === "active") return hasActiveCall(row);
  if (view === "results") return Boolean(row.latest_call_id && !hasActiveCall(row));
  return true;
}

export function PipelinePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get("event");
  const viewParam = searchParams.get("view");
  const view: PipelineView = viewParam === "active" || viewParam === "results" || viewParam === "all" ? viewParam : "ready";
  const [search, setSearch] = useState("");

  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const events = eventsQuery.data ?? [];
  const opportunitiesQuery = useQuery({
    queryKey: ["opportunities", { eventId }],
    queryFn: () => listOpportunities({ event_id: eventId ?? undefined, status: "" }),
    enabled: events.length > 0,
  });
  const setFilter = (key: string, value: string | null) => setSearchParams((params) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });

  const term = search.trim().toLowerCase();
  const allRows = (opportunitiesQuery.data ?? []).filter(
    (row) => !term || row.prospect.company_name.toLowerCase().includes(term) || (row.prospect.contact_name ?? "").toLowerCase().includes(term),
  );
  const rows = allRows.filter((row) => matchesView(row, view));
  const counts: Record<PipelineView, number> = {
    ready: allRows.filter((row) => matchesView(row, "ready")).length,
    active: allRows.filter((row) => matchesView(row, "active")).length,
    results: allRows.filter((row) => matchesView(row, "results")).length,
    all: allRows.length,
  };

  return (
    <>
      <PageHeader
        title="Voice outreach"
        description="Call sponsors, follow live call progress, and review every result in one place."
        actions={events.length ? <AddProspectDialog events={events} defaultEventId={eventId} /> : null}
      />

      {eventsQuery.error ? <ErrorAlert message={errorMessage(eventsQuery.error, "Could not load events.")} /> : null}
      {opportunitiesQuery.error ? <ErrorAlert message={errorMessage(opportunitiesQuery.error, "Could not load voice outreach.")} /> : null}

      {eventsQuery.isLoading ? <LoadingState label="Loading voice outreach…" /> : events.length === 0 ? (
        eventsQuery.error ? null : <NoEventsState description="Create an event, then add sponsors to start voice outreach." />
      ) : (
        <>
          <Card className="mb-5 gap-3 p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a sponsor or contact…" aria-label="Search sponsors" className="pl-8" />
            </div>
            <EventSelect events={events} value={eventId} onChange={(id) => setFilter("event", id)} allowAll className="w-full sm:w-64" />
          </Card>

          <div className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <VoiceTab active={view === "ready"} count={counts.ready} label="Ready to call" onClick={() => setFilter("view", null)} />
            <VoiceTab active={view === "active"} count={counts.active} label="In progress" onClick={() => setFilter("view", "active")} />
            <VoiceTab active={view === "results"} count={counts.results} label="Results" onClick={() => setFilter("view", "results")} />
            <VoiceTab active={view === "all"} count={counts.all} label="All sponsors" onClick={() => setFilter("view", "all")} />
          </div>

          {opportunitiesQuery.isLoading ? <LoadingState label="Loading sponsors…" /> : rows.length === 0 ? (
            <EmptyState
              icon={<Workflow />}
              title={allRows.length ? "Nothing here yet" : "No sponsors in voice outreach"}
              description={allRows.length ? "Choose another voice-outreach view or adjust the search." : "Add a sponsor with a phone number to make your first call."}
            />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => <VoiceOutreachRow key={row.id} row={row} onStartCall={() => navigate(`/pipeline/${row.id}?action=call`)} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}

function VoiceTab({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) {
  return <Button variant={active ? "default" : "outline"} size="sm" className="justify-between sm:justify-center" onClick={onClick}>{label}<span className={active ? "rounded-full bg-primary-foreground/20 px-1.5 text-xs" : "rounded-full bg-muted px-1.5 text-xs"}>{count}</span></Button>;
}

function VoiceOutreachRow({ row, onStartCall }: { row: OpportunityListItem; onStartCall: () => void }) {
  const activeCall = hasActiveCall(row);
  const ready = isReadyToCall(row);
  const hasResult = Boolean(row.latest_call_id && !activeCall);
  const status = row.latest_call_status ? voiceCallStatusLabels[row.latest_call_status] : ready ? "Ready to call" : "Phone number needed";

  return (
    <Card className="gap-0 p-4 transition-colors hover:ring-primary/30">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><PhoneCall className="size-5" /></div>
          <div className="min-w-0">
            <Link to={`/pipeline/${row.id}`} className="block truncate font-heading text-base font-medium hover:text-primary hover:underline">{row.prospect.company_name}</Link>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{row.prospect.contact_name || row.event_name}{row.prospect.phone ? ` · ${row.prospect.phone}` : " · Phone number needed"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:w-44 sm:justify-start">
          {hasResult ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Phone className="size-4 shrink-0 text-muted-foreground" />}
          <StatusPill tone={row.latest_call_status ? voiceCallTone(row.latest_call_status) : ready ? "info" : "neutral"}>{status}</StatusPill>
        </div>

        <div className="flex shrink-0 gap-2 sm:justify-end">
          {activeCall && row.latest_call_id ? <Button asChild variant="outline" size="sm"><Link to={`/calls/${row.latest_call_id}`}>Track call</Link></Button> : null}
          {ready ? <Button size="sm" onClick={onStartCall}><PhoneCall />Start call</Button> : null}
          {hasResult && row.latest_call_id ? <Button asChild size="sm"><Link to={`/calls/${row.latest_call_id}`}>Review result</Link></Button> : null}
          {!ready && !activeCall && !hasResult ? <Button asChild variant="outline" size="sm"><Link to={`/pipeline/${row.id}`}>Add phone</Link></Button> : null}
        </div>
      </div>
    </Card>
  );
}
