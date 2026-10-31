import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCheck, FileText, Headphones, PhoneCall } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cancelVoiceCall, getVoiceCall, getVoiceCallRecording, reviewVoiceCall } from "@/lib/api/sponsorship";
import type { VoiceCall } from "@/types/sponsorship";
import { callAttemptStatusLabels, formatDateTime, voiceCallStatusLabels, voiceCallTone } from "@/lib/format";

export function VoiceCallDetailPage() {
  const { callId } = useParams<{ callId: string }>();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["voice-call", callId], queryFn: () => getVoiceCall(callId!), enabled: Boolean(callId), refetchInterval: (data) => {
    const status = data.state.data?.status;
    return status && ["queued", "processing", "initiated", "in_progress", "retry_scheduled"].includes(status) ? 10_000 : false;
  } });
  const cancel = useMutation({
    mutationFn: () => cancelVoiceCall(callId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["voice-call", callId] });
      toast.success("Queued call cancelled");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // Header: plain "Back" to the call's opportunity; not-found screen: "Back to pipeline".
  const back = query.data
    ? <Button asChild variant="outline"><Link to={`/pipeline/${query.data.opportunity_id}`}><ArrowLeft />Back</Link></Button>
    : <Button asChild variant="outline"><Link to="/pipeline"><ArrowLeft />Back to pipeline</Link></Button>;
  if (query.isLoading) return <LoadingState label="Loading voice call…" />;
  if (query.error || !query.data) return <EmptyState icon={<PhoneCall />} title="Voice call not found" description={query.error ? errorMessage(query.error) : "This call does not exist or isn't yours."} action={back} />;

  const call = query.data;
  const cancellable = ["queued", "retry_scheduled", "blocked"].includes(call.status);
  return (
    <>
      <PageHeader
        title="Voice call"
        description={`Approved ${formatDateTime(call.approved_at)} · ${call.recipient_phone || "Phone unavailable"}`}
        actions={<div className="flex gap-2">{back}{cancellable ? <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel queued call</Button> : null}</div>}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PhoneCall className="size-4 text-primary" />Call status</CardTitle>
            <CardDescription>Attempts run only during the organizer's saved calling hours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusPill tone={voiceCallTone(call.status)}>{voiceCallStatusLabels[call.status] || call.status}</StatusPill>
            {call.next_attempt_at ? <p className="text-sm text-muted-foreground">Next attempt: {formatDateTime(call.next_attempt_at)}</p> : null}
            {call.last_error ? <ErrorAlert message={call.last_error} /> : null}
            {call.instructions ? <p className="text-sm"><span className="font-medium">Organizer instructions:</span> {call.instructions}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Attempts</CardTitle></CardHeader>
          <CardContent>
            {call.attempts.length === 0 ? <p className="text-sm text-muted-foreground">The worker has not started an attempt yet.</p> : (
              <ul className="divide-y">
                {call.attempts.map((attempt) => <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0 text-sm"><span>Attempt {attempt.attempt_number}</span><span className="text-muted-foreground">{callAttemptStatusLabels[attempt.status] || attempt.status}{attempt.error_message ? ` · ${attempt.error_message}` : ""}</span></li>)}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Call result</CardTitle>
            <CardDescription>Transcript and recording appear after Bolna finishes post-call processing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            {call.summary ? <section><p className="font-medium">Summary</p><p className="mt-1 leading-relaxed text-muted-foreground">{call.summary}</p></section> : null}
            {call.recording_url ? <RecordingPlayer callId={call.id} /> : <ResultUnavailable icon={<Headphones />} label="Recording" message="No recording is available for this call yet." />}
            {call.transcript_text ? <section><p className="mb-2 flex items-center gap-2 font-medium"><FileText className="size-4 text-primary" />Transcript</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-sm leading-relaxed text-muted-foreground">{call.transcript_text}</pre></section> : <ResultUnavailable icon={<FileText />} label="Transcript" message="No transcript was returned by Bolna for this call." />}
          </CardContent>
        </Card>
        <CallReviewCard call={call} />
      </div>
    </>
  );
}

const reviewableStatuses = ["completed", "no_answer", "failed"];
const reviewLabels: Record<string, string> = { needs_review: "Needs review", reviewed: "Reviewed", corrected: "Corrected" };

/** Edit the values Bolna extracted from the call and record the organizer's review. */
function CallReviewCard({ call }: { call: VoiceCall }) {
  const queryClient = useQueryClient();
  const toText = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value, null, 2));
  const original = Object.fromEntries(Object.entries(call.extracted_fields ?? {}).map(([key, value]) => [key, toText(value)]));
  const [values, setValues] = useState<Record<string, string>>(original);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(Object.fromEntries(Object.entries(call.extracted_fields ?? {}).map(([key, value]) => [key, toText(value)])));
  }, [call.extracted_fields]);

  const changed = Object.keys(values).some((key) => values[key] !== original[key]);
  const mutation = useMutation({
    mutationFn: () => {
      // Non-text values (lists, objects, numbers) are edited as JSON and parsed back.
      const parsed: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(values)) {
        if (typeof call.extracted_fields[key] === "string") parsed[key] = raw;
        else {
          try {
            parsed[key] = JSON.parse(raw);
          } catch {
            throw new Error(`“${key.replace(/_/g, " ")}” is not valid JSON.`);
          }
        }
      }
      return reviewVoiceCall(call.id, { extracted_fields: parsed, review_status: changed ? "corrected" : "reviewed" });
    },
    onMutate: () => setError(null),
    onSuccess: (updated) => {
      queryClient.setQueryData(["voice-call", call.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["opportunity", call.opportunity_id] });
      toast.success(changed ? "Corrections saved" : "Call marked as reviewed");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const keys = Object.keys(values);
  const canReview = reviewableStatuses.includes(call.status);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-4 text-primary" />Review</CardTitle>
        <CardDescription>Details extracted by the voice agent stay unconfirmed until you review them.</CardDescription>
        <CardAction>
          <StatusPill tone={call.review_status === "needs_review" ? "warning" : "success"}>{reviewLabels[call.review_status] || call.review_status}</StatusPill>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canReview ? (
          <p className="text-sm text-muted-foreground">You can review this call once it has finished.</p>
        ) : (
          <>
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">The agent didn't extract any details from this call.</p>
            ) : (
              keys.map((key) => {
                const multiline = typeof call.extracted_fields[key] !== "string" || values[key].length > 80;
                const id = `extracted-${key}`;
                return (
                  <Field key={key}>
                    <FieldLabel htmlFor={id} className="capitalize">{key.replace(/_/g, " ")}</FieldLabel>
                    {multiline ? (
                      <Textarea id={id} rows={3} className="font-mono text-xs" value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
                    ) : (
                      <Input id={id} value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
                    )}
                  </Field>
                );
              })
            )}
            {error ? <ErrorAlert message={error} /> : null}
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? <Spinner /> : null}
              {changed ? "Save corrections" : "Mark as reviewed"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecordingPlayer({ callId }: { callId: string }) {
  const query = useQuery({ queryKey: ["voice-call-recording", callId], queryFn: () => getVoiceCallRecording(callId) });
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const nextSource = URL.createObjectURL(query.data);
    setSource(nextSource);
    return () => URL.revokeObjectURL(nextSource);
  }, [query.data]);

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading recording…</p>;
  if (query.error) return <ErrorAlert message={errorMessage(query.error, "The recording could not be loaded.")} />;
  if (!source) return null;
  return (
    <section>
      <p className="mb-2 flex items-center gap-2 font-medium"><Headphones className="size-4 text-primary" />Recording</p>
      <audio className="w-full" controls preload="metadata" src={source}>Your browser does not support audio playback.</audio>
    </section>
  );
}

function ResultUnavailable({ icon, label, message }: { icon: ReactNode; label: string; message: string }) {
  return <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-muted-foreground">{icon}<div><p className="font-medium text-foreground">{label}</p><p className="mt-0.5">{message}</p></div></div>;
}
