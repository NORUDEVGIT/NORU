/**
 * Card 5 Phase 1 — Departments load/save.
 * Writes pms_departments and pms_department_routing_rules only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { callerMembership } from "@/core/lib/workforce.server";
import { SELECTABLE_STAFF_ROLES, STAFF_ROLES } from "@/core/lib/module-access";
import { withPmsPackage } from "./pms-package.server";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import { persistCard5Overall } from "./card5-readiness.functions";
import {
  CARD5_DEPARTMENT_AUDIT,
  CARD5_DEPARTMENT_AUDIT_SECTION,
  CARD5_DEPARTMENT_TYPES,
  CARD5_DEPARTMENTS_UNAVAILABLE,
  CARD5_NOTIFICATION_CHANNELS,
  CARD5_PRIORITIES,
  CARD5_ROUTING_AUDIT,
  emptyOperatingHours,
  evaluateCard5DepartmentsReadiness,
  parseDepartmentType,
  parseNotificationChannel,
  parseOperatingHours,
  parsePriority,
  parseStaffRole,
  serializeOperatingHours,
  wouldCreateCycle,
  type Card5Department,
  type Card5DepartmentsSnapshot,
  type Card5OperatingHours,
  type Card5RoutingRule,
  type Card5StaffOption,
} from "./departments-card5.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;
const idSchema = z.string().uuid();
const roleEnum = z.enum(STAFF_ROLES as unknown as [string, ...string[]]);

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(CARD5_DEPARTMENTS_UNAVAILABLE);
  throw new Error(error?.message ?? CARD5_DEPARTMENTS_UNAVAILABLE);
}

async function writeAudit(
  db: DbClient,
  restaurantId: string,
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action,
    metadata: { section: CARD5_DEPARTMENT_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card5-departments] audit", result.error.message);
}

function mapDepartment(row: Record<string, unknown>): Card5Department {
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    parentId: row.parent_id == null ? null : String(row.parent_id),
    departmentType: parseDepartmentType(row.department_type),
    managerUserId: row.manager_user_id == null ? null : String(row.manager_user_id),
    responsibleRole: parseStaffRole(row.responsible_role),
    costCenter: String(row.cost_center ?? ""),
    revenueCenter: String(row.revenue_center ?? ""),
    operatingHours: parseOperatingHours(row.operating_hours),
    defaultLanguage: String(row.default_language ?? ""),
    defaultNotificationChannel: parseNotificationChannel(row.default_notification_channel),
    defaultPriority: parsePriority(row.default_priority),
    defaultSlaMinutes:
      row.default_sla_minutes == null || row.default_sla_minutes === ""
        ? null
        : Number(row.default_sla_minutes),
    escalationManagerUserId:
      row.escalation_manager_user_id == null ? null : String(row.escalation_manager_user_id),
    active: row.active !== false,
  };
}

function mapRouting(row: Record<string, unknown>): Card5RoutingRule | null {
  const defaultRole = parseStaffRole(row.default_role);
  if (!defaultRole) return null;
  return {
    id: String(row.id),
    serviceKey: String(row.service_key ?? ""),
    departmentId: String(row.department_id),
    defaultRole,
    description: String(row.description ?? ""),
    active: row.active !== false,
  };
}

export async function loadCard5DepartmentsSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<Card5DepartmentsSnapshot> {
  const departmentsRes = await db
    .from("pms_departments")
    .select(
      "id, code, name, active, description, parent_id, department_type, manager_user_id, responsible_role, cost_center, revenue_center, operating_hours, default_language, default_notification_channel, default_priority, default_sla_minutes, escalation_manager_user_id",
    )
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (departmentsRes.error) unavailable(departmentsRes.error);

  const routingRes = await db
    .from("pms_department_routing_rules")
    .select("id, service_key, department_id, default_role, description, active")
    .eq("restaurant_id", restaurantId)
    .order("service_key");
  if (routingRes.error) unavailable(routingRes.error);

  const staffRes = await db
    .from("restaurant_users")
    .select("user_id, role, active")
    .eq("restaurant_id", restaurantId)
    .order("role");
  if (staffRes.error) throw new Error(staffRes.error.message);
  const staffRows = (staffRes.data ?? []) as Array<{
    user_id: string;
    role: string;
    active: boolean;
  }>;
  const userIds = staffRows.map((row) => row.user_id);
  const profilesRes =
    userIds.length === 0
      ? { data: [], error: null }
      : await db.from("profiles").select("id, first_name, last_name, email").in("id", userIds);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  const names = new Map(
    (
      (profilesRes.data ?? []) as Array<{
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
      }>
    ).map((row) => {
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
      return [row.id, name || row.email || "Staff member"] as const;
    }),
  );

  const staff: Card5StaffOption[] = staffRows.map((row) => ({
    userId: row.user_id,
    name: names.get(row.user_id) ?? "Staff member",
    role: row.role,
    active: row.active !== false,
  }));

  return {
    departments: ((departmentsRes.data ?? []) as Record<string, unknown>[]).map(mapDepartment),
    routing: ((routingRes.data ?? []) as Record<string, unknown>[])
      .map(mapRouting)
      .filter((row): row is Card5RoutingRule => row !== null),
    staff,
  };
}

const hoursWindowSchema = z
  .object({
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .nullable();

const hoursSchema = z.object({
  is24Hours: z.boolean(),
  daily: hoursWindowSchema,
  weekend: hoursWindowSchema,
  holiday: hoursWindowSchema,
  holidayNotes: z.string().max(200).optional(),
});

const departmentSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  parentId: idSchema.nullable().optional(),
  departmentType: z.enum(CARD5_DEPARTMENT_TYPES),
  managerUserId: idSchema.nullable().optional(),
  responsibleRole: roleEnum.nullable().optional(),
  costCenter: z.string().trim().max(40).optional(),
  revenueCenter: z.string().trim().max(40).optional(),
  operatingHours: hoursSchema,
  defaultLanguage: z
    .string()
    .trim()
    .max(8)
    .optional()
    .transform((value) => (value ? value.toLowerCase() : "")),
  defaultNotificationChannel: z.enum(CARD5_NOTIFICATION_CHANNELS).nullable().optional(),
  defaultPriority: z.enum(CARD5_PRIORITIES).nullable().optional(),
  defaultSlaMinutes: z.number().int().min(1).nullable().optional(),
  escalationManagerUserId: idSchema.nullable().optional(),
  active: z.boolean(),
});

const routingSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  serviceKey: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a lowercase service key such as room_cleaning."),
  departmentId: idSchema,
  defaultRole: z.enum(SELECTABLE_STAFF_ROLES as unknown as [string, ...string[]]),
  description: z.string().trim().max(200).optional(),
  active: z.boolean(),
});

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function assertKnownStaff(
  staff: Card5StaffOption[],
  userId: string | null | undefined,
  label: string,
) {
  if (!userId) return;
  if (!staff.some((row) => row.userId === userId && row.active)) {
    throw new Error(`${label} must be an active staff member of this property.`);
  }
}

export const getCard5Departments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard5DepartmentsSnapshot(pmsDb(supabaseAdmin), data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCard5DepartmentsReadiness(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

export const saveCard5Department = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => departmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard5DepartmentsSnapshot(db, data.restaurantId);
    const hours: Card5OperatingHours = emptyOperatingHours({
      is24Hours: data.operatingHours.is24Hours,
      daily: data.operatingHours.daily,
      weekend: data.operatingHours.weekend,
      holiday: data.operatingHours.holiday,
      holidayNotes: data.operatingHours.holidayNotes ?? "",
    });
    const parentId = data.parentId ?? null;
    if (parentId) {
      if (data.id && parentId === data.id)
        throw new Error("A department cannot be its own parent.");
      const parent = before.departments.find((row) => row.id === parentId);
      if (!parent) throw new Error("Parent department must belong to this property.");
      if (wouldCreateCycle(before.departments, data.id ?? null, parentId)) {
        throw new Error("That parent would create a department cycle.");
      }
    }
    assertKnownStaff(before.staff, data.managerUserId, "Department manager");
    assertKnownStaff(before.staff, data.escalationManagerUserId, "Escalation manager");
    const language =
      data.defaultLanguage && /^[a-z]{2,8}$/.test(data.defaultLanguage)
        ? data.defaultLanguage
        : null;
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      active: data.active,
      description: blankToNull(data.description),
      parent_id: parentId,
      department_type: data.departmentType,
      manager_user_id: data.managerUserId ?? null,
      responsible_role: data.responsibleRole ?? null,
      cost_center: blankToNull(data.costCenter),
      revenue_center: blankToNull(data.revenueCenter),
      operating_hours: serializeOperatingHours(hours) as unknown as Json,
      default_language: language,
      default_notification_channel: data.defaultNotificationChannel ?? null,
      default_priority: data.defaultPriority ?? null,
      default_sla_minutes: data.defaultSlaMinutes ?? null,
      escalation_manager_user_id: data.escalationManagerUserId ?? null,
    };
    const result = data.id
      ? await db
          .from("pms_departments")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_departments").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That department code is already used.");
      unavailable(result.error);
    }
    const after = await loadCard5DepartmentsSnapshot(db, data.restaurantId);
    await persistCard5Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD5_DEPARTMENT_AUDIT, {
      before: before.departments,
      after: after.departments,
    });
    return {
      ok: true as const,
      snapshot: after,
      readiness: evaluateCard5DepartmentsReadiness(after),
    };
  });

export const saveCard5DepartmentRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => routingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard5DepartmentsSnapshot(db, data.restaurantId);
    if (!before.departments.some((row) => row.id === data.departmentId)) {
      throw new Error("Routing must point at a department in this property.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      service_key: data.serviceKey,
      department_id: data.departmentId,
      default_role: data.defaultRole,
      description: blankToNull(data.description),
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_department_routing_rules")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_department_routing_rules").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That service key is already routed.");
      unavailable(result.error);
    }
    const after = await loadCard5DepartmentsSnapshot(db, data.restaurantId);
    await persistCard5Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD5_ROUTING_AUDIT, {
      before: before.routing,
      after: after.routing,
    });
    return {
      ok: true as const,
      snapshot: after,
      readiness: evaluateCard5DepartmentsReadiness(after),
    };
  });
