import type { PropertySetupCardStatus, PropertySetupStatus } from "./pms-property-setup-card1.ts";
import { parsePropertySetupStatus } from "./pms-property-setup-card1.ts";

export const HOUSEKEEPING_OPERATIONAL_STATUSES = ["dirty", "clean", "inspected", "pickup"] as const;
export type HousekeepingOperationalStatus = (typeof HOUSEKEEPING_OPERATIONAL_STATUSES)[number];

export const HOUSEKEEPING_STATUS_DOMAINS = [
  "housekeeping",
  "occupancy",
  "restriction",
  "task",
  "derived",
  "workflow",
  "custom",
] as const;
export type HousekeepingStatusDomain = (typeof HOUSEKEEPING_STATUS_DOMAINS)[number];

export const HOUSEKEEPING_TRANSITION_EVENTS = [
  "guest_check_in",
  "guest_check_out",
  "housekeeping_complete",
  "inspection_complete",
] as const;
export type HousekeepingTransitionEvent = (typeof HOUSEKEEPING_TRANSITION_EVENTS)[number];

export const HOUSEKEEPING_PRIORITY_EVENTS = [
  "vip",
  "arrival",
  "departure",
  "stayover",
  "early_arrival",
  "special_request",
  "room_move",
] as const;
export type HousekeepingPriorityEvent = (typeof HOUSEKEEPING_PRIORITY_EVENTS)[number];

export const HOUSEKEEPING_PRIORITY_CODES = ["normal", "high", "urgent"] as const;
export type HousekeepingPriorityCode = (typeof HOUSEKEEPING_PRIORITY_CODES)[number];

export const HOUSEKEEPING_OVERRIDE_PERMISSIONS = [
  "owner_manager",
  "housekeeping_supervisor",
  "any_supervisor",
] as const;
export type HousekeepingOverridePermission = (typeof HOUSEKEEPING_OVERRIDE_PERMISSIONS)[number];

export const HOUSEKEEPING_RELEASE_RULES = ["manual", "after_cleaning", "after_inspection"] as const;
export type HousekeepingReleaseRule = (typeof HOUSEKEEPING_RELEASE_RULES)[number];

export type HousekeepingCard2Settings = {
  enabled: boolean;
  defaultStatus: HousekeepingOperationalStatus;
  cleanRequired: boolean;
  inspectionRequired: boolean;
  maintenanceClearRequired: boolean;
  roomReleaseRule: HousekeepingReleaseRule;
  supervisorApprovalRequired: boolean;
  automaticStatusChangeEnabled: boolean;
  manualStatusChangeAllowed: boolean;
  assignmentOverrideAllowed: boolean;
  overridePermission: HousekeepingOverridePermission | null;
  overrideReasonRequired: boolean;
  savedAt: string | null;
};

export type HousekeepingCard2Status = {
  id: string;
  code: string;
  name: string;
  domain: HousekeepingStatusDomain;
  isCore: boolean;
  operational: boolean;
  active: boolean;
  sortOrder: number;
};

export type HousekeepingCard2Transition = {
  id: string;
  event: HousekeepingTransitionEvent;
  fromStatus: string;
  toStatus: string;
  enabled: boolean;
  approvalRequired: boolean;
};

export type HousekeepingCard2Priority = {
  id: string;
  event: HousekeepingPriorityEvent;
  priority: HousekeepingPriorityCode;
  enabled: boolean;
  rank: number;
};

export type HousekeepingCard2Snapshot = {
  settings: HousekeepingCard2Settings;
  statuses: HousekeepingCard2Status[];
  transitions: HousekeepingCard2Transition[];
  priorities: HousekeepingCard2Priority[];
};

export type HousekeepingCard2Readiness = {
  ready: boolean;
  stepStatus: PropertySetupCardStatus;
  blockers: string[];
  warnings: string[];
};

export const CORE_HOUSEKEEPING_STATUSES: ReadonlyArray<
  Pick<HousekeepingCard2Status, "code" | "name" | "domain" | "operational" | "sortOrder">
