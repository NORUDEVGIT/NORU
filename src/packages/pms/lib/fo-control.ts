/**
 * FO Phase 7 — derived Exceptions control surface (pure).
 * Owner modules remain the source of truth. No persisted exception rows.
 */
import type { FoGuestServiceSignals } from "./fo-guest-services.ts";
import { foGuestServiceDerivedFlags } from "./fo-guest-services.ts";
import type { RoomOpsQueueItem } from "./front-office-room-operations.ts";

export const FO_CONTROL_CATEGORIES = ["arrival", "in_house", "departure", "room", "guest_services"] as const;
export type FoControlCategory = (typeof FO_CONTROL_CATEGORIES)[number];

export const FO_CONTROL_SEVERITIES = ["critical", "warning", "info"] as const;
export type FoControlSeverity = (typeof FO_CONTROL_SEVERITIES)[number];

export const FO_CONTROL_OWNERS = [
  "reservations",
  "room_inventory",
  "housekeeping",
  "cashiering",
  "guest_services",
  "guest_profile",
  "maintenance",
  "front_office",
] as const;
export type FoControlOwner = (typeof FO_CONTROL_OWNERS)[number];

export const FO_CONTROL_ACTIONS = [
  "assign_room",
  "open_arrival",
  "open_inhouse",
  "open_departure",
  "open_folio",
  "open_guest",
  "open_guest_services",
  "open_housekeeping",
  "open_inventory",
  "open_maintenance",
  "amend_stay",
  "set_late_checkout",
  "check_out",
  "move_room",
] as const;
export type FoControlAction = (typeof FO_CONTROL_ACTIONS)[number];

export const FO_CONTROL_ACTION_LABELS: Record<FoControlAction, string> = {
  assign_room: "Assign Room",
  open_arrival: "Open Arrival",
  open_inhouse: "Open In-House Guest",
  open_departure: "Open Departure",
  open_folio: "Open Folio",
  open_guest: "Open Guest Profile",
  open_guest_services: "Open Guest Services",
  open_housekeeping: "Open Housekeeping",
  open_inventory: "Open Room Inventory",
  open_maintenance: "Open Maintenance",
  amend_stay: "Amend Stay",
  set_late_checkout: "Set Late Checkout",
  check_out: "Check Out",
  move_room: "Move Room",
};

export const FO_CONTROL_OWNER_LABELS: Record<FoControlOwner, string> = {
  reservations: "Reservations",
  room_inventory: "Room & Inventory",
  housekeeping: "Housekeeping",
  cashiering: "Cashiering",
  guest_services: "Guest Services",
  guest_profile: "Guest Profile",
  maintenance: "Maintenance",
  front_office: "Front Office",
};

export type FrontOfficeExceptionItem = {
  id: string;
  key: string;
  category: FoControlCategory;
  severity: FoControlSeverity;
  title: string;
  description: string;
  reservationId: string | null;
  guestId: string | null;
  guestName: string;
  roomId: string | null;
  roomNumber: string | null;
  confirmationNumber: string;
  source: FoControlCategory;
  ownerModule: FoControlOwner;
  actionHint: FoControlAction;
  occurredAt: string | null;
  businessDate: string;
};

export type FoControlStayContext = {
  id: string;
  guestId: string;
  guestName: string;
  confirmationNumber: string;
  roomId: string | null;
  roomNumber: string | null;
  status: string;
};

const SEVERITY_RANK: Record<FoControlSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function item(partial: FrontOfficeExceptionItem): FrontOfficeExceptionItem {
  return partial;
}

function stayIdKey(key: string, stayId: string): string {
  return `${key}:${stayId}`;
}

export function foControlDedupKey(item: { key: string; reservationId: string | null; roomId: string | null }): string {
  if (item.reservationId) return `${item.key}:${item.reservationId}`;
  if (item.roomId) return `${item.key}:room:${item.roomId}`;
  return item.key;
}

export function mergeFrontOfficeExceptions(items: FrontOfficeExceptionItem[]): FrontOfficeExceptionItem[] {
  const byId = new Map<string, FrontOfficeExceptionItem>();
  for (const row of items) {
    const id = foControlDedupKey(row);
    const existing = byId.get(id);
    if (!existing || SEVERITY_RANK[row.severity] < SEVERITY_RANK[existing.severity]) {
      byId.set(id, { ...row, id });
    }
  }
  return [...byId.values()];
}

