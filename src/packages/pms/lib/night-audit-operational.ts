/**
 * Night Audit operational reconciliation.
 *
 * Reads persisted operational facts for one business date and classifies them.
 * It does not check in, check out, mark no-show, assign rooms, change room or
 * housekeeping state, approve overbooking, retry channels, approve revenue
 * requests, or complete services. Every issue routes to its owner module.
 *
 * Grain: one reservation room unit is one stay. Header room_id is never copied
 * onto sibling units. A booking with no unit rows is one header stay.
 */
import {
  evaluateRoomReadinessWithPolicy,
  type HousekeepingReadinessPolicy,
} from "./housekeeping-card2.server.ts";
import {
  financialIssuesToExceptions,
  type NightAuditFinancialException,
  type NightAuditFinancialStatus,
} from "./night-audit-financial.ts";
import { housekeepingNightAuditExceptions } from "./night-audit-rooms.ts";

export const NIGHT_AUDIT_OPERATIONAL_CATEGORIES = [
  "arrivals",
  "departures",
  "rooms",
  "housekeeping",
  "overbooking",
  "distribution",
  "revenue",
  "services",
] as const;

export type NightAuditOperationalCategory = (typeof NIGHT_AUDIT_OPERATIONAL_CATEGORIES)[number];
export type NightAuditOperationalStatus = "ready" | "warning" | "blocked" | "unavailable";
export type OperationalSeverity = "blocking" | "warning" | "info";
export type OperationalSectionState =
  | "ok"
  | "warning"
  | "blocked"
  | "not_configured"
  | "na"
  | "unavailable";

export const OPERATIONAL_UNAVAILABLE_MESSAGE =
  "Operational reconciliation is unavailable. Close stays blocked.";

export const NIGHT_AUDIT_OPERATIONAL_DETAIL_ROLES = ["owner", "manager", "receptionist"] as const;
export const NIGHT_AUDIT_OPERATIONAL_ROOM_ROLES = ["housekeeping", "housekeeper"] as const;

/**
 * Exception types the operational reconciler owns. When the operational read
 * succeeds, these replace the older reservation-level rows from evaluateAudit
 * so one unit-level row is stored per finding.
 */
export const NIGHT_AUDIT_OPERATIONAL_OWNED_TYPES = new Set([
  "arrival_not_processed",
  "pending_arrival",
  "overstay",
  "checked_in_without_room",
  "room_double_occupancy",
  "occupied_restricted_room",
  "hk_conflict",
  "dirty_room_without_task",
  "restriction_without_reason",
  "inconsistent_room_state",
]);

/** Hard operational blockers. Anything else from this module is a warning or info. */
export const NIGHT_AUDIT_OPERATIONAL_BLOCKER_CODES = [
  "arrival_not_processed",
  "overstay",
  "checked_in_without_room",
  "room_double_occupancy",
  "occupied_restricted_room",
  "occupied_maintenance_unavailable",
  "hk_conflict",
  "overbooking_unapproved",
] as const;

/** Every code this module emits, by category. Exceptions use it to label stored rows. */
export const NIGHT_AUDIT_OPERATIONAL_CODE_CATEGORY: Readonly<Record<string, NightAuditOperationalCategory>> = {
  arrival_not_processed: "arrivals",
  pending_arrival: "arrivals",
  overstay: "departures",
  departure_due_today: "departures",
  checked_in_without_room: "rooms",
  room_double_occupancy: "rooms",
  occupied_restricted_room: "rooms",
  occupied_maintenance_unavailable: "rooms",
  occupied_maintenance_attention: "rooms",
  maintenance_request_urgent: "rooms",
  maintenance_request_open: "rooms",
  maintenance_unavailable: "rooms",
  hk_conflict: "housekeeping",
  dirty_room_without_task: "housekeeping",
  restriction_without_reason: "housekeeping",
  inconsistent_room_state: "housekeeping",
  overbooking_unapproved: "overbooking",
  overbooking_within_allowance: "overbooking",
  overbooking_next_date: "overbooking",
  overbooking_approved: "overbooking",
  waitlist_conversion_missing_reservation: "overbooking",
  waitlist_pending: "overbooking",
  channel_connection_error: "distribution",
  channel_sync_failed: "distribution",
  distribution_unavailable: "distribution",
  distribution_no_known_failures: "distribution",
  revenue_approval_pending: "revenue",
  next_date_restriction: "revenue",
  missing_nightly_snapshot: "revenue",
  revenue_unavailable: "revenue",
  service_entitlement_pending: "services",
};

/** Stored exception type to its operational category, or null for financial and board rows. */
export function operationalCategoryForException(exceptionType: string): NightAuditOperationalCategory | null {
  return NIGHT_AUDIT_OPERATIONAL_CODE_CATEGORY[exceptionType.split(":")[0] ?? ""] ?? null;
}

const ROOM_CONFLICT_CODES = new Set([
  "checked_in_without_room",
  "room_double_occupancy",
  "occupied_restricted_room",
  "occupied_maintenance_unavailable",
  "hk_conflict",
]);

const FRONT_OFFICE = "/restaurant/pms/front-office";
const HOUSEKEEPING = "/restaurant/pms/housekeeping";
const ROOM_INVENTORY = "/restaurant/pms/room-inventory";
const RATES = "/restaurant/pms/rates-revenue";
const DISTRIBUTION = "/restaurant/pms/distribution";
const SERVICES = "/restaurant/pms/guest-services";

export type NightAuditOperationalIssue = {
  id: string;
  code: string;
  module: "night_audit";
  category: NightAuditOperationalCategory;
  severity: OperationalSeverity;
  title: string;
  description: string;
  referenceType: string;
  referenceId: string;
  route: string;
  search?: Record<string, string>;
  checkedAt: string;
  ownerModule: string;
  recommendedAction: string;
  sourceStatus?: string | null;
  dueDate?: string | null;
  roomId?: string | null;
  roomNumber?: string | null;
  roomType?: string | null;
  reservationId?: string | null;
  reservationRoomId?: string | null;
  confirmationNumber?: string | null;
  guestName?: string | null;
};

/* ------------------------------------------------------------------ facts */

export type OperationalReservationFact = {
  id: string;
  confirmationNumber: string;
  status: string;
  arrivalDate: string;
  departureDate: string;
  roomId: string | null;
  roomTypeId: string | null;
  guestName: string;
  lateCheckoutGranted: boolean;
  lateCheckoutUntil: string | null;
};

export type OperationalUnitFact = {
  id: string;
  reservationId: string;
  unitSequence: number;
  roomId: string | null;
  roomTypeId: string | null;
  /** Null when the unit status column is absent. The header status applies. */
  status: string | null;
  arrivalDate: string;
  departureDate: string;
  ratePlanId: string | null;
  nightlyDates: readonly string[];
};

export type OperationalRoomFact = {
  id: string;
  roomNumber: string;
  roomTypeId: string | null;
  status: string;
  housekeepingStatus: string;
  maintenanceStatus: string | null;
  sellable: boolean | null;
  active: boolean;
  restrictionReason: string | null;
};

export type OperationalMaintenanceFact = {
  id: string;
  roomId: string;
  priority: string;
  status: string;
  category: string;
};

