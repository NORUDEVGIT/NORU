import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { NightAuditChrome } from "@/packages/pms/components/nightaudit/night-audit-chrome";
import { NightAuditDesk } from "@/packages/pms/components/nightaudit/night-audit-desk";
import {
  closeBusinessDate,
  getNightAuditRun,
  listNightAuditRuns,
  getNightAuditAccess,
  runNightAudit,
} from "@/packages/pms/lib/nightaudit.functions";
import { formatNa1Date } from "@/packages/pms/lib/na1";
import {
  nightAuditSearch,
  resolveNightAuditTab,
  type NightAuditTabId,
} from "@/packages/pms/lib/night-audit-shell";
import { PROPERTY_BUSINESS_DATE_KEY } from "@/packages/pms/lib/use-property-business-date";
import { useRestaurantTime } from "@/core/state/property-format";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export function NightAuditWorkspace({
  membership,
  initialTab,
  initialRunId,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  initialRunId?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
  const tab = resolveNightAuditTab(initialTab);
  const [phone, setPhone] = useState(false);
  const [note, setNote] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = useState("");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (initialTab === tab && (tab !== "history" || !initialRunId || initialRunId.length > 0)) return;
    void navigate({
      to: "/restaurant/pms/night-audit",
      search: nightAuditSearch(tab, initialRunId),
      replace: true,
    });
  }, [initialRunId, initialTab, navigate, tab]);

  const fetchAccess = useServerFn(getNightAuditAccess);
  const run = useServerFn(runNightAudit);
  const history = useServerFn(listNightAuditRuns);
  const close = useServerFn(closeBusinessDate);
  const fetchRun = useServerFn(getNightAuditRun);

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
  const runQuery = useQuery({
    queryKey: ["night-audit-run", restaurantId, initialRunId],
    queryFn: () => fetchRun({ data: { restaurantId, runId: initialRunId ?? "" } }),
    enabled: tab === "history" && Boolean(initialRunId),
    retry: false,
  });

  function go(next: NightAuditTabId, runId?: string | null) {
    void navigate({
      to: "/restaurant/pms/night-audit",
      search: nightAuditSearch(next, runId),
    });
  }

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["night-audit", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["night-audit-history", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["night-audit-run", restaurantId] });
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
    onError: (error: Error) => {
      setCloseError(error.message);
      toast.error(error.message);
    },
  });

  if (auditQuery.isLoading) return <p className="text-sm text-muted-foreground">Running night audit…</p>;
  if (auditQuery.isError) return <p className="text-sm text-destructive">{(auditQuery.error as Error).message}</p>;
  const state = auditQuery.data;
  if (!state) return null;

  const closed = state.run.status === "closed";

  return (
    <NightAuditChrome
      membership={membership}
      active={tab}
      onNavigate={(id) => go(id)}
      onSearch={setModuleSearch}
    >
      <NightAuditDesk
        tab={tab}
        businessDate={state.businessDate}
        blockers={state.blockers}
        warningCount={state.warningCount}
        closed={closed}
        role={role}
        phone={phone}
        busy={closeMutation.isPending}
        note={note}
        closeError={closeError}
        onNoteChange={setNote}
        onConfirm={() => closeMutation.mutate(state.run.id)}
        runs={historyQuery.data ?? []}
        selectedRunId={initialRunId ?? null}
        runDetail={runQuery.data ?? null}
        runDetailLoading={runQuery.isLoading && Boolean(initialRunId)}
        dateTime={dateTime}
        moduleSearch={moduleSearch}
        onSelectRun={(runId) => go("history", runId || null)}
      />
    </NightAuditChrome>
  );
}
