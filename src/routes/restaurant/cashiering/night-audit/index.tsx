import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  ChecklistPanel,
  ExceptionsPanel,
  NoShowPanel,
  RevenuePanel,
  RunStatusBadge,
  ShiftsPanel,
} from "@/components/nightaudit/night-audit-panels";
import {
  closeBusinessDate,
  listNightAuditRuns,
  getNightAuditAccess,
  runNightAudit,
  updateException,
} from "@/lib/nightaudit.functions";
import { markNoShow } from "@/lib/frontoffice.functions";
import { formatStayDate } from "@/lib/reservation-dates";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/cashiering/night-audit/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/cashiering/night-audit" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Night Audit & Day Close — NORU" },
      {
        name: "description",
        content: "Run the nightly operational close: checklist, exceptions, no-shows, shifts and revenue.",
      },
      { property: "og:title", content: "Night Audit & Day Close — NORU" },
      { property: "og:description", content: "End-of-day close for your NORU property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <RestaurantShell active="Night Audit">{(m) => <NightAuditPage membership={m} />}</RestaurantShell>,
});

function NightAuditPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const queryClient = useQueryClient();
  const money = useMoney();
  const { dateTime } = useRestaurantTime();

  const fetchAccess = useServerFn(getNightAuditAccess);
  const run = useServerFn(runNightAudit);
  const history = useServerFn(listNightAuditRuns);
  const resolve = useServerFn(updateException);
  const noShow = useServerFn(markNoShow);
  const close = useServerFn(closeBusinessDate);

  const accessQuery = useQuery({
    queryKey: ["night-audit-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage === true;

  const auditQuery = useQuery({
    queryKey: ["night-audit", restaurantId],
    queryFn: () => run({ data: { restaurantId } }),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["night-audit-history", restaurantId],
    queryFn: () => history({ data: { restaurantId } }),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["night-audit", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["night-audit-history", restaurantId] });
  };

  const exceptionMutation = useMutation({
    mutationFn: (v: { exceptionId: string; action: "resolve" | "ignore" }) =>
      resolve({ data: { restaurantId, ...v } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Exception updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const noShowMutation = useMutation({
    mutationFn: (reservationId: string) =>
      noShow({ data: { restaurantId, reservationId, today: auditQuery.data?.businessDate ?? "" } }),
    onSuccess: () => {
      toast.success("Reservation marked as no-show.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMutation = useMutation({
    mutationFn: (runId: string) => close({ data: { restaurantId, runId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        result.alreadyClosed
          ? `${formatStayDate(result.businessDate)} was already closed.`
          : `Business date ${formatStayDate(result.businessDate)} closed. Now on ${formatStayDate(result.nextBusinessDate)}.`,
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (auditQuery.isLoading) return <p className="text-sm text-muted-foreground">Running night audit…</p>;
  if (auditQuery.isError) return <p className="text-sm text-destructive">{(auditQuery.error as Error).message}</p>;
  const state = auditQuery.data;
  if (!state) return null;

  const closed = state.run.status === "closed";
  const busy = exceptionMutation.isPending || noShowMutation.isPending || closeMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Night Audit</h1>
          <p className="text-sm text-muted-foreground">End-of-day close for {membership.restaurant.name}.</p>
          <p className="mt-2 text-3xl font-semibold">{formatStayDate(state.businessDate)}</p>
          <p className="text-xs text-muted-foreground">Current business date</p>
        </div>
        <div className="flex items-center gap-2">
          <RunStatusBadge status={state.run.status} />
          <Button variant="outline" disabled={auditQuery.isFetching} onClick={() => refresh()}>
            {auditQuery.isFetching ? "Refreshing…" : "Run / refresh audit"}
          </Button>
          {canManage ? (
          <Button
            disabled={!state.canClose || busy || closed}
            onClick={() => closeMutation.mutate(state.run.id)}
          >
            Close business date
          </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Blocking exceptions</p>
          <p className="text-2xl font-semibold">{state.blockingCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Warnings</p>
          <p className="text-2xl font-semibold">{state.warningCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Audit started</p>
          <p className="text-sm font-medium">{dateTime(state.run.startedAt)}</p>
          <p className="text-xs text-muted-foreground">{state.run.startedBy ?? "—"}</p>
        </div>
      </div>

      {closed ? (
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          This business date is closed and read-only. Closed by {state.run.closedBy ?? "—"} on{" "}
          {dateTime(state.run.closedAt)}.
        </p>
      ) : null}

      <ChecklistPanel checks={state.checks} />
      <ExceptionsPanel
        exceptions={state.exceptions}
        busy={busy}
        readOnly={!canManage}
        onUpdate={(exceptionId, action) => exceptionMutation.mutate({ exceptionId, action })}
      />
      <NoShowPanel state={state} readOnly={!canManage} busy={busy} onNoShow={(id) => noShowMutation.mutate(id)} />
      <ShiftsPanel state={state} />
      <RevenuePanel state={state} />

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg">History</h2>
        {historyQuery.data && historyQuery.data.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Business date</th>
                  <th>Status</th>
                  <th>Started by</th>
                  <th>Closed by</th>
                  <th>Closed at</th>
                  <th className="text-right">Room revenue</th>
                  <th className="text-right">Payments</th>
                  <th className="text-right">Refunds</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historyQuery.data.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2">{formatStayDate(r.businessDate)}</td>
                    <td className="capitalize">{r.status}</td>
                    <td>{r.startedBy ?? "—"}</td>
                    <td>{r.closedBy ?? "—"}</td>
                    <td>{r.closedAt ? dateTime(r.closedAt) : "—"}</td>
                    <td className="text-right">{r.summary ? money(r.summary.finance.roomRevenue) : "—"}</td>
                    <td className="text-right">{r.summary ? money(r.summary.finance.payments) : "—"}</td>
                    <td className="text-right">{r.summary ? money(r.summary.finance.refunds) : "—"}</td>
                    <td className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/restaurant/cashiering/night-audit/$runId" params={{ runId: r.id }}>
                          View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No audit history yet.</p>
        )}
      </section>
    </div>
  );
}
