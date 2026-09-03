/**
 * Phase 6F — Housekeeping operations.
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
} from "./module-access";

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
  restriction: RoomRestriction;
  restrictionReason: string | null;
  restrictionExpectedReturn: string | null;
  assignedAttendant: string | null;
  openTaskId: string | null;
  openTaskStatus: TaskStatus | null;
  ready: boolean;
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
  actorName: string | null;
  createdAt: string;
}

export interface HousekeepingStaffOption {
  membershipId: string;
  name: string;
  role: string;
}

/* ------------------------------------------------------------------ shared */

type RoomRow = {
  id: string;
  room_number: string;
  floor: string | null;
  status: RoomRestriction;
  housekeeping_status: HkStatus;
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

    const [pendingCleaning, pendingInspection] = await Promise.all([
      context.supabase
        .from("housekeeping_tasks")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", data.restaurantId)
        .in("status", ["pending", "assigned", "in_progress"]),
      context.supabase
        .from("hotel_rooms")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", data.restaurantId)
        .eq("active", true)
        .eq("housekeeping_status", "clean"),
    ]);

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
      pendingCleaning: pendingCleaning.count ?? 0,
      pendingInspection: pendingInspection.count ?? 0,
    };
  });

/* ---------------------------------------------------------------- room rack */

export const listRoomRack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RackRoom[]> => {
    const me = await requireHousekeepingAccess(context as never, data.restaurantId);
    const rackScope = housekeepingScope(me.role);

    const { data: rooms, error } = await context.supabase
      .from("hotel_rooms")
      .select(
        "id, room_number, floor, status, housekeeping_status, active, room_type_id, restriction_reason, restriction_expected_return, room_types!inner ( name )",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .order("room_number");
    if (error) throw new Error(error.message);

    const [occupied, names] = await Promise.all([
      occupancyMap(context.supabase, data.restaurantId),
      staffNames(context.supabase, data.restaurantId),
    ]);

    const { data: tasks } = await context.supabase
      .from("housekeeping_tasks")
      .select("id, room_id, status, assigned_membership_id")
      .eq("restaurant_id", data.restaurantId)
      .in("status", ["pending", "assigned", "in_progress"]);
    const openByRoom = new Map(
      (
        (tasks ?? []) as Array<{
          id: string;
          room_id: string;
          status: TaskStatus;
          assigned_membership_id: string | null;
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
      const guestName = rackScope === "supervisor" ? (occupied.get(room.id) ?? null) : null;
      const isOccupied = occupied.has(room.id);
      return {
        id: room.id,
        roomNumber: room.room_number,
        roomTypeId: room.room_type_id,
        roomTypeName: room.room_types?.name ?? "Room type",
        floor: room.floor,
        occupancy: isOccupied ? ("occupied" as const) : ("vacant" as const),
        guestName,
        housekeepingStatus: room.housekeeping_status,
        restriction: room.status,
        restrictionReason: room.restriction_reason,
        restrictionExpectedReturn: room.restriction_expected_return,
        assignedAttendant: task?.assigned_membership_id
          ? (names.get(task.assigned_membership_id)?.name ?? null)
          : null,
        openTaskId: task?.id ?? null,
        openTaskStatus: task?.status ?? null,
        ready: isRoomReady({
          active: room.active,
          status: room.status,
          occupied: isOccupied,
          housekeepingStatus: room.housekeeping_status,
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

    const { data: taskId, error } = await supabaseAdmin.rpc("housekeeping_create_task", {
      _restaurant_id: data.restaurantId,
      _room_id: data.roomId,
      _task_type: data.taskType,
      _priority: data.priority,
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
      .select("id, restaurant_id, room_id, status, assigned_membership_id")
      .eq("id", data.taskId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!task) throw new Error("That task could not be found for this property.");
    if (task.status === "completed" || task.status === "cancelled") {
      throw new Error("That action isn't allowed for this task's current status.");
    }

    const scope = housekeepingScope(me.role);
    if (scope !== "supervisor") {
      if (data.action !== "start") {
        throw new Error("You don't have permission to perform that housekeeping action.");
      }
      if (task.assigned_membership_id !== me.id) {
        throw new Error("You can only work on tasks assigned to you.");
      }
    }

    if (data.action === "assign") {
      if (!data.assigneeMembershipId) throw new Error("Pick a staff member to assign.");
      const { loadMembership } = await import("./workforce.server");
      const assignee = await loadMembership(
        supabaseAdmin,
        data.restaurantId,
        data.assigneeMembershipId,
      );
      if (!assignee.active) throw new Error("That staff member is inactive.");
      if (!(HOUSEKEEPING_ASSIGNABLE_ROLES as readonly string[]).includes(assignee.role)) {
        throw new Error("That staff member can't be assigned housekeeping tasks.");
      }

      if (task.assigned_membership_id === assignee.id && task.status !== "pending") {
        return { id: task.id, status: task.status as TaskStatus };
      }

      const nextStatus: TaskStatus = task.status === "in_progress" ? "in_progress" : "assigned";
      await supabaseAdmin
        .from("housekeeping_tasks")
        .update({ assigned_membership_id: assignee.id, status: nextStatus })
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
        .update({ status: "in_progress", started_at: new Date().toISOString() })
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
    if (housekeepingScope(me.role) !== "supervisor") {
      const { data: owned } = await supabaseAdmin
        .from("housekeeping_tasks")
        .select("id, assigned_membership_id")
        .eq("id", data.taskId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!owned || owned.assigned_membership_id !== me.id) {
        throw new Error("You can only complete tasks assigned to you.");
      }
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
    const me = await requireHousekeepingManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadRoom(supabaseAdmin, data.restaurantId, data.roomId);

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

    const { error } = await supabaseAdmin.rpc("housekeeping_set_room_restriction", {
      _restaurant_id: data.restaurantId,
      _room_id: data.roomId,
      _status: data.status,
      _reason: blankToNull(data.reason) as unknown as string,
      _expected_return: (data.expectedReturn ?? null) as unknown as string,
      _membership_id: me.id,
    });
    if (error) throw housekeepingError(error.message);
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

/* -------------------------------------------------------------- maintenance */

export const listMaintenanceRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<MaintenanceRequest[]> => {
    const me = await requireHousekeepingAccess(context as never, data.restaurantId);
    const { data: rows, error } = await context.supabase
      .from("housekeeping_maintenance_requests")
      .select(
        "id, room_id, category, priority, description, status, created_at, resolved_at, hotel_rooms!inner ( room_number )",
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
    z.object({ restaurantId: idSchema, roomId: idSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<HousekeepingHistoryEntry[]> => {
    await requireHousekeepingManager(context as never, data.restaurantId);

    let query = context.supabase
      .from("housekeeping_history")
      .select(
        "id, room_id, event_type, previous_values, new_values, notes, actor_membership_id, created_at, hotel_rooms ( room_number )",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.roomId) query = query.eq("room_id", data.roomId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const names = await staffNames(context.supabase, data.restaurantId);
    return (
      (rows ?? []) as unknown as Array<{
        id: string;
        room_id: string | null;
        event_type: string;
        previous_values: Record<string, unknown> | null;
        new_values: Record<string, unknown> | null;
        notes: string | null;
        actor_membership_id: string | null;
        created_at: string;
        hotel_rooms: { room_number: string } | null;
      }>
    ).map((r) => ({
      id: r.id,
      roomId: r.room_id,
      roomNumber: r.hotel_rooms?.room_number ?? null,
      eventType: r.event_type,
      previousValues: r.previous_values ? JSON.stringify(r.previous_values) : null,
      newValues: r.new_values ? JSON.stringify(r.new_values) : null,
      notes: r.notes,
      actorName: r.actor_membership_id ? (names.get(r.actor_membership_id)?.name ?? null) : null,
      createdAt: r.created_at,
    }));
  });
