import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Building2, ExternalLink, History, Mail, MoreHorizontal, Pencil, PhoneCall, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { approveEmail, approveVoiceCall, createEmailDraft, deleteEmailDraft, getOpportunity, sendEmail, updateEmailDraft, updateOpportunity, type OutreachMessage } from "@/lib/api/sponsorship";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  fromDateTimeLocal,
  messageStatusLabels,
  messageTone,
  needCategoryLabels,
  offerStatusLabels,
  offerTone,
  opportunityStatusLabels,
  opportunityTone,
  taskStatusLabels,
  taskTone,
  toDateTimeLocal,
  voiceCallStatusLabels,
  voiceCallTone,
} from "@/lib/format";
import type { Offer, OpportunityDetail } from "@/types/sponsorship";

export function OpportunityPage() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
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

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
        <section className="min-w-0 space-y-6">
          <ActivityCard
            opportunity={opportunity}
            openVoiceCall={searchParams.get("action") === "call"}
            onVoiceCallDismiss={() => setSearchParams((params) => {
              const next = new URLSearchParams(params);
              next.delete("action");
              return next;
            }, { replace: true })}
          />
          <OffersCard opportunity={opportunity} />
          <TasksCard opportunity={opportunity} />
        </section>
        <aside className="min-w-0 space-y-6">
          <ProspectCard opportunity={opportunity} />
          <HistoryCard opportunity={opportunity} />
          <PlanCard opportunity={opportunity} />
        </aside>
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
        <CardTitle>Sponsor details</CardTitle>
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

