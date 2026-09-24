import { isRoomReady } from "../fo-check-in";
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
): boolean {
  if (!roomId || !room) return isRoomReady(null).ready;
  return isRoomReady({
    status: room.operationalStatus,
    housekeepingStatus: room.housekeepingStatus,
  }).ready;
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
  if (!signal) return false;
  if (signal.depositWaived) return false;
  if (signal.depositPosted == null) return false;
  return signal.depositPosted <= 0;
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
}): ArrivalRow {
  const assigned = params.stay.roomId !== null;
  const operationalStatus = params.room?.operationalStatus ?? null;
  const housekeepingStatus = params.room?.housekeepingStatus ?? null;
  const ready = stayRoomReady(params.stay.roomId, params.room);
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
