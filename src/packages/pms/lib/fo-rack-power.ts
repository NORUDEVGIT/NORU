/**
 * FO-FS5 — Room Rack + Calendar confirm-before-write (pure).
 *
 * Drop / resize never write. Confirm is the only path that may invoke
 * moveReservationRoom or changeStayDates({ arrival, departure }). Dirty /
 * pickup block DnD Confirm via isRoomReady; the menu Room Move dialog is
 * unchanged. Date Confirm is eligible for pending / confirmed / checked_in.
 * Never invent badge flags, package math, or a green checklist while an API
 * check is pending.
 */
import { isRoomReady, type RoomReadiness } from "./fo-check-in.ts";
import { RATE_IMPACT_UNAVAILABLE, rateImpact, type RateImpact } from "./fo-amendments.ts";
import {
  handleReservationBarDrop,
  hasSpecialRequestText,
  shouldShowDragHandle,
  sourceIsCorporate,
  sourceIsGroup,
  type FoWriteFns,
  type FoWriteName,
} from "./front-office-shell.ts";

export { shouldShowDragHandle };

export const RACK_CONFIRM_WIDTH_PX = { min: 480, max: 560 } as const;
export const RACK_MOVE_TITLE = "Move room";
export const RACK_DATES_TITLE = "Change stay dates";
export const RACK_MOVE_REASON = "Moved from Room Rack + Calendar";
export const RATE_IMPACT_UNAVAILABLE_LABEL = RATE_IMPACT_UNAVAILABLE;
export const NO_STAYS_MATCH_FILTERS = "No stays match these filters.";
export const UNAVAILABLE_TO_VERIFY = "Unavailable to verify";
export const RACK_LOAD_FAILED = "Room Rack + Calendar could not be loaded.";
export const RACK_WINDOW_TRUNCATED = "Room Rack + Calendar could not load every stay in this window.";
export const RACK_IN_HOUSE_ONLY = "This live action is only available for in-house guests.";
export const DATE_CHANGE_ELIGIBLE = ["pending", "confirmed", "checked_in"] as const;
export const CHOOSE_NEW_DATES = "Choose a new arrival or departure date.";
export const RACK_LIST_PAGE_SIZE = 200;
export const RACK_LIST_PAGE_SIZE_WIDE = 400;
export const RACK_LIST_PAGE_SIZE_MAX = 500;

export type CheckState = "pass" | "fail" | "unknown";

export type ValidationCheck = {
  id: string;
  label: string;
  state: CheckState;
  detail: string | null;
};

export type HardIllegalReason = "out_of_order" | "out_of_service" | "different_room_type";

export const HARD_ILLEGAL_TOAST: Record<HardIllegalReason, string> = {
  out_of_order: "That room is out of order.",
  out_of_service: "That room is out of service.",
  different_room_type: "Room moves must stay on the same room type.",
};

export type DropAction = "confirm_sheet" | "snap_back" | "noop";

export type VerticalDropResult =
  | { action: "confirm_sheet" }
  | { action: "snap_back"; reason: HardIllegalReason; message: string }
  | { action: "noop" };

export type AssignableLookup =
  | { state: "pending" }
  | { state: "error" }
  | { state: "ready"; roomIds: string[] };

export type StayBadgeTone = "gold" | "outline" | "green";
export type StayBadgeId =
  | "vip_badge"
  | "group_badge"
  | "corporate_badge"
  | "special_request_badge"
  | "room_discrepancy_badge";

export type LiveStayBadge = {
  id: StayBadgeId;
  label: string;
  tone: StayBadgeTone;
};

export type RackMoveDraft = {
  kind: "move_room";
  reservationId: string;
  guestName: string;
  confirmationNumber: string;
  status: string;
  currentRoomId: string | null;
  currentRoomNumber: string | null;
  currentRoomTypeId: string;
  currentRoomTypeName: string;
  targetRoomId: string;
  targetRoomNumber: string;
  targetRoomTypeId: string | null;
  targetRoomTypeName: string;
  targetStatus: string | null;
  targetHousekeeping: string | null;
  hkKnown: boolean;
  arrivalDate: string;
  departureDate: string;
};

export type RackDatesDraft = {
  kind: "change_dates";
  reservationId: string;
  guestName: string;
  confirmationNumber: string;
  status: string;
  currentRoomId: string | null;
  currentRoomNumber: string | null;
  currentRoomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  nextArrivalDate: string;
  nextDepartureDate: string;
  roomSubtotal: number | null;
  nightlyRates: Array<{ date: string; rate: number }> | null;
  currentRoomStatus?: string | null;
  currentHousekeeping?: string | null;
  hkKnown?: boolean;
};