export type OverbookingRoomTypeFact = {
  roomTypeId: string;
  roomTypeName: string;
  physicalCapacity: number;
  demand: number;
  shortage: number;
  overbookingAllowance: number;
  configurationInvalid: boolean;
};

export type OverbookingApprovalFact = {
  id: string;
  reservationId: string;
  /** False when the approved reservation is cancelled, no-show, checked out, or gone. */
  reservationActive: boolean;
  nights: readonly { date: string; roomTypeId: string; shortageApproved: number }[];
};

export type OptionalSection<T> =
  | ({ state: "ok" } & T)
  | { state: "not_configured" }
  | { state: "unavailable"; message?: string };

export type NightAuditOperationalFacts = {
  businessDate: string;
  checkedAt: string;
  reservations: readonly OperationalReservationFact[];
  /** Null when the unit table cannot be read. Header stays then apply. */
  units: readonly OperationalUnitFact[] | null;
  rooms: readonly OperationalRoomFact[];
  roomTypeNames: Readonly<Record<string, string>>;
  openTaskRoomIds: readonly string[];
  discrepancies: readonly { id: string; roomId: string; status: string }[];
  maintenance: OptionalSection<{ requests: readonly OperationalMaintenanceFact[] }>;
  housekeepingPolicy?: HousekeepingReadinessPolicy | undefined;
  overbooking: OptionalSection<{
    nights: readonly { night: string; roomTypes: readonly OverbookingRoomTypeFact[] }[];
    approvals: readonly OverbookingApprovalFact[];
  }>;
  waitlist: OptionalSection<{
    requests: readonly {
      id: string;
      confirmationNumber: string;
      status: string;
      arrivalDate: string;
      reservationId: string | null;
      reservationExists: boolean;
    }[];
  }>;
  distribution: OptionalSection<{
    connections: readonly {
      id: string;
      environment: string;
      enabled: boolean;
      lastError: string | null;
      lastValidatedAt: string | null;
    }[];
    failedEvents: readonly {
      id: string;
      operation: string;
      direction: string;
      channel: string | null;
      message: string | null;
      createdAt: string;
    }[];
  }>;
  revenue: OptionalSection<{
    approvals: readonly {
      id: string;
      domain: string;
      summary: string;
      dateFrom: string | null;
      dateTo: string | null;
      requestedAt: string;
    }[];
    restrictions: readonly {
      id: string;
      ratePlanId: string;
      ratePlanName: string;
      date: string;
      stopSell: boolean;
      closedToArrival: boolean;
      closedToDeparture: boolean;
    }[];
  }>;
  services: OptionalSection<{
    entitlements: readonly {
      id: string;
      reservationId: string;
      reservationRoomId: string;
      serviceKind: string;
      serviceName: string;
      serviceDate: string;
      status: string;
      roomNumber: string;
    }[];
  }>;
};

/* ------------------------------------------------------------------- rows */

export type OperationalRowStatus = "blocker" | "warning" | "info" | "pass";

export type ArrivalRow = {
  id: string;
  reservationId: string;
  reservationRoomId: string | null;
  confirmationNumber: string;
  unit: string | null;
  guest: string;
  roomNumber: string | null;
  roomType: string | null;
  arrivalDate: string;
  sourceStatus: string;
  status: OperationalRowStatus;
  issue: string;
  route: string;
  search: Record<string, string>;
};

export type StayRow = {
  id: string;
  reservationId: string;
  reservationRoomId: string | null;
  confirmationNumber: string;
  unit: string | null;
  guest: string;
  roomNumber: string | null;
  roomType: string | null;
  arrivalDate: string;
  departureDate: string;
  lateCheckoutUntil: string | null;
  status: OperationalRowStatus;
  issue: string;
  route: string;
  search: Record<string, string>;
};

export type RoomStateRow = {
  id: string;
  roomNumber: string;
  roomType: string | null;
  occupied: boolean;
  occupants: number;
  operationalStatus: string;
  housekeepingStatus: string;
  maintenanceStatus: string | null;
  sellable: boolean | null;
  readiness: string;
  status: OperationalRowStatus;
  issue: string;
  route: string;
  search: Record<string, string>;
};

export type OverbookingRow = {
  id: string;
  date: string;
  roomTypeId: string;
  roomType: string;
  capacity: number;
  effectiveAllowance: number;
  committed: number;
  shortage: number;
  excess: number;
  approvedShortage: number;
  approval: "approved" | "partial" | "none";
  state: "blocked" | "attention" | "approved";
  status: OperationalRowStatus;
  route: string;
  search: Record<string, string>;
};

export type DistributionRow = {
  id: string;
  kind: "connection" | "sync";
  label: string;
  detail: string;
  occurredAt: string | null;
  status: OperationalRowStatus;
  route: string;
};

export type RevenueRow = {
  id: string;
  kind: "approval" | "restriction" | "snapshot";
  label: string;
  date: string | null;
  detail: string;
  status: OperationalRowStatus;
  route: string;
  search: Record<string, string>;
};

export type ServiceRow = {
  id: string;
  service: string;
  kind: string;
  roomNumber: string;
  serviceDate: string;
  sourceStatus: string;
  status: OperationalRowStatus;
};

export type NightAuditOperationalReconciliation = {
  status: Exclude<NightAuditOperationalStatus, "unavailable">;
  access: "detail" | "rooms" | "summary";
  businessDate: string;
  checkedAt: string;
  summary: {
    blockerCount: number;
    warningCount: number;
    infoCount: number;
    unresolvedArrivalCount: number;
    overstayCount: number;
    dueTodayCount: number;
    inHouseCount: number;
    roomConflictCount: number;
    overbookingIssueCount: number;
  };
  sections: Record<NightAuditOperationalCategory, OperationalSectionState>;
  arrivals: ArrivalRow[];
  departures: StayRow[];
  inHouse: StayRow[];
  rooms: RoomStateRow[];
  housekeeping: RoomStateRow[];
  overbooking: OverbookingRow[];
  waitlist: { state: OperationalSectionState; pendingCount: number; anomalyCount: number };
  distribution: DistributionRow[];
  revenueReadiness: RevenueRow[];
  serviceOperations: {
    rows: ServiceRow[];
    pendingCount: number;
    /** No canonical service-to-charge linkage exists, so missing charges are not inferred. */
    chargeLinkage: "not_tracked";
  };
  noShowWorkflow: "not_tracked";
  issues: NightAuditOperationalIssue[];
};

/* ---------------------------------------------------------------- helpers */

function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function rowStatus(severity: OperationalSeverity | null): OperationalRowStatus {
  if (severity === "blocking") return "blocker";
  if (severity === "warning") return "warning";
  if (severity === "info") return "info";
  return "pass";
}

const SEVERITY_RANK: Record<OperationalSeverity, number> = { blocking: 0, warning: 1, info: 2 };

function naturalCompare(left: string | null | undefined, right: string | null | undefined): number {
  return (left ?? "").localeCompare(right ?? "", undefined, { numeric: true, sensitivity: "base" });
}

