/**
 * Housekeeping Phase 2 — demand overlay + Card 2 priority application.
 * Demand is a read of FO/reservation stays. Priority uses existing Card 2 rules
 * (TS equivalent of pms_housekeeping_event_priority). No new engine, no new table.
 */
import type { HousekeepingScope } from "@/core/lib/module-access";
import { DEFAULT_SERVICE_TYPES } from "./service-types-card4.server";
import { etaTiming } from "./fo-arrival";
import type {
  HousekeepingCard2Priority,
  HousekeepingPriorityCode,
  HousekeepingPriorityEvent,
} from "./housekeeping-card2.server";

export type HkDemandFlags = {
  arrival: boolean;
  departure: boolean;
  stayover: boolean;
  vip: boolean;
  earlyArrival: boolean;
  roomChange: boolean;
};

export const EMPTY_HK_DEMAND: HkDemandFlags = {
  arrival: false,
  departure: false,
  stayover: false,
  vip: false,
  earlyArrival: false,
  roomChange: false,
};

export type HkStayDemandInput = {
  roomId: string | null;
  status: string;
  arrivalDate: string;
  departureDate: string;
  expectedArrivalAt?: string | null;
  guestVip?: boolean;
  roomChangedToday?: boolean;
};

const PRIORITY_RANK: Record<HousekeepingPriorityCode, number> = {
  normal: 1,
  high: 2,
  urgent: 3,
};

export function mergeHkDemand(a: HkDemandFlags, b: HkDemandFlags): HkDemandFlags {
  return {
    arrival: a.arrival || b.arrival,
    departure: a.departure || b.departure,
    stayover: a.stayover || b.stayover,
    vip: a.vip || b.vip,
    earlyArrival: a.earlyArrival || b.earlyArrival,
    roomChange: a.roomChange || b.roomChange,
  };
}

export function hkDemandFromStay(
  stay: HkStayDemandInput,
  today: string,
  opts?: { checkInTime?: string | null; timezone?: string },
): HkDemandFlags {
  if (!stay.roomId) return { ...EMPTY_HK_DEMAND };
  const live =
    stay.status === "pending" || stay.status === "confirmed" || stay.status === "checked_in";
  if (!live) return { ...EMPTY_HK_DEMAND };

  const arrival = stay.arrivalDate === today;
  const departure = stay.departureDate === today;
  const stayover = stay.status === "checked_in" && stay.arrivalDate < today && stay.departureDate > today;
  const earlyArrival =
    arrival &&
    etaTiming({
      expectedArrivalAt: stay.expectedArrivalAt,
      checkInTime: opts?.checkInTime,
      timezone: opts?.timezone ?? "UTC",
    }) === "early";
  const vip = Boolean(stay.guestVip) && (arrival || departure || stayover);

  return {
    arrival,
    departure,
    stayover,
    vip,
    earlyArrival: Boolean(earlyArrival),
    roomChange: Boolean(stay.roomChangedToday),
  };
}

export function hkDemandWeight(demand: HkDemandFlags): number {
  return (
    (demand.vip ? 32 : 0) +
    (demand.earlyArrival ? 16 : 0) +
    (demand.arrival ? 8 : 0) +
    (demand.roomChange ? 4 : 0) +
    (demand.departure ? 2 : 0) +
    (demand.stayover ? 1 : 0)
  );
}

export function hkDemandLabels(demand: HkDemandFlags): string[] {
  const labels: string[] = [];
  if (demand.vip) labels.push("VIP");
  if (demand.earlyArrival) labels.push("Early");
  if (demand.arrival) labels.push("Arr");
  if (demand.departure) labels.push("Dep");
  if (demand.stayover) labels.push("Stay");
  if (demand.roomChange) labels.push("Move");
  return labels;
}

export function suggestedCleaningType(demand: HkDemandFlags): "stayover_cleaning" | "departure_cleaning" {
  if (demand.stayover && !demand.departure) return "stayover_cleaning";
  return "departure_cleaning";
}

/** Card 2 event codes that should influence this create (task type + live demand). */
export function priorityEventsForHousekeepingTask(
  taskType: string,
  demand: HkDemandFlags,
): HousekeepingPriorityEvent[] {
  const events: HousekeepingPriorityEvent[] = [];
  if (demand.vip) events.push("vip");
  if (demand.earlyArrival) events.push("early_arrival");
  if (demand.arrival) events.push("arrival");
  if (demand.departure || taskType === "departure_cleaning") events.push("departure");
  if (demand.stayover || taskType === "stayover_cleaning") events.push("stayover");
  if (demand.roomChange) events.push("room_move");
  if (taskType === "re_clean") events.push("special_request");
  return events;
}

