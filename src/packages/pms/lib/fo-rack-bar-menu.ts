/**
 * Room Rack stay-bar menu.
 * Items come from the existing Stay Quick View and in-house hint menus.
 * This module does not decide permissions on its own and does not write.
 */
import type { FrontOfficeStay } from "./frontoffice.functions";
import { foOpensPreArrivalCheckInWorkspace } from "./fo-check-in-workspace";
import { isStayCancellable } from "./fo-cancel-noshow";
import { foInHouseActionHints, inHouseMenuItems } from "./fo-inhouse";
import {
  stayFromReservation,
  stayQuickViewCanAmend,
  stayQuickViewMenuItems,
} from "./front-office-shell";
import { isNoShowPastDue } from "./fo-no-show-readiness";
import { RESERVATION_STATUSES, type ReservationStatus } from "./reservation-dates";
import { frontOfficeRoomTargets } from "./reservation-room-units";
import { primaryRoomOccupant } from "./reservation-room-occupants";
import type { ReservationDetail } from "./reservations.functions";

export type FoRackBarActionId =
  | "check_in"
  | "assign_room"
  | "change_room"
  | "edit_stay"
  | "no_show"
  | "cancel"
  | "open_folio"
  | "check_out"
  | "move_room"
  | "extend_stay"
  | "early_departure"
  | "add_service"
  | "guest_request"
  | "late_checkout"
  | "open_maintenance"
  | "view_details";

export type FoRackBarMenuItem = {
  id: FoRackBarActionId;
  label: string;
  tone: "default" | "destructive";
};

export const FO_RACK_UNRESOLVED_UNIT_MESSAGE =
  "This stay unit could not be resolved. Refresh the rack and try again.";

export type FoRackBarMenuInput = {
  status: ReservationStatus;
  assigned: boolean;
  arrivalDate: string;
  businessDate: string;
  canOpenCashiering: boolean;
  /** Same check the in-house room tab uses before showing Maintenance. */
  maintenanceRelevant: boolean;
  staffRole?: string;
  lateCheckoutNeedsApproval?: boolean;
};

/** Same relevance the in-house Move / Change Room tab uses for its Maintenance button. */
export function foRackMaintenanceRelevant(status: string | null | undefined): boolean {
  return Boolean(status && status !== "none");
}

export function foRackBarMenuItems(input: FoRackBarMenuInput): FoRackBarMenuItem[] {
  const quick = stayQuickViewMenuItems({ status: input.status, assigned: input.assigned });
  const quickIds = new Set(quick.map((item) => item.id));
  const folio =
    input.canOpenCashiering && quickIds.has("view_folio")
      ? [{ id: "open_folio" as const, label: "Open Folio", tone: "default" as const }]
      : [];

  if (input.status === "pending" || input.status === "confirmed") {
    const items: FoRackBarMenuItem[] = [];
    if (quickIds.has("check_in"))
      items.push({ id: "check_in", label: "Check In", tone: "default" });
    if (!input.assigned && quickIds.has("assign")) {
      items.push({ id: "assign_room", label: "Assign Room", tone: "default" });
    }
    if (input.assigned && foOpensPreArrivalCheckInWorkspace({ status: input.status })) {
      items.push({ id: "change_room", label: "Change Room", tone: "default" });
    }
    if (stayQuickViewCanAmend(input.status)) {
      items.push({ id: "edit_stay", label: "Amend / Edit Stay", tone: "default" });
    }
    items.push(...folio);
    if (
      quickIds.has("no_show") &&
      isNoShowPastDue(input.status, input.arrivalDate, input.businessDate)
    ) {
      items.push({ id: "no_show", label: "Mark No-Show", tone: "destructive" });
    }
    if (quickIds.has("cancel_fees") && isStayCancellable(input.status)) {
      items.push({ id: "cancel", label: "Cancel Reservation", tone: "destructive" });
    }
    return items;
  }

  if (input.status === "checked_in") {
    const hints = foInHouseActionHints({
      status: input.status,
      assigned: input.assigned,
      folioId: null,
      guestId: null,
      blockingKeys: [],
      staffRole: input.staffRole,
      lateCheckoutNeedsApproval: input.lateCheckoutNeedsApproval,
    });
    const housed = new Map(inHouseMenuItems(hints).map((item) => [item.id, item.label]));
    const items: FoRackBarMenuItem[] = [];
    if (housed.has("check_out"))
      items.push({ id: "check_out", label: "Check Out", tone: "default" });
    if (housed.has("room_move"))
      items.push({ id: "move_room", label: "Move Room", tone: "default" });
    if (housed.has("amend_stay")) {
      items.push({ id: "extend_stay", label: "Extend Stay", tone: "default" });
      items.push({ id: "early_departure", label: "Early Departure", tone: "default" });
    }
    items.push(...folio);
    if (housed.has("add_service")) {
      items.push({ id: "add_service", label: "Add Service", tone: "default" });
    }
    if (housed.has("guest_request")) {
      items.push({ id: "guest_request", label: "Guest Request", tone: "default" });
    }
    if (housed.has("late_checkout")) {
      items.push({
        id: "late_checkout",
        label: housed.get("late_checkout") ?? "Late Checkout",
        tone: "default",
      });
    }
    if (input.maintenanceRelevant) {
      items.push({ id: "open_maintenance", label: "Maintenance", tone: "default" });
    }
    return items;
  }

  if (
    input.status === "checked_out" ||
    input.status === "cancelled" ||
    input.status === "no_show"
  ) {
    return [...folio, { id: "view_details", label: "View stay details", tone: "default" }];
  }

  return [];
}

