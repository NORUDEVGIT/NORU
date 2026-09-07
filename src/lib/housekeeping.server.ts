/**
 * Phase 6F — Housekeeping operations, server-only helpers.
 *
 * Every helper re-derives the caller's membership from restaurant_users; the
 * browser's restaurant id only selects which membership applies. Housekeeping
 * is owner/manager only in this phase.
 */
import { type AuthedCtx, type Membership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { withPmsPackage } from "./pms-package.server";
import { HOUSEKEEPING_SUPERVISOR_ROLES, housekeepingScope } from "@/core/lib/module-access";

export { HOUSEKEEPING_SUPERVISOR_ROLES, housekeepingScope };
export type { HousekeepingScope } from "@/core/lib/module-access";

/** Supervisor-level housekeeping (assign, inspect, resolve, restrict). */
export const HOUSEKEEPING_MANAGE_ROLES = HOUSEKEEPING_SUPERVISOR_ROLES;
/** Everyone who may open the Housekeeping workspace. */
export const HOUSEKEEPING_ACCESS_ROLES = [
  ...HOUSEKEEPING_SUPERVISOR_ROLES,
  "housekeeper",
  "maintenance",
] as const;
/** Cleaning operators: supervisors plus room attendants (not maintenance). */
export const HOUSEKEEPING_OPERATOR_ROLES = [
  ...HOUSEKEEPING_SUPERVISOR_ROLES,
  "housekeeper",
] as const;
/** Maintenance request handlers. */
export const MAINTENANCE_ROLES = [...HOUSEKEEPING_SUPERVISOR_ROLES, "maintenance"] as const;

export const HK_STATUSES = ["dirty", "clean", "inspected", "pickup"] as const;
export type HkStatus = (typeof HK_STATUSES)[number];

export const ROOM_RESTRICTIONS = ["available", "out_of_order", "out_of_service"] as const;
export type RoomRestriction = (typeof ROOM_RESTRICTIONS)[number];

export const TASK_TYPES = [
  "departure_cleaning",
  "stayover_cleaning",
  "touch_up",
  "deep_cleaning",
  "re_clean",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = [
  "pending",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const OPEN_TASK_STATUSES: TaskStatus[] = ["pending", "assigned", "in_progress"];

export const MAINTENANCE_CATEGORIES = [
  "plumbing",
  "electrical",
  "furniture",
  "equipment",
  "other",
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const HK_EVENT_TYPES = [
  "room_dirty",
  "cleaning_task_created",
  "task_assigned",
  "cleaning_started",
  "cleaning_completed",
  "task_cancelled",
  "inspection_passed",
  "inspection_failed",
  "room_reclean_required",
  "room_ooo",
  "room_oos",
  "room_released",
  "discrepancy_created",
  "discrepancy_resolved",
  "maintenance_created",
  "maintenance_updated",
  "maintenance_resolved",
] as const;
export type HkEventType = (typeof HK_EVENT_TYPES)[number];

export function canManageHousekeeping(role: string): boolean {
  return (HOUSEKEEPING_MANAGE_ROLES as readonly string[]).includes(role);
}

const NO_HK_ACCESS = "You don't have access to Housekeeping for this property.";
const NO_HK_PERMISSION = "You don't have permission to perform that housekeeping action.";

/** Module entry for any housekeeping-side role. */
export async function requireHousekeepingAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "housekeeping",
      HOUSEKEEPING_ACCESS_ROLES,
      NO_HK_ACCESS,
    ),
  );
}

/** Supervisor actions: assignments, inspections, discrepancies, restrictions. */
export async function requireHousekeepingSupervisor(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "housekeeping",
      HOUSEKEEPING_SUPERVISOR_ROLES,
      NO_HK_PERMISSION,
    ),
  );
}

/** Cleaning operations (own tasks for attendants, all tasks for supervisors). */
export async function requireHousekeepingOperator(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "housekeeping",
      HOUSEKEEPING_OPERATOR_ROLES,
      NO_HK_PERMISSION,
    ),
  );
}

/** Maintenance request handling. */
export async function requireMaintenanceAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  return withPmsPackage(
    restaurantId,
    requireModuleRole(context, restaurantId, "housekeeping", MAINTENANCE_ROLES, NO_HK_PERMISSION),
  );
}

/** Backwards-compatible supervisor gate used by existing call sites. */
export const requireHousekeepingManager = requireHousekeepingSupervisor;

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

const DB_ERROR_MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: "That room could not be found for this property.",
  TASK_NOT_FOUND: "That task could not be found for this property.",
  INVALID_TASK_TRANSITION: "That action isn't allowed for this task's current status.",
  INVALID_INSPECTION_RESULT: "An inspection must either pass or fail.",
  ROOM_NOT_INSPECTABLE: "Only a cleaned room can be inspected.",
  INVALID_ROOM_STATUS: "Invalid room restriction.",
  REASON_REQUIRED: "A reason is required when restricting a room.",
};

export function housekeepingError(message: string): Error {
  for (const [code, text] of Object.entries(DB_ERROR_MESSAGES)) {
    if (message.includes(code)) return new Error(text);
  }
  return new Error(message);
}

/** Re-validate any room id against the caller's own property. */
export async function loadRoom(admin: any, restaurantId: string, roomId: string) {
  const { data } = await admin
    .from("hotel_rooms")
    .select("id, restaurant_id, room_number, status, housekeeping_status, active")
    .eq("id", roomId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That room could not be found for this property.");
  return data as {
    id: string;
    restaurant_id: string;
    room_number: string;
    status: RoomRestriction;
    housekeeping_status: HkStatus;
    active: boolean;
  };
}

/** Append-only housekeeping history write; service role, inside a handler. */
export async function recordHousekeepingEvent(params: {
  restaurantId: string;
  roomId: string | null;
  eventType: HkEventType;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  notes?: string | null;
  actorMembershipId: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("housekeeping_history").insert({
    restaurant_id: params.restaurantId,
    room_id: params.roomId,
    event_type: params.eventType,
    previous_values: (params.previousValues ?? null) as never,
    new_values: (params.newValues ?? null) as never,
    notes: params.notes ?? null,
    actor_membership_id: params.actorMembershipId,
  });
}

/** Room readiness: sellable-clean state, independent of reservation availability. */
export function isRoomReady(params: {
  active: boolean;
  status: RoomRestriction;
  occupied: boolean;
  housekeepingStatus: HkStatus;
}): boolean {
  return (
    params.active &&
    params.status === "available" &&
    !params.occupied &&
    params.housekeepingStatus === "inspected"
  );
}
