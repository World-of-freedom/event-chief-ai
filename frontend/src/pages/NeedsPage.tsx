import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { EventSelect } from "@/components/EventSelect";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { NoEventsState } from "@/features/events/NoEventsState";
import { NeedFormDialog } from "@/features/needs/NeedFormDialog";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useActiveEvent } from "@/hooks/use-active-event";
import { deleteNeed, listNeeds } from "@/lib/api/sponsorship";
import { formatDate, formatMoney, needCategoryLabels, needPriorityLabels, needStatusLabels } from "@/lib/format";
import type { NeedStatus, ResourceNeed } from "@/types/sponsorship";

const statusTone: Record<NeedStatus, Tone> = {
  open: "info",
  in_progress: "brand",
  partially_covered: "warning",
  covered: "success",
};

export function NeedsPage() {
  const { events, isLoading, error, activeEvent, activeEventId, setActiveEventId } = useActiveEvent();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<ResourceNeed | null>(null);

  const needsQuery = useQuery({
    queryKey: ["needs", activeEventId],
    queryFn: () => listNeeds(activeEventId!),
    enabled: !!activeEventId,
  });

  const removal = useMutation({
    mutationFn: (need: ResourceNeed) => deleteNeed(need.id),
    onSuccess: (_, need) => {
      void queryClient.invalidateQueries({ queryKey: ["needs", activeEventId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", activeEventId] });
      toast.success(`Deleted ${need.title}`);
    },
    onError: (err) => toast.error(errorMessage(err, "Could not delete the need.")),
  });

  const needs = needsQuery.data ?? [];
  const cashNeeds = needs.filter((need) => need.category === "cash");
  const inKindNeeds = needs.filter((need) => need.category !== "cash");
  const cashTarget = cashNeeds.reduce((sum, need) => sum + Number(need.target_amount ?? 0), 0);

  const addButton = activeEventId ? (
    <NeedFormDialog
      eventId={activeEventId}
      trigger={
        <Button>
          <Plus />
          Add need
        </Button>
      }
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Resource needs"
        description="What each event needs. Cash and in-kind support are tracked and reported separately."
        actions={events.length ? (
          <>
            <EventSelect events={events} value={activeEventId} onChange={setActiveEventId} />
            {addButton}
          </>
        ) : null}
      />

      {error ? <ErrorAlert message={errorMessage(error, "Could not load events.")} /> : null}
      {needsQuery.error ? <ErrorAlert message={errorMessage(needsQuery.error, "Could not load needs.")} /> : null}

      {isLoading || needsQuery.isLoading ? (
        <LoadingState label="Loading resource needs…" />
      ) : !activeEvent ? (
        error ? null : <NoEventsState description="Resource needs belong to an event. Create one to start listing what you need." />
      ) : needs.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          title={`No needs for ${activeEvent.name} yet`}
          description="Add a cash target (for example a prize pool) or in-kind needs like cloud credits, food or swag."
          action={addButton}
        />
      ) : (
        <div className="space-y-6">
          <NeedsTable
            title="Cash"
            summary={`Target ${formatMoney(cashTarget)}`}
            needs={cashNeeds}
            eventId={activeEvent.id}
            onDelete={setPendingDelete}
            emptyText="No cash needs. Add one with a target amount to see a cash gap on the dashboard."
          />
          <NeedsTable
            title="In-kind"
            summary={`${inKindNeeds.length} need${inKindNeeds.length === 1 ? "" : "s"}`}
            needs={inKindNeeds}
            eventId={activeEvent.id}
            onDelete={setPendingDelete}
            emptyText="No in-kind needs yet."
          />
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Offers linked to this need stay in the pipeline but lose the link. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingDelete && removal.mutate(pendingDelete)}>Delete need</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface NeedsTableProps {
  title: string;
  summary: string;
  needs: ResourceNeed[];
  eventId: string;
  emptyText: string;
  onDelete: (need: ResourceNeed) => void;
}

function NeedsTable({ title, summary, needs, eventId, emptyText, onDelete }: NeedsTableProps) {
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-3">
          {title}
          <span className="text-sm font-normal text-muted-foreground">{summary}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {needs.length === 0 ? (
          <p className="border-t px-4 py-6 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Need</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="hidden sm:table-cell">Priority</TableHead>
                <TableHead className="hidden md:table-cell">Deadline</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {needs.map((need) => (
                <TableRow key={need.id}>
                  <TableCell className="pl-4">
                    <div className="font-medium">{need.title}</div>
                    <div className="text-xs text-muted-foreground">{needCategoryLabels[need.category]}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {need.target_amount ? formatMoney(need.target_amount, need.currency) : null}
                    {need.target_amount && need.target_quantity ? " · " : null}
                    {need.target_quantity ? `${need.target_quantity} units` : null}
                    {!need.target_amount && !need.target_quantity ? <span className="text-muted-foreground">—</span> : null}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{needPriorityLabels[need.priority]}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{formatDate(need.deadline)}</TableCell>
                  <TableCell><StatusPill tone={statusTone[need.status]}>{needStatusLabels[need.status]}</StatusPill></TableCell>
                  <TableCell className="pr-4 text-right">
                    <NeedRowActions need={need} eventId={eventId} onDelete={() => onDelete(need)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function NeedRowActions({ need, eventId, onDelete }: { need: ResourceNeed; eventId: string; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${need.title}`}><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil />Edit</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing ? <NeedFormDialog eventId={eventId} need={need} trigger={null} defaultOpen onOpenChange={(open) => !open && setEditing(false)} /> : null}
    </>
  );
}
