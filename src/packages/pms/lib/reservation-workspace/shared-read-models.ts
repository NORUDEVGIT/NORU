import type { ReservationStatus } from "../reservation-dates";

export const OPERATIONAL_RESERVATION_VIEWS = [
  "all",
  "arrivals",
  "departures",
  "in_house",
  "unassigned",
  "pending",
  "groups",
] as const;
export type OperationalReservationView = (typeof OPERATIONAL_RESERVATION_VIEWS)[number];

export const OPERATIONAL_RESERVATION_SORT_FIELDS = [
  "arrival_date",
  "departure_date",
  "confirmation_number",
  "created_at",
] as const;
export type OperationalReservationSortField = (typeof OPERATIONAL_RESERVATION_SORT_FIELDS)[number];
export type OperationalReservationSortDirection = "asc" | "desc";

/**
 * Shared list-row contract for Reservation operational workspaces.
 *
 * Values owned by optional/deferred domains remain nullable. In particular,
 * Section 7 commercial fields can remain null while application persistence is
 * held, and an unassigned reservation has no physical room.
 */
export interface ReservationOperationalSummary {
  reservationId: string;
  confirmationNumber: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  children: number;
  status: ReservationStatus;
  source: string;

  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;

  guestId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestVip: boolean;

  ratePlanId: string | null;
  ratePlanName: string | null;
  roomSubtotal: number | null;
  currency: string | null;

  companyMasterId: string | null;
  companyName: string | null;
  travelAgentMasterId: string | null;
  travelAgentName: string | null;
  groupAccountMasterId: string | null;
  groupName: string | null;