export function sortFrontOfficeExceptions(items: FrontOfficeExceptionItem[]): FrontOfficeExceptionItem[] {
  return [...items].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    const aTime = a.occurredAt ?? "";
    const bTime = b.occurredAt ?? "";
    if (aTime !== bTime) return aTime < bTime ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function filterFrontOfficeExceptions(
  items: FrontOfficeExceptionItem[],
  filters: {
    category?: FoControlCategory | "all";
    severity?: FoControlSeverity | "all";
    owner?: FoControlOwner | "all";
    search?: string;
  },
): FrontOfficeExceptionItem[] {
  const q = (filters.search ?? "").trim().toLowerCase();
  return items.filter((row) => {
    if (filters.category && filters.category !== "all" && row.category !== filters.category) return false;
    if (filters.severity && filters.severity !== "all" && row.severity !== filters.severity) return false;
    if (filters.owner && filters.owner !== "all" && row.ownerModule !== filters.owner) return false;
    if (!q) return true;
    return (
      row.guestName.toLowerCase().includes(q) ||
      row.confirmationNumber.toLowerCase().includes(q) ||
      (row.roomNumber ?? "").toLowerCase().includes(q)
    );
  });
}

function stayItem(
  stay: FoControlStayContext,
  businessDate: string,
  spec: {
    key: string;
    category: FoControlCategory;
    severity: FoControlSeverity;
    title: string;
    description: string;
    ownerModule: FoControlOwner;
    actionHint: FoControlAction;
  },
): FrontOfficeExceptionItem {
  return item({
    id: stayIdKey(spec.key, stay.id),
    key: spec.key,
    category: spec.category,
    severity: spec.severity,
    title: spec.title,
    description: spec.description,
    reservationId: stay.id,
    guestId: stay.guestId,
    guestName: stay.guestName,
    roomId: stay.roomId,
    roomNumber: stay.roomNumber,
    confirmationNumber: stay.confirmationNumber,
    source: spec.category,
    ownerModule: spec.ownerModule,
    actionHint: spec.actionHint,
    occurredAt: null,
    businessDate,
  });
}

const ARRIVAL_META: Record<
  string,
  { title: string; description: string; severity: FoControlSeverity; owner: FoControlOwner; action: FoControlAction }
> = {
  unassigned: {
    title: "Unassigned arrival",
    description: "Arrival has no room assigned.",
    severity: "critical",
    owner: "reservations",
    action: "assign_room",
  },
  room_not_ready: {
    title: "Room not ready",
    description: "Assigned room is not ready for check-in.",
    severity: "critical",
    owner: "housekeeping",
    action: "open_housekeeping",
  },
  room_unavailable: {
    title: "Room unavailable",
    description: "Assigned room is out of order or out of service.",
    severity: "critical",
    owner: "room_inventory",
    action: "open_inventory",
  },
  payment_issue: {
    title: "Deposit outstanding",
    description: "Arrival deposit is unpaid.",
    severity: "critical",
    owner: "cashiering",
    action: "open_folio",
  },
  missing_guest_data: {
    title: "Missing guest fields",
    description: "Required guest fields are incomplete.",
    severity: "critical",
    owner: "guest_profile",
    action: "open_guest",
  },
  early_arrival: {
    title: "Early arrival",
    description: "Expected arrival is before property check-in time.",
    severity: "info",
    owner: "front_office",
    action: "open_arrival",
  },
};

const INHOUSE_META: Record<
  string,
  { title: string; description: string; severity: FoControlSeverity; owner: FoControlOwner; action: FoControlAction }
> = {
  unassigned: {
    title: "In-house unassigned",
    description: "Checked-in stay has no room.",
    severity: "critical",
    owner: "reservations",
    action: "assign_room",
  },
  room_unavailable: {
    title: "Room unavailable",
    description: "In-house room is out of order or out of service.",
    severity: "critical",
    owner: "room_inventory",
    action: "open_inventory",
  },
  maintenance: {
    title: "Maintenance issue",
    description: "Assigned room has an open maintenance status.",
    severity: "warning",
    owner: "maintenance",
    action: "open_maintenance",
  },
  overstay: {
    title: "Overstay",
    description: "Guest is still in-house after the departure date.",
    severity: "critical",
    owner: "front_office",
    action: "check_out",
  },
  folio_warning: {
    title: "Folio warning",
    description: "Folio balance is outstanding.",
    severity: "warning",
    owner: "cashiering",
    action: "open_folio",
  },
  late_checkout_conflict: {
    title: "Late checkout conflict",
    description: "Late checkout is granted but policy or until-time is incomplete.",
    severity: "warning",
    owner: "front_office",
    action: "set_late_checkout",
  },
  missing_stay_data: {
    title: "Stay inconsistency",
    description: "Arrival or departure dates are missing or invalid.",
    severity: "critical",
    owner: "reservations",
    action: "amend_stay",
  },
};

const DEPARTURE_META: Record<
  string,
  { title: string; description: string; severity: FoControlSeverity; owner: FoControlOwner; action: FoControlAction; key?: string }
> = {
  unsettled_folio: {
    title: "Unsettled folio",
    description: "Checkout is blocked until the folio is settled.",
    severity: "critical",
    owner: "cashiering",
    action: "open_folio",
  },
  missing_folio: {
    title: "Missing folio",
    description: "No folio exists for this departure.",
    severity: "critical",
    owner: "cashiering",
    action: "open_folio",
  },
  unassigned: {
    title: "Invalid room assignment",
    description: "Departure stay has no room assignment.",
    severity: "critical",
    owner: "reservations",
    action: "assign_room",
  },
  room_unavailable: {
    title: "Room unavailable",
    description: "Departure room is out of order or out of service.",
    severity: "critical",
    owner: "room_inventory",
    action: "open_inventory",
  },
  maintenance: {
    title: "Maintenance issue",
    description: "Departure room has an open maintenance status.",
    severity: "warning",
    owner: "maintenance",
    action: "open_maintenance",
  },
  overdue_departure: {
    title: "Overdue departure",
    description: "Guest is still in-house after the departure date.",
    severity: "critical",
    owner: "front_office",
    action: "check_out",
    key: "overstay",
  },
  late_checkout_conflict: {
    title: "Late checkout conflict",
    description: "Late checkout is granted but policy or until-time is incomplete.",
    severity: "warning",
    owner: "front_office",
    action: "set_late_checkout",
  },
  missing_stay_data: {
    title: "Stay inconsistency",
    description: "Arrival or departure dates are missing or invalid.",
    severity: "critical",
    owner: "reservations",
    action: "amend_stay",
  },
};

export function exceptionsFromArrivalKeys(
  stay: FoControlStayContext,
  keys: string[],
  businessDate: string,
): FrontOfficeExceptionItem[] {
  const skip = new Set(["special_request"]);
  return keys
    .filter((key) => !skip.has(key) && ARRIVAL_META[key])
    .map((key) => {
      const meta = ARRIVAL_META[key];
      return stayItem(stay, businessDate, {
        key,
        category: "arrival",
        severity: meta.severity,
        title: meta.title,
        description: meta.description,
        ownerModule: meta.owner,
        actionHint: meta.action,
      });
    });
}

export function exceptionsFromInHouseKeys(
  stay: FoControlStayContext,
  keys: string[],
  businessDate: string,
): FrontOfficeExceptionItem[] {
  const skip = new Set(["special_request"]);
  return keys
    .filter((key) => !skip.has(key) && INHOUSE_META[key])
    .map((key) => {
      const meta = INHOUSE_META[key];
      return stayItem(stay, businessDate, {
        key: key === "overstay" ? "overstay" : key,
        category: "in_house",
        severity: meta.severity,
        title: meta.title,
        description: meta.description,
        ownerModule: meta.owner,
        actionHint: meta.action,
      });
    });
}

export function exceptionsFromDepartureKeys(
  stay: FoControlStayContext,
  keys: string[],
  businessDate: string,
): FrontOfficeExceptionItem[] {
  const skip = new Set(["guest_request"]);
  return keys
    .filter((key) => !skip.has(key) && DEPARTURE_META[key])
    .map((key) => {
      const meta = DEPARTURE_META[key];
      return stayItem(stay, businessDate, {
        key: meta.key ?? key,
        category: "departure",
        severity: meta.severity,
        title: meta.title,
        description: meta.description,
        ownerModule: meta.owner,
        actionHint: meta.action,
      });
    });
}

export function exceptionsFromGuestServiceSignals(
  stay: FoControlStayContext,
  signals: FoGuestServiceSignals,
  businessDate: string,
): FrontOfficeExceptionItem[] {
  const flags = foGuestServiceDerivedFlags(signals);
  if (flags.overdue_guest_request) {
    return [
      stayItem(stay, businessDate, {
        key: "overdue_guest_request",
        category: "guest_services",
        severity: "critical",
        title: "Overdue guest request",
        description: "An active Guest Services request has a preferred time that has passed.",
        ownerModule: "guest_services",
        actionHint: "open_guest_services",
      }),
    ];
  }
  if (flags.urgent_guest_request) {
    return [
      stayItem(stay, businessDate, {
        key: "urgent_guest_request",
        category: "guest_services",
        severity: "critical",
        title: "Urgent guest request",
        description: "An active Guest Services request is marked urgent.",
        ownerModule: "guest_services",
        actionHint: "open_guest_services",
      }),
    ];
  }
  if (flags.unresolved_service_request && stay.status === "checked_in") {
    return [
      stayItem(stay, businessDate, {
        key: "unresolved_service_request",
        category: "guest_services",
        severity: "warning",
        title: "Unresolved guest request",
        description: "This stay has an active Guest Services request.",
        ownerModule: "guest_services",
        actionHint: "open_guest_services",
      }),
    ];
  }
  return [];
}

export function exceptionsFromRoomOpsQueue(
  queue: RoomOpsQueueItem[],
  businessDate: string,
): FrontOfficeExceptionItem[] {
  const rows: FrontOfficeExceptionItem[] = [];
  for (const row of queue) {
    if (row.kind === "unassigned" || row.kind === "room_unavailable") continue;
    if (row.kind === "assigned_not_ready" && row.stayId) {
      rows.push(
        item({
          id: stayIdKey("room_not_ready", row.stayId),
          key: "room_not_ready",
          category: "arrival",
          severity: "critical",
          title: "Room not ready",
          description: row.reason,
          reservationId: row.stayId,
          guestId: null,
          guestName: row.guestName ?? "",
          roomId: row.roomId,
          roomNumber: row.roomNumber,
          confirmationNumber: row.confirmationNumber ?? "",
          source: "arrival",
          ownerModule: "housekeeping",
          actionHint: "open_housekeeping",
          occurredAt: null,
          businessDate,
        }),
      );
      continue;
    }
    if (row.kind === "room_discrepancy") {
      rows.push(
        item({
          id: `room_discrepancy:room:${row.roomId ?? row.id}`,
          key: "room_discrepancy",
          category: "room",
          severity: "warning",
          title: "Housekeeping discrepancy",
          description: row.reason,
          reservationId: row.stayId,
          guestId: null,
          guestName: row.guestName ?? "",
          roomId: row.roomId,
          roomNumber: row.roomNumber,
          confirmationNumber: row.confirmationNumber ?? "",
          source: "room",
          ownerModule: "housekeeping",
          actionHint: "open_housekeeping",
          occurredAt: null,
          businessDate,
        }),
      );
      continue;
    }
    if (row.kind === "overbooking") {
      rows.push(
        item({
          id: row.id,
          key: "overbooking",
          category: "room",
          severity: "warning",
          title: "Overbooking",
          description: row.reason,
          reservationId: row.stayId,
          guestId: null,
          guestName: row.guestName ?? "",
          roomId: row.roomId,
          roomNumber: row.roomNumber,
          confirmationNumber: row.confirmationNumber ?? "",
          source: "room",
          ownerModule: "room_inventory",
          actionHint: "open_inventory",
          occurredAt: null,
          businessDate,
        }),
      );
      continue;
    }
    if (row.kind === "active_block") {
      rows.push(
        item({
          id: `active_block:room:${row.roomId ?? row.id}`,
          key: "active_block",
          category: "room",
          severity: "warning",
          title: "Active room block",
          description: row.reason,
          reservationId: null,
          guestId: null,
          guestName: "",
          roomId: row.roomId,
          roomNumber: row.roomNumber,
          confirmationNumber: "",
          source: "room",
          ownerModule: "room_inventory",
          actionHint: "open_inventory",
          occurredAt: null,
          businessDate,
        }),
      );
    }
  }
  return rows;
}

export function buildFrontOfficeExceptionList(input: {
  businessDate: string;
  arrivals: Array<{ stay: FoControlStayContext; keys: string[] }>;
  inHouse: Array<{ stay: FoControlStayContext; keys: string[] }>;
  departures: Array<{ stay: FoControlStayContext; keys: string[] }>;
  guestServices: Array<{ stay: FoControlStayContext; signals: FoGuestServiceSignals }>;
  roomOps: RoomOpsQueueItem[];
}): FrontOfficeExceptionItem[] {
  const rows: FrontOfficeExceptionItem[] = [];
  for (const row of input.arrivals) rows.push(...exceptionsFromArrivalKeys(row.stay, row.keys, input.businessDate));
  for (const row of input.inHouse) rows.push(...exceptionsFromInHouseKeys(row.stay, row.keys, input.businessDate));
  for (const row of input.departures) rows.push(...exceptionsFromDepartureKeys(row.stay, row.keys, input.businessDate));
  for (const row of input.guestServices) {
    rows.push(...exceptionsFromGuestServiceSignals(row.stay, row.signals, input.businessDate));
  }
  rows.push(...exceptionsFromRoomOpsQueue(input.roomOps, input.businessDate));
  return sortFrontOfficeExceptions(mergeFrontOfficeExceptions(rows));
}
