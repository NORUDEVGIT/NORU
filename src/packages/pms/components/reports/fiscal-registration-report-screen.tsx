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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
import { FileSpreadsheet, Search } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  DEFAULT_REPORT_PAGE_SIZE,
  parseReportPage,
  parseReportPageSize,
  reportByCode,
  type ReportPageSize,
  type ReportsRouteSearch,
} from "@/packages/pms/lib/reports-shell";

const FIELD =
  "h-9 w-full rounded-lg border border-[#DDD4C5] bg-white px-3 text-xs text-[#251605] placeholder:text-[#A89F91] focus:border-[#C89933] focus:ring-1 focus:ring-[#C89933] focus:outline-hidden transition-all shadow-2xs";

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
      kpis={
        phase === "ready" && result ? (
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
        ) : null
      }
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
            <Select
              value={documentType}
              onValueChange={(val) =>
                writeFilters({
                  documentType: fiscalReportDocumentType(val),
                  resetPage: true,
                })
              }
            >
              <SelectTrigger className={FIELD} data-testid="fiscal-document-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent className="border-[#DDD4C5] bg-white rounded-xl shadow-xl p-1 z-50">
                <SelectItem value="INV" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  Invoices
                </SelectItem>
                <SelectItem value="CRE" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  Credit Notes
                </SelectItem>
                <SelectItem value="DEB" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  Debit Notes
                </SelectItem>
                <SelectItem value="SR" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  Sales Receipts
                </SelectItem>
                <SelectItem value="ALL" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  All
                </SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Mode">
            <Select
              value={mode}
              onValueChange={(val) =>
                writeFilters({
                  mode: fiscalReportMode(val),
                  resetPage: true,
                })
              }
            >
              <SelectTrigger className={FIELD} data-testid="fiscal-mode">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent className="border-[#DDD4C5] bg-white rounded-xl shadow-xl p-1 z-50">
                <SelectItem value="ALL" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  All
                </SelectItem>
                <SelectItem value="CASH" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  Cash
                </SelectItem>
                <SelectItem value="CREDIT" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  Credit
                </SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Status">
            <Select
              value={status}
              onValueChange={(val) =>
                writeFilters({
                  status: fiscalReportStatus(val),
                  resetPage: true,
                })
              }
            >
              <SelectTrigger className={FIELD} data-testid="fiscal-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent className="border-[#DDD4C5] bg-white rounded-xl shadow-xl p-1 z-50">
                {FISCAL_REPORT_STATUSES.map((token) => (
                  <SelectItem
                    key={token}
                    value={token}
                    className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5"
                  >
                    {token === "ALL" ? "All" : token.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              className="report-print-hide flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DDD4C5] bg-white px-6 py-12 text-center shadow-2xs"
              data-testid="fiscal-empty"
            >
              <div className="grid size-11 place-items-center rounded-full bg-[#FAF3E3] text-[#8A6A24]">
                <FileSpreadsheet className="size-5" />
              </div>
              <h3 className="mt-3 font-display text-sm font-semibold text-[#251605]">{FISCAL_EMPTY_TITLE}</h3>
              <p className="mt-1 max-w-md text-xs text-[#7A7167]">{FISCAL_EMPTY_BODY}</p>
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
                <tbody className="divide-y divide-[#F2ECE3]">
                  {result.rows.map((row) => (
                    <tr
                      key={row.id}
                      data-testid="fiscal-summary-row"
                      data-document-type={row.documentType}
                      data-mode={row.mode ?? ""}
                      className="transition-colors hover:bg-[#FAF8F4]"
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
  if (documentType === "SR") {
    return (
      <>
        <Summary label={`Sales Receipts${currencyLabel}`} value={String(total.salesReceiptCount)} />
        <Summary
          label={`Sales Receipt Amount${currencyLabel}`}
          value={fiscalMoney(total.salesReceiptTotal)}
        />
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
  const isRegistered = status === "REGISTERED";
  const isFailed = status === "FAILED";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        isRegistered
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : isFailed
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-amber-200 bg-amber-50 text-amber-700",
      )}
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
    <div className="flex flex-col justify-between rounded-xl border border-[#DDD4C5] bg-white p-3.5 shadow-2xs transition-all hover:border-[#C89933]/60 hover:shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8A6A24]">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums text-[#251605]">{value}</p>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-44 min-w-36 flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A6A24]">{label}</span>
      {children}
    </div>
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
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#A89F91]" />
        <input
          className={cn(FIELD, "pl-8")}
          data-testid={testId}
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
    </Filter>
  );
}
