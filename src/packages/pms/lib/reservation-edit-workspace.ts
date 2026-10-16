import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import { occupancyExceeded } from "@/packages/pms/lib/fo-amendments";
import {
  REVIEW_DASH,
  REVIEW_ROOM_PREFERENCE_FLAGS,
} from "@/packages/pms/lib/create-reservation-review";
import { isStayRangeValid } from "@/packages/pms/lib/create-reservation-phase1";
import { ROOM_ASSIGNMENT_PREFS } from "@/packages/pms/lib/reservation-detail-rooms";
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
export const EDIT_DRAFT_STORAGE_PREFIX = "noru.edit-reservation.draft.";
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
  infants: number;
  rooms: number;
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
  salesChannel: string;
  purposeOfStay: string;
  companyName: string;
  travelAgentName: string;
  groupName: string;
  bookerSameAsGuest: boolean;
  bookerName: string;
  bookerPhone: string;
  bookerCompany: string;
  flexibleDates: boolean;
  keepRoomUnassigned: boolean;
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
  return `${arrival} – ${departure} (${nightLabel})`;
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
  extras?: { bookerName?: string | null; bookerPhone?: string | null },
): ReservationEditDraft {
  const sameAsGuest =
    !reservation.bookerGuestId || reservation.bookerGuestId === reservation.guestId;
  return {
    guestId: reservation.guestId,
    guestName: reservation.guestName,
    arrival: reservation.arrivalDate,
    departure: reservation.departureDate,
    adults: reservation.adults,
    children: reservation.children,
    infants: reservation.infants ?? 0,
    rooms: reservation.roomsRequested ?? 1,
    roomTypeId: reservation.roomTypeId,
    roomTypeName: reservation.roomTypeName,
    roomId: reservation.roomId,
    roomNumber: reservation.roomNumber,
    ratePlanId: reservation.ratePlanId,
    ratePlanName: reservation.ratePlanName,
    specialRequests: reservation.specialRequests ?? "",
    notes: reservation.notes ?? "",
    commercialBookingSource: reservation.commercialBookingSource ?? "",
    marketSegment: reservation.marketSegment ?? "",
    externalReference: reservation.externalReference ?? "",
    guaranteeMethod: reservation.guaranteeMethod ?? "",
    salesChannel: reservation.salesChannel ?? reservation.source ?? "",
    purposeOfStay: reservation.purposeOfStay ?? "",
    companyName: reservation.companyName ?? "",
    travelAgentName: reservation.travelAgentName ?? "",
    groupName: reservation.groupName ?? "",
    bookerSameAsGuest: sameAsGuest,
    bookerName: sameAsGuest ? reservation.guestName : (extras?.bookerName ?? ""),
    bookerPhone: sameAsGuest ? (reservation.guestPhone ?? "") : (extras?.bookerPhone ?? ""),
    bookerCompany: "",
    flexibleDates: false,
    keepRoomUnassigned: !reservation.roomId,
  };
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

function moneyDelta(before: string, after: string): string {
  const beforeNum = Number(String(before).replace(/[^\d.-]/g, ""));
  const afterNum = Number(String(after).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(beforeNum) || !Number.isFinite(afterNum) || beforeNum === afterNum)
    return "Changed";
  const delta = afterNum - beforeNum;
  const abs = Math.abs(delta).toLocaleString();
  return delta > 0 ? `+ ${abs}` : `− ${abs}`;
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
  beforeTotal: string;
  afterTotal: string;
  beforeRate: string;
  afterRate: string;
  beforePackages: string;
  afterPackages: string;
  beforeDeposit: string;
  afterDeposit: string;
  beforeCancellation: string;
  afterCancellation: string;
}): EditChangeRow[] {
  const { before, after } = input;
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
      "Room Rate",
      input.beforeRate,
      input.afterRate,
      true,
      moneyDelta(input.beforeRate, input.afterRate),
    ),
    row(
      "Total Room Amount",
      input.beforeTotal,
      input.afterTotal,
      true,
      moneyDelta(input.beforeTotal, input.afterTotal),
    ),
    row("Packages", input.beforePackages, input.afterPackages, false),
    row("Deposit / Guarantee", input.beforeDeposit, input.afterDeposit, true),
    row("Cancellation Policy", input.beforeCancellation, input.afterCancellation, false),
    row(
      "Guest Count",
      guestCountLabel(before.adults, before.children, before.infants),
      guestCountLabel(after.adults, after.children, after.infants),
      true,
    ),
    row("Guest", dash(before.guestName), dash(after.guestName), true),
    row("Source", dash(before.commercialBookingSource), dash(after.commercialBookingSource), true),
    row("Channel", dash(before.salesChannel), dash(after.salesChannel), false),
    row("Market Segment", dash(before.marketSegment), dash(after.marketSegment), true),
    row("Company", dash(before.companyName), dash(after.companyName), false),
    row("Travel Agent", dash(before.travelAgentName), dash(after.travelAgentName), false),
    row("Group", dash(before.groupName), dash(after.groupName), false),
    row("Purpose of Stay", dash(before.purposeOfStay), dash(after.purposeOfStay), false),
    row("External Reference", dash(before.externalReference), dash(after.externalReference), true),
    row("Special Requests", dash(before.specialRequests), dash(after.specialRequests), true),
    row("Internal Notes", dash(before.notes), dash(after.notes), true),
    row("Rooms", String(before.rooms), String(after.rooms), false),
    row(
      "Flexible Dates",
      before.flexibleDates ? "Yes" : "No",
      after.flexibleDates ? "Yes" : "No",
      false,
    ),
    row(
      "Booking Contact",
      before.bookerSameAsGuest ? "Same as guest" : dash(before.bookerName),
      after.bookerSameAsGuest ? "Same as guest" : dash(after.bookerName),
      false,
    ),
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

  const rate: EditImpactRow =
    !input.stayChanged && !input.ratePlanChanged
      ? {
          id: "rate",
          title: "Rate & Revenue",
          status: "info",
          detail: "Rate plan and stay dates are unchanged.",
        }
      : !input.quoteLoaded || input.quotedTotal == null
        ? {
            id: "rate",
            title: "Rate & Revenue",
            status: "unevaluated",
            detail: EDIT_NOT_EVALUATED,
          }
        : {
            id: "rate",
            title: "Rate & Revenue",
            status: "ok",
            detail:
              input.currentTotal == null
                ? `Quoted room revenue: ${input.money(input.quotedTotal)}.`
                : `Quoted room revenue: ${input.money(input.quotedTotal)} (currently ${input.money(input.currentTotal)}).`,
          };

  const deposit: EditImpactRow = {
    id: "deposit",
    title: "Deposit / Guarantee",
    status: input.stayChanged || input.ratePlanChanged ? "unevaluated" : "info",
    detail:
      input.stayChanged || input.ratePlanChanged
        ? "Deposit is not re-quoted in this workspace."
        : "No additional deposit evaluated. Existing guarantee is unchanged until confirm.",
  };

  const cancellation: EditImpactRow = {
    id: "cancellation",
    title: "Cancellation Policy",
    status: input.ratePlanChanged ? "unevaluated" : "info",
    detail: input.ratePlanChanged
      ? "Policy after a rate-plan change is applied by the server on confirm."
      : "Policy remains the stored snapshot until confirm.",
  };

  const housekeeping: EditImpactRow = input.assignmentCleared
    ? {
        id: "housekeeping",
        title: "Housekeeping",
        status: "info",
        detail:
          "Assigned room will be cleared on confirm. Housekeeping is not notified from this screen.",
      }
    : input.roomChanged
      ? {
          id: "housekeeping",
          title: "Housekeeping",
          status: "info",
          detail:
            "Room assignment will change on confirm. Housekeeping is not notified from this screen.",
        }
      : {
          id: "housekeeping",
          title: "Housekeeping",
          status: "info",
          detail: "No room assignment change.",
        };

  const guestServices: EditImpactRow = {
    id: "guest-services",
    title: "Guest Services",
    status: "unevaluated",
    detail: "No guest-services impact is evaluated here.",
  };

  return [
    availability,
    {
      id: "occupancy",
      title: "Occupancy",
      status: input.occupancyBlocked ? "warn" : "ok",
      detail: occupancyDetail,
    },
    rate,
    deposit,
    cancellation,
    housekeeping,
    guestServices,
  ];
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
  stayChanged: boolean;
  assignmentChanged: boolean;
  rateMayChange: boolean;
}): EditNextEvent[] {
  const events: EditNextEvent[] = [
    {
      id: "updated",
      title: "Reservation updated in the system",
      detail: "The amendment writer saved the persistable stay fields.",
    },
  ];
  if (input.stayChanged || input.assignmentChanged) {
    events.push({
      id: "inventory",
      title: "Room inventory and availability synchronized",
      detail: "Stay dates, room type, or assignment changed through the existing amendment RPC.",
    });
  }
  if (input.rateMayChange) {
    events.push({
      id: "rate",
      title: "Rate and revenue updated",
      detail: "Server reprice ran as part of the existing amendment action.",
    });
  }
  events.push({
    id: "audit",
    title: "Audit trail recorded",
    detail: "Reservation history records the amendment.",
  });
  return events;
}

