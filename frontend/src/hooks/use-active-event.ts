import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { listEvents } from "@/lib/api/sponsorship";

const storageKey = "event-chief-active-event";

function readStored(): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/**
 * The event a page is focused on. A `?event=<id>` link wins; otherwise the last
 * choice is remembered per browser, falling back to the first event.
 */
export function useActiveEvent() {
  const eventsQuery = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("event") ?? readStored());
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  const activeEvent = events.find((event) => event.id === selectedId) ?? events[0] ?? null;

  useEffect(() => {
    if (!activeEvent) return;
    try {
      localStorage.setItem(storageKey, activeEvent.id);
    } catch {
      // Remembering the choice is a convenience only.
    }
  }, [activeEvent]);

  const setActiveEventId = useCallback(
    (eventId: string | null) => {
      setSelectedId(eventId);
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          if (eventId) next.set("event", eventId);
          else next.delete("event");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    events,
    isLoading: eventsQuery.isLoading,
    error: eventsQuery.error,
    activeEvent,
    activeEventId: activeEvent?.id ?? null,
    setActiveEventId,
  };
}
