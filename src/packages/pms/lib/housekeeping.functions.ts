/**
 * Housekeeping operations.
 *
 * State freeze (workspace Phase 0): room HK is dirty|clean|inspected|pickup.
 * Ready is derived (evaluateRoomReadinessWithPolicy / rack isRoomReady).
 * completeHousekeepingTask must not write maintenance_status or tickets.
 *
 * Dashboard, room rack, cleaning tasks, inspections, room restrictions,
 * discrepancies and basic maintenance requests. Every handler re-derives the
 * caller's owner/manager membership; every room / task / inspection id is
 * re-validated against that property before anything is written. Critical
 * transitions run inside locked SECURITY DEFINER functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  blankToNull,
  housekeepingError,
  isRoomReady,
  loadRoom,
  recordHousekeepingEvent,
  requireHousekeepingManager,
  requireHousekeepingAccess,
  requireHousekeepingOperator,
  requireMaintenanceAccess,
  syncRoomMaintenanceFromTickets,
  HK_EVENT_TYPES,
  MAINTENANCE_CATEGORIES,
  TASK_PRIORITIES,
  TASK_TYPES,
  type HkStatus,
  type MaintenanceCategory,
  type RoomRestriction,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from "./housekeeping.server";
import {
  HOUSEKEEPING_ASSIGNABLE_ROLES,
  housekeepingScope,
  type HousekeepingScope,
} from "@/core/lib/module-access";
import {
  cleaningTypeAllowed,
  maintenanceCategoryAllowed,
  restrictionSaveBlocked,
} from "./pms-set4-hk-inventory";
import { loadSet4Snapshot } from "./pms-set4-hk-inventory.functions";
import { applyGuestServiceRequestUpdate } from "./guests.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  GUEST_SERVICE_DESCRIPTION_MAX,
  GUEST_SERVICE_STATUSES,
  isGuestServiceStatus,
  type GuestServicePriority,
  type GuestServiceStatus,
} from "./guest-services-workspace";
import { loadCard2HousekeepingSnapshot } from "./housekeeping-card2.functions";
import { evaluateRoomReadinessWithPolicy } from "./housekeeping-card2.server";
import {
  applyHousekeepingEventPriority,
  EMPTY_HK_DEMAND,
  guestServiceSpawnsCleaningTask,
  hkDemandFromStay,
  housekeeperMayMutateTask,
  isHousekeepingRoutedGuestService,
  deriveHousekeepingExceptions,
  hkHistoryEventTypesForGroup,
  mergeHkDemand,
  priorityEventsForHousekeepingTask,
  roomAwaitsInspection,
  type HkDemandFlags,
} from "./housekeeping-ops";
import { setOperationalRestrictionCompat } from "./room-inventory-compat";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/* ------------------------------------------------------------------- types */

export interface HousekeepingAccess {
  canManage: boolean;
  scope: HousekeepingScope;
  role: string;
  membershipId: string;
}

export interface HousekeepingDashboard {
  today: string;
  totalRooms: number;
  occupied: number;
  vacant: number;
  dirty: number;
  clean: number;
  inspected: number;
  outOfOrder: number;
  outOfService: number;
  pendingCleaning: number;
  pendingInspection: number;
}

export interface RackRoom {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  floor: string | null;
  occupancy: "vacant" | "occupied";
  guestName: string | null;
  housekeepingStatus: HkStatus;
  maintenanceStatus: string | null;
  restriction: RoomRestriction;
  restrictionReason: string | null;
  restrictionExpectedReturn: string | null;
  assignedAttendant: string | null;
  assignedMembershipId: string | null;
  openTaskId: string | null;
  openTaskStatus: TaskStatus | null;
  openTaskType: TaskType | null;
  openTaskPriority: TaskPriority | null;
  openTaskNotes: string | null;
  openTaskCreatedAt: string | null;
  openTaskStartedAt: string | null;
  ready: boolean;
  checkInReady: boolean;
  readyReason: string | null;
  stayId: string | null;
  guestId: string | null;
  demand: HkDemandFlags;
  awaitingInspection: boolean;
}

