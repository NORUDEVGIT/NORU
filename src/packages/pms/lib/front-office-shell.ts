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
  roomId: string | null;
  roomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  children: number;
  status: ReservationStatus;
  specialRequests?: string | null;
};

export const FO_BRAND = {
  chrome: "#251605",
  gold: "#C89933",
  green: "#436436",
  gray: "#CCCCCC",
} as const;

export const FO_PRIMARY_TITLE = "Room Rack + Calendar";

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

export type FoWriteName =
  | "checkInReservation"
  | "checkOutReservation"
  | "moveReservationRoom"
  | "changeStayDates"
  | "markNoShow"
  | "assignReservationRoom"
  | "createReservation"
  | "amendReservation"
  | "setReservationStatus";

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
  { id: "check_in", label: "Check-in", lane: "live", write: "checkInReservation", menus: ["quick", "bar", "sheet"] },
  { id: "room_move", label: "Room Move", lane: "live", write: "moveReservationRoom", menus: ["quick", "bar", "sheet"] },
  { id: "extend_stay", label: "Extend Stay", lane: "live", write: "changeStayDates", menus: ["quick", "bar", "sheet"] },
  { id: "check_out", label: "Check-out", lane: "live", write: "checkOutReservation", menus: ["quick", "bar", "sheet"] },
  { id: "guest_search", label: "Guest Search", lane: "live", menus: ["quick"] },
  { id: "guest_request", label: "Guest Request", lane: "coming_soon", menus: ["quick"] },
  { id: "view", label: "View", lane: "live", menus: ["bar", "sheet"] },
  { id: "assign", label: "Assign Room", lane: "live", write: "assignReservationRoom", menus: ["bar", "sheet"] },
  { id: "no_show", label: "No-show", lane: "live", write: "markNoShow", menus: ["bar", "sheet"] },
  { id: "amend_notes", label: "Amend notes", lane: "live", write: "amendReservation", menus: ["sheet"] },
  { id: "upgrade_downgrade", label: "Upgrade / Downgrade", lane: "coming_soon", menus: ["sheet"] },
  { id: "add_remove_guest", label: "Add / Remove Guest", lane: "coming_soon", menus: ["sheet"] },
  { id: "add_service", label: "Add Service", lane: "coming_soon", menus: ["sheet"] },
  { id: "add_special_request", label: "Add Special Request", lane: "coming_soon", menus: ["sheet"] },
  { id: "cancel_fees", label: "Cancel policy / fees", lane: "coming_soon", menus: ["sheet"] },
  { id: "view_folio", label: "View Folio", lane: "live", menus: ["sheet"] },
];

export function actionsForMenu(menu: FoActionDef["menus"][number]): FoActionDef[] {
  return FO_ACTIONS.filter((a) => a.menus.includes(menu));
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

/** Drag-and-drop room moves are Coming soon. Never call moveReservationRoom. */
export function handleReservationBarDrop(
  _payload: { reservationId: string; targetRoomId: string },
  writes: FoWriteFns,
): { moved: false; lane: "coming_soon" } {
  void _payload;
  void writes.moveReservationRoom;
  return { moved: false, lane: "coming_soon" };
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

export type CalendarHorizon = 1 | 7 | 14 | 30;

export const LIVE_HORIZONS: CalendarHorizon[] = [1, 7];

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
    roomId: row.roomId,
    roomNumber: row.roomNumber,
    arrivalDate: row.arrivalDate,
    departureDate: row.departureDate,
    nights: row.nights,
    adults: row.adults,
    children: row.children,
    status: row.status,
    specialRequests,
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
};

export const RACK_COMING_SOON_FILTERS = [
  { id: "group", label: "Group" },
  { id: "corporate", label: "Corporate" },
] as const;

export type RoomLegendKey = "vacant" | "occupied" | "available" | "out_of_order" | "out_of_service" | "hk_clean" | "hk_dirty" | "hk_inspected";
export type ReservationLegendKey = ReservationStatus;

export const ROOM_LEGEND: { key: RoomLegendKey; label: string; color: string }[] = [
  { key: "vacant", label: "Vacant", color: FO_BRAND.gray },
  { key: "occupied", label: "Occupied", color: FO_BRAND.chrome },
  { key: "available", label: "Available", color: FO_BRAND.green },
  { key: "out_of_order", label: "Out of order", color: "#8B2E2E" },
  { key: "out_of_service", label: "Out of service", color: "#6B5B4B" },
  { key: "hk_clean", label: "HK clean", color: FO_BRAND.green },
  { key: "hk_dirty", label: "HK dirty", color: FO_BRAND.gold },
  { key: "hk_inspected", label: "HK inspected", color: "#2F5D8A" },
];

export const RESERVATION_LEGEND: { key: ReservationLegendKey; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: FO_BRAND.gray },
  { key: "confirmed", label: "Confirmed", color: FO_BRAND.gold },
  { key: "checked_in", label: "In-house", color: FO_BRAND.green },
  { key: "checked_out", label: "Checked out", color: "#8A8A8A" },
  { key: "cancelled", label: "Cancelled", color: "#8B2E2E" },
  { key: "no_show", label: "No-show", color: "#6B5B4B" },
];

