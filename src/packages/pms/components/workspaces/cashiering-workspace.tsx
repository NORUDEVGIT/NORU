import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Coins,
  FileText,
  History,
  LayoutGrid,
  Menu,
  RefreshCw,
  Undo2,
  Wallet,
} from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { CashieringChrome } from "@/packages/pms/components/cashiering/cashiering-chrome";
import { CashieringDesk } from "@/packages/pms/components/cashiering/cashiering-desk";
import {
  CashieringShellProvider,
  type CashieringShellSlots,
} from "@/packages/pms/components/cashiering/cashiering-shell-slots";
import { SHELL_ICON_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { getCashieringAccess, getCashieringDashboard } from "@/packages/pms/lib/cashiering.functions";
import {
  activityFilterFromLegacyTab,
  CASHIERING_TABS,
  cashieringTabSearch,
  resolveCashieringReturnTo,
  resolveCashieringTab,
  type CashieringSearchParams,
  type CashieringTabId,
} from "@/packages/pms/lib/cashiering-shell";
import {
  formatWeekLabel,
  mondayOf,
  readSharedWeekStart,
  writeSharedWeekStart,
} from "@/packages/pms/components/pms-week-controls";
import { addDays } from "@/packages/pms/lib/reservation-dates";
import { useMoney } from "@/core/state/property-format";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

const BURGER_ICONS = {
  overview: LayoutGrid,
  folios: FileText,
  "financial-activity": ClipboardList,
  accounts: Wallet,
  reports: History,
  "cashier-shift": Clock3,
} as const;

export function CashieringWorkspace({
  membership,
  search,
}: {
  membership: RestaurantMembership;
  search: CashieringSearchParams;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const money = useMoney();
  const businessDate = usePropertyBusinessDate(restaurantId, membership.restaurant.timezone);
  const tab = resolveCashieringTab(search.tab);
  const [moduleSearch, setModuleSearch] = useState(search.q ?? "");
  const { hasPrevious, computedLabel, handleReturn } = resolveCashieringReturnTo({
    returnTo: search.returnTo,
    returnToLabel: search.returnToLabel,
  });

  const [weekStart, setWeekStart] = useState(
    () => readSharedWeekStart(restaurantId) ?? mondayOf(businessDate),
  );
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const [shellSlots, setShellSlots] = useState<CashieringShellSlots>({
    search: null,
    filter: null,
    export: null,
    cta: null,
  });
  const setSearchSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.search === node ? current : { ...current, search: node }));
  }, []);
  const setFilterSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.filter === node ? current : { ...current, filter: node }));
  }, []);
  const setExportSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.export === node ? current : { ...current, export: node }));
  }, []);
  const setCtaSlot = useCallback((node: HTMLDivElement | null) => {
    setShellSlots((current) => (current.cta === node ? current : { ...current, cta: node }));
  }, []);

  useEffect(() => {
    if (search.tab === tab || (!search.tab && tab === "overview")) return;
    const { tab: _tab, folio, ...rest } = search;
    const legacyActivity = activityFilterFromLegacyTab(search.tab);
    void navigate({
      to: "/restaurant/pms/cashiering",
      search: cashieringTabSearch(tab, folio, {
        ...rest,
        ...(legacyActivity ? { activity: legacyActivity } : {}),
      }),
      replace: true,
    });
  }, [navigate, search, tab]);

  const fetchAccess = useServerFn(getCashieringAccess);
  const fetchDashboard = useServerFn(getCashieringDashboard);
  const accessQuery = useQuery({
    queryKey: ["cashiering-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const dashboardQuery = useQuery({
    queryKey: ["cashiering-dashboard", restaurantId, businessDate],
    queryFn: () => fetchDashboard({ data: { restaurantId, today: businessDate } }),
    retry: false,
  });
  const refreshing = useIsFetching({
    predicate: (query) => String(query.queryKey[0] ?? "").startsWith("cashier"),
  });
  const dashboard = dashboardQuery.data;

  useEffect(() => {
    writeSharedWeekStart(restaurantId, weekStart);
  }, [restaurantId, weekStart]);

  function shiftCashieringWeek(direction: -1 | 1) {
    const base = weekStart ?? (businessDate ? mondayOf(businessDate) : null);
    if (!base) return;
    const next = addDays(base, direction * 7);
    setWeekStart(next);
    writeSharedWeekStart(restaurantId, next);
  }

  function pickCashieringWeek(date: string) {
    const monday = mondayOf(date);
    setWeekStart(monday);
    writeSharedWeekStart(restaurantId, monday);
  }

  function go(
    next: CashieringTabId,
    folio?: string | null,
    extra?: Partial<CashieringSearchParams>,
  ) {
    const { tab: _tab, folio: _currentFolio, ...rest } = search;
    const nextFolio = folio === null ? null : folio !== undefined ? folio : null;
    void navigate({
      to: "/restaurant/pms/cashiering",
      search: cashieringTabSearch(next, nextFolio, { ...rest, ...extra }),
    });
  }

  function setSearchParams(next: CashieringSearchParams) {
    void navigate({
      to: "/restaurant/pms/cashiering",
      search: next,
    });
  }

  function refreshCashiering() {
    for (const key of [
      "cashiering-dashboard",
      "cashiering-folios",
      "folio-search-guest",
      "folio-search-all",
      "cashiering-ledger",
      "cashiering-folio",
      "cashier-shifts",
      "financial-accounts",
      "cashiering-reports",
      "cashiering-exceptions",
      "cashiering-business-date",
    ]) {
      void qc.invalidateQueries({ queryKey: [key, restaurantId] });
    }
  }

  if (accessQuery.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading cashiering…</p>;
  }
  if (!accessQuery.data) {
    return (
      <div className="m-4 rounded-xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Cashiering</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to Accounting &amp; Finance for this property.
        </p>
      </div>
    );
  }

  const kpis = [
    {
      label: "Open Folios",
      value: dashboard ? String(dashboard.openFolios) : null,
      icon: FileText,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      label: "Outstanding Balance",
      value: dashboard ? money(dashboard.outstandingBalance) : null,
      icon: CircleAlert,
      tone: "bg-amber-50 text-amber-800",
    },
    {
      label: "Today's Payments",
      value: dashboard ? money(dashboard.todayPayments) : null,
      icon: Banknote,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Today's Deposits",
      value: dashboard ? money(dashboard.todayDeposits) : null,
      icon: Coins,
      tone: "bg-[#FAF3E3] text-[#8A6A24]",
    },
    {
      label: "Today's Refunds",
      value: dashboard ? money(dashboard.todayRefunds) : null,
      icon: Undo2,
      tone: "bg-rose-50 text-rose-700",
    },
    {
      label: "Open Cashier Shift",
      value: dashboard ? (dashboard.openShifts > 0 ? String(dashboard.openShifts) : "None") : null,
      icon: Clock3,
      tone: "bg-teal-50 text-teal-700",
    },
  ] as const;

  return (
    <CashieringChrome membership={membership}>
      <CashieringShellProvider value={shellSlots}>
        <div
          className="flex min-h-[calc(100vh-4rem)] flex-col gap-3 bg-[#F7F4EE] p-3 sm:p-4"
          data-testid="cashiering-desk"
        >
          <section
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
            aria-label="Cashiering KPIs"
            data-testid="cashiering-kpis"
          >
            {kpis.map((card) => (
              <div
                key={card.label}
                className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 shadow-sm"
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", card.tone)}>
                  <card.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-[#756A5B]">{card.label}</p>
                  {dashboardQuery.isLoading ? (
                    <Skeleton className="mt-1 h-5 w-10" />
                  ) : (
                    <p className="truncate font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]">
                      {card.value ?? "—"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section
            ref={setToolbarSlot}
            className="relative w-full min-w-0 rounded-lg border border-[#DDD4C5] bg-white px-2 py-1.5 shadow-sm"
            data-testid="cashiering-toolbar"
            data-tab={tab}
          >
            <div className="flex w-full min-w-0 items-center gap-1.5">
              <div className="relative size-8 shrink-0">
                <CashieringBurger active={tab} toolbarSlot={null} onSelect={(id) => go(id, null)} />
              </div>
              <CashieringWeekControl
                weekStart={weekStart}
                onShiftWeek={shiftCashieringWeek}
                onPickDate={pickCashieringWeek}
              />
              <div ref={setSearchSlot} className="min-w-0 flex-1 overflow-hidden" />
              <div className="relative z-10 flex shrink-0 items-center gap-1.5">
                <div ref={setFilterSlot} className="shrink-0 empty:hidden" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={SHELL_ICON_BUTTON}
                  onClick={refreshCashiering}
                  aria-label="Refresh"
                  title="Refresh"
                  data-testid="cashiering-refresh"
                >
                  <RefreshCw className={cn("size-4", refreshing > 0 && "animate-spin")} />
                </Button>
                <div ref={setExportSlot} className="shrink-0 empty:hidden" />
                <div ref={setCtaSlot} className="shrink-0 empty:hidden" />
                {hasPrevious ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReturn}
                    data-testid="cashiering-return-to-previous"
                    className="h-9 shrink-0 gap-1.5 border-[#DDD4C5] bg-white px-3 text-xs font-semibold text-[#5C5346] hover:bg-[#F7F4EE] hover:text-[#251605]"
                  >
                    <ArrowLeft className="size-3.5 text-[#8A6A24]" />
                    {computedLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <main className="min-w-0">
            <CashieringDesk
              restaurantId={restaurantId}
              timezone={membership.restaurant.timezone}
              tab={tab}
              searchParams={search}
              onSearchParams={setSearchParams}
              folioQuery={search.folio ?? ""}
              moduleSearch={moduleSearch}
              canOperate={accessQuery.data.canOperate}
              canManage={accessQuery.data.canManage}
              membershipId={accessQuery.data.membershipId}
              role={accessQuery.data.role}
              onTab={go}
              weekStart={weekStart}
            />
          </main>
        </div>
      </CashieringShellProvider>
    </CashieringChrome>
  );
}

function CashieringWeekControl({
  weekStart,
  onShiftWeek,
  onPickDate,
}: {
  weekStart: string;
  onShiftWeek: (direction: -1 | 1) => void;
  onPickDate: (isoDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="inline-flex h-9 w-[11.5rem] shrink-0 items-center rounded-md border border-[#DDD4C5] bg-white"
      data-testid="pms-week-control"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 rounded-r-none"
        aria-label="Previous week"
        onClick={() => onShiftWeek(-1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-8 min-w-0 flex-1 px-1 text-xs font-semibold tabular-nums text-[#251605]"
            aria-label="Week"
          >
            {formatWeekLabel(weekStart)}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            Any date in the week
            <Input
              type="date"
              aria-label="Date in week"
              className="h-9 w-40"
              value={weekStart}
              onChange={(event) => {
                if (!event.target.value) return;
                onPickDate(event.target.value);
                setOpen(false);
              }}
            />
          </label>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 rounded-l-none"
        aria-label="Next week"
        onClick={() => onShiftWeek(1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

function CashieringBurger({
  active,
  toolbarSlot,
  onSelect,
}: {
  active: CashieringTabId;
  toolbarSlot: HTMLElement | null;
  onSelect: (id: CashieringTabId) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = (
    <div
      className={cn(
        "z-30",
        toolbarSlot
          ? "pointer-events-none absolute left-1 top-1/2 -translate-y-1/2"
          : "relative shrink-0",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Cashiering navigation"
            title="Cashiering navigation"
            data-testid="cashiering-nav-trigger"
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
          data-testid="cashiering-workspace-nav"
          aria-label="Cashiering"
        >
          <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Cashiering
          </p>
          <div className="flex flex-col gap-0.5">
            {CASHIERING_TABS.map((item) => {
              const Icon = BURGER_ICONS[item.id];
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`cashiering-nav-${item.id}`}
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
