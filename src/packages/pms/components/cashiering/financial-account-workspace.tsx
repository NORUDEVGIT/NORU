import * as React from "react";
import { useCallback, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Info as InfoIcon,
  Landmark,
  Lock,
  Receipt,
  Undo2,
  UsersRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { invalidateFrontOfficeOwnerReads } from "@/packages/pms/lib/fo-freshness";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { AccountInvoiceWorkspace } from "@/packages/pms/components/cashiering/account-invoice-builder";
import { FinancialAccountHistory } from "@/packages/pms/components/cashiering/financial-account-history-panel";
import { FinancialAccountPayments } from "@/packages/pms/components/cashiering/financial-account-payments-panel";
import { FinancialAccountStatement } from "@/packages/pms/components/cashiering/financial-account-statement-panel";
import {
  FinancialAccountCharges,
  FinancialAccountSourceFolios,
} from "@/packages/pms/components/cashiering/financial-account-ownership-panels";
import {
  AccountDetailsSearch,
  AccountSectionBurger,
  AccountToolbarSearchProvider,
  isAccountSection,
  type AccountSectionId,
  type AccountToolbarSearch,
} from "@/packages/pms/components/cashiering/financial-account-chrome";
import { CashieringToolbarSearch } from "@/packages/pms/components/cashiering/cashiering-shell-slots";
import {
  FolioChromeProvider,
  type FolioChromeSlots,
} from "@/packages/pms/components/cashiering/folio-workspace-chrome";
import { CashieringChrome } from "@/packages/pms/components/cashiering/cashiering-chrome";
import {
  accountBalanceLabel,
  accountBalanceState,
  activityTypeLabel,
} from "@/packages/pms/lib/cashiering-account-workspace";
import { getFinancialAccountWorkspace } from "@/packages/pms/lib/cashiering-account-workspace.functions";
import {
  closeFinancialAccount,
  type FinancialAccountRow,
} from "@/packages/pms/lib/cashiering-phases.functions";
import { cashieringTabSearch, type CashieringTabId } from "@/packages/pms/lib/cashiering-shell";
import { guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";
import { formatBalance } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import {
  DepositReceiptModal,
  TenderReceiptPrint,
  type TenderReceipt,
} from "@/packages/pms/components/cashiering/folio-dialogs";
import {
  AccountPaymentDialog,
  type AccountPaymentKind,
} from "@/packages/pms/components/cashiering/financial-account-payment-dialog";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";

type WorkspaceTab = AccountSectionId;

function profileStatusLabel(status: string | null): string {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  if (status === "pending") return "Pending";
  return status?.trim() || "—";
}

export function FinancialAccountWorkspacePage({
  membership,
  accountId,
  initialTab,
  initialAction,
  invoiceId,
  paymentId,
  modalTab,
  returnTo,
  returnToLabel,
}: {
  membership: RestaurantMembership;
  accountId: string;
  initialTab?: string | undefined;
  initialAction?: string | undefined;
  invoiceId?: string | undefined;
  paymentId?: string | undefined;
  modalTab?: string | undefined;
  returnTo?: string | undefined;
  returnToLabel?: string | undefined;
}) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const { dateTime, date } = useRestaurantTime();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkspaceTab>(() => {
    if (invoiceId) return "invoices";
    if (paymentId || initialAction === "allocate") return "payments";
    if (isAccountSection(initialTab)) return initialTab;
    return "overview";
  });
  const [invoicesMounted, setInvoicesMounted] = useState(() => initialTab === "invoices" || Boolean(invoiceId));
  const [chargeFolioId, setChargeFolioId] = useState<string | null>(null);
  const [chargeFolioLabel, setChargeFolioLabel] = useState<string | null>(null);
  const [compose, setCompose] = useState<"payment" | "writeoff" | null>(null);
  const clearCompose = useCallback(() => setCompose(null), []);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentKind, setPaymentKind] = useState<AccountPaymentKind>("payment");
  const [viewReceipt, setViewReceipt] = useState<TenderReceipt | null>(null);
  const [printReceipt, setPrintReceipt] = useState<TenderReceipt | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [toolbarSearch, setToolbarSearch] = useState<AccountToolbarSearch | null>(null);
  const [chrome, setChrome] = useState<FolioChromeSlots>({
    dates: null,
    search: null,
    filter: null,
    cta: null,
  });
  const setDatesSlot = useCallback((node: HTMLDivElement | null) => {
    setChrome((current) => (current.dates === node ? current : { ...current, dates: node }));
  }, []);
  const setFilterSlot = useCallback((node: HTMLDivElement | null) => {
    setChrome((current) => (current.filter === node ? current : { ...current, filter: node }));
  }, []);
  const setCtaSlot = useCallback((node: HTMLDivElement | null) => {
    setChrome((current) => (current.cta === node ? current : { ...current, cta: node }));
  }, []);
  const fetchWorkspace = useServerFn(getFinancialAccountWorkspace);
  const closeAccount = useServerFn(closeFinancialAccount);

  React.useEffect(() => {
    if (invoiceId) {
      setTab("invoices");
      setInvoicesMounted(true);
      return;
    }
    if (paymentId || initialAction === "allocate") {
      setTab("payments");
      return;
    }
    if (isAccountSection(initialTab)) {
      setTab(initialTab);
      if (initialTab === "invoices") setInvoicesMounted(true);
    }
  }, [initialTab, invoiceId, paymentId, initialAction]);

  React.useEffect(() => {
    if (initialAction === "payment") {
      setPaymentKind("payment");
      setPaymentDialogOpen(true);
    }
  }, [initialAction]);
  const workspaceQuery = useQuery({
    queryKey: ["financial-account-workspace", restaurantId, accountId],
    queryFn: () => fetchWorkspace({ data: { restaurantId, accountId } }),
  });
  const workspace = workspaceQuery.data;

  function openInvoices() {
    setInvoicesMounted(true);
    setTab("invoices");
  }

  function selectTab(next: WorkspaceTab) {
    if (next === "invoices") openInvoices();
    else setTab(next);
  }

  function openPayment(kind: AccountPaymentKind) {
    setPaymentKind(kind);
    setPaymentDialogOpen(true);
  }

  function goDesk(next: CashieringTabId) {
    void navigate({ to: "/restaurant/pms/cashiering", search: cashieringTabSearch(next) });
  }

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["financial-account-workspace", restaurantId, accountId],
    });
    void queryClient.invalidateQueries({ queryKey: ["financial-accounts", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-debit-board", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-debit-preview", restaurantId] });
    invalidateFrontOfficeOwnerReads(queryClient);
  }

  const closeMut = useMutation({
    mutationFn: () => closeAccount({ data: { restaurantId, accountId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Account closed at zero balance.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const accountRow: FinancialAccountRow | null = workspace
    ? {
        id: workspace.account.id,
        masterId: workspace.master.id,
        masterName: workspace.master.name,
        accountKind: workspace.account.accountKind,
        accountNumber: workspace.account.accountNumber,
        currency: workspace.account.currency,
        status: workspace.account.status,
        balance: workspace.account.balance,
        creditLimitAmount: workspace.master.creditLimitAmount,
        openedAt: workspace.account.openedAt,
        closedAt: workspace.account.closedAt,
      }
    : null;
  const kind = workspace?.account.accountKind;
  const isCompany = kind === "company";
  const isGroup = kind === "group";
  const profileType = isGroup ? "group" : "company";
  const kindLabel = isGroup ? "Group" : isCompany ? "Company" : (kind ?? "—");
  const balance = workspace?.account.balance ?? 0;
  const balanceState = accountBalanceState(balance);

  return (
    <CashieringChrome
      membership={membership}
      active="accounts"
      onNavigate={goDesk}
      onSearch={() => goDesk("folios")}
      onPostPayment={() => goDesk("folios")}
      returnTo={returnTo}
      returnToLabel={returnToLabel}
      bodyClassName="space-y-4 p-3 sm:p-4"
    >
      <FolioChromeProvider value={chrome}>
      <AccountToolbarSearchProvider publish={setToolbarSearch}>
      <div className="space-y-3" data-testid="financial-account-workspace">
        {workspaceQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading financial account…</p>
        ) : !workspace ? (
          <p className="text-sm text-muted-foreground">
            This financial account could not be loaded.
          </p>
        ) : (
          <>
            <nav
              className="flex items-center gap-1 text-xs text-muted-foreground print:hidden"
              aria-label="Breadcrumb"
            >
              <Link
                to="/restaurant/pms/cashiering"
                search={cashieringTabSearch("folios")}
                className="hover:text-foreground"
              >
                Cashiering
              </Link>
              <ChevronRight className="size-3" />
              <Link
                to="/restaurant/pms/cashiering"
                search={cashieringTabSearch("accounts")}
                className="hover:text-foreground"
              >
                Financial Accounts
              </Link>
              <ChevronRight className="size-3" />
              <span className="font-medium text-foreground">
                {workspace.master.name} · {workspace.account.accountNumber}
              </span>
            </nav>

            <section
              className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:hidden"
              aria-label="Account KPIs"
              data-testid="account-kpis"
            >
              <KpiTile
                icon={Wallet}
                label="Current balance"
                tone={
                  balanceState === "due"
                    ? "bg-red-50 text-red-700"
                    : balanceState === "credit"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-[#F7F4EE] text-[#5C5346]"
                }
                value={formatBalance(money, balance)}
                valueTestId="account-current-balance"
                hint={accountBalanceLabel(balance)}
                hintTestId="account-balance-state"
              />
              {isCompany && workspace.credit ? (
                <KpiTile
                  icon={Landmark}
                  label="Available credit"
                  tone="bg-blue-50 text-blue-700"
                  value={formatBalance(money, workspace.credit.available)}
                  hint={
                    workspace.credit.exceeded
                      ? "Credit limit exceeded"
                      : `${Math.round(workspace.credit.utilization * 100)}% of transfer credit limit used`
                  }
                  testId="available-credit"
                />
              ) : null}
              <KpiTile
                icon={FileText}
                label="Issued invoices"
                tone="bg-amber-50 text-amber-800"
                value={String(workspace.issuedInvoiceCount)}
                hint="Issued documents only"
                testId="issued-invoices"
              />
              <KpiTile
                icon={Receipt}
                label="Source folios"
                tone="bg-teal-50 text-teal-700"
                value={String(workspace.sourceFolioCount)}
                hint="Folios with transferred charges"
                testId="source-folios"
              />
            </section>

            {workspace.account.status === "closed" ? (
              <div
                className="rounded-lg border border-[#DDD4C5] bg-[#FAF8F4] px-3 py-2 text-xs text-[#7A7167] print:hidden"
                data-testid="account-closed-note"
              >
                <span className="font-semibold text-[#251605]">Account Closed.</span>{" "}
                <span>This account is closed. Documents and the profile remain available.</span>
              </div>
            ) : null}

            <section
              className="relative w-full min-w-0 rounded-lg border border-[#DDD4C5] bg-white px-2 py-1.5 shadow-sm print:hidden"
              data-testid="account-workspace-toolbar"
            >
              <div className="flex w-full min-w-0 items-center gap-1.5">
                <AccountSectionBurger active={tab} onSelect={selectTab} />
                <div ref={setDatesSlot} className="shrink-0 empty:hidden" />
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {toolbarSearch ? (
                    <CashieringToolbarSearch
                      value={toolbarSearch.value}
                      onChange={toolbarSearch.onChange}
                      placeholder={toolbarSearch.placeholder}
                      testId={toolbarSearch.testId}
                    />
                  ) : (
                    <AccountDetailsSearch
                      accountNumber={workspace.account.accountNumber}
                      name={workspace.master.name}
                      kindLabel={kindLabel}
                      isGroup={isGroup}
                      onOpen={() => setDetailsOpen(true)}
                    />
                  )}
                </div>
                <div className="relative z-10 flex shrink-0 items-center gap-1.5">
                  <div ref={setFilterSlot} className="shrink-0 empty:hidden" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-9 items-center justify-center rounded-md border border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]"
                        aria-label="Account details"
                        onClick={() => setDetailsOpen(true)}
                      >
                        <InfoIcon className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs leading-5">
                      {workspace.master.name} · {kindLabel} · {workspace.account.currency}. Open
                      account and billing details.
                    </TooltipContent>
                  </Tooltip>
                  <div ref={setCtaSlot} className="flex shrink-0 items-center gap-1.5 empty:hidden" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="h-9 bg-[#C89933] px-3 text-[#251605] hover:bg-[#B5882D]"
                        data-testid="folio-actions"
                      >
                        Actions <ChevronDown className="ml-1 size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {workspace.capabilities.showReceivePayment ? (
                        <ActionItem
                          icon={Landmark}
                          disabled={!workspace.capabilities.canReceivePayment}
                          onSelect={() => openPayment("payment")}
                        >
                          Receive Payment
                          {workspace.capabilities.canReceivePayment ? null : (
                            <span className="ml-auto text-[11px] text-muted-foreground">Account closed</span>
                          )}
                        </ActionItem>
                      ) : null}
                      {workspace.capabilities.showReceiveDeposit ? (
                        <ActionItem
                          icon={Wallet}
                          disabled={!workspace.capabilities.canReceiveDeposit}
                          onSelect={() => openPayment("deposit")}
                        >
                          Receive Deposit
                          {workspace.capabilities.canReceiveDeposit ? null : (
                            <span className="ml-auto text-[11px] text-muted-foreground">Account closed</span>
                          )}
                        </ActionItem>
                      ) : null}
                      {workspace.capabilities.canCreateInvoice ? (
                        <ActionItem icon={FileText} onSelect={openInvoices}>
                          Create Invoice
                        </ActionItem>
                      ) : null}
                      <ActionItem icon={Receipt} onSelect={() => setTab("charges")}>
                        View Source Charges
                      </ActionItem>
                      {workspace.capabilities.canWriteOff ? (
                        <ActionItem
                          icon={Undo2}
                          onSelect={() => {
                            setCompose("writeoff");
                            setTab("payments");
                          }}
                        >
                          Write Off Balance
                        </ActionItem>
                      ) : null}
                      {workspace.capabilities.canViewProfile ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link
                              to="/restaurant/pms/guests/$guestId"
                              params={{ guestId: workspace.master.id }}
                              search={{
                                ...guestProfileSearch({ type: profileType, nav: "overview" }),
                                returnTo: `/restaurant/pms/cashiering/accounts/${accountId}`,
                              }}
                              data-testid="view-profile"
                            >
                              <ExternalLink className="size-4 text-muted-foreground" />
                              {isGroup ? "View group profile" : "View company profile"}
                            </Link>
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {workspace.capabilities.showClose ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={closeMut.isPending || !workspace.capabilities.canClose}
                            title={
                              workspace.capabilities.canClose
                                ? undefined
                                : "Account balance must be zero before closing."
                            }
                            data-testid="close-account"
                            onSelect={() => closeMut.mutate()}
                          >
                            <Lock className="size-4 text-muted-foreground" />
                            Close Account
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </section>

            <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
              <SheetContent
                side="right"
                className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl [&>button]:text-[#F6EFE4] [&>button]:hover:text-white"
                data-testid="account-details-drawer"
              >
                <SheetHeader className="shrink-0 space-y-1 border-b border-[#3A2A16] bg-[#1A1208] px-5 py-4 pr-12 text-left">
                  <SheetTitle className="flex items-center gap-2 font-display text-base font-semibold text-[#F6EFE4]">
                    {isGroup ? <UsersRound className="size-4" /> : <Building2 className="size-4" />}
                    {workspace.master.name}
                  </SheetTitle>
                  <SheetDescription className="text-[#CDBCA6]">
                    <span data-testid="account-kind-badge">{kindLabel}</span> · Financial account{" "}
                    <span data-testid="account-number">{workspace.account.accountNumber}</span>
                    {workspace.master.code ? ` · Profile code ${workspace.master.code}` : ""} ·{" "}
                    {workspace.account.currency}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        workspace.account.status === "open"
                          ? "border-[#A3E0C1] bg-[#E7F6EE] text-[#146C43]"
                          : "border-[#E0D7CA] bg-[#F5F2EC] text-[#7A7167]",
                      )}
                      data-testid="account-status"
                    >
                      Account: {workspace.account.status === "open" ? "Open" : "Closed"}
                    </span>
                    <span
                      className="rounded-full border border-[#E8E1D7] bg-[#FAF8F4] px-2.5 py-0.5 text-[11px] font-medium text-[#5F554B]"
                      data-testid="profile-status"
                    >
                      Profile: {profileStatusLabel(workspace.master.accountStatus)}
                    </span>
                    {isCompany && workspace.master.taxId ? (
                      <span
                        className="rounded-full border border-[#E8E1D7] bg-[#FAF8F4] px-2.5 py-0.5 text-[11px] font-medium text-[#5F554B]"
                        data-testid="company-tin"
                      >
                        TIN {workspace.master.taxId}
                      </span>
                    ) : null}
                    {isCompany && workspace.credit ? (
                      <span
                        className="rounded-full border border-[#E8E1D7] bg-[#FAF8F4] px-2.5 py-0.5 text-[11px] font-medium text-[#5F554B]"
                        data-testid="company-credit-limit"
                      >
                        Credit limit {money(workspace.credit.limit)} · Available{" "}
                        {money(workspace.credit.available)}
                        {workspace.credit.exceeded ? " · Credit limit exceeded" : ""}
                      </span>
                    ) : null}
                  </div>

                  <section className={cn(CARD, "space-y-2.5 p-4")}>
                    <h2 className="border-b border-[#E8E1D7] pb-2 text-xs font-bold uppercase tracking-wider text-[#8A6A24]">
                      {isGroup ? "Group Information" : "Company Information"}
                    </h2>
                    <InfoRow label="Financial account" value={workspace.account.accountNumber} />
                    <InfoRow label="Account type" value={kindLabel} />
                    <InfoRow label="Currency" value={workspace.account.currency} />
                    <InfoRow
                      label="Account status"
                      value={workspace.account.status === "open" ? "Open" : "Closed"}
                    />
                    <InfoRow label="Opened" value={dateTime(workspace.account.openedAt)} />
                    <InfoRow
                      label={isGroup ? "Group name" : "Company name"}
                      value={workspace.master.name}
                    />
                    <InfoRow label="Profile code" value={workspace.master.code ?? "—"} />
                    {isCompany ? (
                      <InfoRow label="TIN" value={workspace.master.taxId ?? "—"} />
                    ) : null}
                  </section>

                  <section className={cn(CARD, "space-y-2.5 p-4")}>
                    <h2 className="border-b border-[#E8E1D7] pb-2 text-xs font-bold uppercase tracking-wider text-[#8A6A24]">
                      {isCompany ? "Billing Summary" : "Profile Summary"}
                    </h2>
                    <InfoRow
                      label="Primary contact"
                      value={workspace.master.primaryContactName ?? "—"}
                    />
                    <InfoRow label="Phone" value={workspace.master.phone ?? "—"} />
                    <InfoRow label="Email" value={workspace.master.email ?? "—"} />
                    {isCompany ? (
                      <>
                        <InfoRow
                          label="Credit limit"
                          value={
                            workspace.master.creditLimitAmount == null
                              ? "Not set"
                              : money(workspace.master.creditLimitAmount)
                          }
                        />
                        <InfoRow
                          label="Payment terms"
                          value={workspace.master.paymentTerms ?? "—"}
                        />
                        <InfoRow
                          label="Credit days"
                          value={
                            workspace.master.creditDays == null
                              ? "—"
                              : String(workspace.master.creditDays)
                          }
                        />
                      </>
                    ) : null}
                    <p className="pt-1 text-[11px] text-[#A89F91]">
                      Billing fields are read from the profile. Cashiering does not edit them.
                    </p>
                    {workspace.capabilities.canViewProfile ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 h-8 w-full gap-1.5 border-[#E8E1D7] text-xs"
                        asChild
                      >
                        <Link
                          to="/restaurant/pms/guests/$guestId"
                          params={{ guestId: workspace.master.id }}
                          search={{
                            ...guestProfileSearch({ type: profileType, nav: "overview" }),
                            returnTo: `/restaurant/pms/cashiering/accounts/${accountId}`,
                          }}
                        >
                          {isGroup ? (
                            <UsersRound className="size-3.5" />
                          ) : (
                            <Building2 className="size-3.5" />
                          )}
                          {isGroup ? "View group profile" : "View company profile"}
                        </Link>
                      </Button>
                    ) : null}
                  </section>

                  {workspace.capabilities.showClose && !workspace.capabilities.canClose ? (
                    <p
                      className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] p-3 text-[11px] text-[#A89F91]"
                      data-testid="close-account-reason"
                    >
                      Account balance must be zero before closing.
                    </p>
                  ) : null}
                </div>
              </SheetContent>
            </Sheet>

            {tab === "overview" ? (
              <div className="space-y-4">
                {isCompany && workspace.credit ? (
                  <section
                    className="rounded-lg border border-[#E8E1D7] bg-[#FAF8F4] px-3 py-2 text-xs"
                    data-testid="transfer-credit-limit"
                  >
                    <span className="font-semibold text-[#251605]">Transfer credit limit.</span>{" "}
                    <span className="text-[#7A7167]">
                      Limit {money(workspace.credit.limit)} · used {money(workspace.credit.used)} ·
                      available {money(workspace.credit.available)}. This limit is enforced when
                      charges transfer onto this company account. It does not block payments or
                      invoice issue.
                    </span>
                  </section>
                ) : null}

                <section className={cn(CARD, "overflow-hidden")}>
                  <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
                    <h2 className="text-sm font-semibold text-[#251605]">
                      Recent financial activity
                    </h2>
                    <button
                      type="button"
                      onClick={() => setTab("history")}
                      className="text-xs font-semibold text-[#8A6A24] hover:underline"
                    >
                      View Full History
                    </button>
                  </div>
                  {workspace.recentActivity.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs italic text-[#7A7167]">
                      No financial activity yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead className={TABLE_HEAD}>
                          <tr>
                            <th className="px-3 py-2.5">When</th>
                            <th className="px-3 py-2.5">Type</th>
                            <th className="px-3 py-2.5">Description</th>
                            <th className="px-3 py-2.5 text-right">Amount</th>
                            <th className="px-3 py-2.5">Actor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E1D7]">
                          {workspace.recentActivity.map((line) => (
                            <tr key={line.id} className="hover:bg-[#FAF8F4]/70">
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                                {dateTime(line.postedAt)}
                              </td>
                              <td className="px-3 py-2 text-xs font-medium">
                                {activityTypeLabel(line)}
                              </td>
                              <td className="px-3 py-2 text-xs text-[#251605]">
                                <p className="font-medium">{line.description}</p>
                                {line.sourceFolioId && line.sourceFolioNumber ? (
                                  <Link
                                    to="/restaurant/pms/cashiering/folios/$folioId"
                                    params={{ folioId: line.sourceFolioId }}
                                    className="mt-0.5 block text-[11px] font-semibold text-[#8A6A2F] hover:underline"
                                  >
                                    Folio #{line.sourceFolioNumber}
                                  </Link>
                                ) : null}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                                {formatBalance(money, line.amount)}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {line.actorName ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className={cn(CARD, "overflow-hidden")}>
                  <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
                    <h2 className="text-sm font-semibold text-[#251605]">Recent documents</h2>
                    <button
                      type="button"
                      onClick={openInvoices}
                      className="text-xs font-semibold text-[#8A6A24] hover:underline"
                    >
                      View Invoices & Notes
                    </button>
                  </div>
                  {workspace.recentDocuments.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs italic text-[#7A7167]">
                      No invoices or account documents have been issued.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead className={TABLE_HEAD}>
                          <tr>
                            <th className="px-3 py-2.5">Document</th>
                            <th className="px-3 py-2.5">Type</th>
                            <th className="px-3 py-2.5">Issued</th>
                            <th className="px-3 py-2.5 text-right">Amount</th>
                            <th className="px-3 py-2.5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E1D7]">
                          {workspace.recentDocuments.map((doc) => (
                            <tr key={`${doc.documentType}-${doc.id}`} className="hover:bg-[#FAF8F4]/70">
                              <td className="px-3 py-2 text-xs font-semibold text-[#8A6A24]">
                                {doc.number}
                              </td>
                              <td className="px-3 py-2 text-xs capitalize">
                                {doc.documentType.replace("_", " ")}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                                {dateTime(doc.issuedAt)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                                {formatBalance(money, doc.amount)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-[#DDD4C5] px-2.5 text-xs"
                                  onClick={openInvoices}
                                >
                                  View
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            ) : null}

            {invoicesMounted ? (
              <div className={tab === "invoices" ? undefined : "hidden"}>
                <AccountInvoiceWorkspace
                  restaurantId={restaurantId}
                  accountId={accountId}
                  money={money}
                  dateTime={dateTime}
                  initialInvoiceId={invoiceId}
                  initialModalTab={modalTab}
                  toolbarActive={tab === "invoices"}
                />
              </div>
            ) : null}

            {tab === "folios" ? (
              <FinancialAccountSourceFolios
                restaurantId={restaurantId}
                accountId={accountId}
                money={money}
                date={date}
                onViewCharges={(folioId, folioNumber) => {
                  setChargeFolioId(folioId);
                  setChargeFolioLabel(folioNumber);
                  setTab("charges");
                }}
              />
            ) : null}

            {tab === "charges" ? (
              <FinancialAccountCharges
                restaurantId={restaurantId}
                accountId={accountId}
                account={accountRow}
                money={money}
                dateTime={dateTime}
                sourceFolioId={chargeFolioId}
                sourceFolioLabel={chargeFolioLabel}
                onClearSourceFolio={() => {
                  setChargeFolioId(null);
                  setChargeFolioLabel(null);
                }}
                onViewInvoices={openInvoices}
              />
            ) : null}

            {tab === "payments" ? (
              <FinancialAccountPayments
                restaurantId={restaurantId}
                accountId={accountId}
                accountName={workspace.master.name}
                accountNumber={workspace.account.accountNumber}
                accountKind={workspace.account.accountKind}
                currency={workspace.account.currency}
                status={workspace.account.status}
                balance={balance}
                role={membership.role}
                money={money}
                dateTime={dateTime}
                compose={compose}
                onComposeHandled={clearCompose}
                onPosted={refresh}
                initialPaymentId={paymentId}
              />
            ) : null}

            {tab === "statement" ? (
              <FinancialAccountStatement
                restaurantId={restaurantId}
                accountId={accountId}
                openedAt={workspace.account.openedAt}
                timezone={membership.restaurant.timezone}
                propertyName={membership.restaurant.name}
                propertyAddress={
                  [
                    membership.restaurant.address,
                    membership.restaurant.city,
                    membership.restaurant.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || null
                }
                money={money}
                dateTime={dateTime}
                onViewDocuments={openInvoices}
                onViewPayments={() => setTab("payments")}
              />
            ) : null}

            {tab === "history" ? (
              <FinancialAccountHistory
                restaurantId={restaurantId}
                accountId={accountId}
                money={money}
                dateTime={dateTime}
                onViewDocuments={openInvoices}
                onViewPayments={() => setTab("payments")}
              />
            ) : null}
          </>
        )}
      </div>
      </AccountToolbarSearchProvider>
      </FolioChromeProvider>

      {workspace ? (
        <AccountPaymentDialog
          open={paymentDialogOpen}
          initialKind={paymentKind}
          restaurantId={restaurantId}
          accountId={accountId}
          accountName={workspace.master.name}
          accountNumber={workspace.account.accountNumber}
          contactPhone={workspace.master.phone}
          contactEmail={workspace.master.email}
          currency={workspace.account.currency}
          balance={workspace.account.balance}
          money={money}
          dateTime={dateTime}
          onOpenChange={setPaymentDialogOpen}
          onPosted={refresh}
          onReceipt={(r) => setViewReceipt(r)}
        />
      ) : null}

      <DepositReceiptModal
        receipt={viewReceipt}
        open={viewReceipt !== null}
        money={money}
        dateTime={dateTime}
        onClose={() => setViewReceipt(null)}
        onPrint={
          viewReceipt
            ? () => {
                setPrintReceipt(viewReceipt);
                setViewReceipt(null);
                window.setTimeout(() => window.print(), 80);
              }
            : undefined
        }
      />
      {printReceipt ? (
        <TenderReceiptPrint receipt={printReceipt} money={money} dateTime={dateTime} />
      ) : null}
    </CashieringChrome>
  );
}

const TABLE_HEAD =
  "border-b border-[#E8E1D7] bg-[#FAF8F4] text-left text-[11px] font-semibold uppercase tracking-wider text-[#736B5E]";

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  testId,
  valueTestId,
  hintTestId,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone: string;
  testId?: string;
  valueTestId?: string;
  hintTestId?: string;
}) {
  return (
    <div
      className="flex h-[4.25rem] min-w-0 items-center gap-2.5 rounded-lg border border-[#DDD4C5] bg-white px-2.5 py-2 shadow-sm"
      data-testid={testId}
      title={hint}
    >
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", tone)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-medium text-[#756A5B]">{label}</p>
        <p
          className="truncate font-display text-lg font-semibold leading-tight tracking-tight text-[#251605]"
          data-testid={valueTestId}
        >
          {value}
        </p>
        <p className="truncate text-[10px] text-[#756A5B]" data-testid={hintTestId}>
          {hint}
        </p>
      </div>
    </div>
  );
}

function ActionItem({
  icon: Icon,
  children,
  onSelect,
  disabled = false,
}: {
  icon: LucideIcon;
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} disabled={disabled}>
      <Icon className="size-4 text-muted-foreground" />
      {children}
    </DropdownMenuItem>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
