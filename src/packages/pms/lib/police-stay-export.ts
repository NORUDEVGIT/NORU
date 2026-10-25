/**
 * Police print/Excel delivery. The row grain stays in police-stay-report.ts.
 * This module does not query guests. Audit snapshots keep filters and a count,
 * never passport, phone, email, or guest rows.
 */
import {
  POLICE_STAY_TOO_LARGE_MESSAGE,
  type PoliceStayPresence,
  type PoliceStayReportFilters,
  type PoliceStayReportRow,
} from "./police-stay-report.ts";

export const POLICE_REPORT_CODE = "police";
export const POLICE_EXCEL_SHEET = "Guest Stay Report";
export const POLICE_EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const POLICE_AUDIT_BLOCKED_MESSAGE = "Unable to record report access. Try again.";
export const POLICE_EXCEL_AUDIT_MESSAGE = "Unable to record the report export.";
export const POLICE_EXCEL_PREPARE_MESSAGE = "Unable to prepare the report for Excel export.";
export const POLICE_PRINT_PREPARE_MESSAGE = "Unable to prepare the full report for printing.";
export const POLICE_EXCEL_TOO_LARGE_MESSAGE =
  "The report is too large to export at once. Narrow the filters and try again.";

export const POLICE_EXCEL_COLUMNS = [
  "No.",
  "Room",
  "Guest Name",
  "Guest Phone Number",
  "Guest Nationality",
  "Guest Email",
  "Check-In Date",
  "Check-Out Date",
  "Passport / National ID Number",
] as const;

export type PoliceReportAction = "print" | "excel_export";
export type PoliceDeliveryKind = "print" | "excel";

export type PoliceSheetCell =
  | { kind: "text"; value: string; bold?: boolean }
  | { kind: "number"; value: number; bold?: boolean };

export type PoliceAccessDb = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{
      error: { message?: string } | null;
    }>;
  };
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function policeExcelFileName(stayDate: string, presence: PoliceStayPresence): string {
  const date = DATE_ONLY.test(stayDate) ? stayDate : "undated";
  const historical = presence === "HISTORICAL" ? "-historical" : "";
  return `police-guest-stay-report-${date}${historical}.xlsx`;
}

/** Full export filters. Page and page size are intentionally absent. */
export function policeExportFilters(input: {
  stayDate: string;
  presence: PoliceStayPresence;
  name?: string | undefined;
  nationality?: string | undefined;
  room?: string | undefined;
}): PoliceStayReportFilters {
  const name = input.name?.trim();
  const nationality = input.nationality?.trim();
  const room = input.room?.trim();
  return {
    stayDate: input.stayDate,
    presence: input.presence,
    export: true,
    ...(name ? { name } : {}),
    ...(nationality ? { nationality } : {}),
    ...(room ? { room } : {}),
  };
}

export function policeAccessSnapshot(filters: {
  stayDate: string;
  presence?: string | undefined;
  name?: string | undefined;
  nationality?: string | undefined;
  room?: string | undefined;
}): Record<string, string> {
  const snapshot: Record<string, string> = {
    stayDate: DATE_ONLY.test(filters.stayDate) ? filters.stayDate : "",
    presence: filters.presence === "HISTORICAL" ? "HISTORICAL" : "IN_HOUSE",
  };
  const name = filters.name?.trim();
  const nationality = filters.nationality?.trim();
  const room = filters.room?.trim();
  if (name) snapshot.name = name;
  if (nationality) snapshot.nationality = nationality;
  if (room) snapshot.room = room;
  return snapshot;
}

export function policeExcelUnnamedWarning(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) {
    return "1 booked occupant is not represented by a named guest profile.";
  }
  return `${count} booked occupants are not represented by named guest profiles.`;
}

export function policeWorkbookRows(input: {
  propertyName: string;
  stayDate: string;
  presence: PoliceStayPresence;
  generatedAt: string;
  rows: readonly PoliceStayReportRow[];
  namedGuestCount: number;
  unnamedOccupantCount: number;
}): PoliceSheetCell[][] {
  const warning = policeExcelUnnamedWarning(input.unnamedOccupantCount);
  const rows: PoliceSheetCell[][] = [
    [text(cleanLabel(input.propertyName, 160), true)],
    [text("Police / Guest Stay Report", true)],
    [text("Stay Date"), text(input.stayDate)],
    [text("Presence"), text(input.presence === "HISTORICAL" ? "Historical" : "In House")],
    [text("Generated At"), text(input.generatedAt)],
    [text("Named Guests"), number(input.namedGuestCount)],
    [text("Unnamed Occupancy"), number(input.unnamedOccupantCount)],
  ];
  if (warning) rows.push([text(warning)]);
  rows.push([text("")]);
  rows.push(POLICE_EXCEL_COLUMNS.map((column) => text(column, true)));
  input.rows.forEach((row, index) => {
    rows.push([
      number(index + 1),
      text(cleanIdentity(row.roomNumber)),
      text(cleanLabel(row.guestName, 200)),
      text(cleanIdentity(row.phone)),
      text(cleanLabel(row.nationality, 80)),
      text(cleanIdentity(row.email)),
      text(dateText(row.checkInDate)),
      text(dateText(row.checkOutDate)),
      text(cleanIdentity(row.idDocumentNumber)),
    ]);
  });
  return rows;
}

