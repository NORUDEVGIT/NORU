/**
 * First Go-Live housekeeping room-state bootstrap.
 *
 * Source of truth for the Room Status Board is hotel_rooms.housekeeping_status
 * (restriction/occupancy use hotel_rooms.status + live stay occupancy).
 *
 * Card 2 Default Housekeeping Status owns the initial cleanliness value.
 * Activation may trigger this bootstrap once on the false → true pms_set1_live
 * transition; Housekeeping remains owner of later transitions (checkout → dirty).
 *
 * Idempotent: only rooms with no operational HK footprint (no history, no tasks)
 * and inventory status available (not OOO/OOS) that still sit on the schema/seed
 * dirty default are moved to the configured default. Existing Clean / Dirty with
 * history / OOO / OOS are never overwritten.
 *
 * Legacy seed-dirty repair for already-live properties reuses the same predicate
 * and additionally requires configured Default Housekeeping Status = clean.
 */

import type { HousekeepingOperationalStatus } from "./housekeeping-card2.server.ts";

export const HK_ROOM_STATE_BOOTSTRAP_AUDIT = "pms_hk_room_state_first_live_bootstrap";
export const HK_ROOM_STATE_REPAIR_AUDIT = "housekeeping_initial_state_repair";

export const HK_SCHEMA_SEED_STATUS = "dirty" as const;

export type HkRoomBootstrapCandidate = {
  id: string;
  status: string;
  housekeepingStatus: string | null;
  active: boolean;
};

export type HkRoomSkipReason =
  | "inactive"
  | "restricted_ooo_oos"
  | "history_exists"
  | "task_exists"
  | "non_dirty_state"
  | "already_target"
  | "property_default_not_clean";

export type HkRoomBootstrapPlan = {
  targetStatus: HousekeepingOperationalStatus;
  eligibleRoomIds: string[];
  skippedExistingOperational: number;
  skippedRestricted: number;
  skippedInactive: number;
  /** Detailed skip tallies for repair/preview reporting. */
  skippedByReason: Record<HkRoomSkipReason, number>;
};

export function resolveBootstrapHousekeepingStatus(
  configuredDefault: string | null | undefined,
): HousekeepingOperationalStatus {
  const value = String(configuredDefault ?? "").trim().toLowerCase();
  if (value === "clean" || value === "inspected" || value === "pickup" || value === "dirty") {
    return value;
  }
  return "clean";
}

function emptySkipCounts(): Record<HkRoomSkipReason, number> {
  return {
    inactive: 0,
    restricted_ooo_oos: 0,
    history_exists: 0,
    task_exists: 0,
    non_dirty_state: 0,
    already_target: 0,
    property_default_not_clean: 0,
  };
}

/**
 * Shared safe-untouched predicate for first-live bootstrap and legacy seed repair.
 * Eligible = active, available (not OOO/OOS), seed/null dirty, no history, no tasks.
 */
export function classifyHousekeepingBootstrapRoom(
  room: HkRoomBootstrapCandidate,
  input: {
    targetStatus: HousekeepingOperationalStatus;
    roomIdsWithHistory: ReadonlySet<string>;
    roomIdsWithTasks: ReadonlySet<string>;
  },
): { eligible: true } | { eligible: false; reason: HkRoomSkipReason } {
  if (!room.active) return { eligible: false, reason: "inactive" };
  if (room.status !== "available") return { eligible: false, reason: "restricted_ooo_oos" };
  if (input.roomIdsWithHistory.has(room.id)) return { eligible: false, reason: "history_exists" };
  if (input.roomIdsWithTasks.has(room.id)) return { eligible: false, reason: "task_exists" };

  const current = room.housekeepingStatus?.trim().toLowerCase() ?? "";
  const looksUninitialized = !current || current === HK_SCHEMA_SEED_STATUS;
  if (!looksUninitialized) return { eligible: false, reason: "non_dirty_state" };
  if (current === input.targetStatus) return { eligible: false, reason: "already_target" };
  return { eligible: true };
}

/**
 * Eligible = active, inventory available (vacant-capable), still on seed/default dirty
 * or null, and never touched by housekeeping history/tasks.
 */
export function planFirstLiveHousekeepingBootstrap(input: {
  configuredDefault: string | null | undefined;
  rooms: readonly HkRoomBootstrapCandidate[];
  roomIdsWithHistory: ReadonlySet<string>;
  roomIdsWithTasks: ReadonlySet<string>;
}): HkRoomBootstrapPlan {
  const targetStatus = resolveBootstrapHousekeepingStatus(input.configuredDefault);
  const eligibleRoomIds: string[] = [];
  const skippedByReason = emptySkipCounts();

  for (const room of input.rooms) {
    const result = classifyHousekeepingBootstrapRoom(room, {
      targetStatus,
      roomIdsWithHistory: input.roomIdsWithHistory,
      roomIdsWithTasks: input.roomIdsWithTasks,
    });
    if (result.eligible) {
      eligibleRoomIds.push(room.id);
      continue;
    }
    skippedByReason[result.reason] += 1;
  }

  return {
    targetStatus,
    eligibleRoomIds,
    skippedExistingOperational:
      skippedByReason.history_exists +
      skippedByReason.task_exists +
      skippedByReason.non_dirty_state +
      skippedByReason.already_target,
    skippedRestricted: skippedByReason.restricted_ooo_oos,
    skippedInactive: skippedByReason.inactive,
    skippedByReason,
  };
}

/**
 * Already-live legacy seed-dirty repair. Same room predicate as first-live
 * bootstrap, plus hard gate: property Default Housekeeping Status must be clean.
 */
export function planLegacySeedDirtyHousekeepingRepair(input: {
  propertyIsLive: boolean;
  configuredDefault: string | null | undefined;
  rooms: readonly HkRoomBootstrapCandidate[];
  roomIdsWithHistory: ReadonlySet<string>;
  roomIdsWithTasks: ReadonlySet<string>;
}): HkRoomBootstrapPlan & { propertyDefaultIsClean: boolean; blockedReason: string | null } {
  const configured = String(input.configuredDefault ?? "").trim().toLowerCase();
  const propertyDefaultIsClean = configured === "clean";
  const skippedByReason = emptySkipCounts();

  if (!input.propertyIsLive) {
    return {
      targetStatus: "clean",
      eligibleRoomIds: [],
      skippedExistingOperational: 0,
      skippedRestricted: 0,
      skippedInactive: 0,
      skippedByReason,
      propertyDefaultIsClean,
      blockedReason: "property_not_live",
    };
  }

  if (!propertyDefaultIsClean) {
    skippedByReason.property_default_not_clean = input.rooms.length;
    return {
      targetStatus: "clean",
      eligibleRoomIds: [],
      skippedExistingOperational: 0,
      skippedRestricted: 0,
      skippedInactive: 0,
      skippedByReason,
      propertyDefaultIsClean,
      blockedReason: "property_default_not_clean",
    };
  }

  const plan = planFirstLiveHousekeepingBootstrap({
    configuredDefault: "clean",
    rooms: input.rooms,
    roomIdsWithHistory: input.roomIdsWithHistory,
    roomIdsWithTasks: input.roomIdsWithTasks,
  });

  return {
    ...plan,
    propertyDefaultIsClean,
    blockedReason: null,
  };
}
