import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getVoiceCallPreferences, saveVoiceCallPreferences } from "@/lib/api/sponsorship";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function VoicePreferencesPage() {
  const query = useQuery({ queryKey: ["voice-preferences"], queryFn: getVoiceCallPreferences });
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("22:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  useEffect(() => {
    if (!query.data) return;
    setStart(query.data.calling_window_start.slice(0, 5));
    setEnd(query.data.calling_window_end.slice(0, 5));
    setTimezone(query.data.timezone);
    setWeekdays(query.data.allowed_weekdays);
  }, [query.data]);
  const mutation = useMutation({
    mutationFn: () => saveVoiceCallPreferences({ calling_window_start: start, calling_window_end: end, timezone, allowed_weekdays: weekdays }),
    onSuccess: () => toast.success("Voice AI preferences saved"),
  });
  if (query.isLoading) return <LoadingState label="Loading voice preferences…" />;
  return (
    <>
      <PageHeader title="Voice AI preferences" description="Queued sponsor calls run only during these organizer-local hours." />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="size-4 text-primary" />Calling schedule</CardTitle><CardDescription>Default: 9:00 AM–10:00 PM, every day, Asia/Kolkata.</CardDescription></CardHeader>
        <CardContent>
          <FieldGroup className="gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="voice-start">Calling starts</FieldLabel><Input id="voice-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
              <Field><FieldLabel htmlFor="voice-end">Calling ends</FieldLabel><Input id="voice-end" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
            </div>
            <Field><FieldLabel htmlFor="voice-timezone">Timezone</FieldLabel><Input id="voice-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Asia/Kolkata" /></Field>
            <Field><FieldLabel>Days calls are permitted</FieldLabel><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{days.map((day, index) => { const value = index + 1; return <label key={day} className="flex items-center gap-2 text-sm"><Checkbox checked={weekdays.includes(value)} onCheckedChange={(checked) => setWeekdays((current) => checked ? [...new Set([...current, value])].sort() : current.filter((item) => item !== value))} />{day}</label>; })}</div></Field>
            {mutation.error ? <ErrorAlert message={errorMessage(mutation.error)} /> : null}
            <Button className="w-fit" disabled={mutation.isPending || !weekdays.length} onClick={() => mutation.mutate()}>Save preferences</Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </>
  );
}
