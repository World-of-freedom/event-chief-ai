import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Building2, ExternalLink, History, MoreHorizontal, Pencil, Plus, ShieldAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { AcceptOfferDialog, AddOfferDialog, useOfferStatusMutation } from "@/features/pipeline/OfferDialogs";
import { EditProspectDialog, OptOutDialog, verificationLabels } from "@/features/pipeline/ProspectDialogs";
import { TaskActions } from "@/features/tasks/TaskActions";
import { NewTaskDialog } from "@/features/tasks/TaskDialogs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { approveEmail, createEmailDraft, getOpportunity, recordManualInteraction, sendEmail, updateOpportunity } from "@/lib/api/sponsorship";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  fromDateTimeLocal,
  needCategoryLabels,
  offerStatusLabels,
  offerTone,
  opportunityStatusLabels,
  opportunityTone,
  taskStatusLabels,
  taskTone,
  toDateTimeLocal,
} from "@/lib/format";
import type { OpportunityStatus } from "@/types/domain";
import type { Offer, OpportunityDetail } from "@/types/sponsorship";

export function OpportunityPage() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const query = useQuery({
    queryKey: ["opportunity", opportunityId],
    queryFn: () => getOpportunity(opportunityId!),
    enabled: !!opportunityId,
  });

  const back = (
    <Button asChild variant="outline">
      <Link to="/pipeline"><ArrowLeft />Back</Link>
    </Button>
  );

  if (query.isLoading) return <LoadingState label="Loading opportunity…" />;
  if (query.error || !query.data) {
    return (
      <EmptyState
        icon={<Building2 />}
        title="Opportunity not found"
        description={query.error ? errorMessage(query.error) : "This opportunity doesn't exist or isn't yours."}
        action={back}
      />
    );
  }

  const opportunity = query.data;
  return (
    <>
      <PageHeader
        title={opportunity.prospect.company_name}
        description={`Sponsor opportunity for ${opportunity.event_name}.`}
        actions={back}
      />

      {opportunity.outreach_blocked ? (
        <Alert className="mb-6 border-warning/30 bg-warning-soft text-warning">
          <ShieldAlert />
          <AlertTitle>{opportunity.prospect.opted_out ? "This company has opted out" : "This opportunity is closed"}</AlertTitle>
          <AlertDescription className="text-warning/90">
            {opportunity.prospect.opted_out
              ? `Don't contact ${opportunity.prospect.company_name} again${opportunity.prospect_detail.opt_out_reason ? ` (${opportunity.prospect_detail.opt_out_reason})` : ""}.`
              : "No further outreach should be started for this opportunity."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-6">
          <StatusCard opportunity={opportunity} />
          <OffersCard opportunity={opportunity} />
          <TasksCard opportunity={opportunity} />
          <HistoryCard opportunity={opportunity} />
        </div>
        <div className="min-w-0 space-y-6">
          <ProspectCard opportunity={opportunity} />
          <PlanCard opportunity={opportunity} />
          <ActivityCard opportunity={opportunity} />
        </div>
      </div>
    </>
  );
}

function useRefreshOpportunity(opportunity: OpportunityDetail) {
  const queryClient = useQueryClient();
  return (updated?: OpportunityDetail) => {
    if (updated) queryClient.setQueryData(["opportunity", opportunity.id], updated);
    void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", opportunity.event_id] });
  };
}

function StatusCard({ opportunity }: { opportunity: OpportunityDetail }) {
  const refresh = useRefreshOpportunity(opportunity);
  const [target, setTarget] = useState<OpportunityStatus | "">("");
  const [reason, setReason] = useState("");
  const options = opportunity.allowed_next_statuses;

  const mutation = useMutation({
    mutationFn: () => updateOpportunity(opportunity.id, { status: target as OpportunityStatus, status_reason: reason.trim() || null }),
    onSuccess: (updated) => {
      refresh(updated);
      toast.success(`Moved to ${opportunityStatusLabels[updated.status]}`);
      setTarget("");
      setReason("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline status</CardTitle>
        <CardDescription>Statuses move in a fixed order; every change is logged.</CardDescription>
        <CardAction>
          <StatusPill tone={opportunityTone(opportunity.status)} className="h-6 px-2.5">{opportunityStatusLabels[opportunity.status]}</StatusPill>
        </CardAction>
      </CardHeader>
      <CardContent>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">This is a final status. No further moves are possible.</p>
        ) : (
          <FieldGroup className="gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select value={target} onValueChange={(value) => setTarget(value as OpportunityStatus)}>
                <SelectTrigger className="w-full sm:w-60" aria-label="Move to status"><SelectValue placeholder="Move to…" /></SelectTrigger>
                <SelectContent>
                  {options.map((status) => <SelectItem key={status} value={status}>{opportunityStatusLabels[status]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason or note (optional)" aria-label="Reason" maxLength={500} />
              <Button
                variant={target === "opted_out" ? "destructive" : "default"}
                disabled={!target || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? <Spinner /> : null}
                Update
              </Button>
            </div>
            {target === "opted_out" ? (
              <p className="text-xs text-destructive">Opting out also marks the company as opted out everywhere. It can't be undone.</p>
            ) : null}
            {mutation.error ? <ErrorAlert className="border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}

function OffersCard({ opportunity }: { opportunity: OpportunityDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Offers</CardTitle>
        <CardDescription>Proposed → under review → accepted or rejected. Only accepted offers count as secured.</CardDescription>
        <CardAction>
          <AddOfferDialog
            opportunityId={opportunity.id}
            eventId={opportunity.event_id}
            trigger={<Button variant="outline" size="sm"><Plus />Record offer</Button>}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {opportunity.offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No offers recorded yet.</p>
        ) : (
          <ul className="divide-y">
            {opportunity.offers.map((offer) => <OfferRow key={offer.id} offer={offer} opportunity={opportunity} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function OfferRow({ offer, opportunity }: { offer: Offer; opportunity: OpportunityDetail }) {
  const [accepting, setAccepting] = useState(false);
  const mutation = useOfferStatusMutation(opportunity.id, opportunity.event_id);
  const simpleMoves = offer.allowed_next_statuses.filter((status) => status !== "accepted");

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{needCategoryLabels[offer.support_type]}</span>
          <span className="text-muted-foreground">
            {offer.stated_value ? formatMoney(offer.stated_value, offer.currency) : "Value unknown"}
            {offer.quantity ? ` · ${offer.quantity} units` : ""}
          </span>
          <StatusPill tone={offerTone(offer.status)}>{offerStatusLabels[offer.status]}</StatusPill>
        </div>
        {offer.conditions ? <p className="text-muted-foreground">Conditions: {offer.conditions}</p> : null}
        {offer.expected_timeline ? <p className="text-muted-foreground">Timeline: {offer.expected_timeline}</p> : null}
        {offer.evidence_notes || offer.evidence_url ? (
          <p className="text-xs text-muted-foreground">
            Evidence: {offer.evidence_notes}
            {offer.evidence_url ? (
              <a href={offer.evidence_url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline">
                link<ExternalLink className="size-3" />
              </a>
            ) : null}
          </p>
        ) : null}
        {offer.organizer_verified_at ? <p className="text-xs text-muted-foreground">Accepted {formatDateTime(offer.organizer_verified_at)}</p> : null}
      </div>
      {offer.allowed_next_statuses.length ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          {offer.allowed_next_statuses.includes("accepted") ? (
            <Button size="sm" onClick={() => setAccepting(true)}>Accept…</Button>
          ) : null}
          {simpleMoves.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={status === "rejected" ? "ghost" : "outline"}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ offer, patch: { status } }, { onError: (err) => toast.error(errorMessage(err)) })}
            >
              {status === "under_review" ? "Start review" : status === "fulfilled" ? "Mark fulfilled" : offerStatusLabels[status]}
            </Button>
          ))}
        </div>
      ) : null}
      <AcceptOfferDialog offer={offer} opportunityId={opportunity.id} eventId={opportunity.event_id} open={accepting} onOpenChange={setAccepting} />
    </li>
  );
}

function TasksCard({ opportunity }: { opportunity: OpportunityDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Follow-ups</CardTitle>
        <CardAction>
          <NewTaskDialog
            opportunityId={opportunity.id}
            eventId={opportunity.event_id}
            trigger={<Button variant="outline" size="sm"><Plus />Add follow-up</Button>}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {opportunity.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No follow-ups yet.</p>
        ) : (
          <ul className="divide-y">
            {opportunity.tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 text-sm">
                  <div className={task.status === "completed" || task.status === "canceled" ? "font-medium text-muted-foreground line-through" : "font-medium"}>
                    {task.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusPill tone={taskTone(task.status, task.is_overdue)}>{task.is_overdue ? "Overdue" : taskStatusLabels[task.status]}</StatusPill>
                    {task.due_at ? `Due ${formatDateTime(task.due_at)}` : "No due date"}
                  </div>
                </div>
                <TaskActions task={task} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryCard({ opportunity }: { opportunity: OpportunityDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="size-4 text-primary" />Status history</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-l pl-5">
          {opportunity.status_history.map((entry) => (
            <li key={entry.id} className="relative text-sm">
              <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-2">
                {entry.previous_status ? (
                  <>
                    <span className="text-muted-foreground">{opportunityStatusLabels[entry.previous_status]}</span>
                    <span aria-hidden="true">→</span>
                  </>
                ) : null}
                <StatusPill tone={opportunityTone(entry.new_status)}>{opportunityStatusLabels[entry.new_status]}</StatusPill>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(entry.created_at)}
                {entry.reason ? ` · ${entry.reason}` : ""}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ProspectCard({ opportunity }: { opportunity: OpportunityDetail }) {
  const prospect = opportunity.prospect_detail;
  const [editing, setEditing] = useState(false);
  const [optingOut, setOptingOut] = useState(false);
  const rows: [string, string | null][] = [
    ["Industry", prospect.industry],
    ["Location", prospect.location],
    ["Contact", [prospect.contact_name, prospect.contact_role].filter(Boolean).join(", ") || null],
    ["Email", prospect.email],
    ["Phone", prospect.phone],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prospect</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <StatusPill tone={prospect.verification_status === "verified" ? "success" : prospect.verification_status === "reviewed" ? "info" : "neutral"}>
            {verificationLabels[prospect.verification_status]}
          </StatusPill>
          {prospect.opted_out ? <StatusPill tone="danger">Opted out</StatusPill> : null}
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Prospect actions"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil />Edit details</DropdownMenuItem>
              {!prospect.opted_out ? (
                <DropdownMenuItem variant="destructive" onSelect={() => setOptingOut(true)}><Ban />Mark as opted out</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <dl className="divide-y">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 py-2 first:pt-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate text-right font-medium" title={value ?? undefined}>{value || "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-3">
          {prospect.website_url ? (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={prospect.website_url} target="_blank" rel="noopener noreferrer">
              Website<ExternalLink className="size-3" />
            </a>
          ) : null}
          {prospect.source_url ? (
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={prospect.source_url} target="_blank" rel="noopener noreferrer">
              Source<ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
        {prospect.fit_reason ? (
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Why they fit</p>
            <p className="mt-1 leading-relaxed">{prospect.fit_reason}</p>
          </div>
        ) : null}
        {prospect.source_notes ? (
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Source notes</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">{prospect.source_notes}</p>
          </div>
        ) : null}
      </CardContent>
      <EditProspectDialog prospect={prospect} open={editing} onOpenChange={setEditing} />
      <OptOutDialog prospect={prospect} open={optingOut} onOpenChange={setOptingOut} />
    </Card>
  );
}

function PlanCard({ opportunity }: { opportunity: OpportunityDetail }) {
  const refresh = useRefreshOpportunity(opportunity);
  const [nextAction, setNextAction] = useState(opportunity.next_action ?? "");
  const [due, setDue] = useState(toDateTimeLocal(opportunity.next_action_due_at));
  const [notes, setNotes] = useState(opportunity.organizer_notes ?? "");

  useEffect(() => {
    setNextAction(opportunity.next_action ?? "");
    setDue(toDateTimeLocal(opportunity.next_action_due_at));
    setNotes(opportunity.organizer_notes ?? "");
  }, [opportunity.next_action, opportunity.next_action_due_at, opportunity.organizer_notes]);

  const dirty =
    nextAction !== (opportunity.next_action ?? "") ||
    due !== toDateTimeLocal(opportunity.next_action_due_at) ||
    notes !== (opportunity.organizer_notes ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      updateOpportunity(opportunity.id, {
        next_action: nextAction.trim() || null,
        next_action_due_at: fromDateTimeLocal(due),
        organizer_notes: notes.trim() || null,
      }),
    onSuccess: (updated) => {
      refresh(updated);
      toast.success("Saved");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next step &amp; notes</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="next-action">Next action</FieldLabel>
            <Input id="next-action" value={nextAction} maxLength={500} onChange={(e) => setNextAction(e.target.value)} placeholder="e.g. Share proposal deck" />
          </Field>
          <Field>
            <FieldLabel htmlFor="next-action-due">Due</FieldLabel>
            <Input id="next-action-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="organizer-notes">Notes</FieldLabel>
            <Textarea id="organizer-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {mutation.error ? <ErrorAlert className="border-destructive/30 bg-destructive-soft" message={errorMessage(mutation.error)} /> : null}
          <Button className="w-fit" disabled={!dirty || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Spinner /> : null}
            Save
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ActivityCard({ opportunity }: { opportunity: OpportunityDetail }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["opportunity", opportunity.id] }); void queryClient.invalidateQueries({ queryKey: ["opportunities"] }); void queryClient.invalidateQueries({ queryKey: ["tasks"] }); };
  const draft = useMutation({ mutationFn: () => createEmailDraft(opportunity.id), onSuccess: () => { refresh(); toast.success("Email draft created. Review and approve it before sending."); }, onError: (error) => toast.error(errorMessage(error)) });
  const approve = useMutation({ mutationFn: approveEmail, onSuccess: () => { refresh(); toast.success("Outreach approved"); }, onError: (error) => toast.error(errorMessage(error)) });
  const send = useMutation({ mutationFn: sendEmail, onSuccess: () => { refresh(); toast.success("Email sent"); }, onError: (error) => toast.error(errorMessage(error)) });
  const manual = useMutation({ mutationFn: () => recordManualInteraction(opportunity.id, { direction: "outbound", body: note.trim(), follow_up_title: followUp.trim() || null }), onSuccess: () => { setNote(""); setFollowUp(""); refresh(); toast.success("Manual interaction recorded"); }, onError: (error) => toast.error(errorMessage(error)) });
  const empty = opportunity.messages.length === 0 && opportunity.calls.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Emails &amp; calls</CardTitle>
        <CardDescription>Every email requires explicit approval. Added {formatDate(opportunity.created_at)}</CardDescription>
        <CardAction><Button size="sm" variant="outline" disabled={opportunity.outreach_blocked || draft.isPending} onClick={() => draft.mutate()}>{draft.isPending ? <Spinner /> : null}Draft email</Button></CardAction>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {empty ? (
          <p className="text-muted-foreground">No interactions yet. Draft an email or log a human conversation.</p>
        ) : (
          <ul className="divide-y">
            {opportunity.messages.map((message) => (
              <li key={message.id} className="flex justify-between gap-3 py-2">
                <span className="truncate">{message.subject || message.message_type}</span>
                <span className="flex shrink-0 items-center gap-2"><span className="text-muted-foreground">{message.status}</span>{message.status === "draft" ? <Button size="xs" disabled={approve.isPending} onClick={() => approve.mutate(message.id)}>Approve</Button> : null}{message.status === "approved" ? <Button size="xs" disabled={send.isPending} onClick={() => send.mutate(message.id)}>Send</Button> : null}</span>
              </li>
            ))}
            {opportunity.calls.map((call) => (
              <li key={call.id} className="flex justify-between gap-3 py-2">
                <span>Call · {formatDateTime(call.created_at)}</span>
                <span className="shrink-0 text-muted-foreground">{call.status}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 border-t pt-4">
          <p className="font-medium">Log a manual interaction</p>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="What happened when you contacted this sponsor?" />
          <Input value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="Optional follow-up task" />
          <Button size="sm" variant="outline" disabled={!note.trim() || manual.isPending || opportunity.outreach_blocked} onClick={() => manual.mutate()}>{manual.isPending ? <Spinner /> : null}Save interaction</Button>
        </div>
      </CardContent>
    </Card>
  );
}
