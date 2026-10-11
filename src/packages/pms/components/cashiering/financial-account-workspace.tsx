import { useCallback, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, FileText, Landmark, Receipt, Scale, UsersRound, Wallet } from "lucide-react";
import { toast } from "sonner";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { AccountInvoiceWorkspace } from "@/packages/pms/components/cashiering/account-invoice-builder";
import { FinancialAccountPayments } from "@/packages/pms/components/cashiering/financial-account-payments-panel";
import {
  FinancialAccountCharges,
  FinancialAccountSourceFolios,
} from "@/packages/pms/components/cashiering/financial-account-ownership-panels";
import { CashieringChrome } from "@/packages/pms/components/cashiering/cashiering-chrome";
import {
  accountBalanceLabel,
  accountBalanceState,
  activityTypeLabel,
} from "@/packages/pms/lib/cashiering-account-workspace";
import { getFinancialAccountWorkspace } from "@/packages/pms/lib/cashiering-account-workspace.functions";
import { closeFinancialAccount } from "@/packages/pms/lib/cashiering-phases.functions";
import { cashieringTabSearch, type CashieringTabId } from "@/packages/pms/lib/cashiering-shell";
import type { FinancialAccountRow } from "@/packages/pms/lib/cashiering-phases.functions";
import { guestProfileSearch } from "@/packages/pms/lib/guest-profile-wave1";
import { formatBalance } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "folios", label: "Source Folios" },
  { id: "charges", label: "Charges" },
  { id: "payments", label: "Payments" },
  { id: "invoices", label: "Invoices & Documents" },
  { id: "history", label: "History" },
] as const;

type WorkspaceTab = (typeof TABS)[number]["id"];

function profileStatusLabel(status: string | null): string {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  if (status === "pending") return "Pending";
  return status?.trim() || "—";
}

