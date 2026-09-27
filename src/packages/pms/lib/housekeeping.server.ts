/**
 * Housekeeping operations — server-only helpers.
 *
 * State freeze (workspace Phase 0): product Dirty→Ready is a workflow, not one enum.
 * - Room HK: hotel_rooms.housekeeping_status = dirty | clean | inspected | pickup
 *   Do not write ready | assigned | cleaning | cleaning_in_progress onto that column.
 * - Cleaning job: housekeeping_tasks.status = pending | assigned | in_progress | completed | cancelled
 * - Physical: hotel_rooms.status = available | out_of_order | out_of_service
 * - Maintenance: hotel_rooms.maintenance_status (separate writer; not complete-task)
 * - Ready: derived via evaluateRoomReadinessWithPolicy
 *
 * pickup: live operational HK code (not in the six-step product list). Keep it.
 * Writers: CHECK default dirty; saveRoom / batch create (gated); housekeeping_complete_task
 *   / housekeeping_inspect_room / check_in_hotel_reservation / check_out_hotel_reservation
 *   when Card 2 transition target is pickup.
 * Readers: HK rack/dashboard, FO glyphs LIVE_HK_STATUSES, readiness (pickup is not clean/inspected).
 *
 * Every helper re-derives membership from restaurant_users.
 */
import { type AuthedCtx, type Membership } from "@/core/lib/workforce.server";
import { requireModuleRole } from "@/core/lib/module-access.server";
import { withPmsPackage } from "./pms-package.server";
import { HOUSEKEEPING_SUPERVISOR_ROLES, housekeepingScope } from "@/core/lib/module-access";
import { loadCard2HousekeepingSnapshot } from "./housekeeping-card2.functions";
import { nextMaintenanceStatusFromOpenTickets, type TicketMaintenanceStatus } from "./housekeeping-ops";
import {
  emptyHousekeepingCard2Settings,
  evaluateRoomReadinessWithPolicy,
  type HousekeepingCard2Settings,
} from "./housekeeping-card2.server";

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
  "guest_request_updated",
] as const;
export type HkEventType = (typeof HK_EVENT_TYPES)[number];

export function canManageHousekeeping(role: string): boolean {
  return (HOUSEKEEPING_MANAGE_ROLES as readonly string[]).includes(role);
}

const NO_HK_ACCESS = "You don't have access to Housekeeping for this property.";
const NO_HK_PERMISSION = "You don't have permission to perform that housekeeping action.";

async function requireHousekeepingEnabled(restaurantId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const snapshot = await loadCard2HousekeepingSnapshot(supabaseAdmin, restaurantId);
  if (!snapshot.settings.enabled) {
    throw new Error("Housekeeping Management is disabled in Property Setup.");
  }
}

/** Module entry for any housekeeping-side role. */
export async function requireHousekeepingAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const membership = await withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "housekeeping",
      HOUSEKEEPING_ACCESS_ROLES,
      NO_HK_ACCESS,
    ),
  );
  await requireHousekeepingEnabled(restaurantId);
  return membership;
}

/** Supervisor actions: assignments, inspections, discrepancies, restrictions. */
export async function requireHousekeepingSupervisor(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const membership = await withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "housekeeping",
      HOUSEKEEPING_SUPERVISOR_ROLES,
      NO_HK_PERMISSION,
    ),
  );
  await requireHousekeepingEnabled(restaurantId);
  return membership;
}

/** Cleaning operations (own tasks for attendants, all tasks for supervisors). */
export async function requireHousekeepingOperator(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const membership = await withPmsPackage(
    restaurantId,
    requireModuleRole(
      context,
      restaurantId,
      "housekeeping",
      HOUSEKEEPING_OPERATOR_ROLES,
      NO_HK_PERMISSION,
    ),
  );
  await requireHousekeepingEnabled(restaurantId);
  return membership;
}

/** Maintenance request handling. */
export async function requireMaintenanceAccess(
  context: AuthedCtx,
  restaurantId: string,
): Promise<Membership> {
  const membership = await withPmsPackage(
    restaurantId,
    requireModuleRole(context, restaurantId, "housekeeping", MAINTENANCE_ROLES, NO_HK_PERMISSION),
  );
  await requireHousekeepingEnabled(restaurantId);
  return membership;
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

/** HK rack readiness: policy + vacant/active. Occupied rooms are never "ready" on the rack. */
export function isRoomReady(params: {
  active: boolean;
  status: RoomRestriction;
  occupied: boolean;
  housekeepingStatus: HkStatus;
  maintenanceStatus?: string | null;
  settings?: HousekeepingCard2Settings;
}): boolean {
  if (!params.active || params.occupied) return false;
  const settings =
    params.settings ??
    emptyHousekeepingCard2Settings({
      enabled: true,
      inspectionRequired: true,
      maintenanceClearRequired: false,
    });
  return evaluateRoomReadinessWithPolicy(
    {
      status: params.status,
      housekeepingStatus: params.housekeepingStatus,
      maintenanceStatus: params.maintenanceStatus ?? null,
    },
    settings,
  ).ready;
}

export const ROOM_MAINTENANCE_STATUSES = [
  "normal",
  "maintenance_required",
  "in_progress",
  "out_of_service",
  "out_of_order",
  "inspection",
] as const;
export type RoomMaintenanceStatus = (typeof ROOM_MAINTENANCE_STATUSES)[number];

/**
 * Canonical writer for hotel_rooms.maintenance_status.
 * Never writes hotel_rooms.status (Inventory restriction RPC owns OOO/OOS).
 */
export async function applyRoomMaintenanceStatus(params: {
  admin: { from: (table: string) => any };
  restaurantId: string;
  roomId: string;
  nextStatus: RoomMaintenanceStatus;
}): Promise<{ previous: string; next: RoomMaintenanceStatus }> {
  if (!(ROOM_MAINTENANCE_STATUSES as readonly string[]).includes(params.nextStatus)) {
    throw new Error("Invalid maintenance status.");
  }
  const { data: room } = await params.admin
    .from("hotel_rooms")
    .select("id, maintenance_status")
    .eq("id", params.roomId)
    .eq("restaurant_id", params.restaurantId)
    .maybeSingle();
  if (!room) throw new Error("That room could not be found for this property.");
  const previous = String(room.maintenance_status ?? "normal");
  if (previous === params.nextStatus) return { previous, next: params.nextStatus };

  const { error } = await params.admin
    .from("hotel_rooms")
    .update({ maintenance_status: params.nextStatus })
    .eq("id", params.roomId)
    .eq("restaurant_id", params.restaurantId);
  if (error) throw new Error(error.message);
  return { previous, next: params.nextStatus };
}

export async function syncRoomMaintenanceFromTickets(params: {
  admin: { from: (table: string) => any };
  restaurantId: string;
  roomId: string;
}): Promise<TicketMaintenanceStatus> {
  const { data: tickets, error } = await params.admin
    .from("housekeeping_maintenance_requests")
    .select("status")
    .eq("restaurant_id", params.restaurantId)
    .eq("room_id", params.roomId)
    .in("status", ["open", "in_progress"]);
  if (error) throw new Error(error.message);
  const next = nextMaintenanceStatusFromOpenTickets(
    (tickets ?? []) as Array<{ status: string }>,
  );
  await applyRoomMaintenanceStatus({
    admin: params.admin,
    restaurantId: params.restaurantId,
    roomId: params.roomId,
    nextStatus: next,
  });
  return next;
}
