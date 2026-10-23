/**
 * Police stay report presentation. Membership still comes from getPoliceStayReport.
 * This module does not query guests or invent unnamed rows.
 *
 * Screen identity numbers use maskIdNumber. Print shows the full number to the
 * same Front Office manager. Card 7 mask_guest_names, reports.pms.print, and
 * reports.pms.export are stored configuration and are not security controls.
 */
import { maskIdNumber } from "./guest-profile-wave2.ts";
import type { PoliceReportAction } from "./police-stay-export.ts";
import {
  POLICE_STAY_TOO_LARGE_MESSAGE,
  type PoliceStayPresence,
  type PoliceStayReportRow,
} from "./police-stay-report.ts";
import { formatStayDate } from "../../../shared/lib/property-dates.ts";
import { formatDateTimeInZone } from "../../../shared/lib/property-time.ts";
import {
  DEFAULT_REPORT_PAGE_SIZE,
  reportsSearch,
  type ReportPageSize,
  type ReportsRouteSearch,
} from "./reports-shell.ts";

export const POLICE_HISTORICAL_NOTE =
  "Historical results use recorded stay dates and reservation-room status. Early departures may not be reflected if the stay dates were not updated.";

export const POLICE_EMPTY_TITLE = "No matching guests";
export const POLICE_EMPTY_BODY = "No named guests match the selected stay date and filters.";

export const POLICE_SCREEN_COLUMNS = [
  "No.",
  "Room",
  "Guest Name",
  "Phone Number",
  "Nationality",
  "Email",
  "Check-In",
  "Check-Out",
  "Passport / National ID",
] as const;

/** Official print matches the stay register sample. Room stays off unless a later phase turns it on. */
export const POLICE_PRINT_SHOW_ROOM = false;

export const POLICE_PRINT_COLUMNS = [
  "No.",
  "Guest Name",
  "Guest Phone Number",
  "Guest Nationality",
  "Guest Email",
  "Check-In Date",
  "Check-Out Date",
  "Passport / National ID Number",
] as const;

export function policePresence(value: string | undefined): PoliceStayPresence {
  return value === "HISTORICAL" ? "HISTORICAL" : "IN_HOUSE";
}

export function policePresenceLabel(presence: PoliceStayPresence): string {
  return presence === "HISTORICAL" ? "Historical" : "In House";
}

export function policeRowNumber(page: number, pageSize: number, index: number): number {
  return (Math.max(1, page) - 1) * pageSize + index + 1;
}

export function policeBlank(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined" || trimmed === "N/A") return "—";
  return trimmed;
}

export function policeStayDateLabel(value: string): string {
  return formatStayDate(value);
}

export function policeScreenIdentity(value: string | null | undefined): string {
  return maskIdNumber(value) ?? "—";
}

export function policePrintIdentity(value: string | null | undefined): string {
  return policeBlank(value);
}

export function policeGeneratedLabel(nowIso: string, timezone: string): string {
  return formatDateTimeInZone(nowIso, timezone);
}

export function policeUnnamedWarning(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) {
    return "1 booked occupant does not have a named guest profile assigned to their room stay and is not included as a guest row.";
  }
  return `${count} booked occupants do not have named guest profiles assigned to their room stays and are not included as guest rows.`;
}

export function policePrintUnnamedWarning(count: number): string | null {
  if (count <= 0) return null;
  const noun = count === 1 ? "occupant is" : "occupants are";
  return `Warning: ${count} booked ${noun} not represented by named guest profiles.`;
}

export function policeReportFailure(error: unknown): "access" | "too-large" | "load" {
  const message = error instanceof Error ? error.message : "";
  if (/don['’]t have access|do not have permission/i.test(message)) return "access";
  if (message === POLICE_STAY_TOO_LARGE_MESSAGE || /too large/i.test(message)) {
    return "too-large";
  }
  return "load";
}

export function policeReportRequest(input: {
  restaurantId: string;
  stayDate: string;
  presence: PoliceStayPresence;
  name?: string | undefined;
  nationality?: string | undefined;
  room?: string | undefined;
  page: number;
  pageSize: ReportPageSize;
  exportAll: boolean;
  action?: PoliceReportAction | undefined;
}): {
  restaurantId: string;
  stayDate: string;
  presence: PoliceStayPresence;
  page: number;
  pageSize: ReportPageSize;
  name?: string;
  nationality?: string;
  room?: string;
  export?: true;
  action?: PoliceReportAction;
} {
  return {
    restaurantId: input.restaurantId,
    stayDate: input.stayDate,
    presence: input.presence,
    page: input.page,
    pageSize: input.pageSize,
    ...(input.name ? { name: input.name } : {}),
    ...(input.nationality ? { nationality: input.nationality } : {}),
    ...(input.room ? { room: input.room } : {}),
    ...(input.exportAll ? { export: true as const, action: input.action ?? "print" } : {}),
  };
}

export function policeFilterSearch(input: {
  stayDate: string;
  presence: PoliceStayPresence;
  name?: string | undefined;
  nationality?: string | undefined;
  room?: string | undefined;
  page?: number | undefined;
  pageSize?: ReportPageSize | undefined;
}): ReportsRouteSearch {
  return reportsSearch(
    {
      kind: "row",
      report: "police",
      page: input.page ?? 1,
      pageSize: input.pageSize ?? DEFAULT_REPORT_PAGE_SIZE,
    },
    {
      stayDate: input.stayDate,
      presence: input.presence,
      ...(input.name ? { name: input.name } : {}),
      ...(input.nationality ? { nationality: input.nationality } : {}),
      ...(input.room ? { room: input.room } : {}),
      ...(input.page ? { page: input.page } : {}),
      ...(input.pageSize ? { pageSize: input.pageSize } : {}),
    },
  );
}

export function policeClearedSearch(businessDate: string): ReportsRouteSearch {
  return policeFilterSearch({
    stayDate: businessDate,
    presence: "IN_HOUSE",
    page: 1,
    pageSize: DEFAULT_REPORT_PAGE_SIZE,
  });
}

export function policeFilterSummary(input: {
  name?: string | undefined;
  nationality?: string | undefined;
  room?: string | undefined;
}): string | null {
  const parts = [
    input.name ? `Guest: ${input.name}` : "",
    input.nationality ? `Nationality: ${input.nationality}` : "",
    input.room ? `Room: ${input.room}` : "",
  ].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export type PolicePrintCell = {
  guestName: string;
  phone: string;
  nationality: string;
  email: string;
  checkIn: string;
  checkOut: string;
  identity: string;
  room: string;
};

export function policePrintCells(row: PoliceStayReportRow): PolicePrintCell {
  return {
    guestName: policeBlank(row.guestName),
    phone: policeBlank(row.phone),
    nationality: policeBlank(row.nationality),
    email: policeBlank(row.email),
    checkIn: policeStayDateLabel(row.checkInDate),
    checkOut: policeStayDateLabel(row.checkOutDate),
    identity: policePrintIdentity(row.idDocumentNumber),
    room: policeBlank(row.roomNumber),
  };
}
