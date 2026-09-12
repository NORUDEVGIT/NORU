import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { Button } from "@/shared/components/ui/button";
import { NaCloseSummary, NaStatusChip } from "@/packages/pms/components/nightaudit/na1-panels";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { getNightAuditRun } from "@/packages/pms/lib/nightaudit.functions";
import { formatNa1Date } from "@/packages/pms/lib/na1";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
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
      { name: "description", content: "Read-only night audit summary for a closed business date." },
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

  const { run } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{formatNa1Date(run.businessDate)}</h1>
          <p className="text-sm text-muted-foreground">
            Started by {run.startedBy ?? "—"} · {run.closedAt ? `closed ${dateTime(run.closedAt)}` : "not closed"}
            {run.closedBy ? ` by ${run.closedBy}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NaStatusChip status={run.status === "closed" ? "closed" : "open"} />
          <Button asChild variant="outline">
            <Link to="/restaurant/pms/night-audit">Back to Night Audit</Link>
          </Button>
        </div>
      </div>

      <NaCloseSummary run={run} />
    </div>
  );
}
