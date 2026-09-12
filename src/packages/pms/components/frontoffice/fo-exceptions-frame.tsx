import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { ComingSoonChip, PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  EXCEPTION_EMPTY_COPY,
  deriveExceptionRows,
  exceptionBadgeCount,
  exceptionHighCount,
  type ExceptionCtaId,
  type ExceptionRow,
  type FolioSignalLane,
} from "@/packages/pms/lib/fo-exceptions";
import { listFoStaySignals } from "@/packages/pms/lib/fo-exceptions.functions";
import { FO_BRAND, isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import {
  getFrontOfficeDashboard,
  listArrivals,
  listDepartures,
  listInHouse,
  listOccupancy,
  type FrontOfficeStay,
} from "@/packages/pms/lib/frontoffice.functions";

export function useFoExceptionDesk(restaurantId: string, today: string, enabled = true) {
  const fetchArrivals = useServerFn(listArrivals);
  const fetchInHouse = useServerFn(listInHouse);
  const fetchDepartures = useServerFn(listDepartures);
  const fetchOccupancy = useServerFn(listOccupancy);
  const fetchSignals = useServerFn(listFoStaySignals);
  const fetchDashboard = useServerFn(getFrontOfficeDashboard);

  const arrivalsQuery = useQuery({
    queryKey: ["front-office", "arrivals", restaurantId, today, "all", "all"],
    queryFn: () => fetchArrivals({ data: { restaurantId, date: today } }),
    retry: false,
    enabled,
  });
  const inHouseQuery = useQuery({
    queryKey: ["front-office", "in-house", restaurantId, today, ""],
    queryFn: () => fetchInHouse({ data: { restaurantId, today } }),
    retry: false,
    enabled,
  });
  const departuresQuery = useQuery({
    queryKey: ["front-office", "departures", restaurantId, today],
    queryFn: () => fetchDepartures({ data: { restaurantId, date: today } }),
    retry: false,
    enabled,
  });
  const occupancyQuery = useQuery({
    queryKey: ["front-office", "occupancy", restaurantId],
    queryFn: () => fetchOccupancy({ data: { restaurantId } }),
    retry: false,
    enabled,
  });
  const dashboardQuery = useQuery({
    queryKey: ["front-office", "dashboard", restaurantId, today],
    queryFn: () => fetchDashboard({ data: { restaurantId, today } }),
    retry: false,
    enabled,
  });

  const stayIds = useMemo(() => {
    const ids = new Set<string>();
    for (const stay of [...(arrivalsQuery.data ?? []), ...(inHouseQuery.data ?? []), ...(departuresQuery.data ?? [])]) {
      ids.add(stay.id);
    }
    return [...ids];
  }, [arrivalsQuery.data, inHouseQuery.data, departuresQuery.data]);

  const signalsQuery = useQuery({
    queryKey: ["front-office", "stay-signals", restaurantId, stayIds.join(",")],
    queryFn: () => fetchSignals({ data: { restaurantId, reservationIds: stayIds } }),
    enabled:
      enabled &&
      (stayIds.length > 0 || (!arrivalsQuery.isLoading && !inHouseQuery.isLoading && !departuresQuery.isLoading)),
    retry: false,
  });

  const queries = [arrivalsQuery, inHouseQuery, departuresQuery, occupancyQuery];
  const denied =
    queries.find((q) => q.isError && isPermissionDeniedMessage(q.error))?.error ??
    (signalsQuery.isError && isPermissionDeniedMessage(signalsQuery.error) ? signalsQuery.error : null);
  const failed = queries.some((q) => q.isError && !isPermissionDeniedMessage(q.error));
  const loading = queries.some((q) => q.isLoading);

  const folioLane: FolioSignalLane = failed
    ? "coming_soon"
    : (signalsQuery.data?.folioLane ?? (signalsQuery.isError ? "coming_soon" : "live"));

  const stayById = useMemo(() => {
    const map = new Map<string, FrontOfficeStay>();
    for (const stay of [...(arrivalsQuery.data ?? []), ...(inHouseQuery.data ?? []), ...(departuresQuery.data ?? [])]) {
      if (!map.has(stay.id)) map.set(stay.id, stay);
    }
    return map;
  }, [arrivalsQuery.data, inHouseQuery.data, departuresQuery.data]);

  const derived = useMemo(() => {
    if (failed || denied) return { rows: [] as ExceptionRow[], comingSoon: deriveExceptionRows({
      arrivals: [],
      inHouse: [],
      departures: [],
      rooms: [],
      folioLane,
      businessDate: today,
    }).comingSoon };
    return deriveExceptionRows({
      arrivals: arrivalsQuery.data ?? [],
      inHouse: inHouseQuery.data ?? [],
      departures: departuresQuery.data ?? [],
      rooms: (occupancyQuery.data ?? []).map((room) => ({ id: room.id, status: room.status })),
      folioLane,
      moneyByStay: signalsQuery.data?.byStay ?? {},
      businessDate: today,
    });
  }, [
    arrivalsQuery.data,
    inHouseQuery.data,
    departuresQuery.data,
    occupancyQuery.data,
    signalsQuery.data?.byStay,
    folioLane,
    today,
    failed,
    denied,
  ]);

  return {
    rows: derived.rows,
    comingSoon: derived.comingSoon,
    stayById,
    badgeCount: exceptionBadgeCount(derived.rows),
    highCount: exceptionHighCount(derived.rows),
    folioLane,
    denied,
    failed,
    loading,
    dashboard: dashboardQuery.data ?? null,
    occupancy: occupancyQuery.data ?? [],
  };
}

export function ExceptionsFrame({
  restaurantId,
  today,
  onAction,
  onOpenSheet,
  onFocusRack,
  onOpenRack,
  onOpenAudit,
}: {
  restaurantId: string;
  today: string;
  onAction: (cta: ExceptionCtaId, stay: FrontOfficeStay) => void;
  onOpenSheet: (stay: FrontOfficeStay) => void;
  onFocusRack: (stay: FrontOfficeStay) => void;
  onOpenRack: () => void;
  onOpenAudit: () => void;
}) {
  const desk = useFoExceptionDesk(restaurantId, today);

  if (desk.denied) {
    return (
      <PermissionDeniedPanel
        {...(desk.denied instanceof Error ? { message: desk.denied.message } : {})}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="fo-exceptions-queue">
      <div>
        <h2 className="font-display text-xl">Exceptions</h2>
        <p className="text-sm text-muted-foreground">
          Live rows only. The rail badge is this queue&apos;s count, including zero.
        </p>
      </div>

      {desk.loading ? (
        <p className="text-sm text-muted-foreground">Loading exceptions…</p>
      ) : desk.failed ? (
        <p className="text-sm text-muted-foreground">Exceptions are quiet until the live lists can be read.</p>
      ) : desk.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#CCCCCC] bg-card/60 px-6 py-10 text-center" data-testid="fo-exceptions-empty">
          <p className="text-sm font-medium text-[#251605]">{EXCEPTION_EMPTY_COPY}</p>
          <Button className="mt-3" variant="outline" onClick={onOpenRack}>
            Open Room Rack + Calendar
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {desk.rows.map((row) => {
            const stay = desk.stayById.get(row.stayId);
            return (
              <li
                key={row.id}
                data-testid="fo-exception-row"
                className="rounded-2xl border bg-card p-4"
                style={{
                  borderColor: row.severity === "high" ? FO_BRAND.gold : undefined,
                  backgroundColor: row.severity === "high" ? "#25160508" : undefined,
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[#251605]">{row.label}</span>
                      {row.severity === "high" ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide text-white"
                          style={{ backgroundColor: FO_BRAND.chrome }}
                        >
                          High
                        </span>
                      ) : null}
                      {row.waived ? (
                        <span className="rounded-full border border-[#C89933] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#251605]">
                          Waived
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm">{row.reason}</p>
                    <p className="mt-1 text-sm">
                      {row.guestName} · {row.confirmationNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.roomNumber ? `Room ${row.roomNumber}` : "Unassigned"} · {formatStayDate(row.arrivalDate)} →{" "}
                      {formatStayDate(row.departureDate)}
                      {row.ageDays != null ? ` · ${row.ageDays} day${row.ageDays === 1 ? "" : "s"} past departure` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!stay}
                      onClick={() => stay && onAction(row.primaryCta.id, stay)}
                    >
                      {row.primaryCta.label}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!stay}
                      onClick={() => stay && (row.secondary === "rack" ? onFocusRack(stay) : onOpenSheet(stay))}
                    >
                      {row.secondary === "rack" ? "Focus rack" : "Stay"}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {desk.folioLane === "permission_denied" ? (
        <PermissionDeniedPanel
          className="py-3"
          message="Payment issues are hidden — you don't have access to folios for this property."
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onOpenAudit}>
          FO activity
        </Button>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Not yet available
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 flex flex-wrap gap-2">
          {desk.comingSoon.map((item) => (
            <ComingSoonChip key={item.id} label={item.label} hint="Coming soon — no count is shown." />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