export interface HousekeepingTask {
  id: string;
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  taskType: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assignedMembershipId: string | null;
  assignedName: string | null;
  notes: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface HousekeepingInspection {
  id: string;
  roomId: string;
  roomNumber: string;
  status: "pending" | "passed" | "failed";
  inspectorName: string | null;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface HousekeepingDiscrepancy {
  id: string;
  roomId: string;
  roomNumber: string;
  reportedOccupancy: string | null;
  actualOccupancy: string | null;
  reportedHkStatus: string | null;
  actualHkStatus: string | null;
  reason: string | null;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
}

export interface MaintenanceRequest {
  id: string;
  roomId: string;
  roomNumber: string;
  category: MaintenanceCategory;
  priority: TaskPriority;
  description: string;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
}

export interface HousekeepingHistoryEntry {
  id: string;
  roomId: string | null;
  roomNumber: string | null;
  eventType: string;
  previousValues: string | null;
  newValues: string | null;
  notes: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface HousekeepingStaffOption {
  membershipId: string;
  name: string;
  role: string;
}

export interface HousekeepingGuestRequest {
  id: string;
  guestId: string;
  guestName: string;
  requestNumber: string | null;
  serviceTypeId: string;
  serviceCode: string;
  serviceName: string;
  status: GuestServiceStatus;
  priority: GuestServicePriority;
  notes: string | null;
  requestedAt: string;
  preferredAt: string | null;
  reservationId: string | null;
  confirmationNumber: string | null;
  roomId: string | null;
  roomNumber: string | null;
  assignedMembershipId: string | null;
  assignedName: string | null;
}

/* ------------------------------------------------------------------ shared */

type RoomRow = {
  id: string;
  room_number: string;
  floor: string | null;
  status: RoomRestriction;
  housekeeping_status: HkStatus;
  maintenance_status: string | null;
  active: boolean;
  room_type_id: string;
  room_types: { name: string } | null;
};

/** Room ids currently held by a checked-in stay, plus the guest name. */
async function occupancyMap(supabase: any, restaurantId: string) {
  const { data } = await supabase
    .from("hotel_reservations")
    .select(
      "id, room_id, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("status", "checked_in")
    .not("room_id", "is", null);

  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{
    room_id: string | null;
    guest_profiles: { first_name: string; last_name: string | null } | null;
  }>) {
    if (!row.room_id) continue;
    const name =
      [row.guest_profiles?.first_name, row.guest_profiles?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || "Guest";
    map.set(row.room_id, name);
  }
  return map;
}

function nextCalendarDate(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  const utc = Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, (parts[2] ?? 1) + 1);
  return new Date(utc).toISOString().slice(0, 10);
}

function uuidFromHistory(values: Record<string, unknown> | null): string | null {
  const id = values?.room_id;
  return typeof id === "string" ? id : null;
}

type HkDemandOverlay = {
  demand: HkDemandFlags;
  stayId: string | null;
  guestId: string | null;
};

/** FO/reservation demand for Board/QV — reads only, never copies stay rows. */
async function loadHkDemandOverlay(
  supabase: any,
  restaurantId: string,
  today: string,
  property: { timezone: string; checkInTime: string | null },
): Promise<Map<string, HkDemandOverlay>> {
  const overlay = new Map<string, HkDemandOverlay>();

  const [{ data: stays }, { data: moves }] = await Promise.all([
    supabase
      .from("hotel_reservations")
      .select(
        "id, room_id, guest_id, status, arrival_date, departure_date, expected_arrival_at, guest_profiles!hotel_reservations_guest_same_property ( vip_status )",
      )
      .eq("restaurant_id", restaurantId)
      .in("status", ["pending", "confirmed", "checked_in"])
      .not("room_id", "is", null)
      .lte("arrival_date", today)
      .gte("departure_date", today),
    supabase
      .from("hotel_reservation_history")
      .select("previous_values, new_values")
      .eq("restaurant_id", restaurantId)
      .in("event_type", ["room_changed", "room_moved"])
      .gte("created_at", `${today}T00:00:00`)
      .lt("created_at", `${nextCalendarDate(today)}T00:00:00`),
  ]);

  const movedRooms = new Set<string>();
  for (const row of (moves ?? []) as Array<{
    previous_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
  }>) {
    const from = uuidFromHistory(row.previous_values);
    const to = uuidFromHistory(row.new_values);
    if (from) movedRooms.add(from);
    if (to) movedRooms.add(to);
  }

  for (const row of (stays ?? []) as Array<{
    id: string;
    room_id: string | null;
    guest_id: string | null;
    status: string;
    arrival_date: string;
    departure_date: string;
    expected_arrival_at: string | null;
    guest_profiles: { vip_status: boolean } | { vip_status: boolean }[] | null;
  }>) {
    if (!row.room_id) continue;
    const guest = Array.isArray(row.guest_profiles) ? row.guest_profiles[0] : row.guest_profiles;
    const demand = hkDemandFromStay(
      {
        roomId: row.room_id,
        status: row.status,
        arrivalDate: row.arrival_date,
        departureDate: row.departure_date,
        expectedArrivalAt: row.expected_arrival_at,
        guestVip: Boolean(guest?.vip_status),
        roomChangedToday: movedRooms.has(row.room_id),
      },
      today,
      { checkInTime: property.checkInTime, timezone: property.timezone },
    );
    const existing = overlay.get(row.room_id);
    const preferStay = row.status === "checked_in" || !existing?.stayId;
    overlay.set(row.room_id, {
      demand: existing ? mergeHkDemand(existing.demand, demand) : demand,
      stayId: preferStay ? row.id : existing?.stayId ?? null,
      guestId: preferStay ? row.guest_id : existing?.guestId ?? null,
    });
  }

  for (const roomId of movedRooms) {
    const existing = overlay.get(roomId);
    overlay.set(roomId, {
      demand: mergeHkDemand(existing?.demand ?? EMPTY_HK_DEMAND, {
        ...EMPTY_HK_DEMAND,
        roomChange: true,
      }),
      stayId: existing?.stayId ?? null,
      guestId: existing?.guestId ?? null,
    });
  }

  return overlay;
}

async function staffNames(supabase: any, restaurantId: string) {
  const { data } = await supabase
    .from("restaurant_users")
    .select("id, user_id, role, active")
    .eq("restaurant_id", restaurantId);
  const memberships = (data ?? []) as Array<{
    id: string;
    user_id: string;
    role: string;
    active: boolean;
  }>;
  if (memberships.length === 0)
    return new Map<string, { name: string; role: string; active: boolean }>();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in(
      "id",
      memberships.map((m) => m.user_id),
    );
  const byUser = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      }>
    ).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Staff member",
    ]),
  );

  return new Map(
    memberships.map((m) => [
      m.id,
      { name: byUser.get(m.user_id) ?? "Staff member", role: m.role, active: m.active },
    ]),
  );
}

/* ------------------------------------------------------------------ access */

export const getHousekeepingAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<HousekeepingAccess> => {
    const { requireHousekeepingAccess, canManageHousekeeping, housekeepingScope } =
      await import("./housekeeping.server");
    const me = await requireHousekeepingAccess(context as never, data.restaurantId);
    return {
      canManage: canManageHousekeeping(me.role),
      scope: housekeepingScope(me.role),
      role: me.role,
      membershipId: me.id,
    };
  });

export const listHousekeepingStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<HousekeepingStaffOption[]> => {
    await requireHousekeepingManager(context as never, data.restaurantId);
    const names = await staffNames(context.supabase, data.restaurantId);
    return Array.from(names.entries())
      .filter(
        ([, v]) =>
          v.active && (HOUSEKEEPING_ASSIGNABLE_ROLES as readonly string[]).includes(v.role),
      )
      .map(([membershipId, v]) => ({ membershipId, name: v.name, role: v.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

/* --------------------------------------------------------------- dashboard */

export const getHousekeepingDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, today: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<HousekeepingDashboard> => {
    const me = await requireHousekeepingAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const housekeepingPolicy = await loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId, false);

    const { data: rooms, error } = await context.supabase
      .from("hotel_rooms")
      .select("id, status, housekeeping_status")
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true);
    if (error) throw new Error(error.message);

    const occupied = await occupancyMap(context.supabase, data.restaurantId);
    const list = (rooms ?? []) as Array<{
      id: string;
      status: RoomRestriction;
      housekeeping_status: HkStatus;
    }>;

    const { count: pendingCleaning } = await context.supabase
      .from("housekeeping_tasks")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId)
      .in("status", ["pending", "assigned", "in_progress"]);

    const occupiedCount = list.filter((r) => occupied.has(r.id)).length;
    return {
      today: data.today,
      totalRooms: list.length,
      occupied: occupiedCount,
      vacant: list.length - occupiedCount,
      dirty: list.filter((r) => r.housekeeping_status === "dirty").length,
      clean: list.filter((r) => r.housekeeping_status === "clean").length,
      inspected: list.filter((r) => r.housekeeping_status === "inspected").length,
      outOfOrder: list.filter((r) => r.status === "out_of_order").length,
      outOfService: list.filter((r) => r.status === "out_of_service").length,
      pendingCleaning: pendingCleaning ?? 0,
      pendingInspection: list.filter((r) =>
        roomAwaitsInspection({
          housekeepingStatus: r.housekeeping_status,
          restriction: r.status,
          inspectionRequired: housekeepingPolicy.settings.inspectionRequired,
        }),
      ).length,
    };
  });