> = [
  { code: "clean", name: "Clean", domain: "housekeeping", operational: true, sortOrder: 10 },
  { code: "dirty", name: "Dirty", domain: "housekeeping", operational: true, sortOrder: 20 },
  { code: "inspected", name: "Inspected", domain: "housekeeping", operational: true, sortOrder: 30 },
  { code: "pickup", name: "Pick-up", domain: "housekeeping", operational: true, sortOrder: 40 },
  { code: "ready", name: "Ready", domain: "derived", operational: false, sortOrder: 50 },
  { code: "occupied", name: "Occupied", domain: "occupancy", operational: false, sortOrder: 60 },
  { code: "vacant", name: "Vacant", domain: "occupancy", operational: false, sortOrder: 70 },
  { code: "out_of_service", name: "Out of Service", domain: "restriction", operational: false, sortOrder: 80 },
  { code: "out_of_order", name: "Out of Order", domain: "restriction", operational: false, sortOrder: 90 },
  {
    code: "cleaning_in_progress",
    name: "Cleaning in Progress",
    domain: "task",
    operational: false,
    sortOrder: 100,
  },
  {
    code: "inspection_required",
    name: "Inspection Required",
    domain: "workflow",
    operational: false,
    sortOrder: 110,
  },
];

export function emptyHousekeepingCard2Settings(
  partial?: Partial<HousekeepingCard2Settings>,
): HousekeepingCard2Settings {
  return {
    enabled: true,
    defaultStatus: "dirty",
    cleanRequired: true,
    inspectionRequired: true,
    maintenanceClearRequired: true,
    roomReleaseRule: "after_inspection",
    supervisorApprovalRequired: true,
    automaticStatusChangeEnabled: true,
    manualStatusChangeAllowed: true,
    assignmentOverrideAllowed: false,
    overridePermission: null,
    overrideReasonRequired: false,
    savedAt: null,
    ...partial,
  };
}

export function evaluateCard2HousekeepingReadiness(
  snapshot: HousekeepingCard2Snapshot,
): HousekeepingCard2Readiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const { settings } = snapshot;
  const activeOperational = snapshot.statuses.filter(
    (status) => status.active && status.operational && status.domain === "housekeeping",
  );

  if (!settings.savedAt) blockers.push("Save the housekeeping settings.");
  if (!activeOperational.some((status) => status.code === settings.defaultStatus)) {
    blockers.push("Select an active default housekeeping status.");
  }
  for (const required of ["dirty", "clean", "inspected"] as const) {
    if (!activeOperational.some((status) => status.code === required)) {
      blockers.push(`${required.charAt(0).toUpperCase()}${required.slice(1)} must remain active.`);
    }
  }
  if (!settings.automaticStatusChangeEnabled && !settings.manualStatusChangeAllowed) {
    blockers.push("Allow automatic or manual status changes.");
  }
  if (settings.inspectionRequired && !settings.supervisorApprovalRequired) {
    warnings.push("Inspection is required without supervisor approval.");
  }
  if (settings.assignmentOverrideAllowed && !settings.overridePermission) {
    blockers.push("Choose who may override assignments.");
  }

  const transitionsByEvent = new Map(snapshot.transitions.map((rule) => [rule.event, rule]));
  for (const event of HOUSEKEEPING_TRANSITION_EVENTS) {
    const rule = transitionsByEvent.get(event);
    if (!rule?.fromStatus || !rule.toStatus) {
      blockers.push(`Configure the ${transitionEventLabel(event)} rule.`);
      continue;
    }
    const from = snapshot.statuses.find((status) => status.code === rule.fromStatus && status.active);
    const to = snapshot.statuses.find((status) => status.code === rule.toStatus && status.active);
    if (!from || !to) blockers.push(`${transitionEventLabel(event)} must use active statuses.`);
    if (event !== "guest_check_in" && (!to?.operational || to.domain !== "housekeeping")) {
      blockers.push(`${transitionEventLabel(event)} must end in an operational housekeeping status.`);
    }
  }
  if (
    settings.automaticStatusChangeEnabled &&
    !snapshot.transitions.some((rule) => rule.enabled && rule.event !== "guest_check_in")
  ) {
    blockers.push("Enable at least one automatic housekeeping transition.");
  }

  const priorityEvents = new Set(snapshot.priorities.map((rule) => rule.event));
  for (const event of HOUSEKEEPING_PRIORITY_EVENTS) {
    if (!priorityEvents.has(event)) blockers.push(`Configure ${priorityEventLabel(event)} priority.`);
  }

  const hasStarted =
    Boolean(settings.savedAt) ||
    snapshot.statuses.some((status) => !status.isCore) ||
    snapshot.transitions.length > 0 ||
    snapshot.priorities.length > 0;
  return {
    ready: blockers.length === 0,
    stepStatus: blockers.length === 0 ? "complete" : hasStarted ? "in_progress" : "not_started",
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
  };
}

