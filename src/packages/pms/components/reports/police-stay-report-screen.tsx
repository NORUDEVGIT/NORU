import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { cn } from "@/shared/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  DoorClosed,
  Globe,
  Info,
  RotateCcw,
  Search,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
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

  const [knownGuests, setKnownGuests] = useState<Map<string, { label: string; room?: string }>>(
    new Map(),
  );
  const [knownRooms, setKnownRooms] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (result?.rows) {
      setKnownGuests((prev) => {
        const next = new Map(prev);
        for (const row of result.rows) {
          const name = row.guestName?.trim();
          if (name && name !== "—" && !next.has(name.toLowerCase())) {
            next.set(name.toLowerCase(), {
              label: name,
              room: row.roomNumber ? `Rm ${row.roomNumber}` : undefined,
            });
          }
        }
        return next;
      });
    }
  }, [result?.rows]);

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

  const guestOptions = useMemo(() => {
    return Array.from(knownGuests.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((item) => ({
        value: item.label,
        label: item.label,
        subLabel: item.room,
      }));
  }, [knownGuests]);

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
          <div className="report-print-hide flex flex-wrap gap-2" data-testid="police-summary">
            <Summary
              label="Named Guests"
              value={result.summary.namedGuestCount}
              testId="police-named-count"
            />
            <Summary label="Unnamed Occupancy" value={unnamed} testId="police-unnamed-count" />
          </div>
        ) : null
      }
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
          <Filter label="Presence">
            <Select
              value={presence}
              onValueChange={(val) =>
                writeFilters({
                  presence: val === "HISTORICAL" ? "HISTORICAL" : "IN_HOUSE",
                  resetPage: true,
                })
              }
            >
              <SelectTrigger className={FIELD} data-testid="police-presence">
                <SelectValue placeholder="Presence" />
              </SelectTrigger>
              <SelectContent className="border-[#DDD4C5] bg-white rounded-xl shadow-xl p-1 z-50">
                <SelectItem value="IN_HOUSE" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  In House
                </SelectItem>
                <SelectItem value="HISTORICAL" className="text-xs text-[#251605] focus:bg-[#FAF3E3] focus:text-[#8A6A24] rounded-lg cursor-pointer py-1.5">
                  Historical
                </SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <SearchableComboboxField
            label="Guest"
            testId="police-guest-name"
            placeholder="Search guest name"
            value={search.name ?? ""}
            options={guestOptions}
            leftIcon={Search}
            onCommit={(name) => writeFilters({ name, resetPage: true })}
            emptyMessage="No matching guests"
            widthClass="w-52"
          />
          <SearchableComboboxField
            label="Nationality"
            testId="police-nationality"
            placeholder="Select nationality"
            value={search.nationality ?? ""}
            options={nationalityOptions}
            leftIcon={Globe}
            onCommit={(nationality) => writeFilters({ nationality, resetPage: true })}
            emptyMessage="No matching countries"
            widthClass="w-48"
          />
          <SearchableComboboxField
            label="Room"
            testId="police-room"
            placeholder="Select room"
            value={search.room ?? ""}
            options={roomOptions}
            leftIcon={DoorClosed}
            onCommit={(room) => writeFilters({ room, resetPage: true })}
            emptyMessage="No matching rooms"
            widthClass="w-44"
          />
        </ReportFilterBar>
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
  const isNamed = testId.includes("named");
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 shadow-2xs transition-all",
        isNamed
          ? "border-emerald-200/90 bg-white hover:border-emerald-300"
          : "border-amber-200/90 bg-white hover:border-amber-300",
      )}
      data-testid={testId}
    >
      <div
        className={cn(
          "grid size-9 place-items-center rounded-lg border",
          isNamed
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-700",
        )}
      >
        {isNamed ? <Users className="size-4" /> : <ShieldAlert className="size-4" />}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7A7167]">{label}</p>
        <p className="font-display text-xl font-bold tabular-nums text-[#251605]">{value}</p>
      </div>
    </div>
  );
}

function Filter({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative flex w-44 min-w-36 flex-col gap-1.5", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A6A24]">{label}</span>
      {children}
      {hint ? <span className="text-[10px] leading-snug text-[#7A7167]">{hint}</span> : null}
    </div>
  );
}

function SearchableComboboxField({
  label,
  testId,
  placeholder,
  value,
  options,
  leftIcon: LeftIcon,
  onCommit,
  emptyMessage = "No matches found",
  widthClass = "w-48",
}: {
  label: string;
  testId: string;
  placeholder: string;
  value: string;
  options: Array<{ value: string; label: string; subLabel?: string }>;
  leftIcon: typeof Search;
  onCommit: (value: string) => void;
  emptyMessage?: string;
  widthClass?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft.trim() === value.trim()) return;
    const timer = window.setTimeout(() => onCommit(draft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [draft, onCommit, value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = draft.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!query) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.value.toLowerCase().includes(query) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(query)),
    );
  }, [options, query]);

  return (
    <Filter label={label} className={widthClass}>
      <div ref={containerRef} className="relative w-full">
        <LeftIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#A89F91]" />
        <input
          className={cn(FIELD, "pl-8 pr-12")}
          data-testid={testId}
          placeholder={placeholder}
          value={draft}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setDraft(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onCommit(draft.trim());
              setIsOpen(false);
            } else if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {draft ? (
            <button
              type="button"
              className="grid size-5 place-items-center rounded text-[#A89F91] transition-colors hover:bg-[#F2ECE3] hover:text-[#251605]"
              onClick={() => {
                setDraft("");
                onCommit("");
                setIsOpen(false);
              }}
              title="Clear"
            >
              <X className="size-3" />
            </button>
          ) : null}
          <button
            type="button"
            className="grid size-5 place-items-center rounded text-[#A89F91] transition-colors hover:bg-[#F2ECE3] hover:text-[#251605]"
            onClick={() => setIsOpen((prev) => !prev)}
            title="Toggle list"
          >
            <ChevronDown
              className={cn("size-3 transition-transform duration-150", isOpen && "rotate-180")}
            />
          </button>
        </div>

        {isOpen ? (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-full min-w-56 overflow-y-auto rounded-xl border border-[#DDD4C5] bg-white p-1 shadow-xl">
            {options.length > 0 && draft ? (
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-[#8A6A24] transition-colors hover:bg-[#FAF3E3]"
                onClick={() => {
                  setDraft("");
                  onCommit("");
                  setIsOpen(false);
                }}
              >
                <span>Clear filter (Show all)</span>
                <RotateCcw className="size-3 text-[#A89F91]" />
              </button>
            ) : null}

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs text-[#A89F91]">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value.trim().toLowerCase() === opt.value.trim().toLowerCase();
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-[#FAF3E3] font-medium text-[#8A6A24]"
                        : "text-[#251605] hover:bg-[#F9F7F2] hover:text-[#8A6A24]",
                    )}
                    onClick={() => {
                      setDraft(opt.value);
                      onCommit(opt.value);
                      setIsOpen(false);
                    }}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.subLabel ? (
                      <span className="ml-1.5 shrink-0 rounded bg-[#F2ECE3] px-1 py-0.5 text-[9px] font-medium text-[#7A7167]">
                        {opt.subLabel}
                      </span>
                    ) : isSelected ? (
                      <Check className="size-3.5 shrink-0 text-[#C89933]" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </Filter>
  );
}
