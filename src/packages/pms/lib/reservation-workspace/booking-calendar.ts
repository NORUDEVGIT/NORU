import { addDays, nightsBetween } from "../reservation-dates";
import { reservationBarPlacement } from "../front-office-shell";
import type { ReservationStatus } from "../reservation-dates";
import type {
  CalendarBar,
  CalendarBarExceptionKey,
  CalendarHorizon,
  CalendarMode,
  CalendarRoom,
  CalendarRoomType,
  ReservationDeskActionHints,
  ReservationDeskRow,
} from "./shared-read-models";

export const BOOKING_CALENDAR_DRAG_MIME = "application/x-noru-booking-calendar";

export const CALENDAR_DENSITIES = ["compact", "standard", "comfortable", "spacious"] as const;
export type CalendarDensity = (typeof CALENDAR_DENSITIES)[number];

export type CalendarWorkspaceSection =
  | "desk"
  | "calendar"
  | "groups"
  | "waitlist"
  | "arrivals-departures"
  | "exceptions";

export interface CalendarDisplayOptions {
  guestName: boolean;
  confirmationNumber: boolean;
  housekeepingStatus: boolean;
  roomStatus: boolean;
}

export const DEFAULT_CALENDAR_DISPLAY: CalendarDisplayOptions = {
  guestName: true,
  confirmationNumber: true,
  housekeepingStatus: true,
  roomStatus: true,
};

export interface CalendarDragPayload {
  reservationId: string;
}

export interface CalendarDropTarget {
  roomId: string | null;
  roomTypeId: string;
  date: string;
}

export type CalendarMoveKind = "amend" | "fo_room_move" | "open_detail" | "invalid";

export function densityRowPx(density: CalendarDensity): number {
  if (density === "compact") return 28;
  if (density === "comfortable") return 44;
  if (density === "spacious") return 56;
  return 36;
}

export function calendarStatusBarClass(status: ReservationStatus): string {
  switch (status) {
    case "pending":
      return "border-amber-300 bg-amber-100 text-amber-950";
    case "confirmed":
      return "border-sky-300 bg-sky-100 text-sky-950";
    case "checked_in":
      return "border-emerald-300 bg-emerald-100 text-emerald-950";
    case "checked_out":
      return "border-slate-300 bg-slate-100 text-slate-800";
    case "cancelled":
      return "border-rose-200 bg-rose-50 text-rose-800 line-through";
    case "no_show":
      return "border-orange-300 bg-orange-50 text-orange-950";
    default:
      return "border-border bg-muted text-foreground";
  }
}

export function calendarExceptionLabel(key: CalendarBarExceptionKey): string {
  if (key === "unassigned") return "Unassigned";
  if (key === "room_unavailable") return "Room unavailable";
  return "Assignment overlap";
}

export function calendarDateColumns(rangeStart: string, horizon: CalendarHorizon): string[] {
  return Array.from({ length: horizon }, (_, index) => addDays(rangeStart, index));
}

export function canDragCalendarBar(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed" || status === "checked_in";
}

export function calendarDeskHints(
  bar: Pick<CalendarBar, "status" | "roomId">,
): ReservationDeskActionHints {
  const pendingOrConfirmed = bar.status === "pending" || bar.status === "confirmed";
  return {
    canOpen: true,
    canAssignRoom: pendingOrConfirmed && bar.roomId === null,
    canConfirm: bar.status === "pending",
    canCancel: pendingOrConfirmed,
    canCheckIn: bar.status === "confirmed",
    canCheckOut: bar.status === "checked_in",
  };
}

