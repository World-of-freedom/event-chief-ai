import { CalendarDays, Plus } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { EventFormDialog } from "@/features/events/EventFormDialog";

export function NoEventsState({ description }: { description: string }) {
  return (
    <EmptyState
      icon={<CalendarDays />}
      title="Create an event first"
      description={description}
      action={
        <EventFormDialog
          trigger={
            <Button>
              <Plus />
              New event
            </Button>
          }
        />
      }
    />
  );
}
