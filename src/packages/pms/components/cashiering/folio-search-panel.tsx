import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  CreditCard,
  FileText,
  Globe,
  Mail,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";

import { FolioActionMenu } from "@/packages/pms/components/cashiering/folio-action-menu";
import {
  FolioSearchFolioStatusBadge,
  FolioSearchStayStatusBadge,
} from "@/packages/pms/components/cashiering/folio-bits";
import { FolioSearchMoreFilters as FolioSearchMoreFiltersSheet } from "@/packages/pms/components/cashiering/folio-search-more-filters";
import { FolioSearchStayDates } from "@/packages/pms/components/cashiering/folio-search-stay-dates";
import {
  InventoryState,
  InventoryStatusBadge,
  InventoryViewHeader,
} from "@/packages/pms/components/rooms/room-inventory-shared";
import {
  getFolio,
  type FolioDetail,
  type FolioTransactionRow,
} from "@/packages/pms/lib/cashiering.functions";
import { listFinancialAccounts } from "@/packages/pms/lib/cashiering-phases.functions";
import type { CashieringSearchParams } from "@/packages/pms/lib/cashiering-shell";
import {
  accountTypeLabel,
  countActiveFolioMoreFilters,
  EMPTY_FOLIO_SEARCH_BAR_FILTERS,
  EMPTY_FOLIO_SEARCH_MORE_FILTERS,
  FOLIO_ACCOUNT_TYPES,
  FOLIO_PAYMENT_STATE_FILTERS,
  FOLIO_SEARCH_DEBOUNCE_MS,
  FOLIO_SEARCH_DEFAULT_PAGE_SIZE,
  FOLIO_SEARCH_FILTER_ALL,
  FOLIO_SEARCH_PAGE_SIZES,
  FOLIO_SEARCH_SORT_OPTIONS,
  FOLIO_STATUS_FILTERS,
  FOLIO_STAY_STATUS_FILTERS,
  folioSearchSortOption,
  hasActiveFolioSearchConstraints,
  paymentStateLabel,
  reservationStatusLabel,
  resolveFolioAccountType,
  resultsTitle,
  type FolioAccountType,
  type FolioSearchBarFilters,
  type FolioSearchMoreFilters,
  type FolioSearchSortId,
} from "@/packages/pms/lib/folio-search-filters";
import {
  searchAllAccounts,
  searchGuestFolios,
  type AllAccountSearchRow,
  type GuestFolioSearchRow,
} from "@/packages/pms/lib/folio-search.server";
import { formatStayDate } from "@/shared/lib/property-dates";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

const FILTER_CARD = "rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm";
const TABLE_SHELL = "overflow-x-auto rounded-xl border border-[#E8E1D7] bg-card shadow-sm";
const TABLE_HEAD = "border-b border-[#E8E1D7] bg-muted/30 text-xs text-muted-foreground";
const TABLE_ROW = "border-b border-[#E8E1D7]/80 last:border-0 transition-colors";
const ROW_HOVER = "hover:bg-muted/20";
const ROW_SELECTED = "bg-[#C89933]/8 border-l-[3px] border-l-[#C89933]";
const DRAWER_CARD = "rounded-xl border border-[#E8E1D7] bg-card p-3 shadow-sm";
const TOOLBAR_SELECT = "h-9 min-h-9 w-full bg-background sm:min-w-[130px] sm:max-w-[160px]";
const TOOLBAR_DATES = "h-9 min-h-9 w-full bg-background sm:min-w-[150px] sm:max-w-[180px]";
const TOOLBAR_SORT = "h-9 min-h-9 w-full bg-background sm:min-w-[160px] sm:max-w-[190px]";

type BalanceState = "settled" | "outstanding" | "credit";

function balanceState(balance: number): BalanceState {
  if (Math.abs(balance) < 0.01) return "settled";
  if (balance < 0) return "credit";
  return "outstanding";
}

function balanceTone(balance: number): string {
  const state = balanceState(balance);
  if (state === "settled") return "text-muted-foreground";
  if (state === "credit") return "font-semibold text-emerald-700 dark:text-emerald-400";
  return "font-semibold text-destructive";
}

function balanceLabel(balance: number): string {
  const state = balanceState(balance);
  if (state === "settled") return "Settled";
  if (state === "credit") return "Credit Balance";
  return "Outstanding";
}

function balanceLabelTone(balance: number): string {
  const state = balanceState(balance);
  if (state === "settled") return "text-emerald-600 dark:text-emerald-400";
  if (state === "credit") return "text-emerald-600 dark:text-emerald-400";
  return "text-destructive";
}

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatActivityWhen(iso: string | null | undefined, dateTime: (v: string | null | undefined) => string): string {
  if (!iso) return "—";
  const date = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const label = date === today ? "Today" : formatDeskDate(date);
  const timePart = iso.includes("T") ? dateTime(iso).split(" ").slice(-2).join(" ") : "";
  return timePart ? `${label} · ${timePart}` : label;
}

function buildActiveFilterSummary(
  bar: FolioSearchBarFilters,
  more: FolioSearchMoreFilters,
): string {
  const parts: string[] = [];
  if (bar.folioStatus === "open") parts.push("Open");
  if (bar.folioStatus === "closed") parts.push("Closed");
  if (bar.stayStatus !== "all") parts.push(reservationStatusLabel(bar.stayStatus));
  if (bar.stayFrom && bar.stayTo) {
    parts.push(`${formatDeskDate(bar.stayFrom)}–${formatDeskDate(bar.stayTo)}`);
  }
  if (bar.paymentState !== "all") parts.push(paymentStateLabel(bar.paymentState));
  if (more.unsettledCheckout) parts.push("Unsettled Checkout");
  return parts.join(" · ");
}