export type RackConfirmDraft = RackMoveDraft | RackDatesDraft;

export function rackReservationPageSize(days: number): number {
  if (days >= 30) return RACK_LIST_PAGE_SIZE_WIDE;
  if (days >= 14) return 300;
  return RACK_LIST_PAGE_SIZE;
}

export function rackColumnMinPx(days: number): number {
  if (days >= 30) return 44;
  if (days >= 14) return 56;
  return 128;
}

export function badgeDisplayMode(days: number): "full" | "compact" {
  return days >= 14 ? "compact" : "full";
}

export function liveStayBadges(stay: {
  guestVip: boolean;
  source?: string | null;
  specialRequests?: string | null;
  hasOpenDiscrepancy?: boolean;
}): LiveStayBadge[] {
  const badges: LiveStayBadge[] = [];
  if (stay.guestVip) badges.push({ id: "vip_badge", label: "VIP", tone: "gold" });
  if (sourceIsGroup(stay.source)) badges.push({ id: "group_badge", label: "Group", tone: "outline" });
  if (sourceIsCorporate(stay.source)) badges.push({ id: "corporate_badge", label: "Corporate", tone: "outline" });
  if (hasSpecialRequestText(stay.specialRequests)) {
    badges.push({ id: "special_request_badge", label: "Special request", tone: "green" });
  }
  if (stay.hasOpenDiscrepancy) {
    badges.push({ id: "room_discrepancy_badge", label: "Discrepancy", tone: "outline" });
  }
  return badges;
}

export function rackFiltersActive(filters: {
  floor: string;
  roomType: string;
  roomStatus: string;
  hkStatus: string;
  resStatus: string;
  staySlice: string;
  vip: string;
  source: string;
  group: string;
  corporate: string;
  specialRequest: string;
  discrepancy?: string;
}): boolean {
  return Object.values(filters).some((value) => value !== "all");
}

export function classifyVerticalDrop(input: {
  reservationId: string;
  currentRoomId: string | null;
  stayRoomTypeId: string;
  stayRoomTypeName: string;
  targetRoomId: string;
  targetStatus: string | null;
  targetRoomTypeId: string | null;
  targetRoomTypeName: string | null;
}): VerticalDropResult {
  if (!input.targetRoomId || input.targetRoomId === input.currentRoomId) {
    return { action: "noop" };
  }
  if (input.targetStatus === "out_of_order") {
    return { action: "snap_back", reason: "out_of_order", message: HARD_ILLEGAL_TOAST.out_of_order };
  }
  if (input.targetStatus === "out_of_service") {
    return { action: "snap_back", reason: "out_of_service", message: HARD_ILLEGAL_TOAST.out_of_service };
  }
  if (input.targetRoomTypeId && input.targetRoomTypeId !== input.stayRoomTypeId) {
    return {
      action: "snap_back",
      reason: "different_room_type",
      message: HARD_ILLEGAL_TOAST.different_room_type,
    };
  }
  if (
    !input.targetRoomTypeId &&
    input.targetRoomTypeName &&
    input.targetRoomTypeName !== input.stayRoomTypeName
  ) {
    return {
      action: "snap_back",
      reason: "different_room_type",
      message: HARD_ILLEGAL_TOAST.different_room_type,
    };
  }
  void input.reservationId;
  return { action: "confirm_sheet" };
}

export function roomHasOverlap(input: {
  roomId: string;
  arrival: string;
  departure: string;
  excludeReservationId: string;
  stays: Array<{
    id: string;
    roomId: string | null;
    arrivalDate: string;
    departureDate: string;
    status: string;
  }>;
}): boolean {
  return input.stays.some(
    (stay) =>
      stay.id !== input.excludeReservationId &&
      stay.roomId === input.roomId &&
      (stay.status === "pending" || stay.status === "confirmed" || stay.status === "checked_in") &&
      stay.arrivalDate < input.departure &&
      stay.departureDate > input.arrival,
  );
}

function check(
  id: string,
  label: string,
  state: CheckState,
  detail: string | null = null,
): ValidationCheck {
  return { id, label, state, detail };
}