export function pickLatestAmendHistory(
  history: ReservationHistoryEntry[] | null | undefined,
): ReservationHistoryEntry | null {
  const rows = history ?? [];
  const amended = rows.find((row) => row.eventType === "amended");
  return amended ?? rows[0] ?? null;
}

export function requestPrefChecked(specialRequests: string, aliases: readonly string[]): boolean {
  const hay = specialRequests.toLowerCase();
  return aliases.some((alias) => hay.includes(alias.toLowerCase()));
}

export function toggleRequestPref(
  specialRequests: string,
  label: string,
  checked: boolean,
): string {
  const lines = specialRequests
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const without = lines.filter((line) => line.toLowerCase() !== label.toLowerCase());
  if (checked && !without.some((line) => line.toLowerCase() === label.toLowerCase())) {
    without.push(label);
  }
  return without.join("\n");
}

export const EDIT_PREFERENCE_FLAGS = [
  ...REVIEW_ROOM_PREFERENCE_FLAGS.map((flag) => ({
    id: flag.id,
    label: flag.label,
    aliases: [flag.label],
  })),
  ...ROOM_ASSIGNMENT_PREFS.map((pref) => ({
    id: pref.id,
    label: pref.label,
    aliases: pref.aliases,
  })),
];

export function ratePerNightLabel(
  nightlyRates: Array<{ rate: number }> | null | undefined,
  roomSubtotal: number | null | undefined,
  nights: number,
  money: (value: number) => string,
): string {
  const rate = storedRatePerNight(nightlyRates, roomSubtotal, nights);
  return rate == null ? EDIT_DASH : money(rate);
}

export function sessionDraftKey(reservationId: string): string {
  return `${EDIT_DRAFT_STORAGE_PREFIX}${reservationId}`;
}

export function loadSessionDraft(reservationId: string): ReservationEditDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(sessionDraftKey(reservationId));
    if (!raw) return null;
    return JSON.parse(raw) as ReservationEditDraft;
  } catch {
    return null;
  }
}

export function saveSessionDraft(reservationId: string, draft: ReservationEditDraft): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(sessionDraftKey(reservationId), JSON.stringify(draft));
}

export function clearSessionDraft(reservationId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(sessionDraftKey(reservationId));
}
