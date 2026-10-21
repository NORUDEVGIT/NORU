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
  exportServiceEntitlementWorkbook,
  getServiceEntitlementReport,
  setServiceEntitlementStatus,
} from "@/packages/pms/lib/service-entitlement-report.functions";
import {
  SERVICE_AUDIT_BLOCKED_MESSAGE,
  SERVICE_EXCEL_AUDIT_MESSAGE,
  SERVICE_EXCEL_MIME,
  SERVICE_EXCEL_PREPARE_MESSAGE,
  SERVICE_PRINT_PREPARE_MESSAGE,
  claimServiceDelivery,
  releaseServiceDeliveryLock,
  serviceDeliveryProblem,
} from "@/packages/pms/lib/service-entitlement-export";
import { SERVICE_REPORT_TOO_LARGE_MESSAGE } from "@/packages/pms/lib/service-entitlement-report";
import {
  FULFILLMENT_COLUMNS,
  MEAL_COLUMNS,
  MEAL_EMPTY_BODY,
  MEAL_EMPTY_TITLE,
  SERVICE_EMPTY_BODY,
  SERVICE_EMPTY_TITLE,
  serviceClearedSearch,
  serviceFilterSearch,
  serviceMealFilter,
  serviceReportFailure,
  serviceReportRequest,
  serviceStatusFilter,
  serviceStayFilter,
} from "@/packages/pms/lib/service-entitlement-report-view";
import type { EntitlementStatus } from "@/packages/pms/lib/service-entitlement";
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
 * Operational meal and service handoff. Rows come from getServiceEntitlementReport.
 * The printed Done box is paper only and does not update status.
 */
