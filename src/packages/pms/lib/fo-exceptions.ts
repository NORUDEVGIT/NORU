/**
 * FO-FS6 + FO-EX1 — Exceptions queue (pure).
 *
 * Rows are derived from existing FO lists, room status, folio/deposit honesty,
 * the stay `overstay` flag, overbooking (demand > sellable), and open
 * housekeeping discrepancies. Never invent alerts, counts, occupancy % or £0.00.
 * Early / Late stay Coming soon — no ETA or property check-in time exists.
 */
import { FOLIO_ZERO_EPSILON } from "./fo-check-out.ts";
import { isDepositSatisfied } from "./fo-check-in.ts";
import type { RackFilters } from "./front-office-shell.ts";

export const EXCEPTION_EMPTY_COPY = "No exceptions right now";
export const EXCEPTION_HONESTY_HELP = "Exceptions only show real feeds — empty means clear.";

/** Late CTA unused this wave. If Late is wired later: Check-in primary, No-show secondary, never auto. */
export const LATE_ARRIVAL_AUTO_NOSHOW = false;
export const LATE_ARRIVAL_PRIMARY_CTA = "check_in" as const;
export const LATE_ARRIVAL_SECONDARY_CTA = "no_show" as const;

export const OVERBOOKING_HORIZON_DAYS = 7;
export const EXCEPTION_FEED_ROW_CAP = 500;

export const LIVE_EXCEPTION_TYPES = [
  "unassigned",
  "room_unavailable",
  "payment_issue",
  "overstay",
  "overbooking",
  "room_discrepancy",
] as const;

export type LiveExceptionType = (typeof LIVE_EXCEPTION_TYPES)[number];

/** OOO/OOS-on-assigned-room is one Live type — not a second maintenance ticket. */
export const MAINTENANCE_LIVE_TYPE: LiveExceptionType = "room_unavailable";

/** Types that stay Coming soon this wave — no counts, no invented 14:00 / late minutes. */
export const COMING_SOON_EXCEPTION_TYPES = [
  { id: "early_arrival", label: "Early arrival" },
  { id: "late_arrival", label: "Late arrival" },
] as const;

export type FolioSignalLane = "live" | "coming_soon" | "permission_denied";

export type ExceptionSeverity = "high" | "standard";

export type ExceptionCtaId =
  | "assign"
  | "move"
  | "check_in"
  | "check_out"
  | "open_folio"
  | "open_rack"
  | "open_room"
  | "resolve";

export type ExceptionCta = {
  id: ExceptionCtaId;
  label: string;
};

export type ExceptionStayLike = {
  id: string;
  confirmationNumber: string;
  guestName: string;
  roomId: string | null;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  status: string;
  overstay: boolean;
};

export type ExceptionRoomLike = {
  id: string;
  status: string;
  roomTypeId?: string;
  roomTypeName?: string;
};

export type OverbookStayLike = {
  id: string;
  confirmationNumber: string;
  guestName: string;
  guestId?: string;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  status: string;
};

export type ExceptionDiscrepancyLike = {
  id: string;
  roomId: string;
  roomNumber: string;
  reportedOccupancy: string | null;
  actualOccupancy: string | null;
  reportedHkStatus: string | null;
  actualHkStatus: string | null;
  reason: string | null;
  status: string;
};

export type StayMoneySignal = {
  folioId: string | null;
  folioNumber: string | null;
  /** Null when no folio exists — never invent 0. */
  balance: number | null;
  /** Null when deposit evidence is missing. */
  depositPosted: number | null;
  depositWaived: boolean;
  checkoutOverride: boolean;
  keyIssued: boolean;
  keyWaived: boolean;
};