/** Blockers, then warnings, then info. Earliest due first, then natural room order. */
export function sortOperationalIssues<T extends NightAuditOperationalIssue>(issues: readonly T[]): T[] {
  return [...issues].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      NIGHT_AUDIT_OPERATIONAL_CATEGORIES.indexOf(a.category) -
        NIGHT_AUDIT_OPERATIONAL_CATEGORIES.indexOf(b.category) ||
      (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") ||
      naturalCompare(a.roomNumber, b.roomNumber) ||
      a.id.localeCompare(b.id),
  );
}

function worstSeverity(issues: readonly NightAuditOperationalIssue[]): OperationalSeverity | null {
  if (issues.some((row) => row.severity === "blocking")) return "blocking";
  if (issues.some((row) => row.severity === "warning")) return "warning";
  if (issues.some((row) => row.severity === "info")) return "info";
  return null;
}

function sectionState(issues: readonly NightAuditOperationalIssue[]): OperationalSectionState {
  const worst = worstSeverity(issues);
  if (worst === "blocking") return "blocked";
  if (worst === "warning") return "warning";
  return "ok";
}

type StaySlice = {
  key: string;
  reservation: OperationalReservationFact;
  unitId: string | null;
  unitSequence: number | null;
  roomId: string | null;
  roomTypeId: string | null;
  status: string;
  arrivalDate: string;
  departureDate: string;
  ratePlanId: string | null;
  nightlyDates: readonly string[] | null;
};

function isActiveStatus(status: string): boolean {
  return status !== "cancelled" && status !== "no_show";
}

/** One slice per active unit. A booking without unit rows is one header slice. */
export function operationalStaySlices(
  reservations: readonly OperationalReservationFact[],
  units: readonly OperationalUnitFact[] | null,
): StaySlice[] {
  const byReservation = new Map<string, OperationalUnitFact[]>();
  for (const unit of units ?? []) {
    const owned = byReservation.get(unit.reservationId) ?? [];
    owned.push(unit);
    byReservation.set(unit.reservationId, owned);
  }
  const slices: StaySlice[] = [];
  for (const reservation of reservations) {
    const owned = (byReservation.get(reservation.id) ?? [])
      .slice()
      .sort((a, b) => a.unitSequence - b.unitSequence);
    if (owned.length === 0) {
      if (!isActiveStatus(reservation.status)) continue;
      slices.push({
        key: reservation.id,
        reservation,
        unitId: null,
        unitSequence: null,
        roomId: reservation.roomId,
        roomTypeId: reservation.roomTypeId,
        status: reservation.status,
        arrivalDate: reservation.arrivalDate,
        departureDate: reservation.departureDate,
        ratePlanId: null,
        nightlyDates: null,
      });
      continue;
    }
    for (const unit of owned) {
      const status = unit.status ?? reservation.status;
      if (!isActiveStatus(status)) continue;
      slices.push({
        key: unit.id,
        reservation,
        unitId: unit.id,
        unitSequence: unit.unitSequence,
        roomId: unit.roomId,
        roomTypeId: unit.roomTypeId ?? reservation.roomTypeId,
        status,
        arrivalDate: unit.arrivalDate,
        departureDate: unit.departureDate,
        ratePlanId: unit.ratePlanId,
        nightlyDates: unit.nightlyDates,
      });
    }
  }
  return slices;
}

function unitLabel(slice: StaySlice): string | null {
  return slice.unitSequence != null ? `Room ${slice.unitSequence}` : null;
}

function stayRef(slice: StaySlice): { referenceType: string; referenceId: string } {
  return slice.unitId
    ? { referenceType: "reservation_room", referenceId: slice.unitId }
    : { referenceType: "reservation", referenceId: slice.reservation.id };
}

function stayLabel(slice: StaySlice): string {
  const unit = unitLabel(slice);
  return unit ? `${slice.reservation.confirmationNumber} · ${unit}` : slice.reservation.confirmationNumber;
}

function foSearch(tab: string, businessDate: string): Record<string, string> {
  return { tab, date: businessDate };
}

/* ----------------------------------------------------------- reconciliation */