function inHouseCheck(status: string): ValidationCheck {
  if (status === "checked_in") return check("in_house", "In-house stay", "pass");
  return check("in_house", "In-house stay", "fail", RACK_IN_HOUSE_ONLY);
}

export function dateChangeIneligibleReason(status: string): string | null {
  if ((DATE_CHANGE_ELIGIBLE as readonly string[]).includes(status)) return null;
  if (status === "checked_out") return "This stay is checked out.";
  if (status === "cancelled") return "This stay is cancelled.";
  if (status === "no_show") return "This stay is a no-show.";
  return "This stay cannot change dates.";
}

function eligibleStayCheck(status: string): ValidationCheck {
  const reason = dateChangeIneligibleReason(status);
  if (!reason) return check("eligible", "Eligible stay", "pass");
  return check("eligible", "Eligible stay", "fail", reason);
}

function assignedRoomHousekeepingCheck(input: {
  status: string | null;
  housekeepingStatus: string | null;
  hkKnown: boolean;
}): ValidationCheck {
  if (!input.hkKnown || !input.status) {
    return check("housekeeping", "Housekeeping", "unknown", UNAVAILABLE_TO_VERIFY);
  }
  return check("housekeeping", "Housekeeping", "pass");
}

function housekeepingCheck(input: {
  status: string | null;
  housekeepingStatus: string | null;
  hkKnown: boolean;
}): ValidationCheck {
  if (!input.hkKnown || !input.status) {
    return check("housekeeping", "Housekeeping", "unknown", UNAVAILABLE_TO_VERIFY);
  }
  const room: RoomReadiness = {
    status: input.status,
    housekeepingStatus: input.housekeepingStatus,
  };
  const ready = isRoomReady(room);
  if (ready.ready) return check("housekeeping", "Housekeeping", "pass");
  return check("housekeeping", "Housekeeping", "fail", ready.reason);
}

function availabilityCheck(input: {
  localOverlap: boolean;
  lookup: AssignableLookup | null;
  targetRoomId: string;
}): ValidationCheck {
  if (input.localOverlap) {
    return check("availability", "Stay window", "fail", "That room already has a stay on these dates.");
  }
  if (!input.lookup || input.lookup.state === "pending" || input.lookup.state === "error") {
    return check("availability", "Stay window", "unknown", UNAVAILABLE_TO_VERIFY);
  }
  if (input.lookup.roomIds.includes(input.targetRoomId)) {
    return check("availability", "Stay window", "pass");
  }
  return check("availability", "Stay window", "fail", "That room is not available for this stay window.");
}

function roomStatusCheck(status: string | null): ValidationCheck {
  if (!status) return check("room_status", "Room status", "unknown", UNAVAILABLE_TO_VERIFY);
  if (status === "out_of_order") {
    return check("room_status", "Room status", "fail", HARD_ILLEGAL_TOAST.out_of_order);
  }
  if (status === "out_of_service") {
    return check("room_status", "Room status", "fail", HARD_ILLEGAL_TOAST.out_of_service);
  }
  if (status !== "available") {
    return check("room_status", "Room status", "fail", "This room is not available.");
  }
  return check("room_status", "Room status", "pass");
}

export function evaluateMoveChecks(
  draft: RackMoveDraft,
  lookup: AssignableLookup | null,
  localOverlap: boolean,
): ValidationCheck[] {
  const sameType =
    draft.targetRoomTypeId
      ? draft.targetRoomTypeId === draft.currentRoomTypeId
      : draft.targetRoomTypeName
        ? draft.targetRoomTypeName === draft.currentRoomTypeName
        : null;
  return [
    inHouseCheck(draft.status),
    sameType == null
      ? check("same_type", "Same room type", "unknown", UNAVAILABLE_TO_VERIFY)
      : sameType
        ? check("same_type", "Same room type", "pass")
        : check("same_type", "Same room type", "fail", HARD_ILLEGAL_TOAST.different_room_type),
    roomStatusCheck(draft.targetStatus),
    housekeepingCheck({
      status: draft.targetStatus,
      housekeepingStatus: draft.targetHousekeeping,
      hkKnown: draft.hkKnown,
    }),
    availabilityCheck({ localOverlap, lookup, targetRoomId: draft.targetRoomId }),
  ];
}

