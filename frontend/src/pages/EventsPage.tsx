import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Filter, Info, Layers3, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { EventFormDialog } from "@/features/events/EventFormDialog";
import { deleteEvent, listEvents } from "@/lib/api/sponsorship";
import { eventTypeLabel } from "@/lib/event-types";
import { formatDate } from "@/lib/format";
import type { EventRecord } from "@/types/sponsorship";

function NewEventButton() { return <EventFormDialog trigger={<Button><Plus />New event</Button>} />; }

function descendantCount(eventId: string, events: EventRecord[]) {
  const children = new Map<string, string[]>();
  events.forEach((event) => { if (event.parent_event_id) children.set(event.parent_event_id, [...(children.get(event.parent_event_id) ?? []), event.id]); });
  let count = 0;
  const pending = [...(children.get(eventId) ?? [])];
  while (pending.length) { const next = pending.pop()!; count += 1; pending.push(...(children.get(next) ?? [])); }
  return count;
}

export function EventsPage() {
  const queryClient = useQueryClient();
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const [pendingDelete, setPendingDelete] = useState<EventRecord | null>(null);
  const [view, setView] = useState<"events" | "subevents">("events");
  const events = eventsQuery.data ?? [];
  const roots = events.filter((event) => !event.parent_event_id);
  const children = events.filter((event) => event.parent_event_id);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const deletionCount = pendingDelete ? descendantCount(pendingDelete.id, events) : 0;
  const removal = useMutation({ mutationFn: (event: EventRecord) => deleteEvent(event.id), onSuccess: (_, event) => { void queryClient.invalidateQueries({ queryKey: ["events"] }); void queryClient.invalidateQueries({ queryKey: ["opportunities"] }); void queryClient.invalidateQueries({ queryKey: ["tasks"] }); toast.success(`Deleted ${event.name}`); setPendingDelete(null); }, onError: (error) => toast.error(errorMessage(error, "Could not delete the event.")) });

  return <>
    <PageHeader title="Events" description="Create full event records, connect them into nested event hierarchies, and manage their requirements." actions={<><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline"><Filter />Filter: {view === "events" ? "Events" : "Sub-events"}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuRadioGroup value={view} onValueChange={(value) => setView(value as "events" | "subevents")}><DropdownMenuRadioItem value="events">Events</DropdownMenuRadioItem><DropdownMenuRadioItem value="subevents">Sub-events</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu><NewEventButton /></>} />
    {eventsQuery.error ? <ErrorAlert message={errorMessage(eventsQuery.error, "Could not load events.")} /> : null}
    {eventsQuery.isLoading ? <LoadingState label="Loading events…" /> : events.length === 0 && !eventsQuery.error ? <EmptyState icon={<CalendarDays />} title="No events yet" description="Create your first event to start tracking resource needs and sponsors." action={<NewEventButton />} /> : null}
    {events.length > 0 ? <div className="space-y-8">{view === "events" ? <EventSection title="Events" description="Standalone and top-level events." empty="No top-level events yet." events={roots} onDelete={setPendingDelete} /> : <EventSection title="Sub-events" description="Full event records linked beneath another event. They can have nested sub-events of their own." empty="No linked sub-events yet." events={children} onDelete={setPendingDelete} parentName={(event) => event.parent_event_id ? eventById.get(event.parent_event_id)?.name : undefined} />}</div> : null}
    <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open && !removal.isPending) setPendingDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle><AlertDialogDescription>{deletionCount > 0 ? `This permanently deletes this event and its ${deletionCount} nested ${deletionCount === 1 ? "sub-event" : "sub-events"}, along with their requirements, sponsorship records, offers, and follow-ups.` : "This permanently deletes this event with its requirements, sponsorship records, offers, and follow-ups."} Prospects themselves are kept. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={removal.isPending}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={removal.isPending} onClick={(click) => { click.preventDefault(); if (pendingDelete && !removal.isPending) removal.mutate(pendingDelete); }}>{removal.isPending ? <Spinner /> : null}Delete event{deletionCount ? " and sub-events" : ""}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

function EventSection({ title, description, empty, events, parentName, onDelete }: { title: string; description: string; empty: string; events: EventRecord[]; parentName?: (event: EventRecord) => string | undefined; onDelete: (event: EventRecord) => void }) {
  return <section><div className="mb-4"><h2 className="text-xl font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>{events.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} parentName={parentName?.(event)} onDelete={() => onDelete(event)} />)}</div> : <Card><CardContent className="py-7 text-sm text-muted-foreground">{empty}</CardContent></Card>}</section>;
}

function EventCard({ event, parentName, onDelete }: { event: EventRecord; parentName?: string; onDelete: () => void }) {
  return <Card className="flex min-h-64 flex-col transition-shadow hover:shadow-md hover:ring-primary/30"><CardHeader className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary">{event.is_subevent ? <Layers3 className="size-4" /> : <CalendarDays className="size-4" />}</span><div className="min-w-0 space-y-1"><p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{parentName ? `Part of ${parentName}` : eventTypeLabel(event.event_type)}</p><CardTitle className="text-lg leading-tight">{event.name}</CardTitle><p className="text-xs text-muted-foreground">{formatDate(event.start_date)}{event.end_date && event.end_date !== event.start_date ? ` – ${formatDate(event.end_date)}` : ""}</p></div></CardHeader><CardContent className="flex-1"><p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{event.description || `${event.institution} · ${event.is_online ? "Online" : event.location || "Location to be confirmed"}`}</p></CardContent><CardFooter className="gap-2"><Button asChild variant="outline" className="flex-1"><Link to={`/events/${event.id}`}><Info />Info</Link></Button><EventFormDialog event={event} trigger={<Button variant="outline" size="icon-sm" aria-label={`Edit ${event.name}`}><Pencil /></Button>} /><Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Delete ${event.name}`} onClick={onDelete}><Trash2 /></Button></CardFooter></Card>;
}