export function reconcileNightAuditOperations(
  facts: NightAuditOperationalFacts,
): NightAuditOperationalReconciliation {
  const businessDate = facts.businessDate;
  const tomorrow = nextDate(businessDate);
  const checkedAt = facts.checkedAt;
  const issues: NightAuditOperationalIssue[] = [];
  const add = (input: Omit<NightAuditOperationalIssue, "id" | "module" | "checkedAt">) => {
    const issue: NightAuditOperationalIssue = {
      ...input,
      id: `${input.code}:${input.referenceId}`,
      module: "night_audit",
      checkedAt,
    };
    issues.push(issue);
    return issue;
  };

  const roomById = new Map(facts.rooms.map((room) => [room.id, room]));
  const typeName = (id: string | null | undefined) => (id ? (facts.roomTypeNames[id] ?? null) : null);
  const slices = operationalStaySlices(facts.reservations, facts.units);
  const roomNumberOf = (roomId: string | null) => (roomId ? (roomById.get(roomId)?.roomNumber ?? null) : null);

  /* ------------------------------------------------------------- arrivals */

  const arrivals: ArrivalRow[] = [];
  for (const slice of slices) {
    if (slice.status !== "pending" && slice.status !== "confirmed") continue;
    if (slice.arrivalDate > businessDate) continue;
    const ref = stayRef(slice);
    const search = foSearch("arrivals", businessDate);
    const roomNumber = roomNumberOf(slice.roomId);
    const issue = add({
      code: "arrival_not_processed",
      category: "arrivals",
      severity: "blocking",
      title: "Unresolved arrival",
      description: `${stayLabel(slice)} was due ${slice.arrivalDate} and is still ${slice.status}. Check in, cancel, or record a no-show in Front Office.`,
      ...ref,
      route: FRONT_OFFICE,
      search,
      ownerModule: "Front Office",
      recommendedAction: "Check in, cancel, or record a no-show in Front Office.",
      sourceStatus: slice.status,
      dueDate: slice.arrivalDate,
      roomId: slice.roomId,
      roomNumber,
      roomType: typeName(slice.roomTypeId),
      reservationId: slice.reservation.id,
      reservationRoomId: slice.unitId,
      confirmationNumber: slice.reservation.confirmationNumber,
      guestName: slice.reservation.guestName,
    });
    arrivals.push({
      id: slice.key,
      reservationId: slice.reservation.id,
      reservationRoomId: slice.unitId,
      confirmationNumber: slice.reservation.confirmationNumber,
      unit: unitLabel(slice),
      guest: slice.reservation.guestName,
      roomNumber,
      roomType: typeName(slice.roomTypeId),
      arrivalDate: slice.arrivalDate,
      sourceStatus: slice.status,
      status: "blocker",
      issue: issue.title,
      route: FRONT_OFFICE,
      search,
    });
  }
  arrivals.sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate) || naturalCompare(a.roomNumber, b.roomNumber));

  /* ------------------------------------------------- departures / in-house */

  const inHouseSlices = slices.filter((slice) => slice.status === "checked_in");
  const departures: StayRow[] = [];
  const inHouse: StayRow[] = [];
  for (const slice of inHouseSlices) {
    const ref = stayRef(slice);
    const roomNumber = roomNumberOf(slice.roomId);
    const lateUntil = slice.reservation.lateCheckoutGranted ? slice.reservation.lateCheckoutUntil : null;
    let severity: OperationalSeverity | null = null;
    let issueTitle = "";
    if (slice.departureDate < businessDate) {
      severity = "blocking";
      issueTitle = "Overstay";
      add({
        code: "overstay",
        category: "departures",
        severity,
        title: issueTitle,
        description: `${stayLabel(slice)} was due to depart ${slice.departureDate} and is still checked in. Extend the stay or check the guest out.`,
        ...ref,
        route: FRONT_OFFICE,
        search: foSearch("departures", businessDate),
        ownerModule: "Front Office",
        recommendedAction: "Extend the stay or check the guest out in Front Office.",
        sourceStatus: slice.status,
        dueDate: slice.departureDate,
        roomId: slice.roomId,
        roomNumber,
        roomType: typeName(slice.roomTypeId),
        reservationId: slice.reservation.id,
        reservationRoomId: slice.unitId,
        confirmationNumber: slice.reservation.confirmationNumber,
        guestName: slice.reservation.guestName,
      });
    } else if (slice.departureDate === businessDate) {
      severity = "warning";
      issueTitle = lateUntil ? "Due out today · late checkout" : "Due out today";
      add({
        code: "departure_due_today",
        category: "departures",
        severity,
        title: issueTitle,
        description: lateUntil
          ? `${stayLabel(slice)} departs today with a late checkout until ${lateUntil}. It does not block close.`
          : `${stayLabel(slice)} departs today and is still checked in. It does not block close.`,
        ...ref,
        route: FRONT_OFFICE,
        search: foSearch("departures", businessDate),
        ownerModule: "Front Office",
        recommendedAction: "Check out or extend in Front Office when the guest leaves.",
        sourceStatus: slice.status,
        dueDate: slice.departureDate,
        roomId: slice.roomId,
        roomNumber,
        roomType: typeName(slice.roomTypeId),
        reservationId: slice.reservation.id,
        reservationRoomId: slice.unitId,
        confirmationNumber: slice.reservation.confirmationNumber,
        guestName: slice.reservation.guestName,
      });
    }
    const row: StayRow = {
      id: slice.key,
      reservationId: slice.reservation.id,
      reservationRoomId: slice.unitId,
      confirmationNumber: slice.reservation.confirmationNumber,
      unit: unitLabel(slice),
      guest: slice.reservation.guestName,
      roomNumber,
      roomType: typeName(slice.roomTypeId),
      arrivalDate: slice.arrivalDate,
      departureDate: slice.departureDate,
      lateCheckoutUntil: lateUntil,
      status: rowStatus(severity),
      issue: issueTitle,
      route: FRONT_OFFICE,
      search: foSearch(severity ? "departures" : "inhouse", businessDate),
    };
    inHouse.push(row);
    if (severity) departures.push(row);
  }
  departures.sort((a, b) => a.departureDate.localeCompare(b.departureDate) || naturalCompare(a.roomNumber, b.roomNumber));
  inHouse.sort((a, b) => naturalCompare(a.roomNumber, b.roomNumber) || a.id.localeCompare(b.id));

  /* ---------------------------------------------- room assignment / state */

  const occupantsByRoom = new Map<string, StaySlice[]>();
  for (const slice of inHouseSlices) {
    if (!slice.roomId) {
      add({
        code: "checked_in_without_room",
        category: "rooms",
        severity: "blocking",
        title: "Checked in without a room",
        description: `${stayLabel(slice)} is checked in without an assigned room.`,
        ...stayRef(slice),
        route: FRONT_OFFICE,
        search: foSearch("exceptions", businessDate),
        ownerModule: "Front Office",
        recommendedAction: "Assign or move the room unit in Front Office.",
        sourceStatus: slice.status,
        roomType: typeName(slice.roomTypeId),
        reservationId: slice.reservation.id,
        reservationRoomId: slice.unitId,
        confirmationNumber: slice.reservation.confirmationNumber,
        guestName: slice.reservation.guestName,
      });
      continue;
    }
    const list = occupantsByRoom.get(slice.roomId) ?? [];
    list.push(slice);
    occupantsByRoom.set(slice.roomId, list);
    const room = roomById.get(slice.roomId);
    if (room && (room.status === "out_of_order" || room.status === "out_of_service")) {
      add({
        code: "occupied_restricted_room",
        category: "rooms",
        severity: "blocking",
        title: "Occupied room is out of order / out of service",
        description: `${stayLabel(slice)} occupies room ${room.roomNumber}, which is ${room.status.replaceAll("_", " ")}.`,
        ...stayRef(slice),
        route: FRONT_OFFICE,
        search: foSearch("exceptions", businessDate),
        ownerModule: "Front Office / Room & Inventory",
        recommendedAction: "Move the guest, or lift the restriction in the owner module.",
        sourceStatus: room.status,
        roomId: room.id,
        roomNumber: room.roomNumber,
        roomType: typeName(room.roomTypeId),
        reservationId: slice.reservation.id,
        reservationRoomId: slice.unitId,
        confirmationNumber: slice.reservation.confirmationNumber,
        guestName: slice.reservation.guestName,
      });
    }
  }
  for (const [roomId, occupants] of occupantsByRoom) {
    if (occupants.length < 2) continue;
    const room = roomById.get(roomId);
    add({
      code: "room_double_occupancy",
      category: "rooms",
      severity: "blocking",
      title: "Double occupancy",
      description: `Room ${room?.roomNumber ?? roomId} has ${occupants.length} checked-in room units (${occupants.map(stayLabel).join(", ")}).`,
      referenceType: "room",
      referenceId: roomId,
      route: FRONT_OFFICE,
      search: foSearch("exceptions", businessDate),
      ownerModule: "Front Office",
      recommendedAction: "Move one stay or correct the room unit in Front Office.",
      sourceStatus: `${occupants.length} checked-in units`,
      roomId,
      roomNumber: room?.roomNumber ?? null,
      roomType: typeName(room?.roomTypeId),
    });
  }

  const occupiedRoomIds = new Set(occupantsByRoom.keys());

  for (const room of facts.rooms) {
    if (!occupiedRoomIds.has(room.id)) continue;
    const maintenance = room.maintenanceStatus;
    if (!maintenance || maintenance === "normal") continue;
    const unavailable = maintenance === "out_of_order" || maintenance === "out_of_service";
    if (unavailable && (room.status === "out_of_order" || room.status === "out_of_service")) continue;
    add({
      code: unavailable ? "occupied_maintenance_unavailable" : "occupied_maintenance_attention",
      category: "rooms",
      severity: unavailable ? "blocking" : "warning",
      title: unavailable ? "Occupied room is unavailable for maintenance" : "Occupied room has maintenance open",
      description: unavailable
        ? `Room ${room.roomNumber} is occupied while maintenance marks it ${maintenance.replaceAll("_", " ")}.`
        : `Room ${room.roomNumber} is occupied with maintenance status ${maintenance.replaceAll("_", " ")}. It does not block close.`,
      referenceType: "room",
      referenceId: room.id,
      route: HOUSEKEEPING,
      search: { tab: "maintenance", room: room.id },
      ownerModule: "Housekeeping / Maintenance",
      recommendedAction: unavailable
        ? "Move the guest or clear the maintenance status in the owner module."
        : "Follow up with maintenance.",
      sourceStatus: maintenance,
      roomId: room.id,
      roomNumber: room.roomNumber,
      roomType: typeName(room.roomTypeId),
    });
  }

  if (facts.maintenance.state === "unavailable") {
    add({
      code: "maintenance_unavailable",
      category: "rooms",
      severity: "warning",
      title: "Maintenance requests unavailable",
      description: "Open maintenance requests could not be read. Room maintenance status is still checked.",
      referenceType: "maintenance",
      referenceId: "maintenance",
      route: HOUSEKEEPING,
      search: { tab: "maintenance" },
      ownerModule: "Housekeeping / Maintenance",
      recommendedAction: "Recheck later or open Maintenance.",
    });
  }
  if (facts.maintenance.state === "ok") {
    for (const request of facts.maintenance.requests) {
      if (request.status !== "open" && request.status !== "in_progress") continue;
      if (!occupiedRoomIds.has(request.roomId)) continue;
      const room = roomById.get(request.roomId);
      const urgent = request.priority === "urgent";
      add({
        code: urgent ? "maintenance_request_urgent" : "maintenance_request_open",
        category: "rooms",
        severity: urgent ? "warning" : "info",
        title: urgent ? "Urgent maintenance in an occupied room" : "Maintenance request in an occupied room",
        description: `Room ${room?.roomNumber ?? request.roomId} has a ${request.priority} ${request.category} request (${request.status.replaceAll("_", " ")}).`,
        referenceType: "maintenance_request",
        referenceId: request.id,
        route: HOUSEKEEPING,
        search: { tab: "maintenance", room: request.roomId },
        ownerModule: "Housekeeping / Maintenance",
        recommendedAction: "Follow up in Maintenance.",
        sourceStatus: request.status,
        roomId: request.roomId,
        roomNumber: room?.roomNumber ?? null,
        roomType: typeName(room?.roomTypeId),
      });
    }
  }

  /* --------------------------------------------------------- housekeeping */

  const hkFindings = housekeepingNightAuditExceptions({
    rooms: facts.rooms.map((room) => ({
      id: room.id,
      roomNumber: room.roomNumber,
      status: room.status,
      housekeepingStatus: room.housekeepingStatus,
      restrictionReason: room.restrictionReason,
      active: room.active,
    })),
    occupiedRoomIds,
    openTaskRoomIds: new Set(facts.openTaskRoomIds),
    discrepancies: facts.discrepancies.map((row) => ({ roomId: row.roomId, status: row.status })),
  });
  const seenHk = new Set<string>();
  for (const finding of hkFindings) {
    const key = `${finding.exceptionType}:${finding.referenceId}`;
    if (seenHk.has(key) || !finding.referenceId) continue;
    seenHk.add(key);
    const room = roomById.get(finding.referenceId);
    const conflict = finding.exceptionType === "hk_conflict";
    add({
      code: finding.exceptionType,
      category: "housekeeping",
      severity: finding.severity,
      title:
        finding.exceptionType === "hk_conflict"
          ? "Occupied room discrepancy"
          : finding.exceptionType === "dirty_room_without_task"
            ? "Vacant dirty room without a task"
            : finding.exceptionType === "restriction_without_reason"
              ? "Restriction without a reason"
              : "Inconsistent room state",
      description: finding.message,
      referenceType: "room",
      referenceId: finding.referenceId,
      route: HOUSEKEEPING,
      search: conflict ? { tab: "exceptions", room: finding.referenceId } : { tab: "board", room: finding.referenceId },
      ownerModule: "Housekeeping",
      recommendedAction: conflict
        ? "Resolve the discrepancy in Housekeeping or move the stay in Front Office."
        : finding.exceptionType === "dirty_room_without_task"
          ? "Create or assign a cleaning task in Housekeeping."
          : "Correct the room record in the owner module.",
      sourceStatus: room ? `${room.status} · ${room.housekeepingStatus}` : null,
      roomId: finding.referenceId,
      roomNumber: room?.roomNumber ?? null,
      roomType: typeName(room?.roomTypeId),
    });
  }

  const roomIssues = new Map<string, NightAuditOperationalIssue[]>();
  for (const issue of issues) {
    if (!issue.roomId || (issue.category !== "rooms" && issue.category !== "housekeeping")) continue;
    const list = roomIssues.get(issue.roomId) ?? [];
    list.push(issue);
    roomIssues.set(issue.roomId, list);
  }
  const roomRows: RoomStateRow[] = facts.rooms
    .filter((room) => room.active || occupiedRoomIds.has(room.id))
    .map((room) => {
      const occupied = occupiedRoomIds.has(room.id);
      const found = roomIssues.get(room.id) ?? [];
      const worst = worstSeverity(found);
      const readiness = occupied
        ? "Occupied"
        : evaluateRoomReadinessWithPolicy(
            {
              status: room.status,
              housekeepingStatus: room.housekeepingStatus,
              maintenanceStatus: room.maintenanceStatus,
            },
            facts.housekeepingPolicy,
          );
      return {
        id: room.id,
        roomNumber: room.roomNumber,
        roomType: typeName(room.roomTypeId),
        occupied,
        occupants: occupantsByRoom.get(room.id)?.length ?? 0,
        operationalStatus: room.status,
        housekeepingStatus: room.housekeepingStatus,
        maintenanceStatus: room.maintenanceStatus,
        sellable: room.sellable,
        readiness:
          typeof readiness === "string" ? readiness : readiness.ready ? "Ready" : (readiness.reason ?? "Not ready"),
        status: rowStatus(worst),
        issue: found.length > 0 ? sortOperationalIssues(found)[0]!.title : "",
        route: HOUSEKEEPING,
        search: { tab: "board", room: room.id },
      };
    })
    .sort(
      (a, b) =>
        ["blocker", "warning", "info", "pass"].indexOf(a.status) -
          ["blocker", "warning", "info", "pass"].indexOf(b.status) ||
        naturalCompare(a.roomNumber, b.roomNumber),
    );
  const housekeepingRows = roomRows.filter(
    (row) => (roomIssues.get(row.id) ?? []).some((issue) => issue.category === "housekeeping") ||
      row.housekeepingStatus === "dirty" ||
      row.housekeepingStatus === "pickup",
  );

  /* ---------------------------------------------------------- overbooking */

  const overbookingRows: OverbookingRow[] = [];
  if (facts.overbooking.state === "ok") {
    const approved = new Map<string, number>();
    for (const approval of facts.overbooking.approvals) {
      if (!approval.reservationActive) continue;
      for (const night of approval.nights) {
        const key = `${night.date}:${night.roomTypeId}`;
        approved.set(key, (approved.get(key) ?? 0) + Math.max(0, night.shortageApproved));
      }
    }
    for (const night of facts.overbooking.nights) {
      if (night.night !== businessDate && night.night !== tomorrow) continue;
      const tonight = night.night === businessDate;
      for (const type of night.roomTypes) {
        if (type.shortage <= 0) continue;
        const key = `${night.night}:${type.roomTypeId}`;
        const approvedShortage = approved.get(key) ?? 0;
        const covered = approvedShortage >= type.shortage;
        const excess = Math.max(0, type.shortage - type.overbookingAllowance);
        let code: string;
        let severity: OperationalSeverity;
        let title: string;
        if (covered) {
          code = "overbooking_approved";
          severity = "info";
          title = "Approved overbooking";
        } else if (!tonight) {
          code = "overbooking_next_date";
          severity = "warning";
          title = excess > 0 ? "Tomorrow is over the overbooking limit" : "Tomorrow has unapproved overbooking";
        } else if (excess > 0) {
          code = "overbooking_unapproved";
          severity = "blocking";
          title = "Tonight is over the overbooking limit";
        } else {
          code = "overbooking_within_allowance";
          severity = "warning";
          title = "Tonight has unapproved overbooking within the allowance";
        }
        const search = { tab: "overbooking" };
        add({
          code,
          category: "overbooking",
          severity,
          title,
          description: `${type.roomTypeName} on ${night.night}: ${type.demand} committed for ${type.physicalCapacity} rooms (short ${type.shortage}), effective allowance ${type.overbookingAllowance}, approved ${approvedShortage}${type.configurationInvalid ? ", configuration invalid" : ""}.`,
          referenceType: "room_type_night",
          referenceId: key,
          route: ROOM_INVENTORY,
          search,
          ownerModule: "Room & Inventory",
          recommendedAction: covered
            ? "No action needed from Night Audit."
            : "Resolve the shortage or record an approval in Room & Inventory Overbooking.",
          sourceStatus: covered ? "approved" : approvedShortage > 0 ? "partially approved" : "no approval",
          dueDate: night.night,
          roomType: type.roomTypeName,
        });
        overbookingRows.push({
          id: key,
          date: night.night,
          roomTypeId: type.roomTypeId,
          roomType: type.roomTypeName,
          capacity: type.physicalCapacity,
          effectiveAllowance: type.overbookingAllowance,
          committed: type.demand,
          shortage: type.shortage,
          excess,
          approvedShortage,
          approval: covered ? "approved" : approvedShortage > 0 ? "partial" : "none",
          state: severity === "blocking" ? "blocked" : severity === "warning" ? "attention" : "approved",
          status: rowStatus(severity),
          route: ROOM_INVENTORY,
          search,
        });
      }
    }
    overbookingRows.sort((a, b) => a.date.localeCompare(b.date) || naturalCompare(a.roomType, b.roomType));
  }

  /* ------------------------------------------------------------- waitlist */

  let waitlistPending = 0;
  let waitlistAnomalies = 0;
  if (facts.waitlist.state === "ok") {
    for (const request of facts.waitlist.requests) {
      if (
        (request.status === "open" || request.status === "offered" || request.status === "accepted") &&
        request.arrivalDate >= businessDate &&
        request.arrivalDate <= tomorrow
      ) {
        waitlistPending += 1;
      }
      if (request.status === "converted" && (!request.reservationId || !request.reservationExists)) {
        waitlistAnomalies += 1;
        add({
          code: "waitlist_conversion_missing_reservation",
          category: "overbooking",
          severity: "warning",
          title: "Converted waitlist entry without a reservation",
          description: `Waitlist ${request.confirmationNumber} is converted but its reservation is missing. Waitlist never blocks close.`,
          referenceType: "waitlist_request",
          referenceId: request.id,
          route: "/restaurant/pms/reservations",
          ownerModule: "Reservations / Waitlist",
          recommendedAction: "Review the waitlist entry in Reservations.",
          sourceStatus: request.status,
          dueDate: request.arrivalDate,
        });
      }
    }
    if (waitlistPending > 0) {
      add({
        code: "waitlist_pending",
        category: "overbooking",
        severity: "info",
        title: "Waitlist requests for tonight or tomorrow",
        description: `${waitlistPending} waitlist request(s) arrive ${businessDate} or ${tomorrow}. Waitlist does not consume inventory and never blocks close.`,
        referenceType: "waitlist",
        referenceId: `waitlist:${businessDate}`,
        route: "/restaurant/pms/reservations",
        ownerModule: "Reservations / Waitlist",
        recommendedAction: "No action needed from Night Audit.",
      });
    }
  }

  /* --------------------------------------------------------- distribution */

  const distributionRows: DistributionRow[] = [];
  let distributionState: OperationalSectionState = "na";
  if (facts.distribution.state === "not_configured") distributionState = "not_configured";
  else if (facts.distribution.state === "unavailable") {
    distributionState = "unavailable";
    add({
      code: "distribution_unavailable",
      category: "distribution",
      severity: "warning",
      title: "Distribution status unavailable",
      description: "Channel connection or sync history could not be read. Distribution never blocks close.",
      referenceType: "distribution",
      referenceId: "distribution",
      route: DISTRIBUTION,
      ownerModule: "Distribution",
      recommendedAction: "Recheck later or open Distribution.",
    });
  } else {
    const connections = facts.distribution.connections.filter((row) => row.enabled);
    if (connections.length > 0) {
      for (const connection of connections) {
        if (connection.lastError) {
          add({
            code: "channel_connection_error",
            category: "distribution",
            severity: "warning",
            title: "Channel connection error",
            description: `Aiosell ${connection.environment} last reported: ${connection.lastError}`,
            referenceType: "integration",
            referenceId: connection.id,
            route: DISTRIBUTION,
            ownerModule: "Distribution",
            recommendedAction: "Review the connection in Distribution. Night Audit does not retry.",
            sourceStatus: "last_error",
          });
        }
        distributionRows.push({
          id: connection.id,
          kind: "connection",
          label: `Aiosell ${connection.environment}`,
          detail: connection.lastError ?? "No known failures",
          occurredAt: connection.lastValidatedAt,
          status: connection.lastError ? "warning" : "pass",
          route: DISTRIBUTION,
        });
      }
      const groups = new Map<string, (typeof facts.distribution.failedEvents)[number][]>();
      for (const event of facts.distribution.failedEvents) {
        const key = `${event.operation}:${event.channel ?? "all"}`;
        const list = groups.get(key) ?? [];
        list.push(event);
        groups.set(key, list);
      }
      for (const [key, events] of groups) {
        const latest = [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!;
        add({
          code: "channel_sync_failed",
          category: "distribution",
          severity: "warning",
          title: "Channel sync failed",
          description: `${events.length} failed ${latest.operation} sync(s)${latest.channel ? ` for ${latest.channel}` : ""} on ${businessDate}. Latest: ${latest.message ?? "no message"}`,
          referenceType: "sync_operation",
          referenceId: key,
          route: DISTRIBUTION,
          ownerModule: "Distribution",
          recommendedAction: "Review sync activity in Distribution. Night Audit does not retry.",
          sourceStatus: "failed",
        });
        distributionRows.push({
          id: key,
          kind: "sync",
          label: `${latest.operation}${latest.channel ? ` · ${latest.channel}` : ""}`,
          detail: `${events.length} failed · ${latest.message ?? "no message"}`,
          occurredAt: latest.createdAt,
          status: "warning",
          route: DISTRIBUTION,
        });
      }
      const distributionIssues = issues.filter((issue) => issue.category === "distribution");
      distributionState = sectionState(distributionIssues);
      if (distributionIssues.length === 0) {
        add({
          code: "distribution_no_known_failures",
          category: "distribution",
          severity: "info",
          title: "No known failures",
          description: `No failed channel syncs or connection errors are recorded for ${businessDate}.`,
          referenceType: "distribution",
          referenceId: `distribution:${businessDate}`,
          route: DISTRIBUTION,
          ownerModule: "Distribution",
          recommendedAction: "No action needed from Night Audit.",
        });
      }
    }
  }

  /* -------------------------------------------------------------- revenue */

  const revenueRows: RevenueRow[] = [];
  let revenueState: OperationalSectionState = "ok";
  if (facts.revenue.state === "not_configured") revenueState = "not_configured";
  else if (facts.revenue.state === "unavailable") {
    revenueState = "unavailable";
    add({
      code: "revenue_unavailable",
      category: "revenue",
      severity: "warning",
      title: "Revenue readiness unavailable",
      description: "Pending approvals or restrictions could not be read. Revenue never blocks close.",
      referenceType: "revenue",
      referenceId: "revenue",
      route: RATES,
      ownerModule: "Rate & Revenue",
      recommendedAction: "Recheck later or open Rate & Revenue.",
    });
  } else {
    for (const request of facts.revenue.approvals) {
      const from = request.dateFrom;
      const to = request.dateTo ?? request.dateFrom;
      if (!from || !to) continue;
      if (from > tomorrow || to < businessDate) continue;
      const search = { view: "approvals", approvalRequest: request.id };
      add({
        code: "revenue_approval_pending",
        category: "revenue",
        severity: "warning",
        title: "Pending revenue approval",
        description: `${request.summary} (${from}${to !== from ? ` → ${to}` : ""}) is still pending. Night Audit does not approve it.`,
        referenceType: "revenue_approval",
        referenceId: request.id,
        route: RATES,
        search,
        ownerModule: "Rate & Revenue",
        recommendedAction: "Review the request in Rate & Revenue Approvals.",
        sourceStatus: "pending",
        dueDate: from,
      });
      revenueRows.push({
        id: request.id,
        kind: "approval",
        label: request.summary,
        date: from,
        detail: `Pending ${request.domain} approval`,
        status: "warning",
        route: RATES,
        search,
      });
    }
    for (const restriction of facts.revenue.restrictions) {
      if (restriction.date !== tomorrow) continue;
      const flags = [
        restriction.stopSell ? "Stop Sell" : null,
        restriction.closedToArrival ? "CTA" : null,
        restriction.closedToDeparture ? "CTD" : null,
      ].filter(Boolean) as string[];
      if (flags.length === 0) continue;
      const search = { view: "restrictions", from: tomorrow, to: tomorrow, ratePlan: restriction.ratePlanId };
      add({
        code: "next_date_restriction",
        category: "revenue",
        severity: "info",
        title: "Restriction on the next business date",
        description: `${restriction.ratePlanName}: ${flags.join(", ")} on ${tomorrow}.`,
        referenceType: "rate_restriction",
        referenceId: restriction.id,
        route: RATES,
        search,
        ownerModule: "Rate & Revenue",
        recommendedAction: "No action needed from Night Audit.",
        dueDate: tomorrow,
      });
      revenueRows.push({
        id: restriction.id,
        kind: "restriction",
        label: restriction.ratePlanName,
        date: tomorrow,
        detail: flags.join(", "),
        status: "info",
        route: RATES,
        search,
      });
    }
  }
  if (facts.units) {
    for (const slice of slices) {
      if (!slice.unitId || !slice.ratePlanId || !slice.nightlyDates) continue;
      if (slice.status !== "confirmed" && slice.status !== "checked_in") continue;
      if (!(slice.arrivalDate <= businessDate && businessDate < slice.departureDate)) continue;
      if (slice.nightlyDates.includes(businessDate)) continue;
      const search = foSearch(slice.status === "checked_in" ? "inhouse" : "arrivals", businessDate);
      add({
        code: "missing_nightly_snapshot",
        category: "revenue",
        severity: "warning",
        title: "Missing frozen nightly rate",
        description: `${stayLabel(slice)} has no frozen nightly rate for ${businessDate}. Night Audit does not calculate a replacement.`,
        referenceType: "reservation_room",
        referenceId: slice.unitId,
        route: FRONT_OFFICE,
        search,
        ownerModule: "Reservations",
        recommendedAction: "Reprice or amend the room unit in Reservations.",
        sourceStatus: slice.status,
        dueDate: businessDate,
        roomId: slice.roomId,
        roomNumber: roomNumberOf(slice.roomId),
        roomType: typeName(slice.roomTypeId),
        reservationId: slice.reservation.id,
        reservationRoomId: slice.unitId,
        confirmationNumber: slice.reservation.confirmationNumber,
        guestName: slice.reservation.guestName,
      });
      revenueRows.push({
        id: slice.unitId,
        kind: "snapshot",
        label: stayLabel(slice),
        date: businessDate,
        detail: "No frozen nightly rate",
        status: "warning",
        route: FRONT_OFFICE,
        search,
      });
    }
  }
  if (revenueState === "ok") revenueState = sectionState(issues.filter((issue) => issue.category === "revenue"));

  /* ------------------------------------------------------------- services */

  const serviceRows: ServiceRow[] = [];
  let servicesState: OperationalSectionState = "ok";
  if (facts.services.state === "not_configured") servicesState = "not_configured";
  else if (facts.services.state === "unavailable") servicesState = "unavailable";
  else {
    for (const row of facts.services.entitlements) {
      if (row.serviceDate !== businessDate) continue;
      if (row.status !== "PENDING" && row.status !== "IN_PROGRESS") continue;
      serviceRows.push({
        id: row.id,
        service: row.serviceName,
        kind: row.serviceKind,
        roomNumber: row.roomNumber,
        serviceDate: row.serviceDate,
        sourceStatus: row.status,
        status: "info",
      });
    }
    serviceRows.sort((a, b) => naturalCompare(a.roomNumber, b.roomNumber) || a.service.localeCompare(b.service));
    if (serviceRows.length > 0) {
      add({
        code: "service_entitlement_pending",
        category: "services",
        severity: "info",
        title: "Service entitlements still pending",
        description: `${serviceRows.length} meal or service entitlement(s) for ${businessDate} are not completed. Services never block close.`,
        referenceType: "service_entitlements",
        referenceId: `services:${businessDate}`,
        route: SERVICES,
        ownerModule: "Guest Services",
        recommendedAction: "No action needed from Night Audit.",
      });
    }
  }

  /* -------------------------------------------------------------- summary */

  const sorted = sortOperationalIssues(issues);
  const count = (pred: (issue: NightAuditOperationalIssue) => boolean) => sorted.filter(pred).length;
  const blockerCount = count((issue) => issue.severity === "blocking");
  const warningCount = count((issue) => issue.severity === "warning");
  const byCategory = (category: NightAuditOperationalCategory) =>
    sorted.filter((issue) => issue.category === category);

  return {
    status: blockerCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "ready",
    access: "detail",
    businessDate,
    checkedAt,
    summary: {
      blockerCount,
      warningCount,
      infoCount: count((issue) => issue.severity === "info"),
      unresolvedArrivalCount: count((issue) => issue.code === "arrival_not_processed"),
      overstayCount: count((issue) => issue.code === "overstay"),
      dueTodayCount: count((issue) => issue.code === "departure_due_today"),
      inHouseCount: inHouseSlices.length,
      roomConflictCount: count((issue) => ROOM_CONFLICT_CODES.has(issue.code)),
      overbookingIssueCount: count(
        (issue) =>
          issue.category === "overbooking" && issue.severity !== "info" && issue.code.startsWith("overbooking_"),
      ),
    },
    sections: {
      arrivals: sectionState(byCategory("arrivals")),
      departures: sectionState(byCategory("departures")),
      rooms: sectionState(byCategory("rooms")),
      housekeeping: sectionState(byCategory("housekeeping")),
      overbooking:
        facts.overbooking.state === "ok"
          ? sectionState(byCategory("overbooking"))
          : facts.overbooking.state === "not_configured"
            ? "not_configured"
            : "unavailable",
      distribution: distributionState,
      revenue: revenueState,
      services: servicesState,
    },
    arrivals,
    departures,
    inHouse,
    rooms: roomRows,
    housekeeping: housekeepingRows,
    overbooking: overbookingRows,
    waitlist: {
      state:
        facts.waitlist.state === "ok"
          ? waitlistAnomalies > 0
            ? "warning"
            : "ok"
          : facts.waitlist.state === "not_configured"
            ? "not_configured"
            : "unavailable",
      pendingCount: waitlistPending,
      anomalyCount: waitlistAnomalies,
    },
    distribution: distributionRows,
    revenueReadiness: revenueRows,
    serviceOperations: { rows: serviceRows, pendingCount: serviceRows.length, chargeLinkage: "not_tracked" },
    noShowWorkflow: "not_tracked",
    issues: sorted,
  };
}

