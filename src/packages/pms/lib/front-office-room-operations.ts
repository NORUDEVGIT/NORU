/**
 * Front Office Phase 1 — Room Quick View / operations helpers.
 * Read-model only. No availability engine, no FO room-status writer, no FO block table.
 */
import { evaluateRoomReadinessWithPolicy } from "./housekeeping-card2.server";
import { isOooOrOos, type ExceptionRow, type LiveExceptionType } from "./fo-exceptions";
import type { ReservationStatus } from "./reservation-dates";

export const HK_HREF = "/restaurant/pms/housekeeping";
export const MAINTENANCE_HREF = "/restaurant/pms/maintenance";
export const INVENTORY_HREF = "/restaurant/pms/room-inventory";

export const ROOM_OPS_HISTORY_EVENTS = [
  "room_assigned",
  "room_changed",
  "room_moved",
  "check_in",
  "check_out",
] as const;

export type RoomOpsHistoryEvent = (typeof ROOM_OPS_HISTORY_EVENTS)[number];

export type FoRoomStaySnippet = {
  id: string;
  confirmationNumber: string;
  guestId: string;
  guestName: string;
  guestVip: boolean;
  status: ReservationStatus;
  arrivalDate: string;
  departureDate: string;
  roomTypeId: string;
  roomTypeName: string;
  ratePlanName: string | null;
};

export type FoRoomBlockImpact = {
  id: string;
  kind: "room" | "room_type" | "quantity";
  blockType: string;
  reason: string;
  startDate: string;
  endDate: string;
  groupId: string | null;
};

export type FoRoomHistoryRow = {
  id: string;
  source: "reservation" | "housekeeping";
  eventType: string;
  createdAt: string;
  actorName: string | null;
  reservationId: string | null;
  confirmationNumber: string | null;
  summary: string;
};

export type FoRoomActionHints = {
  canAssign: boolean;
  canReassign: boolean;
  canMoveGuest: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canOpenStay: boolean;
  canOpenHousekeeping: boolean;
  canOpenMaintenance: boolean;
  hasBlock: boolean;
  hasConflict: boolean;
};

export type FoRoomQuickView = {
  roomId: string;
  roomNumber: string;
  roomCode: string | null;
  roomTypeId: string;
  roomTypeName: string;
  floor: string | null;
  building: string | null;
  wing: string | null;
  maxOccupancy: number | null;
  physicalStatus: string;
  occupancy: "vacant" | "occupied";
  sellable: boolean;
  housekeepingStatus: string | null;
  maintenanceStatus: string | null;
  ready: boolean;
  readinessReason: string | null;
  restrictionReason: string | null;
  restrictionExpectedReturn: string | null;
  currentStay: FoRoomStaySnippet | null;
  assignedArrival: FoRoomStaySnippet | null;
  nextStay: FoRoomStaySnippet | null;
  blocks: FoRoomBlockImpact[];
  recentHistory: FoRoomHistoryRow[];
  actionHints: FoRoomActionHints;
};

export type RoomOpsQueueKind = LiveExceptionType | "assigned_not_ready" | "active_block";

export type RoomOpsQueueItem = {
  id: string;
  kind: RoomOpsQueueKind;
  label: string;
  reason: string;
  roomId: string | null;
  roomNumber: string | null;
  stayId: string | null;
  guestName: string | null;
  confirmationNumber: string | null;
};

export function occupancyOnDate(
  stay: { arrivalDate: string; departureDate: string; status: string },
  date: string,
): boolean {
  if (stay.status !== "pending" && stay.status !== "confirmed" && stay.status !== "checked_in") {
    return false;
  }
  return stay.arrivalDate <= date && stay.departureDate > date;
}

export function foRoomReadiness(input: {
  physicalStatus: string;
  housekeepingStatus: string | null;
  maintenanceStatus: string | null;
}): { ready: boolean; reason: string | null } {
  return evaluateRoomReadinessWithPolicy({
    status: input.physicalStatus,
    housekeepingStatus: input.housekeepingStatus,
    maintenanceStatus: input.maintenanceStatus,
  });
}