export function ServiceEntitlementReportScreen({
  restaurantId,
  propertyName,
  businessDate,
  report,
  search,
}: {
  restaurantId: string;
  propertyName: string;
  businessDate: string;
  report: "meal-service" | "service-fulfillment";
  search: ReportsRouteSearch;
}) {
  const definition = reportByCode(report);
  const navigate = useNavigate();
  const category = report === "meal-service" ? "MEAL" : "FULFILLMENT";
  const serviceDate = search.serviceDate ?? businessDate;
  const meal = serviceMealFilter(search.meal);
  const status = serviceStatusFilter(search.status);
  const stay = serviceStayFilter(search.stay);
  const page = parseReportPage(search.page ?? 1);
  const pageSize = parseReportPageSize(search.pageSize ?? DEFAULT_REPORT_PAGE_SIZE);
  const fetchReport = useServerFn(getServiceEntitlementReport);
  const exportWorkbook = useServerFn(exportServiceEntitlementWorkbook);
  const setStatus = useServerFn(setServiceEntitlementStatus);
  const delivery = useRef<{ current: "print" | "excel" | null }>({ current: null });
  const [printState, setPrintState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; problem: "too-large" | "audit" | "prepare" }
    | { kind: "ready"; rows: Awaited<ReturnType<typeof fetchReport>> }
  >({ kind: "idle" });
  const [excelState, setExcelState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; problem: "too-large" | "audit" | "prepare" }
  >({ kind: "idle" });

  const writeFilters = useCallback(
    (patch: {
      serviceDate?: string;
      meal?: typeof meal;
      status?: typeof status;
      room?: string;
      department?: string;
      stay?: typeof stay;
      page?: number;
      pageSize?: ReportPageSize;
      resetPage?: boolean;
    }) => {
      void navigate({
        to: "/restaurant/pms/reports",
        search: serviceFilterSearch({
          report,
          serviceDate: patch.serviceDate ?? serviceDate,
          meal: patch.meal ?? meal,
          status: patch.status ?? status,
          room: patch.room !== undefined ? patch.room : search.room,
          department: patch.department !== undefined ? patch.department : search.department,
          stay: patch.stay ?? stay,
          page: patch.page ?? (patch.resetPage === false ? page : 1),
          pageSize: patch.pageSize ?? pageSize,
        }),
      });
    },
    [
      meal,
      navigate,
      page,
      pageSize,
      report,
      search.department,
      search.room,
      serviceDate,
      status,
      stay,
    ],
  );

  const query = useQuery({
    queryKey: [
      "service-entitlement-report",
      report,
      restaurantId,
      serviceDate,
      meal,
      status,
      search.room ?? "",
      search.department ?? "",
      stay,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchReport({
        data: serviceReportRequest({
          restaurantId,
          category,
          serviceDate,
          meal,
          status,
          room: search.room,
          departmentId: search.department,
          stay,
          page,
          pageSize,
          exportAll: false,
        }),
      }),
    enabled: Boolean(search.serviceDate),
    retry: false,
  });

  useEffect(() => {
    if (printState.kind !== "ready") return;
    const timer = window.setTimeout(() => window.print(), 50);
    const clear = () => {
      releaseServiceDeliveryLock(delivery.current);
      setPrintState({ kind: "idle" });
    };
    window.addEventListener("afterprint", clear);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clear);
    };
  }, [printState]);

  const preparePrint = useCallback(async () => {
    if (!claimServiceDelivery(delivery.current, "print")) return;
    setPrintState({ kind: "loading" });
    try {
      const result = await fetchReport({
        data: serviceReportRequest({
          restaurantId,
          category,
          serviceDate,
          meal,
          status,
          room: search.room,
          departmentId: search.department,
          stay,
          page: 1,
          pageSize,
          exportAll: true,
          action: "print",
        }),
      });
      setPrintState({ kind: "ready", rows: result });
    } catch (error) {
      releaseServiceDeliveryLock(delivery.current);
      setPrintState({ kind: "error", problem: serviceDeliveryProblem(error) });
    }
  }, [
    category,
    fetchReport,
    meal,
    pageSize,
    restaurantId,
    search.department,
    search.room,
    serviceDate,
    status,
    stay,
  ]);

  const prepareExcel = useCallback(async () => {
    if (!claimServiceDelivery(delivery.current, "excel")) return;
    setExcelState({ kind: "loading" });
    try {
      const file = await exportWorkbook({
        data: {
          restaurantId,
          serviceDate,
          category,
          meal,
          status,
          stay,
          propertyName,
          ...(search.room ? { room: search.room } : {}),
          ...(search.department ? { departmentId: search.department } : {}),
        },
      });
      downloadWorkbook(file.fileName, file.base64);
      setExcelState({ kind: "idle" });
    } catch (error) {
      setExcelState({ kind: "error", problem: serviceDeliveryProblem(error) });
    } finally {
      releaseServiceDeliveryLock(delivery.current);
    }
  }, [
    category,
    exportWorkbook,
    meal,
    propertyName,
    restaurantId,
    search.department,
    search.room,
    serviceDate,
    status,
    stay,
  ]);

  if (!definition || definition.kind !== "row") return null;
  const failure = query.isError ? serviceReportFailure(query.error) : null;
  const phase =
    failure === "access" ? "no-access" : failure ? "error" : query.isPending ? "loading" : "ready";
  const result = query.data;
  const columns = category === "MEAL" ? MEAL_COLUMNS : FULFILLMENT_COLUMNS;
  const emptyTitle = category === "MEAL" ? MEAL_EMPTY_TITLE : SERVICE_EMPTY_TITLE;
  const emptyBody = category === "MEAL" ? MEAL_EMPTY_BODY : SERVICE_EMPTY_BODY;

  return (
    <ReportPageShell
      definition={definition}
      phase={phase}
      businessDate={businessDate}
      timezone={result?.context.timezone ?? "UTC"}
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
        ? {
            onRetry: () => void query.refetch(),
            ...(failure === "too-large" ? { errorMessage: SERVICE_REPORT_TOO_LARGE_MESSAGE } : {}),
          }
        : {})}
      filters={
        <ReportFilterBar
          onClear={() =>
            void navigate({
              to: "/restaurant/pms/reports",
              search: serviceClearedSearch(report, businessDate),
            })
          }
        >
          <Filter label="Service Date">
            <input
              type="date"
              className={FIELD}
              data-testid="service-date"
              value={serviceDate}
              onChange={(event) =>
                writeFilters({ serviceDate: event.target.value, resetPage: true })
              }
            />
          </Filter>
          {category === "MEAL" ? (
            <Filter label="Meal">
              <select
                className={FIELD}
                data-testid="service-meal"
                value={meal}
                onChange={(event) =>
                  writeFilters({ meal: serviceMealFilter(event.target.value), resetPage: true })
                }
              >
                <option value="BREAKFAST">Breakfast</option>
                <option value="LUNCH">Lunch</option>
                <option value="DINNER">Dinner</option>
                <option value="ALL">All meals</option>
              </select>
            </Filter>
          ) : (
            <Filter label="Department">
              <input
                className={FIELD}
                data-testid="service-department"
                placeholder="Department id"
                value={search.department ?? ""}
                onChange={(event) =>
                  writeFilters({ department: event.target.value, resetPage: true })
                }
              />
            </Filter>
          )}
          <Filter label="Status">
            <select
              className={FIELD}
              data-testid="service-status"
              value={status}
              onChange={(event) =>
                writeFilters({ status: serviceStatusFilter(event.target.value), resetPage: true })
              }
            >
              <option value="OPEN">Due</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </Filter>
          <Filter label="Guests">
            <select
              className={FIELD}
              data-testid="service-stay"
              value={stay}
              onChange={(event) =>
                writeFilters({ stay: serviceStayFilter(event.target.value), resetPage: true })
              }
            >
              <option value="ALL">All stays covering this date</option>
              <option value="IN_HOUSE">In house only</option>
            </select>
          </Filter>
          <Filter label="Room">
            <input
              className={FIELD}
              data-testid="service-room"
              value={search.room ?? ""}
              onChange={(event) => writeFilters({ room: event.target.value, resetPage: true })}
            />
          </Filter>
        </ReportFilterBar>
      }
    >
      {phase === "ready" && result ? (
        <div className="space-y-3">
          <div className="report-print-hide flex flex-wrap gap-2" data-testid="service-summary">
            {category === "MEAL" ? (
              <>
                <Summary label="Rooms" value={String(result.summary.rooms)} />
                <Summary label="Adults" value={String(result.summary.adults)} />
                <Summary label="Children" value={String(result.summary.children)} />
                <Summary label="Total Pax" value={String(result.summary.totalPax)} />
              </>
            ) : (
              <>
                <Summary label="Services Due" value={String(result.summary.services)} />
                <Summary label="Pending" value={String(result.summary.pending)} />
                <Summary label="In Progress" value={String(result.summary.inProgress)} />
                <Summary label="Completed" value={String(result.summary.completed)} />
              </>
            )}
          </div>
          {printState.kind === "error" ? (
            <p className="report-print-hide text-xs" role="alert" data-testid="service-print-error">
              {printState.problem === "too-large"
                ? SERVICE_REPORT_TOO_LARGE_MESSAGE
                : printState.problem === "audit"
                  ? SERVICE_AUDIT_BLOCKED_MESSAGE
                  : SERVICE_PRINT_PREPARE_MESSAGE}
            </p>
          ) : null}
          {excelState.kind === "error" ? (
            <p className="report-print-hide text-xs" role="alert" data-testid="service-excel-error">
              {excelState.problem === "audit"
                ? SERVICE_EXCEL_AUDIT_MESSAGE
                : SERVICE_EXCEL_PREPARE_MESSAGE}
            </p>
          ) : null}
          {result.rows.length === 0 ? (
            <div
              className="report-print-hide rounded-xl border border-[#E8E1D7] bg-white px-5 py-8"
              data-testid="service-empty"
            >
              <h3 className="text-sm font-semibold text-[#251605]">{emptyTitle}</h3>
              <p className="mt-1 text-sm text-[#7A7167]">{emptyBody}</p>
            </div>
          ) : (
            <div className="report-print-hide">
              <ReportTableShell label={definition.title}>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <ReportTableHeaderCell key={column}>{column}</ReportTableHeaderCell>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, index) => (
                    <tr
                      key={row.id}
                      data-testid="service-row"
                      className="border-t border-[#E8E1D7]"
                    >
                      <td className={reportCellClass.numeric}>
                        {(page - 1) * pageSize + index + 1}
                      </td>
                      <td className={reportCellClass.text}>{row.roomNumber}</td>
                      <td className={reportCellClass.text}>{row.guestName}</td>
                      {category === "MEAL" ? (
                        <>
                          <td className={reportCellClass.numeric}>{row.adultQuantity}</td>
                          <td className={reportCellClass.numeric}>{row.childQuantity}</td>
                          <td className={reportCellClass.numeric}>{row.totalQuantity}</td>
                          <td className={reportCellClass.text}>{row.serviceName}</td>
                          <td className={reportCellClass.text}>{row.mealPlanName ?? "—"}</td>
                        </>
                      ) : (
                        <>
                          <td className={reportCellClass.text}>{row.serviceName}</td>
                          <td className={reportCellClass.numeric}>{row.totalQuantity}</td>
                          <td className={reportCellClass.text}>{row.departmentName ?? "—"}</td>
                        </>
                      )}
                      <td className={reportCellClass.text}>{row.notes ?? "—"}</td>
                      <td className={reportCellClass.text}>
                        <select
                          className={FIELD}
                          data-testid="service-row-status"
                          value={row.status}
                          onChange={(event) => {
                            void setStatus({
                              data: {
                                restaurantId,
                                entitlementId: row.id,
                                status: event.target.value as EntitlementStatus,
                              },
                            }).then(() => query.refetch());
                          }}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="IN_PROGRESS">In progress</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ReportTableShell>
            </div>
          )}
          {printState.kind === "ready" ? (
            <article className="report-print-only" data-testid="service-print-sheet">
              <header className="mb-4">
                <p className="text-sm font-semibold">{propertyName}</p>
                <h1 className="mt-2 text-lg font-semibold">
                  {category === "MEAL"
                    ? mealTitle(printState.rows.context.meal)
                    : "Service Fulfillment"}
                </h1>
                <p className="text-xs">Service date: {printState.rows.context.serviceDate}</p>
                <p className="text-xs">
                  {printState.rows.context.stay === "IN_HOUSE"
                    ? "In house only"
                    : "All stays covering this date"}
                </p>
              </header>
              <table>
                <thead>
                  <tr>
                    {(category === "MEAL"
                      ? [
                          "No.",
                          "Room",
                          "Guest",
                          "Adults",
                          "Children",
                          "Pax",
                          "Meal Plan",
                          "Notes",
                          "Done",
                        ]
                      : ["No.", "Room", "Guest", "Service", "Qty", "Department", "Notes", "Done"]
                    ).map((column) => (
                      <th key={column} className="px-2 py-1 text-left text-[10px]">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {printState.rows.rows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="px-2 py-1">{index + 1}</td>
                      <td className="px-2 py-1">{row.roomNumber}</td>
                      <td className="px-2 py-1">{row.guestName}</td>
                      {category === "MEAL" ? (
                        <>
                          <td className="px-2 py-1">{row.adultQuantity}</td>
                          <td className="px-2 py-1">{row.childQuantity}</td>
                          <td className="px-2 py-1">{row.totalQuantity}</td>
                          <td className="px-2 py-1">{row.mealPlanName ?? "—"}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1">{row.serviceName}</td>
                          <td className="px-2 py-1">{row.totalQuantity}</td>
                          <td className="px-2 py-1">{row.departmentName ?? "—"}</td>
                        </>
                      )}
                      <td className="px-2 py-1">{row.notes ?? ""}</td>
                      <td className="px-2 py-1">□</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ) : null}
        </div>
      ) : null}
    </ReportPageShell>
  );
}

function mealTitle(meal: string): string {
  if (meal === "LUNCH") return "Today's Lunch";
  if (meal === "DINNER") return "Today's Dinner";
  if (meal === "ALL") return "All Meals";
  return "Today's Breakfast";
}

function downloadWorkbook(fileName: string, base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const blob = new Blob([bytes], { type: SERVICE_EXCEL_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".xlsx") ? fileName : "service-report.xlsx";
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
