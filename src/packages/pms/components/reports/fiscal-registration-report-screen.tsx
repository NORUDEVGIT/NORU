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
  exportFiscalRegistrationWorkbook,
  getFiscalRegistrationReport,
} from "@/packages/pms/lib/fiscal-registration-report.functions";
import {
  FISCAL_AUDIT_BLOCKED_MESSAGE,
  FISCAL_EXCEL_AUDIT_MESSAGE,
  FISCAL_EXCEL_MIME,
  FISCAL_EXCEL_PREPARE_MESSAGE,
  FISCAL_EXCEL_TOO_LARGE_MESSAGE,
  FISCAL_PRINT_PREPARE_MESSAGE,
  claimFiscalDelivery,
  fiscalDeliveryProblem,
  releaseFiscalDeliveryLock,
} from "@/packages/pms/lib/fiscal-registration-export";
import {
  FISCAL_REGISTRATION_TOO_LARGE_MESSAGE,
  FISCAL_REPORT_STATUSES,
  fiscalReportDocumentType,
  fiscalReportMode,
  fiscalReportStatus,
  type FiscalRegistrationReportResult,
  type FiscalReportDocumentTypeFilter,
  type FiscalReportModeFilter,
  type FiscalReportStatusFilter,
} from "@/packages/pms/lib/fiscal-registration-report";
import {
  FISCAL_EMPTY_BODY,
  FISCAL_EMPTY_TITLE,
  FISCAL_PRINT_COLUMNS,
  FISCAL_SUMMARY_COLUMNS,
  fiscalClearedSearch,
  fiscalDocumentTypeLabel,
  fiscalEventLabel,
  fiscalFilterSearch,
  fiscalGeneratedLabel,
  fiscalMoney,
  fiscalReportFailure,
  fiscalReportRequest,
  fiscalTotalsCaption,
} from "@/packages/pms/lib/fiscal-registration-report-view";
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
 * Fiscal Registration Report screen. Rows come only from getFiscalRegistrationReport.
 * Print and Excel use the same URL filters with the full export, not the visible page.
 */
