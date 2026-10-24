import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

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

const CATEGORY_LABEL: Record<NightAuditFinancialCategory, string> = {
  guest_folios: "Guest Folios",
  invoices: "Invoices",
  payments_deposits: "Payments & Deposits",
  accounts: "Accounts",
  drawers: "Drawers",
  fiscal: "Fiscal",
  tax: "Tax",
};

function money(amount: number | null, currency: string | null, restricted: boolean): string {
  if (restricted || amount == null) return restricted ? "Restricted" : "—";
  return `${amount.toFixed(2)}${currency ? ` ${currency}` : ""}`;
}

function prioritize<T extends { status: NightAuditRowStatus }>(rows: T[]): T[] {
  const rank = (status: NightAuditRowStatus) =>
    status === "blocker" ? 0 : status === "warning" ? 1 : status === "info" ? 2 : 3;
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status)).slice(0, NIGHT_AUDIT_PAGE_SIZE);
}

function badge(status: NightAuditRowStatus | string): string {
  if (status === "blocker" || status === "blocked") return "bg-red-50 text-red-800";
  if (status === "warning") return "bg-amber-50 text-amber-900";
  if (status === "info") return "bg-stone-100 text-stone-700";
  if (status === "unavailable") return "bg-stone-200 text-stone-800";
  return "bg-emerald-50 text-emerald-900";
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
  const [severity, setSeverity] = useState<"all" | NightAuditRowStatus>("all");
  const [category, setCategory] = useState<"all" | NightAuditFinancialCategory>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (focus === "blockers") setSeverity("blocker");
    else if (focus === "warnings") setSeverity("warning");
    else if (focus === "drawers") setCategory("drawers");
    else if (focus === "fiscal") setCategory("fiscal");
  }, [focus]);

  useEffect(() => {
    setPage(1);
  }, [severity, category, search, result?.checkedAt]);

  const restricted = result?.access === "summary";
  const selected = result?.issues.find((row) => row.id === selectedId) ?? null;
  const filter = useMemo(() => ({ severity, category, search }), [category, search, severity]);

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

  if (loading || (!result && !error)) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5" data-testid="night-audit-financial-loading">
        <p className="text-sm text-muted-foreground">{financialEmptyCopy("loading")}</p>
      </section>
    );
  }

  if (error) {
    const denied = /don't have access|not allowed|no access/i.test(error);
    return (
      <section
        className="rounded-2xl border border-border bg-card p-5"
        data-testid={denied ? "night-audit-financial-no-access" : "night-audit-financial-unavailable"}
      >
        <h2 className="font-display text-lg text-[#251605]">{denied ? "No access" : "Unavailable"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{denied ? financialEmptyCopy("access") : financialEmptyCopy("failed")}</p>
        {denied ? null : (
          <Button type="button" variant="outline" className="mt-3" onClick={onRefresh}>
            Refresh / Recheck Financials
          </Button>
        )}
      </section>
    );
  }

  if (!result) return null;
  const issuePage = paginateRows(visibleIssues, page);

  return (
    <div className="space-y-4" data-testid="night-audit-financial">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Financial Status" value={result.status.toUpperCase()} tone={result.status} />
        <Kpi label="Hard Blockers" value={String(result.summary.blockerCount)} tone={result.summary.blockerCount ? "blocked" : "ready"} />
        <Kpi label="Warnings" value={String(result.summary.warningCount)} tone={result.summary.warningCount ? "warning" : "ready"} />
        <Kpi label="Open Drawers" value={result.drawerState === "na" ? "N/A" : String(result.summary.openDrawerCount)} tone={result.summary.openDrawerCount ? "blocked" : "ready"} />
        <Kpi label="Fiscal Problems" value={result.fiscalConfigured ? String(result.summary.fiscalProblemCount) : "N/A"} tone={result.summary.fiscalProblemCount ? "blocked" : "ready"} />
      </div>

      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search financial issues"
            aria-label="Search financial issues"
            data-testid="night-audit-financial-search"
            className="h-9 min-w-40 flex-1 rounded-lg border border-input bg-background px-3 text-xs"
          />
          <select
            aria-label="Severity"
            data-testid="night-audit-financial-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as typeof severity)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="all">All severities</option>
            <option value="blocker">Blocker</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
            <option value="pass">Pass</option>
          </select>
          <select
            aria-label="Category"
            data-testid="night-audit-financial-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="all">All categories</option>
            {NIGHT_AUDIT_FINANCIAL_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {CATEGORY_LABEL[item]}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" data-testid="night-audit-financial-refresh" onClick={onRefresh}>
            <RefreshCw className="mr-1 size-3.5" />
            Refresh / Recheck Financials
          </Button>
        </div>
        {restricted ? (
          <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground" data-testid="night-audit-financial-redacted">
            {financialEmptyCopy("redacted")}
          </p>
        ) : null}
        {visibleIssues.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">{financialEmptyCopy("issues")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Issue</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Severity</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {issuePage.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <button type="button" className="text-left font-medium text-[#251605]" onClick={() => setSelectedId(row.id)}>
                        {row.title}
                      </button>
                      <p className="text-muted-foreground">{row.description}</p>
                    </td>
                    <td className="px-3 py-2">{CATEGORY_LABEL[row.category]}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 ${badge(row.severity === "blocking" ? "blocker" : row.severity)}`}>
                        {row.severity === "blocking" ? "Blocker" : row.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link to={row.route as never} search={row.search as never} className="text-[#8A5A12] underline">
                        Open source
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {issuePage.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
            <span>
              Page {issuePage.page} of {issuePage.pages}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Previous
              </Button>
              <Button type="button" variant="outline" disabled={page >= issuePage.pages} onClick={() => setPage((value) => value + 1)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <Section title="Guest Folios">
        <SimpleTable
          headers={["Guest", "Reservation", "Room", "Folio", "Balance", "Invoice", "Status", "Issue", "Action"]}
          rows={prioritize(result.guestFolios
            .filter((row) => matchesFinancialFilter({ status: row.status, category: "guest_folios", text: `${row.guest} ${row.reservation} ${row.folio} ${row.issue}`, currency: row.currency }, filter)))
            .map((row) => [
              row.guest,
              row.reservation,
              row.room,
              row.folio,
              money(row.balance, row.currency, Boolean(restricted)),
              row.invoiceState,
              row.status,
              row.issue,
              row.action ? link(row.action, row.route, row.search) : "",
            ])}
          empty="No guest folios in this reconciliation."
        />
      </Section>

      <Section title="Invoice Settlement">
        <SimpleTable
          headers={["Invoice", "Guest", "Issued", "Total", "Paid", "Deposit", "CRE/DEB", "Outstanding", "Status", "Issue", "Action"]}
          rows={prioritize(result.invoiceSettlement
            .filter((row) => matchesFinancialFilter({ status: row.status, category: "invoices", text: `${row.invoice} ${row.guest} ${row.issue}`, currency: row.currency }, filter)))
            .map((row) => [
              row.invoice,
              row.guest,
              row.issuedAt ?? "—",
              money(row.invoiceTotal, row.currency, Boolean(restricted)),
              money(row.paidAllocation, row.currency, Boolean(restricted)),
              money(row.depositApplied, row.currency, Boolean(restricted)),
              money(row.creditDebitAdjustment, row.currency, Boolean(restricted)),
              money(row.outstanding, row.currency, Boolean(restricted)),
              row.status,
              row.issue,
              link(row.action, row.route, row.search),
            ])}
          empty="No issued guest invoices in this reconciliation."
        />
      </Section>

      <Section title="Payments & Deposits">
        <SimpleTable
          headers={["Type", "Reference", "Guest", "Amount", "Allocated", "Available", "Target", "Status", "Issue", "Action"]}
          rows={prioritize(result.allocations
            .filter((row) => matchesFinancialFilter({ status: row.status, category: "payments_deposits", text: `${row.type} ${row.reference} ${row.guest} ${row.issue}`, currency: row.currency }, filter)))
            .map((row) => [
              row.type,
              row.reference,
              row.guest,
              money(row.amount, row.currency, Boolean(restricted)),
              money(row.allocated, row.currency, Boolean(restricted)),
              money(row.available, row.currency, Boolean(restricted)),
              row.targetInvoice ?? "—",
              row.status,
              row.issue,
              link(row.action, row.route, row.search),
            ])}
          empty="No guest payments or deposits in this reconciliation."
        />
      </Section>

      <Section title="Company / Group Accounts">
        {result.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{financialEmptyCopy("accounts")}</p>
        ) : (
          <SimpleTable
            headers={["Account", "Type", "Invoices", "Outstanding AR", "Unallocated", "State", "Issue", "Action"]}
            rows={prioritize(result.accounts
              .filter((row) => matchesFinancialFilter({ status: row.status, category: "accounts", text: `${row.account} ${row.type} ${row.issue}`, currency: row.currency }, filter)))
              .map((row) => [
                row.account,
                row.type,
                String(row.invoices),
                money(row.outstandingAr, row.currency, Boolean(restricted)),
                money(row.unallocatedPayment, row.currency, Boolean(restricted)),
                row.status,
                row.issue,
                link(row.action, row.route, row.search),
              ])}
            empty={financialEmptyCopy("accounts")}
          />
        )}
      </Section>

      <Section title="Cashier Drawers">
        {result.drawerState === "na" ? (
          <p className="text-sm text-muted-foreground">{financialEmptyCopy("drawers")}</p>
        ) : (
          <SimpleTable
            headers={["Cashier", "Shift", "Opened", "Expected", "Closing", "Variance", "State", "Action"]}
            rows={prioritize(result.drawers
              .filter((row) => matchesFinancialFilter({ status: row.status, category: "drawers", text: `${row.cashier} ${row.issue}`, currency: row.currency }, filter)))
              .map((row) => [
                row.cashier,
                row.shift,
                row.openedAt,
                money(row.expectedCash, row.currency, Boolean(restricted)),
                money(row.closingCount, row.currency, Boolean(restricted)),
                money(row.variance, row.currency, Boolean(restricted)),
                row.state,
                row.action ? link(row.action, row.route, row.search) : "",
              ])}
            empty={financialEmptyCopy("drawers")}
          />
        )}
      </Section>

      <Section title="Fiscal">
        {result.fiscalConfigured ? (
          <SimpleTable
            headers={["Document", "Type", "Issued", "Fiscal Status", "External Reference", "Mode", "Issue", "Action"]}
            rows={prioritize(result.fiscal
              .filter((row) => matchesFinancialFilter({ status: row.status, category: "fiscal", text: `${row.document} ${row.type} ${row.fiscalStatus} ${row.issue}`, documentType: row.type }, filter)))
              .map((row) => [
                row.document,
                row.type,
                row.issuedAt ?? "—",
                row.fiscalStatus,
                row.externalReference ?? "—",
                row.mode ?? "—",
                row.issue,
                link(row.action, row.route, row.search),
              ])}
            empty="No fiscal documents need attention."
          />
        ) : (
          <p className="text-sm text-muted-foreground">{financialEmptyCopy("fiscal")}</p>
        )}
      </Section>

      <Section title="Tax & Service Charge">
        <p className="mb-2 text-xs text-muted-foreground">{result.occupancyFeeNote}</p>
        {restricted ? (
          <p className="text-sm text-muted-foreground">{financialEmptyCopy("redacted")}</p>
        ) : result.taxSummary.length === 0 ? (
          <p className="text-sm text-muted-foreground">No frozen tax or service-charge lines for this business date.</p>
        ) : (
          <SimpleTable
            headers={["Currency", "Tax", "Service Charge", "Occupancy Fee"]}
            rows={result.taxSummary.map((row) => [
              row.currency,
              row.tax.toFixed(2),
              row.serviceCharge.toFixed(2),
              "Included in tax",
            ])}
            empty="No frozen tax or service-charge lines for this business date."
          />
        )}
      </Section>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="night-audit-financial-detail">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
              </SheetHeader>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Severity</dt>
                  <dd className="capitalize">{selected.severity === "blocking" ? "Blocker" : selected.severity}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Source module</dt>
                  <dd>Cashiering / Fiscal</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reference</dt>
                  <dd>{selected.referenceType}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Amount</dt>
                  <dd>{money(selected.amount ?? null, selected.currency ?? null, Boolean(restricted))}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">What Night Audit detected</dt>
                  <dd>{selected.description}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Last checked</dt>
                  <dd>{result.checkedAt}</dd>
                </div>
              </dl>
              <Link to={selected.route as never} search={selected.search as never} className="mt-4 inline-block text-sm text-[#8A5A12] underline">
                Open the owner module
              </Link>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3" data-testid="night-audit-financial-status">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-xl ${tone === "blocked" ? "text-red-800" : tone === "warning" ? "text-amber-900" : "text-[#251605]"}`}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-base text-[#251605]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function link(label: string, route: string, search?: Record<string, string>) {
  return (
    <Link to={route as never} search={search as never} className="text-[#8A5A12] underline">
      {label}
    </Link>
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
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-2 py-1.5 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-border">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 py-1.5 align-top">
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