/** TS equivalent of SQL `pms_housekeeping_event_priority`. */
export function housekeepingEventPriority(
  rules: ReadonlyArray<Pick<HousekeepingCard2Priority, "event" | "priority" | "enabled">>,
  event: HousekeepingPriorityEvent,
  fallback: HousekeepingPriorityCode,
): HousekeepingPriorityCode {
  const rule = rules.find((row) => row.event === event);
  if (!rule || !rule.enabled) return fallback;
  return rule.priority;
}

export function applyHousekeepingEventPriority(
  rules: ReadonlyArray<Pick<HousekeepingCard2Priority, "event" | "priority" | "enabled">>,
  events: HousekeepingPriorityEvent[],
  requested: HousekeepingPriorityCode,
): HousekeepingPriorityCode {
  let best = requested;
  for (const event of events) {
    const next = housekeepingEventPriority(rules, event, requested);
    if (PRIORITY_RANK[next] > PRIORITY_RANK[best]) best = next;
  }
  return best;
}

export type HousekeepingTaskMutation = "assign" | "start" | "cancel" | "complete";

export function housekeeperMayMutateTask(params: {
  scope: HousekeepingScope;
  action: HousekeepingTaskMutation;
  assignedMembershipId: string | null;
  actorMembershipId: string;
}): boolean {
  if (params.scope === "supervisor") return true;
  if (params.scope !== "housekeeper") return false;
  if (params.action !== "start" && params.action !== "complete") return false;
  return params.assignedMembershipId === params.actorMembershipId;
}

export function sortRoomsByHkDemand<T extends { roomNumber: string; demand?: HkDemandFlags }>(
  rooms: T[],
): T[] {
  return [...rooms].sort((a, b) => {
    const dw = hkDemandWeight(b.demand ?? EMPTY_HK_DEMAND) - hkDemandWeight(a.demand ?? EMPTY_HK_DEMAND);
    if (dw !== 0) return dw;
    return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
  });
}

/**
 * Inspection queue is derived from rooms with HK status `clean` when Card 2
 * requires inspection. No inspection-queue table. OOO/OOS stay off the queue.
 */
export function roomAwaitsInspection(params: {
  housekeepingStatus: string;
  restriction: string;
  inspectionRequired: boolean;
}): boolean {
  if (!params.inspectionRequired) return false;
  if (params.restriction === "out_of_order" || params.restriction === "out_of_service") return false;
  return params.housekeepingStatus === "clean";
}

export type TicketMaintenanceStatus = "normal" | "maintenance_required" | "in_progress";

/**
 * Ticket open/start/resolve → room maintenance_status.
 * Does not map to hotel_rooms.status (Inventory owns OOO/OOS).
 */
export function nextMaintenanceStatusFromOpenTickets(
  tickets: Array<{ status: string }>,
): TicketMaintenanceStatus {
  const live = tickets.filter((row) => row.status === "open" || row.status === "in_progress");
  if (live.some((row) => row.status === "in_progress")) return "in_progress";
  if (live.some((row) => row.status === "open")) return "maintenance_required";
  return "normal";
}

export function maintenanceTicketStateConsistent(params: {
  liveTickets: Array<{ status: string }>;
  roomMaintenanceStatus: string;
}): boolean {
  return nextMaintenanceStatusFromOpenTickets(params.liveTickets) === params.roomMaintenanceStatus;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseHistoryBag(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") return {};
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function looksLikeRawPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (UUID_RE.test(trimmed)) return true;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  return false;
}

function titlePhrase(value: string): string {
  const words = value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  if (words.length === 0) return "";
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(" ");
}

function stringField(bag: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = bag[key];
    if (typeof value === "string" && value.trim() && !looksLikeRawPayload(value)) {
      return value.trim();
    }
  }
  return null;
}

function humanNotes(notes: string | null | undefined): string | null {
  if (!notes || looksLikeRawPayload(notes)) return null;
  return notes.trim();
}

/** Card 4 default Housekeeping guest-service type codes (`HK_CLEAN`, `HK_TOWELS`, …). */
export const HK_CARD4_SERVICE_TYPE_CODES = DEFAULT_SERVICE_TYPES.filter(
  (row) => row.categoryCode === "HK",
).map((row) => row.code);

export function isHousekeepingDepartment(params: { code: string; name?: string | null }): boolean {
  const code = params.code.trim().toUpperCase();
  if (code === "HK" || code === "HOUSEKEEPING" || code.startsWith("HK_")) return true;
  const name = (params.name ?? "").toUpperCase();
  return name.includes("HOUSEKEEP");
}

