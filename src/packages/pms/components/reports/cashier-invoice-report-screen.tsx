import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ReportFilterBar } from "@/packages/pms/components/reports/report-filter-bar";
import { ReportPageShell } from "@/packages/pms/components/reports/report-page-shell";
import {
  ReportTableHeaderCell,
  ReportTableShell,
} from "@/packages/pms/components/reports/report-table-shell";
import { reportCellClass } from "@/packages/pms/components/reports/report-columns";
import {
  exportCashierInvoiceWorkbook,
  getCashierInvoiceReport,
} from "@/packages/pms/lib/cashier-invoice-report.functions";
import {
  CASHIER_AUDIT_BLOCKED_MESSAGE,
  CASHIER_EXCEL_AUDIT_MESSAGE,
  CASHIER_EXCEL_MIME,
  CASHIER_EXCEL_PREPARE_MESSAGE,
  CASHIER_EXCEL_TOO_LARGE_MESSAGE,
  CASHIER_PRINT_PREPARE_MESSAGE,
  cashierDeliveryProblem,
  claimCashierDelivery,
  releaseCashierDeliveryLock,
} from "@/packages/pms/lib/cashier-invoice-export";
import {
  CASHIER_INVOICE_TOO_LARGE_MESSAGE,
  cashierDocumentType,
  cashierReportGrain,
  type CashierDocumentTypeFilter,
  type CashierInvoiceDetailRow,
  type CashierInvoiceReportResult,
  type CashierInvoiceSummaryRow,
  type CashierReportGrain,
} from "@/packages/pms/lib/cashier-invoice-report";
import {
  CASHIER_DETAIL_COLUMNS,
  CASHIER_EMPTY_BODY,
  CASHIER_EMPTY_TITLE,
  CASHIER_PRINT_SUMMARY_COLUMNS,
  CASHIER_SUMMARY_COLUMNS,
  cashierClearedSearch,
  cashierDocumentTypeLabel,
  cashierFilterSearch,
  cashierGeneratedLabel,
  cashierIssuedLabel,
  cashierMoney,
  cashierReportFailure,
  cashierReportRequest,
  cashierTotalsCaption,
  isCashierDetailRow,
  isCashierSummaryRow,
} from "@/packages/pms/lib/cashier-invoice-report-view";
import {
  DEFAULT_REPORT_PAGE_SIZE,
  parseReportPage,
  parseReportPageSize,
  reportByCode,
  type ReportPageSize,
  type ReportsRouteSearch,
} from "@/packages/pms/lib/reports-shell";

const FIELD =
  "h-9 w-full rounded-lg border border-[#E8E1D7] bg-white px-2.5 text-xs text-[#251605] focus:border-[#C89933] focus:outline-hidden";

/**
 * Cashier Invoice Report screen. Rows come only from getCashierInvoiceReport.
 * Print and Excel use the same URL filters with the full export, not the visible page.
 */