/* ------------------------------------------------------- gates and sync */

export function operationalAllowsClose(status: NightAuditOperationalStatus): boolean {
  return status === "ready" || status === "warning";
}

/** Blocking and warning issues as night_audit_exceptions rows. Non-UUID references move into the type. */
export function operationalIssuesToExceptions(
  issues: readonly NightAuditOperationalIssue[],
): NightAuditFinancialException[] {
  return financialIssuesToExceptions(issues);
}

/** Older reservation-level rows for findings the operational reconciler now stores per unit. */
export function withoutOperationalOwnedTypes<T extends { exceptionType: string }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => !NIGHT_AUDIT_OPERATIONAL_OWNED_TYPES.has(row.exceptionType.split(":")[0] ?? ""));
}

export type NightAuditOverallStatus = "closed" | "blocked" | "unavailable" | "warning" | "ready";

/**
 * One status for the whole date. The workspace and closeBusinessDate both use it,
 * so the screen cannot show Ready while close would refuse.
 */
export function nightAuditOverallStatus(input: {
  closed: boolean;
  boardBlockers: number;
  boardUnavailable: boolean;
  openBlockingExceptions: number;
  financial: NightAuditFinancialStatus;
  operational: NightAuditOperationalStatus;
  warnings: number;
}): NightAuditOverallStatus {
  if (input.closed) return "closed";
  if (
    input.boardBlockers > 0 ||
    input.openBlockingExceptions > 0 ||
    input.financial === "blocked" ||
    input.operational === "blocked"
  ) {
    return "blocked";
  }
  if (input.boardUnavailable || input.financial === "unavailable" || input.operational === "unavailable") {
    return "unavailable";
  }
  if (input.warnings > 0 || input.financial === "warning" || input.operational === "warning") return "warning";
  return "ready";
}