export function isHousekeepingRoutedGuestService(params: {
  typeCode: string;
  categoryCode: string | null;
  assignedDepartmentCodes: string[];
  assignedDepartmentNames?: string[];
}): boolean {
  const assignedHk = params.assignedDepartmentCodes.filter((code, index) =>
    isHousekeepingDepartment({
      code,
      name: params.assignedDepartmentNames?.[index] ?? null,
    }),
  );
  if (assignedHk.length > 0) return true;
  if (params.assignedDepartmentCodes.length > 0) return false;
  const typeCode = params.typeCode.trim().toUpperCase();
  if ((HK_CARD4_SERVICE_TYPE_CODES as readonly string[]).includes(typeCode) || typeCode.startsWith("HK_")) {
    return true;
  }
  return (params.categoryCode ?? "").trim().toUpperCase() === "HK";
}

/** Completing an on-demand room clean may open a housekeeping_tasks row. Towels/laundry/turndown stay GS-only. */
export function guestServiceSpawnsCleaningTask(typeCode: string): boolean {
  return typeCode.trim().toUpperCase() === "HK_CLEAN";
}

/**
 * Hotel-facing History detail. Does not change stored housekeeping_history rows.
 */
export function formatHousekeepingHistoryDetail(params: {
  eventType: string;
  notes?: string | null;
  newValues?: unknown;
  previousValues?: unknown;
}): string {
  const eventType = params.eventType.trim();
  const notes = humanNotes(params.notes);
  const next = parseHistoryBag(params.newValues);
  const taskType = stringField(next, "task_type", "taskType");
  const priority = stringField(next, "priority");
  const category = stringField(next, "category");
  const hkStatus = stringField(next, "housekeeping_status", "housekeepingStatus");
  const ticketStatus = stringField(next, "status");
  const eventCode = stringField(next, "event_code", "eventCode");
  const afterCheckout =
    eventCode === "guest_check_out" ||
    (typeof next.reservation_id === "string" && eventCode !== "guest_check_in");

  if (eventType === "cleaning_task_created") {
    const typeLabel = taskType ? titlePhrase(taskType) : "Cleaning task";
    if (priority && priority !== "normal") return `${typeLabel} · ${titlePhrase(priority)} priority`;
    return typeLabel;
  }
  if (eventType === "cleaning_started") return "Cleaning started";
  if (eventType === "cleaning_completed") {
    const changed = hkStatus ? `Room changed to ${titlePhrase(hkStatus)}` : "Cleaning completed";
    if (taskType) return `${titlePhrase(taskType)} completed · ${changed}`;
    return changed;
  }
  if (eventType === "room_dirty") {
    if (afterCheckout) return "Room changed to Dirty after checkout";
    return "Room changed to Dirty";
  }
  if (eventType === "maintenance_created") {
    return notes ?? (category ? titlePhrase(category) : "Maintenance request logged");
  }
  if (eventType === "maintenance_started" || (eventType === "maintenance_updated" && ticketStatus === "in_progress")) {
    return "Maintenance work started";
  }
  if (eventType === "maintenance_resolved") return "Maintenance issue resolved";
  if (eventType === "inspection_passed") return notes ? `Inspection passed · ${notes}` : "Inspection passed";
  if (eventType === "inspection_failed") return notes ? `Inspection failed · ${notes}` : "Inspection failed";
  if (eventType === "room_ooo") return notes ? `Out of order · ${notes}` : "Out of order";
  if (eventType === "room_oos") return notes ? `Out of service · ${notes}` : "Out of service";
  if (eventType === "room_released") return notes ? `Restriction released · ${notes}` : "Restriction released";
  if (eventType === "guest_request_updated") {
    if (ticketStatus === "in_progress") return notes ? `Guest request started · ${notes}` : "Guest request started";
    if (ticketStatus === "completed") return notes ? `Guest request completed · ${notes}` : "Guest request completed";
    if (ticketStatus === "cancelled") return notes ? `Guest request cancelled · ${notes}` : "Guest request cancelled";
    return notes ?? "Guest request updated";
  }

  if (notes) return notes;
  return titlePhrase(eventType) || "—";
}

export const HK_HISTORY_FILTER_GROUPS = [
  "cleaning",
  "inspection",
  "discrepancy",
  "maintenance",
  "restriction",
  "guest_request",
] as const;
export type HkHistoryFilterGroup = (typeof HK_HISTORY_FILTER_GROUPS)[number];

