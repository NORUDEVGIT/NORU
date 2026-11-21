import { isDepositSatisfied, isRoomReady } from "../fo-check-in";
import type { HousekeepingReadinessPolicy } from "../housekeeping-card2.server";
import { FOLIO_ZERO_EPSILON } from "../fo-check-out";
import type { FolioSignalLane, StayMoneySignal } from "../fo-exceptions";
import type { FrontOfficeStay } from "../frontoffice.functions";
import { normalizeClock } from "../pms-set1-foundation";
import type { ReservationStatus } from "../reservation-dates";
import { deskActionHints } from "./desk.server";
import type {
  ArrivalExceptionKey,
  ArrivalRow,
  ArrivalsDeparturesTotals,
  DepartureExceptionKey,
  DepartureRow,
  LateCheckoutPolicy,
  QuickViewFinancialState,
} from "./shared-read-models";

export type StayWriteRow = {
  id: string;
  status: string;
  arrival_date: string;
  departure_date: string;
  expected_arrival_at: string | null;
  late_checkout_granted: boolean | null;
  late_checkout_until: string | null;
  late_checkout_note: string | null;
};

export type RoomInventoryState = {
  operationalStatus: string | null;
  housekeepingStatus: string | null;
  maintenanceStatus?: string | null;
};

export function arrivalCheckInHint(input: {
  status: ReservationStatus;
  assigned: boolean;
  ready: boolean;
}): boolean {
  return input.status === "confirmed" && input.assigned && input.ready;
}

export function departureCheckOutHint(status: ReservationStatus): boolean {
  return status === "checked_in";
}

export function canUpdateEta(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed";
}

export function arrivalDepartureExtensionHint(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed" || status === "checked_in";
}

export function canGrantLateCheckoutHint(status: ReservationStatus, allowed: boolean): boolean {
  return status === "checked_in" && allowed;
}

export function stayRoomReady(
  roomId: string | null,
  room: RoomInventoryState | undefined,
  settings?: HousekeepingReadinessPolicy,
): boolean {
  if (!roomId || !room) return isRoomReady(null).ready;
  return isRoomReady(
    {
      status: room.operationalStatus,
      housekeepingStatus: room.housekeepingStatus,
      maintenanceStatus: room.maintenanceStatus ?? null,
    },
    settings,
  ).ready;
}

export function financialFromSignal(
  folioLane: FolioSignalLane,
  signal: StayMoneySignal | undefined,
): ArrivalRow["financial"] {
  if (folioLane === "permission_denied") {
    return {
      state: "permission_denied",
      folioId: null,
      balance: null,
      depositPosted: null,
      depositWaived: null,
    };
  }
  if (folioLane !== "live") {
    return {
      state: "not_available",
      folioId: null,
      balance: null,
      depositPosted: null,
      depositWaived: null,
    };
  }
  return {
    state: "available",
    folioId: signal?.folioId ?? null,
    balance: signal?.balance ?? null,
    depositPosted: signal?.depositPosted ?? null,
    depositWaived: signal ? signal.depositWaived : null,
  };
}

export function arrivalDepositUnpaid(signal: StayMoneySignal | undefined): boolean {
  if (!signal || signal.depositWaived) return false;
  const required = signal.paymentRequired;
  if (required == null || required <= 0) return false;
  return !isDepositSatisfied({
    postedAmount: signal.paymentPosted ?? 0,
    waived: false,
    requiredAmount: required,
  });
}

export function outstandingBalance(signal: StayMoneySignal | undefined): boolean {
  if (!signal || signal.balance == null) return false;
  return Math.abs(signal.balance) >= FOLIO_ZERO_EPSILON;
}

