import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BedDouble,
  Building2,
  CheckCircle2,
  Coins,
  ExternalLink,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  History,
  Info,
  Layers,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Vault,
  Wallet,
} from "lucide-react";

import {
  financialEmptyCopy,
  matchesFinancialFilter,
  NIGHT_AUDIT_FINANCIAL_CATEGORIES,
  type NightAuditFinancialCategory,
  type NightAuditFinancialReconciliation,
  type NightAuditRowStatus,
} from "@/packages/pms/lib/night-audit-financial";
import { NIGHT_AUDIT_PAGE_SIZE, paginateRows } from "@/packages/pms/lib/night-audit-shell";
import { Button } from "@/shared/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

export type FinancialSubTab =
  | "triage"
  | "guest_folios"
  | "invoices"
  | "payments_deposits"
  | "accounts"
  | "drawers"
  | "fiscal"
  | "tax";

const CATEGORY_LABEL: Record<NightAuditFinancialCategory, string> = {
  guest_folios: "Guest Folios",
  invoices: "Invoices",
  payments_deposits: "Payments & Deposits",
  accounts: "Accounts",
  drawers: "Cashier Drawers",
  fiscal: "Fiscal Compliance",
  tax: "Tax & Service Charge",
};

function money(amount: number | null, currency: string | null, restricted: boolean): string {
  if (restricted || amount == null) return restricted ? "Restricted" : "—";
  return `${amount.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

function sortByPriority<T extends { status: NightAuditRowStatus }>(rows: T[]): T[] {
  const rank = (status: NightAuditRowStatus) =>
    status === "blocker" ? 0 : status === "warning" ? 1 : status === "info" ? 2 : 3;
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status));
}

function getDestinationMeta(row: {
  code: string;
  category: string;
  referenceType?: string | null;
  referenceId?: string | null;
  route?: string;
  search?: Record<string, unknown>;
}) {
  if (row.code === "open_cashier_shift") {
    return {
      destination: "Cashier Desk → Shift Reconciliation",
      actionText: "Reconcile & Close Shift",
      icon: Vault,
    };
  }
  if (row.code === "closed_shift_variance") {
    return {
      destination: "Cashier Desk → Shift Cash Movements",
      actionText: "Inspect Shift Drawer",
      icon: Vault,
    };
  }
  if (row.code === "closed_folio_nonzero_balance") {
    return {
      destination: "Guest Folio → Settlement Tab",
      actionText: "Settle Folio Balance",
      icon: FileSpreadsheet,
    };
  }
  if (row.code === "closed_folio_post_activity") {
    return {
      destination: "Guest Folio → Transaction History",
      actionText: "Review Post-Close Audit",
      icon: History,
    };
  }
  if (row.code === "missing_folio") {
    return {
      destination: "Reservation → Folio & Rate Setup",
      actionText: "Open Reservation",
      icon: BedDouble,
    };
  }
  if (row.code === "folio_invoice_contradiction") {
    return {
      destination: "Guest Folio → Invoices & Documents",
      actionText: "Reconcile Folio Invoices",
      icon: Receipt,
    };
  }
  if (row.code === "unallocated_guest_payment" || row.code === "unallocated_guest_deposit") {
    return {
      destination: "Guest Folio → Payment Allocation Drawer",
      actionText: "Open Allocation Drawer",
      icon: Coins,
    };
  }
  if (row.category === "accounts") {
    if (row.code === "unallocated_account_payment" || row.code === "allocation_exceeds_source") {
      return {
        destination: "Financial Account → Payments Tab",
        actionText: "Allocate Account Payment",
        icon: Building2,
      };
    }
    return {
      destination: "Financial Account → Invoices Tab",
      actionText: "Inspect Account Invoices",
      icon: Building2,
    };
  }
  if (row.category === "fiscal") {
    const isFolio = typeof row.route === "string" && row.route.includes("/folios/");
    const isAccount = typeof row.route === "string" && row.route.includes("/accounts/");
    const modalTab = (row.search as Record<string, string> | undefined)?.modalTab;
    const tabName =
      modalTab === "withholding"
        ? "Withholding Tab"
        : modalTab === "settlement"
          ? "Settlement Tab"
          : "Fiscal Registration Tab";
    return {
      destination: isFolio
        ? `Guest Folio → ${tabName}`
        : isAccount
          ? `Financial Account → ${tabName}`
          : "Fiscal Integration → Document Audit",
      actionText:
        modalTab === "withholding"
          ? "Review Withholding Tax"
          : modalTab === "settlement"
            ? "Review Settlement & Receipts"
            : isFolio || isAccount
              ? "Inspect Fiscal Registration"
              : "Inspect Fiscal Record",
      icon: FileCheck,
    };
  }
  return {
    destination: "Source Module",
    actionText: "Resolve in Source",
    icon: ExternalLink,
  };
}

function badge(status: NightAuditRowStatus | string): string {
  if (status === "blocker" || status === "blocked") return "bg-red-50 text-red-700 border border-red-200/80";
  if (status === "warning") return "bg-amber-50 text-amber-800 border border-amber-200/80";
  if (status === "info") return "bg-blue-50 text-blue-700 border border-blue-200/80";
  if (status === "unavailable") return "bg-stone-100 text-stone-700 border border-stone-200";
  return "bg-emerald-50 text-emerald-800 border border-emerald-200/80";
}

function statusIcon(status: NightAuditRowStatus | string) {
  if (status === "blocker" || status === "blocked") {
    return <AlertTriangle className="size-3.5 text-red-600 shrink-0" />;
  }
  if (status === "warning") {
    return <AlertCircle className="size-3.5 text-amber-600 shrink-0" />;
  }
  if (status === "info") {
    return <Info className="size-3.5 text-blue-600 shrink-0" />;
  }
  return <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />;
}

export function NightAuditFinancialPanel({
  loading,
  error,
  result,
  focus,
  onRefresh,
}: {
  loading: boolean;
  error: string | null;
  result: NightAuditFinancialReconciliation | null;
  focus?: string | undefined;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<FinancialSubTab>("triage");
  const [severity, setSeverity] = useState<"all" | NightAuditRowStatus>("all");
  const [category, setCategory] = useState<"all" | NightAuditFinancialCategory>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Sync initial focus to relevant sub-tab and filter
  useEffect(() => {
    if (focus === "blockers") {
      setActiveTab("triage");
      setSeverity("blocker");
    } else if (focus === "warnings") {
      setActiveTab("triage");
      setSeverity("warning");
    } else if (focus === "drawers") {
      setActiveTab("drawers");
      setCategory("drawers");
    } else if (focus === "fiscal") {
      setActiveTab("fiscal");
      setCategory("fiscal");
    }
  }, [focus]);

  useEffect(() => {
    setPage(1);
  }, [severity, category, search, activeTab, result?.checkedAt]);

  const restricted = result?.access === "summary";
  const selected = result?.issues.find((row) => row.id === selectedId) ?? null;
  const filter = useMemo(() => ({ severity, category, search }), [category, search, severity]);

  // 1. Triage / Issues List
  const visibleIssues = useMemo(() => {
    if (!result) return [];
    return result.issues.filter((row) =>
      matchesFinancialFilter(
        {
          status: row.severity === "blocking" ? "blocker" : row.severity === "warning" ? "warning" : "info",
          category: row.category,
          text: `${row.title} ${row.description} ${row.code}`,
          currency: row.currency ?? null,
        },
        filter,
      ),
    );
  }, [filter, result]);
  const issuePage = paginateRows(visibleIssues, page);

  // 2. Guest Folios
  const filteredFolios = useMemo(() => {
    if (!result) return [];
    return sortByPriority(
      result.guestFolios.filter((row) =>
        matchesFinancialFilter(
          {
            status: row.status,
            category: "guest_folios",
            text: `${row.guest} ${row.reservation} ${row.folio} ${row.issue}`,
            currency: row.currency,
          },
          filter,
        ),
      ),
    );
  }, [result, filter]);
  const folioPage = paginateRows(filteredFolios, page);

  // 3. Invoices
  const filteredInvoices = useMemo(() => {
    if (!result) return [];
    return sortByPriority(
      result.invoiceSettlement.filter((row) =>
        matchesFinancialFilter(
          {
            status: row.status,
            category: "invoices",
            text: `${row.invoice} ${row.guest} ${row.issue}`,
            currency: row.currency,
          },
          filter,
        ),
      ),
    );
  }, [result, filter]);
  const invoicePage = paginateRows(filteredInvoices, page);

  // 4. Payments & Deposits
  const filteredAllocations = useMemo(() => {
    if (!result) return [];
    return sortByPriority(
      result.allocations.filter((row) =>
        matchesFinancialFilter(
          {
            status: row.status,
            category: "payments_deposits",
            text: `${row.type} ${row.reference} ${row.guest} ${row.issue}`,
            currency: row.currency,
          },
          filter,
        ),
      ),
    );
  }, [result, filter]);
  const allocationPage = paginateRows(filteredAllocations, page);

  // 5. Accounts
  const filteredAccounts = useMemo(() => {
    if (!result) return [];
    return sortByPriority(
      result.accounts.filter((row) =>
        matchesFinancialFilter(
          {
            status: row.status,
            category: "accounts",
            text: `${row.account} ${row.type} ${row.issue}`,
            currency: row.currency,
          },
          filter,
        ),
      ),
    );
  }, [result, filter]);
  const accountPage = paginateRows(filteredAccounts, page);

  // 6. Drawers
  const filteredDrawers = useMemo(() => {
    if (!result) return [];
    return sortByPriority(
      result.drawers.filter((row) =>
        matchesFinancialFilter(
          {
            status: row.status,
            category: "drawers",
            text: `${row.cashier} ${row.issue}`,
            currency: row.currency,
          },
          filter,
        ),
      ),
    );
  }, [result, filter]);
  const drawerPage = paginateRows(filteredDrawers, page);

  // 7. Fiscal
  const filteredFiscal = useMemo(() => {
    if (!result) return [];
    return sortByPriority(
      result.fiscal.filter((row) =>
        matchesFinancialFilter(
          {
            status: row.status,
            category: "fiscal",
            text: `${row.document} ${row.type} ${row.fiscalStatus} ${row.issue}`,
            documentType: row.type,
          },
          filter,
        ),
      ),
    );
  }, [result, filter]);
  const fiscalPage = paginateRows(filteredFiscal, page);

  if (loading || (!result && !error)) {
    return (
      <section className="rounded-2xl border border-border bg-card p-8 text-center" data-testid="night-audit-financial-loading">
        <RefreshCw className="mx-auto size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">{financialEmptyCopy("loading")}</p>
        <p className="mt-1 text-xs text-muted-foreground">Gathering frozen cashiering facts, ledger balances, and open drawers…</p>
      </section>
    );
  }

  if (error) {
    const denied = /don't have access|not allowed|no access/i.test(error);
    return (
      <section
        className="rounded-2xl border border-border bg-card p-6"
        data-testid={denied ? "night-audit-financial-no-access" : "night-audit-financial-unavailable"}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-lg text-foreground">{denied ? "No access" : "Reconciliation Unavailable"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{denied ? financialEmptyCopy("access") : financialEmptyCopy("failed")}</p>
            {denied ? null : (
              <Button type="button" variant="outline" className="mt-4" onClick={onRefresh}>
                <RefreshCw className="mr-2 size-3.5" />
                Refresh / Recheck Financials
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (!result) return null;

  const blockerCount = result.summary.blockerCount;
  const warningCount = result.summary.warningCount;
  const openDrawerCount = result.summary.openDrawerCount;
  const fiscalProblemCount = result.summary.fiscalProblemCount;

  const totalActionItems = blockerCount + warningCount;

  return (
    <div className="space-y-5" data-testid="night-audit-financial">
      {/* 1. FINANCIAL HEALTH & LEDGER INTEGRITY RIBBON */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-r from-card via-card to-muted/20 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3.5">
            <div
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-xl shadow-sm",
                result.status === "ready"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : result.status === "warning"
                    ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                    : "bg-red-50 text-red-700 ring-1 ring-red-200",
              )}
            >
              {result.status === "ready" ? (
                <ShieldCheck className="size-6" />
              ) : result.status === "warning" ? (
                <AlertCircle className="size-6" />
              ) : (
                <ShieldAlert className="size-6" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Financial Reconciliation
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
                    result.status === "ready"
                      ? "bg-emerald-100/90 text-emerald-900"
                      : result.status === "warning"
                        ? "bg-amber-100/90 text-amber-950"
                        : "bg-red-100/90 text-red-950",
                  )}
                >
                  {result.status === "ready"
                    ? "Audit Ready"
                    : result.status === "warning"
                      ? "Ready with Warnings"
                      : "Roll Blocked"}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {result.status === "ready"
                  ? "All guest folios, drawers, and accounts are in balance. Ready for close."
                  : result.status === "warning"
                    ? `${warningCount} warning${warningCount === 1 ? "" : "s"} detected. Day close is permitted with sign-off note.`
                    : `${blockerCount} hard blocker${blockerCount === 1 ? "" : "s"} must be resolved before advancing business date.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:self-end lg:self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="night-audit-financial-refresh"
              onClick={onRefresh}
              className="h-9 gap-1.5 font-medium shadow-2xs hover:bg-muted"
            >
              <RefreshCw className="size-3.5" />
              Refresh / Recheck Financials
            </Button>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/50 pt-4 sm:grid-cols-4 lg:grid-cols-5">
          <Kpi
            label="Hard Blockers"
            value={String(blockerCount)}
            tone={blockerCount ? "blocked" : "ready"}
            subtext={blockerCount ? "Prevents date roll" : "Clean"}
            onClick={() => {
              setActiveTab("triage");
              setSeverity("blocker");
            }}
          />
          <Kpi
            label="Warnings"
            value={String(warningCount)}
            tone={warningCount ? "warning" : "ready"}
            subtext={warningCount ? "Requires review" : "No warnings"}
            onClick={() => {
              setActiveTab("triage");
              setSeverity("warning");
            }}
          />
          <Kpi
            label="Open Drawers"
            value={result.drawerState === "na" ? "N/A" : String(openDrawerCount)}
            tone={openDrawerCount ? "blocked" : "ready"}
            subtext={openDrawerCount ? `${openDrawerCount} shift unclosed` : "All hotel shifts closed"}
            onClick={() => setActiveTab("drawers")}
          />
          <Kpi
            label="Fiscal Compliance"
            value={result.fiscalConfigured ? String(fiscalProblemCount) : "N/A"}
            tone={fiscalProblemCount ? "blocked" : "ready"}
            subtext={result.fiscalConfigured ? (fiscalProblemCount ? "Needs sync" : "All registered") : "Integration inactive"}
            onClick={() => setActiveTab("fiscal")}
          />
          <Kpi
            label="Financial Status"
            value={result.status.toUpperCase()}
            tone={result.status}
            subtext={`Snapshot: ${result.checkedAt ? result.checkedAt.slice(11, 19) : "Just now"}`}
          />
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS & SEARCH COMMAND BAR */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-1 shadow-2xs">
            <TabButton
              active={activeTab === "triage"}
              onClick={() => setActiveTab("triage")}
              icon={<ShieldAlert className="size-3.5" />}
              label="Action Triage"
              count={totalActionItems}
              badgeTone={blockerCount > 0 ? "red" : warningCount > 0 ? "amber" : "neutral"}
            />
            <TabButton
              active={activeTab === "guest_folios"}
              onClick={() => setActiveTab("guest_folios")}
              icon={<FileText className="size-3.5" />}
              label="Guest Folios"
              count={result.guestFolios.length}
            />
            <TabButton
              active={activeTab === "invoices"}
              onClick={() => setActiveTab("invoices")}
              icon={<Receipt className="size-3.5" />}
              label="Invoices"
              count={result.invoiceSettlement.length}
            />
            <TabButton
              active={activeTab === "payments_deposits"}
              onClick={() => setActiveTab("payments_deposits")}
              icon={<Wallet className="size-3.5" />}
              label="Payments & Deposits"
              count={result.allocations.length}
            />
            <TabButton
              active={activeTab === "accounts"}
              onClick={() => setActiveTab("accounts")}
              icon={<Building2 className="size-3.5" />}
              label="Accounts"
              count={result.accounts.length}
            />
            <TabButton
              active={activeTab === "drawers"}
              onClick={() => setActiveTab("drawers")}
              icon={<Vault className="size-3.5" />}
              label="Drawers"
              count={result.drawers.length}
              badgeTone={openDrawerCount > 0 ? "red" : "neutral"}
            />
            <TabButton
              active={activeTab === "fiscal"}
              onClick={() => setActiveTab("fiscal")}
              icon={<FileSpreadsheet className="size-3.5" />}
              label="Fiscal"
              count={result.fiscal.length}
              badgeTone={fiscalProblemCount > 0 ? "red" : "neutral"}
            />
            <TabButton
              active={activeTab === "tax"}
              onClick={() => setActiveTab("tax")}
              icon={<Layers className="size-3.5" />}
              label="Tax & Fees"
            />
          </div>

          {/* Quick Filter & Search Bar */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-44 flex-1 sm:w-60">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search issues, folios…"
                aria-label="Search financial issues"
                data-testid="night-audit-financial-search"
                className="h-8.5 w-full rounded-lg border border-input bg-card pl-8 pr-2.5 text-xs placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>
            <select
              aria-label="Severity"
              data-testid="night-audit-financial-severity"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as typeof severity)}
              className="h-8.5 rounded-lg border border-input bg-card px-2 text-xs font-medium focus:outline-hidden"
            >
              <option value="all">All severities</option>
              <option value="blocker">Blockers</option>
              <option value="warning">Warnings</option>
              <option value="info">Info</option>
              <option value="pass">Pass</option>
            </select>
            <select
              aria-label="Category"
              data-testid="night-audit-financial-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as typeof category)}
              className="hidden h-8.5 rounded-lg border border-input bg-card px-2 text-xs font-medium sm:block focus:outline-hidden"
            >
              <option value="all">All categories</option>
              {NIGHT_AUDIT_FINANCIAL_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {CATEGORY_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {restricted ? (
          <div
            className="flex items-center gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2 text-xs text-amber-900"
            data-testid="night-audit-financial-redacted"
          >
            <Info className="size-4 shrink-0 text-amber-700" />
            <p>{financialEmptyCopy("redacted")}</p>
          </div>
        ) : null}
      </div>

      {/* 3. SUB-TAB VIEW CONTENT */}

      {/* TAB 1: TRIAGE MATRIX */}
      {activeTab === "triage" && (
        <section className="rounded-2xl border border-border bg-card shadow-xs">
          <div className="flex flex-wrap items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-foreground">Actionable Exceptions & Triage Matrix</h3>
              <p className="text-xs text-muted-foreground">
                Priority discrepancies detected in the cashiering, settlement, or drawer ledger for this business date.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{visibleIssues.length} item{visibleIssues.length === 1 ? "" : "s"} matching</span>
            </div>
          </div>

          {visibleIssues.length === 0 ? (
            <div className="p-10 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-4 ring-emerald-50/50">
                <CheckCircle2 className="size-6" />
              </div>
              <h4 className="mt-3 font-display text-base font-medium text-foreground">No Discrepancies Found</h4>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {search || severity !== "all" || category !== "all"
                  ? "No financial issues match your active search filters."
                  : financialEmptyCopy("issues")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {issuePage.rows.map((row) => {
                const meta = getDestinationMeta(row);
                const DestinationIcon = meta.icon;
                return (
                  <div key={row.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", badge(row.severity === "blocking" ? "blocker" : row.severity))}>
                          {statusIcon(row.severity === "blocking" ? "blocker" : row.severity)}
                          {row.severity === "blocking" ? "Hard Blocker" : row.severity === "warning" ? "Warning" : "Info"}
                        </span>
                        <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {CATEGORY_LABEL[row.category] ?? row.category}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                          <DestinationIcon className="size-3 text-primary" />
                          <span>{meta.destination}</span>
                        </span>
                        {row.amount != null ? (
                          <span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-mono font-medium text-stone-800 dark:bg-stone-800 dark:text-stone-200">
                            {money(row.amount, row.currency ?? null, Boolean(restricted))}
                          </span>
                        ) : null}
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          className="text-left font-display text-sm font-semibold text-foreground hover:underline"
                        >
                          {row.title}
                        </button>
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:self-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedId(row.id)}
                        className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="size-3.5" />
                        Inspect
                      </Button>

                      <Link
                        to={row.route as never}
                        search={
                          ({
                            ...(row.search as Record<string, unknown> ?? {}),
                            returnTo: "/restaurant/pms/night-audit",
                            returnToLabel: "Return to Night Audit",
                          }) as never
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 transition-all"
                      >
                        <span>{meta.actionText}</span>
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <TablePagination
            page={issuePage.page}
            pages={issuePage.pages}
            total={visibleIssues.length}
            onPageChange={setPage}
          />
        </section>
      )}

      {/* TAB 2: GUEST FOLIOS */}
      {activeTab === "guest_folios" && (
        <Section
          title="Guest Folios Ledger"
          count={filteredFolios.length}
          totalCount={result.guestFolios.length}
        >
          <SimpleTable
            headers={["Guest", "Reservation", "Room", "Folio #", "Balance", "Invoice State", "Status", "Anomaly", "Action"]}
            rows={folioPage.rows.map((row) => [
              <span className="font-medium text-foreground">{row.guest}</span>,
              <span className="font-mono text-muted-foreground">{row.reservation}</span>,
              row.room,
              <span className="font-mono font-medium">{row.folio}</span>,
              <span className={cn("font-mono font-semibold", (row.balance ?? 0) > 0 ? "text-amber-800" : (row.balance ?? 0) < 0 ? "text-red-700" : "text-foreground")}>
                {money(row.balance, row.currency, Boolean(restricted))}
              </span>,
              <span className="rounded px-1.5 py-0.5 text-[11px] bg-muted/60">{row.invoiceState}</span>,
              <StatusBadge status={row.status} />,
              <span className="text-muted-foreground">{row.issue || "—"}</span>,
              row.action ? (
                <DirectLink label={row.action} route={row.route} search={row.search} />
              ) : (
                "—"
              ),
            ])}
            empty="No guest folios match your criteria in this reconciliation."
          />
          <TablePagination
            page={folioPage.page}
            pages={folioPage.pages}
            total={filteredFolios.length}
            onPageChange={setPage}
          />
        </Section>
      )}

      {/* TAB 3: INVOICES & SETTLEMENT */}
      {activeTab === "invoices" && (
        <Section
          title="Issued Guest Invoices & Settlement"
          count={filteredInvoices.length}
          totalCount={result.invoiceSettlement.length}
        >
          <SimpleTable
            headers={[
              "Invoice #",
              "Guest",
              "Issued Date",
              "Total",
              "Paid Alloc.",
              "Deposit Appl.",
              "Cre/Deb Adj.",
              "Outstanding",
              "Status",
              "Audit Note",
              "Action",
            ]}
            rows={invoicePage.rows.map((row) => [
              <span className="font-mono font-semibold text-foreground">{row.invoice}</span>,
              row.guest,
              <span className="text-muted-foreground">{row.issuedAt ? row.issuedAt.slice(0, 10) : "—"}</span>,
              money(row.invoiceTotal, row.currency, Boolean(restricted)),
              money(row.paidAllocation, row.currency, Boolean(restricted)),
              money(row.depositApplied, row.currency, Boolean(restricted)),
              money(row.creditDebitAdjustment, row.currency, Boolean(restricted)),
              <span className={cn("font-mono font-semibold", (row.outstanding ?? 0) > 0 ? "text-amber-800" : "text-foreground")}>
                {money(row.outstanding, row.currency, Boolean(restricted))}
              </span>,
              <StatusBadge status={row.status} />,
              <span className="text-muted-foreground">{row.issue || "Settled"}</span>,
              <DirectLink label={row.action || "Open Invoices"} route={row.route} search={row.search} />,
            ])}
            empty="No issued guest invoices in this reconciliation."
          />
          <TablePagination
            page={invoicePage.page}
            pages={invoicePage.pages}
            total={filteredInvoices.length}
            onPageChange={setPage}
          />
        </Section>
      )}

      {/* TAB 4: PAYMENTS & DEPOSITS */}
      {activeTab === "payments_deposits" && (
        <Section
          title="Guest Payments & Advance Deposits"
          count={filteredAllocations.length}
          totalCount={result.allocations.length}
        >
          <SimpleTable
            headers={["Type", "Reference", "Guest", "Face Amount", "Allocated", "Available", "Target Invoice", "Status", "Issue", "Action"]}
            rows={allocationPage.rows.map((row) => [
              <span className="font-medium text-foreground">{row.type}</span>,
              <span className="font-mono text-xs">{row.reference}</span>,
              row.guest,
              money(row.amount, row.currency, Boolean(restricted)),
              money(row.allocated, row.currency, Boolean(restricted)),
              <span className={cn("font-mono font-medium", (row.available ?? 0) > 0.01 ? "text-amber-700 font-semibold" : "")}>
                {money(row.available, row.currency, Boolean(restricted))}
              </span>,
              row.targetInvoice ?? "—",
              <StatusBadge status={row.status} />,
              <span className="text-muted-foreground">{row.issue || "Fully reconciled"}</span>,
              <DirectLink label={row.action || "Search Cashiering"} route={row.route} search={row.search} />,
            ])}
            empty="No guest payments or deposits in this reconciliation."
          />
          <TablePagination
            page={allocationPage.page}
            pages={allocationPage.pages}
            total={filteredAllocations.length}
            onPageChange={setPage}
          />
        </Section>
      )}

      {/* TAB 5: ACCOUNTS */}
      {activeTab === "accounts" && (
        <Section
          title="Company & Group Accounts (Accounts Receivable)"
          count={filteredAccounts.length}
          totalCount={result.accounts.length}
        >
          {result.accounts.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{financialEmptyCopy("accounts")}</p>
          ) : (
            <>
              <SimpleTable
                headers={["Account", "Kind", "Invoices", "Outstanding AR", "Unallocated Cash", "State", "Audit Issue", "Action"]}
                rows={accountPage.rows.map((row) => [
                  <span className="font-semibold text-foreground">{row.account}</span>,
                  <span className="capitalize text-muted-foreground">{row.type}</span>,
                  String(row.invoices),
                  <span className="font-mono font-semibold text-foreground">{money(row.outstandingAr, row.currency, Boolean(restricted))}</span>,
                  <span className={cn("font-mono", (row.unallocatedPayment ?? 0) > 0 ? "text-amber-700 font-semibold" : "")}>
                    {money(row.unallocatedPayment, row.currency, Boolean(restricted))}
                  </span>,
                  <StatusBadge status={row.status} />,
                  <span className="text-muted-foreground">{row.issue || "Balanced"}</span>,
                  <DirectLink label={row.action || "Open Account"} route={row.route} search={row.search} />,
                ])}
                empty={financialEmptyCopy("accounts")}
              />
              <TablePagination
                page={accountPage.page}
                pages={accountPage.pages}
                total={filteredAccounts.length}
                onPageChange={setPage}
              />
            </>
          )}
        </Section>
      )}

      {/* TAB 6: CASHIER DRAWERS */}
      {activeTab === "drawers" && (
        <Section
          title="Cashier Shifts & Cash Drawers"
          count={filteredDrawers.length}
          totalCount={result.drawers.length}
        >
          {result.drawerState === "na" ? (
            <p className="p-4 text-sm text-muted-foreground">{financialEmptyCopy("drawers")}</p>
          ) : (
            <>
              <SimpleTable
                headers={["Cashier", "Shift Label", "Opened At", "Expected Cash", "Closing Count", "Cash Variance", "Shift State", "Action"]}
                rows={drawerPage.rows.map((row) => [
                  <span className="font-semibold text-foreground">{row.cashier}</span>,
                  row.shift,
                  <span className="text-xs text-muted-foreground">{row.openedAt ? row.openedAt.slice(11, 16) : "—"}</span>,
                  money(row.expectedCash, row.currency, Boolean(restricted)),
                  money(row.closingCount, row.currency, Boolean(restricted)),
                  <span className={cn("font-mono font-medium", (row.variance ?? 0) !== 0 ? "text-red-700 font-semibold" : "text-emerald-700")}>
                    {money(row.variance, row.currency, Boolean(restricted))}
                  </span>,
                  <span className={cn("rounded px-2 py-0.5 text-xs font-semibold capitalize", row.state === "open" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800")}>
                    {row.state}
                  </span>,
                  row.action ? (
                    <DirectLink label={row.action} route={row.route} search={row.search} />
                  ) : (
                    "—"
                  ),
                ])}
                empty={financialEmptyCopy("drawers")}
              />
              <TablePagination
                page={drawerPage.page}
                pages={drawerPage.pages}
                total={filteredDrawers.length}
                onPageChange={setPage}
              />
            </>
          )}
        </Section>
      )}

      {/* TAB 7: FISCAL */}
      {activeTab === "fiscal" && (
        <Section
          title="Fiscalization & Legal Compliance"
          count={filteredFiscal.length}
          totalCount={result.fiscal.length}
        >
          {result.fiscalConfigured ? (
            <>
              <SimpleTable
                headers={["Document", "Type", "Issued", "Fiscal Status", "External Reference", "Mode", "Audit Note", "Action"]}
                rows={fiscalPage.rows.map((row) => [
                  <span className="font-mono font-semibold">{row.document}</span>,
                  row.type,
                  row.issuedAt ? row.issuedAt.slice(0, 10) : "—",
                  <span className="font-mono text-xs">{row.fiscalStatus}</span>,
                  row.externalReference ?? "—",
                  row.mode ?? "—",
                  <span className="text-muted-foreground">{row.issue || "Compliant"}</span>,
                  <DirectLink label={row.action || "Open Fiscal"} route={row.route} search={row.search} />,
                ])}
                empty="No fiscal documents need attention."
              />
              <TablePagination
                page={fiscalPage.page}
                pages={fiscalPage.pages}
                total={filteredFiscal.length}
                onPageChange={setPage}
              />
            </>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{financialEmptyCopy("fiscal")}</p>
          )}
        </Section>
      )}

      {/* TAB 8: TAX & FEES */}
      {activeTab === "tax" && (
        <Section title="Tax & Service Charge Snapshot">
          <p className="mb-3 text-xs text-muted-foreground">{result.occupancyFeeNote}</p>
          {restricted ? (
            <p className="text-sm text-muted-foreground">{financialEmptyCopy("redacted")}</p>
          ) : result.taxSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">No frozen tax or service-charge lines for this business date.</p>
          ) : (
            <SimpleTable
              headers={["Currency", "Tax Accrued", "Service Charge Accrued", "Occupancy Fee Treatment"]}
              rows={result.taxSummary.map((row) => [
                <span className="font-semibold text-foreground">{row.currency}</span>,
                <span className="font-mono font-medium">{row.tax.toFixed(2)}</span>,
                <span className="font-mono font-medium">{row.serviceCharge.toFixed(2)}</span>,
                "Included in tax line",
              ])}
              empty="No frozen tax or service-charge lines for this business date."
            />
          )}
        </Section>
      )}

      {/* 4. SLIDE-OVER INSPECTION DRAWER */}
      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="night-audit-financial-detail">
          {selected ? (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold capitalize", badge(selected.severity === "blocking" ? "blocker" : selected.severity))}>
                    {selected.severity === "blocking" ? "Hard Blocker" : selected.severity}
                  </span>
                  <span className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {CATEGORY_LABEL[selected.category] ?? selected.category}
                  </span>
                </div>
                <SheetTitle className="mt-2 text-base font-semibold">{selected.title}</SheetTitle>
              </SheetHeader>

              <dl className="mt-5 space-y-3.5 text-xs">
                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <dt className="text-muted-foreground">What Night Audit detected</dt>
                  <dd className="mt-1 font-medium text-foreground">{selected.description}</dd>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-2.5">
                    <dt className="text-muted-foreground">Reference Entity</dt>
                    <dd className="mt-0.5 font-mono font-semibold uppercase">{selected.referenceType}</dd>
                  </div>
                  <div className="rounded-lg border border-border p-2.5">
                    <dt className="text-muted-foreground">Discrepancy Amount</dt>
                    <dd className="mt-0.5 font-mono font-semibold text-foreground">
                      {money(selected.amount ?? null, selected.currency ?? null, Boolean(restricted))}
                    </dd>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-2.5">
                    <dt className="text-muted-foreground">Source Module</dt>
                    <dd className="mt-0.5 font-medium">Cashiering / Settlement</dd>
                  </div>
                  <div className="rounded-lg border border-border p-2.5">
                    <dt className="text-muted-foreground">Last Checked</dt>
                    <dd className="mt-0.5 font-mono text-muted-foreground">{result.checkedAt ? result.checkedAt.slice(11, 19) : "Just now"}</dd>
                  </div>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-primary">Direct Target Section</dt>
                  <dd className="mt-1 font-medium text-foreground">{getDestinationMeta(selected).destination}</dd>
                </div>
              </dl>

              <div className="mt-6 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Night Audit is strictly read-only. To resolve this item, open the source module and correct the record.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    to={selected.route as never}
                    search={
                      ({
                        ...(selected.search as Record<string, unknown> ?? {}),
                        returnTo: "/restaurant/pms/night-audit",
                        returnToLabel: "Return to Night Audit",
                      }) as never
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
                  >
                    <span>Open the owner module ({getDestinationMeta(selected).actionText})</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  subtext,
  onClick,
}: {
  label: string;
  value: string;
  tone: string;
  subtext?: string;
  onClick?: () => void;
}) {
  const isClickable = Boolean(onClick);
  return (
    <div
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={cn(
        "rounded-xl border border-border/70 bg-card p-3 shadow-2xs transition-all",
        isClickable && "cursor-pointer hover:border-primary/40 hover:bg-muted/30 focus:outline-hidden",
      )}
      data-testid="night-audit-financial-status"
    >
      <p className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-lg font-bold",
          tone === "blocked" ? "text-red-700" : tone === "warning" ? "text-amber-800" : tone === "ready" ? "text-emerald-700" : "text-foreground",
        )}
      >
        {value}
      </p>
      {subtext ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
  badgeTone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: number;
  badgeTone?: "red" | "amber" | "neutral";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all focus:outline-hidden",
        active
          ? "bg-foreground text-background shadow-xs font-semibold"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
      {count != null && count > 0 ? (
        <span
          className={cn(
            "ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold leading-none",
            active
              ? "bg-background/20 text-background"
              : badgeTone === "red"
                ? "bg-red-100 text-red-800"
                : badgeTone === "amber"
                  ? "bg-amber-100 text-amber-900"
                  : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Section({
  title,
  count,
  totalCount,
  children,
}: {
  title: string;
  count?: number;
  totalCount?: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-semibold text-foreground">{title}</h3>
          {count != null ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {totalCount != null && totalCount !== count ? `${count} of ${totalCount}` : count}
            </span>
          ) : null}
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: NightAuditRowStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold capitalize", badge(status))}>
      {statusIcon(status)}
      {status}
    </span>
  );
}

function DirectLink({ label, route, search }: { label: string; route: string; search?: Record<string, string> }) {
  const enrichedSearch = {
    ...(search ?? {}),
    returnTo: "/restaurant/pms/night-audit",
    returnToLabel: "Return to Night Audit",
  };
  return (
    <Link
      to={route as never}
      search={enrichedSearch as never}
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
    >
      <span>{label}</span>
      <ExternalLink className="size-3 shrink-0 opacity-70" />
    </Link>
  );
}

function TablePagination({
  page,
  pages,
  total,
  pageSize = NIGHT_AUDIT_PAGE_SIZE,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize?: number;
  onPageChange: (next: number) => void;
}) {
  if (pages <= 1 && total <= pageSize) return null;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground">
      <span>
        Showing <span className="font-semibold text-foreground">{start}–{end}</span> of <span className="font-semibold text-foreground">{total}</span> records
      </span>
      <div className="flex items-center gap-2">
        <span>Page {page} of {pages}</span>
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="h-7 px-2.5 text-xs"
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
            className="h-7 px-2.5 text-xs"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: Array<Array<string | ReactNode>>;
  empty: string;
}) {
  if (rows.length === 0) return <p className="p-4 text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row, index) => (
            <tr key={index} className="transition-colors hover:bg-muted/20">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2.5 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