export const HK_HISTORY_EVENTS_BY_GROUP: Record<HkHistoryFilterGroup, readonly string[]> = {
  cleaning: [
    "room_dirty",
    "cleaning_task_created",
    "task_assigned",
    "cleaning_started",
    "cleaning_completed",
    "task_cancelled",
    "room_reclean_required",
  ],
  inspection: ["inspection_passed", "inspection_failed"],
  discrepancy: ["discrepancy_created", "discrepancy_resolved"],
  maintenance: ["maintenance_created", "maintenance_updated", "maintenance_resolved"],
  restriction: ["room_ooo", "room_oos", "room_released"],
  guest_request: ["guest_request_updated"],
};

export const HK_HISTORY_FILTER_GROUP_LABELS: Record<HkHistoryFilterGroup, string> = {
  cleaning: "Cleaning",
  inspection: "Inspection",
  discrepancy: "Discrepancy",
  maintenance: "Maintenance",
  restriction: "Restriction",
  guest_request: "Guest request",
};

export function hkHistoryEventTypesForGroup(group: string): string[] | null {
  if (!(HK_HISTORY_FILTER_GROUPS as readonly string[]).includes(group)) return null;
  return [...HK_HISTORY_EVENTS_BY_GROUP[group as HkHistoryFilterGroup]];
}

export const HK_EXCEPTION_KINDS = [
  "dirty_arrival",
  "inspect_failed",
  "maintenance_blocker",
  "ooo_assigned",
  "stale_task",
  "dirty_vacant_no_task",
  "discrepancy",
] as const;
export type HkExceptionKind = (typeof HK_EXCEPTION_KINDS)[number];

export const HK_STALE_TASK_MS = 8 * 60 * 60 * 1000;

export type HkExceptionAction =
  | "board"
  | "cleaning"
  | "inspections"
  | "maintenance"
  | "restrictions"
  | "resolve_discrepancy";

export type HkExceptionRoomInput = {
  id: string;
  roomNumber: string;
  occupancy: "vacant" | "occupied";
  housekeepingStatus: string;
  maintenanceStatus: string | null;
  restriction: string;
  checkInReady: boolean;
  readyReason: string | null;
  demand: HkDemandFlags;
  openTaskId: string | null;
  openTaskStatus: string | null;
  openTaskCreatedAt?: string | null;
  openTaskStartedAt?: string | null;
  stayId: string | null;
};

export type HousekeepingExceptionItem = {
  key: string;
  kind: HkExceptionKind;
  source: "derived" | "persisted";
  roomId: string;
  roomNumber: string;
  title: string;
  detail: string;
  action: HkExceptionAction;
  discrepancyId: string | null;
  severity: "high" | "standard";
};

export function hkExceptionKey(kind: HkExceptionKind, id: string): string {
  return `${kind}:${id}`;
}

function isOoo(restriction: string): boolean {
  return restriction === "out_of_order" || restriction === "out_of_service";
}

function maintenanceBlocking(status: string | null): boolean {
  return status === "maintenance_required" || status === "in_progress";
}

function latestFailedByRoom(
  inspections: Array<{ id: string; roomId: string; status: string; completedAt: string | null; notes: string | null }>,
): Map<string, { notes: string | null }> {
  const latest = new Map<string, { at: string; notes: string | null; status: string }>();
  for (const row of inspections) {
    const at = row.completedAt ?? "";
    const prev = latest.get(row.roomId);
    if (!prev || at > prev.at) latest.set(row.roomId, { at, notes: row.notes, status: row.status });
  }
  const failed = new Map<string, { notes: string | null }>();
  for (const [roomId, row] of latest) {
    if (row.status === "failed") failed.set(roomId, { notes: row.notes });
  }
  return failed;
}

function taskAgeMs(room: HkExceptionRoomInput, nowMs: number): number | null {
  const stamp = room.openTaskStartedAt ?? room.openTaskCreatedAt ?? null;
  if (!stamp) return null;
  const at = Date.parse(stamp);
  if (!Number.isFinite(at)) return null;
  return nowMs - at;
}

