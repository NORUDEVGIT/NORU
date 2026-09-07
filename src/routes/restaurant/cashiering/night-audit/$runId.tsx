import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/packages/pms/components/bookings/reservation-bits";
import { CheckBadge, RunStatusBadge } from "@/packages/pms/components/nightaudit/night-audit-panels";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { getNightAuditRun } from "@/packages/pms/lib/nightaudit.functions";
import { formatStayDate } from "@/packages/pms/lib/reservation-dates";
import { useMoney, useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/cashiering/night-audit/$runId")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/cashiering/night-audit" } });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Closed Business Date — NORU" },
      { name: "description", content: "Read-only night audit summary and exceptions for a closed business date." },
      { property: "og:title", content: "Closed Business Date — NORU" },
      { property: "og:description", content: "Historical night audit record in NORU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <RestaurantShell active="Night Audit">{(m) => <RunDetail membership={m} />}</RestaurantShell>,
});

function RunDetail({ membership }: { membership: RestaurantMembership }) {
  const { runId } = Route.useParams();
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const fetchRun = useServerFn(getNightAuditRun);

  const query = useQuery({
    queryKey: ["night-audit-run", restaurantId, runId],
    queryFn: () => fetchRun({ data: { restaurantId, runId } }),
    retry: false,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading audit…</p>;
  if (query.isError) return <p className="text-sm text-destructive">{(query.error as Error).message}</p>;
  const data = query.data;
  if (!data) return <p className="text-sm text-muted-foreground">Audit run not found.</p>;

  const { run, exceptions } = data;
  const finance = run.summary?.finance;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{formatStayDate(run.businessDate)}</h1>
          <p className="text-sm text-muted-foreground">
            Started by {run.startedBy ?? "—"} · {run.closedAt ? `closed ${dateTime(run.closedAt)}` : "not closed"}
            {run.closedBy ? ` by ${run.closedBy}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RunStatusBadge status={run.status} />
          <Button asChild variant="outline">
            <Link to="/restaurant/cashiering/night-audit">Back to Night Audit</Link>
          </Button>
        </div>
      </div>

      {finance ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Room revenue" value={money(finance.roomRevenue)} />
          <StatCard label="Other charges" value={money(finance.otherCharges)} />
          <StatCard label="Payments" value={money(finance.payments)} />
          <StatCard label="Deposits" value={money(finance.deposits)} />
          <StatCard label="Refunds" value={money(finance.refunds)} />
          <StatCard label="Discounts" value={money(finance.discounts)} />
          <StatCard label="Adjustments" value={money(finance.adjustments)} />
          <StatCard label="Warnings" value={run.summary?.warnings ?? 0} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No stored summary for this run.</p>
      )}

      {run.summary?.checks?.length ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg">Checklist at close</h2>
          <ul className="mt-3 divide-y divide-border">
            {run.summary.checks.map((c) => (
              <li key={c.area} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{c.area}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
                <CheckBadge status={c.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg">Exceptions</h2>
        {exceptions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No exceptions were raised.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {exceptions.map((e) => (
              <li key={e.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={e.severity === "blocking" ? "destructive" : "secondary"}>{e.severity}</Badge>
                  <Badge variant="outline" className="capitalize">
                    {e.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{e.message}</p>
                {e.resolutionNote ? (
                  <p className="text-xs text-muted-foreground">{e.resolutionNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
