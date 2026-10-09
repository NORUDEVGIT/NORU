import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { LucideIcon } from "lucide-react";
import {
  BedDouble,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  Info,
  Landmark,
  Link2,
  Lock,
  Network,
  Printer,
  Receipt,
  ReceiptText,
  Tag,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { CashieringChrome } from "@/packages/pms/components/cashiering/cashiering-chrome";
import {
  FolioSearchFolioStatusBadge,
  FolioSearchStayStatusBadge,
  isTaxRelatedCategory,
  labelTransactionCategory,
  labelTransactionType,
} from "@/packages/pms/components/cashiering/folio-bits";
import {
  CloseFolioDialog,
  FolioEntryDialog,
} from "@/packages/pms/components/cashiering/folio-dialogs";
import { ChargeDetailsSheet, chargeDepartment, chargeItemTitle, chargeQuantity, chargeUnitAmount } from "@/packages/pms/components/cashiering/charge-details-sheet";
import { CorrectChargeDialog } from "@/packages/pms/components/cashiering/correct-charge-dialog";
import { TransferChargeDialog } from "@/packages/pms/components/cashiering/transfer-charge-dialog";
import { PostChargeDialog } from "@/packages/pms/components/cashiering/post-charge-dialog";
import { FolioInvoicePanel } from "@/packages/pms/components/cashiering/folio-invoice-panel";
import {
  AdjustmentsTab,
  ApplyDepositDialog,
  CARD,
  ChargesTab,
  FolioKpiRow,
  FolioSidebar,
  PaymentsDepositsTab,
  SettlementTab,
  TransactionDetailDialog,
  TransfersTab,
  WriteOffDialog,
  formatBalance,
  methodLabel,
  type RowActions,
} from "@/packages/pms/components/cashiering/folio-workspace-panels";
import {
  InventoryState,
  InventoryStatusBadge,
} from "@/packages/pms/components/rooms/room-inventory-shared";
import { GuestInvoiceWorkspace } from "@/packages/pms/components/cashiering/guest-invoice-builder";
import {
  reprintGuestFolioInvoice,
  type InvoiceActionResult,
} from "@/packages/pms/lib/cashiering-invoices.functions";
import type { IssuedFolioInvoiceRow } from "@/packages/pms/lib/cashiering-invoices.server";
import {
  getCashieringCorrectionNotice,
  getDefaultDepositPolicy,
  getFolioWorkspace,
  type FolioTransactionRow,
  type FolioWorkspace,
} from "@/packages/pms/lib/cashiering.functions";
import {
  cashieringTabSearch,
  isFolioAction,
  type CashieringTabId,
} from "@/packages/pms/lib/cashiering-shell";
import type { TransactionType } from "@/packages/pms/lib/cashiering.server";
import {
  FOLIO_WORKSPACE_TABS,
  stayNights,
  type FolioWorkspaceTabId,
} from "@/packages/pms/lib/folio-workspace";
import { formatStayDate } from "@/packages/pms/lib/reservation-dates";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";

const TABLE_HEAD =
  "border-b border-[#E8E1D7] bg-muted/30 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TABLE_ROW = "border-b border-[#E8E1D7]/80 last:border-0 transition-colors hover:bg-muted/20";
const NOT_CONFIGURED = "Not configured";

function resolveTab(value: string | undefined): FolioWorkspaceTabId {
  return FOLIO_WORKSPACE_TABS.find((tab) => tab.id === value)?.id ?? "charges";
}

export function GuestFolioPage({
  membership,
  folioId,
  initialAction,
  initialTab,
}: {
  membership: RestaurantMembership;
  folioId: string;
  initialAction?: string | undefined;
  initialTab?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const businessDate = usePropertyBusinessDate(restaurantId, membership.restaurant.timezone);

  const fetchWorkspace = useServerFn(getFolioWorkspace);
  const fetchDepositPolicy = useServerFn(getDefaultDepositPolicy);
  const fetchCorrectionNotice = useServerFn(getCashieringCorrectionNotice);
  const query = useQuery({
    queryKey: ["folio", restaurantId, folioId, "workspace"],
    queryFn: () => fetchWorkspace({ data: { restaurantId, folioId } }),
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

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["folio", restaurantId, folioId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-folios", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-ledger", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["cashiering-dashboard", restaurantId] });
  }

  function go(tab: CashieringTabId) {
    void navigate({ to: "/restaurant/pms/cashiering", search: cashieringTabSearch(tab, folioId) });
  }

  const workspace = query.data as FolioWorkspace | null | undefined;
  return (
    <CashieringChrome
      membership={membership}
      active="folios"
      onNavigate={go}
      onSearch={() => go("folios")}
      onPostPayment={() => go("payments")}
      bodyClassName="space-y-4 p-3 sm:p-4"
    >
      {query.isLoading ? <WorkspaceSkeleton /> : null}
      {query.isError ? (
        <InventoryState
          state="error"
          title="Folio workspace could not be loaded."
          description={(query.error as Error).message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {!query.isLoading && !query.isError && !workspace ? (
        <InventoryState
          state="empty"
          title="Folio not found"
          description="This folio does not exist for this property."
        />
      ) : null}
      {workspace ? (
        <FolioWorkspaceBody
          restaurantId={restaurantId}
          propertyName={membership.restaurant.name}
          businessDate={businessDate}
          workspace={workspace}
          initialAction={initialAction}
          initialTab={initialTab}
          depositPolicySummary={depositPolicyQuery.data?.summary ?? null}
          correctionNotice={correctionNoticeQuery.data ?? null}
          onChanged={refresh}
        />
      ) : null}
    </CashieringChrome>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="space-y-4" data-testid="folio-workspace-loading">
      <Skeleton className="h-4 w-56" />
      <div className={cn(CARD, "space-y-3 p-4")}>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_288px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function MetaCell({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-2.5 lg:border-l lg:border-[#E8E1D7]/80 lg:first:border-l-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm tabular-nums",
          muted ? "text-muted-foreground" : "font-medium",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function ActionItem({
  icon: Icon,
  children,
  onSelect,
  disabled,
}: {
  icon: LucideIcon;
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} disabled={disabled ?? false}>
      <Icon className="size-4 text-muted-foreground" />
      {children}
    </DropdownMenuItem>
  );
}

function FolioWorkspaceBody({
  restaurantId,
  propertyName,
  businessDate,
  workspace,
  initialAction,
  initialTab,
  depositPolicySummary,
  correctionNotice,
  onChanged,
}: {
  restaurantId: string;
  propertyName: string;
  businessDate: string;
  workspace: FolioWorkspace;
  initialAction?: string | undefined;
  initialTab?: string | undefined;
  depositPolicySummary: string | null;
  correctionNotice: {
    authorizer?: string | null;
    adjustmentThreshold?: string | null;
    discountThreshold?: string | null;
  } | null;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const money = useMoney();
  const { dateTime } = useRestaurantTime();
  const folio = workspace.folio;
  const caps = workspace.capabilities;

  const [tab, setTab] = useState<FolioWorkspaceTabId>(() => resolveTab(initialTab));
  const [entryType, setEntryType] = useState<TransactionType | null>(null);
  const [entrySourceId, setEntrySourceId] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyDepositId, setApplyDepositId] = useState<string | null>(null);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<FolioTransactionRow | null>(null);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [correctSourceId, setCorrectSourceId] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<"statement" | "invoice">("statement");
  const [printInvoice, setPrintInvoice] = useState<IssuedFolioInvoiceRow | null>(null);

  useEffect(() => {
    setTab(resolveTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (!isFolioAction(initialAction)) return;
    if (initialAction === "close") {
      if (caps.canClose) setCloseOpen(true);
      return;
    }
    const allowed: Record<TransactionType, boolean> = {
      charge: caps.canPostCharge,
      payment: caps.canPostPayment,
      deposit: caps.canPostDeposit,
      refund: caps.canRefund,
      discount: caps.canDiscount,
      adjustment: caps.canAdjust,
    };
    if (allowed[initialAction]) openEntry(initialAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, caps]);

  function selectTab(next: FolioWorkspaceTabId) {
    setTab(next);
    void navigate({
      to: "/restaurant/pms/cashiering/folios/$folioId",
      params: { folioId: folio.id },
      search: next === "charges" ? {} : { tab: next },
      replace: true,
    });
  }

  function openEntry(type: TransactionType, sourceId: string | null = null) {
    setEntrySourceId(sourceId);
    setEntryType(type);
  }

  function printWith(mode: "statement" | "invoice") {
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 50);
  }

  function openTransfer(sourceId: string | null) {
    setTransferSourceId(sourceId);
    setTransferOpen(true);
  }

  function openApply(depositId: string | null) {
    setApplyDepositId(depositId);
    setApplyOpen(true);
  }

  const reprintInvoice = useServerFn(reprintGuestFolioInvoice);
  const reprintMut = useMutation({
    mutationFn: (invoice: IssuedFolioInvoiceRow) =>
      reprintInvoice({
        data: { restaurantId, invoiceId: invoice.id },
      }) as Promise<InvoiceActionResult>,
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Reprint recorded for ${result.invoice.issuedNumber}.`);
      setPrintInvoice(result.invoice);
      onChanged();
      printWith("invoice");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const chargeGroup = chargeId
    ? (workspace.chargeGroups.find((group) => group.parent.id === chargeId) ?? null)
    : null;
  const correctRow = correctSourceId
    ? (folio.transactions.find((row) => row.id === correctSourceId) ?? null)
    : null;

  const rowActions: RowActions = {
    onDetails: (row) => {
      if (row.type === "charge") {
        setDetailRow(null);
        setChargeId(row.id);
        return;
      }
      setChargeId(null);
      setDetailRow(row);
    },
    onTransfer: (row) => openTransfer(row.id),
    onCorrect: (type, row) => openEntry(type, row.id),
    onCorrectCharge: (row) => setCorrectSourceId(row.id),
  };

  const nights = stayNights(folio.arrivalDate, folio.departureDate);
  const open = folio.status === "open";
  const subline = [
    folio.confirmationNumber,
    folio.roomNumber ? `Room ${folio.roomNumber}` : null,
    folio.roomTypeName,
  ]
    .filter(Boolean)
    .join(" · ");
  const meta: Array<{ icon: LucideIcon; label: string; value: string; muted?: boolean }> = [
    {
      icon: CalendarDays,
      label: "Arrival",
      value: folio.arrivalDate ? formatStayDate(folio.arrivalDate.slice(0, 10)) : "—",
    },
    {
      icon: CalendarDays,
      label: "Departure",
      value: folio.departureDate ? formatStayDate(folio.departureDate.slice(0, 10)) : "—",
    },
    { icon: BedDouble, label: "Nights", value: nights ? String(nights) : "—" },
    {
      icon: Tag,
      label: "Rate Plan",
      value: folio.ratePlanName ?? folio.ratePlanCode ?? NOT_CONFIGURED,
      muted: !folio.ratePlanName && !folio.ratePlanCode,
    },
    {
      icon: UsersRound,
      label: "Market Segment",
      value: folio.marketSegment ?? NOT_CONFIGURED,
      muted: !folio.marketSegment,
    },
    {
      icon: Link2,
      label: "Booking Source",
      value: folio.bookingSource ?? NOT_CONFIGURED,
      muted: !folio.bookingSource,
    },
    ...(folio.salesChannel
      ? [{ icon: Network, label: "Sales Channel", value: folio.salesChannel }]
      : []),
  ];

  return (
    <div className="space-y-4" data-testid="guest-folio-page">
      <div className="space-y-4 print:hidden">
        <nav
          className="flex items-center gap-1 text-xs text-muted-foreground"
          aria-label="Breadcrumb"
        >
          <Link
            to="/restaurant/pms/cashiering"
            search={cashieringTabSearch("overview")}
            className="hover:text-foreground"
          >
            Cashiering
          </Link>
          <ChevronRight className="size-3" />
          <Link
            to="/restaurant/pms/cashiering"
            search={{ tab: "folios", folio: folio.id }}
            className="hover:text-foreground"
          >
            Folio Search
          </Link>
          <ChevronRight className="size-3" />
          <span className="font-medium text-foreground">{folio.folioNumber}</span>
        </nav>

        <header className={cn(CARD, "overflow-hidden")} data-testid="folio-header">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C89933]/12 text-[#8a6a1f]">
                <ReceiptText className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-semibold leading-tight tracking-tight">
                    {folio.folioNumber}
                  </h2>
                  <FolioSearchFolioStatusBadge status={folio.status} />
                  {folio.reservationStatus ? (
                    <FolioSearchStayStatusBadge status={folio.reservationStatus} />
                  ) : null}
                  {folio.unsettledCheckout ? (
                    <InventoryStatusBadge tone="warning">Unsettled</InventoryStatusBadge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-sm font-medium">{folio.guestName}</p>
                {subline ? (
                  <p className="truncate text-xs text-muted-foreground">{subline}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-3 text-[11px] text-muted-foreground md:flex">
                <span className="flex items-center gap-1">
                  <Building2 className="size-3.5" />
                  {propertyName}
                </span>
                <span>Business date · {formatStayDate(businessDate)}</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="About this folio"
                  >
                    <Info className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs leading-5">
                  Each posting records a ledger line; posted lines are never edited. Corrections
                  post as adjustments, discounts or refunds. Add deposit credit records a folio
                  credit. Tax and service lines reflect Settings at post time. Print statement is
                  not an issued invoice.
                </TooltipContent>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="h-8 bg-[#C89933] px-3 text-[#251605] hover:bg-[#B5882D]"
                    data-testid="folio-actions"
                  >
                    Actions <ChevronDown className="ml-1 size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {caps.canPostCharge ? (
                    <ActionItem icon={Receipt} onSelect={() => openEntry("charge")}>
                      Post Charge
                    </ActionItem>
                  ) : null}
                  {caps.canPostPayment ? (
                    <ActionItem icon={CreditCard} onSelect={() => openEntry("payment")}>
                      Receive Payment
                    </ActionItem>
                  ) : null}
                  {caps.canPostDeposit ? (
                    <ActionItem icon={Landmark} onSelect={() => openEntry("deposit")}>
                      Add Deposit
                    </ActionItem>
                  ) : null}
                  {caps.canPostCharge || caps.canPostPayment || caps.canPostDeposit ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  <ActionItem icon={Printer} onSelect={() => printWith("statement")}>
                    Print Statement
                  </ActionItem>
                  {caps.canIssueInvoice ? (
                    <ActionItem icon={FileText} onSelect={() => selectTab("invoices")}>
                      Create Invoice
                    </ActionItem>
                  ) : null}
                  {caps.canReprintInvoice && folio.issuedInvoices[0] ? (
                    <ActionItem
                      icon={FileText}
                      onSelect={() => reprintMut.mutate(folio.issuedInvoices[0])}
                      disabled={reprintMut.isPending}
                    >
                      Reprint Invoice
                    </ActionItem>
                  ) : null}
                  {workspace.canManage && open ? (
                    <>
                      <DropdownMenuSeparator />
                      <ActionItem
                        icon={Lock}
                        disabled={!caps.canClose}
                        onSelect={() => setCloseOpen(true)}
                      >
                        Close Folio
                      </ActionItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <dl className="grid grid-cols-2 border-t border-[#E8E1D7] bg-muted/10 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
            {meta.map((item) => (
              <MetaCell key={item.label} {...item} />
            ))}
          </dl>
        </header>

        <FolioKpiRow summary={workspace.financialSummary} money={money} />

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_288px] xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            <nav
              className="flex items-end gap-1 overflow-x-auto border-b border-[#E8E1D7] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Folio sections"
            >
              {FOLIO_WORKSPACE_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  data-testid={`folio-tab-${item.id}`}
                  onClick={() => selectTab(item.id)}
                  className={cn(
                    "relative flex h-10 shrink-0 items-center whitespace-nowrap px-2.5 text-xs font-medium transition-colors",
                    tab === item.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                  {tab === item.id ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
                  ) : null}
                </button>
              ))}
            </nav>

            {tab === "charges" ? (
              <ChargesTab
                workspace={workspace}
                money={money}
                dateTime={dateTime}
                actions={rowActions}
                selectedChargeId={chargeId}
                onPostCharge={() => openEntry("charge")}
                onPostAdjustment={() => openEntry("adjustment")}
                onTransferCharge={() => openTransfer(null)}
                onGoTab={selectTab}
              />
            ) : null}
            {tab === "payments" ? (
              <PaymentsDepositsTab
                workspace={workspace}
                money={money}
                dateTime={dateTime}
                actions={rowActions}
                onReceivePayment={() => openEntry("payment")}
                onAddDeposit={() => openEntry("deposit")}
                onAllocate={(line) => openApply(line.transaction.id)}
              />
            ) : null}
            {tab === "adjustments" ? (
              <AdjustmentsTab
                workspace={workspace}
                money={money}
                dateTime={dateTime}
                actions={rowActions}
              />
            ) : null}
            {tab === "transfers" ? (
              <TransfersTab
                workspace={workspace}
                money={money}
                dateTime={dateTime}
                onTransferCharge={() => openTransfer(null)}
              />
            ) : null}
            {tab === "invoices" ? (
              <GuestInvoiceWorkspace
                restaurantId={restaurantId}
                workspace={workspace}
                money={money}
                dateTime={dateTime}
                onChanged={onChanged}
                onPostCharge={() => openEntry("charge")}
                onReprint={(invoice) => reprintMut.mutate(invoice)}
                reprinting={reprintMut.isPending}
              />
            ) : null}
            {tab === "history" ? (
              <HistoryList workspace={workspace} money={money} dateTime={dateTime} />
            ) : null}
            {tab === "settlement" ? (
              <SettlementTab
                workspace={workspace}
                money={money}
                dateTime={dateTime}
                onAllocate={() => openApply(null)}
                onReceivePayment={() => openEntry("payment")}
                onWriteOff={() => setWriteOffOpen(true)}
                onClose={() => setCloseOpen(true)}
              />
            ) : null}
          </div>
          <FolioSidebar
            workspace={workspace}
            money={money}
            dateTime={dateTime}
            onViewInvoice={() => selectTab("invoices")}
          />
        </div>
      </div>

      {printMode === "statement" ? (
        <StatementPrint
          workspace={workspace}
          money={money}
          dateTime={dateTime}
          propertyName={propertyName}
        />
      ) : null}
      {printMode === "invoice" && printInvoice ? (
        <FolioInvoicePanel invoice={printInvoice} money={money} dateTime={dateTime} />
      ) : null}

      {entryType === "charge" ? (
        <PostChargeDialog
          restaurantId={restaurantId}
          folio={folio}
          open
          onClose={() => {
            setEntryType(null);
            setEntrySourceId(null);
          }}
          onDone={onChanged}
        />
      ) : null}
      <FolioEntryDialog
        restaurantId={restaurantId}
        folioId={folio.id}
        type={entryType === "charge" ? null : entryType}
        open={entryType !== null && entryType !== "charge"}
        sources={folio.transactions}
        initialSourceId={entrySourceId}
        depositPolicySummary={depositPolicySummary}
        currentBalance={workspace.financialSummary.currentBalance}
        currencyCode={folio.currency}
        authorizerNote={correctionNotice?.authorizer ?? null}
        thresholdNote={
          (entryType === "adjustment"
            ? correctionNotice?.adjustmentThreshold
            : entryType === "discount"
              ? correctionNotice?.discountThreshold
              : null) ?? null
        }
        onClose={() => {
          setEntryType(null);
          setEntrySourceId(null);
        }}
        onDone={onChanged}
      />
      <CloseFolioDialog
        restaurantId={restaurantId}
        folioId={folio.id}
        balance={folio.balance}
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        onDone={onChanged}
      />
      {caps.canTransfer ? (
        <TransferChargeDialog
          restaurantId={restaurantId}
          workspace={workspace}
          initialSourceId={transferSourceId}
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          onDone={onChanged}
        />
      ) : null}
      {workspace.canManage ? (
        <ApplyDepositDialog
          restaurantId={restaurantId}
          workspace={workspace}
          initialDepositId={applyDepositId}
          open={applyOpen}
          onClose={() => setApplyOpen(false)}
          onDone={onChanged}
        />
      ) : null}
      {caps.canWriteOff ? (
        <WriteOffDialog
          restaurantId={restaurantId}
          folioId={folio.id}
          balance={workspace.financialSummary.currentBalance}
          open={writeOffOpen}
          onClose={() => setWriteOffOpen(false)}
          onDone={onChanged}
        />
      ) : null}
      <TransactionDetailDialog
        restaurantId={restaurantId}
        folioId={folio.id}
        row={detailRow}
        rows={folio.transactions}
        depositLine={
          detailRow
            ? (workspace.depositLines.find((line) => line.transaction.id === detailRow.id) ?? null)
            : null
        }
        money={money}
        dateTime={dateTime}
        onClose={() => setDetailRow(null)}
      />
      <ChargeDetailsSheet
        group={chargeGroup}
        workspace={workspace}
        money={money}
        dateTime={dateTime}
        onClose={() => setChargeId(null)}
        onCorrectCharge={() => {
          if (!chargeGroup) return;
          setCorrectSourceId(chargeGroup.parent.id);
        }}
        onTransferCharge={() => {
          if (!chargeGroup) return;
          openTransfer(chargeGroup.parent.id);
        }}
      />
      <CorrectChargeDialog
        restaurantId={restaurantId}
        sourceTransactionId={correctRow?.id ?? null}
        title={correctRow ? chargeItemTitle(correctRow) : "Charge"}
        department={correctRow ? chargeDepartment(correctRow) : null}
        quantity={correctRow ? chargeQuantity(correctRow) : null}
        unitAmount={correctRow ? chargeUnitAmount(correctRow) : null}
        open={correctRow != null}
        allowReplacement
        onClose={() => setCorrectSourceId(null)}
        onDone={onChanged}
        onPostReplacement={() => setEntryType("charge")}
        money={money}
      />
    </div>
  );
}

function lineTypeLabel(row: FolioTransactionRow): string {
  return isTaxRelatedCategory(row.category)
    ? labelTransactionCategory(row.category)
    : labelTransactionType(row.type);
}

function HistoryList({
  workspace,
  money,
  dateTime,
}: {
  workspace: FolioWorkspace;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
}) {
  const rows = [...workspace.folio.transactions].sort((a, b) =>
    a.postedAt < b.postedAt ? -1 : a.postedAt > b.postedAt ? 1 : 0,
  );
  const invoice = workspace.folio.issuedInvoice;
  return (
    <section className={cn(CARD, "overflow-hidden")} data-testid="folio-history">
      <div className="border-b border-[#E8E1D7] px-4 py-3">
        <h3 className="text-sm font-semibold">History</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every posted line in order, with who posted it.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="p-4">
          <InventoryState state="empty" title="No posted lines yet" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className={TABLE_HEAD}>
              <tr>
                <th className="px-3 py-2.5 font-medium">Posted</th>
                <th className="px-3 py-2.5 font-medium">Event</th>
                <th className="px-3 py-2.5 font-medium">Description</th>
                <th className="px-3 py-2.5 font-medium">Method</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 font-medium">Posted by</th>
                <th className="px-3 py-2.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={TABLE_ROW}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {dateTime(row.postedAt)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">{lineTypeLabel(row)}</td>
                  <td className={cn("px-3 py-2", row.originalTransactionId && "pl-6")}>
                    {row.originalTransactionId && isTaxRelatedCategory(row.category) ? (
                      <span className="text-muted-foreground">↳ </span>
                    ) : null}
                    {row.description}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.paymentMethod ? methodLabel(row.paymentMethod) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.postedBy ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {row.sourceDescription ?? "—"}
                  </td>
                </tr>
              ))}
              {invoice ? (
                <tr className={cn(TABLE_ROW, "bg-blue-500/5")}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {dateTime(invoice.issuedAt)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">Invoice issued</td>
                  <td className="px-3 py-2" colSpan={5}>
                    {invoice.issuedNumber}
                    {invoice.reprintCount > 0 && invoice.lastReprintedAt
                      ? ` · reprinted ${invoice.reprintCount}×, last ${dateTime(invoice.lastReprintedAt)}`
                      : ""}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatementPrint({
  workspace,
  money,
  dateTime,
  propertyName,
}: {
  workspace: FolioWorkspace;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  propertyName: string;
}) {
  const folio = workspace.folio;
  const s = workspace.financialSummary;
  return (
    <section
      className="hidden space-y-4 bg-white p-6 text-foreground print:block"
      data-testid="folio-statement-print"
    >
      <div>
        <p className="text-xs uppercase tracking-wide">{propertyName}</p>
        <h1 className="text-lg font-semibold">Folio statement · {folio.folioNumber}</h1>
        <p className="text-sm">
          {folio.guestName}
          {folio.roomNumber ? ` · Room ${folio.roomNumber}` : ""}
          {folio.confirmationNumber ? ` · ${folio.confirmationNumber}` : ""}
        </p>
        <p className="text-xs">This statement is not an issued invoice.</p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1">Posted</th>
            <th className="py-1">Type</th>
            <th className="py-1">Description</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {folio.transactions.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="py-1">{dateTime(row.postedAt)}</td>
              <td className="py-1">{lineTypeLabel(row)}</td>
              <td className="py-1">{row.description}</td>
              <td className="py-1 text-right tabular-nums">{money(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-64 space-y-1 text-sm">
        <PrintRow label="Net charges" value={money(s.netCharges)} />
        <PrintRow label="Tax & service" value={money(s.tax + s.serviceCharge)} />
        <PrintRow label="Payments & deposits" value={money(-(s.payments + s.deposits))} />
        <PrintRow label="Balance" value={formatBalance(money, s.currentBalance)} />
      </div>
    </section>
  );
}

function PrintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
