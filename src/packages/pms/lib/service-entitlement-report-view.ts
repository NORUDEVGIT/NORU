/**
 * Meal Service and Service Fulfillment presentation helpers.
 */
import {
  SERVICE_REPORT_TOO_LARGE_MESSAGE,
  serviceMealFilter,
  serviceStatusFilter,
  serviceStayFilter,
  serviceStayLabel,
  type ServiceMealFilter,
  type ServiceReportCategory,
  type ServiceStatusFilter,
  type ServiceStayFilter,
} from "./service-entitlement-report.ts";
import {
  DEFAULT_REPORT_PAGE_SIZE,
  reportsSearch,
  type ReportPageSize,
  type ReportsRouteSearch,
} from "./reports-shell.ts";

export const MEAL_EMPTY_TITLE = "No meals due";
export const MEAL_EMPTY_BODY = "No meal entitlements match the selected service date.";
export const SERVICE_EMPTY_TITLE = "No services due";
export const SERVICE_EMPTY_BODY = "No operational services match the selected filters.";

export const MEAL_COLUMNS = [
  "No.",
  "Room",
  "Guest",
  "Stay",
  "Adults",
  "Children",
  "Pax",
  "Meal",
  "Meal Plan",
  "Notes",
  "Status",
] as const;

export const FULFILLMENT_COLUMNS = [
  "No.",
  "Room",
  "Guest",
  "Stay",
  "Service",
  "Qty",
  "Department",
  "Notes",
  "Status",
] as const;

export function serviceFilterSearch(input: {
  report: "meal-service" | "service-fulfillment";
  serviceDate: string;
  meal?: ServiceMealFilter | undefined;
  status?: ServiceStatusFilter | undefined;
  room?: string | undefined;
  department?: string | undefined;
  stay?: ServiceStayFilter | undefined;
  page?: number | undefined;
  pageSize?: ReportPageSize | undefined;
}): ReportsRouteSearch {
  return reportsSearch(
    {
      kind: "row",
      report: input.report,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? DEFAULT_REPORT_PAGE_SIZE,
    },
    {
      serviceDate: input.serviceDate,
      ...(input.report === "meal-service" ? { meal: input.meal ?? "BREAKFAST" } : {}),
      ...(input.status && input.status !== "OPEN" ? { status: input.status } : {}),
      ...(input.room ? { room: input.room } : {}),
      ...(input.department ? { department: input.department } : {}),
      ...(input.stay === "IN_HOUSE"
        ? { stay: "in-house" }
        : input.stay === "CONFIRMED"
          ? { stay: "confirmed" }
          : {}),
      ...(input.page ? { page: input.page } : {}),
      ...(input.pageSize ? { pageSize: input.pageSize } : {}),
    },
  );
}

export function serviceClearedSearch(
  report: "meal-service" | "service-fulfillment",
  serviceDate: string,
): ReportsRouteSearch {
  return serviceFilterSearch({
    report,
    serviceDate,
    meal: "BREAKFAST",
    status: "OPEN",
    page: 1,
    pageSize: DEFAULT_REPORT_PAGE_SIZE,
  });
}

export function serviceReportRequest(input: {
  restaurantId: string;
  category: ServiceReportCategory;
  serviceDate: string;
  meal: ServiceMealFilter;
  status: ServiceStatusFilter;
  room?: string | undefined;
  departmentId?: string | undefined;
  stay?: ServiceStayFilter | undefined;
  page: number;
  pageSize: ReportPageSize;
  exportAll: boolean;
  action?: "print" | "excel_export" | undefined;
}) {
  return {
    restaurantId: input.restaurantId,
    serviceDate: input.serviceDate,
    category: input.category,
    meal: input.meal,
    status: input.status,
    page: input.page,
    pageSize: input.pageSize,
    ...(input.room ? { room: input.room } : {}),
    ...(input.departmentId && /^[0-9a-f-]{36}$/i.test(input.departmentId)
      ? { departmentId: input.departmentId }
      : {}),
    ...(serviceStayFilter(input.stay) === "ALL" ? {} : { stay: serviceStayFilter(input.stay) }),
    ...(input.exportAll ? { export: true as const, action: input.action ?? "print" } : {}),
  };
}

export function serviceReportFailure(error: unknown): "access" | "too-large" | "load" {
  const message = error instanceof Error ? error.message : "";
  if (/don['’]t have access|do not have permission/i.test(message)) return "access";
  if (message === SERVICE_REPORT_TOO_LARGE_MESSAGE || /too large/i.test(message))
    return "too-large";
  return "load";
}

export { serviceMealFilter, serviceStatusFilter, serviceStayFilter, serviceStayLabel };
