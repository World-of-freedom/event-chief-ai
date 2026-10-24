import { useQuery } from "@tanstack/react-query";
import { Search, Workflow } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listEvents, listOpportunities } from "@/lib/api/sponsorship";
import { formatDate, opportunityStatusLabels, opportunityStatusOrder, opportunityTone } from "@/lib/format";
import type { OpportunityStatus } from "@/types/domain";

const ANY = "__any__";

export function PipelinePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get("event");
  const status = (searchParams.get("status") ?? "") as OpportunityStatus | "";
  const [search, setSearch] = useState("");

  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const events = eventsQuery.data ?? [];
  const opportunitiesQuery = useQuery({
    queryKey: ["opportunities", { eventId, status }],
    queryFn: () => listOpportunities({ event_id: eventId ?? undefined, status }),
    enabled: events.length > 0,
  });

  const setFilter = (key: string, value: string | null) =>
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });

  const term = search.trim().toLowerCase();
  const rows = (opportunitiesQuery.data ?? []).filter(
    (row) => !term || row.prospect.company_name.toLowerCase().includes(term) || (row.prospect.industry ?? "").toLowerCase().includes(term),
  );

  return (
    <>
      <PageHeader
        title="Sponsorship pipeline"
        description="Every sponsor you're working with, per event, and where each conversation stands."
        actions={events.length ? <AddProspectDialog events={events} defaultEventId={eventId} /> : null}
      />

      {eventsQuery.error ? <ErrorAlert message={errorMessage(eventsQuery.error, "Could not load events.")} /> : null}
      {opportunitiesQuery.error ? <ErrorAlert message={errorMessage(opportunitiesQuery.error, "Could not load the pipeline.")} /> : null}

      {eventsQuery.isLoading ? (
        <LoadingState label="Loading pipeline…" />
      ) : events.length === 0 ? (
        eventsQuery.error ? null : <NoEventsState description="The pipeline tracks sponsors per event. Create an event first." />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or industry…" aria-label="Search pipeline" className="pl-8" />
            </div>
            <EventSelect events={events} value={eventId} onChange={(id) => setFilter("event", id)} allowAll className="w-full sm:w-56" />
            <Select value={status || ANY} onValueChange={(value) => setFilter("status", value === ANY ? null : value)}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any status</SelectItem>
                {opportunityStatusOrder.map((value) => <SelectItem key={value} value={value}>{opportunityStatusLabels[value]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {opportunitiesQuery.isLoading ? (
            <LoadingState label="Loading pipeline…" />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Workflow />}
              title={opportunitiesQuery.data?.length ? "No matches" : "No sponsors in the pipeline yet"}
              description={
                opportunitiesQuery.data?.length
                  ? "No opportunities match these filters."
                  : "Add a prospect manually, or open a Sponsor discovery run and choose “Add to pipeline” on a lead."
              }
            />
          ) : (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Sponsor</TableHead>
                    <TableHead className="hidden md:table-cell">Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Next action</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Offers</TableHead>
                    <TableHead className="hidden sm:table-cell pr-4 text-right">Open tasks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/pipeline/${row.id}`)}>
                      <TableCell className="pl-4">
                        <Link to={`/pipeline/${row.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {row.prospect.company_name}
                        </Link>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {row.prospect.industry || "Industry not set"}
                          {row.prospect.verification_status === "unverified" ? <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Unverified</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{row.event_name}</TableCell>
                      <TableCell><StatusPill tone={opportunityTone(row.status)}>{opportunityStatusLabels[row.status]}</StatusPill></TableCell>
                      <TableCell className="hidden max-w-56 text-muted-foreground lg:table-cell">
                        <div className="truncate">{row.next_action || "—"}</div>
                        {row.next_action_due_at ? <div className="text-xs">Due {formatDate(row.next_action_due_at)}</div> : null}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{row.offer_count}</TableCell>
                      <TableCell className="hidden pr-4 text-right tabular-nums sm:table-cell">{row.open_task_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </>
  );
}