function ActivityCard({
  opportunity,
  openVoiceCall,
  onVoiceCallDismiss,
}: {
  opportunity: OpportunityDetail;
  openVoiceCall: boolean;
  onVoiceCallDismiss: () => void;
}) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<"voice" | "email">("voice");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<OpportunityDetail["messages"][number] | null>(null);
  const [sendingMessageId, setSendingMessageId] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["opportunity", opportunity.id] });
    void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
  };
  const draft = useMutation({
    mutationFn: () => createEmailDraft(opportunity.id),
    onSuccess: (message) => {
      setEditingDraft(message);
      setEmailDialogOpen(true);
      refresh();
      toast.success("Email draft created. Review it before approving.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const approve = useMutation({ mutationFn: approveEmail, onSuccess: () => { refresh(); toast.success("Outreach approved"); }, onError: (error) => toast.error(errorMessage(error)) });
  const send = useMutation({
    mutationFn: sendEmail,
    onMutate: (messageId) => setSendingMessageId(messageId),
    onSuccess: () => { refresh(); toast.success("Email sent"); },
    // The backend may have marked the email failed; refresh so "Retry send" and the reason appear.
    onError: (error) => { refresh(); toast.error(errorMessage(error, "Email delivery failed. You can retry the email.")); },
    onSettled: () => setSendingMessageId(null),
  });
  const deleteDraft = useMutation({ mutationFn: deleteEmailDraft, onSuccess: () => { setEmailDialogOpen(false); setEditingDraft(null); refresh(); toast.success("Email draft deleted"); }, onError: (error) => toast.error(errorMessage(error)) });
  const emailMessages = opportunity.messages.filter((message) => message.channel === "email");

  useEffect(() => {
    if (openVoiceCall) setChannel("voice");
  }, [openVoiceCall]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact sponsor</CardTitle>
        <CardDescription>Use one channel at a time so the next action stays clear.</CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <Button size="sm" variant={channel === "email" ? "default" : "outline"} onClick={() => setChannel("email")}>
            <Mail />Email
          </Button>
          <VoiceCallDialog
            opportunity={opportunity}
            autoOpen={openVoiceCall}
            onDismiss={onVoiceCallDismiss}
            onTriggerClick={() => setChannel("voice")}
            triggerActive={channel === "voice"}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {channel === "voice" ? (
          <section aria-label="Voice calls" className="space-y-3">
            <div>
              <p className="font-medium">Voice calls</p>
              <p className="text-muted-foreground">Approved calls are picked up by the Voice AI worker and tracked here.</p>
            </div>
            {opportunity.calls.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-muted-foreground">No voice calls yet. Use Voice call to review consent and queue the first call.</p>
            ) : (
              <ul className="divide-y">
                {opportunity.calls.map((call) => (
                  <li key={call.id} className="flex min-w-0 items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Link to={`/calls/${call.id}`} className="min-w-0 truncate hover:text-primary hover:underline">Voice call · {formatDateTime(call.created_at)}</Link>
                    <StatusPill tone={voiceCallTone(call.status)} className="shrink-0">{voiceCallStatusLabels[call.status] || call.status}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section aria-label="Email outreach" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Email outreach</p>
                <p className="text-muted-foreground">Create, review, approve, and send emails from one place.</p>
              </div>
              <Button size="sm" disabled={opportunity.outreach_blocked || draft.isPending} onClick={() => draft.mutate()}>
                {draft.isPending ? <Spinner /> : <Mail />}Create email
              </Button>
            </div>
            {emailMessages.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-muted-foreground">No email outreach yet. Create an email to review its draft before approval.</p>
            ) : (
              <ul className="divide-y">
                {emailMessages.map((message) => (
                  <li key={message.id} className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{message.subject || message.message_type}</p>
                      <p className="truncate text-xs text-muted-foreground">To {message.recipient || "No recipient"}</p>
                      {message.status === "failed" && message.error_message ? (
                        <p className="mt-1 text-xs break-words text-destructive">{message.error_message}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <StatusPill tone={messageTone(message.status)}>{messageStatusLabels[message.status] || message.status}</StatusPill>
                      <Button size="xs" variant="outline" onClick={() => { setEditingDraft(message); setEmailDialogOpen(true); }}>
                        {message.status === "draft" ? "View & edit" : "View email"}
                      </Button>
                      {message.status === "draft" ? <Button size="xs" disabled={approve.isPending} onClick={() => approve.mutate(message.id)}>Approve</Button> : null}
                      {message.status === "draft" ? <Button size="xs" variant="ghost" disabled={deleteDraft.isPending} onClick={() => deleteDraft.mutate(message.id)}><Trash2 />Delete</Button> : null}
                      {message.status === "approved" || message.status === "failed" ? (
                        <Button size="xs" disabled={send.isPending} onClick={() => send.mutate(message.id)}>
                          {sendingMessageId === message.id ? <Spinner /> : null}
                          {sendingMessageId === message.id ? (message.status === "failed" ? "Retrying…" : "Sending…") : (message.status === "failed" ? "Retry send" : "Send")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </CardContent>
      <EmailDraftDialog
        draft={editingDraft}
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        onSaved={(message) => {
          setEditingDraft(message);
          refresh();
        }}
        onDelete={() => deleteDraft.mutate(editingDraft!.id)}
        deleting={deleteDraft.isPending}
      />
    </Card>
  );
}

function EmailDraftDialog({
  draft,
  open,
  onOpenChange,
  onSaved,
  onDelete,
  deleting,
}: {
  draft: OpportunityDetail["messages"][number] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (message: OutreachMessage) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!draft) return;
    setRecipient(draft.recipient || "");
    setSubject(draft.subject || "");
    setBody(draft.body || "");
  }, [draft]);

  const save = useMutation({
    mutationFn: () => updateEmailDraft(draft!.id, { recipient: recipient.trim(), subject: subject.trim(), body: body.trim() }),
    onSuccess: (message) => {
      onSaved(message);
      toast.success("Email draft saved");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!draft) return null;
  const editable = draft.status === "draft";
  const valid = Boolean(recipient.trim() && subject.trim() && body.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="min-w-0 max-h-[calc(100svh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-2xl"
        style={{ width: "min(42rem, calc(100vw - 2rem))" }}
      >
        <DialogHeader>
          <DialogTitle>{editable ? "Edit email draft" : "Email"}</DialogTitle>
          <DialogDescription>
            {editable ? "Review and edit this email before approving it for delivery." : "This email is read-only because it has already been approved or sent."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="email-recipient">To</FieldLabel>
            <Input id="email-recipient" type="email" value={recipient} disabled={!editable} onChange={(event) => setRecipient(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email-subject">Subject</FieldLabel>
            <Input id="email-subject" value={subject} disabled={!editable} onChange={(event) => setSubject(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email-body">Message</FieldLabel>
            <Textarea id="email-body" rows={12} value={body} disabled={!editable} onChange={(event) => setBody(event.target.value)} />
          </Field>
        </div>
        <DialogFooter showCloseButton>
          {editable ? (
            <>
              <Button variant="destructive" disabled={deleting || save.isPending} onClick={onDelete}><Trash2 />Delete draft</Button>
              <Button disabled={!valid || save.isPending || deleting} onClick={() => save.mutate()}>
                {save.isPending ? <Spinner /> : null}Save changes
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoiceCallDialog({
  opportunity,
  autoOpen = false,
  onDismiss,
  onTriggerClick,
  triggerActive = true,
}: {
  opportunity: OpportunityDetail;
  autoOpen?: boolean;
  onDismiss?: () => void;
  onTriggerClick?: () => void;
  triggerActive?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [consent, setConsent] = useState(false);
  const hasPhone = Boolean(opportunity.prospect.phone);
  useEffect(() => {
    if (autoOpen && hasPhone && !opportunity.outreach_blocked) setOpen(true);
  }, [autoOpen, hasPhone, opportunity.outreach_blocked]);
  const mutation = useMutation({
    mutationFn: () => approveVoiceCall(opportunity.id, { instructions: instructions.trim() || null, consent_confirmed: true }),
    onSuccess: () => {
      setOpen(false);
      onDismiss?.();
      setInstructions("");
      setConsent(false);
      void queryClient.invalidateQueries({ queryKey: ["opportunity", opportunity.id] });
      void queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      toast.success("Voice call added to the queue");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) onDismiss?.(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerActive ? "default" : "outline"} disabled={opportunity.outreach_blocked || !hasPhone} onClick={onTriggerClick} title={!hasPhone ? "Add a sponsor phone number before approving a voice call." : undefined}>
          <PhoneCall />Voice call
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve voice call</DialogTitle>
          <DialogDescription className="pr-5 leading-relaxed text-pretty">
            Event details for {opportunity.event_name} will be shared with the Voice AI agent when it contacts {opportunity.prospect.company_name} at {opportunity.prospect.phone}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel htmlFor="voice-instructions">Instructions for this sponsor (optional)</FieldLabel>
            <Textarea id="voice-instructions" rows={4} value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={2000} placeholder="e.g. Ask for the developer-relations team." />
          </div>
          <label htmlFor="voice-consent" className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed hover:bg-muted/70">
            <Checkbox id="voice-consent" className="mt-0.5" checked={consent} onCheckedChange={(value) => setConsent(value === true)} />
            <span className="min-w-0 flex-1">I am authorized to contact this sponsor and have confirmed any required consent for this voice call.</span>
          </label>
        </div>
        <DialogFooter showCloseButton>
          <Button disabled={!consent || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <Spinner /> : null}Approve and queue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