export function FiscalRegistrationReportScreen({
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
  const definition = reportByCode("fiscal-registration");
  const navigate = useNavigate();
  const from = search.from ?? businessDate;
  const to = search.to ?? businessDate;
  const documentType = fiscalReportDocumentType(search.documentType);
  const mode = fiscalReportMode(search.mode);
  const status = fiscalReportStatus(search.status);
  const page = parseReportPage(search.page ?? 1);
  const pageSize = parseReportPageSize(search.pageSize ?? DEFAULT_REPORT_PAGE_SIZE);
  const fetchReport = useServerFn(getFiscalRegistrationReport);
  const exportWorkbook = useServerFn(exportFiscalRegistrationWorkbook);
  const delivery = useRef<{ current: "print" | "excel" | null }>({ current: null });
  const [printState, setPrintState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; problem: "too-large" | "audit" | "prepare" }
    | { kind: "ready"; result: FiscalRegistrationReportResult }
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
      documentType?: FiscalReportDocumentTypeFilter;
      mode?: FiscalReportModeFilter;
      status?: FiscalReportStatusFilter;
      query?: string;
      page?: number;
      pageSize?: ReportPageSize;
      resetPage?: boolean;
    }) => {
      const nextPage = patch.page ?? (patch.resetPage === false ? page : 1);
      void navigate({
        to: "/restaurant/pms/reports",
        search: fiscalFilterSearch({
          from: patch.from ?? from,
          to: patch.to ?? to,
          documentType: patch.documentType ?? documentType,
          mode: patch.mode ?? mode,
          status: patch.status ?? status,
          query: patch.query !== undefined ? patch.query : search.query,
          page: nextPage,
          pageSize: patch.pageSize ?? pageSize,
        }),
      });
    },
    [documentType, from, mode, navigate, page, pageSize, search.query, status, to],
  );

  const query = useQuery({
    queryKey: [
      "fiscal-registration-report",
      restaurantId,
      from,
      to,
      documentType,
      mode,
      status,
      search.query ?? "",
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchReport({
        data: fiscalReportRequest({
          restaurantId,
          from,
          to,
          documentType,
          mode,
          status,
          query: search.query,
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
      releaseFiscalDeliveryLock(delivery.current);
      setPrintState({ kind: "idle" });
    };
    window.addEventListener("afterprint", clear);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clear);
    };
  }, [printState]);

  const preparePrint = useCallback(async () => {
    if (!claimFiscalDelivery(delivery.current, "print")) return;
    setPrintState({ kind: "loading" });
    setExcelState({ kind: "idle" });
    try {
      const result = await fetchReport({
        data: fiscalReportRequest({
          restaurantId,
          from,
          to,
          documentType,
          mode,
          status,
          query: search.query,
          page: 1,
          pageSize,
          exportAll: true,
          action: "print",
        }),
      });
      setPrintState({ kind: "ready", result });
    } catch (error) {
      releaseFiscalDeliveryLock(delivery.current);
      setPrintState({ kind: "error", problem: fiscalDeliveryProblem(error) });
    }
  }, [documentType, fetchReport, from, mode, pageSize, restaurantId, search.query, status, to]);

  const prepareExcel = useCallback(async () => {
    if (!claimFiscalDelivery(delivery.current, "excel")) return;
    setExcelState({ kind: "loading" });
    setPrintState({ kind: "idle" });
    try {
      const file = await exportWorkbook({
        data: {
          restaurantId,
          from,
          to,
          documentType,
          mode,
          status,
          propertyName,
          ...(search.query ? { query: search.query } : {}),
        },
      });
      downloadFiscalWorkbook(file.fileName, file.base64);
      setExcelState({ kind: "idle" });
    } catch (error) {
      setExcelState({ kind: "error", problem: fiscalDeliveryProblem(error) });
    } finally {
      releaseFiscalDeliveryLock(delivery.current);
    }
  }, [
    documentType,
    exportWorkbook,
    from,
    mode,
    propertyName,
    restaurantId,
    search.query,
    status,
    to,
  ]);

  if (!definition || definition.kind !== "row") return null;

  const failure = query.isError ? fiscalReportFailure(query.error) : null;
  const phase =
    failure === "access" ? "no-access" : failure ? "error" : query.isPending ? "loading" : "ready";
  const result = query.data;
  const errorMessage = failure === "too-large" ? FISCAL_REGISTRATION_TOO_LARGE_MESSAGE : undefined;

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
              search: fiscalClearedSearch(businessDate),
            })
          }
        >
          <Filter label="From">
            <input
              type="date"
              className={FIELD}
              data-testid="fiscal-from"
              value={from}
              onChange={(event) => writeFilters({ from: event.target.value, resetPage: true })}
            />
          </Filter>
          <Filter label="To">
            <input
              type="date"
              className={FIELD}
              data-testid="fiscal-to"
              value={to}
              onChange={(event) => writeFilters({ to: event.target.value, resetPage: true })}
            />
          </Filter>
          <Filter label="Document Type">
            <select
              className={FIELD}
              data-testid="fiscal-document-type"
              value={documentType}
              onChange={(event) =>
                writeFilters({
                  documentType: fiscalReportDocumentType(event.target.value),
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
          <Filter label="Mode">
            <select
              className={FIELD}
              data-testid="fiscal-mode"
              value={mode}
              onChange={(event) =>
                writeFilters({
                  mode: fiscalReportMode(event.target.value),
                  resetPage: true,
                })
              }
            >
              <option value="ALL">All</option>
              <option value="CASH">Cash</option>
              <option value="CREDIT">Credit</option>
            </select>
          </Filter>
          <Filter label="Status">
            <select
              className={FIELD}
              data-testid="fiscal-status"
              value={status}
              onChange={(event) =>
                writeFilters({
                  status: fiscalReportStatus(event.target.value),
                  resetPage: true,
                })
              }
            >
              {FISCAL_REPORT_STATUSES.map((token) => (
                <option key={token} value={token}>
                  {token === "ALL" ? "All" : token.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Filter>
          <DraftField
            label="Search"
            testId="fiscal-query"
            placeholder="Fiscal doc no., party, IRN, RRN"
            value={search.query ?? ""}
            onCommit={(next) => writeFilters({ query: next, resetPage: true })}
          />
        </ReportFilterBar>
      }
    >
      {phase === "ready" && result ? (
        <div className="space-y-3">
          <div className="report-print-hide flex flex-wrap gap-2" data-testid="fiscal-summary-kpis">
            {result.totals.map((total) => (
              <KpiStrip
                key={total.currency}
                total={total}
                documentType={documentType}
                multiCurrency={result.totals.length > 1}
              />
            ))}
          </div>
          {printState.kind === "loading" ? (
            <p
              className="report-print-hide text-xs text-[#7A7167]"
              data-testid="fiscal-print-loading"
            >
              Preparing the full report for printing…
            </p>
          ) : null}
          {excelState.kind === "loading" ? (
            <p
              className="report-print-hide text-xs text-[#7A7167]"
              data-testid="fiscal-excel-loading"
            >
              Preparing the Excel workbook…
            </p>
          ) : null}
          {excelState.kind === "error" ? (
            <div
              className="report-print-hide rounded-xl border border-[#E4C7C2] bg-white px-4 py-3 text-xs text-[#251605]"
              data-testid="fiscal-excel-error"
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
              data-testid="fiscal-print-error"
              role="alert"
            >
              <p>
                {printState.problem === "too-large"
                  ? FISCAL_REGISTRATION_TOO_LARGE_MESSAGE
                  : printState.problem === "audit"
                    ? FISCAL_AUDIT_BLOCKED_MESSAGE
                    : FISCAL_PRINT_PREPARE_MESSAGE}
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
              data-testid="fiscal-empty"
            >
              <h3 className="text-sm font-semibold text-[#251605]">{FISCAL_EMPTY_TITLE}</h3>
              <p className="mt-1 text-sm text-[#7A7167]">{FISCAL_EMPTY_BODY}</p>
            </div>
          ) : (
            <div className="report-print-hide">
              <ReportTableShell label="Fiscal registration summary">
                <thead>
                  <tr>
                    {FISCAL_SUMMARY_COLUMNS.map((column) => (
                      <ReportTableHeaderCell key={column}>{column}</ReportTableHeaderCell>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr
                      key={row.id}
                      data-testid="fiscal-summary-row"
                      data-document-type={row.documentType}
                      data-mode={row.mode ?? ""}
                      className="border-t border-[#E8E1D7]"
                    >
                      <td className={reportCellClass.text}>
                        {row.fiscalDocumentNumber}
                        {row.internalDocumentNumber ? (
                          <span className="mt-0.5 block text-[11px] text-[#7A7167]">
                            Internal {row.internalDocumentNumber}
                          </span>
                        ) : null}
                      </td>
                      <td className={reportCellClass.date}>
                        {fiscalEventLabel(row.eventAt, timezone)}
                      </td>
                      <td className={reportCellClass.text}>{row.partyName}</td>
                      <td className={reportCellClass.text}>{row.mode ?? "—"}</td>
                      <td className={reportCellClass.text}>
                        <StatusBadge status={row.fiscalStatus} />
                      </td>
                      <td className={reportCellClass.currency}>{fiscalMoney(row.invoiceTotal)}</td>
                      <td className={reportCellClass.currency}>
                        <SalesReceiptCell
                          mode={row.mode}
                          amount={row.salesReceiptTotal}
                          number={row.salesReceiptNumber}
                          status={row.salesReceiptStatus}
                        />
                      </td>
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
                        {row.netTotal == null ? "—" : fiscalMoney(row.netTotal)}
                      </td>
                      <td className={reportCellClass.text}>{row.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </ReportTableShell>
            </div>
          )}
          {printState.kind === "ready" ? (
            <FiscalPrintSheet
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

function FiscalPrintSheet({
  propertyName,
  timezone,
  result,
}: {
  propertyName: string;
  timezone: string;
  result: FiscalRegistrationReportResult;
}) {
  const captions = fiscalTotalsCaption(result.totals, result.context.documentType);
  return (
    <article className="report-print-only" data-testid="fiscal-print-sheet">
      <header className="mb-4">
        <p className="text-sm font-semibold">{propertyName}</p>
        <h1 className="mt-2 text-lg font-semibold">Fiscal Registration Report</h1>
        <p className="mt-1 text-xs">
          Date Range: {result.context.from} → {result.context.to} · Document Type:{" "}
          {fiscalDocumentTypeLabel(result.context.documentType)} · Mode: {result.context.mode} ·
          Status: {result.context.status}
        </p>
        <p className="text-xs">
          Generated: {fiscalGeneratedLabel(new Date().toISOString(), timezone)}
        </p>
      </header>
      <div className="report-print-table">
        <table>
          <thead>
            <tr>
              {FISCAL_PRINT_COLUMNS.map((column) => (
                <th key={column} className="px-2 py-1 text-left text-[10px] font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.id}>
                <td className="px-2 py-1">{row.fiscalDocumentNumber}</td>
                <td className="px-2 py-1">{fiscalEventLabel(row.eventAt, timezone)}</td>
                <td className="px-2 py-1">{row.documentType}</td>
                <td className="px-2 py-1">{row.partyName}</td>
                <td className="px-2 py-1">{row.mode ?? "—"}</td>
                <td className="px-2 py-1">{row.fiscalStatus}</td>
                <td className="px-2 py-1">{fiscalMoney(row.invoiceTotal)}</td>
                <td className="px-2 py-1">{printNoteAmount(row.salesReceiptTotal)}</td>
                <td className="px-2 py-1">{printNoteAmount(row.creditTotal)}</td>
                <td className="px-2 py-1">{printNoteAmount(row.debitTotal)}</td>
                <td className="px-2 py-1">
                  {row.netTotal == null ? "—" : fiscalMoney(row.netTotal)}
                </td>
                <td className="px-2 py-1">{row.currency}</td>
                <td className="px-2 py-1">{row.externalIrn ?? "—"}</td>
                <td className="px-2 py-1">{row.externalRrn ?? "—"}</td>
                <td className="px-2 py-1">{row.internalDocumentNumber ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="mt-4 text-xs">
        <p>Row count: {result.total}</p>
        {captions.map((caption) => (
          <p key={caption}>{caption}</p>
        ))}
      </footer>
    </article>
  );
}

function KpiStrip({
  total,
  documentType,
  multiCurrency,
}: {
  total: FiscalRegistrationReportResult["totals"][number];
  documentType: FiscalReportDocumentTypeFilter;
  multiCurrency: boolean;
}) {
  const currencyLabel = multiCurrency ? ` (${total.currency})` : "";
  if (documentType === "CRE") {
    return (
      <>
        <Summary label={`Credit Notes${currencyLabel}`} value={String(total.creditCount)} />
        <Summary label={`Credit Amount${currencyLabel}`} value={fiscalMoney(total.creditTotal)} />
      </>
    );
  }
  if (documentType === "DEB") {
    return (
      <>
        <Summary label={`Debit Notes${currencyLabel}`} value={String(total.debitCount)} />
        <Summary label={`Debit Amount${currencyLabel}`} value={fiscalMoney(total.debitTotal)} />
      </>
    );
  }
  return (
    <>
      <Summary label={`Invoices${currencyLabel}`} value={String(total.invoiceCount)} />
      <Summary label={`Invoice Total${currencyLabel}`} value={fiscalMoney(total.invoiceTotal)} />
      <Summary label={`Credit${currencyLabel}`} value={fiscalMoney(total.creditTotal)} />
      <Summary label={`Debit${currencyLabel}`} value={fiscalMoney(total.debitTotal)} />
      <Summary
        label={`Net Total${currencyLabel}`}
        value={fiscalMoney(total.invoiceTotal + total.creditTotal + total.debitTotal)}
      />
      <Summary
        label={`Sales Receipts${currencyLabel}`}
        value={fiscalMoney(total.salesReceiptTotal)}
      />
      <Summary label={`Registered${currencyLabel}`} value={String(total.registeredCount)} />
    </>
  );
}

function SalesReceiptCell({
  mode,
  amount,
  number,
  status,
}: {
  mode: string | null;
  amount: number | null;
  number: string | null;
  status: string | null;
}) {
  if (mode === "CASH" || !number) {
    return <span data-testid="fiscal-sr-na">—</span>;
  }
  return (
    <span data-testid="fiscal-sr-value">
      {amount ? fiscalMoney(amount) : "—"}
      {status ? (
        <span className="mt-0.5 block text-[11px] font-normal text-[#7A7167]">{status}</span>
      ) : null}
      <span className="mt-0.5 block text-[11px] font-normal text-[#7A7167]">{number}</span>
    </span>
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
    return <span data-testid="fiscal-note-blank">—</span>;
  }
  return (
    <span data-testid="fiscal-note-amount">
      {fiscalMoney(amount)}
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
  return fiscalMoney(amount);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className="inline-flex rounded-md border border-[#E8E1D7] bg-[#FBF8F2] px-1.5 py-0.5 text-[11px] font-medium text-[#251605]"
      data-testid="fiscal-status-badge"
    >
      {status}
    </span>
  );
}

function excelProblemMessage(problem: "too-large" | "audit" | "prepare"): string {
  if (problem === "too-large") return FISCAL_EXCEL_TOO_LARGE_MESSAGE;
  if (problem === "audit") return FISCAL_EXCEL_AUDIT_MESSAGE;
  return FISCAL_EXCEL_PREPARE_MESSAGE;
}

function downloadFiscalWorkbook(fileName: string, base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const safeName = fileName.endsWith(".xlsx") ? fileName : "fiscal-registration-report.xlsx";
  const blob = new Blob([bytes], { type: FISCAL_EXCEL_MIME });
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
