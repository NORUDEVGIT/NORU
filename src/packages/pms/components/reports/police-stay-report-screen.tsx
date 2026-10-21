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
  exportPoliceStayWorkbook,
  getPoliceStayReport,
} from "@/packages/pms/lib/police-stay-report.functions";
import {
  claimPoliceDelivery,
  policeDeliveryProblem,
  POLICE_AUDIT_BLOCKED_MESSAGE,
  POLICE_EXCEL_AUDIT_MESSAGE,
  POLICE_EXCEL_MIME,
  POLICE_EXCEL_PREPARE_MESSAGE,
  POLICE_EXCEL_TOO_LARGE_MESSAGE,
  POLICE_PRINT_PREPARE_MESSAGE,
  releasePoliceDeliveryLock,
} from "@/packages/pms/lib/police-stay-export";
import type { PoliceStayReportResult } from "@/packages/pms/lib/police-stay-report";
import {
  POLICE_EMPTY_BODY,
  POLICE_EMPTY_TITLE,
  POLICE_HISTORICAL_NOTE,
  POLICE_PRINT_COLUMNS,
  POLICE_PRINT_SHOW_ROOM,
  policeBlank,
  policeClearedSearch,
  policeFilterSearch,
  policeFilterSummary,
  policeGeneratedLabel,
  policePresence,
  policePresenceLabel,
  policePrintCells,
  policePrintIdentity,
  policePrintUnnamedWarning,
  policeReportFailure,
  policeReportRequest,
  policeRowNumber,
  policeScreenIdentity,
  policeStayDateLabel,
  policeUnnamedWarning,
} from "@/packages/pms/lib/police-stay-report-view";
import { POLICE_STAY_TOO_LARGE_MESSAGE } from "@/packages/pms/lib/police-stay-report";
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
 * Police / Guest Stay screen. Rows come only from getPoliceStayReport.
 * Print and Excel use the same URL filters with the full export, not the visible page.
 * The screen table keeps identity numbers masked.
 */