export function arrivalExceptionKeys(input: {
  status: ReservationStatus;
  roomId: string | null;
  operationalStatus: string | null;
  housekeepingStatus: string | null;
  ready: boolean;
  financialState: QuickViewFinancialState;
  depositUnpaid: boolean;
  outstandingBalance: boolean;
  specialRequests: string | null;
}): ArrivalExceptionKey[] {
  const keys: ArrivalExceptionKey[] = [];
  if (input.roomId === null) keys.push("unassigned");
  if (input.roomId && !input.ready) {
    if (
      input.operationalStatus === "out_of_order" ||
      input.operationalStatus === "out_of_service"
    ) {
      keys.push("room_unavailable");
    } else {
      keys.push("room_not_ready");
    }
  }
  if (input.financialState === "available" && (input.depositUnpaid || input.outstandingBalance)) {
    keys.push("payment_issue");
  }
  if ((input.specialRequests ?? "").trim() !== "") keys.push("special_request");
  return keys;
}

export function departureExceptionKeys(input: {
  overstay: boolean;
  financialState: QuickViewFinancialState;
  outstandingBalance: boolean;
}): DepartureExceptionKey[] {
  const keys: DepartureExceptionKey[] = [];
  if (input.overstay) keys.push("overstay");
  if (input.financialState === "available" && input.outstandingBalance) keys.push("payment_issue");
  return keys;
}

export function mapArrivalRow(params: {
  stay: FrontOfficeStay;
  room: RoomInventoryState | undefined;
  folioLane: FolioSignalLane;
  signal: StayMoneySignal | undefined;
  housekeepingPolicy?: HousekeepingReadinessPolicy;
}): ArrivalRow {
  const assigned = params.stay.roomId !== null;
  const operationalStatus = params.room?.operationalStatus ?? null;
  const housekeepingStatus = params.room?.housekeepingStatus ?? null;
  const ready = stayRoomReady(params.stay.roomId, params.room, params.housekeepingPolicy);
  const financial = financialFromSignal(params.folioLane, params.signal);
  const canOpenFolio = financial.state === "available" && financial.folioId !== null;
  const desk = deskActionHints({ status: params.stay.status, roomId: params.stay.roomId });

  return {
    reservationId: params.stay.id,
    confirmationNumber: params.stay.confirmationNumber,
    guest: {
      id: params.stay.guestId,
      name: params.stay.guestName,
      vip: params.stay.guestVip,
      phone: params.stay.guestPhone,
      email: params.stay.guestEmail,
    },
    stay: {
      arrivalDate: params.stay.arrivalDate,
      departureDate: params.stay.departureDate,
      nights: params.stay.nights,
      adults: params.stay.adults,
      children: params.stay.children,
      status: params.stay.status,
    },
    room: {
      roomTypeId: params.stay.roomTypeId,
      roomTypeName: params.stay.roomTypeName,
      roomId: params.stay.roomId,
      roomNumber: params.stay.roomNumber,
      assigned,
      housekeepingStatus,
      operationalStatus,
      ready,
    },
    commercial: {
      source: params.stay.source ?? null,
      guaranteeMethod: params.stay.guaranteeMethod ?? null,
    },
    financial,
    operational: {
      specialRequests: params.stay.specialRequests,
      unassigned: !assigned,
      walkInIncomplete: params.stay.walkInIncomplete === true,
      expectedArrivalTime: params.stay.expectedArrivalAt ?? null,
      exceptionKeys: arrivalExceptionKeys({
        status: params.stay.status,
        roomId: params.stay.roomId,
        operationalStatus,
        housekeepingStatus,
        ready,
        financialState: financial.state,
        depositUnpaid: arrivalDepositUnpaid(params.signal),
        outstandingBalance: outstandingBalance(params.signal),
        specialRequests: params.stay.specialRequests,
      }),
    },
    hints: {
      canOpen: true,
      canAssignRoom: desk.canAssignRoom,
      canCheckIn: arrivalCheckInHint({ status: params.stay.status, assigned, ready }),
      canUpdateEta: canUpdateEta(params.stay.status),
      canViewGuest: Boolean(params.stay.guestId),
      canOpenFolio,
    },
  };
}