export function evaluateDateChecks(
  draft: RackDatesDraft,
  lookup: AssignableLookup | null,
  localOverlap: boolean,
): ValidationCheck[] {
  const datesValid = draft.nextDepartureDate > draft.nextArrivalDate;
  const datesChanged =
    draft.nextArrivalDate !== draft.arrivalDate || draft.nextDepartureDate !== draft.departureDate;
  const checks: ValidationCheck[] = [
    eligibleStayCheck(draft.status),
    datesValid
      ? check("dates_valid", "Valid dates", "pass")
      : check("dates_valid", "Valid dates", "fail", "Departure must be after arrival."),
    datesChanged
      ? check("dates_changed", "Dates changed", "pass")
      : check("dates_changed", "Dates changed", "fail", CHOOSE_NEW_DATES),
  ];
  if (draft.currentRoomId) {
    checks.push(
      availabilityCheck({
        localOverlap,
        lookup,
        targetRoomId: draft.currentRoomId,
      }),
    );
    if (draft.currentRoomStatus !== undefined) {
      checks.push(roomStatusCheck(draft.currentRoomStatus));
    }
    if (draft.hkKnown !== undefined) {
      checks.push(
        assignedRoomHousekeepingCheck({
          status: draft.currentRoomStatus ?? null,
          housekeepingStatus: draft.currentHousekeeping ?? null,
          hkKnown: draft.hkKnown,
        }),
      );
    }
  }
  return checks;
}

export function stayDateWriteInput(draft: RackDatesDraft): { arrival: string; departure: string } {
  return { arrival: draft.nextArrivalDate, departure: draft.nextDepartureDate };
}

export function evaluateRackChecks(
  draft: RackConfirmDraft,
  lookup: AssignableLookup | null,
  localOverlap: boolean,
): ValidationCheck[] {
  return draft.kind === "move_room"
    ? evaluateMoveChecks(draft, lookup, localOverlap)
    : evaluateDateChecks(draft, lookup, localOverlap);
}

export function canConfirmRackChecks(checks: ValidationCheck[]): boolean {
  return checks.length > 0 && checks.every((item) => item.state === "pass");
}

export function rackRateImpact(draft: RackDatesDraft): RateImpact {
  return rateImpact({
    roomSubtotal: draft.roomSubtotal,
    nightlyRates: draft.nightlyRates,
  });
}

export function formatFoDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function confirmSheetTitle(kind: RackConfirmDraft["kind"]): string {
  return kind === "move_room" ? RACK_MOVE_TITLE : RACK_DATES_TITLE;
}

/** Drop never writes — sheet / snap-back only. */
export function onRackDrop(
  payload: { reservationId: string; targetRoomId: string },
  writes: FoWriteFns,
): { moved: false; write: false; invokedWrite: null } {
  const result = handleReservationBarDrop(payload, writes);
  return { moved: result.moved, write: result.write, invokedWrite: null };
}

/** Resize release never writes — sheet only. */
export function onRackResizeRelease(
  _payload: { reservationId: string; nextArrival: string; nextDeparture: string },
  writes: FoWriteFns,
): { openedSheet: true; invokedWrite: null } {
  void _payload;
  void writes.changeStayDates;
  return { openedSheet: true, invokedWrite: null };
}

export function cancelRackConfirm(writes: FoWriteFns): { invokedWrite: null } {
  void writes.moveReservationRoom;
  void writes.changeStayDates;
  return { invokedWrite: null };
}

export function confirmRackAction(
  kind: RackConfirmDraft["kind"],
  checks: ValidationCheck[],
  writes: FoWriteFns,
): { invokedWrite: FoWriteName | null } {
  if (!canConfirmRackChecks(checks)) return { invokedWrite: null };
  if (kind === "move_room") {
    writes.moveReservationRoom?.();
    return { invokedWrite: "moveReservationRoom" };
  }
  writes.changeStayDates?.();
  return { invokedWrite: "changeStayDates" };
}

export async function collectRackReservationPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ rows: T[]; total: number }>,
  pageSize: number,
): Promise<{ rows: T[]; total: number }> {
  const first = await fetchPage(1, pageSize);
  const rows = [...first.rows];
  if (rows.length >= first.total || first.rows.length < pageSize) {
    return { rows, total: first.total };
  }
  let page = 2;
  while (rows.length < first.total && page <= 25) {
    const next = await fetchPage(page, pageSize);
    rows.push(...next.rows);
    if (next.rows.length < pageSize) break;
    page += 1;
  }
  if (rows.length < first.total) {
    throw new Error(RACK_WINDOW_TRUNCATED);
  }
  return { rows, total: first.total };
}
