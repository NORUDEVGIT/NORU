import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coins,
  CreditCard,
  ExternalLink,
  Eye,
  FileText,
  MoreHorizontal,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Split,
  Undo2,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { FolioSearchPanel } from "@/packages/pms/components/cashiering/folio-search-panel";
import {
  AccountsPanel,
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
import { CashierControl } from "@/packages/pms/components/cashiering/cashier-control-panel";
import {
  getCashieringCorrectionNotice,
  getCashieringDashboard,
  getDefaultDepositPolicy,
  getFolio,
  listCashierShifts,
  listFolios,
  listLedgerEntries,
  postFolioEntry,
  type FolioDetail,
  type FolioRow,
  type LedgerEntryRow,
} from "@/packages/pms/lib/cashiering.functions";
import type {
  CashieringActivityFilter,
  CashieringSearchParams,
  CashieringTabId,
} from "@/packages/pms/lib/cashiering-shell";
import { stayNights } from "@/packages/pms/lib/folio-workspace";
import { remainingOnPaymentSource } from "@/packages/pms/lib/cashiering.server";
import {
  POLISH1_PAYMENT_METHODS_HREF,
  cashieringTenderOptions,
  emptyPolish1Snapshot,
} from "@/packages/pms/lib/pms-polish1-payment-admin";
import { usePmsSet1Foundation } from "@/packages/pms/lib/use-pms-set1";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { formatStayDate } from "@/shared/lib/property-dates";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { selectOwnOpenShift } from "@/packages/pms/lib/cashiering-control";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  DepositReceiptModal,
  TenderReceiptPrint,
  type TenderReceipt,
} from "@/packages/pms/components/cashiering/folio-dialogs";
import { getCashieringDocumentProperty } from "@/packages/pms/lib/cashiering-invoices.functions";
import {
  cashieringPropertyHotelName,
  type CashieringDocumentProperty,
} from "@/packages/pms/lib/cashiering-document-property";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";