  commercialBookingSource: string | null;
  marketSegment: string | null;
  externalReference: string | null;
  guaranteeMethod: string | null;
  specialRequests: string | null;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface OperationalReservationPage {
  businessDate: string;
  rows: ReservationOperationalSummary[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/** Display-only Desk hints. Commands and FO RPCs remain authoritative. */
export interface ReservationDeskActionHints {
  canOpen: boolean;
  canAssignRoom: boolean;
  canConfirm: boolean;
  canCancel: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
}

export type ReservationDeskRow = ReservationOperationalSummary & {
  hints: ReservationDeskActionHints;
};

export interface ReservationDeskKpis {
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  unassigned: number;
  pending: number;
  vipArrivals: number;
  /** Linked group-master reservations only — not Groups & Blocks allotment. */
  linkedGroupReservations: number;
  /**
   * Physical vacant rooms: active rooms with status `available`, minus distinct
   * in-house assigned rooms. Not room-type sellable availability.
   */
  availableRooms: number;
  /** Waitlist domain does not exist. Always null — never a zero queue. */
  waitlist: null;
}

export interface ReservationDeskCapabilities {
  waitlist: false;
  groups: "partial";
  availableRooms: "partial";
}

export interface ReservationDeskSnapshot {
  restaurantId: string;
  businessDate: string;
  generatedAt: string;
  view: OperationalReservationView;
  query: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  kpis: ReservationDeskKpis;
  rows: ReservationDeskRow[];
  capabilities: ReservationDeskCapabilities;
}

export const QUICK_VIEW_EXCEPTION_KEYS = [
  "unassigned",
  "room_unavailable",
  "room_not_ready",
  "missing_rate_snapshot",
  "overdue_arrival",
  "overdue_departure",
] as const;
export type QuickViewExceptionKey = (typeof QUICK_VIEW_EXCEPTION_KEYS)[number];

export type QuickViewFinancialState = "available" | "permission_denied" | "not_available";

export type ReservationQuickViewActionHints = ReservationDeskActionHints & {
  canOpenFolio: boolean;
};

export interface ReservationQuickView {
  reservationId: string;
  confirmationNumber: string;
  restaurantId: string;
  businessDate: string;
  generatedAt: string;
  updatedAt: string;

  identity: {
    guestId: string;
    guestName: string;
    phone: string | null;
    email: string | null;
    vip: boolean;
    company: { id: string; name: string | null } | null;
    travelAgent: { id: string; name: string | null } | null;
    group: { id: string; name: string | null } | null;
  };

  stay: {
    arrivalDate: string;
    departureDate: string;
    nights: number;
    adults: number;
    children: number;
    status: ReservationStatus;
    source: string;
  };

  room: {
    roomTypeId: string;
    roomTypeName: string;
    roomId: string | null;
    roomNumber: string | null;
    assigned: boolean;
    operationalStatus: string | null;
    housekeepingStatus: string | null;
  };

  commercial: {
    ratePlanId: string | null;
    ratePlanName: string | null;
    roomSubtotal: number | null;
    currency: string | null;
    commercialBookingSource: string | null;
    marketSegment: string | null;
    externalReference: string | null;
    guaranteeMethod: string | null;
  };

  financial: {
    state: QuickViewFinancialState;
    folioId: string | null;
    folioNumber: string | null;
    balance: number | null;
  };

  operational: {
    specialRequests: string | null;
    notes: string | null;
    exceptionKeys: QuickViewExceptionKey[];
    lastHistoryEvent: {
      eventType: string;
      createdAt: string;
      notes: string | null;
    } | null;
  };

  actionHints: ReservationQuickViewActionHints;
}

export const ARRIVAL_EXCEPTION_KEYS = [
  "unassigned",
  "room_not_ready",
  "room_unavailable",
  "payment_issue",
  "special_request",
] as const;
export type ArrivalExceptionKey = (typeof ARRIVAL_EXCEPTION_KEYS)[number];

export const DEPARTURE_EXCEPTION_KEYS = ["overstay", "payment_issue"] as const;
export type DepartureExceptionKey = (typeof DEPARTURE_EXCEPTION_KEYS)[number];

export const FINANCIAL_SIGNAL_BATCH_CAP = 200;
export const ETA_BULK_ITEM_CAP = 50;

export type LateCheckoutPolicy = {
  allowed: boolean;
  fee: number | null;
  needsApproval: boolean;
  checkOutTime: string | null;
};

export type LateCheckoutState = {
  granted: boolean;
  until: string | null;
  note: string | null;
  policy: LateCheckoutPolicy | null;
};

export type ArrivalDepartureFinancial = {
  state: QuickViewFinancialState;
  folioId: string | null;
  balance: number | null;
  depositPosted: number | null;
  depositWaived: boolean | null;
};

export type ArrivalRow = {
  reservationId: string;
  confirmationNumber: string;
  guest: {
    id: string;
    name: string;
    vip: boolean;
    phone: string | null;
    email: string | null;
  };
  stay: {
    arrivalDate: string;
    departureDate: string;
    nights: number;
    adults: number;
    children: number;
    status: ReservationStatus;
  };
  room: {
    roomTypeId: string;
    roomTypeName: string;
    roomId: string | null;
    roomNumber: string | null;
    assigned: boolean;
    housekeepingStatus: string | null;
    operationalStatus: string | null;
    ready: boolean;
  };
  commercial: {
    source: string | null;
    guaranteeMethod: string | null;
  };
  financial: ArrivalDepartureFinancial;
  operational: {
    specialRequests: string | null;
    unassigned: boolean;
    walkInIncomplete: boolean;
    expectedArrivalTime: string | null;
    exceptionKeys: ArrivalExceptionKey[];
  };
  hints: {
    canOpen: boolean;
    canAssignRoom: boolean;
    canCheckIn: boolean;
    canUpdateEta: boolean;
    canViewGuest: boolean;
    canOpenFolio: boolean;
  };
};

export type DepartureRow = {
  reservationId: string;
  confirmationNumber: string;
  guest: {
    id: string;
    name: string;
    vip: boolean;
  };
  stay: {
    arrivalDate: string;
    departureDate: string;
    status: ReservationStatus;
    inHouse: boolean;
    overstay: boolean;
  };
  room: {
    roomTypeId: string;
    roomTypeName: string;
    roomId: string | null;
    roomNumber: string | null;
    housekeepingStatus: string | null;
    operationalStatus: string | null;
  };
  financial: ArrivalDepartureFinancial;
  operational: {
    specialRequests: string | null;
    lateCheckout: LateCheckoutState;
    exceptionKeys: DepartureExceptionKey[];
  };
  hints: {
    canOpen: boolean;
    canCheckOut: boolean;
    canExtendStay: boolean;
    canGrantLateCheckout: boolean;
    canOpenFolio: boolean;
  };
};

export type ArrivalsDeparturesTotals = {
  arrivals: number;
  departures: number;
  unassignedArrivals: number;
  notReadyArrivals: number;
  arrivalExceptions: number;
  departureExceptions: number;
  overstays: number;
  departurePaymentIssues: number;
  checkedInToday: null;
  checkedOutToday: null;
};

export type ReservationArrivalsDeparturesSnapshot = {
  restaurantId: string;
  businessDate: string;
  selectedDate: string;
  generatedAt: string;
  arrivals: ArrivalRow[];
  departures: DepartureRow[];
  totals: ArrivalsDeparturesTotals;
  pagination: {
    page: 1;
    hasMore: false;
    reason: "daily_operational_queues";
  };
  financial: {
    batchCap: typeof FINANCIAL_SIGNAL_BATCH_CAP;
    truncated: boolean;
  };
  deferred: {
    checkedInOutToday: true;
  };
};

export type BulkEtaItemResult = {
  reservationId: string;
  ok: boolean;
  message: string | null;
};

export type BulkEtaResult = {
  ok: BulkEtaItemResult[];
  failed: BulkEtaItemResult[];
};

export const CALENDAR_HORIZONS = [1, 7, 14, 30] as const;
export type CalendarHorizon = (typeof CALENDAR_HORIZONS)[number];
export const CALENDAR_MODES = ["room", "room_type"] as const;
export type CalendarMode = (typeof CALENDAR_MODES)[number];

export const CALENDAR_BAR_STATUSES = ["pending", "confirmed", "checked_in"] as const;
export type CalendarBarStatus = (typeof CALENDAR_BAR_STATUSES)[number];

export const CALENDAR_RESERVATION_CAP = 1500;
export const CALENDAR_BLOCK_CAP = 500;
export const CALENDAR_AVAILABILITY_TYPE_CAP = 40;

export const CALENDAR_BAR_EXCEPTION_KEYS = [
  "unassigned",
  "room_unavailable",
  "assignment_overlap",
] as const;
export type CalendarBarExceptionKey = (typeof CALENDAR_BAR_EXCEPTION_KEYS)[number];

export type CalendarWarningKey =
  | "reservations_truncated"
  | "blocks_truncated"
  | "blocks_unavailable"
  | "availability_truncated"
  | "availability_unavailable";

export interface CalendarRoom {
  roomId: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  building: string | null;
  floor: string | null;
  wing: string | null;
  operationalStatus: string;
  housekeepingStatus: string;
  occupiedNow: boolean;
  sellable: boolean;
}

export interface CalendarRoomType {
  roomTypeId: string;
  roomTypeName: string;
  physicalCapacity: number | null;
  available: number | null;
  reserved: number | null;
  source: "canonical" | "legacy" | null;
}

export interface CalendarBar {
  reservationId: string;
  confirmationNumber: string;
  guestId: string;
  guestName: string;
  guestVip: boolean;
  status: ReservationStatus;
  roomTypeId: string;
  roomId: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  updatedAt: string;
  source: string;
  ratePlanName: string | null;
  exceptionKeys: CalendarBarExceptionKey[];
}

export interface CalendarBlock {
  id: string;
  targetKind: "room" | "room_type";
  roomId: string | null;
  roomTypeId: string;
  startDate: string;
  endDate: string;
  blockType: string;
  status: string;
  reason: string;
}

export interface CalendarRead {
  restaurantId: string;
  businessDate: string;
  generatedAt: string;
  range: {
    start: string;
    end: string;
    horizon: CalendarHorizon;
  };
  mode: CalendarMode;
  filters: {
    building: string | null;
    floor: string | null;
    wing: string | null;
    roomTypeId: string | null;
    statuses: ReservationStatus[];
  };
  rooms: CalendarRoom[];
  roomTypes: CalendarRoomType[];
  bars: CalendarBar[];
  blocks: CalendarBlock[];
  unassigned: CalendarBar[];
  availability: CalendarRoomType[] | null;
  warnings: CalendarWarningKey[];
  truncated: boolean;
}

export const RESERVATION_EXCEPTION_KEYS = [
  "unassigned",
  "room_unavailable",
  "room_not_ready",
  "operational_block",
  "payment_issue",
  "overstay",
  "room_discrepancy",
  "overbooking",
  "missing_rate_snapshot",
  "missing_guest_contact",
  "assignment_overlap",
] as const;
export type ReservationExceptionKey = (typeof RESERVATION_EXCEPTION_KEYS)[number];

export const RESERVATION_EXCEPTION_SOURCE_MODULES = [
  "reservation",
  "front_office",
  "inventory",
  "housekeeping",
  "cashiering",
  "guest",
] as const;
export type ReservationExceptionSourceModule =
  (typeof RESERVATION_EXCEPTION_SOURCE_MODULES)[number];

export const RESERVATION_EXCEPTION_RESPONSIBLE_MODULES = [
  "reservation",
  "front_office",
  "housekeeping",
  "cashiering",
  "inventory",
  "guest_profile",
] as const;
export type ReservationExceptionResponsibleModule =
  (typeof RESERVATION_EXCEPTION_RESPONSIBLE_MODULES)[number];

export const RESERVATION_EXCEPTION_ACTION_TARGETS = [
  "open_reservation",
  "assign_room",
  "open_front_office_stay",
  "check_out",
  "open_housekeeping",
  "open_folio",
  "open_room_rack",
] as const;
export type ReservationExceptionActionTarget =
  (typeof RESERVATION_EXCEPTION_ACTION_TARGETS)[number];

export type ReservationExceptionSeverity = "high" | "standard";

export const RESERVATION_EXCEPTION_ITEM_CAP = 500;

export interface ReservationExceptionItem {
  key: ReservationExceptionKey;
  severity: ReservationExceptionSeverity;
  blocking: boolean;
  reservationId: string | null;
  confirmationNumber: string | null;
  guest: {
    id: string | null;
    name: string;
    vip: boolean;
    phone: string | null;
    email: string | null;
  };
  stay: {
    arrivalDate: string;
    departureDate: string;
    status: ReservationStatus | null;
  };
  room: {
    roomId: string | null;
    roomNumber: string | null;
    roomTypeId: string | null;
    roomTypeName: string | null;
  } | null;
  financial: ArrivalDepartureFinancial;
  sourceModule: ReservationExceptionSourceModule;
  responsibleModule: ReservationExceptionResponsibleModule;
  summary: string;
  actionTarget: ReservationExceptionActionTarget;
  detectedAt: string;
}

export type ReservationExceptionWarningKey =
  | "financial_signals_unavailable"
  | "financial_signals_truncated"
  | "overbooking_feed_truncated"
  | "discrepancy_feed_unavailable"
  | "blocks_unavailable"
  | "items_truncated";

export interface ReservationExceptionSnapshot {
  restaurantId: string;
  businessDate: string;
  generatedAt: string;
  filters: {
    severity: ReservationExceptionSeverity | null;
    sourceModule: ReservationExceptionSourceModule | null;
    responsibleModule: ReservationExceptionResponsibleModule | null;
    key: ReservationExceptionKey | null;
    status: ReservationStatus | null;
  };
  totals: {
    total: number;
    high: number;
    standard: number;
    blocking: number;
    exact: boolean;
    byKey: Partial<Record<ReservationExceptionKey, number>>;
    bySource: Partial<Record<ReservationExceptionSourceModule, number>>;
  };
  items: ReservationExceptionItem[];
  truncated: boolean;
  warnings: ReservationExceptionWarningKey[];
}
