import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Coins,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { FolioSearchPanel } from "@/packages/pms/components/cashiering/folio-search-panel";
import {
  AccountsPanel,
  DepositAllocationForm,
  ExceptionsPanel,
  ReportsPanel,
  TransfersPanel,
} from "@/packages/pms/components/cashiering/cashiering-phase-panels";
import {
  Kpi,
  StatusChip,
  SummaryTile,
  TxnMark,
  methodLabel,
  shortRef,
  type KpiTone,
} from "@/packages/pms/components/cashiering/cashiering-desk-shared";
import { labelTransactionType } from "@/packages/pms/components/cashiering/folio-bits";
import {
  InventoryState,
  InventoryStatusBadge,
} from "@/packages/pms/components/rooms/room-inventory-shared";
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
import type { CashieringSearchParams, CashieringTabId } from "@/packages/pms/lib/cashiering-shell";
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

function stayLabel(folio: FolioRow): string {
  if (folio.reservationStatus === "checked_in") return "In House";
  if (folio.reservationStatus === "checked_out") return "Checked Out";
  return folio.status === "closed" ? "Closed" : "Open";
}

function stayTone(folio: FolioRow): "neutral" | "success" | "warning" | "danger" | "info" {
  if (folio.reservationStatus === "checked_in") return "success";
  if (folio.reservationStatus === "checked_out") return "neutral";
  if (folio.status === "open") return "info";
  return "neutral";
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#DDD4C5] bg-card p-2.5 shadow-xs">
      <div className="relative flex-1 sm:max-w-md">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#7A7167]" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search guest name, folio no, room no, reservation no…"
          className="h-10 min-h-10 border-[#DDD4C5] bg-[#FAF8F4]/50 pl-10 pr-9 text-sm text-[#251605] placeholder:text-[#9A9187] focus-visible:border-[#C89933] focus-visible:ring-1 focus-visible:ring-[#C89933]"
          data-testid="cashiering-folio-search"
        />
        {search ? (
          <button
            type="button"
            onClick={() => onSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#7A7167] hover:bg-muted/80 hover:text-[#251605]"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Folio filters">
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
                "inline-flex h-9 items-center rounded-full border px-3 text-xs font-semibold transition-all duration-150",
                active
                  ? "border-[#C89933] bg-[#C89933] text-[#251605] shadow-xs ring-1 ring-[#C89933]"
                  : "border-[#DDD4C5] bg-[#FAF8F4]/70 text-[#5F554B] hover:border-[#C89933]/60 hover:bg-white hover:text-[#251605]",
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
  searchParams,
  onSearchParams,
  folioQuery,
  moduleSearch,
  canOperate,
  canManage,
  onTab,
}: {
  restaurantId: string;
  timezone: string;
  tab: CashieringTabId;
  searchParams: CashieringSearchParams;
  onSearchParams: (next: CashieringSearchParams) => void;
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
    enabled: tab === "overview" || tab === "transfers",
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
  const selected = matchedFolio;

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
    void queryClient.invalidateQueries({ queryKey: ["folio-search-guest", restaurantId] });
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
        <FolioSearchPanel
          restaurantId={restaurantId}
          searchParams={{ ...searchParams, tab: "folios" }}
          onSearchParams={onSearchParams}
          canOperate={canOperate}
          canManage={canManage}
          money={money}
          dateTime={dateTime}
        />
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
          sidebarExtra={
            <DepositAllocationForm
              restaurantId={restaurantId}
              selected={detailQuery.data ?? null}
              canManage={canManage}
              money={money}
              onRefresh={refresh}
            />
          }
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

      {tab === "transfers" ? (
        <TransfersPanel
          restaurantId={restaurantId}
          folios={folios.map((f) => ({
            id: f.id,
            folioNumber: f.folioNumber,
            guestName: f.guestName,
          }))}
          selected={detailQuery.data ?? null}
          canManage={canManage}
          money={money}
          dateTime={dateTime}
          dashboard={dashboardQuery.data}
          onRefresh={refresh}
          onSelectFolio={(folioId) => onTab("transfers", folioId)}
        />
      ) : null}

      {tab === "accounts" ? (
        <AccountsPanel restaurantId={restaurantId} canManage={canManage} money={money} />
      ) : null}

      {tab === "exceptions" ? (
        <ExceptionsPanel restaurantId={restaurantId} money={money} dateTime={dateTime} />
      ) : null}

      {tab === "reports" ? (
        <ReportsPanel restaurantId={restaurantId} money={money} timezone={timezone} />
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
      {loading ? (
        <div className="rounded-xl border border-[#DDD4C5] bg-card p-4 text-sm text-[#7A7167]">
          Loading cashiering…
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,0.85fr)]">
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
        <aside className="space-y-3.5">
          <SideCard title="Today’s Activity">
            {dashboard ? (
              <ul className="space-y-1 text-sm">
                <ActivityRow
                  label="Total Charges"
                  value={money(dashboard.todayCharges)}
                  icon={Plus}
                  onClick={() => onActivity("folios")}
                />
                <ActivityRow
                  label="Payments Received"
                  value={money(dashboard.todayPayments)}
                  icon={Banknote}
                  onClick={() => onActivity("payments")}
                />
                <ActivityRow
                  label="Deposits Collected"
                  value={money(dashboard.todayDeposits)}
                  icon={Coins}
                  onClick={() => onActivity("deposits")}
                />
                <ActivityRow
                  label="Refunds Processed"
                  value={money(dashboard.todayRefunds)}
                  icon={Undo2}
                  onClick={() => onActivity("refunds")}
                />
              </ul>
            ) : (
              <p className="p-3 text-center text-xs text-[#7A7167]">No activity loaded.</p>
            )}
          </SideCard>
          <SideCard
            title="Recent Transactions"
            action="View all"
            onAction={() => onActivity("payments")}
          >
            {recent.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F4]/50 p-4 text-center">
                <FileText className="mx-auto size-5 text-[#7A7167]" />
                <p className="mt-1.5 text-xs font-medium text-[#7A7167]">
                  No folio transactions recorded yet.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {recent.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-start justify-between gap-2.5 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4]/40 p-2 text-xs transition-colors hover:bg-white hover:shadow-2xs"
                  >
                    <TxnMark type={row.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[#251605]">{row.guestName}</p>
                      <p className="truncate text-[11px] text-[#7A7167]">
                        {methodLabel(row.type)} · {row.folioNumber}
                        {row.roomNumber ? ` · Room ${row.roomNumber}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-[#251605]">
                        {money(row.amount)}
                      </p>
                      <p className="text-[10px] text-[#7A7167]">{dateTime(row.postedAt)}</p>
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
                <SnapshotRow
                  label="Status"
                  value={<StatusChip label="Open" tone="green" />}
                />
                <SnapshotRow label="Cashier" value={openShift.staffName} />
                <SnapshotRow label="Shift opened" value={dateTime(openShift.openedAt)} />
                <SnapshotRow
                  label="Opening cash"
                  value={openShift.openingCash === null ? "—" : money(openShift.openingCash)}
                />
              </dl>
            ) : (
              <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F4]/50 p-4 text-center">
                <Clock3 className="mx-auto size-5 text-[#7A7167]" />
                <p className="mt-1.5 text-xs font-medium text-[#7A7167]">
                  No cashier shift is open.
                </p>
              </div>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-[#7A7167]">
              <CircleAlert className="mt-0.5 size-3 shrink-0 text-[#8A6A24]" />
              <span>
                Opening cash is the hotel drawer float. Restaurant sales are not included.
              </span>
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
  icon: Icon = Plus,
}: {
  label: string;
  value: string;
  onClick: () => void;
  icon?: LucideIcon;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#FAF8F4]"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded border border-[#E8DCC4]/80 bg-[#FAF4E6] text-[#8A6A24]">
            <Icon className="size-3.5" />
          </span>
          <span className="truncate text-xs font-medium text-[#5F554B] group-hover:text-[#251605]">
            {label}
          </span>
        </div>
        <span className="font-display text-sm font-bold tabular-nums text-[#251605]">
          {value}
        </span>
      </button>
    </li>
  );
}

function SnapshotRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-[#FAF8F4]/60">
      <dt className="text-xs font-medium text-[#7A7167]">{label}</dt>
      <dd className="text-right text-xs font-semibold text-[#251605]">{value}</dd>
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
    <section className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-[#DDD4C5] bg-[#FAF8F4]/80 px-4 py-2.5">
        <h2 className="font-display text-xs font-bold uppercase tracking-wider text-[#765719]">
          {title}
        </h2>
        {action && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A6A24] transition-colors hover:text-[#251605] hover:underline"
          >
            <span>{action}</span>
            <ArrowUpRight className="size-3" />
          </button>
        ) : null}
      </div>
      <div className="p-3.5">{children}</div>
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
          className="size-8 rounded-lg text-[#7A7167] hover:bg-muted/80 hover:text-[#251605]"
          aria-label={`Actions for ${folio.folioNumber}`}
          data-testid="folio-row-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 border-[#DDD4C5]" onClick={(event) => event.stopPropagation()}>
        <FolioPageItem folioId={folio.id} label="Open folio" icon={FileText} />
        <FolioPageItem
          folioId={folio.id}
          action="charge"
          label="Post Charge"
          icon={Plus}
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="payment"
          label="Receive Payment"
          icon={Banknote}
          disabled={!canOperate || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="deposit"
          label="Add Deposit"
          icon={Coins}
          disabled={!canOperate || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="refund"
          label="Refund"
          icon={Undo2}
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="discount"
          label="Discount"
          icon={SlidersHorizontal}
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="adjustment"
          label="Adjust"
          icon={SlidersHorizontal}
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="close"
          label="Close Folio"
          icon={CircleAlert}
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
  icon: Icon,
  disabled,
}: {
  folioId: string;
  label: string;
  action?: string;
  icon?: LucideIcon;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <DropdownMenuItem disabled className="gap-2 text-xs">
        {Icon ? <Icon className="size-3.5" /> : null}
        <span>{label}</span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem asChild className="cursor-pointer gap-2 text-xs">
      <Link
        to="/restaurant/pms/cashiering/folios/$folioId"
        params={{ folioId }}
        search={action ? { action } : {}}
      >
        {Icon ? <Icon className="size-3.5 text-[#8A6A24]" /> : null}
        <span>{label}</span>
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
    <section className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-[#DDD4C5] bg-[#FAF8F4]/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-sm font-bold text-[#251605]">Guest Folios</h2>
          <span className="rounded-full border border-[#DDD4C5] bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-[#765719]">
            {total}
          </span>
        </div>
        <span className="text-xs text-[#7A7167]">
          Click any row to inspect folio
        </span>
      </div>
      {loading ? <p className="p-4 text-sm text-[#7A7167]">Loading folios…</p> : null}
      {error ? <p className="p-4 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="p-8">
          <InventoryState
            state="empty"
            title="No folios match this view"
            description="Try adjusting your search criteria or switching the filter pills."
          />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-[#DDD4C5] bg-[#F8F5F0] text-left text-[11px] font-semibold uppercase tracking-wider text-[#765719]">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Folio No</th>
                <th className="px-3.5 py-2.5 font-semibold">Guest</th>
                <th className="px-3.5 py-2.5 font-semibold">Room</th>
                <th className="px-3.5 py-2.5 font-semibold">Reservation</th>
                <th className="px-3.5 py-2.5 font-semibold">Status</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">Balance</th>
                <th className="px-3.5 py-2.5 font-semibold">Currency</th>
                <th className="px-3.5 py-2.5 text-center font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E1D7]/70">
              {rows.map((folio) => {
                const settled = Math.abs(folio.balance) < 0.01;
                const isSelected = selectedId === folio.id;
                return (
                  <tr
                    key={folio.id}
                    data-testid="folio-row"
                    onClick={() => onSelect(folio)}
                    className={cn(
                      "cursor-pointer transition-colors",
                      isSelected
                        ? "bg-[#C89933]/12 border-l-[3px] border-l-[#C89933]"
                        : "hover:bg-[#FDFBF7]",
                    )}
                  >
                    <td className="px-3.5 py-3 font-semibold text-[#251605]">
                      <Link
                        to="/restaurant/pms/cashiering/folios/$folioId"
                        params={{ folioId: folio.id }}
                        className="font-semibold text-foreground hover:text-[#8a6a1f] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                        title="Open guest folio workspace"
                      >
                        {folio.folioNumber}
                      </Link>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="grid size-7 shrink-0 place-items-center rounded-full border border-[#E8DCC4] bg-[#FAF0DC] text-[10px] font-bold text-[#765719]">
                          {folio.guestName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#251605]">{folio.guestName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="font-medium text-[#251605]">{folio.roomNumber ?? "—"}</div>
                      {folio.roomTypeName ? (
                        <div className="truncate text-[11px] text-[#7A7167]">
                          {folio.roomTypeName}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3.5 py-3 font-mono text-xs text-[#5F554B]">
                      {folio.confirmationNumber ?? "—"}
                    </td>
                    <td className="px-3.5 py-3">
                      <InventoryStatusBadge tone={stayTone(folio)}>
                        {stayLabel(folio)}
                      </InventoryStatusBadge>
                      {folio.unsettledCheckout ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-destructive">
                          <CircleAlert className="size-3 shrink-0" />
                          <span>Unsettled checkout</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <span
                        className={cn(
                          "tabular-nums text-sm font-semibold",
                          settled
                            ? "text-[#7A7167]"
                            : folio.balance > 0
                              ? "text-rose-600"
                              : "text-emerald-700",
                        )}
                      >
                        {money(folio.balance)}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-[#5F554B]">
                        {folio.currency}
                      </span>
                    </td>
                    <td
                      className="px-3.5 py-3 text-center"
                      onClick={(event) => event.stopPropagation()}
                    >
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
      <div className="flex items-center justify-between border-t border-[#DDD4C5] bg-[#FAF8F4]/60 px-4 py-2.5 text-xs text-[#7A7167]">
        <span>
          Showing {rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
          {(page - 1) * PAGE_SIZE + rows.length} of {total}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-[#DDD4C5] bg-white text-xs hover:border-[#C89933]/60 hover:text-[#251605]"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-[#DDD4C5] bg-white text-xs hover:border-[#C89933]/60 hover:text-[#251605]"
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
      <aside className="rounded-xl border border-[#DDD4C5] bg-card p-5 text-sm text-[#7A7167] shadow-xs">
        Loading folio…
      </aside>
    );
  }
  if (!folio) {
    return (
      <aside className="rounded-xl border border-dashed border-[#DDD4C5] bg-[#FAF8F4]/50 p-6 text-center text-sm text-[#7A7167] shadow-xs">
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
      className="space-y-4 rounded-xl border border-[#DDD4C5] bg-card p-4 shadow-xs"
      data-testid="folio-quick-view"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid size-7 shrink-0 place-items-center rounded-full border border-[#E8DCC4] bg-[#FAF0DC] text-[10px] font-bold text-[#765719]">
              {folio.guestName.slice(0, 2).toUpperCase()}
            </div>
            <h2 className="font-display text-lg font-bold leading-tight text-[#251605]">
              {folio.guestName}
            </h2>
          </div>
          <p className="mt-1 text-sm font-semibold text-[#251605]">{folio.folioNumber}</p>
          <p className="text-xs text-[#7A7167]">
            {folio.roomNumber ? `Room ${folio.roomNumber}` : "No room"}
            {folio.roomTypeName ? ` · ${folio.roomTypeName}` : ""}
          </p>
          <p className="text-xs text-[#7A7167]">
            {folio.confirmationNumber
              ? `Reservation ${folio.confirmationNumber}`
              : "No reservation"}
          </p>
          <p className="text-xs text-[#7A7167]">
            {folio.arrivalDate ? formatStayDate(folio.arrivalDate) : "—"} –{" "}
            {folio.departureDate ? formatStayDate(folio.departureDate) : "—"}
          </p>
        </div>
        <InventoryStatusBadge tone={stayTone(folio)}>
          {stayLabel(folio)}
        </InventoryStatusBadge>
      </div>
      {folio.unsettledCheckout ? (
        <div className="flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">
          <CircleAlert className="size-4 shrink-0" />
          <span>Unsettled checkout exception. The folio is still open.</span>
        </div>
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
      <div
        className={cn(
          "rounded-xl border px-3.5 py-3",
          settled
            ? "border-[#DDD4C5] bg-[#FAF8F4]/80"
            : "border-destructive/20 bg-destructive/10",
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#765719]">
          Outstanding Balance
        </p>
        <p
          className={cn(
            "mt-1 font-display text-2xl font-bold tabular-nums",
            settled ? "text-[#251605]" : "text-destructive",
          )}
        >
          {money(folio.balance)}
        </p>
      </div>
      <div>
        <h3 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-[#765719]">
          Recent transactions
        </h3>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F4]/40 p-3 text-center text-xs text-[#7A7167]">
            Nothing posted on this folio yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-2.5 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4]/40 p-2 text-xs transition-colors hover:bg-white hover:shadow-2xs"
              >
                <TxnMark type={row.type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[#251605]">{row.description}</p>
                  <p className="text-[11px] text-[#7A7167]">
                    {methodLabel(row.type)} · {dateTime(row.postedAt)}
                  </p>
                </div>
                <span className="font-semibold tabular-nums text-[#251605]">{money(row.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          asChild
          size="sm"
          className="min-h-9 bg-[#C89933] px-4 font-semibold text-[#251605] hover:bg-[#B5882D]"
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
          className="min-h-9 border-[#DDD4C5] bg-white text-xs hover:border-[#C89933]/60 hover:text-[#251605]"
          onClick={() => window.print()}
        >
          Print statement
        </Button>
      </div>
      <p className="text-[11px] text-[#7A7167]">
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
  sidebarExtra,
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
  sidebarExtra?: ReactNode;
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
      <div className="space-y-4">
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
        {sidebarExtra}
      </div>
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
