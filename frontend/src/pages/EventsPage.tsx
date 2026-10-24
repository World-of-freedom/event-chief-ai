import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { EventFormDialog } from "@/features/events/EventFormDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteEvent, listEvents } from "@/lib/api/sponsorship";
import { eventTypeLabel } from "@/lib/event-types";
import { formatDate } from "@/lib/format";
import type { EventRecord } from "@/types/sponsorship";

function NewEventButton() {
  return (
    <EventFormDialog
      trigger={
        <Button>
          <Plus />
          New event
        </Button>
      }
    />
  );
}

export function EventsPage() {
  const queryClient = useQueryClient();
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const [pendingDelete, setPendingDelete] = useState<EventRecord | null>(null);

  const removal = useMutation({
    mutationFn: (event: EventRecord) => deleteEvent(event.id),
    onSuccess: (_, event) => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`Deleted ${event.name}`);
    },
    onError: (error) => toast.error(errorMessage(error, "Could not delete the event.")),
  });

  const events = eventsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Event setup"
        description="Create the events you're raising support for. Each event has its own needs, pipeline and dashboard."
        actions={<NewEventButton />}
      />

      {eventsQuery.error ? <ErrorAlert message={errorMessage(eventsQuery.error, "Could not load events.")} /> : null}

      {eventsQuery.isLoading ? (
        <LoadingState label="Loading events…" />
      ) : events.length === 0 && !eventsQuery.error ? (
        <EmptyState
          icon={<CalendarDays />}
          title="No events yet"
          description="Create your first event to start tracking resource needs and sponsors."
          action={<NewEventButton />}
        />
      ) : events.length > 0 ? (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Event</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="pl-4">
                    <div className="font-medium">{event.name}</div>
                    <div className="text-xs text-muted-foreground">{event.institution}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{eventTypeLabel(event.event_type)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(event.start_date)}
                    {event.end_date && event.end_date !== event.start_date ? ` – ${formatDate(event.end_date)}` : ""}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{event.is_online ? "Online" : event.location || "—"}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <EventRowActions event={event} onDelete={() => setPendingDelete(event)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the event with its resource needs, pipeline opportunities, offers and follow-ups.
              Prospects themselves are kept. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingDelete && removal.mutate(pendingDelete)}>
              Delete event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EventRowActions({ event, onDelete }: { event: EventRecord; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${event.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to={`/needs?event=${event.id}`}>Resource needs</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`/pipeline?event=${event.id}`}>Pipeline</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to={`/?event=${event.id}`}>Dashboard</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing ? <EditEventDialog event={event} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

/** Opens the edit form immediately (used from the row menu). */
function EditEventDialog({ event, onClose }: { event: EventRecord; onClose: () => void }) {
  return <EventFormDialog event={event} defaultOpen onOpenChange={(open) => !open && onClose()} trigger={null} />;
}