export function CashierInvoiceReportScreen({
  restaurantId,
  propertyName,
  businessDate,
  timezone,
  search,
}: {
  restaurantId: string;
  propertyName: string;
  businessDate: string;
  timezone: string;
  search: ReportsRouteSearch;
}) {
  const definition = reportByCode("cashier-invoice");
  const navigate = useNavigate();
  const from = search.from ?? businessDate;
  const to = search.to ?? businessDate;
  const grain = cashierReportGrain(search.grain);
  const documentType = cashierDocumentType(search.documentType);
  const page = parseReportPage(search.page ?? 1);
  const pageSize = parseReportPageSize(search.pageSize ?? DEFAULT_REPORT_PAGE_SIZE);
  const fetchReport = useServerFn(getCashierInvoiceReport);
  const exportWorkbook = useServerFn(exportCashierInvoiceWorkbook);
  const delivery = useRef<{ current: "print" | "excel" | null }>({ current: null });
  const [printState, setPrintState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; problem: "too-large" | "audit" | "prepare" }
    | { kind: "ready"; result: CashierInvoiceReportResult }
  >({ kind: "idle" });
  const [excelState, setExcelState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; problem: "too-large" | "audit" | "prepare" }
  >({ kind: "idle" });

  const writeFilters = useCallback(
    (patch: {
      from?: string;
      to?: string;
      grain?: CashierReportGrain;
      documentType?: CashierDocumentTypeFilter;
      query?: string;
      issuer?: string;
      page?: number;
      pageSize?: ReportPageSize;
      resetPage?: boolean;
    }) => {
      const nextPage = patch.page ?? (patch.resetPage === false ? page : 1);
      void navigate({
        to: "/restaurant/pms/reports",
        search: cashierFilterSearch({
          from: patch.from ?? from,
          to: patch.to ?? to,
          grain: patch.grain ?? grain,
          documentType: patch.documentType ?? documentType,
          query: patch.query !== undefined ? patch.query : search.query,
          issuer: patch.issuer !== undefined ? patch.issuer : search.issuer,
          page: nextPage,
          pageSize: patch.pageSize ?? pageSize,
        }),
      });
    },
    [documentType, from, grain, navigate, page, pageSize, search.issuer, search.query, to],
  );

  const query = useQuery({
    queryKey: [
      "cashier-invoice-report",
      restaurantId,
      from,
      to,
      grain,
      documentType,
      search.query ?? "",
      search.issuer ?? "",
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchReport({
        data: cashierReportRequest({
          restaurantId,
          from,
          to,
          grain,
          documentType,
          query: search.query,
          issuerId: search.issuer,
          page,
          pageSize,
          exportAll: false,
        }),
      }),
    enabled: Boolean(search.from && search.to),
    retry: false,
  });

  useEffect(() => {
    if (printState.kind !== "ready") return;
    const timer = window.setTimeout(() => window.print(), 50);
    const clear = () => {
      releaseCashierDeliveryLock(delivery.current);
      setPrintState({ kind: "idle" });
    };
    window.addEventListener("afterprint", clear);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clear);
    };
  }, [printState]);

  const preparePrint = useCallback(async () => {
    if (!claimCashierDelivery(delivery.current, "print")) return;
    setPrintState({ kind: "loading" });
    setExcelState({ kind: "idle" });
    try {
      const result = await fetchReport({
        data: cashierReportRequest({
          restaurantId,
          from,
          to,
          grain,
          documentType,
          query: search.query,
          issuerId: search.issuer,
          page: 1,
          pageSize,
          exportAll: true,
          action: "print",
        }),
      });
      setPrintState({ kind: "ready", result });
    } catch (error) {
      releaseCashierDeliveryLock(delivery.current);
      setPrintState({ kind: "error", problem: cashierDeliveryProblem(error) });
    }
  }, [
    documentType,
    fetchReport,
    from,
    grain,
    pageSize,
    restaurantId,
    search.issuer,
    search.query,
    to,
  ]);

  const prepareExcel = useCallback(async () => {
    if (!claimCashierDelivery(delivery.current, "excel")) return;
    setExcelState({ kind: "loading" });
    setPrintState({ kind: "idle" });
    try {
      const file = await exportWorkbook({
        data: {
          restaurantId,
          from,
          to,
          grain,
          documentType,
          propertyName,
          ...(search.query ? { query: search.query } : {}),
          ...(search.issuer ? { issuerId: search.issuer } : {}),
        },
      });
      downloadCashierWorkbook(file.fileName, file.base64);
      setExcelState({ kind: "idle" });
    } catch (error) {
      setExcelState({ kind: "error", problem: cashierDeliveryProblem(error) });
    } finally {
      releaseCashierDeliveryLock(delivery.current);
    }
  }, [
    documentType,
    exportWorkbook,
    from,
    grain,
    propertyName,
    restaurantId,
    search.issuer,
    search.query,
    to,
  ]);

  if (!definition || definition.kind !== "row") return null;

  const failure = query.isError ? cashierReportFailure(query.error) : null;
  const phase =
    failure === "access" ? "no-access" : failure ? "error" : query.isPending ? "loading" : "ready";
  const result = query.data;
  const errorMessage = failure === "too-large" ? CASHIER_INVOICE_TOO_LARGE_MESSAGE : undefined;
  const issuers = result?.issuers ?? [];

  return (
    <ReportPageShell
      definition={definition}
      phase={phase}
      businessDate={businessDate}
      timezone={timezone}
      page={page}
      pageSize={pageSize}
      totalRows={result?.total ?? 0}
      capability={{ canView: true, canPrint: true, canExport: true }}
      onPrint={() => void preparePrint()}
      onPdf={() => void preparePrint()}
      onExcel={() => void prepareExcel()}
      onPageChange={(nextPage, nextSize) =>
        writeFilters({ page: nextPage, pageSize: nextSize, resetPage: false })
      }
      {...(failure === "load" || failure === "too-large"
        ? { onRetry: () => void query.refetch(), ...(errorMessage ? { errorMessage } : {}) }
        : {})}
      filters={
        <ReportFilterBar
          onClear={() =>
            void navigate({
              to: "/restaurant/pms/reports",
              search: cashierClearedSearch(businessDate),
            })
          }
        >
          <Filter label="From">
            <input
              type="date"
              className={FIELD}
              data-testid="cashier-from"
              value={from}
              onChange={(event) => writeFilters({ from: event.target.value, resetPage: true })}
            />
          </Filter>
          <Filter label="To">
            <input
              type="date"
              className={FIELD}
              data-testid="cashier-to"
              value={to}
              onChange={(event) => writeFilters({ to: event.target.value, resetPage: true })}
            />
          </Filter>
          <Filter label="Document Type">
            <select
              className={FIELD}
              data-testid="cashier-document-type"
              value={documentType}
              onChange={(event) =>
                writeFilters({
                  documentType: cashierDocumentType(event.target.value),
                  resetPage: true,
                })
              }
            >
              <option value="INV">Invoices</option>
              <option value="CRE">Credit Notes</option>
              <option value="DEB">Debit Notes</option>
              <option value="ALL">All</option>
            </select>
          </Filter>
          <Filter label="View">
            <select
              className={FIELD}
              data-testid="cashier-grain"
              value={grain}
              onChange={(event) =>
                writeFilters({
                  grain: cashierReportGrain(event.target.value),
                  resetPage: true,
                })
              }
            >
              <option value="summary">Summary</option>
              <option value="detail">Detail</option>
            </select>
          </Filter>
          <Filter label="Issued By">
            <select
              className={FIELD}
              data-testid="cashier-issuer"
              value={search.issuer ?? ""}
              onChange={(event) =>
                writeFilters({
                  issuer: event.target.value,
                  resetPage: true,
                })
              }
            >
              <option value="">All issuers</option>
              {issuers.map((issuer) => (
                <option key={issuer.id} value={issuer.id}>
                  {issuer.name}
                </option>
              ))}
            </select>
          </Filter>
          <DraftField
            label="Search"
            testId="cashier-query"
            placeholder="Document no. or party"
            value={search.query ?? ""}
            onCommit={(next) => writeFilters({ query: next, resetPage: true })}
          />
        </ReportFilterBar>
      }
    >
      {phase === "ready" && result ? (
        <div className="space-y-3">
          <div
            className="report-print-hide flex flex-wrap gap-2"
            data-testid="cashier-summary-kpis"
          >
            {result.totals.map((total) => (
              <KpiStrip
                key={total.currency}
                total={total}
                documentType={documentType}
                multiCurrency={result.totals.length > 1}
              />
            ))}
          </div>
          {result.legacyExcludedCount > 0 ? (
            <p
              className="report-print-hide rounded-xl border border-[#E8E1D7] bg-white px-4 py-3 text-xs text-[#7A7167]"
              data-testid="cashier-legacy-note"
            >
              {result.legacyExcludedCount} legacy folio invoice(s) excluded from this register.
            </p>
          ) : null}
          {printState.kind === "loading" ? (
            <p
              className="report-print-hide text-xs text-[#7A7167]"
              data-testid="cashier-print-loading"
            >
              Preparing the full report for printing…
            </p>
          ) : null}
          {excelState.kind === "loading" ? (
            <p
              className="report-print-hide text-xs text-[#7A7167]"
              data-testid="cashier-excel-loading"
            >
              Preparing the Excel workbook…
            </p>
          ) : null}
          {excelState.kind === "error" ? (
            <div
              className="report-print-hide rounded-xl border border-[#E4C7C2] bg-white px-4 py-3 text-xs text-[#251605]"
              data-testid="cashier-excel-error"
              role="alert"
            >
              <p>{excelProblemMessage(excelState.problem)}</p>
              <button
                type="button"
                className="mt-2 inline-flex h-8 items-center rounded-lg border border-[#E8E1D7] bg-white px-3 text-xs font-medium"
                onClick={() => void prepareExcel()}
              >
                Retry
              </button>
            </div>
          ) : null}
          {printState.kind === "error" ? (
            <div
              className="report-print-hide rounded-xl border border-[#E4C7C2] bg-white px-4 py-3 text-xs text-[#251605]"
              data-testid="cashier-print-error"
              role="alert"
            >
              <p>
                {printState.problem === "too-large"
                  ? CASHIER_INVOICE_TOO_LARGE_MESSAGE
                  : printState.problem === "audit"
                    ? CASHIER_AUDIT_BLOCKED_MESSAGE
                    : CASHIER_PRINT_PREPARE_MESSAGE}
              </p>
              <button
                type="button"
                className="mt-2 inline-flex h-8 items-center rounded-lg border border-[#E8E1D7] bg-white px-3 text-xs font-medium"
                onClick={() => void preparePrint()}
              >
                Retry
              </button>
            </div>
          ) : null}
          {result.rows.length === 0 ? (
            <div
              className="report-print-hide rounded-xl border border-[#E8E1D7] bg-white px-5 py-8 shadow-sm"
              data-testid="cashier-empty"
            >
              <h3 className="text-sm font-semibold text-[#251605]">{CASHIER_EMPTY_TITLE}</h3>
              <p className="mt-1 text-sm text-[#7A7167]">{CASHIER_EMPTY_BODY}</p>
            </div>
          ) : grain === "detail" ? (
            <div className="report-print-hide">
              <ReportTableShell label="Cashier invoice detail">
                <thead>
                  <tr>
                    {CASHIER_DETAIL_COLUMNS.map((column) => (
                      <ReportTableHeaderCell key={column}>{column}</ReportTableHeaderCell>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.rows as CashierInvoiceDetailRow[])
                    .filter(isCashierDetailRow)
                    .map((row) => (
                      <tr
                        key={row.id}
                        data-testid="cashier-detail-row"
                        data-document-type={row.documentType}
                        className="border-t border-[#E8E1D7]"
                      >
                        <td className={reportCellClass.text}>{row.documentNumber}</td>
                        <td className={reportCellClass.date}>
                          {cashierIssuedLabel(row.issuedAt, timezone)}
                        </td>
                        <td className={reportCellClass.text}>{row.partyName}</td>
                        <td className={reportCellClass.text}>{row.item}</td>
                        <td className={reportCellClass.numeric}>
                          {row.quantity == null ? "—" : row.quantity}
                        </td>
                        <td className={reportCellClass.currency}>
                          {row.unitAmount == null ? "—" : cashierMoney(row.unitAmount)}
                        </td>
                        <td className={reportCellClass.currency}>
                          {cashierMoney(row.preTaxAmount)}
                        </td>
                        <td className={reportCellClass.currency}>{cashierMoney(row.taxAmount)}</td>
                        <td className={reportCellClass.currency}>
                          {cashierMoney(row.serviceCharge)}
                        </td>
                        <td className={reportCellClass.currency}>{cashierMoney(row.lineTotal)}</td>
                        <td className={reportCellClass.currency}>
                          <NoteAmount
                            amount={row.creditTotal}
                            fiscal={row.creditFiscalStatus}
                            documents={row.creditDocuments}
                          />
                        </td>
                        <td className={reportCellClass.currency}>
                          <NoteAmount
                            amount={row.debitTotal}
                            fiscal={row.debitFiscalStatus}
                            documents={row.debitDocuments}
                          />
                        </td>
                        <td className={reportCellClass.currency}>
                          {row.netTotal == null ? "—" : cashierMoney(row.netTotal)}
                        </td>
                        <td className={reportCellClass.text}>{row.currency}</td>
                        <td className={reportCellClass.text}>
                          <FiscalBadge status={row.fiscalStatus} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </ReportTableShell>
            </div>
          ) : (
            <div className="report-print-hide">
              <ReportTableShell label="Cashier invoice summary">
                <thead>
                  <tr>
                    {CASHIER_SUMMARY_COLUMNS.map((column) => (
                      <ReportTableHeaderCell key={column}>{column}</ReportTableHeaderCell>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(result.rows as CashierInvoiceSummaryRow[])
                    .filter(isCashierSummaryRow)
                    .map((row) => (
                      <tr
                        key={row.id}
                        data-testid="cashier-summary-row"
                        className="border-t border-[#E8E1D7]"
                      >
                        <td className={reportCellClass.text}>{row.documentNumber}</td>
                        <td className={reportCellClass.date}>
                          {cashierIssuedLabel(row.issuedAt, timezone)}
                        </td>
                        <td className={reportCellClass.text}>{row.documentType}</td>
                        <td className={reportCellClass.text}>
                          {row.partyName}
                          <span className="mt-0.5 block text-[11px] text-[#7A7167]">
                            {row.partyType}
                            {row.paymentMethod !== "Unpaid"
                              ? ` · ${row.paymentMethod}`
                              : " · Unpaid"}
                          </span>
                        </td>
                        <td className={reportCellClass.currency}>{cashierMoney(row.subtotal)}</td>
                        <td className={reportCellClass.currency}>{cashierMoney(row.tax)}</td>
                        <td className={reportCellClass.currency}>
                          {cashierMoney(row.serviceCharge)}
                        </td>
                        <td className={reportCellClass.currency}>{cashierMoney(row.grandTotal)}</td>
                        <td className={reportCellClass.currency}>
                          <NoteAmount
                            amount={row.creditTotal}
                            fiscal={row.creditFiscalStatus}
                            documents={row.creditDocuments}
                          />
                        </td>
                        <td className={reportCellClass.currency}>
                          <NoteAmount
                            amount={row.debitTotal}
                            fiscal={row.debitFiscalStatus}
                            documents={row.debitDocuments}
                          />
                        </td>
                        <td className={reportCellClass.currency}>
                          {row.netTotal == null ? "—" : cashierMoney(row.netTotal)}
                        </td>
                        <td className={reportCellClass.text}>{row.currency}</td>
                        <td className={reportCellClass.text}>{row.issuedBy}</td>
                        <td className={reportCellClass.text}>
                          <FiscalBadge status={row.fiscalStatus} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </ReportTableShell>
            </div>
          )}
          {printState.kind === "ready" ? (
            <CashierPrintSheet
              propertyName={propertyName}
              timezone={timezone}
              result={printState.result}
            />
          ) : null}
        </div>
      ) : null}
    </ReportPageShell>
  );
}

function CashierPrintSheet({
  propertyName,
  timezone,
  result,
}: {
  propertyName: string;
  timezone: string;
  result: CashierInvoiceReportResult;
}) {
  const captions = cashierTotalsCaption(result.totals, result.context.documentType);
  return (
    <article className="report-print-only" data-testid="cashier-print-sheet">
      <header className="mb-4">
        <p className="text-sm font-semibold">{propertyName}</p>
        <h1 className="mt-2 text-lg font-semibold">Cashier Invoice Report</h1>
        <p className="mt-1 text-xs">
          Date Range: {result.context.from} → {result.context.to} · Document Type:{" "}
          {cashierDocumentTypeLabel(result.context.documentType)} · View:{" "}
          {result.grain === "detail" ? "Detail" : "Summary"}
        </p>
        <p className="text-xs">
          Generated: {cashierGeneratedLabel(new Date().toISOString(), timezone)}
        </p>
      </header>
      {result.grain === "detail" ? (
        <div className="report-print-table">
          <table>
            <thead>
              <tr>
                {[
                  "Document No.",
                  "Date",
                  "Party",
                  "Item",
                  "Qty",
                  "Unit",
                  "Pre-Tax",
                  "Tax",
                  "Service",
                  "Line Total",
                  "Credit",
                  "Debit",
                  "Net Total",
                  "Fiscal Status",
                ].map((column) => (
                  <th key={column} className="px-2 py-1 text-left text-[10px] font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(result.rows as CashierInvoiceDetailRow[]).map((row) => (
                <tr key={row.id}>
                  <td className="px-2 py-1">{row.documentNumber}</td>
                  <td className="px-2 py-1">{cashierIssuedLabel(row.issuedAt, timezone)}</td>
                  <td className="px-2 py-1">{row.partyName}</td>
                  <td className="px-2 py-1">{row.item}</td>
                  <td className="px-2 py-1">{row.quantity ?? "—"}</td>
                  <td className="px-2 py-1">
                    {row.unitAmount == null ? "—" : cashierMoney(row.unitAmount)}
                  </td>
                  <td className="px-2 py-1">{cashierMoney(row.preTaxAmount)}</td>
                  <td className="px-2 py-1">{cashierMoney(row.taxAmount)}</td>
                  <td className="px-2 py-1">{cashierMoney(row.serviceCharge)}</td>
                  <td className="px-2 py-1">{cashierMoney(row.lineTotal)}</td>
                  <td className="px-2 py-1">{printNoteAmount(row.creditTotal)}</td>
                  <td className="px-2 py-1">{printNoteAmount(row.debitTotal)}</td>
                  <td className="px-2 py-1">
                    {row.netTotal == null ? "—" : cashierMoney(row.netTotal)}
                  </td>
                  <td className="px-2 py-1">{row.fiscalStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="report-print-table">
          <table>
            <thead>
              <tr>
                {CASHIER_PRINT_SUMMARY_COLUMNS.map((column) => (
                  <th key={column} className="px-2 py-1 text-left text-[10px] font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(result.rows as CashierInvoiceSummaryRow[]).map((row) => (
                <tr key={row.id}>
                  <td className="px-2 py-1">{row.documentNumber}</td>
                  <td className="px-2 py-1">{cashierIssuedLabel(row.issuedAt, timezone)}</td>
                  <td className="px-2 py-1">{row.documentType}</td>
                  <td className="px-2 py-1">{row.partyName}</td>
                  <td className="px-2 py-1">{cashierMoney(row.subtotal)}</td>
                  <td className="px-2 py-1">{cashierMoney(row.tax)}</td>
                  <td className="px-2 py-1">{cashierMoney(row.serviceCharge)}</td>
                  <td className="px-2 py-1">{cashierMoney(row.grandTotal)}</td>
                  <td className="px-2 py-1">{printNoteAmount(row.creditTotal)}</td>
                  <td className="px-2 py-1">{printNoteAmount(row.debitTotal)}</td>
                  <td className="px-2 py-1">
                    {row.netTotal == null ? "—" : cashierMoney(row.netTotal)}
                  </td>
                  <td className="px-2 py-1">{row.currency}</td>
                  <td className="px-2 py-1">{row.issuedBy}</td>
                  <td className="px-2 py-1">{row.fiscalStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="mt-4 text-xs">
        <p>Document count: {result.total}</p>
        {captions.map((caption) => (
          <p key={caption}>{caption}</p>
        ))}
        {result.legacyExcludedCount > 0 ? (
          <p>{result.legacyExcludedCount} legacy folio invoice(s) excluded.</p>
        ) : null}
      </footer>
    </article>
  );
}

function KpiStrip({
  total,
  documentType,
  multiCurrency,
}: {
  total: CashierInvoiceReportResult["totals"][number];
  documentType: CashierDocumentTypeFilter;
  multiCurrency: boolean;
}) {
  const currencyLabel = multiCurrency ? ` (${total.currency})` : "";
  if (documentType === "CRE") {
    return (
      <>
        <Summary label={`Credit Notes${currencyLabel}`} value={String(total.creditCount)} />
        <Summary label={`Credit Amount${currencyLabel}`} value={cashierMoney(total.creditTotal)} />
      </>
    );
  }
  if (documentType === "DEB") {
    return (
      <>
        <Summary label={`Debit Notes${currencyLabel}`} value={String(total.debitCount)} />
        <Summary label={`Debit Amount${currencyLabel}`} value={cashierMoney(total.debitTotal)} />
      </>
    );
  }
  if (documentType === "ALL") {
    return (
      <>
        <Summary label={`Invoice Total${currencyLabel}`} value={cashierMoney(total.invoiceTotal)} />
        <Summary label={`Credit Notes${currencyLabel}`} value={cashierMoney(total.creditTotal)} />
        <Summary label={`Debit Notes${currencyLabel}`} value={cashierMoney(total.debitTotal)} />
        <Summary
          label={`Net Documents${currencyLabel}`}
          value={cashierMoney(total.invoiceTotal + total.creditTotal + total.debitTotal)}
        />
      </>
    );
  }
  return (
    <>
      <Summary label={`Documents${currencyLabel}`} value={String(total.documentCount)} />
      <Summary label={`Subtotal${currencyLabel}`} value={cashierMoney(total.subtotal)} />
      <Summary label={`Tax${currencyLabel}`} value={cashierMoney(total.tax)} />
      <Summary label={`Service Charge${currencyLabel}`} value={cashierMoney(total.serviceCharge)} />
      <Summary label={`Grand Total${currencyLabel}`} value={cashierMoney(total.grandTotal)} />
      <Summary
        label={`Net Total${currencyLabel}`}
        value={cashierMoney(total.invoiceTotal + total.creditTotal + total.debitTotal)}
      />
    </>
  );
}

function NoteAmount({
  amount,
  fiscal,
  documents,
}: {
  amount: number | null;
  fiscal: string | null;
  documents: string | null;
}) {
  if (amount == null || amount === 0) {
    return <span data-testid="cashier-note-blank">—</span>;
  }
  return (
    <span data-testid="cashier-note-amount">
      {cashierMoney(amount)}
      {fiscal ? (
        <span className="mt-0.5 block text-[11px] font-normal text-[#7A7167]">{fiscal}</span>
      ) : null}
      {documents ? (
        <span className="mt-0.5 block text-[11px] font-normal text-[#7A7167]">{documents}</span>
      ) : null}
    </span>
  );
}

function printNoteAmount(amount: number | null): string {
  if (amount == null || amount === 0) return "—";
  return cashierMoney(amount);
}

function FiscalBadge({ status }: { status: string }) {
  return (
    <span
      className="inline-flex rounded-md border border-[#E8E1D7] bg-[#FBF8F2] px-1.5 py-0.5 text-[11px] font-medium text-[#251605]"
      data-testid="cashier-fiscal-status"
    >
      {status}
    </span>
  );
}

function excelProblemMessage(problem: "too-large" | "audit" | "prepare"): string {
  if (problem === "too-large") return CASHIER_EXCEL_TOO_LARGE_MESSAGE;
  if (problem === "audit") return CASHIER_EXCEL_AUDIT_MESSAGE;
  return CASHIER_EXCEL_PREPARE_MESSAGE;
}

function downloadCashierWorkbook(fileName: string, base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const safeName = fileName.endsWith(".xlsx") ? fileName : "cashier-invoice-report.xlsx";
  const blob = new Blob([bytes], { type: CASHIER_EXCEL_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E8E1D7] bg-white px-4 py-2 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#7A7167]">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-[#251605]">{value}</p>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex w-40 min-w-36 flex-col gap-1">
      <span className="text-[11px] font-medium text-[#7A7167]">{label}</span>
      {children}
    </label>
  );
}

function DraftField({
  label,
  testId,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  testId: string;
  placeholder: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft.trim() === value.trim()) return;
    const timer = window.setTimeout(() => onCommit(draft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [draft, onCommit, value]);
  return (
    <Filter label={label}>
      <input
        className={FIELD}
        data-testid={testId}
        placeholder={placeholder}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </Filter>
  );
}
