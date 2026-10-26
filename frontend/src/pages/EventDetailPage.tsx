import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ChevronRight, Layers3, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EventFormDialog } from "@/features/events/EventFormDialog";
import { NeedFormDialog } from "@/features/needs/NeedFormDialog";
import { deleteNeed, getDashboard, getEvent, listEvents, listNeeds } from "@/lib/api/sponsorship";
import { eventTypeLabel } from "@/lib/event-types";
import { formatDate, formatMoney, needCategoryLabels } from "@/lib/format";
import type { EventRecord, ResourceNeed } from "@/types/sponsorship";

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const eventQuery = useQuery({ queryKey: ["event", eventId], queryFn: () => getEvent(eventId!), enabled: !!eventId });
  const allEventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const needsQuery = useQuery({ queryKey: ["needs", eventId], queryFn: () => listNeeds(eventId!), enabled: !!eventId });
  const dashboardQuery = useQuery({ queryKey: ["dashboard", eventId], queryFn: () => getDashboard(eventId!), enabled: !!eventId });

  if (eventQuery.isLoading) return <LoadingState label="Loading event…" />;
  if (eventQuery.error || !eventQuery.data || !eventId) return <EmptyState icon={<CalendarDays />} title="Event not found" description={errorMessage(eventQuery.error, "This event doesn't exist or isn't yours.")} action={<Button asChild variant="outline"><Link to="/events"><ArrowLeft />Back to events</Link></Button>} />;

  const event = eventQuery.data;
  const allEvents = allEventsQuery.data ?? [];
  const parent = allEvents.find((item) => item.id === event.parent_event_id);
  const childEvents = allEvents.filter((item) => item.parent_event_id === event.id);
  const sponsorCount = Object.values(dashboardQuery.data?.opportunities_by_status ?? {}).reduce((total, count) => total + count, 0);
  const securedSponsorCount = (dashboardQuery.data?.opportunities_by_status.accepted ?? 0) + (dashboardQuery.data?.opportunities_by_status.fulfilled ?? 0);

  return <>
    <PageHeader title={event.name} description={`${event.institution} · ${formatDate(event.start_date)}${event.end_date && event.end_date !== event.start_date ? ` – ${formatDate(event.end_date)}` : ""}`} actions={<><Button asChild variant="outline"><Link to="/events"><ArrowLeft />Events</Link></Button><EventFormDialog event={event} trigger={<Button variant="outline"><Pencil />Edit event</Button>} /></>} />
    {parent ? <Link to={`/events/${parent.id}`} className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><span>Part of {parent.name}</span><ChevronRight className="size-4" /><span>Back to parent</span></Link> : null}
    <div className="mb-6"><Button asChild size="sm"><Link to={`/discovery/new?event=${event.id}`}><Search />Research sponsors</Link></Button></div>
    {needsQuery.error || allEventsQuery.error || dashboardQuery.error ? <ErrorAlert message={errorMessage(needsQuery.error || allEventsQuery.error || dashboardQuery.error, "Could not load event details.")} /> : null}
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Event overview</CardTitle><CardDescription>{event.description || "Add a description to make sponsor research and outreach more specific."}</CardDescription></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1"><Overview label="Format" value={event.is_online ? "Online" : event.location || "In person"} /><Overview label="Audience" value={event.target_audience || "Not specified"} /><Overview label="Expected attendance" value={event.expected_attendees?.toLocaleString() || "Not specified"} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Sponsor summary</CardTitle><CardDescription>Rolls up this event and all nested sub-events.</CardDescription></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3"><Overview label="In pipeline" value={String(sponsorCount)} large /><Overview label="Accepted / fulfilled" value={String(securedSponsorCount)} large /><Overview label="Open tasks" value={String(dashboardQuery.data?.open_task_count ?? "—")} large /></CardContent></Card>
      </div>
      <RequirementsCard eventId={event.id} needs={needsQuery.data ?? []} />
      <section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Sub-events</h2><p className="text-sm text-muted-foreground">Every sub-event is a complete event and can contain another level of sub-events.</p></div><EventFormDialog defaultParentEventId={event.id} trigger={<Button><Plus />Create sub-event</Button>} /></div>
        {childEvents.length === 0 ? <Card><CardContent className="py-8 text-sm text-muted-foreground">No sub-events yet. Create one when a track, workshop, or companion event needs its own details and requirements.</CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{childEvents.map((child) => <ChildEventCard key={child.id} event={child} />)}</div>}
      </section>
    </div>
  </>;
}

function Overview({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className={large ? "text-2xl font-semibold" : "font-medium"}>{value}</p></div>;
}

function RequirementsCard({ eventId, needs }: { eventId: string; needs: ResourceNeed[] }) {
  const queryClient = useQueryClient();
  const removal = useMutation({ mutationFn: deleteNeed, onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["needs", eventId] }); void queryClient.invalidateQueries({ queryKey: ["dashboard", eventId] }); toast.success("Requirement removed"); }, onError: (error) => toast.error(errorMessage(error, "Could not remove requirement.")) });
  return <Card><CardHeader><CardTitle>Resource requirements</CardTitle><CardDescription>Support needed specifically for {"this event"}.</CardDescription><CardAction><NeedFormDialog eventId={eventId} trigger={<Button variant="outline" size="sm"><Plus />Add requirement</Button>} /></CardAction></CardHeader><CardContent>{needs.length === 0 ? <p className="text-sm text-muted-foreground">No requirements yet.</p> : <ul className="divide-y">{needs.map((need) => <li key={need.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="font-medium">{need.title}</p><p className="text-xs text-muted-foreground">{needCategoryLabels[need.category]} · {need.target_amount ? formatMoney(need.target_amount, need.currency) : need.target_quantity ? `${need.target_quantity} units` : "Target to be agreed"}</p></div><div className="flex shrink-0 gap-1"><NeedFormDialog eventId={eventId} need={need} trigger={<Button variant="ghost" size="icon-sm" aria-label={`Edit ${need.title}`}><Pencil /></Button>} /><Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Remove ${need.title}`} disabled={removal.isPending} onClick={() => { if (window.confirm(`Remove “${need.title}”? Linked offers stay recorded.`)) removal.mutate(need.id); }}><Trash2 /></Button></div></li>)}</ul>}</CardContent></Card>;
}

function ChildEventCard({ event }: { event: EventRecord }) {
  return <Card className="transition-shadow hover:shadow-md"><CardHeader className="gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-primary"><Layers3 className="size-4" /></span><div><p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{eventTypeLabel(event.event_type)}</p><CardTitle className="text-lg">{event.name}</CardTitle><CardDescription>{formatDate(event.start_date)}{event.location ? ` · ${event.location}` : ""}</CardDescription></div></CardHeader><CardContent>{event.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{event.description}</p> : <p className="text-sm text-muted-foreground">No description yet.</p>}</CardContent><CardFooter><Button asChild variant="outline" className="w-full"><Link to={`/events/${event.id}`}>Open event details</Link></Button></CardFooter></Card>;
}
