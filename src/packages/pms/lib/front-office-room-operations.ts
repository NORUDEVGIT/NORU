/**
 * Front Office Phase 1 — Room Quick View / operations helpers.
 * Read-model only. No availability engine, no FO room-status writer, no FO block table.
 */
import {
  evaluateRoomReadinessWithPolicy,
  type HousekeepingReadinessPolicy,
} from "./housekeeping-card2.server";
import {
  isOooOrOos,
  type ExceptionRow,
  type FolioSignalLane,
  type LiveExceptionType,
} from "./fo-exceptions";
import type { ReservationStatus } from "./reservation-dates";
import { rackRoomStatusDisplay } from "./front-office-shell";

/** Desktop operational width for Front Office Room Quick View (~70–78% viewport, max ~1180px). */
export const FO_ROOM_QUICK_VIEW_SHEET_MAX_CLASS =
  "w-full max-w-none sm:w-[min(78vw,1180px)] sm:max-w-[1180px]";

/** Main two-column workspace: narrower room column, wider stay/guest column. */
export const FO_ROOM_QUICK_VIEW_MAIN_GRID_CLASS = "md:grid-cols-[0.36fr_0.64fr]";

/** Right column: guest/stay/folio/requests in a 2×2 card grid on desktop. */
export const FO_ROOM_QUICK_VIEW_RIGHT_GRID_CLASS = "md:grid-cols-2";

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
  adults: number | null;
  children: number | null;
  nights: number | null;
  rateLabel: string | null;
  packageName: string | null;
  specialRequests: string | null;
};

export type FoRoomGuestSnapshot = {
  guestId: string;
  fullName: string;
  nationality: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  vip: boolean;
};

export type FoRoomInfoSnapshot = {
  imageUrl: string | null;
  view: string | null;
  size: string | null;
  bedType: string | null;
  amenities: string[];
};

export type FoRoomFolioSnapshot = {
  lane: FolioSignalLane;
  folioId: string | null;
  folioNumber: string | null;
  totalCharges: number | null;
  totalPayments: number | null;
  balance: number | null;
};

export type FoRoomSpecialRequestsSnapshot = {
  reservationText: string | null;
  guestPreferencesText: string | null;
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
  roomInfo: FoRoomInfoSnapshot;
  inHouseGuest: FoRoomGuestSnapshot | null;
  folio: FoRoomFolioSnapshot;
  specialRequests: FoRoomSpecialRequestsSnapshot;
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
  housekeepingPolicy?: HousekeepingReadinessPolicy;
}): { ready: boolean; reason: string | null } {
  return evaluateRoomReadinessWithPolicy(
    {
      status: input.physicalStatus,
      housekeepingStatus: input.housekeepingStatus,
      maintenanceStatus: input.maintenanceStatus,
    },
    input.housekeepingPolicy,
  );
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
    hasConflict:
      input.hasDiscrepancy || (preArrival && !input.ready) || isOooOrOos(input.physicalStatus),
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
    if (filters.eventType && filters.eventType !== "all" && row.eventType !== filters.eventType)
      return false;
    if (filters.reservationId && row.reservationId !== filters.reservationId) return false;
    return true;
  });
}