export function FinancialAccountWorkspacePage({
  membership,
  accountId,
}: {
  membership: RestaurantMembership;
  accountId: string;
}) {
  const restaurantId = membership.restaurant.id;
  const money = useMoney();
  const { dateTime, date } = useRestaurantTime();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [invoicesMounted, setInvoicesMounted] = useState(false);
  const [chargeFolioId, setChargeFolioId] = useState<string | null>(null);
  const [chargeFolioLabel, setChargeFolioLabel] = useState<string | null>(null);
  const [compose, setCompose] = useState<"payment" | "writeoff" | null>(null);
  const clearCompose = useCallback(() => setCompose(null), []);
  const fetchWorkspace = useServerFn(getFinancialAccountWorkspace);
  const closeAccount = useServerFn(closeFinancialAccount);
  const workspaceQuery = useQuery({
    queryKey: ["financial-account-workspace", restaurantId, accountId],
    queryFn: () => fetchWorkspace({ data: { restaurantId, accountId } }),
  });
  const workspace = workspaceQuery.data;

  function openInvoices() {
    setInvoicesMounted(true);
    setTab("invoices");
  }

  function goDesk(next: CashieringTabId) {
    void navigate({ to: "/restaurant/pms/cashiering", search: cashieringTabSearch(next) });
  }

  function refresh() {
    void queryClient.invalidateQueries({
      queryKey: ["financial-account-workspace", restaurantId, accountId],
    });
    void queryClient.invalidateQueries({ queryKey: ["financial-accounts", restaurantId] });
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
  const balance = workspace?.account.balance ?? 0;
  const balanceState = accountBalanceState(balance);

  return (
    <CashieringChrome
      membership={membership}
      active="accounts"
      onNavigate={goDesk}
      onSearch={() => goDesk("folios")}
      onPostPayment={() => goDesk("payments")}
    >
      <div className="space-y-4" data-testid="financial-account-workspace">
        {workspaceQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading financial account…</p>
        ) : !workspace ? (
          <p className="text-sm text-muted-foreground">
            This financial account could not be loaded.
          </p>
        ) : (
          <>
            <header className={cn(CARD, "px-4 py-4 sm:px-5")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-2xl text-[#251605]">
                      {workspace.master.name}
                    </h1>
                    <span
                      className="rounded-full bg-[#F7F4EE] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8A6A2F]"
                      data-testid="account-kind-badge"
                    >
                      {isGroup ? "Group" : isCompany ? "Company" : workspace.account.accountKind}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Financial account{" "}
                    <span className="font-medium text-foreground" data-testid="account-number">
                      {workspace.account.accountNumber}
                    </span>
                    {workspace.master.code ? (
                      <>
                        {" "}
                        · Profile code{" "}
                        <span className="font-medium text-foreground">{workspace.master.code}</span>
                      </>
                    ) : null}{" "}
                    · {workspace.account.currency}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <span
                      className="rounded-full border border-[#E8E1D7] px-2 py-0.5"
                      data-testid="account-status"
                    >
                      Account: {workspace.account.status === "open" ? "Open" : "Closed"}
                    </span>
                    <span
                      className="rounded-full border border-[#E8E1D7] px-2 py-0.5"
                      data-testid="profile-status"
                    >
                      Profile: {profileStatusLabel(workspace.master.accountStatus)}
                    </span>
                    {isCompany && workspace.master.taxId ? (
                      <span
                        className="rounded-full border border-[#E8E1D7] px-2 py-0.5"
                        data-testid="company-tin"
                      >
                        TIN {workspace.master.taxId}
                      </span>
                    ) : null}
                    {isCompany && workspace.credit ? (
                      <span
                        className="rounded-full border border-[#E8E1D7] px-2 py-0.5"
                        data-testid="company-credit-limit"
                      >
                        Credit limit {money(workspace.credit.limit)} · Available{" "}
                        {money(workspace.credit.available)}
                        {workspace.credit.exceeded ? " · Credit limit exceeded" : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  {workspace.capabilities.canViewProfile ? (
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        to="/restaurant/pms/guests/$guestId"
                        params={{ guestId: workspace.master.id }}
                        search={guestProfileSearch({ type: profileType, nav: "overview" })}
                        data-testid="view-profile"
                      >
                        {isGroup ? "View group profile" : "View company profile"}
                      </Link>
                    </Button>
                  ) : null}
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Current balance
                  </p>
                  <p
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      balanceState === "due" && "text-amber-800",
                      balanceState === "credit" && "text-emerald-800",
                      balanceState === "settled" && "text-[#251605]",
                    )}
                    data-testid="account-current-balance"
                  >
                    {formatBalance(money, balance)}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="account-balance-state">
                    {accountBalanceLabel(balance)}
                  </p>
                </div>
              </div>
            </header>

            <nav className="flex gap-1 overflow-x-auto" aria-label="Account workspace">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-sm",
                    tab === item.id
                      ? "bg-[#C89933] font-medium text-[#251605]"
                      : "text-muted-foreground hover:bg-[#F7F4EE]",
                  )}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {tab === "overview" ? (
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="space-y-4 lg:col-span-8">
                  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Kpi
                      icon={Scale}
                      label="Current balance"
                      value={formatBalance(money, balance)}
                      hint={accountBalanceLabel(balance)}
                    />
                    {isCompany && workspace.credit ? (
                      <div data-testid="available-credit">
                        <Kpi
                          icon={Wallet}
                          label="Available credit"
                          value={formatBalance(money, workspace.credit.available)}
                          hint={
                            workspace.credit.exceeded
                              ? "Credit limit exceeded"
                              : `${Math.round(workspace.credit.utilization * 100)}% of transfer credit limit used`
                          }
                        />
                      </div>
                    ) : null}
                    <div data-testid="issued-invoices">
                      <Kpi
                        icon={FileText}
                        label="Issued invoices"
                        value={String(workspace.issuedInvoiceCount)}
                        hint="Issued documents only"
                      />
                    </div>
                    <div data-testid="source-folios">
                      <Kpi
                        icon={Receipt}
                        label="Source folios"
                        value={String(workspace.sourceFolioCount)}
                        hint="Folios with transferred charges"
                      />
                    </div>
                  </section>

                  {isCompany && workspace.credit ? (
                    <section
                      className={cn(CARD, "px-4 py-3 text-sm")}
                      data-testid="transfer-credit-limit"
                    >
                      <p className="font-medium">Transfer credit limit</p>
                      <p className="mt-1 text-muted-foreground">
                        Limit {money(workspace.credit.limit)} · used {money(workspace.credit.used)}{" "}
                        · available {money(workspace.credit.available)}. This limit is enforced when
                        charges transfer onto this company account. It does not block payments or
                        invoice issue.
                      </p>
                    </section>
                  ) : null}

                  <section className={cn(CARD, "overflow-hidden")}>
                    <div className="border-b border-[#E8E1D7] px-4 py-3">
                      <h2 className="text-sm font-semibold">Recent financial activity</h2>
                    </div>
                    {workspace.recentActivity.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-muted-foreground">
                        No financial activity yet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                          <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2">When</th>
                              <th className="px-3 py-2">Type</th>
                              <th className="px-3 py-2">Description</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                              <th className="px-3 py-2">Actor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workspace.recentActivity.map((line) => (
                              <tr key={line.id} className="border-t border-[#E8E1D7]">
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {dateTime(line.postedAt)}
                                </td>
                                <td className="px-3 py-2">{activityTypeLabel(line)}</td>
                                <td className="px-3 py-2">
                                  <p>{line.description}</p>
                                  {line.sourceFolioId && line.sourceFolioNumber ? (
                                    <Link
                                      to="/restaurant/pms/cashiering/folios/$folioId"
                                      params={{ folioId: line.sourceFolioId }}
                                      className="text-xs text-[#8A6A2F] hover:underline"
                                    >
                                      {line.sourceFolioNumber}
                                    </Link>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
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
                    <div className="border-b border-[#E8E1D7] px-4 py-3">
                      <h2 className="text-sm font-semibold">Recent documents</h2>
                    </div>
                    {workspace.recentDocuments.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-muted-foreground">
                        No invoices or account documents have been issued.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead className="bg-[#F7F4EE] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2">Document</th>
                              <th className="px-3 py-2">Type</th>
                              <th className="px-3 py-2">Issued</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                              <th className="px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {workspace.recentDocuments.map((doc) => (
                              <tr
                                key={`${doc.documentType}-${doc.id}`}
                                className="border-t border-[#E8E1D7]"
                              >
                                <td className="px-3 py-2 font-medium">{doc.number}</td>
                                <td className="px-3 py-2 capitalize">
                                  {doc.documentType.replace("_", " ")}
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {dateTime(doc.issuedAt)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {formatBalance(money, doc.amount)}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <Button size="sm" variant="outline" onClick={openInvoices}>
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

                <aside className="space-y-4 lg:col-span-4">
                  <section className={cn(CARD, "space-y-2 px-4 py-3 text-sm")}>
                    <h2 className="text-sm font-semibold">
                      {isGroup ? "Group information" : "Company information"}
                    </h2>
                    <Info label="Financial account" value={workspace.account.accountNumber} />
                    <Info
                      label="Account type"
                      value={isGroup ? "Group" : isCompany ? "Company" : (kind ?? "—")}
                    />
                    <Info label="Currency" value={workspace.account.currency} />
                    <Info
                      label="Account status"
                      value={workspace.account.status === "open" ? "Open" : "Closed"}
                    />
                    <Info label="Opened" value={dateTime(workspace.account.openedAt)} />
                    <Info
                      label={isGroup ? "Group name" : "Company name"}
                      value={workspace.master.name}
                    />
                    <Info label="Profile code" value={workspace.master.code ?? "—"} />
                    {isCompany ? <Info label="TIN" value={workspace.master.taxId ?? "—"} /> : null}
                  </section>

                  <section className={cn(CARD, "space-y-2 px-4 py-3 text-sm")}>
                    <h2 className="text-sm font-semibold">
                      {isCompany ? "Billing summary" : "Profile summary"}
                    </h2>
                    <Info
                      label="Primary contact"
                      value={workspace.master.primaryContactName ?? "—"}
                    />
                    <Info label="Phone" value={workspace.master.phone ?? "—"} />
                    <Info label="Email" value={workspace.master.email ?? "—"} />
                    {isCompany ? (
                      <>
                        <Info
                          label="Credit limit"
                          value={
                            workspace.master.creditLimitAmount == null
                              ? "Not set"
                              : money(workspace.master.creditLimitAmount)
                          }
                        />
                        <Info label="Payment terms" value={workspace.master.paymentTerms ?? "—"} />
                        <Info
                          label="Credit days"
                          value={
                            workspace.master.creditDays == null
                              ? "—"
                              : String(workspace.master.creditDays)
                          }
                        />
                      </>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Billing fields are read from the profile. Cashiering does not edit them.
                    </p>
                    {workspace.capabilities.canViewProfile ? (
                      <Button variant="outline" className="w-full" asChild>
                        <Link
                          to="/restaurant/pms/guests/$guestId"
                          params={{ guestId: workspace.master.id }}
                          search={guestProfileSearch({ type: profileType, nav: "overview" })}
                        >
                          {isGroup ? (
                            <UsersRound className="size-4" />
                          ) : (
                            <Building2 className="size-4" />
                          )}
                          {isGroup ? "View group profile" : "View company profile"}
                        </Link>
                      </Button>
                    ) : null}
                  </section>

                  <section className={cn(CARD, "space-y-2 px-4 py-3")}>
                    <h2 className="text-sm font-semibold">Quick actions</h2>
                    {workspace.account.status === "closed" ? (
                      <p
                        className="text-sm text-muted-foreground"
                        data-testid="account-closed-note"
                      >
                        This account is closed. Documents and the profile remain available.
                      </p>
                    ) : null}
                    {workspace.capabilities.canReceivePayment ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setCompose("payment");
                          setTab("payments");
                        }}
                      >
                        <Landmark className="size-4" /> Receive payment
                      </Button>
                    ) : null}
                    {workspace.capabilities.canCreateInvoice ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={openInvoices}
                      >
                        <FileText className="size-4" /> Create invoice
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setTab("charges")}
                    >
                      <Receipt className="size-4" /> View source charges
                    </Button>
                    {workspace.capabilities.canWriteOff ? (
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setCompose("writeoff");
                          setTab("payments");
                        }}
                      >
                        Write off
                      </Button>
                    ) : null}
                    {workspace.account.status === "open" &&
                    (membership.role === "owner" || membership.role === "manager") ? (
                      <div className="space-y-1">
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          disabled={!workspace.capabilities.canClose || closeMut.isPending}
                          data-testid="close-account"
                          onClick={() => closeMut.mutate()}
                        >
                          Close account
                        </Button>
                        {!workspace.capabilities.canClose ? (
                          <p
                            className="text-xs text-muted-foreground"
                            data-testid="close-account-reason"
                          >
                            Account balance must be zero before closing.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                </aside>
              </div>
            ) : null}

            {invoicesMounted ? (
              <div className={tab === "invoices" ? undefined : "hidden"}>
                <AccountInvoiceWorkspace
                  restaurantId={restaurantId}
                  accountId={accountId}
                  money={money}
                  dateTime={dateTime}
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
              />
            ) : null}

            {tab === "history" ? (
              <section
                className={cn(CARD, "px-4 py-8 text-sm text-muted-foreground")}
                data-testid="account-tab-history"
              >
                Coming in the next Cashiering implementation phase.
              </section>
            ) : null}
          </>
        )}
      </div>
    </CashieringChrome>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Scale;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className={cn(CARD, "px-3 py-3")}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