/* ---------------------------------------------------------------- room rack */

export const listRoomRack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, today: dateSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RackRoom[]> => {
    const me = await requireHousekeepingAccess(context as never, data.restaurantId);
    const rackScope = housekeepingScope(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const housekeepingPolicy = await loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId, false);

    const { data: rooms, error } = await context.supabase
      .from("hotel_rooms")
      .select(
        "id, room_number, floor, status, housekeeping_status, maintenance_status, active, room_type_id, restriction_reason, restriction_expected_return, room_types!inner ( name )",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .order("room_number");
    if (error) throw new Error(error.message);

    const { data: property } = await context.supabase
      .from("restaurants")
      .select("timezone, check_in_time, business_date")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const today =
      data.today ??
      (typeof property?.business_date === "string" ? property.business_date.slice(0, 10) : null) ??
      new Date().toISOString().slice(0, 10);

    const [occupied, names, demandOverlay] = await Promise.all([
      occupancyMap(context.supabase, data.restaurantId),
      staffNames(context.supabase, data.restaurantId),
      loadHkDemandOverlay(context.supabase, data.restaurantId, today, {
        timezone: typeof property?.timezone === "string" ? property.timezone : "UTC",
        checkInTime: typeof property?.check_in_time === "string" ? property.check_in_time : null,
      }),
    ]);

    const { data: tasks } = await context.supabase
      .from("housekeeping_tasks")
      .select("id, room_id, status, task_type, priority, notes, assigned_membership_id, created_at, started_at")
      .eq("restaurant_id", data.restaurantId)
      .in("status", ["pending", "assigned", "in_progress"]);
    const openByRoom = new Map(
      (
        (tasks ?? []) as Array<{
          id: string;
          room_id: string;
          status: TaskStatus;
          task_type: TaskType;
          priority: TaskPriority;
          notes: string | null;
          assigned_membership_id: string | null;
          created_at: string;
          started_at: string | null;
        }>
      ).map((t) => [t.room_id, t]),
    );

    return (
      (rooms ?? []) as unknown as Array<
        RoomRow & {
          restriction_reason: string | null;
          restriction_expected_return: string | null;
        }
      >
    ).map((room) => {
      const task = openByRoom.get(room.id);
      const overlay = demandOverlay.get(room.id);
      const guestName = rackScope === "supervisor" ? (occupied.get(room.id) ?? null) : null;
      const isOccupied = occupied.has(room.id);
      const checkIn = evaluateRoomReadinessWithPolicy(
        {
          status: room.status,
          housekeepingStatus: room.housekeeping_status,
          maintenanceStatus: room.maintenance_status,
        },
        housekeepingPolicy.settings,
      );
      return {
        id: room.id,
        roomNumber: room.room_number,
        roomTypeId: room.room_type_id,
        roomTypeName: room.room_types?.name ?? "Room type",
        floor: room.floor,
        occupancy: isOccupied ? ("occupied" as const) : ("vacant" as const),
        guestName,
        housekeepingStatus: room.housekeeping_status,
        maintenanceStatus: room.maintenance_status,
        restriction: room.status,
        restrictionReason: room.restriction_reason,
        restrictionExpectedReturn: room.restriction_expected_return,
        assignedAttendant: task?.assigned_membership_id
          ? (names.get(task.assigned_membership_id)?.name ?? null)
          : null,
        assignedMembershipId: task?.assigned_membership_id ?? null,
        openTaskId: task?.id ?? null,
        openTaskStatus: task?.status ?? null,
        openTaskType: task?.task_type ?? null,
        openTaskPriority: task?.priority ?? null,
        openTaskNotes: task?.notes ?? null,
        openTaskCreatedAt: task?.created_at ?? null,
        openTaskStartedAt: task?.started_at ?? null,
        ready: isRoomReady({
          active: room.active,
          status: room.status,
          occupied: isOccupied,
          housekeepingStatus: room.housekeeping_status,
          maintenanceStatus: room.maintenance_status,
          settings: housekeepingPolicy.settings,
        }),
        checkInReady: checkIn.ready,
        readyReason: checkIn.reason,
        stayId: rackScope === "supervisor" ? (overlay?.stayId ?? null) : null,
        guestId: rackScope === "supervisor" ? (overlay?.guestId ?? null) : null,
        demand: overlay?.demand ?? EMPTY_HK_DEMAND,
        awaitingInspection: roomAwaitsInspection({
          housekeepingStatus: room.housekeeping_status,
          restriction: room.status,
          inspectionRequired: housekeepingPolicy.settings.inspectionRequired,
        }),
      };
    });
  });

/* ------------------------------------------------------------------- tasks */

export const listHousekeepingTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, today: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<HousekeepingTask[]> => {
    const me = await requireHousekeepingAccess(context as never, data.restaurantId);
    const scope = housekeepingScope(me.role);
    // Maintenance staff work from maintenance requests, not cleaning tasks.
    if (scope === "maintenance") return [];

    let query = context.supabase
      .from("housekeeping_tasks")
      .select(
        "id, room_id, task_type, status, priority, assigned_membership_id, notes, created_at, started_at, completed_at, hotel_rooms!inner ( room_number, room_types!inner ( name ) )",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(500);
    // Room attendants only ever see their own assignments.
    if (scope === "housekeeper") query = query.eq("assigned_membership_id", me.id);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const names = await staffNames(context.supabase, data.restaurantId);

    return (
      (rows ?? []) as unknown as Array<{
        id: string;
        room_id: string;
        task_type: TaskType;
        status: TaskStatus;
        priority: TaskPriority;
        assigned_membership_id: string | null;
        notes: string | null;
        created_at: string;
        started_at: string | null;
        completed_at: string | null;
        hotel_rooms: { room_number: string; room_types: { name: string } | null } | null;
      }>
    ).map((t) => ({
      id: t.id,
      roomId: t.room_id,
      roomNumber: t.hotel_rooms?.room_number ?? "—",
      roomTypeName: t.hotel_rooms?.room_types?.name ?? "Room type",
      taskType: t.task_type,
      status: t.status,
      priority: t.priority,
      assignedMembershipId: t.assigned_membership_id,
      assignedName: t.assigned_membership_id
        ? (names.get(t.assigned_membership_id)?.name ?? null)
        : null,
      notes: t.notes,
      createdAt: t.created_at,
      startedAt: t.started_at,
      completedAt: t.completed_at,
    }));
  });