export function deriveHousekeepingExceptions(params: {
  rooms: HkExceptionRoomInput[];
  inspections: Array<{ id: string; roomId: string; status: string; completedAt: string | null; notes: string | null }>;
  discrepancies: Array<{
    id: string;
    roomId: string;
    roomNumber: string;
    status: string;
    reason: string | null;
  }>;
  nowMs: number;
  staleAfterMs?: number;
}): HousekeepingExceptionItem[] {
  const staleAfter = params.staleAfterMs ?? HK_STALE_TASK_MS;
  const failed = latestFailedByRoom(params.inspections);
  const items: HousekeepingExceptionItem[] = [];

  for (const room of params.rooms) {
    if (isOoo(room.restriction) && (room.occupancy === "occupied" || room.stayId)) {
      items.push({
        key: hkExceptionKey("ooo_assigned", room.id),
        kind: "ooo_assigned",
        source: "derived",
        roomId: room.id,
        roomNumber: room.roomNumber,
        title: "Occupied room is out of order",
        detail: room.restriction === "out_of_service" ? "Stay is assigned to an out-of-service room." : "Stay is assigned to an out-of-order room.",
        action: "restrictions",
        discrepancyId: null,
        severity: "high",
      });
    }

    if (maintenanceBlocking(room.maintenanceStatus) && !isOoo(room.restriction)) {
      items.push({
        key: hkExceptionKey("maintenance_blocker", room.id),
        kind: "maintenance_blocker",
        source: "derived",
        roomId: room.id,
        roomNumber: room.roomNumber,
        title: "Maintenance is blocking readiness",
        detail: room.readyReason ?? "Maintenance status is not clear.",
        action: "maintenance",
        discrepancyId: null,
        severity: "high",
      });
    }

    if (room.demand.arrival && !room.checkInReady && !isOoo(room.restriction)) {
      items.push({
        key: hkExceptionKey("dirty_arrival", room.id),
        kind: "dirty_arrival",
        source: "derived",
        roomId: room.id,
        roomNumber: room.roomNumber,
        title: "Arrival room is not ready",
        detail: room.readyReason ?? "Today's arrival is assigned to a room that is not check-in ready.",
        action: "board",
        discrepancyId: null,
        severity: "high",
      });
    }

    if (failed.has(room.id) && room.housekeepingStatus === "dirty") {
      const note = failed.get(room.id)?.notes;
      items.push({
        key: hkExceptionKey("inspect_failed", room.id),
        kind: "inspect_failed",
        source: "derived",
        roomId: room.id,
        roomNumber: room.roomNumber,
        title: "Inspection failed",
        detail: note?.trim() || "Latest inspection failed. Room is dirty.",
        action: "inspections",
        discrepancyId: null,
        severity: "high",
      });
    }

    if (
      room.occupancy === "vacant" &&
      !isOoo(room.restriction) &&
      (room.housekeepingStatus === "dirty" || room.housekeepingStatus === "pickup") &&
      !room.openTaskId
    ) {
      items.push({
        key: hkExceptionKey("dirty_vacant_no_task", room.id),
        kind: "dirty_vacant_no_task",
        source: "derived",
        roomId: room.id,
        roomNumber: room.roomNumber,
        title: "Dirty vacant room has no cleaning task",
        detail: "Same live signal Night Audit reads. Open a cleaning task from the Board.",
        action: "board",
        discrepancyId: null,
        severity: "standard",
      });
    }

    if (room.openTaskId && (room.openTaskStatus === "pending" || room.openTaskStatus === "assigned" || room.openTaskStatus === "in_progress")) {
      const age = taskAgeMs(room, params.nowMs);
      if (age != null && age >= staleAfter) {
        items.push({
          key: hkExceptionKey("stale_task", room.openTaskId),
          kind: "stale_task",
          source: "derived",
          roomId: room.id,
          roomNumber: room.roomNumber,
          title: "Cleaning task is overdue",
          detail: "Open task timestamps show this job has been waiting longer than one shift.",
          action: "cleaning",
          discrepancyId: null,
          severity: "standard",
        });
      }
    }
  }

  for (const row of params.discrepancies) {
    if (row.status !== "open") continue;
    items.push({
      key: hkExceptionKey("discrepancy", row.id),
      kind: "discrepancy",
      source: "persisted",
      roomId: row.roomId,
      roomNumber: row.roomNumber,
      title: "Room discrepancy",
      detail: row.reason?.trim() || "Logged occupancy or Housekeeping mismatch.",
      action: "resolve_discrepancy",
      discrepancyId: row.id,
      severity: "standard",
    });
  }

  const rank: Record<HkExceptionKind, number> = {
    ooo_assigned: 0,
    dirty_arrival: 1,
    inspect_failed: 2,
    maintenance_blocker: 3,
    stale_task: 4,
    dirty_vacant_no_task: 5,
    discrepancy: 6,
  };
  return items.sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.roomNumber.localeCompare(b.roomNumber) || a.key.localeCompare(b.key),
  );
}