export type ExceptionRow = {
  id: string;
  type: LiveExceptionType;
  label: string;
  severity: ExceptionSeverity;
  reason: string;
  stayId: string | null;
  guestName: string;
  confirmationNumber: string;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  ageDays: number | null;
  primaryCta: ExceptionCta;
  secondary: "sheet" | "rack" | "room" | "none";
  waived: boolean;
  roomId?: string | null;
  roomTypeId?: string | null;
  roomTypeName?: string | null;
  discrepancyId?: string | null;
  focusDate?: string | null;
  secondaryCta?: ExceptionCta | null;
  resolveAvailable?: boolean;
};

export type ComingSoonException = { id: string; label: string };

export type FoRackFocus = {
  focusDate?: string;
  roomType?: string;
  roomId?: string;
  discrepancy?: "open";
};

const CTA: Record<ExceptionCtaId, ExceptionCta> = {
  assign: { id: "assign", label: "Assign room" },
  move: { id: "move", label: "Move room" },
  check_in: { id: "check_in", label: "Check-in" },
  check_out: { id: "check_out", label: "Checkout settle" },
  open_folio: { id: "open_folio", label: "Open folio" },
  open_rack: { id: "open_rack", label: "Open Room Rack" },
  open_room: { id: "open_room", label: "Open room" },
  resolve: { id: "resolve", label: "Resolve" },
};

function nightsBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function dateRange(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

export function stayDemandOverlapsDate(
  stay: { arrivalDate: string; departureDate: string; status: string },
  date: string,
  businessDate: string,
): boolean {
  if (stay.status !== "pending" && stay.status !== "confirmed" && stay.status !== "checked_in") {
    return false;
  }
  if (stay.arrivalDate > date) return false;
  if (stay.departureDate > date) return true;
  return stay.status === "checked_in" && date === businessDate;
}

export function isSellableRoomStatus(status: string): boolean {
  return !isOooOrOos(status);
}

export function sellableRoomCount(rooms: Array<{ status: string }>): number {
  return rooms.filter((room) => isSellableRoomStatus(room.status)).length;
}

export function occupancyPercent(occupied: number, sellable: number): number | null {
  if (!Number.isFinite(occupied) || !Number.isFinite(sellable)) return null;
  if (sellable <= 0 || occupied < 0) return null;
  return Math.round((occupied / sellable) * 100);
}

export function isOpenDiscrepancyStatus(status: string): boolean {
  return status === "open" || status === "unresolved";
}

export function discrepancyBrief(row: {
  reportedOccupancy: string | null;
  actualOccupancy: string | null;
  reportedHkStatus: string | null;
  actualHkStatus: string | null;
  reason: string | null;
}): string {
  const reason = (row.reason ?? "").trim();
  if (reason) return reason;
  if (row.reportedOccupancy && row.actualOccupancy && row.reportedOccupancy !== row.actualOccupancy) {
    return `reported ${row.reportedOccupancy}, actual ${row.actualOccupancy}`;
  }
  if (row.reportedHkStatus && row.actualHkStatus && row.reportedHkStatus !== row.actualHkStatus) {
    return `HK reported ${row.reportedHkStatus}, actual ${row.actualHkStatus}`;
  }
  const occupancy = [
    row.reportedOccupancy ? `reported ${row.reportedOccupancy}` : null,
    row.actualOccupancy ? `actual ${row.actualOccupancy}` : null,
  ].filter(Boolean);
  if (occupancy.length) return occupancy.join(", ");
  const hk = [
    row.reportedHkStatus ? `HK reported ${row.reportedHkStatus}` : null,
    row.actualHkStatus ? `actual ${row.actualHkStatus}` : null,
  ].filter(Boolean);
  if (hk.length) return hk.join(", ");
  return "open";
}

function uniqueStays(groups: ExceptionStayLike[][]): ExceptionStayLike[] {
  const byId = new Map<string, ExceptionStayLike>();
  for (const group of groups) {
    for (const stay of group) {
      if (!byId.has(stay.id)) byId.set(stay.id, stay);
    }
  }
  return [...byId.values()];
}

function isArrivalStatus(status: string): boolean {
  return status === "pending" || status === "confirmed";
}

function isOooOrOos(status: string): boolean {
  return status === "out_of_order" || status === "out_of_service";
}

function roomLabel(status: string): string {
  return status === "out_of_service" ? "out of service" : "out of order";
}

function paymentCta(stay: ExceptionStayLike): ExceptionCta {
  if (stay.status === "checked_in") return CTA.check_out;
  if (isArrivalStatus(stay.status)) return CTA.check_in;
  return CTA.open_folio;
}

function arrivalDepositUnpaid(signal: StayMoneySignal | undefined): boolean {
  if (!signal) return false;
  if (signal.depositWaived) return false;
  if (signal.depositPosted == null) return false;
  return !isDepositSatisfied({ postedAmount: signal.depositPosted, waived: signal.depositWaived });
}

function outstandingBalance(signal: StayMoneySignal | undefined): boolean {
  if (!signal || signal.balance == null) return false;
  return Math.abs(signal.balance) >= FOLIO_ZERO_EPSILON;
}

function paymentWaived(signal: StayMoneySignal | undefined): boolean {
  return Boolean(signal?.depositWaived || signal?.checkoutOverride);
}

export function exceptionBadgeCount(rows: ExceptionRow[]): number {
  return rows.length;
}

export function exceptionHighCount(rows: ExceptionRow[]): number {
  return rows.filter((row) => row.severity === "high").length;
}

export function comingSoonExceptionTypes(
  folioLane: FolioSignalLane,
  extra: ComingSoonException[] = [],
): ComingSoonException[] {
  const soon: ComingSoonException[] = COMING_SOON_EXCEPTION_TYPES.map((item) => ({
    id: item.id,
    label: item.label,
  }));
  for (const item of extra) {
    if (!soon.some((existing) => existing.id === item.id)) soon.push(item);
  }
  if (folioLane === "coming_soon") {
    soon.push({ id: "payment_issue", label: "Payment issue" });
  }
  return soon;
}

function feedComingSoon(
  overbookingLane: FolioSignalLane,
  discrepancyLane: FolioSignalLane,
): ComingSoonException[] {
  const extra: ComingSoonException[] = [];
  if (overbookingLane === "coming_soon") extra.push({ id: "overbooking", label: "Overbooking" });
  if (discrepancyLane === "coming_soon") extra.push({ id: "room_discrepancy", label: "Room discrepancy" });
  return extra;
}

export function deriveExceptionRows(input: {
  arrivals: ExceptionStayLike[];
  inHouse: ExceptionStayLike[];
  departures: ExceptionStayLike[];
  rooms: ExceptionRoomLike[];
  folioLane: FolioSignalLane;
  moneyByStay?: Record<string, StayMoneySignal>;
  businessDate: string;
  overbookingLane?: FolioSignalLane;
  discrepancyLane?: FolioSignalLane;
  demandStays?: OverbookStayLike[];
  discrepancies?: ExceptionDiscrepancyLike[];
  canResolveDiscrepancy?: boolean;
}): { rows: ExceptionRow[]; comingSoon: ComingSoonException[] } {
  const money = input.moneyByStay ?? {};
  const roomById = new Map(input.rooms.map((room) => [room.id, room]));
  const assigned = uniqueStays([
    input.arrivals.filter((stay) => stay.roomId),
    input.inHouse.filter((stay) => stay.roomId),
    input.departures.filter((stay) => stay.roomId),
  ]);
  const overstaySource = uniqueStays([input.inHouse, input.departures]);
  const overbookingLane = input.overbookingLane ?? "live";
  const discrepancyLane = input.discrepancyLane ?? "live";
  const rows: ExceptionRow[] = [];

  for (const stay of input.arrivals) {
    if (stay.roomId) continue;
    rows.push({
      id: `unassigned:${stay.id}`,
      type: "unassigned",
      label: "Unassigned",
      severity: "standard",
      reason: "Arrival has no room assigned.",
      stayId: stay.id,
      guestName: stay.guestName,
      confirmationNumber: stay.confirmationNumber,
      roomNumber: null,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
      ageDays: null,
      primaryCta: CTA.assign,
      secondary: "sheet",
      waived: false,
    });
  }

  for (const stay of assigned) {
    if (!stay.roomId) continue;
    const room = roomById.get(stay.roomId);
    if (!room || !isOooOrOos(room.status)) continue;
    rows.push({
      id: `room_unavailable:${stay.id}`,
      type: "room_unavailable",
      label: "Room unavailable",
      severity: "high",
      reason: `Assigned room is ${roomLabel(room.status)}. Move the stay — this is the same signal as a maintenance block.`,
      stayId: stay.id,
      guestName: stay.guestName,
      confirmationNumber: stay.confirmationNumber,
      roomNumber: stay.roomNumber,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
      ageDays: null,
      primaryCta: CTA.move,
      secondary: "rack",
      waived: false,
    });
  }

  if (input.folioLane === "live") {
    const paymentCandidates = uniqueStays([input.arrivals, input.inHouse, input.departures]);
    for (const stay of paymentCandidates) {
      const signal = money[stay.id];
      const unpaidDeposit = isArrivalStatus(stay.status) && arrivalDepositUnpaid(signal);
      const dueBalance =
        (stay.status === "checked_in" || stay.overstay) && outstandingBalance(signal);
      if (!unpaidDeposit && !dueBalance) continue;
      rows.push({
        id: `payment_issue:${stay.id}`,
        type: "payment_issue",
        label: "Payment issue",
        severity: "high",
        reason: unpaidDeposit
          ? "Arrival deposit is unpaid."
          : "Folio balance is outstanding.",
        stayId: stay.id,
        guestName: stay.guestName,
        confirmationNumber: stay.confirmationNumber,
        roomNumber: stay.roomNumber,
        arrivalDate: stay.arrivalDate,
        departureDate: stay.departureDate,
        ageDays: null,
        primaryCta: paymentCta(stay),
        secondary: "sheet",
        waived: paymentWaived(signal),
      });
    }
  }

  for (const stay of overstaySource) {
    if (!stay.overstay) continue;
    rows.push({
      id: `overstay:${stay.id}`,
      type: "overstay",
      label: "Overstay",
      severity: "high",
      reason: "Guest is still in-house after the departure date.",
      stayId: stay.id,
      guestName: stay.guestName,
      confirmationNumber: stay.confirmationNumber,
      roomNumber: stay.roomNumber,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
      ageDays: Math.max(0, nightsBetween(stay.departureDate, input.businessDate)),
      primaryCta: CTA.check_out,
      secondary: "sheet",
      waived: false,
    });
  }

  if (overbookingLane === "live") {
    rows.push(...deriveOverbookingRows(input.demandStays ?? [], input.rooms, input.businessDate));
  }

  if (discrepancyLane === "live") {
    rows.push(
      ...deriveDiscrepancyRows(input.discrepancies ?? [], Boolean(input.canResolveDiscrepancy), input.businessDate),
    );
  }

  return {
    rows,
    comingSoon: comingSoonExceptionTypes(input.folioLane, feedComingSoon(overbookingLane, discrepancyLane)),
  };
}

function deriveOverbookingRows(
  demandStays: OverbookStayLike[],
  rooms: ExceptionRoomLike[],
  businessDate: string,
): ExceptionRow[] {
  const sellableByType = new Map<string, { count: number; name: string }>();
  for (const room of rooms) {
    if (!room.roomTypeId || !isSellableRoomStatus(room.status)) continue;
    const current = sellableByType.get(room.roomTypeId) ?? {
      count: 0,
      name: room.roomTypeName ?? "Room type",
    };
    current.count += 1;
    if (room.roomTypeName) current.name = room.roomTypeName;
    sellableByType.set(room.roomTypeId, current);
  }

  const rows: ExceptionRow[] = [];
  for (const date of dateRange(businessDate, OVERBOOKING_HORIZON_DAYS)) {
    const demandByType = new Map<string, OverbookStayLike[]>();
    for (const stay of demandStays) {
      if (!stay.roomTypeId) continue;
      if (!stayDemandOverlapsDate(stay, date, businessDate)) continue;
      const list = demandByType.get(stay.roomTypeId) ?? [];
      list.push(stay);
      demandByType.set(stay.roomTypeId, list);
    }
    const typeIds = new Set([...sellableByType.keys(), ...demandByType.keys()]);
    for (const typeId of typeIds) {
      const demand = demandByType.get(typeId) ?? [];
      const sellable = sellableByType.get(typeId);
      const sellableCount = sellable?.count ?? 0;
      if (demand.length <= sellableCount) continue;
      const name = sellable?.name ?? demand[0]?.roomTypeName ?? "Room type";
      const surplusStay = demand.find((stay) => !stay.roomId) ?? null;
      rows.push({
        id: `overbooking:${date}:${typeId}`,
        type: "overbooking",
        label: "Overbooking",
        severity: "high",
        reason: `Demand exceeds sellable for ${name} on ${date}`,
        stayId: surplusStay?.id ?? null,
        guestName: surplusStay?.guestName ?? "",
        confirmationNumber: surplusStay?.confirmationNumber ?? "",
        roomNumber: null,
        arrivalDate: date,
        departureDate: date,
        ageDays: null,
        primaryCta: CTA.open_rack,
        secondary: surplusStay ? "sheet" : "none",
        waived: false,
        roomTypeId: typeId,
        roomTypeName: name,
        focusDate: date,
        secondaryCta: surplusStay ? CTA.assign : null,
      });
    }
  }
  return rows;
}

function deriveDiscrepancyRows(
  discrepancies: ExceptionDiscrepancyLike[],
  canResolve: boolean,
  businessDate: string,
): ExceptionRow[] {
  const rows: ExceptionRow[] = [];
  for (const item of discrepancies) {
    if (!isOpenDiscrepancyStatus(item.status)) continue;
    rows.push({
      id: `room_discrepancy:${item.id}`,
      type: "room_discrepancy",
      label: "Room discrepancy",
      severity: "standard",
      reason: `Room ${item.roomNumber} discrepancy open — ${discrepancyBrief(item)}`,
      stayId: null,
      guestName: "",
      confirmationNumber: "",
      roomNumber: item.roomNumber,
      arrivalDate: businessDate,
      departureDate: businessDate,
      ageDays: null,
      primaryCta: CTA.open_room,
      secondary: "room",
      waived: false,
      roomId: item.roomId,
      discrepancyId: item.id,
      focusDate: businessDate,
      secondaryCta: canResolve ? CTA.resolve : null,
      resolveAvailable: canResolve,
    });
  }
  return rows;
}

export type OpsStripItem = {
  id: string;
  label: string;
  value: number;
  display?: string;
  filter: Partial<RackFilters>;
};

export function deriveOpsStrip(input: {
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  availableRooms: number;
  occupiedRooms: number;
  outOfOrder: number;
  outOfService: number;
  rooms: Array<{
    occupancy: "vacant" | "occupied";
    status: string;
    housekeepingStatus?: string | null;
  }>;
  hkAvailable: boolean;
  occupancyTrusted?: boolean;
  openDiscrepancies?: number | null;
}): OpsStripItem[] {
  const items: OpsStripItem[] = [
    { id: "arrivals", label: "Arrivals", value: input.arrivalsToday, filter: { staySlice: "arrival" } },
    { id: "departures", label: "Departures", value: input.departuresToday, filter: { staySlice: "departure" } },
    { id: "in_house", label: "In-house", value: input.inHouse, filter: { staySlice: "in_house" } },
    { id: "occupied", label: "Occupied", value: input.occupiedRooms, filter: { roomStatus: "occupied" } },
    { id: "available", label: "Available", value: input.availableRooms, filter: { roomStatus: "available" } },
  ];

  const vacantSellable = input.rooms.filter(
    (room) => room.occupancy === "vacant" && !isOooOrOos(room.status),
  );
  items.push({
    id: "vacant",
    label: "Vacant",
    value: vacantSellable.length,
    filter: { roomStatus: "vacant" },
  });

  if (input.hkAvailable) {
    const vacantDirty = vacantSellable.filter((room) => room.housekeepingStatus === "dirty");
    const vacantClean = vacantSellable.filter(
      (room) => room.housekeepingStatus === "clean" || room.housekeepingStatus === "inspected",
    );
    items.push({
      id: "vacant_dirty",
      label: "Vacant dirty",
      value: vacantDirty.length,
      filter: { roomStatus: "vacant", hkStatus: "dirty" },
    });
    items.push({
      id: "vacant_clean",
      label: "Vacant clean",
      value: vacantClean.length,
      filter: { roomStatus: "vacant", hkStatus: "clean" },
    });
  }

  items.push(
    { id: "ooo", label: "OOO", value: input.outOfOrder, filter: { roomStatus: "out_of_order" } },
    { id: "oos", label: "OOS", value: input.outOfService, filter: { roomStatus: "out_of_service" } },
  );

  const percent =
    input.occupancyTrusted === false
      ? null
      : occupancyPercent(input.occupiedRooms, sellableRoomCount(input.rooms));
  if (percent != null) {
    items.push({
      id: "occupancy_pct",
      label: "Occupancy %",
      value: percent,
      display: `${percent}%`,
      filter: { roomStatus: "occupied" },
    });
  }

  if (input.openDiscrepancies != null) {
    items.push({
      id: "discrepancies",
      label: "Discrepancies",
      value: input.openDiscrepancies,
      filter: { discrepancy: "open" },
    });
  }

  return items;
}

export function stayMoneyCellsVisible(input: {
  folioLane: FolioSignalLane;
  signals: StayMoneySignal[];
}): { balance: boolean; deposit: boolean; key: boolean; folio: boolean } {
  const hasKey = input.signals.some((signal) => signal.keyIssued || signal.keyWaived);
  const folioKnown = input.folioLane === "live" || input.folioLane === "permission_denied";
  return {
    balance: input.folioLane === "live",
    deposit: input.folioLane === "live",
    key: hasKey,
    folio: folioKnown,
  };
}

export function keyCellLabel(signal: StayMoneySignal | undefined): string | null {
  if (!signal) return null;
  if (signal.keyIssued) return "Issued";
  if (signal.keyWaived) return "Waived";
  return null;
}

export function folioUnavailableLabel(folioLane: FolioSignalLane): string | null {
  if (folioLane === "permission_denied") return "Unavailable";
  return null;
}

export function isHighException(row: ExceptionRow): boolean {
  return row.severity === "high";
}

export function auditActionLabel(eventType: string, newValues: Record<string, unknown> | null): string {
  if (newValues?.["checkout_override"] === true) return "Supervisor override";
  if (newValues?.["deposit_waived"] === true) return "Deposit waived";
  if (newValues?.["cancel_fee_waived"] === true) return "Cancel fee waived";
  if (newValues?.["noshow_fee_waived"] === true) return "No-show charge waived";
  if (newValues?.["registration_waived"] === true) return "Registration waived";
  if (newValues?.["key_waived"] === true) return "Key waived";
  const labels: Record<string, string> = {
    check_in: "Check-in",
    check_out: "Checkout settle",
    cancelled: "Cancel",
    no_show: "No-show",
    room_moved: "Move",
    room_changed: "Move",
    stay_extended: "Extend",
    stay_shortened: "Shorten",
    amended: "Amend",
    room_assigned: "Assign room",
  };
  return labels[eventType] ?? eventType.replace(/_/g, " ");
}