export function nightAuditAllowsClose(status: NightAuditOverallStatus): boolean {
  return status === "ready" || status === "warning";
}

/* --------------------------------------------------------- presentation */

export function operationalAccessForRole(role: string): "detail" | "rooms" | "summary" {
  if ((NIGHT_AUDIT_OPERATIONAL_DETAIL_ROLES as readonly string[]).includes(role)) return "detail";
  if ((NIGHT_AUDIT_OPERATIONAL_ROOM_ROLES as readonly string[]).includes(role)) return "rooms";
  return "summary";
}

function stripStayDetail(issue: NightAuditOperationalIssue): NightAuditOperationalIssue {
  return {
    ...issue,
    description: issue.roomNumber ? `${issue.title} · Room ${issue.roomNumber}` : issue.title,
    guestName: null,
    confirmationNumber: null,
  };
}

/**
 * Server-side role shaping. Counts never change. Cashier and accountant keep
 * readiness counts without reservation or guest detail. A housekeeping role
 * keeps room and housekeeping detail only.
 */
export function presentNightAuditOperations(
  result: NightAuditOperationalReconciliation,
  role: string,
): NightAuditOperationalReconciliation {
  const access = operationalAccessForRole(role);
  if (access === "detail") return { ...result, access };
  const roomCategories = new Set<NightAuditOperationalCategory>(["rooms", "housekeeping"]);
  return {
    ...result,
    access,
    arrivals: [],
    departures: [],
    inHouse: [],
    serviceOperations: { ...result.serviceOperations, rows: [] },
    revenueReadiness: result.revenueReadiness.filter((row) => row.kind !== "snapshot"),
    issues: result.issues.map((issue) =>
      access === "rooms" && roomCategories.has(issue.category) && !issue.reservationId
        ? issue
        : stripStayDetail(issue),
    ),
  };
}

