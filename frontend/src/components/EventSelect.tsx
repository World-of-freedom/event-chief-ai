import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EventRecord } from "@/types/sponsorship";

const ALL = "__all__";

interface EventSelectProps {
  events: EventRecord[];
  value: string | null;
  onChange: (eventId: string | null) => void;
  /** Adds an empty option (value null), labelled "All events" unless allLabel is given. */
  allowAll?: boolean;
  allLabel?: string;
  id?: string;
  className?: string;
}

export function EventSelect({ events, value, onChange, allowAll = false, allLabel = "All events", id, className }: EventSelectProps) {
  return (
    <Select value={value ?? (allowAll ? ALL : undefined)} onValueChange={(next) => onChange(next === ALL ? null : next)}>
      <SelectTrigger id={id} className={className ?? "w-full sm:w-72"} aria-label="Event">
        <SelectValue placeholder="Choose an event" />
      </SelectTrigger>
      <SelectContent>
        {allowAll ? <SelectItem value={ALL}>{allLabel}</SelectItem> : null}
        {events.map((event) => (
          <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
