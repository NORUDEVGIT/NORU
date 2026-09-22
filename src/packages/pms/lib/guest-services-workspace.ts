/**
 * Guest Profile Services workspace helpers.
 * Catalogue: Card 4 pms_guest_service_types. Rows: guest_service_history.
 */

import { isInHouseStay, isUpcomingStay, type GuestStay } from "./guest-profile-wave3.ts";

export const GUEST_SERVICES_WORKSPACE_MIGRATION_FILE = "0089_pms_guest_services_workspace.sql";
export const GUEST_SERVICES_TITLE = "Guest Services";
export const GUEST_SERVICES_COPY =
  "Manage guest service requests and track their status during the stay.";
export const GUEST_SERVICES_EMPTY = "No service requests yet";
export const GUEST_SERVICES_NO_TYPES =
  "Configure active Guest Service Types in Guest & Services Settings.";

export const GUEST_SERVICE_STATUSES = [
  "requested",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type GuestServiceStatus = (typeof GUEST_SERVICE_STATUSES)[number];

export const GUEST_SERVICE_STATUS_LABELS: Record<GuestServiceStatus, string> = {
  requested: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const GUEST_SERVICE_PRIORITIES = ["normal", "high", "urgent"] as const;
export type GuestServicePriority = (typeof GUEST_SERVICE_PRIORITIES)[number];

export const GUEST_SERVICE_PRIORITY_LABELS: Record<GuestServicePriority, string> = {
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const GUEST_SERVICE_DESCRIPTION_MAX = 2000;

export type GuestServiceStayScope = "all" | "current" | "future" | "previous" | "general";

export function isGuestServiceStatus(value: string): value is GuestServiceStatus {
  return (GUEST_SERVICE_STATUSES as readonly string[]).includes(value);
}

export function allowedServiceStatusTransitions(status: GuestServiceStatus): GuestServiceStatus[] {
  if (status === "requested") return ["in_progress", "cancelled"];
  if (status === "in_progress") return ["completed", "cancelled"];
  return [];
}

export function canTransitionGuestService(from: GuestServiceStatus, to: GuestServiceStatus): boolean {
  return allowedServiceStatusTransitions(from).includes(to);
}

export function classifyGuestStayScope(
  stay: GuestStay,
  today: string,
): Exclude<GuestServiceStayScope, "all" | "general"> {
  if (isInHouseStay(stay.status)) return "current";
  if (isUpcomingStay(stay.status, stay.arrivalDate, today)) return "future";
  return "previous";
}

export function stayMatchesServiceScope(
  reservationId: string | null,
  stays: GuestStay[],
  scope: GuestServiceStayScope,
  today: string,
): boolean {
  if (scope === "all") return true;
  if (scope === "general") return !reservationId;
  if (!reservationId) return false;
  const stay = stays.find((row) => row.id === reservationId);
  if (!stay) return false;
  return classifyGuestStayScope(stay, today) === scope;
}

export function filterGuestServices<
  T extends {
    requestNumber: string | null;
    serviceName: string;
    notes: string | null;
    assignedName: string | null;
    roomNumber: string | null;
    confirmationNumber: string | null;
    status: string;
    reservationId: string | null;
  },
>(
  rows: T[],
  stays: GuestStay[],
  input: {
    search: string;
    status: GuestServiceStatus | "all";
    stayScope: GuestServiceStayScope;
    today: string;
  },
): T[] {
  const search = input.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (input.status !== "all" && row.status !== input.status) return false;
    if (!stayMatchesServiceScope(row.reservationId, stays, input.stayScope, input.today)) return false;
    if (!search) return true;
    const hay = [
      row.requestNumber,
      row.serviceName,
      row.notes,
      row.assignedName,
      row.roomNumber,
      row.confirmationNumber,
      row.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(search);
  });
}

export function guestServiceCounts(
  rows: Array<{ status: string }>,
): Record<GuestServiceStatus | "all", number> {
  const counts: Record<GuestServiceStatus | "all", number> = {
    all: rows.length,
    requested: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const row of rows) {
    if (isGuestServiceStatus(row.status)) counts[row.status] += 1;
  }
  return counts;
}

export function guestServiceRowActions(status: GuestServiceStatus): {
  start: boolean;
  complete: boolean;
  cancel: boolean;
  assign: boolean;
  note: boolean;
} {
  const open = status === "requested" || status === "in_progress";
  return {
    start: status === "requested",
    complete: status === "in_progress",
    cancel: open,
    assign: open,
    note: true,
  };
}

export function popularServiceTypes(
  rows: Array<{ serviceTypeId: string }>,
  types: Array<{ id: string; name: string; active: boolean }>,
  limit = 6,
): Array<{ id: string; name: string; count: number; active: boolean }> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.serviceTypeId, (counts.get(row.serviceTypeId) ?? 0) + 1);
  return types
    .filter((type) => type.active || (counts.get(type.id) ?? 0) > 0)
    .map((type) => ({
      id: type.id,
      name: type.name,
      count: counts.get(type.id) ?? 0,
      active: type.active,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}