export const createHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomId: idSchema,
        taskType: z.enum(TASK_TYPES),
        priority: z.enum(TASK_PRIORITIES).default("normal"),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ taskId: string }> => {
    const me = await requireHousekeepingManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadRoom(supabaseAdmin, data.restaurantId, data.roomId);
    const set4 = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    if (set4.cleaningPosture.savedAt && !cleaningTypeAllowed(set4.cleaningPosture, data.taskType)) {
      throw new Error("That cleaning type is not in the saved Housekeeping rules.");
    }

    const [{ data: property }, card2] = await Promise.all([
      supabaseAdmin
        .from("restaurants")
        .select("timezone, check_in_time, business_date")
        .eq("id", data.restaurantId)
        .maybeSingle(),
      loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId, false),
    ]);
    const today =
      (typeof property?.business_date === "string" ? property.business_date.slice(0, 10) : null) ??
      new Date().toISOString().slice(0, 10);
    const overlay = await loadHkDemandOverlay(supabaseAdmin, data.restaurantId, today, {
      timezone: typeof property?.timezone === "string" ? property.timezone : "UTC",
      checkInTime: typeof property?.check_in_time === "string" ? property.check_in_time : null,
    });
    const priority = applyHousekeepingEventPriority(
      card2.priorities,
      priorityEventsForHousekeepingTask(data.taskType, overlay.get(data.roomId)?.demand ?? EMPTY_HK_DEMAND),
      data.priority,
    );

    const { data: taskId, error } = await supabaseAdmin.rpc("housekeeping_create_task", {
      _restaurant_id: data.restaurantId,
      _room_id: data.roomId,
      _task_type: data.taskType,
      _priority: priority,
      _notes: blankToNull(data.notes) as unknown as string,
      _membership_id: me.id,
    });
    if (error) throw housekeepingError(error.message);
    return { taskId: taskId as unknown as string };
  });

/** Non-transitional task updates (assign / start / cancel) with history. */
export const updateHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        taskId: idSchema,
        action: z.enum(["assign", "start", "cancel"]),
        assigneeMembershipId: idSchema.nullable().optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: TaskStatus }> => {
    const me = await requireHousekeepingOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: task } = await supabaseAdmin
      .from("housekeeping_tasks")
      .select("id, restaurant_id, room_id, status, assigned_membership_id, notes")
      .eq("id", data.taskId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!task) throw new Error("That task could not be found for this property.");
    if (task.status === "completed" || task.status === "cancelled") {
      throw new Error("That action isn't allowed for this task's current status.");
    }

    const scope = housekeepingScope(me.role);
    if (
      !housekeeperMayMutateTask({
        scope,
        action: data.action,
        assignedMembershipId: task.assigned_membership_id,
        actorMembershipId: me.id,
      })
    ) {
      if (scope === "housekeeper" && data.action === "start") {
        throw new Error("You can only work on tasks assigned to you.");
      }
      throw new Error("You don't have permission to perform that housekeeping action.");
    }

    const nextNotes = blankToNull(data.notes) ?? task.notes;

    if (data.action === "assign") {
      if (!data.assigneeMembershipId) throw new Error("Pick a staff member to assign.");
      const { loadMembership } = await import("@/core/lib/workforce.server");
      const assignee = await loadMembership(
        supabaseAdmin,
        data.restaurantId,
        data.assigneeMembershipId,
      );
      if (!assignee.active) throw new Error("That staff member is inactive.");
      if (!(HOUSEKEEPING_ASSIGNABLE_ROLES as readonly string[]).includes(assignee.role)) {
        throw new Error("That staff member can't be assigned housekeeping tasks.");
      }

      const assignmentOverride =
        Boolean(task.assigned_membership_id) && task.assigned_membership_id !== assignee.id;
      if (assignmentOverride) {
        const policy = await loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId);
        if (!policy.settings.assignmentOverrideAllowed) {
          throw new Error("Assignment overrides are disabled in Housekeeping Setup.");
        }
        const allowed =
          (policy.settings.overridePermission === "any_supervisor" && scope === "supervisor") ||
          (policy.settings.overridePermission === "owner_manager" &&
            (me.role === "owner" || me.role === "manager")) ||
          (policy.settings.overridePermission === "housekeeping_supervisor" &&
            (me.role === "housekeeping" || me.role === "housekeeping_supervisor"));
        if (!allowed) throw new Error("You don't have the configured assignment override permission.");
        if (policy.settings.overrideReasonRequired && !blankToNull(data.notes)) {
          throw new Error("An override reason is required.");
        }
      }

      if (task.assigned_membership_id === assignee.id && task.status !== "pending") {
        return { id: task.id, status: task.status as TaskStatus };
      }

      const nextStatus: TaskStatus = task.status === "in_progress" ? "in_progress" : "assigned";
      await supabaseAdmin
        .from("housekeeping_tasks")
        .update({ assigned_membership_id: assignee.id, status: nextStatus, notes: nextNotes })
        .eq("id", task.id)
        .eq("restaurant_id", data.restaurantId);

      await recordHousekeepingEvent({
        restaurantId: data.restaurantId,
        roomId: task.room_id,
        eventType: "task_assigned",
        previousValues: {
          status: task.status,
          assigned_membership_id: task.assigned_membership_id,
        },
        newValues: { status: nextStatus, assigned_membership_id: assignee.id, task_id: task.id },
        actorMembershipId: me.id,
      });
      return { id: task.id, status: nextStatus };
    }

    if (data.action === "start") {
      if (task.status === "in_progress") return { id: task.id, status: "in_progress" };
      await supabaseAdmin
        .from("housekeeping_tasks")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
          notes: nextNotes,
        })
        .eq("id", task.id)
        .eq("restaurant_id", data.restaurantId);
      await recordHousekeepingEvent({
        restaurantId: data.restaurantId,
        roomId: task.room_id,
        eventType: "cleaning_started",
        previousValues: { status: task.status },
        newValues: { status: "in_progress", task_id: task.id },
        actorMembershipId: me.id,
      });
      return { id: task.id, status: "in_progress" };
    }

    await supabaseAdmin
      .from("housekeeping_tasks")
      .update({ status: "cancelled" })
      .eq("id", task.id)
      .eq("restaurant_id", data.restaurantId);
    await recordHousekeepingEvent({
      restaurantId: data.restaurantId,
      roomId: task.room_id,
      eventType: "task_cancelled",
      previousValues: { status: task.status },
      newValues: { status: "cancelled", task_id: task.id },
      notes: blankToNull(data.notes),
      actorMembershipId: me.id,
    });
    return { id: task.id, status: "cancelled" };
  });