export function calendarBarToDeskRow(
  bar: CalendarBar,
  rooms: CalendarRoom[],
  roomTypes: CalendarRoomType[],
): ReservationDeskRow {
  const room = bar.roomId ? rooms.find((item) => item.roomId === bar.roomId) : undefined;
  const type =
    rooms.find((item) => item.roomTypeId === bar.roomTypeId) ??
    roomTypes.find((item) => item.roomTypeId === bar.roomTypeId);
  return {
    reservationId: bar.reservationId,
    confirmationNumber: bar.confirmationNumber,
    arrivalDate: bar.arrivalDate,
    departureDate: bar.departureDate,
    nights: Math.max(1, nightsBetween(bar.arrivalDate, bar.departureDate)),
    adults: bar.adults,
    children: bar.children,
    status: bar.status,
    source: bar.source,
    roomTypeId: bar.roomTypeId,
    roomTypeName: room?.roomTypeName ?? type?.roomTypeName ?? "Room type",
    roomId: bar.roomId,
    roomNumber: room?.roomNumber ?? null,
    guestId: bar.guestId,
    guestName: bar.guestName,
    guestPhone: null,
    guestEmail: null,
    guestVip: bar.guestVip,
    ratePlanId: null,
    ratePlanName: bar.ratePlanName,
    roomSubtotal: null,
    currency: null,
    companyMasterId: null,
    companyName: null,
    travelAgentMasterId: null,
    travelAgentName: null,
    groupAccountMasterId: null,
    groupName: null,
    commercialBookingSource: null,
    marketSegment: null,
    externalReference: null,
    guaranteeMethod: null,
    specialRequests: null,
    notes: null,
    createdAt: bar.updatedAt,
    updatedAt: bar.updatedAt,
    hints: calendarDeskHints(bar),
  };
}

export function resolveCalendarSearchFocus(input: {
  arrivalDate: string;
  reservationId: string;
  rangeStart: string;
  horizon: CalendarHorizon;
}): { rangeStart: string; highlightId: string } {
  const place = reservationBarPlacement(
    input.arrivalDate,
    addDays(input.arrivalDate, 1),
    input.rangeStart,
    input.horizon,
  );
  return {
    rangeStart: place ? input.rangeStart : input.arrivalDate,
    highlightId: input.reservationId,
  };
}

export function proposedStayFromDrop(input: {
  arrivalDate: string;
  departureDate: string;
  dropDate: string;
}): { arrivalDate: string; departureDate: string } {
  const nights = Math.max(1, nightsBetween(input.arrivalDate, input.departureDate));
  return {
    arrivalDate: input.dropDate,
    departureDate: addDays(input.dropDate, nights),
  };
}

export function calendarMoveKind(input: {
  status: ReservationStatus;
  currentRoomId: string | null;
  proposedRoomId: string | null;
  currentArrival: string;
  proposedArrival: string;
  currentDeparture: string;
  proposedDeparture: string;
}): CalendarMoveKind {
  const datesChanged =
    input.currentArrival !== input.proposedArrival ||
    input.currentDeparture !== input.proposedDeparture;
  const roomChanged = input.currentRoomId !== input.proposedRoomId;

  if (!datesChanged && !roomChanged) return "invalid";

  if (input.status === "checked_in") {
    if (roomChanged && !datesChanged && input.proposedRoomId) return "fo_room_move";
    if (datesChanged) return "open_detail";
    return "invalid";
  }

  if (input.status === "pending" || input.status === "confirmed") {
    return "amend";
  }

  return "invalid";
}

export function parseCalendarDragPayload(raw: string): CalendarDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as CalendarDragPayload;
    if (!parsed?.reservationId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function calendarBarLabel(
  bar: CalendarBar,
  display: CalendarDisplayOptions,
): string {
  const parts: string[] = [];
  if (display.guestName) parts.push(bar.guestName);
  if (display.confirmationNumber) parts.push(bar.confirmationNumber);
  if (parts.length === 0) parts.push(bar.confirmationNumber);
  return parts.join(" · ");
}

export function workspaceSectionFromTab(tab: string | undefined): CalendarWorkspaceSection {
  if (tab === "calendar" || tab === "booking-calendar") return "calendar";
  if (tab === "groups" || tab === "groups-blocks") return "groups";
  if (tab === "waitlist") return "waitlist";
  if (tab === "arrivals-departures") return "arrivals-departures";
  if (tab === "exceptions") return "exceptions";
  return "desk";
}

export function tabFromWorkspaceSection(section: CalendarWorkspaceSection): string {
  if (section === "calendar") return "calendar";
  if (section === "groups") return "groups";
  if (section === "waitlist") return "waitlist";
  if (section === "arrivals-departures") return "arrivals-departures";
  if (section === "exceptions") return "exceptions";
  return "individual";
}

export function isCalendarSectionEnabled(section: string, index: number): boolean {
  return (
    index === 0 ||
    section === "Booking Calendar" ||
    section === "Groups & Blocks" ||
    section === "Waitlist" ||
    section === "Arrivals & Departures" ||
    section === "Exceptions"
  );
}