export function mapDepartureRow(params: {
  stay: FrontOfficeStay;
  room: RoomInventoryState | undefined;
  folioLane: FolioSignalLane;
  signal: StayMoneySignal | undefined;
  policy: LateCheckoutPolicy;
}): DepartureRow {
  const financial = financialFromSignal(params.folioLane, params.signal);
  const granted = params.stay.lateCheckoutGranted === true;
  return {
    reservationId: params.stay.id,
    confirmationNumber: params.stay.confirmationNumber,
    guest: {
      id: params.stay.guestId,
      name: params.stay.guestName,
      vip: params.stay.guestVip,
    },
    stay: {
      arrivalDate: params.stay.arrivalDate,
      departureDate: params.stay.departureDate,
      status: params.stay.status,
      inHouse: params.stay.status === "checked_in",
      overstay: params.stay.overstay,
    },
    room: {
      roomTypeId: params.stay.roomTypeId,
      roomTypeName: params.stay.roomTypeName,
      roomId: params.stay.roomId,
      roomNumber: params.stay.roomNumber,
      housekeepingStatus: params.room?.housekeepingStatus ?? null,
      operationalStatus: params.room?.operationalStatus ?? null,
    },
    financial,
    operational: {
      specialRequests: params.stay.specialRequests,
      lateCheckout: {
        granted,
        until: granted ? (params.stay.lateCheckoutUntil ?? null) : null,
        note: granted ? (params.stay.lateCheckoutNote ?? null) : null,
        policy: params.policy,
      },
      exceptionKeys: departureExceptionKeys({
        overstay: params.stay.overstay,
        financialState: financial.state,
        outstandingBalance: outstandingBalance(params.signal),
      }),
    },
    hints: {
      canOpen: true,
      canCheckOut: departureCheckOutHint(params.stay.status),
      canExtendStay: arrivalDepartureExtensionHint(params.stay.status),
      canGrantLateCheckout: canGrantLateCheckoutHint(params.stay.status, params.policy.allowed),
      canOpenFolio: financial.state === "available" && financial.folioId !== null,
    },
  };
}

export function dailyControlTotals(
  arrivals: ArrivalRow[],
  departures: DepartureRow[],
): ArrivalsDeparturesTotals {
  return {
    arrivals: arrivals.length,
    departures: departures.length,
    unassignedArrivals: arrivals.filter((row) => row.operational.unassigned).length,
    notReadyArrivals: arrivals.filter((row) => row.room.assigned && !row.room.ready).length,
    arrivalExceptions: arrivals.filter((row) => row.operational.exceptionKeys.length > 0).length,
    departureExceptions: departures.filter((row) => row.operational.exceptionKeys.length > 0).length,
    overstays: departures.filter((row) => row.stay.overstay).length,
    departurePaymentIssues: departures.filter((row) =>
      row.operational.exceptionKeys.includes("payment_issue"),
    ).length,
    checkedInToday: null,
    checkedOutToday: null,
  };
}

export function zonedCalendarDate(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}