export type NightAuditOperationalFilter = {
  severity: "all" | OperationalRowStatus;
  category: "all" | NightAuditOperationalCategory;
  search: string;
};

export function matchesOperationalFilter(
  row: { status: OperationalRowStatus; category: NightAuditOperationalCategory; text: string },
  filter: NightAuditOperationalFilter,
): boolean {
  if (filter.severity !== "all" && row.status !== filter.severity) return false;
  if (filter.category !== "all" && row.category !== filter.category) return false;
  const needle = filter.search.trim().toLowerCase();
  return !needle || row.text.toLowerCase().includes(needle);
}

export function operationalFocusFilter(
  focus: string | undefined | null,
): Partial<NightAuditOperationalFilter> & { code?: string } {
  if (focus === "blockers") return { severity: "blocker" };
  if (focus === "warnings") return { severity: "warning" };
  if (focus === "arrivals") return { category: "arrivals" };
  if (focus === "overstays") return { category: "departures", severity: "blocker" };
  if (focus === "rooms") return { category: "rooms" };
  if (focus === "overbooking") return { category: "overbooking" };
  return {};
}

export function operationalSectionLabel(state: OperationalSectionState): string {
  if (state === "not_configured") return "NOT CONFIGURED";
  if (state === "na") return "N/A";
  if (state === "unavailable") return "UNAVAILABLE";
  if (state === "blocked") return "BLOCKED";
  if (state === "warning") return "WARNING";
  return "OK";
}

export function operationalEmptyCopy(
  kind: "issues" | "loading" | "failed" | "access" | "summary" | "rooms",
): string {
  if (kind === "issues") return "No operational issues for this business date.";
  if (kind === "loading") return "Checking operational reconciliation…";
  if (kind === "access") return "You don't have access to Night Audit for this property.";
  if (kind === "summary") return "Reservation and guest detail is limited to owner, manager, and front office.";
  if (kind === "rooms") return "Reservation detail is limited to owner, manager, and front office.";
  return OPERATIONAL_UNAVAILABLE_MESSAGE;
}