export function reservationBarColor(status: ReservationStatus): string {
  return RESERVATION_LEGEND.find((item) => item.key === status)?.color ?? FO_BRAND.gold;
}

export type ExceptionSlot = {
  id: string;
  label: string;
  lane: ActionLane;
  count: number | null;
};

export function deriveExceptionSlots(input: {
  unassignedArrivals: number;
  overstays: number;
  dueOutInHouse: number;
  outOfOrder: number;
  outOfService: number;
}): ExceptionSlot[] {
  return [
    { id: "unassigned_arrivals", label: "Unassigned arrivals", lane: "live", count: input.unassignedArrivals },
    { id: "overstays", label: "Overstays", lane: "live", count: input.overstays },
    { id: "due_out_in_house", label: "Due out, still in-house", lane: "live", count: input.dueOutInHouse },
    { id: "out_of_order", label: "Out of order rooms", lane: "live", count: input.outOfOrder },
    { id: "out_of_service", label: "Out of service rooms", lane: "live", count: input.outOfService },
    { id: "occupancy_discrepancy", label: "Occupancy discrepancy", lane: "coming_soon", count: null },
    { id: "rate_exception", label: "Rate exception", lane: "coming_soon", count: null },
    { id: "credit_hold", label: "Credit / folio hold", lane: "coming_soon", count: null },
    { id: "group_block", label: "Group block leak", lane: "coming_soon", count: null },
    { id: "room_type_mismatch", label: "Room type mismatch", lane: "coming_soon", count: null },
    { id: "key_not_issued", label: "Key not issued", lane: "coming_soon", count: null },
    { id: "deposit_outstanding", label: "Deposit outstanding", lane: "coming_soon", count: null },
  ];
}

export const RESERVED_BADGE_SLOTS = [
  { id: "vip_badge", label: "VIP", lane: "coming_soon" as const },
  { id: "group_badge", label: "Group", lane: "coming_soon" as const },
  { id: "corporate_badge", label: "Corporate", lane: "coming_soon" as const },
] as const;

export const LIST_COMING_SOON_COLUMNS = [
  { id: "balance", label: "Balance" },
  { id: "folio_settle", label: "Folio settle" },
  { id: "registration", label: "Registration card" },
  { id: "deposit", label: "Deposit" },
  { id: "key", label: "Key issued" },
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

export const OPS_STRIP_COMING_SOON = [
  { id: "occupancy_pct", label: "Occupancy %" },
  { id: "group_arrivals", label: "Group arrivals" },
] as const;

export function shouldShowWeekGantt(viewport: "phone" | "tablet" | "desktop"): boolean {
  return viewport !== "phone";
}

export function roomMatchesFilters(
  room: {
    floor: string | null;
    roomTypeName: string;
    occupancy: "vacant" | "occupied";
    status: string;
    housekeepingStatus?: string | null;
  },
  filters: RackFilters,
): boolean {
  if (filters.floor !== "all" && (room.floor ?? "") !== filters.floor) return false;
  if (filters.roomType !== "all" && room.roomTypeName !== filters.roomType) return false;
  if (filters.hkStatus !== "all" && (room.housekeepingStatus ?? "") !== filters.hkStatus) return false;
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
  },
  filters: RackFilters,
  focusDate: string,
): boolean {
  if (filters.resStatus !== "all" && stay.status !== filters.resStatus) return false;
  if (filters.vip === "vip" && !stay.guestVip) return false;
  if (filters.source !== "all" && (stay.source ?? "") !== filters.source) return false;
  if (filters.staySlice === "arrival" && stay.arrivalDate !== focusDate) return false;
  if (filters.staySlice === "departure" && stay.departureDate !== focusDate) return false;
  if (filters.staySlice === "in_house") {
    const inHouse = stay.status === "checked_in" && stay.arrivalDate <= focusDate && stay.departureDate > focusDate;
    if (!inHouse) return false;
  }
  return true;
}