export function PoliceStayReportScreen({
  restaurantId,
  propertyName,
  propertyDetail,
  businessDate,
  timezone,
  search,
}: {
  restaurantId: string;
  propertyName: string;
  propertyDetail: string | null;
  businessDate: string;
  timezone: string;
  search: ReportsRouteSearch;
}) {
  const definition = reportByCode("police");
  const navigate = useNavigate();
  const stayDate = search.stayDate ?? businessDate;
  const presence = policePresence(search.presence);
  const page = parseReportPage(search.page ?? 1);
  const pageSize = parseReportPageSize(search.pageSize ?? DEFAULT_REPORT_PAGE_SIZE);
  const fetchReport = useServerFn(getPoliceStayReport);
  const exportWorkbook = useServerFn(exportPoliceStayWorkbook);
  const delivery = useRef<{ current: "print" | "excel" | null }>({ current: null });
  const [printState, setPrintState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; problem: "too-large" | "audit" | "prepare" }
    | { kind: "ready"; result: PoliceStayReportResult }
  >({ kind: "idle" });
  const [excelState, setExcelState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; problem: "too-large" | "audit" | "prepare" }
  >({ kind: "idle" });

  const writeFilters = useCallback(
    (patch: {
      stayDate?: string;
      presence?: typeof presence;
      name?: string;
      nationality?: string;
      room?: string;
      page?: number;
      pageSize?: ReportPageSize;
      resetPage?: boolean;
    }) => {
      const nextPage = patch.page ?? (patch.resetPage === false ? page : 1);
      void navigate({
        to: "/restaurant/pms/reports",
        search: policeFilterSearch({
          stayDate: patch.stayDate ?? stayDate,
          presence: patch.presence ?? presence,
          name: patch.name !== undefined ? patch.name : search.name,
          nationality: patch.nationality !== undefined ? patch.nationality : search.nationality,
          room: patch.room !== undefined ? patch.room : search.room,
          page: nextPage,
          pageSize: patch.pageSize ?? pageSize,
        }),
      });
    },
    [navigate, page, pageSize, presence, search.name, search.nationality, search.room, stayDate],
  );

  const query = useQuery({
    queryKey: [
      "police-stay-report",
      restaurantId,
      search.stayDate ?? "",
      presence,
      search.name ?? "",
      search.nationality ?? "",
      search.room ?? "",
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchReport({
        data: policeReportRequest({
          restaurantId,
          stayDate,
          presence,
          name: search.name,
          nationality: search.nationality,
          room: search.room,
          page,
          pageSize,
          exportAll: false,
        }),
      }),
    enabled: Boolean(search.stayDate),
    retry: false,
  });

  useEffect(() => {
    if (printState.kind !== "ready") return;
    const timer = window.setTimeout(() => window.print(), 50);
    const clear = () => {
      releasePoliceDeliveryLock(delivery.current);
      setPrintState({ kind: "idle" });
    };
    window.addEventListener("afterprint", clear);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clear);
    };
  }, [printState]);

  const preparePrint = useCallback(async () => {
    if (!claimPoliceDelivery(delivery.current, "print")) return;
    setPrintState({ kind: "loading" });
    setExcelState({ kind: "idle" });
    try {
      const result = await fetchReport({
        data: policeReportRequest({
          restaurantId,
          stayDate,
          presence,
          name: search.name,
          nationality: search.nationality,
          room: search.room,
          page: 1,
          pageSize,
          exportAll: true,
          action: "print",
        }),
      });
      setPrintState({ kind: "ready", result });
    } catch (error) {
      releasePoliceDeliveryLock(delivery.current);
      setPrintState({ kind: "error", problem: policeDeliveryProblem(error) });
    }
  }, [
    fetchReport,
    pageSize,
    presence,
    restaurantId,
    search.name,
    search.nationality,
    search.room,
    stayDate,
  ]);

  const prepareExcel = useCallback(async () => {
    if (!claimPoliceDelivery(delivery.current, "excel")) return;
    setExcelState({ kind: "loading" });
    setPrintState({ kind: "idle" });
    try {
      const file = await exportWorkbook({
        data: {
          restaurantId,
          stayDate,
          presence,
          propertyName,
          ...(search.name ? { name: search.name } : {}),
          ...(search.nationality ? { nationality: search.nationality } : {}),
          ...(search.room ? { room: search.room } : {}),
        },
      });
      downloadPoliceWorkbook(file.fileName, file.base64);
      setExcelState({ kind: "idle" });
    } catch (error) {
      setExcelState({ kind: "error", problem: policeDeliveryProblem(error) });
    } finally {
      releasePoliceDeliveryLock(delivery.current);
    }
  }, [
    exportWorkbook,
    presence,
    propertyName,
    restaurantId,
    search.name,
    search.nationality,
    search.room,
    stayDate,
  ]);

  if (!definition || definition.kind !== "row") return null;

  const failure = query.isError ? policeReportFailure(query.error) : null;
  const phase =
    failure === "access" ? "no-access" : failure ? "error" : query.isPending ? "loading" : "ready";
  const result = query.data;
  const unnamed = result?.summary.unnamedOccupantCount ?? 0;
  const warning = policeUnnamedWarning(unnamed);
  const errorMessage = failure === "too-large" ? POLICE_STAY_TOO_LARGE_MESSAGE : undefined;

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
              search: policeClearedSearch(businessDate),
            })
          }
        >
          <Filter label="Stay date">
            <input
              type="date"
              className={FIELD}
              data-testid="police-stay-date"
              value={stayDate}
              onChange={(event) => writeFilters({ stayDate: event.target.value, resetPage: true })}
            />
          </Filter>
          <Filter
            label="Presence"
            hint={
              presence === "HISTORICAL"
                ? "Completed and checked-in stays overlapping this date"
                : "Guests currently checked in for the selected stay date"
            }
          >
            <select
              className={FIELD}
              data-testid="police-presence"
              value={presence}
              onChange={(event) =>
                writeFilters({
                  presence: event.target.value === "HISTORICAL" ? "HISTORICAL" : "IN_HOUSE",
                  resetPage: true,
                })
              }
            >
              <option value="IN_HOUSE">In House</option>
              <option value="HISTORICAL">Historical</option>
            </select>
          </Filter>
          <DraftField
            label="Guest"
            testId="police-guest-name"
            placeholder="Search guest name"
            value={search.name ?? ""}
            onCommit={(name) => writeFilters({ name, resetPage: true })}
          />
          <DraftField
            label="Nationality"
            testId="police-nationality"
            placeholder="Nationality"
            value={search.nationality ?? ""}
            onCommit={(nationality) => writeFilters({ nationality, resetPage: true })}
          />
          <DraftField
            label="Room"
            testId="police-room"
            placeholder="Room number"
            value={search.room ?? ""}
            onCommit={(room) => writeFilters({ room, resetPage: true })}
          />
        </ReportFilterBar>
      }
    >
      {phase === "ready" && result ? (
        <div className="space-y-3">
          <div className="report-print-hide flex flex-wrap gap-2" data-testid="police-summary">
            <Summary
              label="Named Guests"
              value={result.summary.namedGuestCount}
              testId="police-named-count"
            />
            <Summary label="Unnamed Occupancy" value={unnamed} testId="police-unnamed-count" />
          </div>
          {presence === "HISTORICAL" ? (
            <p
              className="report-print-hide rounded-xl border border-[#E8E1D7] bg-white px-4 py-3 text-xs text-[#7A7167]"
              data-testid="police-historical-note"
            >
              {POLICE_HISTORICAL_NOTE}
            </p>
          ) : null}
          {warning ? (
            <p
              className="report-print-hide rounded-xl border border-[#E7D7A8] bg-[#FBF6EA] px-4 py-3 text-xs text-[#251605]"
              data-testid="police-unnamed-warning"
            >
              {warning} This report prints identified named occupants only.
            </p>
          ) : null}
          {printState.kind === "loading" ? (
            <p
              className="report-print-hide text-xs text-[#7A7167]"
              data-testid="police-print-loading"
            >
              Preparing the full report for printing…
            </p>
          ) : null}
          {excelState.kind === "loading" ? (
            <p
              className="report-print-hide text-xs text-[#7A7167]"
              data-testid="police-excel-loading"
            >
              Preparing the Excel workbook…
            </p>
          ) : null}
          {excelState.kind === "error" ? (
            <div
              className="report-print-hide rounded-xl border border-[#E4C7C2] bg-white px-4 py-3 text-xs text-[#251605]"
              data-testid="police-excel-error"
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
              data-testid="police-print-error"
              role="alert"
            >
              <p>
                {printState.problem === "too-large"
                  ? POLICE_STAY_TOO_LARGE_MESSAGE
                  : printState.problem === "audit"
                    ? POLICE_AUDIT_BLOCKED_MESSAGE
                    : POLICE_PRINT_PREPARE_MESSAGE}
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
              data-testid="police-empty"
            >
              <h3 className="text-sm font-semibold text-[#251605]">{POLICE_EMPTY_TITLE}</h3>
              <p className="mt-1 text-sm text-[#7A7167]">{POLICE_EMPTY_BODY}</p>
            </div>
          ) : (
            <div className="report-print-hide">
              <ReportTableShell label="Police guest stay report">
                <thead>
                  <tr>
                    {[
                      "No.",
                      "Room",
                      "Guest Name",
                      "Phone Number",
                      "Nationality",
                      "Email",
                      "Check-In",
                      "Check-Out",
                      "Passport / National ID",
                    ].map((column) => (
                      <ReportTableHeaderCell key={column}>{column}</ReportTableHeaderCell>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr
                      key={`${row.reservationRoomId}-${row.guestProfileId}`}
                      data-testid="police-row"
                      className="border-t border-[#E8E1D7]"
                    >
                      <td className={reportCellClass.numeric}>
                        {policeRowNumber(result.page, result.pageSize, index)}
                      </td>
                      <td className={reportCellClass.text} data-testid="police-screen-room">
                        {policeBlank(row.roomNumber)}
                      </td>
                      <td className={reportCellClass.text}>{policeBlank(row.guestName)}</td>
                      <td className={reportCellClass.text}>{policeBlank(row.phone)}</td>
                      <td className={reportCellClass.text}>{policeBlank(row.nationality)}</td>
                      <td className={reportCellClass.text}>{policeBlank(row.email)}</td>
                      <td className={reportCellClass.date}>
                        {policeStayDateLabel(row.checkInDate)}
                      </td>
                      <td className={reportCellClass.date}>
                        {policeStayDateLabel(row.checkOutDate)}
                      </td>
                      <td className={reportCellClass.text}>
                        <span>{policeScreenIdentity(row.idDocumentNumber)}</span>
                        {row.idDocumentType ? (
                          <span className="mt-0.5 block text-[11px] text-[#7A7167]">
                            {row.idDocumentType}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ReportTableShell>
            </div>
          )}
          {printState.kind === "ready" ? (
            <PolicePrintSheet
              propertyName={propertyName}
              propertyDetail={propertyDetail}
              timezone={timezone}
              presence={presence}
              stayDate={stayDate}
              filterSummary={policeFilterSummary({
                name: search.name,
                nationality: search.nationality,
                room: search.room,
              })}
              result={printState.result}
            />
          ) : null}
        </div>
      ) : null}
    </ReportPageShell>
  );
}

function PolicePrintSheet({
  propertyName,
  propertyDetail,
  timezone,
  presence,
  stayDate,
  filterSummary,
  result,
}: {
  propertyName: string;
  propertyDetail: string | null;
  timezone: string;
  presence: "IN_HOUSE" | "HISTORICAL";
  stayDate: string;
  filterSummary: string | null;
  result: PoliceStayReportResult;
}) {
  const warning = policePrintUnnamedWarning(result.summary.unnamedOccupantCount);
  return (
    <article className="report-print-only" data-testid="police-print-sheet">
      <header className="mb-4">
        <p className="text-sm font-semibold">{propertyName}</p>
        {propertyDetail ? <p className="text-xs">{propertyDetail}</p> : null}
        <h1 className="mt-2 text-lg font-semibold">Police / Guest Stay Report</h1>
        <p className="mt-1 text-xs">
          {presence === "HISTORICAL" ? "Historical Stay Register" : "Stay register"} · Stay Date:{" "}
          {policeStayDateLabel(stayDate)} · Presence: {policePresenceLabel(presence)}
        </p>
        <p className="text-xs">
          Generated: {policeGeneratedLabel(new Date().toISOString(), timezone)}
        </p>
        {filterSummary ? <p className="text-xs">{filterSummary}</p> : null}
        {presence === "HISTORICAL" ? (
          <p className="mt-2 text-xs">{POLICE_HISTORICAL_NOTE}</p>
        ) : null}
      </header>
      <div className="report-print-table">
        <table>
          <thead>
            <tr>
              {POLICE_PRINT_COLUMNS.map((column) => (
                <th key={column} className="px-2 py-1 text-left text-[10px] font-semibold">
                  {column}
                </th>
              ))}
              {POLICE_PRINT_SHOW_ROOM ? (
                <th className="px-2 py-1 text-left text-[10px]">Room</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => {
              const cells = policePrintCells(row);
              return (
                <tr key={`${row.reservationRoomId}-${row.guestProfileId}`}>
                  <td className="px-2 py-1">
                    {policeRowNumber(1, result.rows.length || 1, index)}
                  </td>
                  <td className="px-2 py-1">{cells.guestName}</td>
                  <td className="px-2 py-1">{cells.phone}</td>
                  <td className="px-2 py-1">{cells.nationality}</td>
                  <td className="px-2 py-1">{cells.email}</td>
                  <td className="px-2 py-1">{cells.checkIn}</td>
                  <td className="px-2 py-1">{cells.checkOut}</td>
                  <td className="px-2 py-1">{policePrintIdentity(row.idDocumentNumber)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="mt-4 text-xs">
        <p>Named Guests: {result.summary.namedGuestCount}</p>
        {warning ? <p>{warning}</p> : null}
      </footer>
    </article>
  );
}

function excelProblemMessage(problem: "too-large" | "audit" | "prepare"): string {
  if (problem === "too-large") return POLICE_EXCEL_TOO_LARGE_MESSAGE;
  if (problem === "audit") return POLICE_EXCEL_AUDIT_MESSAGE;
  return POLICE_EXCEL_PREPARE_MESSAGE;
}

function downloadPoliceWorkbook(fileName: string, base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const safeName = fileName.endsWith(".xlsx") ? fileName : "police-guest-stay-report.xlsx";
  const blob = new Blob([bytes], { type: POLICE_EXCEL_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Summary({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div
      className="rounded-xl border border-[#E8E1D7] bg-white px-4 py-2 shadow-sm"
      data-testid={testId}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#7A7167]">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-[#251605]">{value}</p>
    </div>
  );
}

function Filter({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex w-40 min-w-36 flex-col gap-1">
      <span className="text-[11px] font-medium text-[#7A7167]">{label}</span>
      {children}
      {hint ? <span className="text-[10px] leading-snug text-[#7A7167]">{hint}</span> : null}
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
