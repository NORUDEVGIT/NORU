import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Banknote,
  CircleAlert,
  Clock3,
  Coins,
  FileText,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { labelTransactionType } from "@/packages/pms/components/cashiering/folio-bits";
import { ShiftDialog } from "@/packages/pms/components/cashiering/cashiering-tabs";
import {
  getCashieringCorrectionNotice,
  getCashieringDashboard,
  getDefaultDepositPolicy,
  getFolio,
  listCashierShifts,
  postHotelDrawerMovement,
  listFolios,
  listLedgerEntries,
  postFolioEntry,
  type FolioDetail,
  type FolioRow,
  type LedgerEntryRow,
} from "@/packages/pms/lib/cashiering.functions";
import type { CashieringTabId } from "@/packages/pms/lib/cashiering-shell";
import { remainingOnPaymentSource } from "@/packages/pms/lib/cashiering.server";
import {
  POLISH1_PAYMENT_METHODS_HREF,
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import {
  useMoney,
  useRestaurantTime,
} from "@/core/state/property-format";
import { formatStayDate, propertyToday } from "@/shared/lib/property-dates";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

const PAGE_SIZE = 10;
const LEDGER_TYPES = ["charge", "payment", "deposit", "refund", "adjustment", "discount"] as const;

type FolioFilter = "all" | "in_house" | "departures" | "balance" | "open" | "closed";

const FILTERS: Array<{ id: FolioFilter; label: string }> = [
  { id: "in_house", label: "In House" },
  { id: "departures", label: "Departures" },
  { id: "balance", label: "Balance > 0" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
];

function propertyDate(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function methodLabel(code: string | null): string {
  if (!code) return "—";
  return code.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function stayLabel(folio: FolioRow): string {
  if (folio.reservationStatus === "checked_in") return "In House";
  if (folio.reservationStatus === "checked_out") return "Checked Out";
  return folio.status === "closed" ? "Closed" : "Open";
}

function shortRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

const KPI_TONE = {
  blue: "border-sky-200 bg-sky-50/80",
  amber: "border-amber-200 bg-amber-50/80",
  green: "border-emerald-200 bg-emerald-50/80",
  gold: "border-[#E4D3A8] bg-[#FBF6EA]",
  rose: "border-rose-200 bg-rose-50/80",
  teal: "border-teal-200 bg-teal-50/80",
} as const;

const KPI_ICON = {
  blue: "bg-sky-100 text-sky-700",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-emerald-100 text-emerald-700",
  gold: "bg-[#F3E6C4] text-[#8A6A24]",
  rose: "bg-rose-100 text-rose-700",
  teal: "bg-teal-100 text-teal-700",
} as const;

type KpiTone = keyof typeof KPI_TONE;

const TXN_MARK: Record<string, { icon: LucideIcon; className: string }> = {
  charge: { icon: Plus, className: "bg-sky-100 text-sky-700" },
  payment: { icon: Banknote, className: "bg-emerald-100 text-emerald-700" },
  deposit: { icon: Coins, className: "bg-[#F3E6C4] text-[#8A6A24]" },
  refund: { icon: Undo2, className: "bg-rose-100 text-rose-700" },
  adjustment: { icon: SlidersHorizontal, className: "bg-violet-100 text-violet-700" },
  discount: { icon: SlidersHorizontal, className: "bg-muted text-muted-foreground" },
};

function Kpi({
  label,
  value,
  hint,
  tone = "blue",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  icon?: LucideIcon;
}) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 shadow-sm", KPI_TONE[tone])}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn("grid size-7 shrink-0 place-items-center rounded-md", KPI_ICON[tone])}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-1 font-display text-lg font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: KpiTone }) {
  return (
    <div className={cn("rounded-lg border px-2.5 py-2", KPI_TONE[tone])}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TxnMark({ type }: { type: string }) {
  const mark = TXN_MARK[type] ?? TXN_MARK.charge;
  const Icon = mark?.icon ?? Plus;
  return (
    <span
      className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md", mark?.className)}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

function FilterBar({
  search,
  onSearch,
  filter,
  onFilter,
}: {
  search: string;
  onSearch: (value: string) => void;
  filter: FolioFilter;
  onFilter: (value: FolioFilter) => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <Input
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Search guest name, folio no, room no, reservation no..."
        className="h-11 min-h-11 bg-card lg:max-w-md"
        data-testid="cashiering-folio-search"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Folio filters">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              data-testid={`cashiering-filter-${item.id}`}
              onClick={() => onFilter(active ? "all" : item.id)}
              className={cn(
                "inline-flex h-11 min-h-11 items-center rounded-full border px-3 text-xs font-medium",
                active
                  ? "border-[#C89933] bg-[#C89933] text-[#251605] shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:border-[#C89933]/60 hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CashieringDesk({
  restaurantId,
  timezone,
  tab,
  folioQuery,
  moduleSearch,
  canOperate,
  canManage,
  onTab,
}: {
  restaurantId: string;
  timezone: string;
  tab: CashieringTabId;
  folioQuery: string;
  moduleSearch: string;
  canOperate: boolean;
  canManage: boolean;
  onTab: (tab: CashieringTabId, folio?: string | null) => void;
}) {
  const today = propertyToday(timezone);
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const [search, setSearch] = useState(moduleSearch);
  const [filter, setFilter] = useState<FolioFilter>("all");
  const [page, setPage] = useState(1);
  const [shiftMode, setShiftMode] = useState<"open" | "close" | null>(null);

  useEffect(() => {
    if (moduleSearch) setSearch(moduleSearch);
  }, [moduleSearch]);

  const fetchDashboard = useServerFn(getCashieringDashboard);
  const fetchFolios = useServerFn(listFolios);
  const fetchLedger = useServerFn(listLedgerEntries);
  const fetchFolio = useServerFn(getFolio);
  const fetchShifts = useServerFn(listCashierShifts);
  const fetchDepositPolicy = useServerFn(getDefaultDepositPolicy);
  const fetchCorrectionNotice = useServerFn(getCashieringCorrectionNotice);
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ["cashiering-dashboard", restaurantId, today],
    queryFn: () => fetchDashboard({ data: { restaurantId, today } }),
    retry: false,
  });
  const foliosQuery = useQuery({
    queryKey: ["cashiering-folios", restaurantId],
    queryFn: () => fetchFolios({ data: { restaurantId, status: "all" } }),
    retry: false,
  });
  const ledgerQuery = useQuery({
    queryKey: ["cashiering-ledger", restaurantId],
    queryFn: () => fetchLedger({ data: { restaurantId, types: [...LEDGER_TYPES] } }),
    retry: false,
  });
  const correctionNoticeQuery = useQuery({
    queryKey: ["cashiering-correction-notice", restaurantId],
    queryFn: () => fetchCorrectionNotice({ data: { restaurantId } }),
    retry: false,
  });
  const depositPolicyQuery = useQuery({
    queryKey: ["cashiering-deposit-policy", restaurantId],
    queryFn: () => fetchDepositPolicy({ data: { restaurantId } }),
    retry: false,
  });
  const shiftsQuery = useQuery({
    queryKey: ["cashier-shifts", restaurantId],
    queryFn: () => fetchShifts({ data: { restaurantId } }),
    retry: false,
  });

  const folios = useMemo(() => foliosQuery.data ?? [], [foliosQuery.data]);
  const ledger = ledgerQuery.data ?? [];
  const shifts = shiftsQuery.data ?? [];
  const openShift = shifts.find((shift) => shift.status === "open") ?? null;

  const matchedFolio = useMemo(() => {
    const needle = folioQuery.trim().toLowerCase();
    if (!needle) return null;
    return (
      folios.find(
        (folio) =>
          folio.id.toLowerCase() === needle ||
          folio.folioNumber.toLowerCase() === needle ||
          (folio.confirmationNumber ?? "").toLowerCase() === needle,
      ) ??
      folios.find(
        (folio) =>
          folio.folioNumber.toLowerCase().includes(needle) ||
          folio.guestName.toLowerCase().includes(needle) ||
          (folio.roomNumber ?? "").toLowerCase().includes(needle) ||
          (folio.confirmationNumber ?? "").toLowerCase().includes(needle),
      ) ??
      null
    );
  }, [folioQuery, folios]);
  const selected = tab === "folios" ? (matchedFolio ?? folios[0] ?? null) : matchedFolio;

  const detailQuery = useQuery({
    queryKey: ["cashiering-folio", restaurantId, selected?.id],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId: selected!.id } }),
    enabled: Boolean(selected?.id),
    retry: false,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return folios.filter((folio) => {
      const matchesTerm =
        term === "" ||
        folio.guestName.toLowerCase().includes(term) ||
        folio.folioNumber.toLowerCase().includes(term) ||
        (folio.roomNumber ?? "").toLowerCase().includes(term) ||
        (folio.confirmationNumber ?? "").toLowerCase().includes(term);
      if (!matchesTerm) return false;
      if (filter === "in_house") return folio.reservationStatus === "checked_in";
      if (filter === "departures") return folio.departureDate === today;
      if (filter === "balance") return folio.balance > 0.009;
      if (filter === "open") return folio.status === "open";
      if (filter === "closed") return folio.status === "closed";
      return true;
    });
  }, [filter, folios, search, today]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["cashiering-dashboard", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-folios", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-ledger", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-folio", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashier-shifts", restaurantId] });
  }

  function selectFolio(folio: FolioRow) {
    onTab(tab, folio.id);
  }

  const payments = ledger.filter((row) => row.type === "payment");
  const deposits = ledger.filter((row) => row.type === "deposit");
  const refunds = ledger.filter((row) => row.type === "refund");
  const todayPayments = payments.filter((row) => propertyDate(row.postedAt, timezone) === today);

  return (
    <div className="space-y-4" data-testid={`cashiering-panel-${tab}`}>
      {tab === "overview" ? (
        <Overview
          money={money}
          dateTime={dateTime}
          dashboard={dashboardQuery.data}
          loading={dashboardQuery.isLoading}
          error={dashboardQuery.isError ? (dashboardQuery.error as Error).message : null}
          folios={pageRows}
          folioCount={filtered.length}
          page={safePage}
          pageCount={pageCount}
          onPage={setPage}
          search={search}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          filter={filter}
          onFilter={(value) => {
            setFilter(value);
            setPage(1);
          }}
          recent={ledger.slice(0, 6)}
          openShift={openShift}
          selectedId={selected?.id ?? null}
          canOperate={canOperate}
          canManage={canManage}
          onSelect={selectFolio}
          onActivity={(next) => onTab(next, selected?.id)}
        />
      ) : null}

      {tab === "folios" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <section className="min-w-0 space-y-3">
            <FilterBar
              search={search}
              onSearch={(value) => {
                setSearch(value);
                setPage(1);
              }}
              filter={filter}
              onFilter={(value) => {
                setFilter(value);
                setPage(1);
              }}
            />
            <FolioTable
              rows={pageRows}
              total={filtered.length}
              page={safePage}
              pageCount={pageCount}
              onPage={setPage}
              loading={foliosQuery.isLoading}
              error={foliosQuery.isError ? (foliosQuery.error as Error).message : null}
              money={money}
              selectedId={selected?.id ?? null}
              canOperate={canOperate}
              canManage={canManage}
              onSelect={selectFolio}
            />
          </section>
          <FolioQuickView
            folio={detailQuery.data ?? null}
            loading={Boolean(selected) && detailQuery.isLoading}
            money={money}
            dateTime={dateTime}
          />
        </div>
      ) : null}

      {tab === "payments" ? (
        <PaymentsPanel
          rows={payments}
          todayRows={todayPayments}
          money={money}
          dateTime={dateTime}
          loading={ledgerQuery.isLoading}
          error={ledgerQuery.isError ? (ledgerQuery.error as Error).message : null}
          selected={detailQuery.data}
          canOperate={canOperate}
          restaurantId={restaurantId}
          onSelect={(row) => onTab("payments", row.folioId)}
          onPosted={refresh}
        />
      ) : null}

      {tab === "deposits" ? (
        <CreditPanel
          kind="deposit"
          title="Recorded deposits"
          empty="No deposit credits recorded yet."
          rows={deposits}
          money={money}
          dateTime={dateTime}
          loading={ledgerQuery.isLoading}
          error={ledgerQuery.isError ? (ledgerQuery.error as Error).message : null}
          selected={detailQuery.data}
          canPost={canOperate}
          restaurantId={restaurantId}
          depositPolicySummary={depositPolicyQuery.data?.summary ?? null}
          onSelect={(row) => onTab("deposits", row.folioId)}
          onPosted={refresh}
        />
      ) : null}

      {tab === "refunds" ? (
        <CreditPanel
          kind="refund"
          title="Refunds"
          empty="No refunds recorded yet."
          rows={refunds}
          money={money}
          dateTime={dateTime}
          loading={ledgerQuery.isLoading}
          error={ledgerQuery.isError ? (ledgerQuery.error as Error).message : null}
          selected={detailQuery.data}
          canPost={canManage}
          restaurantId={restaurantId}
          authorizerNote={correctionNoticeQuery.data?.authorizer ?? null}
          onSelect={(row) => onTab("refunds", row.folioId)}
          onPosted={refresh}
        />
      ) : null}

      {tab === "cashier-shift" ? (
        <ShiftPanel
          shifts={shifts}
          openShift={openShift}
          loading={shiftsQuery.isLoading}
          error={shiftsQuery.isError ? (shiftsQuery.error as Error).message : null}
          money={money}
          dateTime={dateTime}
          restaurantId={restaurantId}
          onOpen={() => setShiftMode("open")}
          onClose={() => setShiftMode("close")}
          onMoved={refresh}
        />
      ) : null}

      <ShiftDialog
        restaurantId={restaurantId}
        mode={shiftMode ?? "open"}
        shiftId={openShift?.id ?? null}
        open={shiftMode !== null}
        onClose={() => setShiftMode(null)}
        onDone={refresh}
      />
    </div>
  );
}

function Overview({
  money,
  dateTime,
  dashboard,
  loading,
  error,
  folios,
  folioCount,
  page,
  pageCount,
  onPage,
  search,
  onSearch,
  filter,
  onFilter,
  recent,
  openShift,
  selectedId,
  canOperate,
  canManage,
  onSelect,
  onActivity,
}: {
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  dashboard:
    | {
        openFolios: number;
        outstandingBalance: number;
        todayPayments: number;
        todayCharges: number;
        todayDeposits: number;
        todayRefunds: number;
        openShifts: number;
      }
    | undefined;
  loading: boolean;
  error: string | null;
  folios: FolioRow[];
  folioCount: number;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  search: string;
  onSearch: (value: string) => void;
  filter: FolioFilter;
  onFilter: (value: FolioFilter) => void;
  recent: LedgerEntryRow[];
  openShift: {
    staffName: string;
    openedAt: string;
    openingCash: number | null;
    status: string;
  } | null;
  selectedId: string | null;
  canOperate: boolean;
  canManage: boolean;
  onSelect: (folio: FolioRow) => void;
  onActivity: (tab: CashieringTabId) => void;
}) {
  return (
    <div className="space-y-4">
      {loading ? <p className="text-sm text-muted-foreground">Loading cashiering…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {dashboard ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" data-testid="cashiering-kpis">
          <Kpi
            label="Open Folios"
            value={String(dashboard.openFolios)}
            hint="Open guest folios"
            tone="blue"
            icon={FileText}
          />
          <Kpi
            label="Outstanding Balance"
            value={money(dashboard.outstandingBalance)}
            hint="Across open folios"
            tone="amber"
            icon={CircleAlert}
          />
          <Kpi
            label="Payments Today"
            value={money(dashboard.todayPayments)}
            tone="green"
            icon={Banknote}
          />
          <Kpi
            label="Deposits Today"
            value={money(dashboard.todayDeposits)}
            tone="gold"
            icon={Coins}
          />
          <Kpi
            label="Refunds Today"
            value={money(dashboard.todayRefunds)}
            tone="rose"
            icon={Undo2}
          />
          <Kpi
            label="Open Cashier Shift"
            value={dashboard.openShifts > 0 ? String(dashboard.openShifts) : "None"}
            hint={openShift ? `Opened ${dateTime(openShift.openedAt)}` : "No open shift"}
            tone="teal"
            icon={Clock3}
          />
        </div>
      ) : null}
      <FilterBar search={search} onSearch={onSearch} filter={filter} onFilter={onFilter} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,0.85fr)]">
        <FolioTable
          rows={folios}
          total={folioCount}
          page={page}
          pageCount={pageCount}
          onPage={onPage}
          loading={false}
          error={null}
          money={money}
          selectedId={selectedId}
          canOperate={canOperate}
          canManage={canManage}
          onSelect={onSelect}
        />
        <aside className="space-y-3">
          <SideCard title="Today’s Activity">
            {dashboard ? (
              <ul className="space-y-2 text-sm">
                <ActivityRow
                  label="Total Charges"
                  value={money(dashboard.todayCharges)}
                  onClick={() => onActivity("folios")}
                />
                <ActivityRow
                  label="Payments Received"
                  value={money(dashboard.todayPayments)}
                  onClick={() => onActivity("payments")}
                />
                <ActivityRow
                  label="Deposits Collected"
                  value={money(dashboard.todayDeposits)}
                  onClick={() => onActivity("deposits")}
                />
                <ActivityRow
                  label="Refunds Processed"
                  value={money(dashboard.todayRefunds)}
                  onClick={() => onActivity("refunds")}
                />
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No activity loaded.</p>
            )}
          </SideCard>
          <SideCard
            title="Recent Transactions"
            action="View all"
            onAction={() => onActivity("payments")}
          >
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No folio transactions recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {recent.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 text-sm">
                    <TxnMark type={row.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{row.guestName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {methodLabel(row.type)} · {row.folioNumber}
                        {row.roomNumber ? ` · Room ${row.roomNumber}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{money(row.amount)}</p>
                      <p className="text-xs text-muted-foreground">{dateTime(row.postedAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>
          <SideCard
            title="Cashier Shift Snapshot"
            action="Open"
            onAction={() => onActivity("cashier-shift")}
          >
            {openShift ? (
              <dl className="space-y-1 text-sm">
                <SnapshotRow label="Status" value="Open" />
                <SnapshotRow label="Cashier" value={openShift.staffName} />
                <SnapshotRow label="Shift opened" value={dateTime(openShift.openedAt)} />
                <SnapshotRow
                  label="Opening cash"
                  value={openShift.openingCash === null ? "—" : money(openShift.openingCash)}
                />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No cashier shift is open.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Opening cash is the hotel drawer float. Restaurant sales are not included.
            </p>
          </SideCard>
        </aside>
      </div>
    </div>
  );
}

function ActivityRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
      >
        <span>{label}</span>
        <span className="tabular-nums font-medium">{value}</span>
      </button>
    </li>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function SideCard({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="text-xs font-medium text-[#8A6A24] hover:underline"
          >
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FolioActionMenu({
  folio,
  canOperate,
  canManage,
}: {
  folio: FolioRow;
  canOperate: boolean;
  canManage: boolean;
}) {
  const open = folio.status === "open";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={`Actions for ${folio.folioNumber}`}
          data-testid="folio-row-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <FolioPageItem folioId={folio.id} label="Open folio" />
        <FolioPageItem
          folioId={folio.id}
          action="charge"
          label="Post Charge"
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="payment"
          label="Receive Payment"
          disabled={!canOperate || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="deposit"
          label="Add Deposit"
          disabled={!canOperate || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="refund"
          label="Refund"
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="discount"
          label="Discount"
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="adjustment"
          label="Adjust"
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="close"
          label="Close Folio"
          disabled={!canManage || !open}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FolioPageItem({
  folioId,
  label,
  action,
  disabled,
}: {
  folioId: string;
  label: string;
  action?: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return <DropdownMenuItem disabled>{label}</DropdownMenuItem>;
  }
  return (
    <DropdownMenuItem asChild>
      <Link
        to="/restaurant/pms/cashiering/folios/$folioId"
        params={{ folioId }}
        search={action ? { action } : {}}
      >
        {label}
      </Link>
    </DropdownMenuItem>
  );
}

function FolioTable({
  rows,
  total,
  page,
  pageCount,
  onPage,
  loading,
  error,
  money,
  selectedId,
  canOperate,
  canManage,
  onSelect,
}: {
  rows: FolioRow[];
  total: number;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  loading: boolean;
  error: string | null;
  money: (value: number) => string;
  selectedId: string | null;
  canOperate: boolean;
  canManage: boolean;
  onSelect: (folio: FolioRow) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Guest Folios ({total})</h2>
      </div>
      {loading ? <p className="p-4 text-sm text-muted-foreground">Loading folios…</p> : null}
      {error ? <p className="p-4 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">No folios match this view.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Folio No</th>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Room</th>
                <th className="px-3 py-2 font-medium">Reservation</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 font-medium">Currency</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((folio) => {
                const settled = Math.abs(folio.balance) < 0.01;
                return (
                  <tr
                    key={folio.id}
                    data-testid="folio-row"
                    onClick={() => onSelect(folio)}
                    className={cn(
                      "cursor-pointer border-t border-border transition-colors hover:bg-muted/50",
                      selectedId === folio.id && "bg-[#C89933]/15 hover:bg-[#C89933]/20",
                    )}
                  >
                    <td className="px-3 py-2 font-medium">{folio.folioNumber}</td>
                    <td className="px-3 py-2">{folio.guestName}</td>
                    <td className="px-3 py-2">
                      <div>{folio.roomNumber ?? "—"}</div>
                      {folio.roomTypeName ? (
                        <div className="text-xs text-muted-foreground">{folio.roomTypeName}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{folio.confirmationNumber ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
                        {stayLabel(folio)}
                      </span>
                      {folio.unsettledCheckout ? (
                        <div className="mt-1 text-[11px] font-medium text-destructive">
                          Unsettled checkout
                        </div>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        settled ? "text-muted-foreground" : "font-medium text-destructive",
                      )}
                    >
                      {money(folio.balance)}
                    </td>
                    <td className="px-3 py-2">{folio.currency}</td>
                    <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      <FolioActionMenu
                        folio={folio}
                        canOperate={canOperate}
                        canManage={canManage}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          Showing {rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
          {(page - 1) * PAGE_SIZE + rows.length} of {total}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}

function FolioQuickView({
  folio,
  loading,
  money,
  dateTime,
}: {
  folio: FolioDetail | null;
  loading: boolean;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
}) {
  if (loading) {
    return (
      <aside className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        Loading folio…
      </aside>
    );
  }
  if (!folio) {
    return (
      <aside className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        Select a folio to see charges, payments and the outstanding balance.
      </aside>
    );
  }
  const settled = Math.abs(folio.balance) < 0.01;
  const recent = [...folio.transactions].reverse().slice(0, 6);
  const sumType = (type: string) =>
    folio.transactions.filter((row) => row.type === type).reduce((sum, row) => sum + row.amount, 0);
  const refundsAndAdjustments = sumType("refund") + sumType("adjustment") + sumType("discount");
  return (
    <aside
      className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid="folio-quick-view"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-tight">{folio.guestName}</h2>
          <p className="mt-1 text-sm font-medium">{folio.folioNumber}</p>
          <p className="text-xs text-muted-foreground">
            {folio.roomNumber ? `Room ${folio.roomNumber}` : "No room"}
            {folio.roomTypeName ? ` · ${folio.roomTypeName}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {folio.confirmationNumber
              ? `Reservation ${folio.confirmationNumber}`
              : "No reservation"}
          </p>
          <p className="text-xs text-muted-foreground">
            {folio.arrivalDate ? formatStayDate(folio.arrivalDate) : "—"} –{" "}
            {folio.departureDate ? formatStayDate(folio.departureDate) : "—"}
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium">
          {stayLabel(folio)}
        </span>
      </div>
      {folio.unsettledCheckout ? (
        <p className="text-xs font-medium text-destructive">
          Unsettled checkout exception. The folio is still open.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <SummaryTile label="Charges" value={money(sumType("charge"))} tone="blue" />
        <SummaryTile label="Payments" value={money(Math.abs(sumType("payment")))} tone="green" />
        <SummaryTile label="Deposits" value={money(Math.abs(sumType("deposit")))} tone="gold" />
        <SummaryTile
          label="Refunds / Adjustments"
          value={money(refundsAndAdjustments)}
          tone="rose"
        />
      </div>
      <div className={cn("rounded-xl px-3 py-3", settled ? "bg-muted/40" : "bg-destructive/10")}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Outstanding Balance
        </p>
        <p
          className={cn(
            "mt-1 font-display text-2xl tabular-nums",
            settled ? "text-foreground" : "text-destructive",
          )}
        >
          {money(folio.balance)}
        </p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Recent transactions</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing posted on this folio yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((row) => (
              <li key={row.id} className="flex items-start gap-2 text-sm">
                <TxnMark type={row.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{row.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {methodLabel(row.type)} · {dateTime(row.postedAt)}
                  </p>
                </div>
                <span className="tabular-nums">{money(row.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          asChild
          size="sm"
          className="min-h-11 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
        >
          <Link
            to="/restaurant/pms/cashiering/folios/$folioId"
            params={{ folioId: folio.id }}
            data-testid="folio-open-page"
          >
            Open folio
          </Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={() => window.print()}
        >
          Print statement
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Posting is on the folio page. Print statement prints this screen and is not an issued
        invoice.
      </p>
    </aside>
  );
}

function PaymentsPanel({
  rows,
  todayRows,
  money,
  dateTime,
  loading,
  error,
  selected,
  canOperate,
  restaurantId,
  onSelect,
  onPosted,
}: {
  rows: LedgerEntryRow[];
  todayRows: LedgerEntryRow[];
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  loading: boolean;
  error: string | null;
  selected: FolioDetail | null | undefined;
  canOperate: boolean;
  restaurantId: string;
  onSelect: (row: LedgerEntryRow) => void;
  onPosted: () => void;
}) {
  const byMethod = new Map<string, { count: number; amount: number }>();
  for (const row of todayRows) {
    const key = row.paymentMethod ?? "unspecified";
    const current = byMethod.get(key) ?? { count: 0, amount: 0 };
    current.count += 1;
    current.amount += row.amount;
    byMethod.set(key, current);
  }
  const extra = [...byMethod.entries()].filter(
    ([code, value]) => code !== "cash" && code !== "card" && value.amount > 0,
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Payments Today"
          value={money(todayRows.reduce((sum, row) => sum + row.amount, 0))}
          hint={`${todayRows.length} recorded`}
        />
        <Kpi
          label="Cash Payments"
          value={money(byMethod.get("cash")?.amount ?? 0)}
          hint={`${byMethod.get("cash")?.count ?? 0} recorded`}
        />
        <Kpi
          label="Card Payments"
          value={money(byMethod.get("card")?.amount ?? 0)}
          hint={`${byMethod.get("card")?.count ?? 0} recorded`}
        />
        {extra.map(([code, value]) => (
          <Kpi
            key={code}
            label={methodLabel(code)}
            value={money(value.amount)}
            hint={`${value.count} recorded`}
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <LedgerTable
          title={`Payments Ledger (${rows.length})`}
          rows={rows}
          loading={loading}
          error={error}
          empty="No payments recorded yet."
          money={money}
          dateTime={dateTime}
          onSelect={onSelect}
        />
        <ReceivePanel
          kind="payment"
          restaurantId={restaurantId}
          folio={selected ?? null}
          canPost={canOperate}
          money={money}
          onPosted={onPosted}
        />
      </div>
    </div>
  );
}

function CreditPanel({
  kind,
  title,
  empty,
  rows,
  money,
  dateTime,
  loading,
  error,
  selected,
  canPost,
  restaurantId,
  depositPolicySummary,
  authorizerNote,
  onSelect,
  onPosted,
}: {
  kind: "deposit" | "refund";
  title: string;
  empty: string;
  rows: LedgerEntryRow[];
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  loading: boolean;
  error: string | null;
  selected: FolioDetail | null | undefined;
  canPost: boolean;
  restaurantId: string;
  depositPolicySummary?: string | null;
  authorizerNote?: string | null;
  onSelect: (row: LedgerEntryRow) => void;
  onPosted: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <LedgerTable
        title={`${title} (${rows.length})`}
        rows={rows}
        loading={loading}
        error={error}
        empty={empty}
        money={money}
        dateTime={dateTime}
        onSelect={onSelect}
      />
      <ReceivePanel
        kind={kind}
        restaurantId={restaurantId}
        folio={selected ?? null}
        canPost={canPost}
        money={money}
        depositPolicySummary={depositPolicySummary}
        authorizerNote={authorizerNote}
        onPosted={onPosted}
      />
    </div>
  );
}

function LedgerTable({
  title,
  rows,
  loading,
  error,
  empty,
  money,
  dateTime,
  onSelect,
}: {
  title: string;
  rows: LedgerEntryRow[];
  loading: boolean;
  error: string | null;
  empty: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onSelect: (row: LedgerEntryRow) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {loading ? <p className="p-4 text-sm text-muted-foreground">Loading ledger…</p> : null}
      {error ? <p className="p-4 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Folio No</th>
                <th className="px-3 py-2 font-medium">Room</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Posted At</th>
                <th className="px-3 py-2 font-medium">Posted By</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{shortRef(row.id)}</td>
                  <td className="px-3 py-2">{row.guestName}</td>
                  <td className="px-3 py-2">{row.folioNumber}</td>
                  <td className="px-3 py-2">{row.roomNumber ?? "—"}</td>
                  <td className="px-3 py-2">
                    {row.paymentMethod ? methodLabel(row.paymentMethod) : methodLabel(row.type)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dateTime(row.postedAt)}</td>
                  <td className="px-3 py-2">{row.postedBy ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                      Recorded
                    </span>
                    {row.referenceType ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {row.referenceType}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11 sm:min-h-8"
                      onClick={() => onSelect(row)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ReceivePanel({
  kind,
  restaurantId,
  folio,
  canPost,
  money,
  depositPolicySummary,
  authorizerNote,
  onPosted,
}: {
  kind: "payment" | "deposit" | "refund";
  restaurantId: string;
  folio: {
    id: string;
    folioNumber: string;
    guestName: string;
    roomNumber: string | null;
    roomTypeName: string | null;
    status: "open" | "closed";
    balance: number;
    transactions?: Array<{
      id: string;
      type: string;
      description: string;
      amount: number;
      originalTransactionId: string | null;
    }>;
  } | null;
  canPost: boolean;
  money: (value: number) => string;
  depositPolicySummary?: string | null;
  authorizerNote?: string | null;
  onPosted: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceId, setSourceId] = useState("none");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const set1 = usePmsSet1Foundation(restaurantId);
  const tenders = cashieringTenderOptions({
    available: set1.data?.polish1?.paymentMethodsAvailable ?? false,
    methods: set1.data?.polish1?.paymentMethods ?? emptyPolish1Snapshot().paymentMethods,
  });
  const post = useServerFn(postFolioEntry);

  useEffect(() => {
    if (!tenders.some((row) => row.code === method)) setMethod(tenders[0]?.code ?? "");
  }, [method, tenders]);

  useEffect(() => {
    setAmount("");
    setReference("");
    setNotes("");
    setSourceId("none");
    setIdempotencyKey(crypto.randomUUID());
  }, [folio?.id, kind]);

  const refundSources = useMemo(
    () =>
      (folio?.transactions ?? []).filter(
        (line) => line.type === "payment" || line.type === "deposit",
      ),
    [folio?.transactions],
  );
  useEffect(() => {
    if (kind !== "refund") return;
    if (refundSources.some((line) => line.id === sourceId)) return;
    setSourceId(refundSources[0]?.id ?? "none");
  }, [kind, refundSources, sourceId]);
  const refundSource = refundSources.find((line) => line.id === sourceId) ?? null;
  const refundRemaining =
    refundSource && folio?.transactions
      ? remainingOnPaymentSource(refundSource, folio.transactions)
      : null;

  const copy =
    kind === "payment"
      ? {
          title: "Receive Payment",
          cta: "Post Payment",
          note: "Records a payment on the guest folio. No card number is collected.",
        }
      : kind === "deposit"
        ? {
            title: "Record Deposit Credit",
            cta: "Record Deposit",
            note: "A deposit is a folio credit on this guest folio.",
          }
        : {
            title: "Record Refund",
            cta: "Post Refund",
            note: "Posts a refund linked to a payment. Only an owner or manager can post it.",
          };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!folio) throw new Error("Select a folio first.");
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Enter an amount greater than zero.");
      if (kind === "refund" && notes.trim() === "") throw new Error("Enter a reason.");
      if (kind === "refund" && !refundSources.some((line) => line.id === sourceId)) {
        throw new Error("Choose the folio line this corrects.");
      }
      const description = [copy.title, reference.trim(), notes.trim()]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 200);
      return post({
        data: {
          restaurantId,
          folioId: folio.id,
          type: kind,
          amount: value,
          description,
          method,
          idempotencyKey,
          ...(kind === "refund" ? { originalTransactionId: sourceId } : {}),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Posted to folio");
      setIdempotencyKey(crypto.randomUUID());
      setAmount("");
      setReference("");
      setNotes("");
      onPosted();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section
      className={cn(
        "space-y-4 rounded-xl border bg-card p-4 shadow-sm",
        kind === "payment" && "border-emerald-200",
        kind === "deposit" && "border-[#E4D3A8]",
        kind === "refund" && "border-rose-200",
      )}
      data-testid={`cashiering-${kind}-panel`}
    >
      <h2 className="text-sm font-semibold">{copy.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{copy.note}</p>
      {kind === "deposit" && depositPolicySummary ? (
        <p className="text-sm text-muted-foreground">{depositPolicySummary}</p>
      ) : null}
      {!folio ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Select a recorded line, or open a folio from the Folios tab.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="font-medium">{folio.guestName}</p>
            <p className="text-xs text-muted-foreground">
              {folio.folioNumber}
              {folio.roomNumber ? ` · Room ${folio.roomNumber}` : ""}
              {folio.roomTypeName ? ` · ${folio.roomTypeName}` : ""}
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg px-3 py-2",
              folio.balance > 0.009 ? "bg-destructive/10" : "bg-muted/40",
            )}
          >
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Outstanding Balance
            </p>
            <p
              className={cn(
                "font-display text-xl tabular-nums",
                folio.balance > 0.009 && "text-destructive",
              )}
            >
              {money(folio.balance)}
            </p>
          </div>
          {folio.status !== "open" ? (
            <p className="text-sm text-muted-foreground">
              This folio is closed. New lines cannot be posted.
            </p>
          ) : !canPost ? (
            <p className="text-sm text-muted-foreground">
              Your role cannot post this kind of folio line.
            </p>
          ) : (
            <div className="space-y-3 rounded-lg border border-border/80 bg-background p-3">
              <div>
                <Label htmlFor={`${kind}-method`}>Payment method</Label>
                {tenders.length === 0 ? (
                  <p className="text-sm text-[#C89933]">
                    No active payment methods. Configure them in{" "}
                    <a href={POLISH1_PAYMENT_METHODS_HREF} className="underline">
                      Payment methods
                    </a>
                    .
                  </p>
                ) : (
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger id={`${kind}-method`} className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tenders.map((row) => (
                        <SelectItem key={row.code} value={row.code}>
                          {row.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {kind === "refund" ? (
                <div>
                  <Label htmlFor="refund-source">Source line</Label>
                  <Select value={sourceId} onValueChange={setSourceId}>
                    <SelectTrigger id="refund-source" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {refundSources.map((line) => (
                        <SelectItem key={line.id} value={line.id}>
                          {labelTransactionType(line.type)} · {line.description} ·{" "}
                          {money(line.amount)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {refundSource ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Original line: {labelTransactionType(refundSource.type)} ·{" "}
                      {refundSource.description} · {money(refundSource.amount)}. The original line
                      amount stays as posted.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-destructive">
                      This folio has no payment to refund.
                    </p>
                  )}
                  {refundRemaining != null ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Remaining on this payment: {money(refundRemaining)}.
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {authorizerNote ?? "Only an owner or manager can post this correction."}{" "}
                    Approval thresholds are not enforced on this post.
                  </p>
                </div>
              ) : null}
              <div>
                <Label htmlFor={`${kind}-amount`}>Amount</Label>
                <Input
                  id={`${kind}-amount`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="min-h-11"
                />
              </div>
              <div>
                <Label htmlFor={`${kind}-reference`}>Reference (optional)</Label>
                <Input
                  id={`${kind}-reference`}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  className="min-h-11"
                />
              </div>
              <div>
                <Label htmlFor={`${kind}-notes`}>
                  {kind === "refund" ? "Reason" : "Notes (optional)"}
                </Label>
                <Textarea
                  id={`${kind}-notes`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <Button
                type="button"
                className={cn(
                  "min-h-11 w-full",
                  kind === "payment" && "bg-[#2563eb] text-white hover:bg-[#1d4ed8]",
                  kind === "deposit" && "bg-[#C89933] text-[#251605] hover:bg-[#B5882D]",
                  kind === "refund" && "bg-rose-600 text-white hover:bg-rose-700",
                )}
                disabled={
                  mutation.isPending ||
                  !method ||
                  (kind === "refund" && (notes.trim() === "" || !refundSource))
                }
                onClick={() => mutation.mutate()}
              >
                {copy.cta}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ShiftPanel({
  shifts,
  openShift,
  loading,
  error,
  money,
  dateTime,
  restaurantId,
  onOpen,
  onClose,
  onMoved,
}: {
  shifts: Array<{
    id: string;
    staffName: string;
    status: "open" | "closed";
    openedAt: string;
    closedAt: string | null;
    openingCash: number | null;
    closingCash: number | null;
    cashIn: number;
    cashOut: number;
    hotelCash: number;
    expected: number;
    variance: number | null;
  }>;
  openShift: {
    id: string;
    staffName: string;
    status: "open" | "closed";
    openedAt: string;
    openingCash: number | null;
    closingCash: number | null;
    cashIn: number;
    cashOut: number;
    hotelCash: number;
    expected: number;
    variance: number | null;
  } | null;
  loading: boolean;
  error: string | null;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  restaurantId: string;
  onOpen: () => void;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [movementAmount, setMovementAmount] = useState("");
  const [movementKey, setMovementKey] = useState(() => crypto.randomUUID());
  const postMovement = useServerFn(postHotelDrawerMovement);
  const movement = useMutation({
    mutationFn: async (movementType: "cash_in" | "cash_out") => {
      if (!openShift) throw new Error("Open a hotel drawer first.");
      const amount = Number(movementAmount);
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("Enter an amount greater than zero.");
      return postMovement({
        data: {
          restaurantId,
          shiftId: openShift.id,
          movementType,
          amount,
          idempotencyKey: movementKey,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Drawer movement recorded");
      setMovementAmount("");
      setMovementKey(crypto.randomUUID());
      onMoved();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="space-y-4" data-testid="cashiering-shift-panel">
      <p className="text-sm text-muted-foreground">
        Hotel drawer expected is opening cash, plus cash in, minus cash out, plus hotel cash
        payments, deposits, and refunds on this drawer. Restaurant sales are not included.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Shift Status" value={openShift ? "Open" : "None"} />
        <Kpi label="Cashier" value={openShift?.staffName ?? "—"} />
        <Kpi
          label="Opening Cash"
          value={openShift?.openingCash == null ? "—" : money(openShift.openingCash)}
        />
        <Kpi label="Hotel drawer expected" value={openShift ? money(openShift.expected) : "—"} />
      </div>
      {openShift ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Cash in" value={money(openShift.cashIn)} />
          <Kpi label="Cash out" value={money(openShift.cashOut)} />
          <Kpi label="Hotel cash" value={money(openShift.hotelCash)} />
          <Kpi
            label="Variance"
            value={openShift.variance == null ? "—" : money(openShift.variance)}
          />
        </div>
      ) : null}
      <div>
        {openShift ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            Close Shift
          </Button>
        ) : (
          <Button
            type="button"
            className="min-h-11 bg-[#C89933] text-[#251605] hover:bg-[#B5882D]"
            onClick={onOpen}
          >
            Open Shift
          </Button>
        )}
      </div>
      {openShift ? (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="drawer-amount">Cash in or cash out</Label>
            <Input
              id="drawer-amount"
              type="number"
              min="0"
              step="0.01"
              value={movementAmount}
              onChange={(event) => setMovementAmount(event.target.value)}
              className="min-h-11 w-40"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={movement.isPending}
            onClick={() => movement.mutate("cash_in")}
          >
            Cash in
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={movement.isPending}
            onClick={() => movement.mutate("cash_out")}
          >
            Cash out
          </Button>
        </div>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading shifts…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && !error && shifts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No cashier shifts recorded yet.
        </p>
      ) : null}
      {shifts.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Cashier</th>
                <th className="px-3 py-2 font-medium">Opened</th>
                <th className="px-3 py-2 font-medium">Closed</th>
                <th className="px-3 py-2 text-right font-medium">Opening cash</th>
                <th className="px-3 py-2 text-right font-medium">Hotel drawer expected</th>
                <th className="px-3 py-2 text-right font-medium">Closing count</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id} className="border-t border-border">
                  <td className="px-3 py-2">{shift.staffName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dateTime(shift.openedAt)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {shift.closedAt ? dateTime(shift.closedAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {shift.openingCash === null ? "—" : money(shift.openingCash)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(shift.expected)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {shift.closingCash === null ? "—" : money(shift.closingCash)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {shift.variance == null ? "—" : money(shift.variance)}
                  </td>
                  <td className="px-3 py-2 capitalize">{shift.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
