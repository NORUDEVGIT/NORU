/**
 * Operational entitlement Excel and audit. Reuses write-excel-file.
 * Audit snapshots store filters only, never guest rows.
 */
import {
  SERVICE_ENTITLEMENT_REPORT_FULFILLMENT,
  SERVICE_ENTITLEMENT_REPORT_MEAL,
} from "./service-entitlement.ts";
import {
  SERVICE_REPORT_TOO_LARGE_MESSAGE,
  type ServiceEntitlementReportResult,
  type ServiceReportCategory,
} from "./service-entitlement-report.ts";
import type { PoliceAccessDb, PoliceSheetCell } from "./police-stay-export.ts";
import {
  POLICE_AUDIT_BLOCKED_MESSAGE,
  claimPoliceDelivery,
  releasePoliceDelivery,
  releasePoliceDeliveryLock,
  releasePoliceWorkbook,
} from "./police-stay-export.ts";

export {
  POLICE_AUDIT_BLOCKED_MESSAGE as SERVICE_AUDIT_BLOCKED_MESSAGE,
  claimPoliceDelivery as claimServiceDelivery,
  releasePoliceDelivery as releaseServiceDelivery,
  releasePoliceDeliveryLock as releaseServiceDeliveryLock,
  releasePoliceWorkbook as releaseServiceWorkbook,
};

export const SERVICE_EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const SERVICE_EXCEL_PREPARE_MESSAGE = "Unable to prepare the report for Excel export.";
export const SERVICE_EXCEL_AUDIT_MESSAGE = "Unable to record the report export.";
export const SERVICE_PRINT_PREPARE_MESSAGE = "Unable to prepare the full report for printing.";

export const MEAL_EXCEL_COLUMNS = [
  "No.",
  "Room",
  "Guest",
  "Adults",
  "Children",
  "Total Pax",
  "Meal",
  "Meal Plan",
  "Service Date",
  "Notes",
  "Status",
] as const;

export const SERVICE_EXCEL_COLUMNS = [
  "No.",
  "Room",
  "Guest",
  "Service",
  "Quantity",
  "Service Date",
  "Department",
  "Notes",
  "Status",
] as const;

export function serviceExcelFileName(input: {
  category: ServiceReportCategory;
  serviceDate: string;
  meal?: string | undefined;
}): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate) ? input.serviceDate : "undated";
  if (input.category === "MEAL") {
    const meal = (input.meal ?? "breakfast").toLowerCase();
    return `meal-service-${meal}-${date}.xlsx`;
  }
  return `service-fulfillment-${date}.xlsx`;
}

export function serviceAccessSnapshot(filters: {
  serviceDate: string;
  category: string;
  meal?: string | undefined;
  status?: string | undefined;
  room?: string | undefined;
  departmentId?: string | undefined;
  stay?: string | undefined;
}): Record<string, string> {
  const snapshot: Record<string, string> = {
    serviceDate: filters.serviceDate,
    category: filters.category === "FULFILLMENT" ? "FULFILLMENT" : "MEAL",
    status: filters.status ?? "OPEN",
    stay: filters.stay === "IN_HOUSE" ? "IN_HOUSE" : "ALL",
  };
  if (filters.meal) snapshot.meal = filters.meal;
  if (filters.room?.trim()) snapshot.room = filters.room.trim().slice(0, 40);
  if (filters.departmentId) snapshot.departmentId = filters.departmentId;
  return snapshot;
}

export async function recordServiceReportAccess(
  db: PoliceAccessDb,
  input: {
    restaurantId: string;
    membershipId: string;
    userId: string | null;
    category: ServiceReportCategory;
    action: "print" | "excel_export";
    filters: Parameters<typeof serviceAccessSnapshot>[0];
    rowCount: number;
  },
): Promise<void> {
  if (!Number.isInteger(input.rowCount) || input.rowCount < 0) {
    throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
  }
  const result = await db.from("pms_report_access_events").insert({
    restaurant_id: input.restaurantId,
    report_code:
      input.category === "MEAL"
        ? SERVICE_ENTITLEMENT_REPORT_MEAL
        : SERVICE_ENTITLEMENT_REPORT_FULFILLMENT,
    action: input.action,
    membership_id: input.membershipId,
    actor_user_id: input.userId,
    filters_snapshot: serviceAccessSnapshot(input.filters),
    row_count: input.rowCount,
  });
  if (result.error) throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
}

export function serviceWorkbookRows(
  result: ServiceEntitlementReportResult,
  propertyName: string,
  generatedAt: string,
): PoliceSheetCell[][] {
  const meal = result.context.category === "MEAL";
  const rows: PoliceSheetCell[][] = [
    [text(propertyName, true)],
    [text(meal ? "Meal Service" : "Service Fulfillment", true)],
    [text("Service Date"), text(result.context.serviceDate)],
    [
      text("Guests"),
      text(result.context.stay === "IN_HOUSE" ? "In house only" : "All stays covering this date"),
    ],
    [text("Generated At"), text(generatedAt)],
  ];
  if (meal) {
    rows.push([text("Meal"), text(result.context.meal)]);
    rows.push([
      text("Summary"),
      text(
        `Rooms ${result.summary.rooms} · Adults ${result.summary.adults} · Children ${result.summary.children} · Pax ${result.summary.totalPax}`,
      ),
    ]);
  }
  rows.push([text("")]);
  rows.push(
    (meal ? MEAL_EXCEL_COLUMNS : SERVICE_EXCEL_COLUMNS).map((column) => text(column, true)),
  );
  result.rows.forEach((row, index) => {
    if (meal) {
      rows.push([
        number(index + 1),
        text(row.roomNumber),
        text(row.guestName),
        number(row.adultQuantity),
        number(row.childQuantity),
        number(row.totalQuantity),
        text(row.serviceName),
        text(row.mealPlanName ?? ""),
        text(row.serviceDate),
        text(row.notes ?? ""),
        text(row.status),
      ]);
      return;
    }
    rows.push([
      number(index + 1),
      text(row.roomNumber),
      text(row.guestName),
      text(row.serviceName),
      number(row.totalQuantity),
      text(row.serviceDate),
      text(row.departmentName ?? ""),
      text(row.notes ?? ""),
      text(row.status),
    ]);
  });
  return rows;
}

export function serviceDeliveryProblem(error: unknown): "too-large" | "audit" | "prepare" {
  const message = error instanceof Error ? error.message : "";
  if (message === SERVICE_REPORT_TOO_LARGE_MESSAGE || /too large/i.test(message))
    return "too-large";
  if (/record report access|record the report export/i.test(message)) return "audit";
  return "prepare";
}

function text(value: string, bold = false): PoliceSheetCell {
  return bold ? { kind: "text", value, bold: true } : { kind: "text", value };
}

function number(value: number): PoliceSheetCell {
  return { kind: "number", value };
}
