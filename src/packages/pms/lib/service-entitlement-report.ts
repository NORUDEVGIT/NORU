/**
 * Operational entitlement reports. Rows come from stored entitlements.
 * This module does not derive meals from folio descriptions or meal-plan type names.
 */
import {
  DEFAULT_REPORT_PAGE_SIZE,
  REPORT_PAGE_SIZES,
  type ReportPageSize,
} from "./reports-shell.ts";
import {
  compareRoomNumbers,
  type EntitlementStatus,
  type MealCode,
} from "./service-entitlement.ts";

export const SERVICE_REPORT_TOO_LARGE_MESSAGE =
  "The report is too large to export at once. Narrow the filters and try again.";
export const SERVICE_REPORT_LOAD_FAILED = "The service report could not be loaded.";
export const SERVICE_REPORT_SAFETY_LIMIT = 5000;

export const SERVICE_REPORT_CATEGORIES = ["MEAL", "FULFILLMENT"] as const;
export type ServiceReportCategory = (typeof SERVICE_REPORT_CATEGORIES)[number];

export const SERVICE_MEAL_FILTERS = ["BREAKFAST", "LUNCH", "DINNER", "ALL"] as const;
export type ServiceMealFilter = (typeof SERVICE_MEAL_FILTERS)[number];

export const SERVICE_STATUS_FILTERS = [
  "OPEN",
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ServiceStatusFilter = (typeof SERVICE_STATUS_FILTERS)[number];

export const SERVICE_STAY_FILTERS = ["ALL", "IN_HOUSE", "CONFIRMED"] as const;
export type ServiceStayFilter = (typeof SERVICE_STAY_FILTERS)[number];

export type ServiceEntitlementReportRow = {
  id: string;
  roomNumber: string;
  guestName: string;
  adultQuantity: number;
  childQuantity: number;
  totalQuantity: number;
  serviceName: string;
  mealCode: MealCode | null;
  mealPlanName: string | null;
  serviceDate: string;
  departmentName: string | null;
  status: EntitlementStatus;
  notes: string | null;
  building: string | null;
  floor: string | null;
  stayStatus: string;
};

export type ServiceEntitlementSourceRow = ServiceEntitlementReportRow & {
  restaurantId: string;
  serviceKind: "MEAL" | "PACKAGE_COMPONENT";
  departmentId: string | null;
  serviceReferenceId: string;
};

export type ServiceEntitlementReportFilters = {
  serviceDate: string;
  category: ServiceReportCategory;
  meal?: ServiceMealFilter | undefined;
  departmentId?: string | undefined;
  serviceId?: string | undefined;
  status?: ServiceStatusFilter | undefined;
  room?: string | undefined;
  stay?: ServiceStayFilter | undefined;
  page?: number | undefined;
  pageSize?: ReportPageSize | undefined;
  export?: boolean | undefined;
};

export type ServiceEntitlementReportResult = {
  rows: ServiceEntitlementReportRow[];
  page: number;
  pageSize: number;
  total: number;
  summary: {
    rooms: number;
    adults: number;
    children: number;
    totalPax: number;
    services: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
  context: {
    serviceDate: string;
    category: ServiceReportCategory;
    meal: ServiceMealFilter;
    status: ServiceStatusFilter;
    stay: ServiceStayFilter;
    businessDate: string;
    timezone: string;
  };
};

export class ServiceEntitlementReportError extends Error {
  readonly code = "LOAD_FAILED" as const;
  constructor(message = SERVICE_REPORT_LOAD_FAILED) {
    super(message);
    this.name = "ServiceEntitlementReportError";
  }
}

export function assembleServiceEntitlementReport(input: {
  restaurantId: string;
  businessDate: string;
  timezone: string;
  rows: readonly ServiceEntitlementSourceRow[];
  filters: ServiceEntitlementReportFilters;
}): ServiceEntitlementReportResult {
  const meal = serviceMealFilter(input.filters.meal);
  const status = serviceStatusFilter(input.filters.status);
  const stay = serviceStayFilter(input.filters.stay);
  const roomQuery = (input.filters.room ?? "").trim().toLowerCase();
  const selected = input.rows
    .filter((row) => row.restaurantId === input.restaurantId)
    .filter((row) => row.serviceDate === input.filters.serviceDate)
    .filter((row) =>
      input.filters.category === "MEAL"
        ? row.serviceKind === "MEAL"
        : row.serviceKind === "PACKAGE_COMPONENT",
    )
    .filter((row) =>
      input.filters.category === "MEAL" && meal !== "ALL" ? row.mealCode === meal : true,
    )
    .filter((row) => matchesStatus(row.status, status))
    .filter((row) =>
      input.filters.departmentId ? row.departmentId === input.filters.departmentId : true,
    )
    .filter((row) =>
      input.filters.serviceId ? row.serviceReferenceId === input.filters.serviceId : true,
    )
    .filter((row) => (roomQuery ? row.roomNumber.toLowerCase().includes(roomQuery) : true))
    .filter((row) => matchesStay(row.stayStatus, stay))
    .sort((left, right) => {
      const room = compareRoomNumbers(left.roomNumber, right.roomNumber);
      if (room !== 0) return room;
      return left.serviceName.localeCompare(right.serviceName);
    });
  if (selected.length > SERVICE_REPORT_SAFETY_LIMIT) {
    throw new ServiceEntitlementReportError(SERVICE_REPORT_TOO_LARGE_MESSAGE);
  }
  const pageSize = normalizePageSize(input.filters.pageSize);
  const page = normalizePage(input.filters.page);
  const pageRows = input.filters.export
    ? selected
    : selected.slice((page - 1) * pageSize, page * pageSize);
  return {
    rows: pageRows.map(toPublicRow),
    page: input.filters.export ? 1 : page,
    pageSize: input.filters.export ? selected.length || pageSize : pageSize,
    total: selected.length,
    summary: summarize(selected),
    context: {
      serviceDate: input.filters.serviceDate,
      category: input.filters.category,
      meal,
      status,
      stay,
      businessDate: input.businessDate,
      timezone: input.timezone,
    },
  };
}

export function serviceMealFilter(value: string | undefined): ServiceMealFilter {
  if (value === "BREAKFAST" || value === "LUNCH" || value === "DINNER" || value === "ALL") {
    return value;
  }
  return "BREAKFAST";
}

export function serviceStayFilter(value: string | undefined): ServiceStayFilter {
  if (value === "IN_HOUSE" || value === "in-house") return "IN_HOUSE";
  if (value === "CONFIRMED" || value === "confirmed") return "CONFIRMED";
  return "ALL";
}

export function serviceStayLabel(status: string): string {
  if (status === "checked_in") return "Checked in";
  if (status === "confirmed") return "Confirmed";
  if (status === "pending") return "Pending";
  if (status === "checked_out") return "Checked out";
  return status ? status.replaceAll("_", " ") : "—";
}

function matchesStay(status: string, filter: ServiceStayFilter): boolean {
  if (filter === "IN_HOUSE") return status === "checked_in";
  if (filter === "CONFIRMED") return status === "confirmed";
  return true;
}

export function serviceStatusFilter(value: string | undefined): ServiceStatusFilter {
  if (
    value === "PENDING" ||
    value === "IN_PROGRESS" ||
    value === "COMPLETED" ||
    value === "CANCELLED" ||
    value === "OPEN"
  ) {
    return value;
  }
  return "OPEN";
}

function matchesStatus(status: EntitlementStatus, filter: ServiceStatusFilter): boolean {
  if (filter === "OPEN") return status !== "CANCELLED";
  return status === filter;
}

function summarize(rows: readonly ServiceEntitlementSourceRow[]) {
  const rooms = new Set(rows.map((row) => `${row.roomNumber}|${row.guestName}`));
  return {
    rooms: rooms.size,
    adults: rows.reduce((sum, row) => sum + row.adultQuantity, 0),
    children: rows.reduce((sum, row) => sum + row.childQuantity, 0),
    totalPax: rows.reduce((sum, row) => sum + row.totalQuantity, 0),
    services: rows.length,
    pending: rows.filter((row) => row.status === "PENDING").length,
    inProgress: rows.filter((row) => row.status === "IN_PROGRESS").length,
    completed: rows.filter((row) => row.status === "COMPLETED").length,
  };
}

function toPublicRow(row: ServiceEntitlementSourceRow): ServiceEntitlementReportRow {
  return {
    id: row.id,
    roomNumber: row.roomNumber,
    guestName: row.guestName,
    adultQuantity: row.adultQuantity,
    childQuantity: row.childQuantity,
    totalQuantity: row.totalQuantity,
    serviceName: row.serviceName,
    mealCode: row.mealCode,
    mealPlanName: row.mealPlanName,
    serviceDate: row.serviceDate,
    departmentName: row.departmentName,
    status: row.status,
    notes: row.notes,
    building: row.building,
    floor: row.floor,
    stayStatus: row.stayStatus,
  };
}

function normalizePage(page: number | undefined): number {
  if (!page || !Number.isInteger(page) || page < 1) return 1;
  return page;
}

function normalizePageSize(pageSize: number | undefined): ReportPageSize {
  if (pageSize && (REPORT_PAGE_SIZES as readonly number[]).includes(pageSize)) {
    return pageSize as ReportPageSize;
  }
  return DEFAULT_REPORT_PAGE_SIZE;
}
