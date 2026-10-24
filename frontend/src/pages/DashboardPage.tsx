import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardCheck, Gift, PhoneCall, Wallet, Workflow } from "lucide-react";
import { Link } from "react-router-dom";

import { ErrorAlert, errorMessage } from "@/components/ErrorAlert";
import { EventSelect } from "@/components/EventSelect";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { NoEventsState } from "@/features/events/NoEventsState";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useActiveEvent } from "@/hooks/use-active-event";
import { getDashboard } from "@/lib/api/sponsorship";
import {
  formatDateTime,
  formatMoney,
  needCategoryLabels,
  needStatusLabels,
  offerStatusLabels,
  opportunityStatusLabels,
  opportunityStatusOrder,
  opportunityTone,
} from "@/lib/format";
import type { Dashboard } from "@/types/sponsorship";

export function DashboardPage() {
  const { events, isLoading, error, activeEvent, activeEventId, setActiveEventId } = useActiveEvent();
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", activeEventId],
    queryFn: () => getDashboard(activeEventId!),
    enabled: !!activeEventId,
  });
  const data = dashboardQuery.data;

  return (
    <>
      <PageHeader
        title="Sponsorship dashboard"
        description="Funding needs, secured support, pipeline health and follow-ups for one event."
        actions={events.length ? <EventSelect events={events} value={activeEventId} onChange={setActiveEventId} /> : null}
      />

      {error ? <ErrorAlert message={errorMessage(error, "Could not load events.")} /> : null}
      {dashboardQuery.error ? <ErrorAlert message={errorMessage(dashboardQuery.error, "Could not load the dashboard.")} /> : null}

      {isLoading || dashboardQuery.isLoading ? (
        <LoadingState label="Loading dashboard…" />
      ) : !activeEvent ? (
        error ? null : <NoEventsState description="The dashboard summarizes one event. Create an event, add its needs, then track sponsors in the pipeline." />
      ) : data ? (
        <div className="space-y-6">
          <CashCard data={data} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Gift className="size-4 text-primary" />In-kind support</CardTitle>
                <CardDescription>Shown separately; it never reduces the cash gap.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Secured</p>
                  {data.in_kind_secured.length === 0 ? (
                    <p className="text-muted-foreground">No accepted in-kind offers yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {data.in_kind_secured.map((offer) => (
                        <li key={offer.id} className="flex items-center justify-between gap-3 py-2">
                          <Link to={`/pipeline/${offer.opportunity_id}`} className="min-w-0 hover:underline">
                            <span className="font-medium">{offer.company_name}</span>
                            <span className="text-muted-foreground"> · {needCategoryLabels[offer.support_type]}</span>
                          </Link>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-muted-foreground">
                              {offer.stated_value ? formatMoney(offer.stated_value, offer.currency) : offer.quantity ? `${offer.quantity} units` : "Value unknown"}
                            </span>
                            <StatusPill tone="success">{offerStatusLabels[offer.status]}</StatusPill>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Still open</p>
                  {data.open_in_kind_needs.length === 0 ? (
                    <p className="text-muted-foreground">No open in-kind needs.</p>
                  ) : (
                    <ul className="divide-y">
                      {data.open_in_kind_needs.map((need) => (
                        <li key={need.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{need.title}</span>
                            <span className="text-muted-foreground"> · {needCategoryLabels[need.category]}</span>
                          </span>
                          <span className="shrink-0 text-muted-foreground">{needStatusLabels[need.status]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Workflow className="size-4 text-primary" />Pipeline</CardTitle>
                <CardDescription>Opportunities for this event by status.</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm"><Link to={`/pipeline?event=${activeEvent.id}`}>Open<ArrowRight /></Link></Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {Object.keys(data.opportunities_by_status).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sponsors in the pipeline yet. Add one from Sponsor discovery or the Pipeline page.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {opportunityStatusOrder
                      .filter((status) => data.opportunities_by_status[status])
                      .map((status) => (
                        <li key={status}>
                          <StatusPill tone={opportunityTone(status)} className="h-6 px-2.5">
                            {opportunityStatusLabels[status]} · {data.opportunities_by_status[status]}
                          </StatusPill>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-4 text-primary" />Follow-ups</CardTitle>
                <CardAction>
                  <Button asChild variant="ghost" size="sm"><Link to={`/follow-ups?event=${activeEvent.id}`}>Open<ArrowRight /></Link></Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex gap-8">
                <div>
                  <div className="text-3xl font-semibold tabular-nums">{data.open_task_count}</div>
                  <div className="text-xs text-muted-foreground">Open</div>
                </div>
                <div>
                  <div className={data.overdue_task_count ? "text-3xl font-semibold text-destructive tabular-nums" : "text-3xl font-semibold tabular-nums"}>
                    {data.overdue_task_count}
                  </div>
                  <div className="text-xs text-muted-foreground">Overdue</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><PhoneCall className="size-4 text-primary" />Recent calls</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {data.recent_calls.length === 0 ? (
                  <p className="text-muted-foreground">No calls yet. Calling is not set up in this version.</p>
                ) : (
                  <ul className="divide-y">
                    {data.recent_calls.map((call) => (
                      <li key={call.id} className="flex justify-between gap-3 py-2">
                        <Link to={`/pipeline/${call.opportunity_id}`} className="font-medium hover:underline">{call.company_name}</Link>
                        <span className="text-muted-foreground">{call.status} · {formatDateTime(call.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CashCard({ data }: { data: Dashboard }) {
  const { cash } = data;
  const target = Number(cash.target);
  const secured = Number(cash.secured);
  const percent = target > 0 ? Math.min(100, Math.round((secured / target) * 100)) : 0;
  const notes: string[] = [];
  if (cash.pending_offer_count) notes.push(`${cash.pending_offer_count} cash offer${cash.pending_offer_count === 1 ? "" : "s"} pending review (not counted)`);
  if (cash.unknown_value_secured_count) notes.push(`${cash.unknown_value_secured_count} accepted with unknown amount (not counted)`);
  if (cash.other_currency_count) notes.push(`${cash.other_currency_count} in another currency (not counted)`);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-primary" />Cash</CardTitle>
        <CardDescription>Only offers you've accepted or marked fulfilled count as secured.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {target === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cash target yet. <Link className="text-primary hover:underline" to="/needs">Add a cash need</Link> to track the gap.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Target" value={formatMoney(cash.target, cash.currency)} />
          <Stat label="Accepted" value={formatMoney(cash.accepted, cash.currency)} />
          <Stat label="Fulfilled" value={formatMoney(cash.fulfilled, cash.currency)} />
          <Stat label="Remaining gap" value={formatMoney(cash.gap, cash.currency)} emphasis />
        </div>
        {target > 0 ? (
          <div className="space-y-1.5">
            <Progress value={percent} className="h-2" aria-label={`${percent}% of the cash target secured`} />
            <p className="text-xs text-muted-foreground">{percent}% of the cash target secured</p>
          </div>
        ) : null}
        {notes.length ? <p className="text-xs text-muted-foreground">{notes.join(" · ")}</p> : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={emphasis ? "mt-1 text-2xl font-semibold tracking-tight text-primary tabular-nums" : "mt-1 text-2xl font-semibold tracking-tight tabular-nums"}>{value}</div>
    </div>
  );
}
