/**
 * Group Detail workspace helpers.
 * The operational entity is guest_account_masters.account_type = group.
 * Rooming list, itinerary, and financials are derived — not separate masters.
 */

import { uuidFirstSegment } from "./guest-profile-listing.ts";
import type { GuestAccountStatus } from "./guest-profile-wave4.ts";

export const GROUP_DETAIL_MIGRATION_FILE = "0096_pms_group_workspace.sql";

export const GROUP_DETAIL_NAV = [
  { id: "overview", title: "Overview", live: true },
  { id: "members", title: "Members", live: true },
  { id: "reservations", title: "Reservations", live: true },
  { id: "rooming", title: "Rooming List", live: true },
  { id: "financial", title: "Financials", live: true },
  { id: "communication", title: "Communication", live: true },
  { id: "history", title: "Activity", live: true },
] as const;

export type GroupDetailNavId = (typeof GROUP_DETAIL_NAV)[number]["id"];

export const GROUP_DETAIL_NAV_IDS = GROUP_DETAIL_NAV.map((item) => item.id);

export const GROUP_STATUS_LABELS: Record<GuestAccountStatus, string> = {
  pending: "Draft",
  active: "Confirmed",
  inactive: "Cancelled",
};

export const GROUP_MEMBER_STATUSES = ["expected", "confirmed", "cancelled"] as const;
export type GroupMemberStatus = (typeof GROUP_MEMBER_STATUSES)[number];

export const GROUP_MEMBER_STATUS_LABELS: Record<GroupMemberStatus, string> = {
  expected: "Expected",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

export const GROUP_IMPORT_RESULTS = ["imported", "matched", "created", "duplicate", "failed"] as const;
export type GroupImportResult = (typeof GROUP_IMPORT_RESULTS)[number];

export const GROUP_MASTER_COPY =
  "Group master in Guest. Reservations, rooms, and folios stay on their existing records.";

export const GROUP_ROOMING_COPY =
  "Rooming list is derived from group members, reservations, and hotel_reservations.room_id. It is not a second assignment store.";

export const GROUP_FINANCIAL_COPY =
  "Totals are derived from reservation folios. The group master does not store editable financial copies.";

export const GROUP_INVOICE_UNAVAILABLE =
  "Group invoices are not available yet. Folio charges and payments below are reservation-derived.";

export const GROUP_TEMPLATES_UNAVAILABLE =
  "Group templates are not a Phase 1 domain. Create groups from the master form.";

export const GROUP_TOUR_OPERATOR_COPY =
  "Tour operator profiles are not available yet. Use Travel Agencies for booker travel-agent masters.";

export const GROUP_AUTO_ASSIGN_COPY =
  "Auto assignment uses Room Inventory availability. Unassigned rooms are reported as failures — success is never faked.";

export const GROUP_WORKSPACE_UNAVAILABLE =
  "Unavailable until Guest Profile Group workspace migration 0096 is applied.";

export function isGroupDetailNavId(value: string | undefined): value is GroupDetailNavId {
  return Boolean(value && (GROUP_DETAIL_NAV_IDS as readonly string[]).includes(value));
}

export function groupDetailNav(id: string | undefined): GroupDetailNavId {
  return isGroupDetailNavId(id) ? id : "overview";
}

export function groupStatusLabel(status: string | null | undefined): string {
  if (status === "pending" || status === "active" || status === "inactive") {
    return GROUP_STATUS_LABELS[status];
  }
  return status || "Unknown";
}

export function generateGroupCode(groupId: string): string {
  const segment = uuidFirstSegment(groupId) ?? groupId.replace(/-/g, "").slice(0, 8).toLowerCase();
  return `GRP-${segment}`;
}

export function validateGroupDates(
  arrival: string | null | undefined,
  departure: string | null | undefined,
): string | null {
  const start = arrival?.trim() || null;
  const end = departure?.trim() || null;
  if (!start && !end) return null;
  if ((start && !end) || (!start && end)) return "Enter both arrival and departure dates.";
  if (!start || !end) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return "Enter valid stay dates.";
  }
  if (end <= start) return "Departure must be after arrival.";
  return null;
}

export function canConfirmGroup(input: {
  name: string | null | undefined;
  groupTypeId: string | null | undefined;
  arrivalDate: string | null | undefined;
  departureDate: string | null | undefined;
}): string | null {
  if (!input.name?.trim()) return "Group name is required before confirmation.";
  if (!input.groupTypeId) return "Select a group type before confirmation.";
  return validateGroupDates(input.arrivalDate, input.departureDate);
}

export function groupOverviewKpis(input: {
  memberCount: number;
  reservationCount: number;
  assignedRooms: number;
  expectedPax: number | null;
  expectedRooms: number | null;
}): {
  members: number;
  reservations: number;
  assignedRooms: number;
  expectedPax: number | null;
  expectedRooms: number | null;
} {
  return {
    members: input.memberCount,
    reservations: input.reservationCount,
    assignedRooms: input.assignedRooms,
    expectedPax: input.expectedPax,
    expectedRooms: input.expectedRooms,
  };
}

export function assignmentStatus(roomId: string | null | undefined): "assigned" | "unassigned" {
  return roomId ? "assigned" : "unassigned";
}

export function groupImportResultCounts(
  rows: Array<{ result: GroupImportResult }>,
): Record<GroupImportResult, number> {
  return {
    imported: rows.filter((row) => row.result === "imported").length,
    matched: rows.filter((row) => row.result === "matched").length,
    created: rows.filter((row) => row.result === "created").length,
    duplicate: rows.filter((row) => row.result === "duplicate").length,
    failed: rows.filter((row) => row.result === "failed").length,
  };
}