/**
 * One rack bar. `reservationRoomId` is the `hotel_reservation_rooms` row the bar draws.
 * It is null only when the reservation has no unit rows at all.
 */
export type FoRackStay = ReservationDetail & {
  reservationRoomId: string | null;
  /** Unique per bar; a multi-room reservation has one key per unit. */
  rackKey: string;
};

export type FoRackUnitIdentity =
  { kind: "unit"; reservationRoomId: string } | { kind: "header" } | { kind: "invalid" };

function rackStatus(value: string | null, fallback: ReservationStatus): ReservationStatus {
  return value && (RESERVATION_STATUSES as readonly string[]).includes(value)
    ? (value as ReservationStatus)
    : fallback;
}

function rackNights(arrival: string, departure: string): number {
  const ms = Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

/**
 * Rack projection of reservation list rows, read with their `hotel_reservation_rooms` units.
 * Each unit becomes its own bar on its own room and dates, carrying its own unit id.
 * A row read without units (`rooms` undefined) still renders, but its identity is invalid.
 */
export function projectRackStays(rows: readonly ReservationDetail[]): FoRackStay[] {
  const bars: FoRackStay[] = [];
  for (const row of rows) {
    const units = row.rooms;
    if (!units || units.length === 0) {
      bars.push({ ...row, reservationRoomId: null, rackKey: row.id });
      continue;
    }
    for (const unit of units) {
      // Each bar shows the guest in that room. The reservation number stays
      // on the header. The header guest is used only when this room has no occupant.
      const occupants = unit.occupants ?? [];
      const guest =
        primaryRoomOccupant(occupants) ?? occupants.find((row) => row.name.trim()) ?? null;
      bars.push({
        ...row,
        guestId: guest?.guestId ?? row.guestId,
        guestName: guest?.name ?? row.guestName,
        guestPhone: guest?.phone ?? row.guestPhone,
        roomId: unit.roomId,
        roomNumber: unit.roomId ? (unit.roomNumber ?? null) : null,
        roomTypeId: unit.roomTypeId,
        roomTypeName: unit.roomTypeName ?? row.roomTypeName,
        arrivalDate: unit.arrivalDate,
        departureDate: unit.departureDate,
        nights: rackNights(unit.arrivalDate, unit.departureDate),
        adults: unit.adults,
        children: unit.children,
        infants: unit.infants,
        status: rackStatus(unit.status, row.status),
        roomSubtotal: unit.roomSubtotal,
        nightlyRates: unit.nightlyRates,
        reservationRoomId: unit.id,
        rackKey: `${row.id}:${unit.id}`,
      });
    }
  }
  return bars;
}

/** Unit identity of a rack bar. A bar whose reservation has units must name one of them. */
export function foRackUnitIdentity(
  stay: Pick<FoRackStay, "reservationRoomId" | "rooms">,
): FoRackUnitIdentity {
  if (stay.rooms === undefined) return { kind: "invalid" };
  if (stay.reservationRoomId) {
    return stay.rooms.some((unit) => unit.id === stay.reservationRoomId)
      ? { kind: "unit", reservationRoomId: stay.reservationRoomId }
      : { kind: "invalid" };
  }
  return stay.rooms.length === 0 ? { kind: "header" } : { kind: "invalid" };
}

/** Stay passed into the existing desk handlers, scoped to the bar's own unit. */
export function foRackActionStay(stay: FoRackStay, businessDate: string): FrontOfficeStay {
  const identity = foRackUnitIdentity(stay);
  const roomUnits = stay.rooms?.length ? frontOfficeRoomTargets(stay.rooms) : undefined;
  return {
    ...stayFromReservation(stay, businessDate),
    guestEmail: stay.guestEmail ?? null,
    ...(identity.kind === "unit" ? { reservationRoomId: identity.reservationRoomId } : {}),
    ...(roomUnits?.length ? { roomUnits } : {}),
  };
}