function transactionActivityTitle(txn: FolioTransactionRow): string {
  switch (txn.type) {
    case "payment":
      return "Payment received";
    case "charge":
      return "Charge posted";
    case "deposit":
      return "Deposit applied";
    case "refund":
      return "Refund issued";
    case "adjustment":
      return "Adjustment posted";
    case "discount":
      return "Discount applied";
    default:
      return txn.description || "Transaction";
  }
}

function transactionActivityIcon(txn: FolioTransactionRow): LucideIcon {
  switch (txn.type) {
    case "payment":
      return CreditCard;
    case "charge":
      return Receipt;
    case "deposit":
      return Wallet;
    case "refund":
    case "adjustment":
    case "discount":
      return SlidersHorizontal;
    default:
      return Receipt;
  }
}

function formatDeskDate(value: string | null | undefined): string {
  if (!value) return "—";
  return formatStayDate(value);
}

function nightsBetween(arrival: string | null, departure: string | null): number | null {
  if (!arrival || !departure) return null;
  const start = Date.parse(`${arrival}T00:00:00Z`);
  const end = Date.parse(`${departure}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return Math.round((end - start) / 86_400_000);
}

function formatStayRange(arrival: string | null, departure: string | null): string {
  if (!arrival || !departure) return "—";
  const nights = nightsBetween(arrival, departure);
  const nightLabel = nights === null ? "" : ` · ${nights} night${nights === 1 ? "" : "s"}`;
  return `${formatDeskDate(arrival)} → ${formatDeskDate(departure)}${nightLabel}`;
}

function searchPlaceholder(type: FolioAccountType): string {
  if (type === "company") return "Search account or company...";
  if (type === "group") return "Search account or group...";
  if (type === "all") return "Search account, folio, guest or company...";
  return "Search folio, guest, reservation or room...";
}

function sourceLabel(source: AllAccountSearchRow["accountType"]): string {
  if (source === "guest") return "Guest";
  if (source === "company") return "Company";
  return "Group";
}

function guestSnapshotFromAllRow(row: AllAccountSearchRow): GuestFolioSearchRow {
  return {
    id: row.guestFolioId!,
    folioNumber: row.accountNumber,
    status: row.status as GuestFolioSearchRow["status"],
    currency: row.currency,
    guestName: row.accountName,
    guestEmail: null,
    guestPhone: null,
    reservationId: null,
    confirmationNumber: row.confirmationNumber,
    openedAt: row.lastActivity ?? new Date(0).toISOString(),
    closedAt: null,
    charges: 0,
    credits: 0,
    balance: row.balance,
    paymentState: "settled",
    hasPayments: false,
    unsettledCheckout: false,
    roomNumber: row.roomNumber,
    roomTypeName: row.roomTypeName,
    reservationStatus: row.reservationStatus,
    arrivalDate: row.arrivalDate,
    departureDate: row.departureDate,
    ratePlanName: null,
    marketSegment: null,
    bookingSource: null,
    salesChannel: null,
    lastActivity: row.lastActivity,
  };
}

const FOLIO_RESULTS_TABLE_CLASS = "w-full min-w-[920px] table-fixed text-left text-sm";

function FolioResultsColGroup() {
  return (
    <colgroup>
      <col className="w-[12%]" />
      <col className="w-[26%]" />
      <col className="w-[12%]" />
      <col className="w-[14%]" />
      <col className="w-[14%]" />
      <col className="w-[14%]" />
      <col className="w-[8%]" />
    </colgroup>
  );
}

function FolioResultsTableHead() {
  return (
    <thead className={TABLE_HEAD}>
      <tr>
        <th className="px-3 py-2.5 font-semibold">Folio</th>
        <th className="px-3 py-2.5 font-semibold">Guest / Stay</th>
        <th className="px-3 py-2.5 font-semibold">Room</th>
        <th className="px-3 py-2.5 font-semibold">Status</th>
        <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
        <th className="px-3 py-2.5 font-semibold">Last Activity</th>
        <th className="px-3 py-2.5" aria-label="Actions" />
      </tr>
    </thead>
  );
}

function AccountTypeAvatar({ type }: { type: AllAccountSearchRow["accountType"] }) {
  const Icon = type === "guest" ? UserRound : type === "company" ? Building2 : UsersRound;
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/50">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
    </div>
  );
}

function IconTextCell({
  icon: Icon,
  primary,
  secondary,
}: {
  icon: LucideIcon;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <div className="truncate font-medium">{primary}</div>
        {secondary ? <div className="truncate text-[11px] text-muted-foreground">{secondary}</div> : null}
      </div>
    </div>
  );
}

function GuestAvatarCell({ name }: { name: string }) {
  return (
    <Avatar className="size-7 shrink-0">
      <AvatarFallback className="bg-[#C89933]/15 text-[10px] font-semibold text-[#251605]">
        {nameInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function BalanceCell({ balance, money }: { balance: number; money: (value: number) => string }) {
  return (
    <div className="text-right">
      <p className={cn("tabular-nums", balanceTone(balance))}>{money(balance)}</p>
      <p className={cn("text-[11px] font-medium", balanceLabelTone(balance))}>{balanceLabel(balance)}</p>
    </div>
  );
}

function tableRowClass(selected: boolean, interactive = true): string {
  return cn(
    TABLE_ROW,
    interactive && "cursor-pointer",
    interactive && !selected && ROW_HOVER,
    selected && ROW_SELECTED,
  );
}

export function FolioSearchPanel({
  restaurantId,
  searchParams,
  onSearchParams,
  canOperate,
  canManage,
  money,
  dateTime,
}: {
  restaurantId: string;
  searchParams: CashieringSearchParams;
  onSearchParams: (next: CashieringSearchParams) => void;
  canOperate: boolean;
  canManage: boolean;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
}) {
  const accountType = resolveFolioAccountType(searchParams.account);
  const [barFilters, setBarFilters] = useState<FolioSearchBarFilters>(() => ({
    ...EMPTY_FOLIO_SEARCH_BAR_FILTERS,
    search: searchParams.q ?? "",
    folioStatus: (searchParams.folioStatus as FolioSearchBarFilters["folioStatus"]) ?? "all",
    stayStatus: (searchParams.stayStatus as FolioSearchBarFilters["stayStatus"]) ?? "all",
    stayFrom: searchParams.stayFrom ?? "",
    stayTo: searchParams.stayTo ?? "",
    paymentState: (searchParams.paymentState as FolioSearchBarFilters["paymentState"]) ?? "all",
  }));
  const [moreFilters, setMoreFilters] = useState<FolioSearchMoreFilters>(EMPTY_FOLIO_SEARCH_MORE_FILTERS);
  const [moreOpen, setMoreOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(barFilters.search);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.folio ?? null);
  const [selectedGuestRow, setSelectedGuestRow] = useState<GuestFolioSearchRow | null>(null);
  const page = searchParams.page ?? 1;
  const pageSize = searchParams.pageSize ?? FOLIO_SEARCH_DEFAULT_PAGE_SIZE;
  const sortId = (searchParams.sort as FolioSearchSortId) ?? "arrival_date_desc";
  const sort = folioSearchSortOption(sortId);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(barFilters.search), FOLIO_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [barFilters.search]);

  useEffect(() => {
    if (!searchParams.folio) {
      setSelectedId(null);
      setSelectedGuestRow(null);
      return;
    }
    setSelectedId(searchParams.folio);
  }, [searchParams.folio]);

  useEffect(() => {
    setBarFilters({
      search: searchParams.q ?? "",
      folioStatus: (searchParams.folioStatus as FolioSearchBarFilters["folioStatus"]) ?? "all",
      stayStatus: (searchParams.stayStatus as FolioSearchBarFilters["stayStatus"]) ?? "all",
      stayFrom: searchParams.stayFrom ?? "",
      stayTo: searchParams.stayTo ?? "",
      paymentState: (searchParams.paymentState as FolioSearchBarFilters["paymentState"]) ?? "all",
    });
  }, [
    searchParams.folioStatus,
    searchParams.paymentState,
    searchParams.q,
    searchParams.stayFrom,
    searchParams.stayStatus,
    searchParams.stayTo,
  ]);

  const fetchSearch = useServerFn(searchGuestFolios);
  const fetchAllAccounts = useServerFn(searchAllAccounts);
  const fetchFolio = useServerFn(getFolio);
  const fetchAccounts = useServerFn(listFinancialAccounts);

  const folioSearchInput = useMemo(
    () => ({
      restaurantId,
      search: debouncedSearch.trim() || undefined,
      folioStatus: barFilters.folioStatus,
      stayStatus: barFilters.stayStatus,
      stayFrom: barFilters.stayFrom || undefined,
      stayTo: barFilters.stayTo || undefined,
      paymentState: barFilters.paymentState,
      roomTypeId:
        moreFilters.roomTypeId !== FOLIO_SEARCH_FILTER_ALL ? moreFilters.roomTypeId : undefined,
      ratePlanId:
        moreFilters.ratePlanId !== FOLIO_SEARCH_FILTER_ALL ? moreFilters.ratePlanId : undefined,
      marketSegment:
        moreFilters.marketSegment !== FOLIO_SEARCH_FILTER_ALL
          ? moreFilters.marketSegment
          : undefined,
      bookingSource:
        moreFilters.bookingSource !== FOLIO_SEARCH_FILTER_ALL
          ? moreFilters.bookingSource
          : undefined,
      salesChannel:
        moreFilters.salesChannel !== FOLIO_SEARCH_FILTER_ALL
          ? moreFilters.salesChannel
          : undefined,
      currency:
        moreFilters.currency !== FOLIO_SEARCH_FILTER_ALL ? moreFilters.currency : undefined,
      unsettledCheckout: moreFilters.unsettledCheckout || undefined,
      page,
      pageSize,
      sortBy: sort.sortBy,
      sortDirection: sort.sortDirection,
    }),
    [
      barFilters.folioStatus,
      barFilters.paymentState,
      barFilters.stayFrom,
      barFilters.stayStatus,
      barFilters.stayTo,
      debouncedSearch,
      moreFilters,
      page,
      pageSize,
      restaurantId,
      sort.sortBy,
      sort.sortDirection,
    ],
  );

  const guestQuery = useQuery({
    queryKey: ["folio-search-guest", folioSearchInput],
    queryFn: () => fetchSearch({ data: folioSearchInput }),
    enabled: accountType === "guest",
    placeholderData: keepPreviousData,
    retry: false,
  });

  const allAccountsQuery = useQuery({
    queryKey: ["folio-search-all", folioSearchInput],
    queryFn: () => fetchAllAccounts({ data: folioSearchInput }),
    enabled: accountType === "all",
    placeholderData: keepPreviousData,
    retry: false,
  });

  const accountsQuery = useQuery({
    queryKey: ["financial-accounts", restaurantId],
    queryFn: () => fetchAccounts({ data: { restaurantId } }),
    enabled: accountType === "company" || accountType === "group",
    retry: false,
  });

  const detailQuery = useQuery({
    queryKey: ["cashiering-folio", restaurantId, selectedId],
    queryFn: () => fetchFolio({ data: { restaurantId, folioId: selectedId! } }),
    enabled: (accountType === "guest" || accountType === "all") && Boolean(selectedId),
    retry: false,
  });

  const guestRows = guestQuery.data?.rows ?? [];
  const total = guestQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const allRows = allAccountsQuery.data?.rows ?? [];
  const allTotal = allAccountsQuery.data?.total ?? 0;
  const allPageCount = Math.max(1, Math.ceil(allTotal / pageSize));
  const allSafePage = Math.min(page, allPageCount);
  const allFrom = allTotal === 0 ? 0 : (allSafePage - 1) * pageSize + 1;
  const allTo = Math.min(allSafePage * pageSize, allTotal);

  const selectedRow = useMemo(() => {
    if (!selectedId) return null;
    if (selectedGuestRow?.id === selectedId) return selectedGuestRow;
    if (accountType === "guest") {
      return guestRows.find((row) => row.id === selectedId) ?? null;
    }
    if (accountType === "all") {
      const match = allRows.find((row) => row.guestFolioId === selectedId);
      return match?.guestFolioId ? guestSnapshotFromAllRow(match) : null;
    }
    return null;
  }, [accountType, allRows, guestRows, selectedGuestRow, selectedId]);

  const patchSearchParams = useCallback(
    (patch: Partial<CashieringSearchParams>) => {
      onSearchParams({ ...searchParams, tab: "folios", ...patch });
    },
    [onSearchParams, searchParams],
  );

  function closeDrawer() {
    setSelectedId(null);
    setSelectedGuestRow(null);
    patchSearchParams({ folio: undefined });
  }

  function selectRow(row: GuestFolioSearchRow) {
    setSelectedGuestRow(row);
    setSelectedId(row.id);
    patchSearchParams({ folio: row.id });
  }

  function selectAllAccountRow(row: AllAccountSearchRow) {
    if (!row.guestFolioId) return;
    const snapshot = guestSnapshotFromAllRow(row);
    setSelectedGuestRow(snapshot);
    setSelectedId(row.guestFolioId);
    patchSearchParams({ folio: row.guestFolioId });
  }

  function setAccountType(type: FolioAccountType) {
    setSelectedId(null);
    setSelectedGuestRow(null);
    patchSearchParams({
      account: type === "all" ? undefined : type,
      page: 1,
      folio: undefined,
    });
  }

  function updateBar(next: Partial<FolioSearchBarFilters>) {
    const merged = { ...barFilters, ...next };
    setBarFilters(merged);
    patchSearchParams({
      q: merged.search || undefined,
      folioStatus: merged.folioStatus === "all" ? undefined : merged.folioStatus,
      stayStatus: merged.stayStatus === "all" ? undefined : merged.stayStatus,
      stayFrom: merged.stayFrom || undefined,
      stayTo: merged.stayTo || undefined,
      paymentState: merged.paymentState === "all" ? undefined : merged.paymentState,
      page: 1,
    });
  }

  function clearFilters() {
    setBarFilters(EMPTY_FOLIO_SEARCH_BAR_FILTERS);
    setMoreFilters(EMPTY_FOLIO_SEARCH_MORE_FILTERS);
    patchSearchParams({
      q: undefined,
      folioStatus: undefined,
      stayStatus: undefined,
      stayFrom: undefined,
      stayTo: undefined,
      paymentState: undefined,
      page: 1,
    });
  }

  const accountRows = useMemo(() => {
    const kind = accountType === "company" ? "company" : "group";
    const base = (accountsQuery.data ?? []).filter((row) => row.accountKind === kind);
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return base;
    return base.filter(
      (row) =>
        row.masterName.toLowerCase().includes(term) ||
        row.accountNumber.toLowerCase().includes(term),
    );
  }, [accountsQuery.data, accountType, debouncedSearch]);

  const resultCount =
    accountType === "guest" ? total : accountType === "all" ? allTotal : accountRows.length;

  const activeFilterSummary = useMemo(
    () => buildActiveFilterSummary(barFilters, moreFilters),
    [barFilters, moreFilters],
  );
  const hasFilters = hasActiveFolioSearchConstraints(barFilters, moreFilters);

  const isRefreshing =
    accountType === "all"
      ? allAccountsQuery.isFetching
      : accountType === "guest"
        ? guestQuery.isFetching
        : accountsQuery.isFetching;

  function handleRefresh() {
    if (accountType === "all") void allAccountsQuery.refetch();
    else if (accountType === "guest") void guestQuery.refetch();
    else void accountsQuery.refetch();
  }

  return (
    <div className="w-full min-w-0 space-y-4" data-testid="folio-search-panel">
      <InventoryViewHeader
        eyebrow="Cashiering"
        title="Folio Search"
        description="Find and manage guest, company and group financial accounts."
        action={
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className={cn("mr-2 size-4", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <section className={FILTER_CARD} data-testid="folio-search-toolbar">
        <div className="space-y-2">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={barFilters.search}
              onChange={(event) => updateBar({ search: event.target.value })}
              placeholder={searchPlaceholder(accountType)}
              className="h-9 min-h-9 bg-background pl-9"
              data-testid="cashiering-folio-search"
            />
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            <Select value={accountType} onValueChange={(value) => setAccountType(value as FolioAccountType)}>
              <SelectTrigger className={TOOLBAR_SELECT} data-testid="folio-account-type">
                <SelectValue placeholder="Account Type" />
              </SelectTrigger>
              <SelectContent>
                {FOLIO_ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "all" ? "All Accounts" : accountTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {accountType === "guest" || accountType === "all" ? (
              <>
                <Select
                  value={barFilters.folioStatus}
                  onValueChange={(value) =>
                    updateBar({ folioStatus: value as FolioSearchBarFilters["folioStatus"] })
                  }
                >
                  <SelectTrigger className={TOOLBAR_SELECT}>
                    <SelectValue placeholder="Folio Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLIO_STATUS_FILTERS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === "all" ? "Folio Status" : value === "open" ? "Open" : "Closed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={barFilters.stayStatus}
                  onValueChange={(value) =>
                    updateBar({ stayStatus: value as FolioSearchBarFilters["stayStatus"] })
                  }
                >
                  <SelectTrigger className={TOOLBAR_SELECT}>
                    <SelectValue placeholder="Stay Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLIO_STAY_STATUS_FILTERS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === "all"
                          ? "Stay Status"
                          : reservationStatusLabel(value === "checked_in" ? "checked_in" : value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <FolioSearchStayDates
                  from={barFilters.stayFrom}
                  to={barFilters.stayTo}
                  onChange={({ from, to }) => updateBar({ stayFrom: from, stayTo: to })}
                  className={TOOLBAR_DATES}
                />

                <Select
                  value={barFilters.paymentState}
                  onValueChange={(value) =>
                    updateBar({ paymentState: value as FolioSearchBarFilters["paymentState"] })
                  }
                >
                  <SelectTrigger className={TOOLBAR_SELECT}>
                    <SelectValue placeholder="Payment State" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLIO_PAYMENT_STATE_FILTERS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === "all" ? "Payment State" : paymentStateLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="outline"
                  className="h-9 min-h-9 shrink-0 gap-2 px-3"
                  onClick={() => setMoreOpen(true)}
                >
                  <SlidersHorizontal className="size-4" />
                  More Filters
                  {countActiveFolioMoreFilters(moreFilters) > 0 ? (
                    <span className="rounded-full bg-[#C89933]/20 px-1.5 py-0.5 text-[11px] font-medium text-[#251605]">
                      {countActiveFolioMoreFilters(moreFilters)}
                    </span>
                  ) : null}
                </Button>

                <Select
                  value={sortId}
                  onValueChange={(value) => patchSearchParams({ sort: value, page: 1 })}
                >
                  <SelectTrigger className={TOOLBAR_SORT}>
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLIO_SEARCH_SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {accountType === "all" ? (
        <AllAccountsTable
          title="Folio Results"
          resultCount={resultCount}
          rows={allRows}
          loading={allAccountsQuery.isLoading}
          error={allAccountsQuery.isError ? (allAccountsQuery.error as Error).message : null}
          hasFilters={hasFilters}
          filterSummary={activeFilterSummary}
          total={allTotal}
          from={allFrom}
          to={allTo}
          page={allSafePage}
          pageCount={allPageCount}
          pageSize={pageSize}
          selectedFolioId={selectedId}
          searchTerm={debouncedSearch}
          money={money}
          canOperate={canOperate}
          canManage={canManage}
          onSelectRow={selectAllAccountRow}
          onPage={(next) => patchSearchParams({ page: next })}
          onPageSize={(next) => patchSearchParams({ pageSize: next, page: 1 })}
          onRetry={() => void allAccountsQuery.refetch()}
          onClearFilters={clearFilters}
        />
      ) : accountType === "guest" ? (
        <GuestFolioTable
          title="Folio Results"
          resultCount={resultCount}
          rows={guestRows}
          loading={guestQuery.isLoading}
          error={guestQuery.isError ? (guestQuery.error as Error).message : null}
          total={total}
          from={from}
          to={to}
          page={safePage}
          pageCount={pageCount}
          pageSize={pageSize}
          selectedId={selectedId}
          searchTerm={debouncedSearch}
          hasFilters={hasFilters}
          filterSummary={activeFilterSummary}
          money={money}
          canOperate={canOperate}
          canManage={canManage}
          onSelect={selectRow}
          onPage={(next) => patchSearchParams({ page: next })}
          onPageSize={(next) => patchSearchParams({ pageSize: next, page: 1 })}
          onRetry={() => void guestQuery.refetch()}
          onClearFilters={clearFilters}
        />
      ) : (
        <FinancialAccountsTable
          mode={accountType}
          title={resultsTitle(accountType)}
          resultCount={resultCount}
          rows={accountRows}
          loading={accountsQuery.isLoading}
          error={accountsQuery.isError ? (accountsQuery.error as Error).message : null}
          money={money}
        />
      )}

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && closeDrawer()}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-l border-[#E8E1D7] bg-background p-0 sm:max-w-[440px]"
          data-testid="folio-details-drawer"
        >
          <FolioDetailsDrawer
            row={selectedRow}
            detail={detailQuery.data ?? null}
            loading={detailQuery.isLoading}
            error={detailQuery.isError ? (detailQuery.error as Error).message : null}
            selectedId={selectedId}
            money={money}
            dateTime={dateTime}
            canOperate={canOperate}
            canManage={canManage}
            onClose={closeDrawer}
          />
        </SheetContent>
      </Sheet>

      <FolioSearchMoreFiltersSheet
        restaurantId={restaurantId}
        open={moreOpen}
        applied={moreFilters}
        onOpenChange={setMoreOpen}
        onApply={(next) => {
          setMoreFilters(next);
          patchSearchParams({ page: 1 });
        }}
      />
    </div>
  );
}

function ResultsSectionHeader({
  title,
  resultCount,
  filterSummary,
  hasFilters,
  onClearFilters,
}: {
  title: string;
  resultCount: number;
  filterSummary?: string;
  hasFilters?: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">
          {resultCount} {resultCount === 1 ? "result" : "results"}
        </p>
      </div>
      {hasFilters && filterSummary ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">{filterSummary}</p>
          {onClearFilters ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FolioSearchPaginationFooter({
  from,
  to,
  total,
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-[#E8E1D7] px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[64px] text-center tabular-nums">
            {page} / {pageCount}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span>{pageSize} per page</span>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSize(Number(value))}>
            <SelectTrigger className="h-8 w-[68px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOLIO_SEARCH_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function AllAccountsTable({
  title,
  resultCount,
  rows,
  loading,
  error,
  total,
  from,
  to,
  page,
  pageCount,
  pageSize,
  selectedFolioId,
  searchTerm,
  money,
  canOperate,
  canManage,
  onSelectRow,
  onPage,
  onPageSize,
  onRetry,
  hasFilters,
  filterSummary,
  onClearFilters,
}: {
  title: string;
  resultCount: number;
  rows: AllAccountSearchRow[];
  loading: boolean;
  error: string | null;
  total: number;
  from: number;
  to: number;
  page: number;
  pageCount: number;
  pageSize: number;
  selectedFolioId: string | null;
  searchTerm: string;
  money: (value: number) => string;
  canOperate: boolean;
  canManage: boolean;
  onSelectRow: (row: AllAccountSearchRow) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onRetry: () => void;
  hasFilters: boolean;
  filterSummary?: string;
  onClearFilters: () => void;
}) {
  const emptyDescription = searchTerm.trim()
    ? `No accounts found for "${searchTerm.trim()}".`
    : hasFilters
      ? "No folios match the selected filters."
      : "No guest folios or billing accounts yet.";

  return (
    <section className="w-full min-w-0 space-y-3">
      <ResultsSectionHeader
        title={title}
        resultCount={resultCount}
        filterSummary={filterSummary}
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
      />

      {loading ? (
        <InventoryState state="loading" title="Loading folios…" />
      ) : error ? (
        <InventoryState
          state="error"
          title="Folios could not be loaded."
          description={error}
          onRetry={onRetry}
        />
      ) : rows.length === 0 ? (
        <InventoryState state="empty" title="No folios match the selected filters." description={emptyDescription} />
      ) : (
        <div className={TABLE_SHELL}>
          <table className={FOLIO_RESULTS_TABLE_CLASS}>
            <FolioResultsColGroup />
            <FolioResultsTableHead />
            <tbody>
              {rows.map((row) => {
                const isGuest = row.accountType === "guest" && Boolean(row.guestFolioId);
                const selected = isGuest && selectedFolioId === row.guestFolioId;
                const folioIcon = isGuest ? FileText : row.accountType === "company" ? Building2 : UsersRound;
                const folioSecondary = isGuest
                  ? row.confirmationNumber ?? "Guest folio"
                  : sourceLabel(row.accountType);
                const staySecondary = isGuest
                  ? formatStayRange(row.arrivalDate, row.departureDate)
                  : row.accountType === "company"
                    ? "Company billing account"
                    : "Group billing account";
                const roomPrimary = isGuest ? row.roomNumber ?? "—" : "—";
                const roomSecondary = isGuest
                  ? row.roomTypeName ?? undefined
                  : row.accountType === "company"
                    ? "Company account"
                    : "Group account";
                return (
                  <tr
                    key={`${row.accountType}:${row.accountId}`}
                    data-testid={isGuest ? "folio-row" : "account-row"}
                    onClick={() => {
                      if (isGuest) onSelectRow(row);
                    }}
                    className={tableRowClass(Boolean(selected), isGuest)}
                  >
                    <td className="px-3 py-2.5">
                      <IconTextCell icon={folioIcon} primary={row.accountNumber} secondary={folioSecondary} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-start gap-2">
                        {isGuest ? (
                          <GuestAvatarCell name={row.accountName} />
                        ) : (
                          <AccountTypeAvatar type={row.accountType} />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.accountName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{staySecondary}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <IconTextCell icon={BedDouble} primary={roomPrimary} secondary={roomSecondary} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-1">
                        <FolioSearchFolioStatusBadge status={row.status as "open" | "closed"} />
                        {isGuest ? (
                          <FolioSearchStayStatusBadge status={row.reservationStatus} />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{sourceLabel(row.accountType)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <BalanceCell balance={row.balance} money={money} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock3 className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">
                          {row.lastActivity ? formatDeskDate(row.lastActivity.slice(0, 10)) : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-1 py-2.5" onClick={(event) => event.stopPropagation()}>
                      {isGuest ? (
                        <FolioActionMenu
                          folio={{
                            id: row.guestFolioId!,
                            folioNumber: row.accountNumber,
                            status: row.status as "open" | "closed",
                          }}
                          canOperate={canOperate}
                          canManage={canManage}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > 0 ? (
            <FolioSearchPaginationFooter
              from={from}
              to={to}
              total={total}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              onPage={onPage}
              onPageSize={onPageSize}
            />
          ) : null}
        </div>
      )}

    </section>
  );
}

function GuestFolioTable({
  title,
  resultCount,
  rows,
  loading,
  error,
  total,
  from,
  to,
  page,
  pageCount,
  pageSize,
  selectedId,
  searchTerm,
  hasFilters,
  filterSummary,
  money,
  canOperate,
  canManage,
  onSelect,
  onPage,
  onPageSize,
  onRetry,
  onClearFilters,
}: {
  title: string;
  resultCount: number;
  rows: GuestFolioSearchRow[];
  loading: boolean;
  error: string | null;
  total: number;
  from: number;
  to: number;
  page: number;
  pageCount: number;
  pageSize: number;
  selectedId: string | null;
  searchTerm: string;
  hasFilters: boolean;
  filterSummary?: string;
  money: (value: number) => string;
  canOperate: boolean;
  canManage: boolean;
  onSelect: (row: GuestFolioSearchRow) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onRetry: () => void;
  onClearFilters: () => void;
}) {
  const emptyDescription = searchTerm.trim()
    ? `No folio found for "${searchTerm.trim()}".`
    : "No folios match the selected filters.";

  return (
    <section className="w-full min-w-0 space-y-3">
      <ResultsSectionHeader
        title={title}
        resultCount={resultCount}
        filterSummary={filterSummary}
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
      />

      {loading ? (
        <InventoryState state="loading" title="Loading folios…" />
      ) : error ? (
        <InventoryState
          state="error"
          title="Folios could not be loaded."
          description={error}
          onRetry={onRetry}
        />
      ) : rows.length === 0 ? (
        <InventoryState state="empty" title="No folios match the selected filters." description={emptyDescription} />
      ) : (
        <div className={TABLE_SHELL}>
          <table className={FOLIO_RESULTS_TABLE_CLASS}>
            <FolioResultsColGroup />
            <FolioResultsTableHead />
            <tbody>
              {rows.map((folio) => {
                const selected = selectedId === folio.id;
                return (
                  <tr
                    key={folio.id}
                    data-testid="folio-row"
                    onClick={() => onSelect(folio)}
                    className={tableRowClass(selected)}
                  >
                    <td className="px-3 py-2.5">
                      <IconTextCell
                        icon={FileText}
                        primary={folio.folioNumber}
                        secondary={folio.confirmationNumber ?? undefined}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-start gap-2">
                        <GuestAvatarCell name={folio.guestName} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{folio.guestName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {formatStayRange(folio.arrivalDate, folio.departureDate)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <IconTextCell
                        icon={BedDouble}
                        primary={folio.roomNumber ?? "—"}
                        secondary={folio.roomTypeName ?? undefined}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-1">
                        <FolioSearchFolioStatusBadge status={folio.status} />
                        <FolioSearchStayStatusBadge status={folio.reservationStatus} />
                        {folio.unsettledCheckout ? (
                          <p className="text-[10px] font-medium text-destructive">Unsettled checkout</p>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <BalanceCell balance={folio.balance} money={money} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock3 className="size-3.5 shrink-0" aria-hidden />
                        <span className="whitespace-nowrap">
                          {folio.lastActivity ? formatDeskDate(folio.lastActivity.slice(0, 10)) : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-1 py-2.5" onClick={(event) => event.stopPropagation()}>
                      <FolioActionMenu folio={folio} canOperate={canOperate} canManage={canManage} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > 0 ? (
            <FolioSearchPaginationFooter
              from={from}
              to={to}
              total={total}
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              onPage={onPage}
              onPageSize={onPageSize}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function FolioDetailsDrawer({
  row,
  detail,
  loading,
  error,
  selectedId,
  money,
  dateTime,
  canOperate,
  canManage,
  onClose,
}: {
  row: GuestFolioSearchRow | null;
  detail: FolioDetail | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  canOperate: boolean;
  canManage: boolean;
  onClose: () => void;
}) {
  const folio = detail ?? row;
  if ((loading || !folio) && selectedId) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error && !folio) {
    return (
      <div className="space-y-3 p-5 text-sm">
        <p className="text-destructive">Could not load folio details.</p>
        <p className="text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }
  if (!folio) return null;

  const nights = nightsBetween(folio.arrivalDate, folio.departureDate);
  const payments = detail
    ? Math.abs(
        detail.transactions.filter((txn) => txn.type === "payment").reduce((sum, txn) => sum + txn.amount, 0),
      )
    : Math.abs(row?.credits ?? 0);
  const adjustments =
    detail?.transactions
      .filter((txn) => ["refund", "adjustment", "discount"].includes(txn.type))
      .reduce((sum, txn) => sum + txn.amount, 0) ?? 0;
  const depositApplied = detail
    ? Math.abs(
        detail.transactions.filter((txn) => txn.type === "deposit").reduce((sum, txn) => sum + txn.amount, 0),
      )
    : 0;

  const guestId = detail?.guestId;
  const guestPhone = detail?.guestPhone ?? row?.guestPhone ?? "—";
  const guestEmail = detail?.guestEmail ?? row?.guestEmail ?? "—";
  const ratePlanName = detail?.ratePlanName ?? row?.ratePlanName ?? "—";
  const recentActivity = detail
    ? [...detail.transactions]
        .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt))
        .slice(0, 4)
    : [];

  return (
    <div className="flex min-h-full flex-col bg-background" data-testid="folio-quick-view">
      <div className="border-b border-[#E8E1D7] bg-card px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="size-4 shrink-0 text-[#C89933]" aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Folio Details
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {folio.id ? (
              <FolioActionMenu
                folio={{ id: folio.id, folioNumber: folio.folioNumber, status: folio.status }}
                canOperate={canOperate}
                canManage={canManage}
              />
            ) : null}
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <h2 className="mt-3 font-display text-xl font-semibold leading-tight">{folio.folioNumber}</h2>
        <p className="mt-0.5 truncate text-sm font-medium">{folio.guestName}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <FolioSearchFolioStatusBadge status={folio.status} />
          <FolioSearchStayStatusBadge status={folio.reservationStatus} />
        </div>
        <Button asChild variant="outline" size="sm" className="mt-3 h-8 w-full gap-1">
          <Link
            to="/restaurant/pms/cashiering/folios/$folioId"
            params={{ folioId: folio.id }}
            data-testid="folio-open-page"
          >
            Open in Workspace
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <DrawerCard title="Guest">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className="bg-[#C89933]/15 text-xs font-semibold text-[#251605]">
                  {nameInitials(folio.guestName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{folio.guestName}</p>
                <p className="text-[11px] text-muted-foreground">Guest Profile</p>
              </div>
            </div>
            {guestId ? (
              <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs">
                <Link to="/restaurant/pms/guests/$guestId" params={{ guestId }}>
                  View Profile
                  <ArrowRight className="ml-1 size-3" />
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <DrawerContactRow icon={Phone} value={guestPhone} />
            <DrawerContactRow icon={Mail} value={guestEmail} />
            <DrawerContactRow icon={Globe} value="—" muted />
          </div>
        </DrawerCard>

        <DrawerCard title="Stay">
          <div className="space-y-3 text-sm">
            <IconTextCell
              icon={BedDouble}
              primary={`Room ${folio.roomNumber ?? "—"}`}
              secondary={folio.roomTypeName ?? undefined}
            />
            <IconTextCell
              icon={CalendarDays}
              primary={formatStayRange(folio.arrivalDate, folio.departureDate)}
              secondary={nights === null ? undefined : `${nights} nights`}
            />
            <IconTextCell
              icon={ClipboardCheck}
              primary={folio.confirmationNumber ?? "—"}
              secondary="Reservation"
            />
            <div className="rounded-lg border border-[#E8E1D7]/80 bg-muted/20 px-2.5 py-2">
              <p className="text-[11px] text-muted-foreground">Rate Plan</p>
              <p className="mt-0.5 font-medium">{ratePlanName}</p>
            </div>
            {detail?.marketSegment || row?.marketSegment ? (
              <p className="text-[11px] text-muted-foreground">
                {detail?.marketSegment ?? row?.marketSegment}
                {detail?.bookingSource || row?.bookingSource
                  ? ` · ${detail?.bookingSource ?? row?.bookingSource}`
                  : ""}
              </p>
            ) : null}
          </div>
        </DrawerCard>

        <DrawerCard title="Financial Summary">
          <div className="space-y-2 text-sm">
            <FinancialLine label="Charges" value={money(folio.charges)} />
            <FinancialLine label="Payments" value={`-${money(payments)}`} valueTone="credit" />
            <FinancialLine label="Deposits Applied" value={money(depositApplied)} valueTone="info" />
            <FinancialLine label="Adjustments" value={money(adjustments)} />
          </div>
          <div className="mt-4 border-t border-[#E8E1D7] pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Current Balance
            </p>
            <p className={cn("mt-1 font-display text-lg font-semibold tabular-nums", balanceTone(folio.balance))}>
              {money(folio.balance)}
            </p>
            <InventoryStatusBadge tone={balanceState(folio.balance) === "settled" ? "success" : balanceState(folio.balance) === "credit" ? "info" : "danger"}>
              {balanceLabel(folio.balance)}
            </InventoryStatusBadge>
          </div>
        </DrawerCard>

        {recentActivity.length > 0 ? (
          <DrawerCard title="Recent Activity">
            <ul className="space-y-3">
              {recentActivity.map((txn) => {
                const TxnIcon = transactionActivityIcon(txn);
                const isCredit = txn.type === "payment" || txn.type === "deposit";
                return (
                  <li key={txn.id} className="flex gap-2.5">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#C89933]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <TxnIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{transactionActivityTitle(txn)}</p>
                          <p
                            className={cn(
                              "tabular-nums text-sm",
                              isCredit
                                ? "text-emerald-700 dark:text-emerald-400"
                                : txn.type === "refund"
                                  ? "text-destructive"
                                  : "text-foreground",
                            )}
                          >
                            {isCredit ? "-" : ""}
                            {money(Math.abs(txn.amount))}
                            {txn.paymentMethod ? ` · ${txn.paymentMethod}` : ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatActivityWhen(txn.postedAt, dateTime)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button asChild variant="ghost" size="sm" className="mt-3 h-8 w-full text-xs">
              <Link to="/restaurant/pms/cashiering/folios/$folioId" params={{ folioId: folio.id }}>
                View all transactions
                <ArrowRight className="ml-1 size-3" />
              </Link>
            </Button>
          </DrawerCard>
        ) : null}
      </div>
    </div>
  );
}

function DrawerCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={DRAWER_CARD}>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function DrawerContactRow({
  icon: Icon,
  value,
  muted,
}: {
  icon: LucideIcon;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className={cn("truncate", muted && "text-muted-foreground")}>{value}</span>
    </div>
  );
}

function FinancialLine({
  label,
  value,
  valueTone = "default",
}: {
  label: string;
  value: string;
  valueTone?: "default" | "credit" | "info" | "danger";
}) {
  const toneClass =
    valueTone === "credit"
      ? "text-emerald-700 dark:text-emerald-400"
      : valueTone === "info"
        ? "text-blue-700 dark:text-blue-400"
        : valueTone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", toneClass)}>{value}</span>
    </div>
  );
}

function FinancialAccountsTable({
  mode,
  title,
  resultCount,
  rows,
  loading,
  error,
  money,
}: {
  mode: "company" | "group";
  title: string;
  resultCount: number;
  rows: Array<{
    id: string;
    accountNumber: string;
    masterName: string;
    status: "open" | "closed";
    balance: number;
    currency: string;
    openedAt: string;
  }>;
  loading: boolean;
  error: string | null;
  money: (value: number) => string;
}) {
  const nameLabel = mode === "company" ? "Company" : "Group";
  const AccountIcon = mode === "company" ? Building2 : UsersRound;
  return (
    <section className="w-full min-w-0 space-y-3">
      <ResultsSectionHeader title={title} resultCount={resultCount} />

      {loading ? (
        <InventoryState state="loading" title="Loading folios…" />
      ) : error ? (
        <InventoryState state="error" title="Folios could not be loaded." description={error} />
      ) : rows.length === 0 ? (
        <InventoryState
          state="empty"
          title="No folios match the selected filters."
          description={`No ${mode} financial accounts match your search.`}
        />
      ) : (
        <div className={TABLE_SHELL}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className={TABLE_HEAD}>
              <tr>
                <th className="px-3 py-2.5 font-semibold">Account</th>
                <th className="px-3 py-2.5 font-semibold">{nameLabel}</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
                <th className="px-3 py-2.5 font-semibold">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={cn(TABLE_ROW, ROW_HOVER)}>
                  <td className="px-3 py-2.5">
                    <IconTextCell icon={AccountIcon} primary={row.accountNumber} secondary={nameLabel} />
                  </td>
                  <td className="px-3 py-2.5 font-medium">{row.masterName}</td>
                  <td className="px-3 py-2.5">
                    <FolioSearchFolioStatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <BalanceCell balance={row.balance} money={money} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock3 className="size-3.5 shrink-0" aria-hidden />
                      <span>{formatDeskDate(row.openedAt.slice(0, 10))}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
