import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BedDouble,
  CheckCircle2,
  ClipboardList,
  History,
  LayoutGrid,
  Menu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UserRound,
  Wrench,
} from "lucide-react";

import { getHousekeepingAccess, listRoomRack } from "@/packages/pms/lib/housekeeping.functions";
import {
  CleaningBoardTab,
  ExceptionsTab,
  HousekeepingHistoryTab,
  InspectionsTab,
  MaintenanceTab,
  RestrictionsTab,
} from "@/packages/pms/components/housekeeping/housekeeping-tabs";
import { HousekeepingBoardTab } from "@/packages/pms/components/housekeeping/housekeeping-board";
import { HousekeepingChrome } from "@/packages/pms/components/housekeeping/housekeeping-chrome";
import {
  HousekeepingShellProvider,
  type HousekeepingShellSlots,
} from "@/packages/pms/components/housekeeping/housekeeping-shell-slots";
import { HousekeepingRequestsTab } from "@/packages/pms/components/housekeeping/housekeeping-requests-tab";
import {
  firstVisibleHkArea,
  hkAreaPath,
  HK_AREA_ITEMS,
  resolveHkArea,
  visibleHkAreas,
  deriveHkBoardKpis,
  type HkAreaId,
  type HkResolvableAreaId,
} from "@/packages/pms/lib/housekeeping-shell";
import { invalidateFrontOfficeOwnerReads } from "@/packages/pms/lib/fo-freshness";
import { resolvePmsReturnTo } from "@/packages/pms/lib/cashiering-shell";
import { useRestaurantTimezone } from "@/core/state/property-format";
import { localDateInZone } from "@/shared/lib/property-time";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PageHeading } from "@/core/state/pms-context";
import { SHELL_ICON_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

const HK_BURGER_ICONS = {
  board: LayoutGrid,
  cleaning: Sparkles,
  inspections: ShieldCheck,
  requests: ClipboardList,
  maintenance: Wrench,
  exceptions: TriangleAlert,
  history: History,
} as const;

const KPI_CARDS = [
  { id: "dirty", label: "Dirty", key: "dirty" as const, icon: Sparkles, tone: "bg-rose-50 text-rose-700" },
  { id: "assigned", label: "Assigned", key: "assigned" as const, icon: UserRound, tone: "bg-amber-50 text-amber-800" },
  { id: "progress", label: "In Progress", key: "inProgress" as const, icon: RefreshCw, tone: "bg-sky-50 text-sky-700" },
  { id: "clean", label: "Clean", key: "clean" as const, icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" },
  { id: "inspected", label: "Inspected", key: "inspected" as const, icon: ShieldCheck, tone: "bg-violet-50 text-violet-700" },
  { id: "ready", label: "Ready", key: "ready" as const, icon: BedDouble, tone: "bg-teal-50 text-teal-700" },
] as const;

export function HousekeepingWorkspace({
  membership,
  initialTab,
  initialRoomId,
  fromLegacy = false,
  defaultArea,
  returnTo,
  returnToLabel,
}: {
  membership: RestaurantMembership;
  initialTab?: string | undefined;
  initialRoomId?: string | undefined;
  fromLegacy?: boolean;
  defaultArea?: HkResolvableAreaId;
  returnTo?: string | undefined;
  returnToLabel?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();
  const today = useMemo(() => localDateInZone(timezone), [timezone]);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPrevious, computedLabel, handleReturn } = resolvePmsReturnTo({
    returnTo,
    returnToLabel,
  });

  const fetchAccess = useServerFn(getHousekeepingAccess);
  const fetchRack = useServerFn(listRoomRack);
  const accessQuery = useQuery({
    queryKey: ["housekeeping-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const rackQuery = useQuery({
    queryKey: ["hk-rack", restaurantId, today],
    queryFn: () => fetchRack({ data: { restaurantId, today } }),
  });

  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [shellSlots, setShellSlots] = useState<HousekeepingShellSlots>({
    date: null,
    search: null,
    filter: null,
    export: null,
    view: null,
    cta: null,
  });
  const setDateSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.date === node ? current : { ...current, date: node }));
  }, []);
  const setSearchSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.search === node ? current : { ...current, search: node }));
  }, []);
  const setFilterSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.filter === node ? current : { ...current, filter: node }));
  }, []);
  const setExportSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.export === node ? current : { ...current, export: node }));
  }, []);
  const setViewSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.view === node ? current : { ...current, view: node }));
  }, []);
  const setCtaSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.cta === node ? current : { ...current, cta: node }));
  }, []);

  const requested = resolveHkArea(initialTab, { fromLegacy, defaultArea });
  const scope = accessQuery.data?.scope ?? "housekeeper";
  const area = accessQuery.data ? firstVisibleHkArea(scope, requested) : requested;
  const refreshing = useIsFetching({
    predicate: (query) => String(query.queryKey[0] ?? "").startsWith("hk-"),
  });
  const kpis = useMemo(() => deriveHkBoardKpis(rackQuery.data ?? []), [rackQuery.data]);

  useEffect(() => {
    if (!accessQuery.data) return;
    const extra = {
      ...(returnTo ? { returnTo } : {}),
      ...(returnToLabel ? { returnToLabel } : {}),
    };
    if (requested !== area) {
      const dest = hkAreaPath(area);
      void navigate({
        to: dest.to,
        search: (prev: Record<string, unknown>) => ({ ...prev, ...dest.search, ...extra }),
        replace: true,
      });
      return;
    }
    if (!initialTab) {
      const dest = hkAreaPath(area);
      void navigate({
        to: dest.to,
        search: (prev: Record<string, unknown>) => ({ ...prev, ...dest.search, ...extra }),
        replace: true,
      });
    }
  }, [accessQuery.data, area, requested, initialTab, navigate, returnTo, returnToLabel]);

  function goToArea(id: HkAreaId) {
    const dest = hkAreaPath(id);
    void navigate({
      to: dest.to,
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        ...dest.search,
        ...(returnTo ? { returnTo } : {}),
        ...(returnToLabel ? { returnToLabel } : {}),
      }),
      replace: true,
    });
  }

  function refreshHousekeeping() {
    for (const key of [
      "hk-dashboard",
      "hk-rack",
      "hk-tasks",
      "hk-inspections",
      "hk-discrepancies",
      "hk-exceptions",
      "hk-maintenance",
      "hk-history",
      "hk-staff",
      "hk-requests",
    ]) {
      void qc.invalidateQueries({ queryKey: [key, restaurantId] });
    }
    invalidateFrontOfficeOwnerReads(qc);
  }

  if (accessQuery.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading housekeeping…</p>;
  }
  if (!accessQuery.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">
          <PageHeading fallback="Housekeeping" />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to Housekeeping for this property.
        </p>
      </div>
    );
  }

  const props = { restaurantId, today };
  const visible = visibleHkAreas(scope);
  const burgerArea: HkAreaId = area === "restrictions" ? "board" : area;

  return (
    <HousekeepingChrome membership={membership}>
      <HousekeepingShellProvider value={shellSlots}>
        <div
          className="flex min-h-[calc(100vh-4rem)] flex-col gap-3 bg-[#F7F4EE] p-3 sm:p-4"
          data-testid="hk-desk"
        >
          <section
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
            aria-label="Housekeeping KPIs"
            data-testid="hk-kpi-strip"
          >
            {KPI_CARDS.map((card) => (
              <div
                key={card.id}
                className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 shadow-sm"
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", card.tone)}>
                  <card.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-[#756A5B]">{card.label}</p>
                  {rackQuery.isLoading ? (
                    <Skeleton className="mt-1 h-5 w-10" />
                  ) : (
                    <p className="font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]">
                      {kpis[card.key].toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section
            ref={setToolbarSlot}
            className="relative flex w-full min-w-0 items-center gap-1.5 rounded-lg border border-[#DDD4C5] bg-white py-1.5 pl-12 pr-2 shadow-sm"
            data-testid="hk-toolbar"
            data-area={area}
          >
            <HousekeepingBurger
              active={burgerArea}
              visible={visible}
              toolbarSlot={toolbarSlot}
              onSelect={goToArea}
            />
            <div ref={setDateSlot} className="shrink-0 empty:hidden" />
            <div ref={setSearchSlot} className="min-w-0 flex-1 overflow-hidden" />
            <div className="relative z-10 flex shrink-0 items-center gap-1.5">
              <div ref={setFilterSlot} className="shrink-0 empty:hidden" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={SHELL_ICON_BUTTON}
                onClick={refreshHousekeeping}
                aria-label="Refresh"
                title="Refresh"
                data-testid="hk-refresh"
              >
                <RefreshCw className={cn("size-4", refreshing > 0 && "animate-spin")} />
              </Button>
              <div ref={setExportSlot} className="shrink-0 empty:hidden" />
              <div ref={setViewSlot} className="shrink-0 empty:hidden" />
              <div ref={setCtaSlot} className="shrink-0 empty:hidden" />
              {hasPrevious ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReturn}
                  data-testid="hk-return-to-previous"
                  className="h-9 shrink-0 gap-1.5 border-[#DDD4C5] bg-white px-3 text-xs font-semibold text-[#5C5346] hover:bg-[#F7F4EE] hover:text-[#251605]"
                >
                  <ArrowLeft className="size-3.5 text-[#8A6A24]" />
                  {computedLabel}
                </Button>
              ) : null}
            </div>
          </section>

          <main className="min-w-0">
            {area === "board" ? (
              <HousekeepingBoardTab
                {...props}
                scope={scope}
                membershipId={accessQuery.data.membershipId}
                openRoomId={initialRoomId}
              />
            ) : null}
            {area === "cleaning" ? (
              <CleaningBoardTab {...props} scope={scope} membershipId={accessQuery.data.membershipId} />
            ) : null}
            {area === "inspections" ? <InspectionsTab {...props} /> : null}
            {area === "requests" ? <HousekeepingRequestsTab {...props} /> : null}
            {area === "maintenance" ? <MaintenanceTab {...props} /> : null}
            {area === "exceptions" ? <ExceptionsTab {...props} /> : null}
            {area === "history" ? <HousekeepingHistoryTab {...props} /> : null}
            {area === "restrictions" ? <RestrictionsTab {...props} /> : null}
          </main>
        </div>
      </HousekeepingShellProvider>
    </HousekeepingChrome>
  );
}

function HousekeepingBurger({
  active,
  visible,
  toolbarSlot,
  onSelect,
}: {
  active: HkAreaId;
  visible: HkAreaId[];
  toolbarSlot: HTMLElement | null;
  onSelect: (id: HkAreaId) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = HK_AREA_ITEMS.filter((item) => visible.includes(item.id));
  const trigger = (
    <div
      className={cn(
        "pointer-events-none z-30",
        toolbarSlot ? "absolute left-1 top-1/2 -translate-y-1/2" : "absolute top-3 left-3",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Housekeeping navigation"
            title="Housekeeping navigation"
            data-testid="hk-nav-trigger"
            className={cn(
              "pointer-events-auto inline-flex size-8 items-center justify-center rounded-md text-[#251605]",
              "opacity-50 transition-opacity hover:bg-[#F3EEE4] hover:opacity-100",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
              "data-[state=open]:bg-[#F3EEE4] data-[state=open]:opacity-100",
            )}
          >
            <Menu className="size-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          className="pointer-events-auto w-64 p-1.5"
          data-testid="hk-workspace-nav"
          aria-label="Housekeeping"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Housekeeping
          </p>
          <div className="flex flex-col gap-0.5">
            {items.map((item) => {
              const Icon = HK_BURGER_ICONS[item.id];
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`hk-nav-${item.id}`}
                  onClick={() => {
                    setOpen(false);
                    onSelect(item.id);
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-[#F4E9D0] font-medium text-[#251605]"
                      : "text-foreground hover:bg-[#F7F4EE]",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-[#8A6A24]" aria-hidden="true" />
                  <span className="flex-1">{item.label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
  return toolbarSlot ? createPortal(trigger, toolbarSlot) : trigger;
}