export const completeHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, taskId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: TaskStatus }> => {
    const me = await requireHousekeepingOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owned } = await supabaseAdmin
      .from("housekeeping_tasks")
      .select("id, assigned_membership_id")
      .eq("id", data.taskId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (
      !housekeeperMayMutateTask({
        scope: housekeepingScope(me.role),
        action: "complete",
        assignedMembershipId: owned?.assigned_membership_id ?? null,
        actorMembershipId: me.id,
      })
    ) {
      throw new Error("You can only complete tasks assigned to you.");
    }
    const { error } = await supabaseAdmin.rpc("housekeeping_complete_task", {
      _restaurant_id: data.restaurantId,
      _task_id: data.taskId,
      _membership_id: me.id,
    });
    if (error) throw housekeepingError(error.message);
    return { id: data.taskId, status: "completed" };
  });

/* -------------------------------------------------------------- inspections */

export const listInspections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<HousekeepingInspection[]> => {
    await requireHousekeepingManager(context as never, data.restaurantId);

    const { data: rows, error } = await context.supabase
      .from("housekeeping_inspections")
      .select(
        "id, room_id, status, notes, created_at, completed_at, inspector_membership_id, hotel_rooms!inner ( room_number )",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const names = await staffNames(context.supabase, data.restaurantId);
    return (
      (rows ?? []) as unknown as Array<{
        id: string;
        room_id: string;
        status: "pending" | "passed" | "failed";
        notes: string | null;
        created_at: string;
        completed_at: string | null;
        inspector_membership_id: string | null;
        hotel_rooms: { room_number: string } | null;
      }>
    ).map((r) => ({
      id: r.id,
      roomId: r.room_id,
      roomNumber: r.hotel_rooms?.room_number ?? "—",
      status: r.status,
      inspectorName: r.inspector_membership_id
        ? (names.get(r.inspector_membership_id)?.name ?? null)
        : null,
      notes: r.notes,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    }));
  });

export const inspectRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomId: idSchema,
        taskId: idSchema.nullable().optional(),
        result: z.enum(["passed", "failed"]),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ inspectionId: string; result: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const policy = await loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId);
    const me = policy.settings.supervisorApprovalRequired
      ? await requireHousekeepingManager(context as never, data.restaurantId)
      : await requireHousekeepingOperator(context as never, data.restaurantId);
    const room = await loadRoom(supabaseAdmin, data.restaurantId, data.roomId);
    if (room.status === "out_of_order" || room.status === "out_of_service") {
      throw new Error("Inspectors cannot put a room out of order or inspect a restricted room. Use Inventory restrictions.");
    }
    if (data.result === "failed" && !blankToNull(data.notes)) {
      throw new Error("Add notes describing why inspection failed.");
    }

    const { data: inspectionId, error } = await supabaseAdmin.rpc("housekeeping_inspect_room", {
      _restaurant_id: data.restaurantId,
      _room_id: data.roomId,
      _task_id: (data.taskId ?? null) as unknown as string,
      _result: data.result,
      _notes: blankToNull(data.notes) as unknown as string,
      _membership_id: me.id,
    });
    if (error) throw housekeepingError(error.message);
    return { inspectionId: inspectionId as unknown as string, result: data.result };
  });

/* ------------------------------------------------------------- restrictions */

export const setRoomRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomId: idSchema,
        status: z.enum(["available", "out_of_order", "out_of_service"]),
        reason: z.string().max(500).optional(),
        expectedReturn: dateSchema.nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: RoomRestriction }> => {
    const me = await requireHousekeepingManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadRoom(supabaseAdmin, data.restaurantId, data.roomId);
    const set4 = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    const postureBlocked = restrictionSaveBlocked(set4.oooOosPosture, {
      status: data.status,
      reason: data.reason ?? null,
      expectedReturn: data.expectedReturn ?? null,
    });
    if (postureBlocked) throw new Error(postureBlocked);

    try {
      await setOperationalRestrictionCompat(supabaseAdmin, {
        restaurantId: data.restaurantId,
        roomId: data.roomId,
        status: data.status,
        reason: blankToNull(data.reason),
        expectedReturn: data.expectedReturn ?? null,
        membershipId: me.id,
      });
    } catch (error) {
      throw housekeepingError(
        error instanceof Error ? error.message : "Could not update room restriction.",
      );
    }
    return { id: data.roomId, status: data.status };
  });

/* ------------------------------------------------------------ discrepancies */

export const listDiscrepancies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<HousekeepingDiscrepancy[]> => {
    await requireHousekeepingManager(context as never, data.restaurantId);
    const { data: rows, error } = await context.supabase
      .from("housekeeping_discrepancies")
      .select(
        "id, room_id, reported_occupancy, actual_occupancy, reported_hk_status, actual_hk_status, reason, status, created_at, resolved_at, hotel_rooms!inner ( room_number )",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return (
      (rows ?? []) as unknown as Array<{
        id: string;
        room_id: string;
        reported_occupancy: string | null;
        actual_occupancy: string | null;
        reported_hk_status: string | null;
        actual_hk_status: string | null;
        reason: string | null;
        status: "open" | "resolved";
        created_at: string;
        resolved_at: string | null;
        hotel_rooms: { room_number: string } | null;
      }>
    ).map((r) => ({
      id: r.id,
      roomId: r.room_id,
      roomNumber: r.hotel_rooms?.room_number ?? "—",
      reportedOccupancy: r.reported_occupancy,
      actualOccupancy: r.actual_occupancy,
      reportedHkStatus: r.reported_hk_status,
      actualHkStatus: r.actual_hk_status,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    }));
  });