const PAGE_SIZE = 10;
const LEDGER_TYPES = [
  "charge",
  "payment",
  "deposit",
  "refund",
  "adjustment",
  "discount",
  "transfer_in",
  "transfer_out",
] as const;

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
  membershipId,
  role,
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
  membershipId: string;
  role: string;
  onTab: (
    tab: CashieringTabId,
    folio?: string | null,
    extra?: Partial<CashieringSearchParams>,
  ) => void;
}) {
  const businessDate = usePropertyBusinessDate(restaurantId, timezone);
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const [search, setSearch] = useState(moduleSearch);
  const [filter, setFilter] = useState<FolioFilter>("all");
  const [page, setPage] = useState(1);
  const [sourceLineId, setSourceLineId] = useState<string | null>(null);

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
    queryKey: ["cashiering-dashboard", restaurantId, businessDate],
    queryFn: () => fetchDashboard({ data: { restaurantId, today: businessDate } }),
    retry: false,
  });
  const foliosQuery = useQuery({
    queryKey: ["cashiering-folios", restaurantId],
    queryFn: () => fetchFolios({ data: { restaurantId, status: "all" } }),
    enabled: tab === "overview",
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
  const openShift = selectOwnOpenShift(shifts, membershipId);

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
      if (filter === "departures") return folio.departureDate === businessDate;
      if (filter === "balance") return folio.balance > 0.009;
      if (filter === "open") return folio.status === "open";
      if (filter === "closed") return folio.status === "closed";
      return true;
    });
  }, [filter, folios, search, businessDate]);

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

  const activity =
    searchParams.activity === "payment" ||
    searchParams.activity === "deposit" ||
    searchParams.activity === "refund" ||
    searchParams.activity === "transfer"
      ? searchParams.activity
      : "all";
  const foliosById = useMemo(() => {
    const map = new Map<string, FolioRow>();
    for (const f of folios) {
      map.set(f.id, f);
    }
    return map;
  }, [folios]);

  const financialActivity = useMemo(() => {
    const filtered = ledger.filter((row) => {
      const isTransfer = row.type === "transfer_in" || row.type === "transfer_out";
      const isTender = row.type === "payment" || row.type === "deposit" || row.type === "refund";
      if (activity === "all") return isTender || isTransfer;
      if (activity === "transfer") return isTransfer;
      return row.type === activity;
    });

    return filtered.map((row) => {
      const f = foliosById.get(row.folioId);
      const name =
        (row.guestName && row.guestName !== "Guest" ? row.guestName : null) ??
        (f?.guestName && f.guestName !== "Guest" ? f.guestName : null) ??
        row.guestName ??
        "Guest";
      const room = row.roomNumber ?? f?.roomNumber ?? null;
      const folioNo =
        row.folioNumber && row.folioNumber !== "—" ? row.folioNumber : (f?.folioNumber ?? "—");

      return {
        ...row,
        guestName: name,
        roomNumber: room,
        folioNumber: folioNo,
      };
    });
  }, [activity, foliosById, ledger]);

  const recentTransactions = useMemo(() => {
    return ledger.slice(0, 6).map((row) => {
      const f = foliosById.get(row.folioId);
      const name =
        (row.guestName && row.guestName !== "Guest" ? row.guestName : null) ??
        (f?.guestName && f.guestName !== "Guest" ? f.guestName : null) ??
        row.guestName ??
        "Guest";
      const room = row.roomNumber ?? f?.roomNumber ?? null;
      const folioNo =
        row.folioNumber && row.folioNumber !== "—" ? row.folioNumber : (f?.folioNumber ?? "—");

      return {
        ...row,
        guestName: name,
        roomNumber: room,
        folioNumber: folioNo,
      };
    });
  }, [foliosById, ledger]);

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
          recent={recentTransactions}
          financialActivity={financialActivity}
          activity={activity}
          activityLoading={ledgerQuery.isLoading}
          activityError={ledgerQuery.isError ? (ledgerQuery.error as Error).message : null}
          selectedFolio={detailQuery.data ?? null}
          depositPolicySummary={depositPolicyQuery.data?.summary ?? null}
          authorizerNote={correctionNoticeQuery.data?.authorizer ?? null}
          openShift={openShift}
          selectedId={selected?.id ?? null}
          canOperate={canOperate}
          canManage={canManage}
          canAllocate={role === "owner" || role === "manager" || role === "accountant"}
          onSelect={selectFolio}
          onActivity={(next) =>
            onSearchParams({
              ...searchParams,
              tab: "overview",
              activity: next,
              ...(selected?.id ? { folio: selected.id } : {}),
            })
          }
          onOpenShift={() => onTab("cashier-shift", null)}
          openFolios={folios}
          sourceLineId={sourceLineId}
          onChooseFolio={(folioId) => {
            const folio = folios.find((row) => row.id === folioId);
            if (folio) selectFolio(folio);
          }}
          onChooseActivity={(row) => {
            const folio = folios.find((item) => item.id === row.folioId);
            if (folio) selectFolio(folio);
            if (row.type === "payment" || row.type === "deposit") setSourceLineId(row.id);
          }}
          restaurantId={restaurantId}
          onRefresh={refresh}
          returnToTab={searchParams.returnToTab}
          onReturn={() => {
            if (searchParams.returnToTab) {
              onTab(searchParams.returnToTab, null);
            }
          }}
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
        <CashierControl
          restaurantId={restaurantId}
          membershipId={membershipId}
          role={role}
          canOperate={canOperate}
          canManage={canManage}
          money={money}
          dateTime={dateTime}
          onNavigate={(next, extra) => onTab(next, null, extra)}
        />
      ) : null}
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
  financialActivity,
  activity,
  activityLoading,
  activityError,
  selectedFolio,
  depositPolicySummary,
  authorizerNote,
  openShift,
  selectedId,
  canOperate,
  canManage,
  canAllocate,
  onSelect,
  onActivity,
  onOpenShift,
  openFolios,
  sourceLineId,
  onChooseFolio,
  onChooseActivity,
  restaurantId,
  onRefresh,
  returnToTab,
  onReturn,
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
        transfersSupported?: boolean;
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
  financialActivity: LedgerEntryRow[];
  activity: CashieringActivityFilter;
  activityLoading: boolean;
  activityError: string | null;
  selectedFolio: FolioDetail | null;
  depositPolicySummary: string | null;
  authorizerNote: string | null;
  openShift: {
    staffName: string;
    openedAt: string;
    openingCash: number | null;
    status: string;
  } | null;
  selectedId: string | null;
  canOperate: boolean;
  canManage: boolean;
  canAllocate: boolean;
  onSelect: (folio: FolioRow) => void;
  onActivity: (activity: CashieringActivityFilter) => void;
  onOpenShift: () => void;
  openFolios: FolioRow[];
  sourceLineId: string | null;
  onChooseFolio: (folioId: string) => void;
  onChooseActivity: (row: LedgerEntryRow) => void;
  restaurantId: string;
  onRefresh: () => void;
  returnToTab?: CashieringTabId;
  onReturn?: () => void;
}) {
  const fetchDocumentProperty = useServerFn(getCashieringDocumentProperty);
  const documentPropertyQuery = useQuery({
    queryKey: ["cashiering-document-property", restaurantId],
    queryFn: () => fetchDocumentProperty({ data: { restaurantId } }),
  });
  const documentProperty = documentPropertyQuery.data ?? null;

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
          <button
            type="button"
            className="rounded-xl text-left outline-none ring-[#C89933] focus-visible:ring-2"
            aria-pressed={activity === "payment"}
            onClick={() => onActivity("payment")}
          >
            <Kpi
              label="Payments"
              value={money(dashboard.todayPayments)}
              hint="Click to filter financial activity"
              tone="green"
              icon={Banknote}
            />
          </button>
          <button
            type="button"
            className="rounded-xl text-left outline-none ring-[#C89933] focus-visible:ring-2"
            aria-pressed={activity === "deposit"}
            onClick={() => onActivity("deposit")}
          >
            <Kpi
              label="Deposits"
              value={money(dashboard.todayDeposits)}
              hint="Click to filter financial activity"
              tone="gold"
              icon={Coins}
            />
          </button>
          <button
            type="button"
            className="rounded-xl text-left outline-none ring-[#C89933] focus-visible:ring-2"
            aria-pressed={activity === "refund"}
            onClick={() => onActivity("refund")}
          >
            <Kpi
              label="Refunds"
              value={money(dashboard.todayRefunds)}
              hint="Click to filter financial activity"
              tone="rose"
              icon={Undo2}
            />
          </button>
          <Kpi
            label="Open Cashier Shift"
            value={dashboard.openShifts > 0 ? String(dashboard.openShifts) : "None"}
            hint={
              openShift
                ? `Your shift opened ${dateTime(openShift.openedAt)}`
                : "No shift open for you"
            }
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
                  onClick={() => onActivity("payment")}
                />
                <ActivityRow
                  label="Deposits Collected"
                  value={money(dashboard.todayDeposits)}
                  icon={Coins}
                  onClick={() => onActivity("deposit")}
                />
                <ActivityRow
                  label="Refunds Processed"
                  value={money(dashboard.todayRefunds)}
                  icon={Undo2}
                  onClick={() => onActivity("refund")}
                />
              </ul>
            ) : (
              <p className="p-3 text-center text-xs text-[#7A7167]">No activity loaded.</p>
            )}
          </SideCard>
          <SideCard
            title="Recent Transactions"
            action="View all"
            onAction={() => onActivity("all")}
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
          <SideCard title="Cashier Shift Snapshot" action="Open" onAction={onOpenShift}>
            {openShift ? (
              <dl className="space-y-1 text-sm">
                <SnapshotRow label="Status" value={<StatusChip label="Open" tone="green" />} />
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
      <FinancialActivityPanel
        activity={activity}
        rows={financialActivity}
        loading={activityLoading}
        error={activityError}
        selected={selectedFolio}
        canOperate={canOperate}
        canManage={canManage}
        canAllocate={canAllocate}
        restaurantId={restaurantId}
        depositPolicySummary={depositPolicySummary}
        authorizerNote={authorizerNote}
        money={money}
        dateTime={dateTime}
        onActivity={onActivity}
        onRefresh={onRefresh}
        openFolios={openFolios}
        sourceLineId={sourceLineId}
        pendingFolioId={selectedId}
        onChooseFolio={onChooseFolio}
        onChooseActivity={onChooseActivity}
        dashboard={dashboard}
        returnToTab={returnToTab}
        onReturn={onReturn}
        documentProperty={documentProperty}
      />
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
        <span className="font-display text-sm font-bold tabular-nums text-[#251605]">{value}</span>
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
      <DropdownMenuContent
        align="end"
        className="w-48 border-[#DDD4C5]"
        onClick={(event) => event.stopPropagation()}
      >
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
        <span className="text-xs text-[#7A7167]">Click any row to inspect folio</span>
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
        <InventoryStatusBadge tone={stayTone(folio)}>{stayLabel(folio)}</InventoryStatusBadge>
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
          settled ? "border-[#DDD4C5] bg-[#FAF8F4]/80" : "border-destructive/20 bg-destructive/10",
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
                <span className="font-semibold tabular-nums text-[#251605]">
                  {money(row.amount)}
                </span>
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

const ACTIVITY_FILTERS: Array<{
  id: CashieringActivityFilter;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "all", label: "All activity", icon: Activity },
  { id: "payment", label: "Payments", icon: Banknote },
  { id: "deposit", label: "Deposits", icon: Coins },
  { id: "refund", label: "Refunds", icon: Undo2 },
  { id: "transfer", label: "Transfers", icon: ArrowLeftRight },
];

function FinancialActivityPanel({
  activity,
  rows,
  loading,
  error,
  selected,
  canOperate,
  canManage,
  canAllocate,
  restaurantId,
  depositPolicySummary,
  authorizerNote,
  money,
  dateTime,
  onActivity,
  onRefresh,
  openFolios,
  sourceLineId,
  pendingFolioId,
  onChooseFolio,
  onChooseActivity,
  dashboard,
  returnToTab,
  onReturn,
  documentProperty,
}: {
  activity: CashieringActivityFilter;
  rows: LedgerEntryRow[];
  loading: boolean;
  error: string | null;
  selected: FolioDetail | null;
  canOperate: boolean;
  canManage: boolean;
  canAllocate: boolean;
  restaurantId: string;
  depositPolicySummary: string | null;
  authorizerNote: string | null;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  onActivity: (activity: CashieringActivityFilter) => void;
  onRefresh: () => void;
  openFolios: FolioRow[];
  sourceLineId: string | null;
  pendingFolioId: string | null;
  onChooseFolio: (folioId: string) => void;
  onChooseActivity: (row: LedgerEntryRow) => void;
  dashboard:
    | {
        openFolios: number;
        transfersSupported?: boolean;
      }
    | undefined;
  returnToTab?: CashieringTabId;
  onReturn?: () => void;
  documentProperty?: CashieringDocumentProperty | null;
}) {
  const [receipt, setReceipt] = useState<TenderReceipt | null>(null);

  useEffect(() => {
    if (!receipt) return;
    const clear = () => setReceipt(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, [receipt]);

  const title =
    activity === "all"
      ? "Financial Activity"
      : activity === "payment"
        ? "Payments"
        : activity === "deposit"
          ? "Deposits"
          : activity === "refund"
            ? "Refunds"
            : "Transfers";
  return (
    <section className="space-y-3" data-testid="cashiering-financial-activity">
      <div className="flex flex-col gap-3 rounded-xl border border-[#DDD4C5] bg-card p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#251605]">Financial Activity</h2>
          <p className="text-xs text-[#7A7167]">
            Payments, deposits and refunds remain separate financial classifications.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Financial activity filter">
          {ACTIVITY_FILTERS.map((item) => {
            const Icon = item.icon;
            const active = activity === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                data-testid={`cashiering-activity-${item.id}`}
                onClick={() => onActivity(item.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                  active
                    ? "border-[#C89933] bg-[#C89933] text-[#251605]"
                    : "border-[#DDD4C5] bg-[#FAF8F4] text-[#5F554B] hover:border-[#C89933]/60 hover:bg-white",
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <LedgerTable
          title={title}
          rows={rows}
          loading={loading}
          error={error}
          empty={`No ${title.toLowerCase()} recorded yet.`}
          money={money}
          dateTime={dateTime}
          selectedFolioId={selected?.id ?? null}
          onSelect={onChooseActivity}
          actions={(row) => (
            <ActivityRowActions row={row} canAllocate={canAllocate} canManage={canManage} />
          )}
        />
        {activity === "all" ? (
          <FinancialActivityHelp
            selected={selected}
            canOperate={canOperate}
            canManage={canManage}
            money={money}
            onSelectActivity={onActivity}
          />
        ) : activity === "transfer" ? (
          <TransferActivityHelp selected={selected} money={money} />
        ) : (
          <div className="space-y-4">
            <ReceivePanel
              kind={activity}
              restaurantId={restaurantId}
              folio={selected}
              folios={openFolios}
              preferredSourceId={sourceLineId}
              pendingFolioId={pendingFolioId}
              onChooseFolio={onChooseFolio}
              canPost={activity === "refund" ? canManage : canOperate}
              money={money}
              depositPolicySummary={depositPolicySummary}
              authorizerNote={authorizerNote}
              onPosted={onRefresh}
              returnToTab={returnToTab}
              onReturn={onReturn}
              documentProperty={documentProperty}
              onReceipt={(r) => setReceipt(r)}
            />
          </div>
        )}
      </div>
      {activity === "transfer" ? (
        <TransfersPanel
          restaurantId={restaurantId}
          folios={openFolios.map((folio) => ({
            id: folio.id,
            folioNumber: folio.folioNumber,
            guestName: folio.guestName,
          }))}
          selected={selected}
          canManage={canManage}
          money={money}
          dateTime={dateTime}
          dashboard={dashboard}
          onRefresh={onRefresh}
          onSelectFolio={onChooseFolio}
        />
      ) : null}

      {receipt ? (
        <>
          <DepositReceiptModal
            receipt={receipt}
            open={Boolean(receipt)}
            money={money}
            dateTime={dateTime}
            onClose={() => setReceipt(null)}
          />
          <TenderReceiptPrint receipt={receipt} money={money} dateTime={dateTime} />
        </>
      ) : null}
    </section>
  );
}

function TransferActivityHelp({
  selected,
  money,
}: {
  selected: FolioDetail | null;
  money: (value: number) => string;
}) {
  return (
    <aside className="space-y-3 rounded-xl border border-[#DDD4C5] bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2.5 border-b border-[#E8E1D7] pb-3">
        <div className="flex size-8 items-center justify-center rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] text-[#8A6A24]">
          <ArrowLeftRight className="size-4" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold text-[#251605]">Folio Transfers</h3>
          <p className="text-[11px] text-[#7A7167]">Reallocate balances across active accounts</p>
        </div>
      </div>

      {selected ? (
        <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7A7167]">
              Selected Folio
            </span>
            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 border border-emerald-200">
              Active
            </span>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#251605]">{selected.guestName}</p>
            <p className="text-[11px] text-[#7A7167]">
              {selected.folioNumber} {selected.roomNumber ? `· Room ${selected.roomNumber}` : ""}
            </p>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-[#E8E1D7]/60 text-xs">
            <span className="text-[#7A7167]">Current Balance</span>
            <span className="font-bold tabular-nums text-[#251605]">{money(selected.balance)}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F4]/50 p-3.5 text-center text-xs text-[#7A7167]">
          Select a source folio from the list or ledger above to start transferring items.
        </div>
      )}

      <div className="space-y-1.5 text-xs text-[#5F554B]">
        <p className="text-[11px] font-medium text-[#251605]">Transfer Capabilities:</p>
        <ul className="space-y-1 text-[11px] text-[#7A7167]">
          <li className="flex items-start gap-1.5">
            <span className="mt-1 size-1 rounded-full bg-[#8A6A24]" />
            <span>Move individual guest line items between room folios.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-1 size-1 rounded-full bg-[#8A6A24]" />
            <span>Transfer balances to company or group accounts.</span>
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-1 size-1 rounded-full bg-[#8A6A24]" />
            <span>Use the full transfer workspace rendered below.</span>
          </li>
        </ul>
      </div>
    </aside>
  );
}

function FinancialActivityHelp({
  selected,
  canOperate,
  canManage,
  money,
  onSelectActivity,
}: {
  selected: FolioDetail | null;
  canOperate: boolean;
  canManage: boolean;
  money?: (value: number) => string;
  onSelectActivity?: (activity: CashieringActivityFilter) => void;
}) {
  if (!selected) {
    return (
      <aside className="flex flex-col justify-between rounded-xl border border-[#DDD4C5] bg-card p-5 shadow-xs">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] text-[#8A6A24]">
              <Wallet className="size-4.5" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-[#251605]">
                Financial Actions
              </h3>
              <p className="text-[11px] text-[#7A7167]">Direct folio operations & settlement</p>
            </div>
          </div>
          <p className="text-xs text-[#5F554B] leading-relaxed">
            Select a guest folio from the table above or click any transaction row in the ledger to
            view balance details, record receipts, or take instant financial action.
          </p>

          <div className="grid gap-2 pt-2">
            <button
              type="button"
              onClick={() => onSelectActivity?.("payment")}
              className="flex items-center justify-between rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] px-3 py-2 text-xs font-medium text-[#251605] hover:border-[#146C43] hover:bg-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Banknote className="size-3.5 text-[#146C43]" />
                <span>Receive Payment</span>
              </div>
              <ChevronRight className="size-3 text-[#7A7167]" />
            </button>
            <button
              type="button"
              onClick={() => onSelectActivity?.("deposit")}
              className="flex items-center justify-between rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] px-3 py-2 text-xs font-medium text-[#251605] hover:border-[#8A6A24] hover:bg-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Coins className="size-3.5 text-[#8A6A24]" />
                <span>Record Deposit</span>
              </div>
              <ChevronRight className="size-3 text-[#7A7167]" />
            </button>
            <button
              type="button"
              onClick={() => onSelectActivity?.("refund")}
              className="flex items-center justify-between rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] px-3 py-2 text-xs font-medium text-[#251605] hover:border-[#B91C1C] hover:bg-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Undo2 className="size-3.5 text-[#B91C1C]" />
                <span>Post Refund</span>
              </div>
              <ChevronRight className="size-3 text-[#7A7167]" />
            </button>
            <button
              type="button"
              onClick={() => onSelectActivity?.("transfer")}
              className="flex items-center justify-between rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] px-3 py-2 text-xs font-medium text-[#251605] hover:border-[#0369A1] hover:bg-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="size-3.5 text-[#0369A1]" />
                <span>Balance Transfer</span>
              </div>
              <ChevronRight className="size-3 text-[#7A7167]" />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  const open = selected.status === "open";
  const hasBalance = selected.balance > 0.009;

  return (
    <aside className="space-y-4 rounded-xl border border-[#DDD4C5] bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] pb-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7A7167]">
            Active Guest Folio
          </span>
          <h3 className="font-display text-sm font-bold text-[#251605]">{selected.guestName}</h3>
          <p className="text-[11px] text-[#7A7167]">
            {selected.folioNumber}
            {selected.roomNumber ? ` · Room ${selected.roomNumber}` : ""}
            {selected.roomTypeName ? ` · ${selected.roomTypeName}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
            open
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-[#DDD4C5] bg-[#FAF8F4] text-[#7A7167]",
          )}
        >
          {open ? "Open Folio" : "Closed"}
        </span>
      </div>

      <div
        className={cn(
          "rounded-lg border p-3",
          hasBalance ? "border-amber-200 bg-amber-50/60" : "border-[#E8E1D7] bg-[#FAF8F4]",
        )}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7A7167]">
          Outstanding Balance
        </span>
        <p
          className={cn(
            "font-display text-xl font-bold tabular-nums mt-0.5",
            hasBalance ? "text-[#B91C1C]" : "text-[#146C43]",
          )}
        >
          {money ? money(selected.balance) : selected.balance.toFixed(2)}
        </p>
      </div>

      <div className="grid gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-9 justify-start gap-2 border-[#DDD4C5] bg-white text-xs font-semibold text-[#251605] hover:border-[#C89933] hover:bg-[#FAF8F4]"
        >
          <Link to="/restaurant/pms/cashiering/folios/$folioId" params={{ folioId: selected.id }}>
            <ExternalLink className="size-3.5 text-[#8A6A24]" />
            <span>Open Folio Workspace</span>
          </Link>
        </Button>

        {canOperate && open ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSelectActivity?.("payment")}
              className="h-9 justify-start gap-2 border-[#DDD4C5] bg-white text-xs font-semibold text-[#251605] hover:border-[#146C43] hover:bg-[#FAF8F4]"
            >
              <Banknote className="size-3.5 text-[#146C43]" />
              <span>Receive Payment</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSelectActivity?.("deposit")}
              className="h-9 justify-start gap-2 border-[#DDD4C5] bg-white text-xs font-semibold text-[#251605] hover:border-[#8A6A24] hover:bg-[#FAF8F4]"
            >
              <Coins className="size-3.5 text-[#8A6A24]" />
              <span>Record Deposit</span>
            </Button>
          </>
        ) : null}

        {canManage && open ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelectActivity?.("refund")}
            className="h-9 justify-start gap-2 border-[#DDD4C5] bg-white text-xs font-semibold text-[#251605] hover:border-[#B91C1C] hover:bg-[#FAF8F4]"
          >
            <Undo2 className="size-3.5 text-[#B91C1C]" />
            <span>Post Refund</span>
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

function ActivityRowActions({
  row,
  canAllocate,
  canManage,
}: {
  row: LedgerEntryRow;
  canAllocate: boolean;
  canManage: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 border-[#DDD4C5] bg-white px-2 text-[11px] font-semibold text-[#251605] hover:border-[#C89933] hover:bg-[#FAF8F4] shadow-2xs"
        >
          <span>Actions</span>
          <MoreHorizontal className="size-3 text-[#7A7167]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-xl border border-[#DDD4C5] bg-white p-1.5 shadow-lg"
      >
        <DropdownMenuItem
          asChild
          className="cursor-pointer rounded-lg text-xs font-medium hover:bg-[#FAF8F4]"
        >
          <Link
            to="/restaurant/pms/cashiering/folios/$folioId"
            params={{ folioId: row.folioId }}
            search={{ tab: "payments" }}
            className="flex items-center gap-2"
          >
            <Eye className="size-3.5 text-[#5F554B]" />
            <span>View transaction details</span>
          </Link>
        </DropdownMenuItem>

        {row.type === "payment" && canAllocate ? (
          <DropdownMenuItem
            asChild
            className="cursor-pointer rounded-lg text-xs font-medium hover:bg-[#FAF8F4]"
          >
            <Link
              to="/restaurant/pms/cashiering/folios/$folioId"
              params={{ folioId: row.folioId }}
              search={{ tab: "payments" }}
              className="flex items-center gap-2 text-[#8A6A24]"
            >
              <Split className="size-3.5 text-[#8A6A24]" />
              <span>Review allocation options</span>
            </Link>
          </DropdownMenuItem>
        ) : null}

        {row.type === "deposit" && canManage ? (
          <DropdownMenuItem
            asChild
            className="cursor-pointer rounded-lg text-xs font-medium hover:bg-[#FAF8F4]"
          >
            <Link
              to="/restaurant/pms/cashiering/folios/$folioId"
              params={{ folioId: row.folioId }}
              search={{ tab: "payments" }}
              className="flex items-center gap-2 text-[#146C43]"
            >
              <Receipt className="size-3.5 text-[#146C43]" />
              <span>View deposit details</span>
            </Link>
          </DropdownMenuItem>
        ) : null}

        {(row.type === "payment" || row.type === "deposit") && canManage ? (
          <DropdownMenuItem
            asChild
            className="cursor-pointer rounded-lg text-xs font-medium hover:bg-[#FAF8F4]"
          >
            <Link
              to="/restaurant/pms/cashiering/folios/$folioId"
              params={{ folioId: row.folioId }}
              search={{ action: "refund", tab: "payments" }}
              className="flex items-center gap-2 text-[#B91C1C]"
            >
              <RotateCcw className="size-3.5 text-[#B91C1C]" />
              <span>Refund available amount</span>
            </Link>
          </DropdownMenuItem>
        ) : null}

        {row.type === "transfer_in" || row.type === "transfer_out" ? (
          <DropdownMenuItem
            asChild
            className="cursor-pointer rounded-lg text-xs font-medium hover:bg-[#FAF8F4]"
          >
            <Link
              to="/restaurant/pms/cashiering/folios/$folioId"
              params={{ folioId: row.folioId }}
              search={{ tab: "transfers" }}
              className="flex items-center gap-2 text-[#0369A1]"
            >
              <ArrowLeftRight className="size-3.5 text-[#0369A1]" />
              <span>Open transfer on folio</span>
            </Link>
          </DropdownMenuItem>
        ) : null}

        {row.type === "refund" ? (
          <DropdownMenuItem
            asChild
            className="cursor-pointer rounded-lg text-xs font-medium hover:bg-[#FAF8F4]"
          >
            <Link
              to="/restaurant/pms/cashiering/folios/$folioId"
              params={{ folioId: row.folioId }}
              search={{ tab: "payments" }}
              className="flex items-center gap-2"
            >
              <CreditCard className="size-3.5 text-[#5F554B]" />
              <span>View original tender</span>
            </Link>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator className="my-1 bg-[#E8E1D7]" />

        <DropdownMenuItem
          asChild
          className="cursor-pointer rounded-lg text-xs font-medium text-[#7A7167] hover:bg-[#FAF8F4]"
        >
          <Link
            to="/restaurant/pms/cashiering/folios/$folioId"
            params={{ folioId: row.folioId }}
            className="flex items-center gap-2"
          >
            <ExternalLink className="size-3.5 text-[#7A7167]" />
            <span>Open folio workspace</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  selectedFolioId,
  onSelect,
  actions,
}: {
  title: string;
  rows: LedgerEntryRow[];
  loading: boolean;
  error: string | null;
  empty: string;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  selectedFolioId?: string | null;
  onSelect: (row: LedgerEntryRow) => void;
  actions?: (row: LedgerEntryRow) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setPage(1);
  }, [rows.length, title]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <section className="overflow-hidden rounded-xl border border-[#DDD4C5] bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-[#DDD4C5] bg-[#FAF8F4]/80 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-sm font-bold text-[#251605]">{title}</h2>
          <span className="rounded-full border border-[#DDD4C5] bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-[#765719]">
            {rows.length}
          </span>
        </div>
        <span className="text-xs text-[#7A7167]">Click row to select folio</span>
      </div>
      {loading ? <p className="p-4 text-sm text-[#7A7167]">Loading ledger…</p> : null}
      {error ? <p className="p-4 text-sm text-destructive">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-[#7A7167]">{empty}</p>
      ) : null}
      {rows.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-[#DDD4C5] bg-[#F8F5F0] text-left text-[11px] font-semibold uppercase tracking-wider text-[#765719]">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">Reference</th>
                  <th className="px-3.5 py-2.5 font-semibold">Guest</th>
                  <th className="px-3.5 py-2.5 font-semibold">Folio No</th>
                  <th className="px-3.5 py-2.5 font-semibold">Room</th>
                  <th className="px-3.5 py-2.5 font-semibold">Method</th>
                  <th className="px-3.5 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-3.5 py-2.5 font-semibold">Posted At</th>
                  <th className="px-3.5 py-2.5 font-semibold">Posted By</th>
                  <th className="px-3.5 py-2.5 font-semibold">Status</th>
                  <th className="px-3.5 py-2.5 text-center font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E1D7]/70">
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selectedFolioId === row.folioId
                        ? "bg-[#C89933]/12 border-l-[3px] border-l-[#C89933]"
                        : "hover:bg-[#FDFBF7]",
                    )}
                    onClick={() => onSelect(row)}
                  >
                    <td className="px-3.5 py-3 font-semibold text-[#251605]">{shortRef(row.id)}</td>
                    <td className="px-3.5 py-3 font-medium text-[#251605]">{row.guestName}</td>
                    <td className="px-3.5 py-3 font-mono text-xs text-[#5F554B]">
                      {row.folioNumber}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-[#251605]">{row.roomNumber ?? "—"}</td>
                    <td className="px-3.5 py-3">
                      <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-[#5F554B]">
                        {row.paymentMethod ? methodLabel(row.paymentMethod) : methodLabel(row.type)}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-right font-semibold tabular-nums text-[#251605]">
                      {money(row.amount)}
                    </td>
                    <td className="px-3.5 py-3 text-xs text-[#7A7167]">{dateTime(row.postedAt)}</td>
                    <td className="px-3.5 py-3 text-xs text-[#5F554B]">{row.postedBy ?? "—"}</td>
                    <td className="px-3.5 py-3">
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        Recorded
                      </span>
                      {row.referenceType ? (
                        <div className="mt-1 text-[11px] text-[#7A7167]">{row.referenceType}</div>
                      ) : null}
                    </td>
                    <td
                      className="px-3.5 py-3 text-center"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {actions ? (
                        actions(row)
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-[#DDD4C5] bg-white text-xs hover:border-[#C89933]/60 hover:text-[#251605]"
                          onClick={() => onSelect(row)}
                        >
                          View
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DDD4C5] bg-[#FAF8F4]/60 px-4 py-2.5 text-xs text-[#7A7167]">
            <span>
              Showing {rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, rows.length)} of {rows.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605] hover:border-[#C89933]/60 hover:text-[#251605] disabled:opacity-50"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                <ChevronLeft className="mr-1 size-3.5" />
                Previous
              </Button>
              <span className="grid size-8 place-items-center rounded-md bg-[#C89933] text-xs font-semibold text-[#251605]">
                {safePage}
              </span>
              <span className="px-1 text-xs text-[#7A7167]">of {pageCount}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-[#DDD4C5] bg-white px-2.5 text-xs font-medium text-[#251605] hover:border-[#C89933]/60 hover:text-[#251605] disabled:opacity-50"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
              >
                Next
                <ChevronRight className="ml-1 size-3.5" />
              </Button>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="ml-2 h-8 rounded-md border border-[#DDD4C5] bg-white px-2 text-xs text-[#251605] focus:border-[#C89933] focus:outline-hidden"
                aria-label="Rows per page"
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function ReceivePanel({
  kind,
  restaurantId,
  folio,
  folios,
  preferredSourceId,
  pendingFolioId,
  onChooseFolio,
  canPost,
  money,
  depositPolicySummary,
  authorizerNote,
  onPosted,
  returnToTab,
  onReturn,
  documentProperty,
  onReceipt,
}: {
  kind: "payment" | "deposit" | "refund";
  restaurantId: string;
  folio: FolioDetail | null;
  folios: FolioRow[];
  preferredSourceId: string | null;
  pendingFolioId: string | null;
  onChooseFolio: (folioId: string) => void;
  canPost: boolean;
  money: (value: number) => string;
  depositPolicySummary?: string | null;
  authorizerNote?: string | null;
  onPosted: () => void;
  returnToTab?: CashieringTabId;
  onReturn?: () => void;
  documentProperty?: CashieringDocumentProperty | null;
  onReceipt?: (receipt: TenderReceipt) => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [receivedFrom, setReceivedFrom] = useState(() => folio?.guestName?.trim() ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceId, setSourceId] = useState("none");
  const [printReceipt, setPrintReceipt] = useState(true);
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
    setReceivedFrom(folio?.guestName?.trim() ?? "");
    setSourceId("none");
    setPrintReceipt(true);
    setIdempotencyKey(crypto.randomUUID());
  }, [folio?.id, folio?.guestName, kind]);

  const refundSources = useMemo(
    () =>
      (folio?.transactions ?? []).filter(
        (line) => line.type === "payment" || line.type === "deposit",
      ),
    [folio?.transactions],
  );
  useEffect(() => {
    if (kind !== "refund") return;
    if (
      preferredSourceId &&
      refundSources.some((line) => line.id === preferredSourceId) &&
      sourceId !== preferredSourceId
    ) {
      setSourceId(preferredSourceId);
      return;
    }
    if (refundSources.some((line) => line.id === sourceId)) return;
    setSourceId(refundSources[0]?.id ?? "none");
  }, [kind, preferredSourceId, refundSources, sourceId]);
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
          note: "Records payment tender directly to guest folio.",
        }
      : kind === "deposit"
        ? {
            title: "Record Deposit Credit",
            cta: "Record Deposit",
            note: "Posts advance payment or security deposit credit to folio.",
          }
        : {
            title: "Record Correction Refund",
            cta: "Post Refund",
            note: "Reverses posted payment tender. Requires manager authorization.",
          };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!folio) throw new Error("Select a folio first.");
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Enter an amount greater than zero.");
      const payer = receivedFrom.trim() || folio.guestName?.trim() || "";
      if ((kind === "payment" || kind === "deposit") && !payer) {
        throw new Error("Enter who the money was received from.");
      }
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
          ...(kind === "payment" || kind === "deposit" ? { receivedFrom: payer } : {}),
          ...(kind === "refund" ? { originalTransactionId: sourceId } : {}),
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const value = Number(amount);
      const payer = receivedFrom.trim() || folio?.guestName?.trim() || "Guest";
      if (printReceipt && (kind === "payment" || kind === "deposit") && folio) {
        const methodObj = tenders.find((row) => row.code === method);
        const selectedRow = folios.find((r) => r.id === folio.id) ?? null;
        const arrivalDate = folio.arrivalDate ?? selectedRow?.arrivalDate ?? null;
        const departureDate = folio.departureDate ?? selectedRow?.departureDate ?? null;
        const nights = arrivalDate && departureDate ? stayNights(arrivalDate, departureDate) : null;
        const confirmationNumber =
          folio.confirmationNumber ?? selectedRow?.confirmationNumber ?? null;
        const guestPhone = folio.guestPhone ?? null;
        const guestEmail = folio.guestEmail ?? null;
        const roomNumber = folio.roomNumber ?? selectedRow?.roomNumber ?? null;
        const roomType = folio.roomTypeName ?? selectedRow?.roomTypeName ?? null;
        const ratePlan = folio.ratePlanName ?? selectedRow?.ratePlanName ?? null;
        const currencyCode = folio.currency ?? selectedRow?.currency ?? "ETB";

        const receiptData: TenderReceipt = {
          kind,
          transactionId: result.id || idempotencyKey,
          postedAt: new Date().toISOString(),
          receivedFrom: payer,
          amount: Number.isFinite(value) ? value : 0,
          method: methodObj?.name || method,
          notes: [reference.trim(), notes.trim()].filter(Boolean).join(" · "),
          folioNumber: folio.folioNumber,
          guestName: folio.guestName,
          propertyName: cashieringPropertyHotelName(documentProperty) || "Property",
          property: documentProperty ?? null,
          confirmationNumber,
          guestPhone,
          guestEmail,
          arrivalDate,
          departureDate,
          nights,
          roomNumber,
          roomType,
          ratePlan,
          currencyCode,
          folioBalance: folio.balance - (Number.isFinite(value) ? value : 0),
          depositPolicySummary: depositPolicySummary ?? null,
        };
        onReceipt?.(receiptData);
        window.setTimeout(() => {
          window.print();
        }, 120);
      }
      toast.success("Posted to folio successfully");
      setIdempotencyKey(crypto.randomUUID());
      setAmount("");
      setReference("");
      setNotes("");
      onPosted();
      if (returnToTab && onReturn) {
        toast.info("Returning to previous workspace…");
        onReturn();
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section
      className={cn(
        "space-y-4 rounded-xl border bg-card p-4 shadow-xs",
        kind === "payment" && "border-emerald-300/80",
        kind === "deposit" && "border-[#E0D0AE]",
        kind === "refund" && "border-rose-300/80",
      )}
      data-testid={`cashiering-${kind}-panel`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] pb-3">
        <div>
          <div className="flex items-center gap-1.5">
            {kind === "payment" ? (
              <Banknote className="size-4 text-[#146C43]" />
            ) : kind === "deposit" ? (
              <Coins className="size-4 text-[#8A6A24]" />
            ) : (
              <Undo2 className="size-4 text-[#B91C1C]" />
            )}
            <h2 className="font-display text-sm font-bold text-[#251605]">{copy.title}</h2>
          </div>
          <p className="mt-0.5 text-[11px] text-[#7A7167]">{copy.note}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border",
            kind === "payment" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            kind === "deposit" && "border-amber-200 bg-amber-50 text-amber-800",
            kind === "refund" && "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          {kind}
        </span>
      </div>

      {returnToTab && onReturn ? (
        <div className="flex items-center justify-between rounded-lg border border-[#C89933]/40 bg-[#FAF5EB] px-3 py-2 text-xs shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-[#8A6A24] animate-pulse" />
            <span className="text-[#251605]">
              Initiated from <strong>Cashier Shift</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={onReturn}
            className="font-semibold text-[#8A6A24] hover:text-[#5B4310] hover:underline cursor-pointer"
          >
            Cancel & Return
          </button>
        </div>
      ) : null}

      {kind === "deposit" && depositPolicySummary ? (
        <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-2.5 text-xs text-[#5F554B]">
          <span className="font-semibold text-[#251605]">Deposit Policy: </span>
          {depositPolicySummary}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`${kind}-folio`} className="text-xs font-semibold text-[#251605]">
          Target Guest Folio
        </Label>
        <div className="relative">
          <select
            id={`${kind}-folio`}
            className="flex h-10 w-full appearance-none rounded-lg border border-[#DDD4C5] bg-white px-3 py-2 pr-8 text-xs font-medium text-[#251605] shadow-2xs transition-colors hover:border-[#C89933] focus:border-[#C89933] focus:outline-hidden focus:ring-2 focus:ring-[#C89933]/20"
            value={folio?.id ?? pendingFolioId ?? ""}
            onChange={(event) => {
              if (event.target.value) onChooseFolio(event.target.value);
            }}
          >
            <option value="">Select guest folio…</option>
            {folios
              .filter((row) => row.status === "open" || row.id === (folio?.id ?? pendingFolioId))
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {row.folioNumber} · {row.guestName}{" "}
                  {row.roomNumber ? `(Room ${row.roomNumber})` : ""}
                </option>
              ))}
          </select>
          <ChevronRight className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 rotate-90 text-[#7A7167]" />
        </div>
      </div>

      {!folio && pendingFolioId ? (
        <p className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3 text-center text-xs text-[#7A7167]">
          Loading selected folio…
        </p>
      ) : !folio ? (
        <div className="rounded-lg border border-dashed border-[#DDD4C5] bg-[#FAF8F4]/50 p-4 text-center text-xs text-[#7A7167]">
          Choose an active guest folio above or select any line in the ledger to begin.
        </div>
      ) : (
        <div className="space-y-3.5">
          <div className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7A7167]">
                  Selected Folio
                </span>
                <p className="text-xs font-bold text-[#251605]">{folio.guestName}</p>
                <p className="text-[11px] text-[#7A7167]">
                  {folio.folioNumber}
                  {folio.roomNumber ? ` · Room ${folio.roomNumber}` : ""}
                  {folio.roomTypeName ? ` · ${folio.roomTypeName}` : ""}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                  folio.status === "open"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-[#DDD4C5] bg-[#FAF8F4] text-[#7A7167]",
                )}
              >
                {folio.status === "open" ? "Open" : "Closed"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-md border border-[#E8E1D7] bg-white px-3 py-2">
              <div>
                <p className="text-[10px] uppercase font-semibold text-[#7A7167]">
                  Outstanding Balance
                </p>
                <p
                  className={cn(
                    "font-display text-base font-bold tabular-nums",
                    folio.balance > 0.009 ? "text-[#B91C1C]" : "text-[#146C43]",
                  )}
                >
                  {money(folio.balance)}
                </p>
              </div>
              {kind === "payment" && folio.balance > 0.009 ? (
                <button
                  type="button"
                  onClick={() => setAmount(folio.balance.toFixed(2))}
                  className="rounded-md border border-[#C89933]/50 bg-[#FAF5EB] px-2.5 py-1 text-[11px] font-semibold text-[#8A6A24] hover:bg-[#F3EAD5] transition-colors cursor-pointer"
                >
                  Fill Balance
                </button>
              ) : null}
            </div>
          </div>

          {folio.status !== "open" ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-xs text-[#B91C1C]">
              This folio is closed. New transactions cannot be posted.
            </p>
          ) : !canPost ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-[#8A6A24]">
              Your role does not have authorization to post this transaction.
            </p>
          ) : (
            <div className="space-y-3 rounded-lg border border-[#E8E1D7] bg-[#FAF8F4]/60 p-3.5">
              <div className="space-y-1">
                <Label htmlFor={`${kind}-method`} className="text-xs font-semibold text-[#251605]">
                  Payment Method
                </Label>
                {tenders.length === 0 ? (
                  <p className="text-xs text-[#C89933]">No active payment methods configured.</p>
                ) : (
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger
                      id={`${kind}-method`}
                      className="h-10 border-[#DDD4C5] bg-white text-xs font-medium"
                    >
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
                <div className="space-y-1.5">
                  <Label htmlFor="refund-source" className="text-xs font-semibold text-[#251605]">
                    Source Line to Correct
                  </Label>
                  <Select value={sourceId} onValueChange={setSourceId}>
                    <SelectTrigger
                      id="refund-source"
                      className="h-10 border-[#DDD4C5] bg-white text-xs font-medium"
                    >
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
                    <div className="rounded-md border border-[#E8E1D7] bg-white p-2 text-[11px] text-[#5F554B]">
                      <span>
                        Original Line: <strong>{labelTransactionType(refundSource.type)}</strong> ·{" "}
                        {refundSource.description} · {money(refundSource.amount)}
                      </span>
                      {refundRemaining != null ? (
                        <span className="block mt-0.5 text-[#146C43] font-medium">
                          Remaining refundable: {money(refundRemaining)}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-[#B91C1C]">
                      This folio has no prior payment or deposit eligible for refund.
                    </p>
                  )}
                  <p className="text-[10px] text-[#7A7167]">
                    {authorizerNote ?? "Owner or Manager authorization required."}
                  </p>
                </div>
              ) : null}

              <div className="space-y-1">
                <Label htmlFor={`${kind}-amount`} className="text-xs font-semibold text-[#251605]">
                  Amount
                </Label>
                <Input
                  id={`${kind}-amount`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="h-10 border-[#DDD4C5] bg-white text-sm font-semibold tabular-nums focus-visible:border-[#C89933] focus-visible:ring-[#C89933]/20"
                />
              </div>

              {kind === "payment" || kind === "deposit" ? (
                <div className="space-y-1">
                  <Label
                    htmlFor={`${kind}-received-from`}
                    className="text-xs font-semibold text-[#251605]"
                  >
                    Received from
                  </Label>
                  <Input
                    id={`${kind}-received-from`}
                    placeholder="Name of payer or company"
                    value={receivedFrom}
                    onChange={(event) => setReceivedFrom(event.target.value)}
                    className="h-10 border-[#DDD4C5] bg-white text-xs font-medium focus-visible:border-[#C89933] focus-visible:ring-[#C89933]/20"
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <Label
                  htmlFor={`${kind}-reference`}
                  className="text-xs font-semibold text-[#251605]"
                >
                  Reference (optional)
                </Label>
                <Input
                  id={`${kind}-reference`}
                  placeholder="e.g. Auth Code, Receipt #, Check #"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  className="h-9 border-[#DDD4C5] bg-white text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${kind}-notes`} className="text-xs font-semibold text-[#251605]">
                  {kind === "refund" ? "Reason (required)" : "Notes (optional)"}
                </Label>
                <Textarea
                  id={`${kind}-notes`}
                  placeholder={
                    kind === "refund" ? "State reason for refund..." : "Additional notes..."
                  }
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-16 border-[#DDD4C5] bg-white text-xs"
                />
              </div>

              {kind === "payment" || kind === "deposit" ? (
                <label className="flex items-center gap-2 rounded-lg border border-[#DDD4C5] bg-white px-3 py-2 text-xs font-semibold text-[#251605] cursor-pointer hover:bg-[#FAF8F4]">
                  <Checkbox
                    checked={printReceipt}
                    onCheckedChange={(checked) => setPrintReceipt(checked === true)}
                  />
                  <span>Print receipt</span>
                </label>
              ) : null}

              <Button
                type="button"
                className={cn(
                  "h-10 w-full font-semibold shadow-xs transition-colors cursor-pointer",
                  kind === "payment" && "bg-[#146C43] text-white hover:bg-[#0E5233]",
                  kind === "deposit" && "bg-[#8A6A24] text-white hover:bg-[#6D541C]",
                  kind === "refund" && "bg-[#B91C1C] text-white hover:bg-[#991B1B]",
                )}
                disabled={
                  mutation.isPending ||
                  !method ||
                  (kind === "refund" && (notes.trim() === "" || !refundSource))
                }
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Posting…" : copy.cta}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
