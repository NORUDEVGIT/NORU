import { useCallback, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Building2, FileText, Landmark, Receipt, Scale, UsersRound, Wallet } from "lucide-react";
import { toast } from "sonner";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useMoney, useRestaurantTime } from "@/core/state/property-format";
import { AccountInvoiceWorkspace } from "@/packages/pms/components/cashiering/account-invoice-builder";
import { FinancialAccountHistory } from "@/packages/pms/components/cashiering/financial-account-history-panel";
import { FinancialAccountPayments } from "@/packages/pms/components/cashiering/financial-account-payments-panel";
import { FinancialAccountStatement } from "@/packages/pms/components/cashiering/financial-account-statement-panel";
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
  { id: "statement", label: "Statement" },
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
            {/* Back Button */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goDesk("accounts")}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8A6A24] hover:text-[#6D531C] transition-colors"
              >
                <ArrowLeft className="size-3.5" />
                Back to Accounts
              </button>
            </div>

            {/* Workspace Header Card */}
            <header className={cn(CARD, "p-5")}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                {/* Left: Entity Identification & Badges */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#FAF5EB] text-[#8A6A2F] border border-[#EADFCB] shadow-2xs">
                    {isGroup ? <UsersRound className="size-6" /> : <Building2 className="size-6" />}
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="font-display text-2xl font-bold text-[#251605] tracking-tight">
                        {workspace.master.name}
                      </h1>
                      <span
                        className="rounded-full bg-[#FAF5EB] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#8A6A2F] border border-[#EADFCB]"
                        data-testid="account-kind-badge"
                      >
                        {isGroup ? "Group" : isCompany ? "Company" : workspace.account.accountKind}
                      </span>
                    </div>

                    <p className="text-xs text-[#7A7167]">
                      Financial account{" "}
                      <span className="font-semibold text-[#251605]" data-testid="account-number">
                        {workspace.account.accountNumber}
                      </span>
                      {workspace.master.code ? (
                        <>
                          {" "}
                          · Profile code{" "}
                          <span className="font-semibold text-[#251605]">{workspace.master.code}</span>
                        </>
                      ) : null}{" "}
                      · <span className="font-medium text-[#251605]">{workspace.account.currency}</span>
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-0.5 text-xs">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-semibold border",
                          workspace.account.status === "open"
                            ? "bg-[#E7F6EE] text-[#146C43] border-[#A3E0C1]"
                            : "bg-[#F5F2EC] text-[#7A7167] border-[#E0D7CA]",
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
                  </div>
                </div>

                {/* Right: Balance Card & Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center lg:items-end gap-3 shrink-0">
                  <div className="rounded-xl border border-[#E8E1D7] bg-[#FAF8F4] p-3 text-right shadow-2xs min-w-[160px]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#7A7167]">
                      Current balance
                    </p>
                    <p
                      className={cn(
                        "text-2xl font-bold tabular-nums block mt-0.5",
                        balanceState === "due" && "text-[#B91C1C]",
                        balanceState === "credit" && "text-[#146C43]",
                        balanceState === "settled" && "text-[#251605]",
                      )}
                      data-testid="account-current-balance"
                    >
                      {formatBalance(money, balance)}
                    </p>
                    <p className="text-[11px] font-medium text-[#7A7167]" data-testid="account-balance-state">
                      {accountBalanceLabel(balance)}
                    </p>
                  </div>

                  <div className="flex flex-wrap sm:flex-col gap-2">
                    {workspace.capabilities.canReceivePayment ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setCompose("payment");
                          setTab("payments");
                        }}
                        className="h-9 gap-1.5 bg-[#C89933] text-[#251605] hover:bg-[#B5882D] text-xs font-semibold px-3 shadow-2xs"
                      >
                        <Landmark className="size-3.5" /> Receive Payment
                      </Button>
                    ) : null}
                    {workspace.capabilities.canCreateInvoice ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={openInvoices}
                        className="h-9 gap-1.5 border-[#E8E1D7] text-xs font-semibold text-[#251605] hover:bg-[#FAF8F4]"
                      >
                        <FileText className="size-3.5" /> Create Invoice
                      </Button>
                    ) : null}
                    {workspace.capabilities.canViewProfile ? (
                      <Button variant="outline" size="sm" asChild className="h-9 gap-1.5 border-[#E8E1D7] text-xs font-semibold text-[#251605] hover:bg-[#FAF8F4]">
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
                  </div>
                </div>
              </div>
            </header>

            {/* Navigation Tabs Bar */}
            <nav className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Account workspace">
              {TABS.map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all",
                      active
                        ? "bg-[#C89933] text-[#251605] shadow-2xs"
                        : "bg-white border border-[#E8E1D7] text-[#5F554B] hover:bg-[#FAF8F4] hover:text-[#251605]",
                    )}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Overview Tab Content */}
            {tab === "overview" ? (
              <div className="space-y-4">
                {/* 4 KPI Cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                </div>

                {isCompany && workspace.credit ? (
                  <section
                    className={cn(CARD, "px-4 py-3 text-xs bg-[#FAF8F4] border-[#E8E1D7]")}
                    data-testid="transfer-credit-limit"
                  >
                    <p className="font-semibold text-[#251605]">Transfer credit limit</p>
                    <p className="mt-0.5 text-[#7A7167]">
                      Limit {money(workspace.credit.limit)} · used {money(workspace.credit.used)}{" "}
                      · available {money(workspace.credit.available)}. This limit is enforced when
                      charges transfer onto this company account. It does not block payments or
                      invoice issue.
                    </p>
                  </section>
                ) : null}

                {/* 12-Column Responsive Workspace Grid */}
                <div className="grid gap-4 lg:grid-cols-12">
                  {/* Left 8 Cols: Operational Tables */}
                  <div className="space-y-4 lg:col-span-8">
                    {/* Recent Financial Activity */}
                    <section className={CARD}>
                      <div className="flex items-center justify-between border-b border-[#E8E1D7] px-4 py-3">
                        <h2 className="text-sm font-semibold text-[#251605]">Recent financial activity</h2>
                        <button
                          type="button"
                          onClick={() => setTab("history")}
                          className="text-xs font-semibold text-[#8A6A24] hover:underline"
                        >
                          View Full History
                        </button>
                      </div>
                      {workspace.recentActivity.length === 0 ? (
                        <p className="px-4 py-8 text-center text-xs text-[#7A7167] italic">
                          No financial activity yet.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[640px] text-xs">
                            <thead className="bg-[#FAF8F4] text-left text-[10px] uppercase tracking-wide text-[#7A7167] border-b border-[#E8E1D7]">
                              <tr>
                                <th className="px-3 py-2.5 font-medium">When</th>
                                <th className="px-3 py-2.5 font-medium">Type</th>
                                <th className="px-3 py-2.5 font-medium">Description</th>
                                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                                <th className="px-3 py-2.5 font-medium">Actor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E1D7]">
                              {workspace.recentActivity.map((line) => (
                                <tr key={line.id} className="hover:bg-[#FCFBF9]">
                                  <td className="px-3 py-2 text-[#7A7167] tabular-nums">
                                    {dateTime(line.postedAt)}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className="inline-block rounded-md bg-[#FAF5EB] px-2 py-0.5 text-[10px] font-semibold text-[#8A6A24] border border-[#EADFCB]">
                                      {activityTypeLabel(line)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-[#251605]">
                                    <p className="font-medium">{line.description}</p>
                                    {line.sourceFolioId && line.sourceFolioNumber ? (
                                      <Link
                                        to="/restaurant/pms/cashiering/folios/$folioId"
                                        params={{ folioId: line.sourceFolioId }}
                                        className="text-[11px] font-semibold text-[#8A6A2F] hover:underline mt-0.5 block"
                                      >
                                        Folio #{line.sourceFolioNumber}
                                      </Link>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#251605]">
                                    {formatBalance(money, line.amount)}
                                  </td>
                                  <td className="px-3 py-2 text-[#7A7167]">
                                    {line.actorName ?? "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>

                    {/* Recent Documents */}
                    <section className={CARD}>
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
                        <p className="px-4 py-8 text-center text-xs text-[#7A7167] italic">
                          No invoices or account documents have been issued.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[520px] text-xs">
                            <thead className="bg-[#FAF8F4] text-left text-[10px] uppercase tracking-wide text-[#7A7167] border-b border-[#E8E1D7]">
                              <tr>
                                <th className="px-3 py-2.5 font-medium">Document</th>
                                <th className="px-3 py-2.5 font-medium">Type</th>
                                <th className="px-3 py-2.5 font-medium">Issued</th>
                                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                                <th className="px-3 py-2.5 text-right font-medium">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E1D7]">
                              {workspace.recentDocuments.map((doc) => (
                                <tr
                                  key={`${doc.documentType}-${doc.id}`}
                                  className="hover:bg-[#FCFBF9]"
                                >
                                  <td className="px-3 py-2 font-semibold text-[#8A6A24]">
                                    {doc.number}
                                  </td>
                                  <td className="px-3 py-2 capitalize text-[#5F554B]">
                                    {doc.documentType.replace("_", " ")}
                                  </td>
                                  <td className="px-3 py-2 text-[#7A7167] tabular-nums">
                                    {dateTime(doc.issuedAt)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#251605]">
                                    {formatBalance(money, doc.amount)}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2.5 text-xs border-[#E8E1D7] text-[#251605] hover:bg-[#FAF8F4]"
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

                  {/* Right 4 Cols: Entity Details & Quick Actions */}
                  <aside className="space-y-4 lg:col-span-4">
                    {/* Entity Details Card */}
                    <section className={cn(CARD, "p-4 space-y-2.5 text-xs")}>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#8A6A24] border-b border-[#E8E1D7] pb-2">
                        {isGroup ? "Group Information" : "Company Information"}
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

                    {/* Billing Summary Card */}
                    <section className={cn(CARD, "p-4 space-y-2.5 text-xs")}>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#8A6A24] border-b border-[#E8E1D7] pb-2">
                        {isCompany ? "Billing Summary" : "Profile Summary"}
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
                      <p className="text-[11px] text-[#A89F91] pt-1">
                        Billing fields are read from the profile. Cashiering does not edit them.
                      </p>
                      {workspace.capabilities.canViewProfile ? (
                        <Button variant="outline" size="sm" className="w-full h-8 text-xs border-[#E8E1D7] gap-1.5" asChild>
                          <Link
                            to="/restaurant/pms/guests/$guestId"
                            params={{ guestId: workspace.master.id }}
                            search={guestProfileSearch({ type: profileType, nav: "overview" })}
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

                    {/* Quick Actions Card */}
                    <section className={cn(CARD, "p-4 space-y-2.5 text-xs")}>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-[#8A6A24] border-b border-[#E8E1D7] pb-2">
                        Quick Actions
                      </h2>
                      {workspace.account.status === "closed" ? (
                        <p
                          className="text-xs text-[#7A7167]"
                          data-testid="account-closed-note"
                        >
                          This account is closed. Documents and the profile remain available.
                        </p>
                      ) : null}
                      {workspace.capabilities.canReceivePayment ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start h-8 text-xs border-[#E8E1D7] gap-2 hover:bg-[#FAF8F4]"
                          onClick={() => {
                            setCompose("payment");
                            setTab("payments");
                          }}
                        >
                          <Landmark className="size-3.5 text-[#146C43]" /> Receive payment
                        </Button>
                      ) : null}
                      {workspace.capabilities.canCreateInvoice ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start h-8 text-xs border-[#E8E1D7] gap-2 hover:bg-[#FAF8F4]"
                          onClick={openInvoices}
                        >
                          <FileText className="size-3.5 text-[#8A6A24]" /> Create invoice
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start h-8 text-xs border-[#E8E1D7] gap-2 hover:bg-[#FAF8F4]"
                        onClick={() => setTab("charges")}
                      >
                        <Receipt className="size-3.5 text-[#5F554B]" /> View source charges
                      </Button>
                      {workspace.capabilities.canWriteOff ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start h-8 text-xs border-[#E8E1D7] gap-2 text-[#B91C1C] hover:bg-[#FEF2F2]"
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
                        <div className="space-y-1 pt-1 border-t border-[#E8E1D7]">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start h-8 text-xs border-[#E8E1D7] text-[#B91C1C] hover:bg-[#FEF2F2]"
                            disabled={!workspace.capabilities.canClose || closeMut.isPending}
                            data-testid="close-account"
                            onClick={() => closeMut.mutate()}
                          >
                            Close account
                          </Button>
                          {!workspace.capabilities.canClose ? (
                            <p
                              className="text-[11px] text-[#A89F91]"
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