export const createDiscrepancy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomId: idSchema,
        reportedOccupancy: z.enum(["vacant", "occupied"]).nullable().optional(),
        actualOccupancy: z.enum(["vacant", "occupied"]).nullable().optional(),
        reportedHkStatus: z.string().max(40).optional(),
        actualHkStatus: z.string().max(40).optional(),
        reason: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireHousekeepingOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadRoom(supabaseAdmin, data.restaurantId, data.roomId);

    const { data: row, error } = await supabaseAdmin
      .from("housekeeping_discrepancies")
      .insert({
        restaurant_id: data.restaurantId,
        room_id: data.roomId,
        reported_occupancy: data.reportedOccupancy ?? null,
        actual_occupancy: data.actualOccupancy ?? null,
        reported_hk_status: blankToNull(data.reportedHkStatus),
        actual_hk_status: blankToNull(data.actualHkStatus),
        reason: blankToNull(data.reason),
        reported_by_membership_id: me.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await recordHousekeepingEvent({
      restaurantId: data.restaurantId,
      roomId: data.roomId,
      eventType: "discrepancy_created",
      newValues: {
        discrepancy_id: row.id,
        reported_occupancy: data.reportedOccupancy ?? null,
        actual_occupancy: data.actualOccupancy ?? null,
      },
      notes: blankToNull(data.reason),
      actorMembershipId: me.id,
    });
    return { id: row.id };
  });

export const resolveDiscrepancy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        discrepancyId: idSchema,
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireHousekeepingManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("housekeeping_discrepancies")
      .select("id, room_id, status")
      .eq("id", data.discrepancyId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!row) throw new Error("That discrepancy could not be found for this property.");
    if (row.status === "resolved") return { id: row.id };

    await supabaseAdmin
      .from("housekeeping_discrepancies")
      .update({
        status: "resolved",
        resolved_by_membership_id: me.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("restaurant_id", data.restaurantId);

    await recordHousekeepingEvent({
      restaurantId: data.restaurantId,
      roomId: row.room_id,
      eventType: "discrepancy_resolved",
      previousValues: { status: "open" },
      newValues: { status: "resolved", discrepancy_id: row.id },
      notes: blankToNull(data.notes),
      actorMembershipId: me.id,
    });
    return { id: row.id };
  });

export const listHousekeepingExceptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, today: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReturnType<typeof deriveHousekeepingExceptions>> => {
    await requireHousekeepingManager(context as never, data.restaurantId);
    const [rooms, inspections, discrepancies] = await Promise.all([
      listRoomRack({ data: { restaurantId: data.restaurantId, today: data.today } }),
      listInspections({ data: { restaurantId: data.restaurantId } }),
      listDiscrepancies({ data: { restaurantId: data.restaurantId } }),
    ]);
    return deriveHousekeepingExceptions({
      rooms,
      inspections,
      discrepancies,
      nowMs: Date.now(),
    });
  });

/* -------------------------------------------------------------- maintenance */

export const listMaintenanceRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<MaintenanceRequest[]> => {
    const me = await requireHousekeepingAccess(context as never, data.restaurantId);
    const { data: rows, error } = await context.supabase
      .from("housekeeping_maintenance_requests")
      .select(
        "id, room_id, category, priority, description, status, created_at, resolved_at, hotel_rooms!housekeeping_maintenance_room_same_property ( room_number )",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return (
      (rows ?? []) as unknown as Array<{
        id: string;
        room_id: string;
        category: MaintenanceCategory;
        priority: TaskPriority;
        description: string;
        status: "open" | "in_progress" | "resolved";
        created_at: string;
        resolved_at: string | null;
        hotel_rooms: { room_number: string } | null;
      }>
    ).map((r) => ({
      id: r.id,
      roomId: r.room_id,
      roomNumber: r.hotel_rooms?.room_number ?? "—",
      category: r.category,
      priority: r.priority,
      description: r.description,
      status: r.status,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    }));
  });

export const createMaintenanceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomId: idSchema,
        category: z.enum(MAINTENANCE_CATEGORIES),
        priority: z.enum(TASK_PRIORITIES).default("normal"),
        description: z.string().trim().min(1).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireHousekeepingOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadRoom(supabaseAdmin, data.restaurantId, data.roomId);
    const set4 = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    if (
      set4.cataloguesAvailable &&
      set4.maintenanceCategories.some((row) => row.active) &&
      !maintenanceCategoryAllowed(set4.maintenanceCategories, data.category)
    ) {
      throw new Error("That category is not in the saved Maintenance rules.");
    }

    const { data: row, error } = await supabaseAdmin
      .from("housekeeping_maintenance_requests")
      .insert({
        restaurant_id: data.restaurantId,
        room_id: data.roomId,
        category: data.category,
        priority: data.priority,
        description: data.description,
        created_by_membership_id: me.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await syncRoomMaintenanceFromTickets({
      admin: supabaseAdmin,
      restaurantId: data.restaurantId,
      roomId: data.roomId,
    });

    await recordHousekeepingEvent({
      restaurantId: data.restaurantId,
      roomId: data.roomId,
      eventType: "maintenance_created",
      newValues: { request_id: row.id, category: data.category, priority: data.priority },
      notes: data.description,
      actorMembershipId: me.id,
    });
    return { id: row.id };
  });

