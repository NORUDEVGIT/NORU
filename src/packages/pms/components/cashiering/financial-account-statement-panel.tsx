import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, ChevronLeft, ChevronRight, FileSpreadsheet, Printer } from "lucide-react";

import { CashieringPrintLayer } from "@/packages/pms/components/cashiering/cashiering-print-layer";
import { formatBalance } from "@/packages/pms/components/cashiering/folio-workspace-panels";
import { accountBalanceLabel } from "@/packages/pms/lib/cashiering-account-workspace";
import { getFinancialAccountStatement } from "@/packages/pms/lib/cashiering-account-history.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { localDateInZone } from "@/shared/lib/property-time";
import { cn } from "@/shared/lib/utils";

const CARD = "rounded-xl border border-[#E8E1D7] bg-white shadow-sm";

type DateTime = (iso: string | null | undefined) => string;

export function FinancialAccountStatement({
  restaurantId,
  accountId,
  openedAt,
  timezone,
  propertyName,
  propertyAddress,
  money,
  dateTime,
  onViewDocuments,
  onViewPayments,
}: {
  restaurantId: string;
  accountId: string;
  openedAt: string;
  timezone: string;
  propertyName: string;
  propertyAddress: string | null;
  money: (value: number) => string;
  dateTime: DateTime;
  onViewDocuments: () => void;
  onViewPayments: () => void;
}) {
  const fetchStatement = useServerFn(getFinancialAccountStatement);
  const today = localDateInZone(timezone);
  const opened = localDateInZone(timezone, new Date(openedAt));
  const [fromDate, setFromDate] = useState(opened);
  const [toDate, setToDate] = useState(today);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [printing, setPrinting] = useState(false);
  const query = useQuery({
    queryKey: ["financial-account-statement", restaurantId, accountId, fromDate, toDate],
    queryFn: () =>
      fetchStatement({
        data: { restaurantId, accountId, fromDate, toDate },
      }),
    enabled: Boolean(fromDate && toDate),
  });
  const statement = query.data;
  const pageCount = Math.max(1, Math.ceil((statement?.lines.length ?? 0) / pageSize));
  const visible = useMemo(() => {
    const start = (page - 1) * pageSize;
    return statement?.lines.slice(start, start + pageSize) ?? [];
  }, [page, pageSize, statement?.lines]);
  const generatedAt = dateTime(new Date().toISOString());

  function printStatement() {
    setPrinting(true);
    window.setTimeout(() => window.print(), 50);
  }

  return (
    <section className="space-y-4" data-testid="account-tab-statement">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-[#251605]">Account statement</h2>
          <p className="text-sm text-muted-foreground">
            Ledger movement for a property-local date range. This is not a Night Audit business
            date.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-[#E8E1D7] hover:bg-[#FAF8F4]"
          disabled={!statement?.reconciled}
          onClick={printStatement}
        >
          <Printer className="size-4 mr-1.5 text-[#C89933]" /> Print
        </Button>
      </div>

      <div className={cn(CARD, "p-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[#736B5E] flex items-center gap-1.5 mr-1">
            <Calendar className="size-3.5 text-[#C89933]" /> Date range:
          </span>
          <Input
            type="date"
            aria-label="Statement from"
            value={fromDate}
            className="h-9 w-38 text-xs border-[#E8E1D7] bg-white"
            onChange={(event) => {
              setFromDate(event.target.value);
              setPage(1);
            }}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="Statement to"
            value={toDate}
            className="h-9 w-38 text-xs border-[#E8E1D7] bg-white"
            onChange={(event) => {
              setToDate(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading statement…</p> : null}
      {statement?.invalidRange ? (
        <p className="text-sm text-amber-800">The start date must be on or before the end date.</p>
      ) : null}
      {statement && !statement.reconciled && !statement.invalidRange ? (
        <p className="text-sm text-amber-800">
          This statement does not reconcile to the account ledger.
        </p>
      ) : null}
      {statement?.currencyMismatch ? (
        <p className="text-sm text-amber-800">
          A historical amount is in another currency. It is shown as posted, without conversion.
        </p>
      ) : null}
      {statement?.activityAfterClose ? (
        <p className="text-sm text-amber-800">
          Some ledger rows are posted after this account was closed.
        </p>
      ) : null}
      {statement?.reconciled ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Opening balance" value={balanceText(money, statement.openingBalance)} />
            <Summary label="Increases" value={money(statement.increases)} />
            <Summary label="Decreases" value={money(statement.decreases)} />
            <Summary
              label="Closing balance"
              value={balanceText(money, statement.closingBalance)}
              hint={accountBalanceLabel(statement.closingBalance)}
            />
          </div>
          <div className={cn(CARD, "overflow-hidden")}>
            {statement.lines.length === 0 ? (
              <p className="px-4 py-8 text-sm text-center text-muted-foreground">
                No account movements in this period. Closing balance equals the opening balance.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-[#FAF8F4] border-b border-[#E8E1D7] text-left text-[11px] font-semibold uppercase tracking-wider text-[#736B5E]">
                    <tr>
                      <th className="px-3.5 py-2.5">Date</th>
                      <th className="px-3.5 py-2.5">Description</th>
                      <th className="px-3.5 py-2.5">Source</th>
                      <th className="px-3.5 py-2.5 text-right">Increase</th>
                      <th className="px-3.5 py-2.5 text-right">Decrease</th>
                      <th className="px-3.5 py-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E1D7]">
                    {visible.map((line) => (
                      <tr key={line.eventId} className="hover:bg-[#FAF8F4]/70 transition-colors">
                        <td className="px-3.5 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {dateTime(line.occurredAt)}
                        </td>
                        <td className="px-3.5 py-2.5">
                          <p className="font-medium text-[#251605]">{line.title}</p>
                          <p className="text-xs text-muted-foreground">{line.description}</p>
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">
                          {line.folioId ? (
                            <Link
                              to="/restaurant/pms/cashiering/folios/$folioId"
                              params={{ folioId: line.folioId }}
                              className="text-[#C89933] hover:underline"
                            >
                              {line.source}
                            </Link>
                          ) : line.documentId ? (
                            <button
                              type="button"
                              className="text-[#C89933] hover:underline"
                              onClick={onViewDocuments}
                            >
                              {line.source}
                            </button>
                          ) : line.eventType === "payment" || line.eventType === "refund" ? (
                            <button
                              type="button"
                              className="text-[#C89933] hover:underline"
                              onClick={onViewPayments}
                            >
                              {line.source ?? line.title}
                            </button>
                          ) : (
                            (line.source ?? "—")
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums text-emerald-700 font-medium">
                          {line.increase != null ? money(line.increase) : ""}
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums text-rose-700 font-medium">
                          {line.decrease != null ? money(line.decrease) : ""}
                        </td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums font-semibold text-[#251605]">
                          {balanceText(money, line.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E1D7] px-3.5 py-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-[#251605]">
                Closing balance: {balanceText(money, statement.closingBalance)} ·{" "}
                {accountBalanceLabel(statement.closingBalance)}
              </span>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Statement page size"
                  value={pageSize}
                  className="h-8 rounded-md border border-[#E8E1D7] bg-white px-2 text-xs font-medium text-[#251605]"
                  onChange={(event) => {
                    setPageSize(Number(event.target.value) as 10 | 25 | 50);
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-[#E8E1D7] text-xs hover:bg-[#FAF8F4]"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="size-3.5 mr-1" /> Previous
                </Button>
                <span className="tabular-nums font-medium text-[#251605]">
                  {page} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-[#E8E1D7] text-xs hover:bg-[#FAF8F4]"
                  disabled={page >= pageCount}
                  onClick={() => setPage(page + 1)}
                >
                  Next <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
      <CashieringPrintLayer active={printing && Boolean(statement?.reconciled)}>
        {statement?.reconciled ? (
          <article
            className="space-y-4 bg-white p-6 text-sm text-[#251605]"
            data-testid="account-statement-print"
          >
            <header>
              <p className="text-xs uppercase tracking-wide">{propertyName}</p>
              {propertyAddress ? <p className="text-xs">{propertyAddress}</p> : null}
              <h1 className="mt-2 text-lg font-semibold">Account statement</h1>
              <p>
                {statement.account.master.name} · {statement.account.accountNumber} ·{" "}
                {statement.account.currency}
              </p>
              {statement.account.accountKind === "company" && statement.account.master.taxId ? (
                <p>TIN {statement.account.master.taxId}</p>
              ) : null}
              {statement.account.master.code ? (
                <p>Profile {statement.account.master.code}</p>
              ) : null}
              <p>
                Period {statement.fromDate} to {statement.toDate}
              </p>
              <p className="text-xs">Generated {generatedAt}</p>
            </header>
            <p>Opening balance {balanceText(money, statement.openingBalance)}</p>
            <style>{`@media print { thead { display: table-header-group; } tr { break-inside: avoid; } }`}</style>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-1">Date</th>
                  <th className="py-1">Description</th>
                  <th className="py-1">Source</th>
                  <th className="py-1 text-right">Increase</th>
                  <th className="py-1 text-right">Decrease</th>
                  <th className="py-1 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line) => (
                  <tr key={line.eventId} className="border-b align-top">
                    <td className="py-1 pr-2">{dateTime(line.occurredAt)}</td>
                    <td className="py-1 pr-2">
                      {line.title}
                      <span className="block text-[10px]">{line.description}</span>
                    </td>
                    <td className="py-1 pr-2">{line.source ?? ""}</td>
                    <td className="py-1 text-right tabular-nums">
                      {line.increase != null ? money(line.increase) : ""}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {line.decrease != null ? money(line.decrease) : ""}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {balanceText(money, line.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {statement.lines.length === 0 ? <p>No account movements in this period.</p> : null}
            <p className="font-medium">
              Closing balance {balanceText(money, statement.closingBalance)} ·{" "}
              {accountBalanceLabel(statement.closingBalance)}
            </p>
          </article>
        ) : null}
      </CashieringPrintLayer>
    </section>
  );
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={cn(CARD, "p-3.5 transition-shadow hover:shadow-md")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#736B5E]">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-[#251605] tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function balanceText(money: (value: number) => string, value: number): string {
  return formatBalance(money, value);
}
