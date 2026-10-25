import {
  DEFAULT_BOOKING_SOURCES,
  DEFAULT_MARKET_SEGMENTS,
  isStayRangeValid,
} from "@/packages/pms/lib/create-reservation-phase1";
import { formatStayDate, nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { occupancyExceeded } from "@/packages/pms/lib/fo-amendments";
import { REVIEW_DASH } from "@/packages/pms/lib/create-reservation-review";
import {
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  storedRatePerNight,
} from "@/packages/pms/lib/reservation-detail-overview";
import type {
  ReservationDetail,
  ReservationHistoryEntry,
} from "@/packages/pms/lib/reservations.functions";

export const EDIT_DASH = REVIEW_DASH;
export const EDIT_NO_CHANGE = "No change";
export const EDIT_NOT_EVALUATED = "Not evaluated";
export const EDIT_LOCAL_ONLY = "Not saved on confirm";
export const EDIT_DRAFT_LOCAL_COPY =
  "Draft saved on this device only. The reservation is not updated until you confirm.";
export const EDIT_CONFIRM_NEEDS_CHANGE =
  "Confirm is enabled when a persistable change passes current stay validation.";

export const EDIT_RESERVATION_STEPS = [
  { id: "details", label: "Edit Details", hint: "Update reservation information" },
  { id: "review", label: "Review Changes", hint: "See what will be updated" },
  { id: "confirm", label: "Confirm", hint: "Save the changes" },
] as const;

export type EditReservationStepId = (typeof EDIT_RESERVATION_STEPS)[number]["id"];

export type ReservationEditDraft = {
  guestId: string;
  guestName: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  ratePlanId: string | null;
  ratePlanName: string | null;
  specialRequests: string;
  notes: string;
  commercialBookingSource: string;
  marketSegment: string;
  externalReference: string;
  guaranteeMethod: string;
  /** Selected hotel_reservation_rooms row. Null until a multi-room stay picks a unit. */
  reservationRoomId: string | null;
  unitSequence: number | null;
  unitCount: number;
  unitStatus: string | null;
};

export type ReservationEditUnitSlice = {
  id: string;
  unitSequence: number;
  roomTypeId: string;
  roomId: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  ratePlanId: string | null;
  status: string | null;
  roomTypeName?: string | null;
  roomNumber?: string | null;
  ratePlanName?: string | null;
};

export type EditChangeRow = {
  item: string;
  before: string;
  after: string;
  change: string;
  persistable: boolean;
};

export type EditImpactRow = {
  id: string;
  title: string;
  status: "ok" | "warn" | "info" | "unevaluated";
  detail: string;
};

export type EditNextEvent = {
  id: string;
  title: string;
  detail: string;
};

function dash(value: string | number | null | undefined): string {
  if (value == null) return EDIT_DASH;
  const text = String(value).trim();
  return text ? text : EDIT_DASH;
}

export function stayDatesLabel(arrival: string, departure: string): string {
  if (!arrival || !departure) return EDIT_DASH;
  const nights = isStayRangeValid(arrival, departure) ? nightsBetween(arrival, departure) : 0;
  const nightLabel = nights === 1 ? "1 night" : `${nights} nights`;
  return `${formatStayDate(arrival)} – ${formatStayDate(departure)} (${nightLabel})`;
}

function commercialLabel(
  value: string,
  options: readonly { value: string; label: string }[],
): string {
  const match = options.find((option) => option.value === value);
  if (match) return match.label;
  const text = value.replaceAll("_", " ").trim();
  return text ? text : EDIT_DASH;
}

export function guestCountLabel(adults: number, children: number, infants?: number | null): string {
  const parts = [
    `${adults} Adult${adults === 1 ? "" : "s"}`,
    `${children} ${children === 1 ? "Child" : "Children"}`,
  ];
  if (infants != null) parts.push(`${infants} Infant${infants === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function assignmentLabel(roomNumber: string | null, roomTypeName: string): string {
  if (roomNumber) return `Room ${roomNumber} (${roomTypeName})`;
  return `Unassigned (${roomTypeName})`;
}

export function depositLabel(snapshot: unknown, money?: (value: number) => string): string {
  const deposit = parseDepositRequirementSnapshot(snapshot);
  if (!deposit) return EDIT_DASH;
  if (deposit.amount == null) {
    return deposit.required === false ? "Not required" : dash(deposit.name);
  }
  const amount = money ? money(deposit.amount) : String(deposit.amount);
  const method = deposit.tenderCode ? ` (${deposit.tenderCode.replaceAll("_", " ")})` : "";
  return `${amount}${method}`;
}

export function cancellationLabel(snapshot: unknown): string {
  return dash(snapshotDisplayName(snapshot));
}

export function packagesLabel(names: string[] | null | undefined): string {
  const list = (names ?? []).map((name) => name.trim()).filter(Boolean);
  return list.length ? list.join(", ") : EDIT_DASH;
}

export function draftFromReservation(
  reservation: ReservationDetail,
  unit?: ReservationEditUnitSlice | null,
): ReservationEditDraft {
  const rooms = reservation.rooms ?? [];
  const chosen = unit ?? (rooms.length === 1 ? rooms[0] : null);
  const roomTypeName =
    chosen?.roomTypeName ??
    (chosen == null || chosen.roomTypeId === reservation.roomTypeId
      ? reservation.roomTypeName
      : "");
  const roomNumber =
    chosen?.roomNumber ??
    (chosen == null || chosen.roomId === reservation.roomId ? reservation.roomNumber : null);
  const ratePlanName =
    chosen?.ratePlanName ??
    (chosen == null || chosen.ratePlanId === reservation.ratePlanId
      ? reservation.ratePlanName
      : null);
  return {
    guestId: reservation.guestId,
    guestName: reservation.guestName,
    arrival: chosen?.arrivalDate ?? reservation.arrivalDate,
    departure: chosen?.departureDate ?? reservation.departureDate,
    adults: chosen?.adults ?? reservation.adults,
    children: chosen?.children ?? reservation.children,
    roomTypeId: chosen?.roomTypeId ?? reservation.roomTypeId,
    roomTypeName,
    roomId: chosen ? chosen.roomId : reservation.roomId,
    roomNumber,
    ratePlanId: chosen ? chosen.ratePlanId : reservation.ratePlanId,
    ratePlanName,
    specialRequests: reservation.specialRequests ?? "",
    notes: reservation.notes ?? "",
    commercialBookingSource: reservation.commercialBookingSource ?? "",
    marketSegment: reservation.marketSegment ?? "",
    externalReference: reservation.externalReference ?? "",
    guaranteeMethod: reservation.guaranteeMethod ?? "",
    reservationRoomId: chosen?.id ?? null,
    unitSequence: chosen?.unitSequence ?? null,
    unitCount: rooms.length > 0 ? rooms.length : 1,
    unitStatus: chosen?.status ?? reservation.status,
  };
}

export function editDraftDirty(before: ReservationEditDraft, after: ReservationEditDraft): boolean {
  return persistableChanges(buildEditChangeRows({ before, after })).length > 0;
}

/** Dates and occupancy stay on the master priced amend only for a one-unit stay. */
export function stayEditLocked(draft: ReservationEditDraft): boolean {
  return draft.unitCount > 1;
}

export function datesEditLocked(draft: ReservationEditDraft): boolean {
  if (stayEditLocked(draft)) return true;
  return draft.unitStatus !== "pending" && draft.unitStatus !== "confirmed";
}

export function roomTypeEditLocked(draft: ReservationEditDraft): boolean {
  return draft.unitCount > 1;
}

export function rateEditLocked(draft: ReservationEditDraft): boolean {
  return draft.unitCount > 1 && draft.reservationRoomId == null;
}

export function assignmentEditLocked(draft: ReservationEditDraft): boolean {
  if (draft.unitStatus === "checked_in") return true;
  return draft.unitCount > 1 && draft.reservationRoomId == null;
}

function nightDelta(
  beforeArrival: string,
  beforeDeparture: string,
  afterArrival: string,
  afterDeparture: string,
): string {
  if (
    !isStayRangeValid(beforeArrival, beforeDeparture) ||
    !isStayRangeValid(afterArrival, afterDeparture)
  ) {
    return "Changed";
  }
  const delta =
    nightsBetween(afterArrival, afterDeparture) - nightsBetween(beforeArrival, beforeDeparture);
  if (delta === 0) return "Changed";
  return delta > 0
    ? `+ ${delta} night${delta === 1 ? "" : "s"}`
    : `${delta} night${delta === -1 ? "" : "s"}`;
}

function row(
  item: string,
  before: string,
  after: string,
  persistable: boolean,
  changeWhenDifferent?: string,
): EditChangeRow {
  if (before === after) {
    return { item, before, after, change: EDIT_NO_CHANGE, persistable };
  }
  return {
    item,
    before,
    after,
    change: persistable ? (changeWhenDifferent ?? "Changed") : EDIT_LOCAL_ONLY,
    persistable,
  };
}

export function buildEditChangeRows(input: {
  before: ReservationEditDraft;
  after: ReservationEditDraft;
}): EditChangeRow[] {
  const { before, after } = input;
  const guestChanged = before.guestId !== after.guestId;
  return [
    row(
      "Stay Dates",
      stayDatesLabel(before.arrival, before.departure),
      stayDatesLabel(after.arrival, after.departure),
      true,
      nightDelta(before.arrival, before.departure, after.arrival, after.departure),
    ),
    row(
      "Room Assignment",
      assignmentLabel(before.roomNumber, before.roomTypeName),
      assignmentLabel(after.roomNumber, after.roomTypeName),
      true,
    ),
    row("Room Type", dash(before.roomTypeName), dash(after.roomTypeName), true),
    row("Rate Plan", dash(before.ratePlanName), dash(after.ratePlanName), true),
    row(
      "Guest Count",
      guestCountLabel(before.adults, before.children),
      guestCountLabel(after.adults, after.children),
      true,
    ),
    row(
      "Guest",
      dash(before.guestName),
      guestChanged ? dash(after.guestName) : dash(before.guestName),
      true,
    ),
    row(
      "Source",
      commercialLabel(before.commercialBookingSource, DEFAULT_BOOKING_SOURCES),
      commercialLabel(after.commercialBookingSource, DEFAULT_BOOKING_SOURCES),
      true,
    ),
    row(
      "Market Segment",
      commercialLabel(before.marketSegment, DEFAULT_MARKET_SEGMENTS),
      commercialLabel(after.marketSegment, DEFAULT_MARKET_SEGMENTS),
      true,
    ),
    row("External Reference", dash(before.externalReference), dash(after.externalReference), true),
    row("Special Requests", dash(before.specialRequests), dash(after.specialRequests), true),
    row("Reservation Internal Notes", dash(before.notes), dash(after.notes), true),
  ];
}

export function persistableChanges(rows: EditChangeRow[]): EditChangeRow[] {
  return rows.filter((row) => row.persistable && row.change !== EDIT_NO_CHANGE);
}

export function buildEditImpactRows(input: {
  datesValid: boolean;
  availability: number | null;
  availabilityLoaded: boolean;
  occupancyBlocked: boolean;
  maxOccupancy: number | null;
  quotedTotal: number | null;
  quoteLoaded: boolean;
  currentTotal: number | null;
  money: (value: number) => string;
  assignmentCleared: boolean;
  roomChanged: boolean;
  ratePlanChanged: boolean;
  stayChanged: boolean;
  occupancyChanged: boolean;
  updatedCancellation: string | null;
}): EditImpactRow[] {
  const availability: EditImpactRow = !input.datesValid
    ? {
        id: "availability",
        title: "Availability Check",
        status: "warn",
        detail: "Departure must be after arrival.",
      }
    : !input.availabilityLoaded
      ? {
          id: "availability",
          title: "Availability Check",
          status: "unevaluated",
          detail: EDIT_NOT_EVALUATED,
        }
      : input.availability == null
        ? {
            id: "availability",
            title: "Availability Check",
            status: "unevaluated",
            detail: EDIT_NOT_EVALUATED,
          }
        : input.availability <= 0
          ? {
              id: "availability",
              title: "Availability Check",
              status: "warn",
              detail: "No availability for the requested dates.",
            }
          : {
              id: "availability",
              title: "Availability Check",
              status: "ok",
              detail: `Room type is available for the requested dates (${input.availability} remaining).`,
            };

  const occupancyDetail = input.occupancyBlocked
    ? "Adults and children exceed this room type's maximum occupancy."
    : input.maxOccupancy == null
      ? EDIT_NOT_EVALUATED
      : "Occupancy is within the selected room type.";

  const priceChanging = input.stayChanged || input.ratePlanChanged || input.occupancyChanged;
  const rate: EditImpactRow | null = !priceChanging
    ? null
    : !input.quoteLoaded || input.quotedTotal == null
      ? {
          id: "rate",
          title: "Reservation Room Total",
          status: "unevaluated",
          detail: "The updated room total is not available yet.",
        }
      : null;

  const cancellation: EditImpactRow | null = input.ratePlanChanged
    ? {
        id: "cancellation",
        title: "Cancellation Policy",
        status: "info",
        detail: input.updatedCancellation
          ? `Will update to ${input.updatedCancellation}`
          : "Will update to the selected rate plan policy",
      }
    : null;

  const housekeeping: EditImpactRow | null = input.assignmentCleared
    ? {
        id: "housekeeping",
        title: "Room assignment",
        status: "info",
        detail: "The room will be unassigned.",
      }
    : input.roomChanged
      ? {
          id: "housekeeping",
          title: "Room assignment",
          status: "info",
          detail: "The assigned room will change.",
        }
      : null;

  const occupancy: EditImpactRow | null =
    input.occupancyBlocked || input.occupancyChanged
      ? {
          id: "occupancy",
          title: "Occupancy",
          status: input.occupancyBlocked ? "warn" : "ok",
          detail: occupancyDetail,
        }
      : null;

  const showAvailability =
    input.stayChanged || availability.status === "warn" || availability.status === "unevaluated";

  return [
    showAvailability ? availability : null,
    occupancy,
    rate,
    cancellation,
    housekeeping,
  ].filter((row): row is EditImpactRow => row != null);
}

export function occupancyIsBlocked(
  adults: number,
  children: number,
  maxOccupancy: number | null | undefined,
): boolean {
  if (maxOccupancy == null) return false;
  return occupancyExceeded(adults, children, maxOccupancy);
}

export function confirmIsEnabled(input: {
  datesValid: boolean;
  availabilityNone: boolean;
  occupancyBlocked: boolean;
  hasPersistableChange: boolean;
}): boolean {
  return (
    input.datesValid &&
    !input.availabilityNone &&
    !input.occupancyBlocked &&
    input.hasPersistableChange
  );
}

export function buildConfirmNextEvents(input: {
  inventoryChanged: boolean;
  rateMayChange: boolean;
  folioReconciled: boolean;
}): EditNextEvent[] {
  const events: EditNextEvent[] = [
    {
      id: "updated",
      title: "Reservation updated",
      detail: "The confirmed reservation details were saved.",
    },
  ];
  if (input.inventoryChanged) {
    events.push({
      id: "inventory",
      title: "Inventory updated",
      detail: "Room availability reflects the amended stay.",
    });
  }
  if (input.rateMayChange) {
    events.push({
      id: "rate",
      title: "Rate updated",
      detail: "The room rate and reservation room total were recalculated.",
    });
  }
  if (input.folioReconciled) {
    events.push({
      id: "folio",
      title: "Folio reconciled",
      detail: "The posted room charge was updated to match the amendment.",
    });
  }
  events.push({
    id: "audit",
    title: "Audit recorded",
    detail: "The amendment was added to reservation history.",
  });
  return events;
}

export type EditRoomTotalImpact = {
  label: string;
  previous: number | null;
  next: number | null;
  delta: number | null;
};

/** Difference of two authoritative room totals. Omits a delta when either side is missing. */
export function roomTotalImpact(input: {
  label: string;
  priceChanging: boolean;
  previousTotal: number | null;
  quotedTotal: number | null;
}): EditRoomTotalImpact | null {
  if (!input.priceChanging) {
    if (input.previousTotal == null) return null;
    return {
      label: input.label,
      previous: input.previousTotal,
      next: input.previousTotal,
      delta: 0,
    };
  }
  if (input.previousTotal == null && input.quotedTotal == null) return null;
  return {
    label: input.label,
    previous: input.previousTotal,
    next: input.quotedTotal,
    delta:
      input.previousTotal == null || input.quotedTotal == null
        ? null
        : Math.round((input.quotedTotal - input.previousTotal) * 100) / 100,
  };
}

export type EditFolioNotice = {
  tone: "info" | "warn";
  detail: string;
  folioState: string | null;
};

export function folioReconciliationNotice(input: {
  commercialChange: boolean;
  folioStatus: string | null;
  invoiced: boolean;
  hasRoomCharge: boolean;
}): EditFolioNotice | null {
  if (!input.commercialChange || !input.hasRoomCharge || !input.folioStatus) return null;
  if (input.invoiced) {
    return {
      tone: "warn",
      folioState: "Invoiced",
      detail: "This charge is already on an issued invoice, so it cannot be corrected.",
    };
  }
  if (input.folioStatus !== "open") {
    return {
      tone: "warn",
      folioState: "Closed",
      detail: "This folio is closed. Nothing more can be posted to it.",
    };
  }
  return {
    tone: "info",
    folioState: "Open",
    detail: "An existing posted room charge will be reconciled when this amendment is confirmed.",
  };
}

export function affectedRoomLabel(draft: ReservationEditDraft): string | null {
  const typeName = draft.roomTypeName.trim();
  const room = draft.roomNumber ? `Room ${draft.roomNumber}` : "Unassigned";
  if (draft.unitCount > 1) {
    if (draft.reservationRoomId == null || draft.unitSequence == null) return null;
    return [`Room ${draft.unitSequence}`, room, typeName].filter(Boolean).join(" · ");
  }
  return [room, typeName].filter(Boolean).join(" · ");
}

export function pickLatestAmendHistory(
  history: ReservationHistoryEntry[] | null | undefined,
): ReservationHistoryEntry | null {
  const rows = history ?? [];
  const amended = rows.find((row) => row.eventType === "amended");
  return amended ?? rows[0] ?? null;
}

export function ratePerNightLabel(
  nightlyRates: Array<{ rate: number }> | null | undefined,
  roomSubtotal: number | null | undefined,
  nights: number,
  money: (value: number) => string,
): string {
  const rate = storedRatePerNight(nightlyRates, roomSubtotal, nights);
  return rate == null ? EDIT_DASH : money(rate);
}