export function mergeCard2HousekeepingStatus(
  stored: unknown,
  stepStatus: PropertySetupCardStatus,
): PropertySetupStatus {
  const parsed = parsePropertySetupStatus(stored);
  const cards = { ...parsed.cards };
  if (cards["rooms-inventory"] === "complete" || stepStatus !== "not_started") {
    cards["rooms-inventory"] = "in_progress";
  }
  return {
    ...parsed,
    cards,
    card2Steps: { ...(parsed.card2Steps ?? {}), housekeeping: stepStatus },
  };
}

export function evaluateRoomReadinessWithPolicy(
  room: {
    status: string | null;
    housekeepingStatus: string | null;
    maintenanceStatus?: string | null;
  } | null,
  settings?: Pick<
    HousekeepingCard2Settings,
    "enabled" | "cleanRequired" | "inspectionRequired" | "maintenanceClearRequired"
  >,
): { ready: boolean; reason: string | null } {
  if (!room?.status) return { ready: false, reason: "Assign a room before continuing." };
  if (room.status === "out_of_order") {
    return { ready: false, reason: "This room is out of order and cannot be used for check-in." };
  }
  if (room.status === "out_of_service") {
    return { ready: false, reason: "This room is out of service and cannot be used for check-in." };
  }
  if (room.status !== "available") return { ready: false, reason: "This room is not available." };
  if (!settings?.enabled) {
    const ready = room.housekeepingStatus === "clean" || room.housekeepingStatus === "inspected";
    return ready
      ? { ready: true, reason: null }
      : { ready: false, reason: "Housekeeping has not marked this room clean or inspected." };
  }
  if (settings.maintenanceClearRequired && room.maintenanceStatus && room.maintenanceStatus !== "normal") {
    return { ready: false, reason: "Maintenance must clear this room before check-in." };
  }
  if (settings.inspectionRequired && room.housekeepingStatus !== "inspected") {
    return { ready: false, reason: "This room requires a completed inspection before check-in." };
  }
  if (
    settings.cleanRequired &&
    room.housekeepingStatus !== "clean" &&
    room.housekeepingStatus !== "inspected"
  ) {
    return { ready: false, reason: "Housekeeping must clean this room before check-in." };
  }
  return { ready: true, reason: null };
}

export function transitionEventLabel(event: HousekeepingTransitionEvent): string {
  return {
    guest_check_in: "Guest Check-In",
    guest_check_out: "Guest Check-Out",
    housekeeping_complete: "Housekeeping Complete",
    inspection_complete: "Inspection Complete",
  }[event];
}

export function priorityEventLabel(event: HousekeepingPriorityEvent): string {
  return {
    vip: "VIP",
    arrival: "Arrival",
    departure: "Departure",
    stayover: "Stayover",
    early_arrival: "Early Arrival",
    special_request: "Special Request",
    room_move: "Room Move",
  }[event];
}
