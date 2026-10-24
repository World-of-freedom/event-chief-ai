import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyState } from "@/components/EmptyState";
import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { EventSelect } from "@/components/EventSelect";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { NoEventsState } from "@/features/events/NoEventsState";
import { TaskActions } from "@/features/tasks/TaskActions";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { listEvents, listTasks } from "@/lib/api/sponsorship";
import { formatDateTime, taskStatusLabels, taskTone } from "@/lib/format";
import type { TaskStatus } from "@/types/sponsorship";

type View = "active" | "overdue" | "completed" | "canceled" | "all";

const views: { value: View; label: string }[] = [
  { value: "active", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
  { value: "all", label: "All" },
];

export function FollowUpsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get("event");
  const view = (searchParams.get("view") as View | null) ?? "active";

  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const events = eventsQuery.data ?? [];
  const status: TaskStatus | "" = view === "completed" || view === "canceled" ? view : "";
  const tasksQuery = useQuery({
    queryKey: ["tasks", { eventId, view }],
    queryFn: () => listTasks({ event_id: eventId ?? undefined, status, overdue_only: view === "overdue" }),
    enabled: events.length > 0,
  });

  const setParam = (key: string, value: string | null) =>
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });

  // "Open" shows open and in-progress follow-ups only.
  const tasks = (tasksQuery.data ?? []).filter((task) => view !== "active" || task.status === "open" || task.status === "in_progress");

  return (
    <>
      <PageHeader title="Follow-ups" description="Reminders linked to sponsors. Overdue ones are flagged so nothing slips." />

      {eventsQuery.error ? <ErrorAlert message={errorMessage(eventsQuery.error, "Could not load events.")} /> : null}
      {tasksQuery.error ? <ErrorAlert message={errorMessage(tasksQuery.error, "Could not load follow-ups.")} /> : null}

      {eventsQuery.isLoading ? (
        <LoadingState label="Loading follow-ups…" />
      ) : events.length === 0 ? (
        eventsQuery.error ? null : <NoEventsState description="Follow-ups are attached to sponsors in an event's pipeline. Create an event first." />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={view}
              onValueChange={(value) => value && setParam("view", value === "active" ? null : value)}
              className="flex-wrap"
              aria-label="Show"
            >
              {views.map((option) => <ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>)}
            </ToggleGroup>
            <EventSelect events={events} value={eventId} onChange={(id) => setParam("event", id)} allowAll className="w-full sm:w-56" />
          </div>

          {tasksQuery.isLoading ? (
            <LoadingState label="Loading follow-ups…" />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck />}
              title={view === "overdue" ? "Nothing overdue" : "No follow-ups here"}
              description="Add follow-ups from a sponsor's page in the pipeline."
            />
          ) : (
            <Card className="py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Follow-up</TableHead>
                    <TableHead className="hidden md:table-cell">Sponsor</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="pr-4"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="pl-4">
                        <div className="font-medium">{task.title}</div>
                        <Link to={`/pipeline/${task.opportunity_id}`} className="text-xs text-muted-foreground hover:underline md:hidden">
                          {task.company_name}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Link to={`/pipeline/${task.opportunity_id}`} className="hover:underline">{task.company_name}</Link>
                        <div className="text-xs text-muted-foreground">{task.event_name}</div>
                      </TableCell>
                      <TableCell className={task.is_overdue ? "whitespace-nowrap font-medium text-destructive" : "whitespace-nowrap text-muted-foreground"}>
                        {formatDateTime(task.due_at)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <StatusPill tone={taskTone(task.status, task.is_overdue)}>{task.is_overdue ? "Overdue" : taskStatusLabels[task.status]}</StatusPill>
                      </TableCell>
                      <TableCell className="pr-4"><TaskActions task={task} /></TableCell>
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