export function policeDeliveryProblem(error: unknown): "too-large" | "audit" | "prepare" {
  const message = error instanceof Error ? error.message : "";
  if (message === POLICE_STAY_TOO_LARGE_MESSAGE || /too large/i.test(message)) return "too-large";
  if (
    message === POLICE_AUDIT_BLOCKED_MESSAGE ||
    /record report access|record the report export/i.test(message)
  ) {
    return "audit";
  }
  return "prepare";
}

export function claimPoliceDelivery(
  state: { current: PoliceDeliveryKind | null },
  next: PoliceDeliveryKind,
): boolean {
  if (state.current) return false;
  state.current = next;
  return true;
}

export function releasePoliceDeliveryLock(state: { current: PoliceDeliveryKind | null }): void {
  state.current = null;
}

/** Authorization runs before the report is loaded. A denied caller never reaches release. */
export async function guardedPoliceRelease<T>(input: {
  authorize: () => Promise<{ id: string; userId: string | null }>;
  release: (actor: { id: string; userId: string | null }) => Promise<T>;
}): Promise<T> {
  const actor = await input.authorize();
  return input.release(actor);
}

/**
 * Load first. Audit only after a successful export load.
 * An audit failure rejects before the caller receives the rows.
 */
export async function releasePoliceDelivery<T extends { total: number }>(input: {
  exporting: boolean;
  load: () => Promise<T>;
  audit: (result: T) => Promise<void>;
}): Promise<T> {
  const result = await input.load();
  if (!input.exporting) return result;
  await input.audit(result);
  return result;
}

/**
 * Build the workbook before the audit row. Return the file only after the
 * audit insert succeeds, so a failed trail does not deliver the register.
 */
export async function releasePoliceWorkbook<T extends { total: number }, File>(input: {
  load: () => Promise<T>;
  build: (result: T) => Promise<File>;
  audit: (result: T) => Promise<void>;
}): Promise<File> {
  const result = await input.load();
  const file = await input.build(result);
  await input.audit(result);
  return file;
}

export async function recordPoliceReportAccess(
  db: PoliceAccessDb,
  input: {
    restaurantId: string;
    membershipId: string;
    userId: string | null;
    action: PoliceReportAction;
    filters: {
      stayDate: string;
      presence?: string | undefined;
      name?: string | undefined;
      nationality?: string | undefined;
      room?: string | undefined;
    };
    rowCount: number;
  },
): Promise<void> {
  if (!Number.isInteger(input.rowCount) || input.rowCount < 0) {
    throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
  }
  const filtersSnapshot = policeAccessSnapshot(input.filters);
  const payload = {
    restaurant_id: input.restaurantId,
    report_code: POLICE_REPORT_CODE,
    action: input.action,
    membership_id: input.membershipId,
    actor_user_id: input.userId,
    filters_snapshot: filtersSnapshot,
    row_count: input.rowCount,
  };
  try {
    const result = await db.from("pms_report_access_events").insert(payload);
    if (result.error) throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
  } catch (error) {
    if (error instanceof Error && error.message === POLICE_AUDIT_BLOCKED_MESSAGE) throw error;
    throw new Error(POLICE_AUDIT_BLOCKED_MESSAGE);
  }
}

function text(value: string, bold = false): PoliceSheetCell {
  return bold ? { kind: "text", value, bold: true } : { kind: "text", value };
}

function number(value: number, bold = false): PoliceSheetCell {
  return bold ? { kind: "number", value, bold: true } : { kind: "number", value };
}

function cleanLabel(value: string | null | undefined, max: number): string {
  return withoutControls(value ?? "", " ")
    .trim()
    .slice(0, max);
}

/** Phone, room, and identity stay text. Leading zeros and plus signs are kept. */
function cleanIdentity(value: string | null | undefined): string {
  return withoutControls(value ?? "", "").trim();
}

function withoutControls(value: string, replacement: string): string {
  let cleaned = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    cleaned += code < 32 ? replacement : value.charAt(index);
  }
  return cleaned;
}

function dateText(value: string): string {
  const trimmed = value.trim();
  return DATE_ONLY.test(trimmed) ? trimmed : trimmed.slice(0, 10);
}