export function zonedClockMinutes(iso: string, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  } catch {
    const date = new Date(iso);
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function clockMinutes(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function assertEtaLifecycle(status: string): void {
  if (status === "pending" || status === "confirmed") return;
  throw new Error("Expected arrival can only be set before check-in.");
}

export function assertExpectedArrivalInstant(params: {
  expectedArrivalAt: string | null;
  arrivalDate: string;
  timezone: string;
}): string | null {
  if (params.expectedArrivalAt == null || params.expectedArrivalAt.trim() === "") return null;
  const at = params.expectedArrivalAt.trim();
  if (Number.isNaN(Date.parse(at))) throw new Error("Expected arrival must be a valid timestamp.");
  const iso = new Date(at).toISOString();
  if (zonedCalendarDate(iso, params.timezone) !== params.arrivalDate) {
    throw new Error("Expected arrival must fall on the reservation arrival date.");
  }
  return iso;
}


export type DepartureDayTiming =
  | { kind: "before_checkout"; checkOutTime: string; deadlineLabel: string }
  | {
      kind: "approved_late_checkout";
      checkOutTime: string;
      lateCheckoutUntil: string;
      deadlineLabel: string;
    }
  | {
      kind: "departure_overdue";
      reason: "past_checkout" | "late_checkout_expired";
      checkOutTime: string;
      lateCheckoutUntil: string | null;
      deadlineLabel: string;
    };

/** Property-local HH:mm for an instant. Falls back to UTC clock on bad timezones. */
export function formatZonedClock(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    const date = new Date(iso);
    return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  }
}

/**
 * Same-day departure timing for a checked-in stay on the business date.
 * Calendar overstays (departureDate < businessDate) are handled by the caller.
 * Uses property timezone only — never the browser clock.
 */
export function evaluateDepartureDayTiming(params: {
  departureDate: string;
  businessDate: string;
  checkedAt: string;
  timezone: string;
  checkOutTime: string | null;
  lateCheckoutGranted: boolean;
  lateCheckoutUntil: string | null;
}): DepartureDayTiming | null {
  if (params.departureDate !== params.businessDate) return null;
  const checkOutTime = normalizeClock(params.checkOutTime) || "12:00";
  const nowMinutes = zonedClockMinutes(params.checkedAt, params.timezone);
  const checkoutMinutes = clockMinutes(checkOutTime);
  const lateUntil =
    params.lateCheckoutGranted && params.lateCheckoutUntil && !Number.isNaN(Date.parse(params.lateCheckoutUntil))
      ? new Date(params.lateCheckoutUntil).toISOString()
      : null;

  if (lateUntil) {
    const untilMinutes = zonedClockMinutes(lateUntil, params.timezone);
    const deadlineLabel = formatZonedClock(lateUntil, params.timezone);
    if (nowMinutes <= untilMinutes) {
      return {
        kind: "approved_late_checkout",
        checkOutTime,
        lateCheckoutUntil: lateUntil,
        deadlineLabel,
      };
    }
    return {
      kind: "departure_overdue",
      reason: "late_checkout_expired",
      checkOutTime,
      lateCheckoutUntil: lateUntil,
      deadlineLabel,
    };
  }

  if (nowMinutes <= checkoutMinutes) {
    return {
      kind: "before_checkout",
      checkOutTime,
      deadlineLabel: checkOutTime,
    };
  }

  return {
    kind: "departure_overdue",
    reason: "past_checkout",
    checkOutTime,
    lateCheckoutUntil: null,
    deadlineLabel: checkOutTime,
  };
}

/** FO Attention / rack labels for departure timing — same clock as Night Audit. */
export type FoDepartureAttentionKind =
  | "checkout_overdue"
  | "late_checkout_expired"
  | "calendar_overstay";

export type FoDepartureAttention = {
  kind: FoDepartureAttentionKind;
  label: string;
};

export const FO_DEPARTURE_ATTENTION_LABEL: Record<FoDepartureAttentionKind, string> = {
  checkout_overdue: "Checkout overdue",
  late_checkout_expired: "Late checkout expired",
  calendar_overstay: "Departure overdue",
};

/**
 * Front Office departure attention for a checked-in stay.
 * Calendar overstay is exclusive of same-day timing (no double classification).
 * Reuses evaluateDepartureDayTiming — never a second clock/date engine.
 */
export function classifyFoDepartureAttention(params: {
  status: string;
  departureDate: string;
  businessDate: string;
  checkedAt: string;
  timezone: string;
  checkOutTime: string | null;
  lateCheckoutGranted: boolean;
  lateCheckoutUntil: string | null;
}): FoDepartureAttention | null {
  if (params.status !== "checked_in") return null;
  if (params.departureDate < params.businessDate) {
    return {
      kind: "calendar_overstay",
      label: FO_DEPARTURE_ATTENTION_LABEL.calendar_overstay,
    };
  }
  if (params.departureDate !== params.businessDate) return null;
  const timing = evaluateDepartureDayTiming({
    departureDate: params.departureDate,
    businessDate: params.businessDate,
    checkedAt: params.checkedAt,
    timezone: params.timezone,
    checkOutTime: params.checkOutTime,
    lateCheckoutGranted: params.lateCheckoutGranted,
    lateCheckoutUntil: params.lateCheckoutUntil,
  });
  if (!timing || timing.kind !== "departure_overdue") return null;
  if (timing.reason === "late_checkout_expired") {
    return {
      kind: "late_checkout_expired",
      label: FO_DEPARTURE_ATTENTION_LABEL.late_checkout_expired,
    };
  }
  return {
    kind: "checkout_overdue",
    label: FO_DEPARTURE_ATTENTION_LABEL.checkout_overdue,
  };
}

/**
 * Late-checkout grants are same-calendar-day only.
 * Calendar overstay (departure before business date) must not offer Late Checkout.
 */
export function foLateCheckoutActionEligible(params: {
  status: string;
  departureDate: string;
  businessDate: string;
}): boolean {
  return params.status === "checked_in" && params.departureDate === params.businessDate;
}

export function assertLateCheckoutUntil(params: {
  until: string;
  departureDate: string;
  checkOutTime: string | null;
  timezone: string;
}): string {
  if (Number.isNaN(Date.parse(params.until))) {
    throw new Error("Late checkout time must be a valid timestamp.");
  }
  const iso = new Date(params.until).toISOString();
  if (zonedCalendarDate(iso, params.timezone) !== params.departureDate) {
    throw new Error("Late checkout must stay on the existing departure date.");
  }
  const checkout = normalizeClock(params.checkOutTime) || "12:00";
  if (zonedClockMinutes(iso, params.timezone) <= clockMinutes(checkout)) {
    throw new Error("Late checkout must be later than the property check-out time.");
  }
  return iso;
}

export function parseLateCheckoutPolicy(row: {
  late_checkout_allowed?: boolean | null;
  late_checkout_fee?: number | string | null;
  late_checkout_needs_approval?: boolean | null;
  check_out_time?: string | null;
}): LateCheckoutPolicy {
  const feeRaw = row.late_checkout_fee;
  const fee =
    feeRaw == null || feeRaw === "" ? null : Number.isNaN(Number(feeRaw)) ? null : Number(feeRaw);
  return {
    allowed: row.late_checkout_allowed === true,
    fee,
    needsApproval: row.late_checkout_needs_approval === true,
    checkOutTime: normalizeClock(row.check_out_time) || null,
  };
}

/** Fixed-fee snapshot only — matches restaurants.late_checkout_fee semantics. */
function lateCheckoutFixedFeeFromCheckinOps(value: unknown): { allowed: boolean; fee: number | null } | null {
  if (!value || typeof value !== "object") return null;
  const late = (value as Record<string, unknown>)["lateCheckout"];
  if (!late || typeof late !== "object") return null;
  const rec = late as Record<string, unknown>;
  if (rec["feeBasis"] != null && rec["feeBasis"] !== "fixed") return null;
  const feeRaw = rec["feeValue"];
  const fee =
    feeRaw == null || feeRaw === "" ? null : Number.isNaN(Number(feeRaw)) ? null : Number(feeRaw);
  return {
    allowed: rec["allowed"] === true,
    fee: fee != null && Number.isFinite(fee) ? fee : null,
  };
}

/**
 * Canonical runtime is restaurants.late_checkout_*.
 * When those columns were never configured, a fixed-fee checkin_ops.lateCheckout
 * snapshot may still hold the Property & Business value (no mass migration).
 */
export function resolveLateCheckoutPolicy(row: {
  late_checkout_allowed?: boolean | null;
  late_checkout_fee?: number | string | null;
  late_checkout_needs_approval?: boolean | null;
  check_out_time?: string | null;
  checkin_ops?: unknown;
}): LateCheckoutPolicy {
  const runtime = parseLateCheckoutPolicy(row);
  const runtimeConfigured =
    runtime.fee != null ||
    row.late_checkout_allowed === true ||
    row.late_checkout_needs_approval === true;
  if (runtimeConfigured) return runtime;
  const snapshot = lateCheckoutFixedFeeFromCheckinOps(row.checkin_ops);
  if (!snapshot || (!snapshot.allowed && snapshot.fee == null)) return runtime;
  return {
    allowed: snapshot.allowed,
    fee: snapshot.fee,
    needsApproval: runtime.needsApproval,
    checkOutTime: runtime.checkOutTime,
  };
}