export function foRoomActionHints(input: {
  occupancy: "vacant" | "occupied";
  physicalStatus: string;
  ready: boolean;
  currentStay: FoRoomStaySnippet | null;
  assignedArrival: FoRoomStaySnippet | null;
  unassignedArrival: boolean;
  blocks: FoRoomBlockImpact[];
  hasDiscrepancy: boolean;
}): FoRoomActionHints {
  const stay = input.currentStay ?? input.assignedArrival;
  const preArrival = Boolean(stay && (stay.status === "pending" || stay.status === "confirmed"));
  return {
    canAssign: input.unassignedArrival,
    canReassign: preArrival,
    canMoveGuest: input.currentStay?.status === "checked_in",
    canCheckIn: stay?.status === "confirmed",
    canCheckOut: input.currentStay?.status === "checked_in",
    canOpenStay: Boolean(stay),
    canOpenHousekeeping: true,
    canOpenMaintenance: true,
    hasBlock: input.blocks.length > 0 || isOooOrOos(input.physicalStatus),
    hasConflict: input.hasDiscrepancy || (preArrival && !input.ready) || isOooOrOos(input.physicalStatus),
  };
}

export function historyTouchesRoom(
  roomId: string,
  previousValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): boolean {
  return previousValues?.room_id === roomId || newValues?.room_id === roomId;
}

export function isRoomOpsHistoryEvent(eventType: string): eventType is RoomOpsHistoryEvent {
  return (ROOM_OPS_HISTORY_EVENTS as readonly string[]).includes(eventType);
}

export function filterRoomOpsHistory(
  rows: FoRoomHistoryRow[],
  filters: { date?: string; eventType?: string; reservationId?: string },
): FoRoomHistoryRow[] {
  return rows.filter((row) => {
    if (filters.date && row.createdAt.slice(0, 10) !== filters.date) return false;
    if (filters.eventType && filters.eventType !== "all" && row.eventType !== filters.eventType) return false;
    if (filters.reservationId && row.reservationId !== filters.reservationId) return false;
    return true;
  });
}

export function queueFromExceptionRows(rows: ExceptionRow[]): RoomOpsQueueItem[] {
  return rows
    .filter((row) =>
      row.type === "unassigned" ||
      row.type === "room_unavailable" ||
      row.type === "room_discrepancy" ||
      row.type === "overbooking",
    )
    .map((row) => ({
      id: row.id,
      kind: row.type,
      label: row.label,
      reason: row.reason,
      roomId: row.roomId ?? null,
      roomNumber: row.roomNumber,
      stayId: row.stayId,
      guestName: row.guestName,
      confirmationNumber: row.confirmationNumber,
    }));
}

export function assignedNotReadyQueueItem(input: {
  stayId: string;
  guestName: string;
  confirmationNumber: string;
  roomId: string;
  roomNumber: string | null;
  reason: string;
}): RoomOpsQueueItem {
  return {
    id: `assigned_not_ready:${input.stayId}`,
    kind: "assigned_not_ready",
    label: "Assigned room not ready",
    reason: input.reason,
    roomId: input.roomId,
    roomNumber: input.roomNumber,
    stayId: input.stayId,
    guestName: input.guestName,
    confirmationNumber: input.confirmationNumber,
  };
}

export function activeBlockQueueItem(block: FoRoomBlockImpact, roomNumber: string | null, roomId: string | null): RoomOpsQueueItem {
  return {
    id: `active_block:${block.id}`,
    kind: "active_block",
    label: "Active inventory block",
    reason: `${block.blockType}: ${block.reason}`,
    roomId,
    roomNumber,
    stayId: null,
    guestName: null,
    confirmationNumber: null,
  };
}

export function vacantQuickViewHasNoStay(view: Pick<FoRoomQuickView, "occupancy" | "currentStay">): boolean {
  return view.occupancy === "vacant" && view.currentStay === null;
}