export const updateMaintenanceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        requestId: idSchema,
        status: z.enum(["open", "in_progress", "resolved"]),
        notes: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: string }> => {
    const me = await requireMaintenanceAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("housekeeping_maintenance_requests")
      .select("id, room_id, status")
      .eq("id", data.requestId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!row) throw new Error("That maintenance request could not be found for this property.");
    if (row.status === data.status) return { id: row.id, status: row.status };

    await supabaseAdmin
      .from("housekeeping_maintenance_requests")
      .update({
        status: data.status,
        resolved_by_membership_id: data.status === "resolved" ? me.id : null,
        resolved_at: data.status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", row.id)
      .eq("restaurant_id", data.restaurantId);

    await syncRoomMaintenanceFromTickets({
      admin: supabaseAdmin,
      restaurantId: data.restaurantId,
      roomId: row.room_id,
    });

    await recordHousekeepingEvent({
      restaurantId: data.restaurantId,
      roomId: row.room_id,
      eventType: data.status === "resolved" ? "maintenance_resolved" : "maintenance_updated",
      previousValues: { status: row.status },
      newValues: { status: data.status, request_id: row.id },
      notes: blankToNull(data.notes),
      actorMembershipId: me.id,
    });
    return { id: row.id, status: data.status };
  });

/* ----------------------------------------------------------------- history */

export const listHousekeepingHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomId: idSchema.optional(),
        eventType: z.enum(HK_EVENT_TYPES).optional(),
        eventGroup: z.enum(["cleaning", "inspection", "discrepancy", "maintenance", "restriction", "guest_request"]).optional(),
        actorMembershipId: z.union([idSchema, z.literal("system")]).optional(),
        dateFrom: dateSchema.optional(),
        dateTo: dateSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<HousekeepingHistoryEntry[]> => {
    await requireHousekeepingManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("housekeeping_history")
      .select("id, room_id, event_type, previous_values, new_values, notes, actor_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.roomId) query = query.eq("room_id", data.roomId);
    if (data.eventType) {
      query = query.eq("event_type", data.eventType);
    } else if (data.eventGroup) {
      const types = hkHistoryEventTypesForGroup(data.eventGroup);
      if (types && types.length > 0) query = query.in("event_type", types);
    }
    if (data.actorMembershipId === "system") {
      query = query.is("actor_membership_id", null);
    } else if (data.actorMembershipId) {
      query = query.eq("actor_membership_id", data.actorMembershipId);
    }
    if (data.dateFrom) query = query.gte("created_at", `${data.dateFrom}T00:00:00.000Z`);
    if (data.dateTo) {
      const [year, month, day] = data.dateTo.split("-").map(Number);
      const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
      query = query.lt("created_at", `${next}T00:00:00.000Z`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const typed = (rows ?? []) as Array<{
      id: string;
      room_id: string | null;
      event_type: string;
      previous_values: Record<string, unknown> | null;
      new_values: Record<string, unknown> | null;
      notes: string | null;
      actor_membership_id: string | null;
      created_at: string;
    }>;
    const roomIds = Array.from(new Set(typed.map((r) => r.room_id).filter((id): id is string => Boolean(id))));
    const roomNumbers = new Map<string, string>();
    if (roomIds.length > 0) {
      const rooms = await supabaseAdmin
        .from("hotel_rooms")
        .select("id, room_number")
        .eq("restaurant_id", data.restaurantId)
        .in("id", roomIds);
      for (const room of (rooms.data ?? []) as Array<{ id: string; room_number: string }>) {
        roomNumbers.set(room.id, room.room_number);
      }
    }

    const names = await staffNames(supabaseAdmin, data.restaurantId);
    return typed.map((r) => ({
      id: r.id,
      roomId: r.room_id,
      roomNumber: r.room_id ? (roomNumbers.get(r.room_id) ?? null) : null,
      eventType: r.event_type,
      previousValues: r.previous_values ? JSON.stringify(r.previous_values) : null,
      newValues: r.new_values ? JSON.stringify(r.new_values) : null,
      notes: r.notes,
      actorMembershipId: r.actor_membership_id,
      actorName: r.actor_membership_id ? (names.get(r.actor_membership_id)?.name ?? null) : null,
      createdAt: r.created_at,
    }));
  });

/* ---------------------------------------------------------- guest requests */

export const listHousekeepingGuestRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, roomId: idSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<HousekeepingGuestRequest[]> => {
    await requireHousekeepingAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let result = await supabaseAdmin
      .from("guest_service_history")
      .select(
        "id, guest_id, service_type_id, status, requested_at, reservation_id, notes, request_number, priority, preferred_at, assigned_membership_id",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("requested_at", { ascending: false })
      .limit(300);
    if (result.error && isMissingSchemaError(result.error)) return [];
    if (result.error) throw new Error(result.error.message);

    const typesRes = await supabaseAdmin
      .from("pms_guest_service_types")
      .select("id, name, code, category_id")
      .eq("restaurant_id", data.restaurantId);
    if (typesRes.error && isMissingSchemaError(typesRes.error)) return [];
    const categoriesRes = await supabaseAdmin
      .from("pms_guest_service_categories")
      .select("id, code")
      .eq("restaurant_id", data.restaurantId);
    const departmentsRes = await supabaseAdmin
      .from("pms_departments")
      .select("id, code, name")
      .eq("restaurant_id", data.restaurantId);
    const assignmentsRes = await supabaseAdmin
      .from("pms_guest_service_department_assignments")
      .select("service_type_id, department_id, active")
      .eq("restaurant_id", data.restaurantId);

    const categoryCode = new Map(
      ((categoriesRes.data ?? []) as Array<{ id: string; code: string }>).map((row) => [row.id, row.code]),
    );
    const deptById = new Map(
      ((departmentsRes.error ? [] : (departmentsRes.data ?? [])) as Array<{
        id: string;
        code: string;
        name: string;
      }>).map((row) => [row.id, row]),
    );
    const assignedDepts = new Map<string, Array<{ code: string; name: string }>>();
    if (!assignmentsRes.error) {
      for (const row of (assignmentsRes.data ?? []) as Array<{
        service_type_id: string;
        department_id: string;
        active: boolean;
      }>) {
        if (!row.active) continue;
        const dept = deptById.get(row.department_id);
        if (!dept) continue;
        const list = assignedDepts.get(row.service_type_id) ?? [];
        list.push({ code: dept.code, name: dept.name });
        assignedDepts.set(row.service_type_id, list);
      }
    }
    const types = (
      (typesRes.data ?? []) as Array<{ id: string; name: string; code: string; category_id: string | null }>
    ).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      categoryCode: row.category_id ? (categoryCode.get(row.category_id) ?? null) : null,
    }));
    const typeById = new Map(types.map((row) => [row.id, row]));
    const hkTypeIds = new Set(
      types
        .filter((row) =>
          isHousekeepingRoutedGuestService({
            typeCode: row.code,
            categoryCode: row.categoryCode,
            assignedDepartmentCodes: (assignedDepts.get(row.id) ?? []).map((dept) => dept.code),
            assignedDepartmentNames: (assignedDepts.get(row.id) ?? []).map((dept) => dept.name),
          }),
        )
        .map((row) => row.id),
    );

    const rows = (
      (result.data ?? []) as Array<{
        id: string;
        guest_id: string;
        service_type_id: string;
        status: string;
        requested_at: string;
        reservation_id: string | null;
        notes: string | null;
        request_number: string | null;
        priority: string | null;
        preferred_at: string | null;
        assigned_membership_id: string | null;
      }>
    ).filter((row) => hkTypeIds.has(row.service_type_id));

    const reservationIds = [...new Set(rows.map((row) => row.reservation_id).filter(Boolean) as string[])];
    const stayById = new Map<string, { confirmationNumber: string; roomId: string | null }>();
    if (reservationIds.length > 0) {
      const stays = await supabaseAdmin
        .from("hotel_reservations")
        .select("id, confirmation_number, room_id")
        .eq("restaurant_id", data.restaurantId)
        .in("id", reservationIds);
      for (const stay of (stays.data ?? []) as Array<{
        id: string;
        confirmation_number: string;
        room_id: string | null;
      }>) {
        stayById.set(stay.id, { confirmationNumber: stay.confirmation_number, roomId: stay.room_id });
      }
    }
    const roomIds = [
      ...new Set([...stayById.values()].map((stay) => stay.roomId).filter(Boolean) as string[]),
    ];
    const roomNumber = new Map<string, string>();
    if (roomIds.length > 0) {
      const rooms = await supabaseAdmin
        .from("hotel_rooms")
        .select("id, room_number")
        .eq("restaurant_id", data.restaurantId)
        .in("id", roomIds);
      for (const room of (rooms.data ?? []) as Array<{ id: string; room_number: string }>) {
        roomNumber.set(room.id, room.room_number);
      }
    }

    const guestIds = [...new Set(rows.map((row) => row.guest_id))];
    const guestName = new Map<string, string>();
    if (guestIds.length > 0) {
      const guests = await supabaseAdmin
        .from("guest_profiles")
        .select("id, first_name, last_name")
        .eq("restaurant_id", data.restaurantId)
        .in("id", guestIds);
      for (const guest of (guests.data ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
      }>) {
        guestName.set(guest.id, [guest.first_name, guest.last_name].filter(Boolean).join(" ").trim() || "Guest");
      }
    }

    const names = await staffNames(supabaseAdmin, data.restaurantId);
    return rows
      .filter((row) => {
        if (!data.roomId) return true;
        const stay = row.reservation_id ? stayById.get(row.reservation_id) : null;
        return stay?.roomId === data.roomId;
      })
      .map((row) => {
        const type = typeById.get(row.service_type_id);
        const stay = row.reservation_id ? stayById.get(row.reservation_id) : null;
        const status = isGuestServiceStatus(row.status) ? row.status : "requested";
        const priority: GuestServicePriority =
          row.priority === "high" || row.priority === "urgent" ? row.priority : "normal";
        return {
          id: row.id,
          guestId: row.guest_id,
          guestName: guestName.get(row.guest_id) ?? "Guest",
          requestNumber: row.request_number ?? null,
          serviceTypeId: row.service_type_id,
          serviceCode: type?.code ?? "",
          serviceName: type?.name ?? "Guest service",
          status,
          priority,
          notes: row.notes ?? null,
          requestedAt: row.requested_at,
          preferredAt: row.preferred_at ?? null,
          reservationId: row.reservation_id,
          confirmationNumber: stay?.confirmationNumber ?? null,
          roomId: stay?.roomId ?? null,
          roomNumber: stay?.roomId ? (roomNumber.get(stay.roomId) ?? null) : null,
          assignedMembershipId: row.assigned_membership_id,
          assignedName: row.assigned_membership_id
            ? (names.get(row.assigned_membership_id)?.name ?? null)
            : null,
        };
      });
  });

