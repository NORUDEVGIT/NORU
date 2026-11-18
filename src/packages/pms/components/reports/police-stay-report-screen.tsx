import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FolioDateRange } from "@/packages/pms/components/cashiering/folio-workspace-chrome";
import { PmsFilterChoiceRow, PmsFilterMenu } from "@/packages/pms/components/pms-filter-menu";
import { ReportFilterDate, ReportToolbarSearch } from "@/packages/pms/components/reports/report-filter-bar";
import { ReportPageShell } from "@/packages/pms/components/reports/report-page-shell";
import {
  ReportTableHeaderCell,
  ReportTableShell,
} from "@/packages/pms/components/reports/report-table-shell";
import { reportCellClass } from "@/packages/pms/components/reports/report-columns";
import { cn } from "@/shared/lib/utils";
import { ISO_COUNTRIES } from "@/packages/pms/lib/pms-geography";
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
import { Users } from "lucide-react";
import {
  DEFAULT_REPORT_PAGE_SIZE,
  parseReportPage,
  parseReportPageSize,
  reportByCode,
  type ReportPageSize,
  type ReportsRouteSearch,
} from "@/packages/pms/lib/reports-shell";

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
      from?: string | null;
      to?: string | null;
      presence?: typeof presence;
      name?: string;
      nationality?: string;
      room?: string;
      page?: number;
      pageSize?: ReportPageSize;
      resetPage?: boolean;
    }) => {
      const nextPage = patch.page ?? (patch.resetPage === false ? page : 1);
      const stayChanged = patch.stayDate !== undefined && patch.stayDate !== stayDate;
      const nextFrom = stayChanged
        ? undefined
        : patch.from === null
          ? undefined
          : patch.from !== undefined
            ? patch.from
            : search.from;
      const nextTo = stayChanged
        ? undefined
        : patch.to === null
          ? undefined
          : patch.to !== undefined
            ? patch.to
            : search.to;
      void navigate({
        to: "/restaurant/pms/reports",
        search: policeFilterSearch({
          stayDate: patch.stayDate ?? stayDate,
          from: nextFrom,
          to: nextTo,
          presence: patch.presence ?? presence,
          name: patch.name !== undefined ? patch.name : search.name,
          nationality: patch.nationality !== undefined ? patch.nationality : search.nationality,
          room: patch.room !== undefined ? patch.room : search.room,
          page: nextPage,
          pageSize: patch.pageSize ?? pageSize,
        }),
      });
    },
    [
      navigate,
      page,
      pageSize,
      presence,
      search.from,
      search.name,
      search.nationality,
      search.room,
      search.to,
      stayDate,
    ],
  );

  const query = useQuery({
    queryKey: [
      "police-stay-report",
      restaurantId,
      search.stayDate ?? "",
      search.from ?? "",
      search.to ?? "",
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
          from: search.from,
          to: search.to,
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
          from: search.from,
          to: search.to,
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
    search.from,
    search.name,
    search.nationality,
    search.room,
    search.to,
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
          ...(search.from ? { from: search.from } : {}),
          ...(search.to ? { to: search.to } : {}),
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
    search.from,
    search.name,
    search.nationality,
    search.room,
    search.to,
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

  const [knownRooms, setKnownRooms] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (result?.summary?.rooms || result?.rows) {
      setKnownRooms((prev) => {
        const next = new Set(prev);
        for (const r of result?.summary?.rooms ?? []) {
          if (r.roomNumber?.trim()) next.add(r.roomNumber.trim());
        }
        for (const row of result?.rows ?? []) {
          if (row.roomNumber?.trim()) next.add(row.roomNumber.trim());
        }
        return next;
      });
    }
  }, [result?.rows, result?.summary?.rooms]);

  const nationalityOptions = useMemo(() => {
    const activeNationalities = new Set<string>();
    if (result?.rows) {
      for (const row of result.rows) {
        const nat = row.nationality?.trim();
        if (nat && nat !== "—") {
          activeNationalities.add(nat);
        }
      }
    }

    const items: Array<{ value: string; label: string; subLabel?: string }> = [];

    if (activeNationalities.size > 0) {
      for (const nat of Array.from(activeNationalities).sort()) {
        items.push({
          value: nat,
          label: nat,
          subLabel: "In house",
        });
      }
    }

    const activeLower = new Set(Array.from(activeNationalities).map((n) => n.toLowerCase()));
    for (const country of ISO_COUNTRIES) {
      if (!activeLower.has(country.name.toLowerCase())) {
        items.push({
          value: country.name,
          label: country.name,
          subLabel: country.code,
        });
      }
    }

    return items;
  }, [result?.rows]);

  const roomOptions = useMemo(() => {
    const sorted = Array.from(knownRooms).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
    return sorted.map((room) => ({
      value: room,
      label: `Room ${room}`,
    }));
  }, [knownRooms]);

  return (
    <ReportPageShell
      restaurantId={restaurantId}
      definition={definition}
      phase={phase}
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
      dates={
        <FolioDateRange
          from={search.from ?? stayDate}
          to={search.to ?? stayDate}
          fromTestId="police-from"
          toTestId="police-to"
          allowClear={Boolean(search.from || search.to)}
          onFrom={(next) => writeFilters({ from: next || null, resetPage: true })}
          onTo={(next) => writeFilters({ to: next || null, resetPage: true })}
          onRange={(nextFrom, nextTo) =>
            writeFilters({ from: nextFrom || null, to: nextTo || null, resetPage: true })
          }
        />
      }
      search={
        <ReportToolbarSearch
          value={search.name ?? ""}
          placeholder="Search guest name"
          testId="police-guest-name"
          onCommit={(name) => writeFilters({ name, resetPage: true })}
        />
      }
      filters={
        <PmsFilterMenu
          activeCount={
            (stayDate !== businessDate ? 1 : 0) +
            (presence === "HISTORICAL" ? 1 : 0) +
            (search.nationality ? 1 : 0) +
            (search.room ? 1 : 0)
          }
          onClear={() =>
            void navigate({
              to: "/restaurant/pms/reports",
              search: policeClearedSearch(businessDate),
            })
          }
          buttonTestId="police-filters-button"
          menuTestId="police-filters-menu"
        >
          <ReportFilterDate
            label="Stay date"
            testId="police-stay-date"
            value={stayDate}
            onChange={(next) => writeFilters({ stayDate: next, resetPage: true })}
          />
          <PmsFilterChoiceRow
            label="Presence"
            value={presence}
            neutralValue="IN_HOUSE"
            current={presence === "HISTORICAL" ? "Historical" : ""}
            options={[
              ["IN_HOUSE", "In House"],
              ["HISTORICAL", "Historical"],
            ]}
            onChange={(val) =>
              writeFilters({
                presence: val === "HISTORICAL" ? "HISTORICAL" : "IN_HOUSE",
                resetPage: true,
              })
            }
          />
          <PmsFilterChoiceRow
            label="Nationality"
            value={search.nationality || "all"}
            current={search.nationality ?? ""}
            options={[
              ["all", "All nationalities"],
              ...nationalityOptions.map((opt) => [opt.value, opt.label] as const),
            ]}
            onChange={(val) =>
              writeFilters({ nationality: val === "all" ? "" : val, resetPage: true })
            }
          />
          <PmsFilterChoiceRow
            label="Room"
            value={search.room || "all"}
            current={search.room ? `Room ${search.room}` : ""}
            options={[
              ["all", "All rooms"],
              ...roomOptions.map((opt) => [opt.value, opt.label] as const),
              ...(search.room && !roomOptions.some((opt) => opt.value === search.room)
                ? [[search.room, `Room ${search.room}`] as const]
                : []),
            ]}
            onChange={(val) => writeFilters({ room: val === "all" ? "" : val, resetPage: true })}
          />
        </PmsFilterMenu>
      }
    >
      {phase === "ready" && result ? (
        <div className="space-y-3">
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
              className="report-print-hide flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DDD4C5] bg-white px-6 py-12 text-center shadow-2xs"
              data-testid="police-empty"
            >
              <div className="grid size-11 place-items-center rounded-full bg-[#FAF3E3] text-[#8A6A24]">
                <Users className="size-5" />
              </div>
              <h3 className="mt-3 font-display text-sm font-semibold text-[#251605]">{POLICE_EMPTY_TITLE}</h3>
              <p className="mt-1 max-w-md text-xs text-[#7A7167]">{POLICE_EMPTY_BODY}</p>
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
                <tbody className="divide-y divide-[#F2ECE3]">
                  {result.rows.map((row, index) => (
                    <tr
                      key={`${row.reservationRoomId}-${row.guestProfileId}`}
                      data-testid="police-row"
                      className="transition-colors hover:bg-[#FAF8F4]"
                    >
                      <td className={reportCellClass.numeric}>
                        {policeRowNumber(result.page, result.pageSize, index)}
                      </td>
                      <td className={reportCellClass.text} data-testid="police-screen-room">
                        {row.roomNumber ? (
                          <span className="inline-flex items-center rounded-md border border-[#DDD4C5] bg-[#FAF8F4] px-2 py-0.5 text-xs font-semibold text-[#8A6A24]">
                            {row.roomNumber}
                          </span>
                        ) : (
                          <span className="text-[#A89F91]">—</span>
                        )}
                      </td>
                      <td className={cn(reportCellClass.text, "font-medium text-[#251605]")}>
                        {policeBlank(row.guestName)}
                      </td>
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
                        <span className="font-mono text-xs text-[#251605]">{policeScreenIdentity(row.idDocumentNumber)}</span>
                        {row.idDocumentType ? (
                          <span className="mt-0.5 block text-[10px] font-medium text-[#7A7167]">
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
              stayDate={printState.result.context.stayDate}
              from={printState.result.context.from}
              to={printState.result.context.to}
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
  from,
  to,
  filterSummary,
  result,
}: {
  propertyName: string;
  propertyDetail: string | null;
  timezone: string;
  presence: "IN_HOUSE" | "HISTORICAL";
  stayDate: string;
  from: string;
  to: string;
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
        {from !== stayDate || to !== stayDate ? (
          <p className="text-xs">
            Date range: {policeStayDateLabel(from)} → {policeStayDateLabel(to)}
          </p>
        ) : null}
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
