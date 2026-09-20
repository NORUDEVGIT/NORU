/**
 * Card 8 Phase 3 — Go-Live governance load/save.
 *
 * Writes only pms_golive_plans/tasks and the existing staff audit log. Live
 * validation and operational snapshots are read-only. No activation writes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callerMembership } from "@/core/lib/workforce.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { withPmsPackage } from "./pms-package.server";
import { persistCard8Overall } from "./card8-readiness.functions";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import {
  CARD8_GOLIVE_PLAN_STATUSES,
  CARD8_GOLIVE_TASK_CATALOGUE,
  CARD8_GOLIVE_TASK_STATUSES,
  card8GoliveReadinessInput,
  card8GoliveReady,
  emptyCard8GolivePlan,
  emptyCard8GoliveTasks,
  type Card8GoliveOwnerOption,
  type Card8GolivePlan,
  type Card8GoliveSnapshot,
  type Card8GoliveTask,
  type Card8GoliveTaskCategory,
  type Card8GoliveTaskStatus,
} from "./pms-property-setup-card8-golive";
import { loadCard8ValidationReport } from "./pms-property-setup-card8-validation.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;
const idSchema = z.string().uuid();
const nullableIdSchema = z.string().uuid().nullable();

const taskSchema = z.object({
  taskKey: z.string().min(1).max(80),
  required: z.boolean(),
  ownerDepartmentId: nullableIdSchema,
  ownerUserId: nullableIdSchema,
  status: z.enum(CARD8_GOLIVE_TASK_STATUSES),
  notes: z.string().max(2000),
});

const saveSchema = z.object({
  restaurantId: idSchema,
  status: z.enum(CARD8_GOLIVE_PLAN_STATUSES),
  businessDateConfirmed: z.boolean(),
  openingStateConfirmed: z.boolean(),
  futureReservationsConfirmed: z.boolean(),
  sandboxAcknowledgement: z.boolean(),
  cutoverLockAcknowledgement: z.boolean(),
  notes: z.string().max(2000),
  tasks: z.array(taskSchema).length(CARD8_GOLIVE_TASK_CATALOGUE.length),
});

function required<T>(
  result: { data?: T; error?: { message?: string } | null },
  fallback: string,
): T {
  if (result.error) throw new Error(result.error.message ?? fallback);
  return result.data as T;
}

function mapPlan(row: any | null): Card8GolivePlan {
  if (!row) return emptyCard8GolivePlan();
  return {
    id: String(row.id),
    status: CARD8_GOLIVE_PLAN_STATUSES.includes(row.status as never)
      ? (row.status as Card8GolivePlan["status"])
      : "draft",
    businessDateConfirmed: row.business_date_confirmed === true,
    openingStateConfirmed: row.opening_state_confirmed === true,
    futureReservationsConfirmed: row.future_reservations_confirmed === true,
    sandboxAcknowledgement: row.sandbox_acknowledgement === true,
    cutoverLockAcknowledgement: row.cutover_lock_acknowledgement === true,
    notes: String(row.notes ?? ""),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function mapTasks(rows: any[]): Card8GoliveTask[] {
  const byKey = new Map(rows.map((row) => [String(row.task_key), row]));
  return emptyCard8GoliveTasks().map((fallback) => {
    const row = byKey.get(fallback.taskKey);
    if (!row) return fallback;
    return {
      ...fallback,
      id: String(row.id),
      required: row.required !== false,
      ownerDepartmentId: row.owner_department_id == null ? null : String(row.owner_department_id),
      ownerUserId: row.owner_user_id == null ? null : String(row.owner_user_id),
      status: CARD8_GOLIVE_TASK_STATUSES.includes(row.status as never)
        ? (row.status as Card8GoliveTaskStatus)
        : "not_started",
      notes: String(row.notes ?? ""),
      sortOrder: Number(row.sort_order ?? fallback.sortOrder),
    };
  });
}

async function ownerOptions(
  db: DbClient,
  restaurantId: string,
): Promise<{
  departments: Card8GoliveOwnerOption[];
  users: Card8GoliveOwnerOption[];
}> {
  const [departmentResult, membershipResult] = await Promise.all([
    db
      .from("pms_departments")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name"),
    db
      .from("restaurant_users")
      .select("user_id, role")
      .eq("restaurant_id", restaurantId)
      .eq("active", true),
  ]);
  const departments = required<any[]>(departmentResult, "Could not load departments.").map(
    (row) => ({ id: String(row.id), label: String(row.name) }),
  );
  const memberships = required<any[]>(membershipResult, "Could not load team members.");
  const userIds = memberships.map((row) => String(row.user_id));
  const profilesResult =
    userIds.length === 0
      ? { data: [], error: null }
      : await db.from("profiles").select("id, first_name, last_name, email").in("id", userIds);
  const profiles = required<any[]>(profilesResult, "Could not load team member names.");
  const byUser = new Map(
    profiles.map((row) => {
      const name =
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        String(row.email ?? "Team member");
      return [String(row.id), name];
    }),
  );
  return {
    departments,
    users: memberships.map((row) => ({
      id: String(row.user_id),
      label: `${byUser.get(String(row.user_id)) ?? "Team member"} · ${String(row.role)}`,
    })),
  };
}

export async function loadCard8GoliveSnapshot(
  db: DbClient,
  restaurantId: string,
  canEdit: boolean,
): Promise<Card8GoliveSnapshot> {
  const propertyResult = await db
    .from("restaurants")
    .select("business_date")
    .eq("id", restaurantId)
    .maybeSingle();
  const property = required<any | null>(
    propertyResult,
    "Could not load the property business date.",
  );
  const businessDate = property?.business_date ? String(property.business_date) : null;
  const today = businessDate ?? new Date().toISOString().slice(0, 10);

  const [planResult, tasksResult, roomsResult, occupiedResult, upcomingResult, owners] =
    await Promise.all([
      db
        .from("pms_golive_plans")
        .select(
          "id, status, business_date_confirmed, opening_state_confirmed, future_reservations_confirmed, sandbox_acknowledgement, cutover_lock_acknowledgement, notes, updated_at",
        )
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
      db
        .from("pms_golive_tasks")
        .select(
          "id, category, task_key, title, required, owner_department_id, owner_user_id, status, notes, sort_order",
        )
        .eq("restaurant_id", restaurantId)
        .order("sort_order"),
      db
        .from("hotel_rooms")
        .select("id, status, housekeeping_status")
        .eq("restaurant_id", restaurantId)
        .eq("active", true),
      db
        .from("hotel_reservations")
        .select("room_id")
        .eq("restaurant_id", restaurantId)
        .eq("status", "checked_in")
        .not("room_id", "is", null),
      db
        .from("hotel_reservations")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .in("status", ["pending", "confirmed"])
        .gt("arrival_date", today),
      ownerOptions(db, restaurantId),
    ]);

  const rooms = required<any[]>(roomsResult, "Could not load rooms.");
  const occupiedRows = required<any[]>(occupiedResult, "Could not load occupied rooms.");
  if (upcomingResult.error) {
    throw new Error(upcomingResult.error.message ?? "Could not load future reservations.");
  }
  const occupiedRoomIds = new Set(occupiedRows.map((row) => String(row.room_id)));

  return {
    plan: mapPlan(required<any | null>(planResult, "Could not load the Go-Live plan.")),
    tasks: mapTasks(required<any[]>(tasksResult, "Could not load the Go-Live tasks.")),
    departments: owners.departments,
    users: owners.users,
    businessDate,
    opening: {
      totalRooms: rooms.length,
      occupied: rooms.filter((room) => occupiedRoomIds.has(String(room.id))).length,
      vacant: rooms.filter((room) => !occupiedRoomIds.has(String(room.id))).length,
      available: rooms.filter((room) => room.status === "available").length,
      dirty: rooms.filter((room) => room.housekeeping_status === "dirty").length,
      outOfOrder: rooms.filter((room) => room.status === "out_of_order").length,
      outOfService: rooms.filter((room) => room.status === "out_of_service").length,
    },
    futureReservations: Number(upcomingResult.count ?? 0),
    canEdit,
  };
}

async function writeAudit(
  db: DbClient,
  restaurantId: string,
  userId: string,
  metadata: Record<string, unknown>,
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action: "pms_card8_golive_updated",
    metadata: { section: "go-live", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card8-golive] audit", result.error.message);
}

export const getCard8Golive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return {
      snapshot: await loadCard8GoliveSnapshot(
        supabaseAdmin as DbClient,
        data.restaurantId,
        canEditSet1(me.role),
      ),
    };
  });

export const saveCard8Golive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const before = await loadCard8GoliveSnapshot(db, data.restaurantId, true);

    const catalogue = new Map<string, (typeof CARD8_GOLIVE_TASK_CATALOGUE)[number]>(
      CARD8_GOLIVE_TASK_CATALOGUE.map((task) => [task.code, task]),
    );
    if (
      new Set(data.tasks.map((task) => task.taskKey)).size !== CARD8_GOLIVE_TASK_CATALOGUE.length
    ) {
      throw new Error("The Go-Live checklist must contain each catalogue task exactly once.");
    }
    const draftTasks = data.tasks.map((task, index): Card8GoliveTask => {
      const definition = catalogue.get(task.taskKey);
      if (!definition) throw new Error("The Go-Live checklist contains an unknown task.");
      return {
        id: null,
        category: definition.category as Card8GoliveTaskCategory,
        taskKey: definition.code,
        title: definition.title,
        required: task.required,
        ownerDepartmentId: task.ownerDepartmentId,
        ownerUserId: task.ownerUserId,
        status: task.status,
        notes: task.notes.trim(),
        sortOrder: index,
      };
    });
    const draftPlan: Card8GolivePlan = {
      ...before.plan,
      status: data.status,
      businessDateConfirmed: data.businessDateConfirmed,
      openingStateConfirmed: data.openingStateConfirmed,
      futureReservationsConfirmed: data.futureReservationsConfirmed,
      sandboxAcknowledgement: data.sandboxAcknowledgement,
      cutoverLockAcknowledgement: data.cutoverLockAcknowledgement,
      notes: data.notes.trim(),
    };
    const validation = await loadCard8ValidationReport(db, data.restaurantId, context.userId);
    const readinessInput = card8GoliveReadinessInput(
      draftPlan,
      draftTasks,
      validation.counts.critical,
    );
    const ready = card8GoliveReady(readinessInput);
    const status = ready ? "ready" : data.status === "draft" ? "draft" : "preparing";

    const planResult = await db
      .from("pms_golive_plans")
      .upsert(
        {
          restaurant_id: data.restaurantId,
          status,
          business_date_confirmed: data.businessDateConfirmed,
          opening_state_confirmed: data.openingStateConfirmed,
          future_reservations_confirmed: data.futureReservationsConfirmed,
          sandbox_acknowledgement: data.sandboxAcknowledgement,
          cutover_lock_acknowledgement: data.cutoverLockAcknowledgement,
          notes: data.notes.trim() || null,
        },
        { onConflict: "restaurant_id" },
      )
      .select("id")
      .single();
    const plan = required<{ id: string }>(planResult, "Could not save the Go-Live plan.");

    const taskResult = await db.from("pms_golive_tasks").upsert(
      draftTasks.map((task) => ({
        restaurant_id: data.restaurantId,
        golive_plan_id: plan.id,
        category: task.category,
        task_key: task.taskKey,
        title: task.title,
        required: task.required,
        owner_department_id: task.ownerDepartmentId,
        owner_user_id: task.ownerUserId,
        status: task.status,
        notes: task.notes || null,
        sort_order: task.sortOrder,
      })),
      { onConflict: "restaurant_id,task_key" },
    );
    required(taskResult, "Could not save the Go-Live checklist.");

    await writeAudit(db, data.restaurantId, context.userId, {
      before: {
        status: before.plan.status,
        confirmations: {
          businessDate: before.plan.businessDateConfirmed,
          openingState: before.plan.openingStateConfirmed,
          futureReservations: before.plan.futureReservationsConfirmed,
          sandbox: before.plan.sandboxAcknowledgement,
          cutoverLock: before.plan.cutoverLockAcknowledgement,
        },
      },
      after: {
        status,
        ready,
        validationCritical: validation.counts.critical,
        incompleteRequiredTasks: readinessInput.incompleteRequiredTasks,
      },
    });

    await persistCard8Overall(db, data.restaurantId, context.userId, me.role);
    return {
      snapshot: await loadCard8GoliveSnapshot(db, data.restaurantId, true),
    };
  });