export function queueFromExceptionRows(rows: ExceptionRow[]): RoomOpsQueueItem[] {
  return rows
    .filter(
      (row) =>
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

export function activeBlockQueueItem(
  block: FoRoomBlockImpact,
  roomNumber: string | null,
  roomId: string | null,
): RoomOpsQueueItem {
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

export function vacantQuickViewHasNoStay(
  view: Pick<FoRoomQuickView, "occupancy" | "currentStay">,
): boolean {
  return view.occupancy === "vacant" && view.currentStay === null;
}

export function foRoomQuickViewStatusPill(
  view: Pick<FoRoomQuickView, "occupancy" | "physicalStatus">,
) {
  return rackRoomStatusDisplay({ status: view.physicalStatus, occupancy: view.occupancy });
}

export function foRoomQuickViewHousekeepingLabel(status: string | null): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "—";
  return raw.replaceAll("_", " ");
}

export function foRoomQuickViewMaintenanceLabel(status: string | null): string {
  const raw = String(status ?? "").trim();
  if (!raw || raw === "normal") return "Normal";
  return raw.replaceAll("_", " ");
}

export function foRoomQuickViewSellableLabel(
  view: Pick<FoRoomQuickView, "sellable" | "physicalStatus" | "blocks">,
): string {
  if (isOooOrOos(view.physicalStatus)) return "No";
  if (view.blocks.length > 0) return "No";
  return view.sellable ? "Yes" : "No";
}

export function foRoomQuickViewHasActiveStay(view: Pick<FoRoomQuickView, "currentStay">): boolean {
  return view.currentStay?.status === "checked_in";
}

export function foRoomQuickViewStayDependentDisabled(
  view: Pick<FoRoomQuickView, "currentStay" | "folio">,
): boolean {
  return !view.currentStay || view.currentStay.status !== "checked_in";
}

export type FoRoomQuickViewLayoutMode = "vacant_idle" | "vacant_assigned" | "occupied";

export function foRoomQuickViewLayoutMode(
  view: Pick<FoRoomQuickView, "occupancy" | "currentStay" | "assignedArrival">,
): FoRoomQuickViewLayoutMode {
  if (foRoomQuickViewHasActiveStay(view)) return "occupied";
  if (view.occupancy === "vacant" && view.assignedArrival) return "vacant_assigned";
  return "vacant_idle";
}

export const FO_ROOM_QV_ACTIVITY_PAGE_SIZE = 5;

export type FoRoomQuickViewQuickActionKey =
  | "move"
  | "change_room"
  | "extend_stay"
  | "add_guest"
  | "guest_services"
  | "view_reservation"
  | "open_folio"
  | "add_note"
  | "assign"
  | "check_in"
  | "check_out"
  | "housekeeping"
  | "maintenance"
  | "view_block"
  | "view_history";

export function foRoomQuickViewQuickActionVisibility(input: {
  hints: FoRoomActionHints;
  layoutMode: FoRoomQuickViewLayoutMode;
  inHouseGuest: FoRoomGuestSnapshot | null;
  folio: FoRoomFolioSnapshot;
}): Record<FoRoomQuickViewQuickActionKey, boolean> {
  const { hints, layoutMode, folio, inHouseGuest } = input;
  const occupied = layoutMode === "occupied";
  const assigned = layoutMode === "vacant_assigned";
  const reservationContext = occupied || assigned;
  const folioOpenable = Boolean(folio.folioId) && folio.lane === "live";

  return {
    move: hints.canMoveGuest,
    change_room: hints.canReassign || hints.canMoveGuest,
    extend_stay: occupied,
    add_guest: occupied,
    guest_services: Boolean(inHouseGuest),
    view_reservation: reservationContext && hints.canOpenStay,
    open_folio: folioOpenable,
    add_note: reservationContext && hints.canOpenStay,
    assign: hints.canAssign,
    check_in: hints.canCheckIn,
    check_out: hints.canCheckOut,
    housekeeping: hints.canOpenHousekeeping,
    maintenance: hints.canOpenMaintenance,
    view_block: hints.hasBlock,
    view_history: true,
  };
}

export function paginateFoRoomHistory(
  rows: FoRoomHistoryRow[],
  page: number,
  pageSize: number = FO_ROOM_QV_ACTIVITY_PAGE_SIZE,
): { rows: FoRoomHistoryRow[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page: safePage, totalPages };
}

export function formatFoRoomQuickViewHistoryWhen(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt.slice(0, 16).replace("T", " ");
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatFoRoomHistoryTableRow(row: FoRoomHistoryRow): {
  when: string;
  user: string;
  action: string;
  details: string;
} {
  return {
    when: formatFoRoomQuickViewHistoryWhen(row.createdAt),
    user: row.actorName ?? "—",
    action: row.eventType.replaceAll("_", " "),
    details: row.summary,
  };
}
