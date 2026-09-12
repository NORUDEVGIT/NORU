import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  NaBlockerBoard,
  NaClosePanel,
  NaCloseSummary,
  NaHistoryList,
  NaStatusChip,
} from "@/packages/pms/components/nightaudit/na1-panels";
import {
  closeBusinessDate,
  listNightAuditRuns,
  getNightAuditAccess,
  runNightAudit,
} from "@/packages/pms/lib/nightaudit.functions";
import { NA1_TITLE, formatNa1Date, workspaceStatus } from "@/packages/pms/lib/na1";
import { PROPERTY_BUSINESS_DATE_KEY } from "@/packages/pms/lib/use-property-business-date";
import { useRestaurantTime } from "@/packages/restaurant-management/state/restaurant-context";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading } from "@/core/state/pms-context";

export function NightAuditWorkspace({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
  const [phone, setPhone] = useState(false);
  const [note, setNote] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<"history" | "summary">("history");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const fetchAccess = useServerFn(getNightAuditAccess);
  const run = useServerFn(runNightAudit);
  const history = useServerFn(listNightAuditRuns);
  const close = useServerFn(closeBusinessDate);

  const accessQuery = useQuery({
    queryKey: ["night-audit-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const role = accessQuery.data?.role ?? membership.role;

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
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: [PROPERTY_BUSINESS_DATE_KEY, restaurantId] });
  };

  const closeMutation = useMutation({
    mutationFn: (runId: string) =>
      close({ data: { restaurantId, runId, ...(note.trim() ? { notes: note.trim() } : {}) } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setCloseError(result.message);
        toast.error(result.message);
        return;
      }
      setCloseError(null);
      setNote("");
      toast.success(
        result.alreadyClosed
          ? `${formatNa1Date(result.businessDate)} was already closed.`
          : `Business date ${formatNa1Date(result.businessDate)} closed. Now on ${formatNa1Date(result.nextBusinessDate)}.`,
      );
      refresh();
    },
    onError: (e: Error) => {
      setCloseError(e.message);
      toast.error(e.message);
    },
  });

  if (auditQuery.isLoading) return <p className="text-sm text-muted-foreground">Running night audit…</p>;
  if (auditQuery.isError) return <p className="text-sm text-destructive">{(auditQuery.error as Error).message}</p>;
  const state = auditQuery.data;
  if (!state) return null;

  const closed = state.run.status === "closed";
  const status = workspaceStatus({
    closed,
    inProgress: closeMutation.isPending,
    rows: state.blockers,
  });
  const latestClosed =
    historyQuery.data?.find((row) => row.status === "closed") ?? (closed ? state.run : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-[#251605]">
            <PageHeading fallback={NA1_TITLE} />
          </h1>
          <p className="mt-2 text-3xl font-semibold">{formatNa1Date(state.businessDate)}</p>
          <p className="text-xs text-muted-foreground">Property business date</p>
          {state.lastClosed ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Last closed {formatNa1Date(state.lastClosed.previousBusinessDate)} →{" "}
              {formatNa1Date(state.lastClosed.nextBusinessDate)}
              {state.lastClosed.who ? ` · ${state.lastClosed.who}` : ""}
              {state.lastClosed.when ? ` · ${dateTime(state.lastClosed.when)}` : ""}
            </p>
          ) : null}
        </div>
        <NaStatusChip status={status} />
      </div>

      <div className="hidden gap-6 md:grid md:grid-cols-[minmax(0,1fr)_340px]">
        <NaBlockerBoard rows={state.blockers} />
        <NaClosePanel
          businessDate={state.businessDate}
          rows={state.blockers}
          role={role}
          phone={false}
          closed={closed}
          busy={closeMutation.isPending}
          note={note}
          onNoteChange={setNote}
          onConfirm={() => closeMutation.mutate(state.run.id)}
          error={closeError}
        />
      </div>

      <div className="space-y-4 md:hidden">
        <NaBlockerBoard rows={state.blockers} readOnly />
        <NaClosePanel
          businessDate={state.businessDate}
          rows={state.blockers}
          role={role}
          phone
          closed={closed}
          busy={false}
          note=""
          onNoteChange={() => undefined}
          onConfirm={() => undefined}
          error={null}
        />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${historyTab === "history" ? "bg-muted font-medium" : "text-muted-foreground"}`}
            onClick={() => setHistoryTab("history")}
          >
            History
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${historyTab === "summary" ? "bg-muted font-medium" : "text-muted-foreground"}`}
            onClick={() => setHistoryTab("summary")}
          >
            Summary
          </button>
        </div>
        {historyTab === "history" ? (
          <NaHistoryList runs={historyQuery.data ?? []} />
        ) : (
          <div className="mt-4">
            <NaCloseSummary run={latestClosed} lastClosed={state.lastClosed} />
          </div>
        )}
      </section>
    </div>
  );
}
