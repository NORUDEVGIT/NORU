/**
 * Front Office IA — Issue #29.
 *
 * Presentation contract only. Every Live action maps to an existing dialog or
 * server function. Coming soon actions never invoke a write.
 */
type ReservationStatus = "pending" | "confirmed" | "cancelled" | "checked_in" | "checked_out" | "no_show";

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function nightsBetween(arrival: string, departure: string): number {
  const a = Date.parse(`${arrival}T00:00:00Z`);
  const d = Date.parse(`${departure}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(d)) return 0;
  return Math.max(0, Math.round((d - a) / 86_400_000));
}

type StayLike = {
  id: string;
  confirmationNumber: string;
  guestId: string;
  guestName: string;
  guestVip: boolean;
  guestPhone: string | null;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode?: string | null;
  roomId: string | null;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  children: number;
  status: ReservationStatus;
  specialRequests?: string | null;
  source?: string | null;
};

export const FO_BRAND = {
  chrome: "#251605",
  gold: "#C89933",
  green: "#436436",
  gray: "#CCCCCC",
} as const;

export const FO_PRIMARY_TITLE = "Room Rack + Calendar";

export const FO_DESK_TITLE = "Front Office Desk";

export const FO_DESK_DESCRIPTION =
  "Manage arrivals, departures, in-house guests, room status and front office operations.";

export const FO_NAV_ITEMS = [
  { id: "rack", label: FO_PRIMARY_TITLE },
  { id: "arrivals", label: "Arrivals" },
  { id: "inhouse", label: "In-House Guests" },
  { id: "departures", label: "Departures" },
  { id: "walkins", label: "Walk-ins" },
  { id: "amendments", label: "Amendments" },
  { id: "cancellations", label: "Cancellations" },
  { id: "noshows", label: "No-Shows" },
  { id: "exceptions", label: "Exceptions" },
] as const;

export type FoNavId = (typeof FO_NAV_ITEMS)[number]["id"];

export const FO_NAV_IDS: FoNavId[] = FO_NAV_ITEMS.map((item) => item.id);

export type CalendarHorizon = 1 | 3 | 7 | 14 | 30;

export const LIVE_HORIZONS: CalendarHorizon[] = [1, 3, 7, 14, 30];

export type RackGroupBy = "none" | "floor" | "room_type";

export type FoSearch = {
  tab: FoNavId;
  horizon?: CalendarHorizon;
  date?: string;
  group?: RackGroupBy;
};

export function parseCalendarHorizon(raw: unknown): CalendarHorizon | undefined {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (n === 1 || n === 3 || n === 7 || n === 14 || n === 30) return n;
  return undefined;
}

export function parseRackGroupBy(raw: unknown): RackGroupBy {
  if (raw === "floor" || raw === "room_type") return raw;
  return "none";
}

export function parseFocusDate(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

/** Canonical Front Office search. Invalid tab falls back to Room Rack. */
export function foSearchFromUnknown(search: Record<string, unknown>): FoSearch {
  const raw = typeof search["tab"] === "string" ? search["tab"] : undefined;
  const result: FoSearch = { tab: resolveFoNav(raw) };
  const horizon = parseCalendarHorizon(search["horizon"]);
  const date = parseFocusDate(search["date"]);
  const group = parseRackGroupBy(search["group"]);
  if (horizon) result.horizon = horizon;
  if (date) result.date = date;
  if (group !== "none") result.group = group;
  return result;
}

export function foRackSearchSlice(input: {
  horizon?: CalendarHorizon;
  date?: string;
  group?: RackGroupBy;
}): Pick<FoSearch, "horizon" | "date" | "group"> {
  const slice: Pick<FoSearch, "horizon" | "date" | "group"> = {};
  if (input.horizon) slice.horizon = input.horizon;
  if (input.date) slice.date = input.date;
  if (input.group && input.group !== "none") slice.group = input.group;
  return slice;
}

export function groupRackRooms<T extends { id: string; floor: string | null; roomTypeName: string }>(
  rooms: T[],
  groupBy: RackGroupBy,
): Array<{ key: string; label: string; rooms: T[] }> {
  if (groupBy === "none") return [{ key: "all", label: "All rooms", rooms }];
  const groups: Array<{ key: string; label: string; rooms: T[] }> = [];
  const index = new Map<string, number>();
  for (const room of rooms) {
    const label = groupBy === "floor" ? (room.floor?.trim() || "No floor") : room.roomTypeName;
    const key = `${groupBy}:${label}`;
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, groups.length);
      groups.push({ key, label, rooms: [room] });
    } else {
      groups[existing]?.rooms.push(room);
    }
  }
  return groups;
}

export const FO_LANDING_NAV: FoNavId = "rack";

export const LEGACY_FO_TAB_MAP: Record<string, FoNavId> = {
  overview: "rack",
  rack: "rack",
  arrivals: "arrivals",
  checkin: "arrivals",
  assignment: "arrivals",
  inhouse: "inhouse",
  departures: "departures",
  walkins: "walkins",
  amendments: "amendments",
  cancellations: "cancellations",
  noshows: "noshows",
  exceptions: "exceptions",
};

export function resolveFoNav(tab: string | undefined): FoNavId {
  if (!tab) return FO_LANDING_NAV;
  return LEGACY_FO_TAB_MAP[tab] ?? FO_LANDING_NAV;
}

export type ActionLane = "live" | "coming_soon";

/** Live FO action registry — gated writers only. Ungated RPC wrappers must not appear here. */
export type FoWriteName =
  | "completeFoCheckIn"
  | "completeFoCheckOut"
  | "moveReservationRoom"
  | "changeStayDates"
  | "completeFoNoShow"
  | "completeFoCancel"
  | "assignReservationRoom"
  | "createReservation"
  | "amendReservation";

export type FoActionDef = {
  id: string;
  label: string;
  lane: ActionLane;
  /** Existing write this Live action may trigger. Coming soon must omit this. */
  write?: FoWriteName;
  menus: Array<"quick" | "bar" | "sheet">;
};

export const FO_ACTIONS: FoActionDef[] = [
  { id: "new_reservation", label: "New Reservation", lane: "live", write: "createReservation", menus: ["quick"] },
  { id: "walk_in", label: "Walk-in", lane: "live", write: "createReservation", menus: ["quick"] },
  { id: "check_in", label: "Check-in", lane: "live", write: "completeFoCheckIn", menus: ["quick", "bar", "sheet"] },
  { id: "room_move", label: "Room Move", lane: "live", write: "moveReservationRoom", menus: ["quick", "bar", "sheet"] },
  { id: "extend_stay", label: "Extend Stay", lane: "live", write: "changeStayDates", menus: ["quick", "bar", "sheet"] },
  { id: "check_out", label: "Check-out", lane: "live", write: "completeFoCheckOut", menus: ["quick", "bar", "sheet"] },
  { id: "guest_search", label: "Guest Search", lane: "live", menus: ["quick"] },
  { id: "guest_request", label: "Guest Request", lane: "live", menus: ["quick"] },
  { id: "view", label: "View", lane: "live", menus: ["bar", "sheet"] },
  { id: "assign", label: "Assign Room", lane: "live", write: "assignReservationRoom", menus: ["bar", "sheet"] },
  { id: "no_show", label: "No-show", lane: "live", write: "completeFoNoShow", menus: ["bar", "sheet"] },
  { id: "amend_notes", label: "Amend notes", lane: "live", write: "amendReservation", menus: ["sheet"] },
  { id: "upgrade_downgrade", label: "Upgrade / Downgrade", lane: "live", write: "amendReservation", menus: ["sheet"] },
  { id: "add_remove_guest", label: "Add / Remove Guest", lane: "live", write: "amendReservation", menus: ["sheet"] },
  { id: "add_service", label: "Add Service", lane: "live", menus: ["sheet"] },
  { id: "add_special_request", label: "Add Special Request", lane: "live", write: "amendReservation", menus: ["sheet"] },
  { id: "cancel_fees", label: "Cancel policy / fees", lane: "live", write: "completeFoCancel", menus: ["sheet"] },
  { id: "view_folio", label: "View Folio", lane: "live", menus: ["sheet"] },
];

export function actionsForMenu(menu: FoActionDef["menus"][number]): FoActionDef[] {
  return FO_ACTIONS.filter((a) => a.menus.includes(menu));
}

export type StayQuickViewMenuId =
  | "check_in"
  | "check_out"
  | "assign"
  | "room_move"
  | "add_service"
  | "no_show"
  | "cancel_fees"
  | "view_folio"
  | "extend_stay"
  | "upgrade_downgrade"
  | "add_remove_guest"
  | "amend_notes"
  | "add_special_request";

export type StayQuickViewMenuItem = { id: StayQuickViewMenuId; label: string };

/** Status-aware Stay Quick View menu. Open Reservation is a header CTA, not a menu item. */
export function stayQuickViewMenuItems(input: {
  status: ReservationStatus;
  assigned: boolean;
}): StayQuickViewMenuItem[] {
  const { status, assigned } = input;
  if (status === "pending" || status === "confirmed") {
    const items: StayQuickViewMenuItem[] = [];
    items.push({ id: "check_in", label: "Check In" });
    if (!assigned) items.push({ id: "assign", label: "Assign Room" });
    items.push({ id: "no_show", label: "No-Show" });
    items.push({ id: "cancel_fees", label: "Cancel Reservation" });
    items.push({ id: "view_folio", label: "View Folio" });
    return items;
  }
  if (status === "checked_in") {
    return [
      { id: "room_move", label: "Room Move" },
      { id: "add_service", label: "Add Service" },
      { id: "view_folio", label: "View Folio" },
      { id: "check_out", label: "Check Out" },
    ];
  }
  if (status === "checked_out" || status === "cancelled" || status === "no_show") {
    return [{ id: "view_folio", label: "View Folio" }];
  }
  return [];
}

export function stayQuickViewCanAmend(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed" || status === "checked_in";
}

export function stayQuickViewAmendItems(status: ReservationStatus): StayQuickViewMenuItem[] {
  if (!stayQuickViewCanAmend(status)) return [];
  const items: StayQuickViewMenuItem[] = [
    { id: "extend_stay", label: "Stay dates" },
    { id: "upgrade_downgrade", label: "Upgrade / Downgrade" },
    { id: "add_remove_guest", label: "Add / Remove Guest" },
    { id: "amend_notes", label: "Notes" },
    { id: "add_special_request", label: "Special request" },
  ];
  return items;
}

export function calendarHorizonLabel(days: CalendarHorizon): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export function foActionById(id: string): FoActionDef | undefined {
  return FO_ACTIONS.find((a) => a.id === id);
}

export function menuHasVoid(menu: FoActionDef["menus"][number]): boolean {
  return actionsForMenu(menu).some((a) => /void/i.test(a.id) || /void/i.test(a.label));
}

export function navHasRoomMoves(): boolean {
  const labels = FO_NAV_ITEMS.map((item) => item.label as string);
  const ids = FO_NAV_ITEMS.map((item) => item.id as string);
  return labels.includes("Room Moves") || ids.includes("moves") || ids.includes("room_moves");
}

/**
 * FO-FS0 (Issue #31) — leave Front Office without opening the PMS package rail.
 * Existing routes only. Front Office itself is omitted so the escape is not a loop.
 */
export const FO_ESCAPE_MODULES = [
  { label: "PMS Home", to: "/restaurant/pms/dashboard" },
  { label: "Reservations", to: "/restaurant/pms/reservations" },
  { label: "Housekeeping", to: "/restaurant/pms/housekeeping" },
  { label: "Cashiering", to: "/restaurant/pms/cashiering" },
  { label: "Night Audit", to: "/restaurant/pms/night-audit" },
  { label: "Rates", to: "/restaurant/pms/rates-revenue" },
  { label: "Reports", to: "/restaurant/pms/reports" },
  { label: "Settings", to: "/restaurant/settings" },
] as const;

export type FoEscapeModule = (typeof FO_ESCAPE_MODULES)[number];

/** True only on Front Office: RestaurantShell must not paint the PMS package rail or its width. */
export function shouldSuppressRestaurantPmsRail(pmsModule: string | undefined): boolean {
  return pmsModule === "front-office";
}

export type FoWriteFns = Partial<Record<FoWriteName, () => void>>;

export function invokeFoAction(
  actionId: string,
  writes: FoWriteFns,
): { lane: ActionLane; invokedWrite: FoWriteName | null } {
  const action = foActionById(actionId);
  if (!action || action.lane === "coming_soon") {
    return { lane: "coming_soon", invokedWrite: null };
  }
  if (action.write) {
    writes[action.write]?.();
    return { lane: "live", invokedWrite: action.write };
  }
  return { lane: "live", invokedWrite: null };
}

/**
 * Drop / resize never writes. FO-FS5 opens FoRackConfirmSheet (or snaps back)
 * from the calendar; Confirm is the only path that may call a write.
 */
export function handleReservationBarDrop(
  _payload: { reservationId: string; targetRoomId: string },
  writes: FoWriteFns,
): { moved: false; write: false; lane: "live" } {
  void _payload;
  void writes.moveReservationRoom;
  void writes.changeStayDates;
  return { moved: false, write: false, lane: "live" };
}

export type UnavailableKind = "permission_denied" | "coming_soon" | "empty";

export function classifyUnavailable(reason: "permission" | "coming_soon" | "empty"): UnavailableKind {
  if (reason === "permission") return "permission_denied";
  if (reason === "empty") return "empty";
  return "coming_soon";
}

export function isPermissionDeniedMessage(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /permission|don't have access|do not have access|not authorized|forbidden|access denied/i.test(msg);
}

export function isLiveHorizon(days: CalendarHorizon): boolean {
  return LIVE_HORIZONS.includes(days);
}

export function dateRange(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}

export function reservationBarPlacement(
  arrival: string,
  departure: string,
  rangeStart: string,
  days: number,
): { startCol: number; endCol: number; clipped: boolean } | null {
  const rangeEnd = addDays(rangeStart, days);
  const start = arrival > rangeStart ? arrival : rangeStart;
  const end = departure < rangeEnd ? departure : rangeEnd;
  if (start >= end) return null;
  return {
    startCol: nightsBetween(rangeStart, start) + 1,
    endCol: nightsBetween(rangeStart, end) + 1,
    clipped: arrival < rangeStart || departure > rangeEnd,
  };
}

export function stayOverlapsRange(arrival: string, departure: string, rangeStart: string, days: number): boolean {
  return reservationBarPlacement(arrival, departure, rangeStart, days) !== null;
}

export function stayFromReservation(
  row: StayLike,
  businessDate: string,
): StayLike & { overstay: boolean; specialRequests: string | null } {
  const specialRequests = row.specialRequests ?? null;
  return {
    id: row.id,
    confirmationNumber: row.confirmationNumber,
    guestId: row.guestId,
    guestName: row.guestName,
    guestVip: row.guestVip,
    guestPhone: row.guestPhone,
    roomTypeId: row.roomTypeId,
    roomTypeName: row.roomTypeName,
    ...(row.roomTypeCode !== undefined ? { roomTypeCode: row.roomTypeCode } : {}),
    roomId: row.roomId,
    roomNumber: row.roomNumber,
    arrivalDate: row.arrivalDate,
    departureDate: row.departureDate,
    nights: row.nights,
    adults: row.adults,
    children: row.children,
    status: row.status,
    specialRequests,
    ...(row.source !== undefined ? { source: row.source } : {}),
    overstay: row.status === "checked_in" && row.departureDate < businessDate,
  };
}

export type RackStaySlice = "all" | "arrival" | "departure" | "in_house";

export type RackFilters = {
  floor: string;
  roomType: string;
  roomStatus: string;
  hkStatus: string;
  resStatus: string;
  staySlice: RackStaySlice;
  vip: string;
  source: string;
  group: string;
  corporate: string;
  specialRequest: string;
  discrepancy: string;
};

export const EMPTY_RACK_FILTERS: RackFilters = {
  floor: "all",
  roomType: "all",
  roomStatus: "all",
  hkStatus: "all",
  resStatus: "all",
  staySlice: "all",
  vip: "all",
  source: "all",
  group: "all",
  corporate: "all",
  specialRequest: "all",
  discrepancy: "all",
};

export function isOpsStripFilterActive(filters: RackFilters, applied: Partial<RackFilters>): boolean {
  const keys = Object.keys(applied) as Array<keyof RackFilters>;
  if (keys.length === 0) return false;
  return keys.every((key) => filters[key] === applied[key]);
}

export const RACK_LIVE_FILTERS = [
  { id: "group", label: "Group" },
  { id: "corporate", label: "Corporate" },
  { id: "special_request", label: "Special request" },
] as const;

export function sourceToken(source: string | null | undefined): string {
  return (source ?? "").trim().toLowerCase();
}

export function sourceIsGroup(source: string | null | undefined): boolean {
  return sourceToken(source) === "group";
}

export function sourceIsCorporate(source: string | null | undefined): boolean {
  return sourceToken(source) === "corporate";
}

export function hasSpecialRequestText(text: string | null | undefined): boolean {
  return (text ?? "").trim().length > 0;
}

export type RoomLegendKey = "vacant" | "occupied" | "available" | "out_of_order" | "out_of_service";
export type HkLegendKey = "clean" | "dirty" | "inspected" | "pickup";
export type ReservationLegendKey = ReservationStatus;
export type LegendShape = "swatch" | "glyph" | "bar";

/** Room · Housekeeping · Reservation use distinct mark shapes. */
export const ROOM_LEGEND_SHAPE: LegendShape = "swatch";
export const HK_LEGEND_SHAPE: LegendShape = "glyph";
export const RESERVATION_LEGEND_SHAPE: LegendShape = "bar";

export const FO_LEGEND_DEFAULT_OPEN = false;

/** Live HK codes only. Do not invent Clean or map In progress. */
export const LIVE_HK_STATUSES = ["clean", "dirty", "inspected", "pickup"] as const;
export type LiveHkStatus = (typeof LIVE_HK_STATUSES)[number];

export const HK_DIRTY_COLOR = "#B42318";
export const HK_INSPECTED_COLOR = "#2F5D8A";
export const HK_PICKUP_COLOR = "#D97706";

export const ROOM_LEGEND: { key: RoomLegendKey; label: string; color: string; shape: LegendShape }[] = [
  { key: "vacant", label: "Vacant", color: "#E8E0D4", shape: ROOM_LEGEND_SHAPE },
  { key: "occupied", label: "Occupied", color: FO_BRAND.chrome, shape: ROOM_LEGEND_SHAPE },
  { key: "available", label: "Available", color: "#D9D3C7", shape: ROOM_LEGEND_SHAPE },
  { key: "out_of_order", label: "Out of order", color: "#7A5C3A", shape: ROOM_LEGEND_SHAPE },
  { key: "out_of_service", label: "Out of service", color: "#B0A394", shape: ROOM_LEGEND_SHAPE },
];

export const HK_LEGEND: { key: HkLegendKey; label: string; color: string; shape: LegendShape }[] = [
  { key: "clean", label: "Clean", color: FO_BRAND.green, shape: HK_LEGEND_SHAPE },
  { key: "dirty", label: "Dirty", color: HK_DIRTY_COLOR, shape: HK_LEGEND_SHAPE },
  { key: "inspected", label: "Inspected", color: HK_INSPECTED_COLOR, shape: HK_LEGEND_SHAPE },
  { key: "pickup", label: "Pickup", color: HK_PICKUP_COLOR, shape: HK_LEGEND_SHAPE },
];

export const RESERVATION_LEGEND: { key: ReservationLegendKey; label: string; color: string; shape: LegendShape }[] = [
  { key: "pending", label: "Pending", color: FO_BRAND.gray, shape: RESERVATION_LEGEND_SHAPE },
  { key: "confirmed", label: "Confirmed", color: FO_BRAND.gold, shape: RESERVATION_LEGEND_SHAPE },
  { key: "checked_in", label: "In-house", color: FO_BRAND.green, shape: RESERVATION_LEGEND_SHAPE },
  { key: "checked_out", label: "Checked out", color: "#8A8A8A", shape: RESERVATION_LEGEND_SHAPE },
  { key: "cancelled", label: "Cancelled", color: "#8B2E2E", shape: RESERVATION_LEGEND_SHAPE },
  { key: "no_show", label: "No-show", color: "#6B5B4B", shape: RESERVATION_LEGEND_SHAPE },
];

export function reservationBarColor(status: ReservationStatus): string {
  return RESERVATION_LEGEND.find((item) => item.key === status)?.color ?? FO_BRAND.gold;
}

export function liveHkStatus(status: string | null | undefined): LiveHkStatus | null {
  if (!status) return null;
  return (LIVE_HK_STATUSES as readonly string[]).includes(status) ? (status as LiveHkStatus) : null;
}

export function hkStatusAriaLabel(status: string | null | undefined): string | null {
  const live = liveHkStatus(status);
  if (!live) return null;
  return HK_LEGEND.find((item) => item.key === live)?.label ?? null;
}

export function legendColourHexes(items: ReadonlyArray<{ color: string }>): string[] {
  return items.map((item) => item.color.toLowerCase());
}

export function colourSetsOverlap(a: readonly string[], b: readonly string[]): string[] {
  const right = new Set(b.map((color) => color.toLowerCase()));
  return a.filter((color) => right.has(color.toLowerCase()));
}

/** Room neutrals/ink/OOO/OOS must not share hex with HK or reservation systems. */
export function foRoomLegendColourCollisions(): string[] {
  const room = legendColourHexes(ROOM_LEGEND);
  return [
    ...colourSetsOverlap(room, legendColourHexes(HK_LEGEND)),
    ...colourSetsOverlap(room, legendColourHexes(RESERVATION_LEGEND)),
  ];
}

export function countActiveRackFilters(filters: RackFilters): number {
  return (Object.values(filters) as string[]).filter((value) => value !== "all").length;
}

export {
  deriveExceptionRows,
  exceptionBadgeCount,
  exceptionHighCount,
} from "./fo-exceptions.ts";

export const RESERVED_BADGE_SLOTS = [
  { id: "vip_badge", label: "VIP", lane: "live" as const },
  { id: "group_badge", label: "Group", lane: "live" as const },
  { id: "corporate_badge", label: "Corporate", lane: "live" as const },
  { id: "special_request_badge", label: "Special request", lane: "live" as const },
  { id: "room_discrepancy_badge", label: "Discrepancy", lane: "live" as const },
  { id: "early_arrival_badge", label: "Early arrival", lane: "empty" as const },
  { id: "late_arrival_badge", label: "Late arrival", lane: "empty" as const },
] as const;

export const LIST_COMING_SOON_COLUMNS = [
  { id: "registration", label: "Registration card" },
] as const;

export const OPS_STRIP_LIVE_KEYS = [
  "arrivalsToday",
  "departuresToday",
  "inHouse",
  "availableRooms",
  "occupiedRooms",
  "outOfOrder",
  "outOfService",
] as const;

/** Occupancy % is Live when sellable > 0. Discrepancies Live only with the discrepancy feed. */
export const OPS_STRIP_COMING_SOON = [] as const;

export function shouldShowWeekGantt(viewport: "phone" | "tablet" | "desktop"): boolean {
  return viewport !== "phone";
}

export function shouldShowDragHandle(viewport: "phone" | "tablet" | "desktop" | "wide"): boolean {
  return viewport !== "phone";
}

export function roomMatchesFilters(
  room: {
    floor: string | null;
    roomTypeName: string;
    occupancy: "vacant" | "occupied";
    status: string;
    housekeepingStatus?: string | null;
    hasOpenDiscrepancy?: boolean;
  },
  filters: RackFilters,
): boolean {
  if (filters.floor !== "all" && (room.floor ?? "") !== filters.floor) return false;
  if (filters.roomType !== "all" && room.roomTypeName !== filters.roomType) return false;
  if (filters.hkStatus !== "all" && (room.housekeepingStatus ?? "") !== filters.hkStatus) return false;
  if (filters.discrepancy === "open" && !room.hasOpenDiscrepancy) return false;
  if (filters.roomStatus !== "all") {
    if (filters.roomStatus === "vacant" || filters.roomStatus === "occupied") {
      if (room.occupancy !== filters.roomStatus) return false;
    } else if (room.status !== filters.roomStatus) {
      return false;
    }
  }
  return true;
}

export function stayMatchesFilters(
  stay: {
    status: ReservationStatus;
    arrivalDate: string;
    departureDate: string;
    guestVip: boolean;
    source?: string | null;
    specialRequests?: string | null;
  },
  filters: RackFilters,
  focusDate: string,
): boolean {
  if (filters.resStatus !== "all" && stay.status !== filters.resStatus) return false;
  if (filters.vip === "vip" && !stay.guestVip) return false;
  if (filters.source !== "all" && (stay.source ?? "") !== filters.source) return false;
  if (filters.group === "group" && !sourceIsGroup(stay.source)) return false;
  if (filters.corporate === "corporate" && !sourceIsCorporate(stay.source)) return false;
  if (filters.specialRequest === "special" && !hasSpecialRequestText(stay.specialRequests)) return false;
  if (filters.staySlice === "arrival" && stay.arrivalDate !== focusDate) return false;
  if (filters.staySlice === "departure" && stay.departureDate !== focusDate) return false;
  if (filters.staySlice === "in_house") {
    const inHouse = stay.status === "checked_in" && stay.arrivalDate <= focusDate && stay.departureDate > focusDate;
    if (!inHouse) return false;
  }
  return true;
}