export const updateHousekeepingGuestRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        requestId: idSchema,
        status: z.enum(GUEST_SERVICE_STATUSES).optional(),
        notes: z.string().trim().max(GUEST_SERVICE_DESCRIPTION_MAX).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; spawnedTaskId: string | null }> => {
    const me = await requireHousekeepingOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = await supabaseAdmin
      .from("guest_service_history")
      .select("id, guest_id, service_type_id, reservation_id, priority, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (!existing.data) throw new Error("That guest request could not be found for this property.");
    const row = existing.data as {
      id: string;
      guest_id: string;
      service_type_id: string;
      reservation_id: string | null;
      priority: string | null;
      status: string;
    };

    const typeRes = await supabaseAdmin
      .from("pms_guest_service_types")
      .select("id, code, category_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", row.service_type_id)
      .maybeSingle();
    const type = typeRes.data as { id: string; code: string; category_id: string | null } | null;
    if (!type) throw new Error("That service type is not configured for this property.");
    const category = type.category_id
      ? await supabaseAdmin
          .from("pms_guest_service_categories")
          .select("code")
          .eq("id", type.category_id)
          .maybeSingle()
      : { data: null };
    const assignments = await supabaseAdmin
      .from("pms_guest_service_department_assignments")
      .select("department_id, active")
      .eq("restaurant_id", data.restaurantId)
      .eq("service_type_id", type.id);
    const deptIds = ((assignments.data ?? []) as Array<{ department_id: string; active: boolean }>)
      .filter((item) => item.active)
      .map((item) => item.department_id);
    const depts =
      deptIds.length > 0
        ? await supabaseAdmin
            .from("pms_departments")
            .select("code, name")
            .eq("restaurant_id", data.restaurantId)
            .in("id", deptIds)
        : { data: [] };
    const assignedDepts = ((depts.data ?? []) as Array<{ code: string; name: string }>);
    if (
      !isHousekeepingRoutedGuestService({
        typeCode: type.code,
        categoryCode: (category.data as { code: string } | null)?.code ?? null,
        assignedDepartmentCodes: assignedDepts.map((item) => item.code),
        assignedDepartmentNames: assignedDepts.map((item) => item.name),
      })
    ) {
      throw new Error("Housekeeping can only execute Housekeeping-routed guest requests.");
    }

    const result = await applyGuestServiceRequestUpdate({
      admin: supabaseAdmin,
      restaurantId: data.restaurantId,
      guestId: row.guest_id,
      requestId: row.id,
      actorMembershipId: me.id,
      status: data.status,
      notes: data.notes,
    });
    if (!result.ok) throw new Error(result.message);

    let roomId: string | null = null;
    if (row.reservation_id) {
      const stay = await supabaseAdmin
        .from("hotel_reservations")
        .select("room_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", row.reservation_id)
        .maybeSingle();
      roomId = (stay.data as { room_id: string | null } | null)?.room_id ?? null;
    }

    let spawnedTaskId: string | null = null;
    if (data.status === "completed" && guestServiceSpawnsCleaningTask(type.code) && roomId) {
      const priority =
        row.priority === "urgent" || row.priority === "high" ? row.priority : "normal";
      const created = await supabaseAdmin.rpc("housekeeping_create_task", {
        _restaurant_id: data.restaurantId,
        _room_id: roomId,
        _task_type: "touch_up",
        _priority: priority,
        _notes: "From guest request HK_CLEAN" as unknown as string,
        _membership_id: me.id,
      });
      if (!created.error && created.data) spawnedTaskId = String(created.data);
    }

    await recordHousekeepingEvent({
      restaurantId: data.restaurantId,
      roomId,
      eventType: "guest_request_updated",
      previousValues: { status: row.status, request_id: row.id, service_code: type.code },
      newValues: {
        status: data.status ?? row.status,
        request_id: row.id,
        service_code: type.code,
        spawned_task: Boolean(spawnedTaskId),
      },
      notes: blankToNull(data.notes),
      actorMembershipId: me.id,
    });

    return { id: row.id, spawnedTaskId };
  });
