/**
 * Card 7 Phase 1 — Security & Roles load/save.
 * Writes hotel roles, mappings, approval rules, and restaurant_users.hotel_role_id.
 * Does not write restaurant_users.role, staff_module_access, or RLS helpers.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import { persistCard7Overall } from "./card7-readiness.functions";
import {
  CARD7_APPROVAL_AUDIT,
  CARD7_ASSIGNMENT_AUDIT,
  CARD7_DATA_SCOPES,
  CARD7_MAPPING_AUDIT,
  CARD7_SECURITY_AUDIT,
  CARD7_SECURITY_AUDIT_SECTION,
  CARD7_SECURITY_UNAVAILABLE,
  CARD7_THRESHOLD_UNITS,
  evaluateCard7SecurityReadiness,
  parseDataScope,
  parsePermissionAction,
  parseThresholdUnit,
  type Card7ApprovalRule,
  type Card7DepartmentOption,
  type Card7HotelRole,
  type Card7Membership,
  type Card7Permission,
  type Card7RolePermission,
  type Card7SecuritySnapshot,
} from "./security-roles-card7.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;
const idSchema = z.string().uuid();

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(CARD7_SECURITY_UNAVAILABLE);
  throw new Error(error?.message ?? CARD7_SECURITY_UNAVAILABLE);
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
    metadata: { section: CARD7_SECURITY_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card7-security] audit", result.error.message);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function mapRole(row: Record<string, unknown>): Card7HotelRole {
  const data = row as any;
  return {
    id: String(data.id),
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    departmentId: data.department_id == null ? null : String(data.department_id),
    active: data.active !== false,
  };
}

function mapPermission(row: Record<string, unknown>): Card7Permission {
  const data = row as any;
  return {
    id: String(data.id),
    code: String(data.code ?? ""),
    module: String(data.module ?? ""),
    functionKey: String(data.function ?? ""),
    action: parsePermissionAction(data.action),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    sensitive: data.sensitive === true,
    active: data.active !== false,
  };
}

function mapMapping(row: Record<string, unknown>): Card7RolePermission {
  const data = row as any;
  return {
    id: String(data.id),
    roleId: String(data.role_id),
    permissionId: String(data.permission_id),
    allowed: data.allowed !== false,
    dataScope: parseDataScope(data.data_scope),
  };
}

function mapApproval(row: Record<string, unknown>): Card7ApprovalRule {
  const data = row as any;
  const amount = data.threshold_amount;
  return {
    id: String(data.id),
    permissionId: String(data.permission_id),
    approverRoleId: String(data.approver_role_id),
    thresholdAmount: amount == null || amount === "" ? null : Number(amount),
    thresholdUnit: parseThresholdUnit(data.threshold_unit),
    active: data.active !== false,
  };
}

export async function loadCard7SecuritySnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<Card7SecuritySnapshot> {
  const permissionsRes = await db
    .from("pms_permissions")
    .select("id, code, module, function, action, name, description, sensitive, active")
    .order("module")
    .order("function")
    .order("action");
  if (permissionsRes.error) unavailable(permissionsRes.error);

  const rolesRes = await db
    .from("pms_hotel_roles")
    .select("id, code, name, description, department_id, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (rolesRes.error) unavailable(rolesRes.error);

  const mappingsRes = await db
    .from("pms_role_permissions")
    .select("id, role_id, permission_id, allowed, data_scope")
    .eq("restaurant_id", restaurantId);
  if (mappingsRes.error) unavailable(mappingsRes.error);

  const approvalsRes = await db
    .from("pms_approval_rules")
    .select("id, permission_id, approver_role_id, threshold_amount, threshold_unit, active")
    .eq("restaurant_id", restaurantId)
    .order("created_at");
  if (approvalsRes.error) unavailable(approvalsRes.error);

  const departmentsRes = await db
    .from("pms_departments")
    .select("id, name, code, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (departmentsRes.error) unavailable(departmentsRes.error);

  const staffRes = await db
    .from("restaurant_users")
    .select("id, user_id, role, active, hotel_role_id")
    .eq("restaurant_id", restaurantId)
    .order("role");
  if (staffRes.error) unavailable(staffRes.error);

  const staffRows = (staffRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    role: string;
    active: boolean;
    hotel_role_id: string | null;
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

  const memberships: Card7Membership[] = staffRows.map((row) => ({
    membershipId: row.id,
    userId: row.user_id,
    name: names.get(row.user_id) ?? "Staff member",
    staffRole: row.role,
    hotelRoleId: row.hotel_role_id ?? null,
    active: row.active !== false,
  }));

  const departments: Card7DepartmentOption[] = (
    (departmentsRes.data ?? []) as Record<string, unknown>[]
  ).map((row) => {
    const data = row as any;
    return {
      id: String(data.id),
      name: String(data.name ?? ""),
      code: String(data.code ?? ""),
      active: data.active !== false,
    };
  });

  return {
    roles: ((rolesRes.data ?? []) as Record<string, unknown>[]).map(mapRole),
    permissions: ((permissionsRes.data ?? []) as Record<string, unknown>[]).map(mapPermission),
    mappings: ((mappingsRes.data ?? []) as Record<string, unknown>[]).map(mapMapping),
    approvalRules: ((approvalsRes.data ?? []) as Record<string, unknown>[]).map(mapApproval),
    departments,
    memberships,
  };
}

function assertDepartment(departments: Card7DepartmentOption[], departmentId: string | null) {
  if (!departmentId) return;
  if (!departments.some((row) => row.id === departmentId)) {
    throw new Error("Department must be a Card 5 department on this property.");
  }
}

const roleSchema = z.object({
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
  departmentId: idSchema.nullable().optional(),
  active: z.boolean(),
});

const mappingsSchema = z.object({
  restaurantId: idSchema,
  roleId: idSchema,
  mappings: z.array(
    z.object({
      permissionId: idSchema,
      allowed: z.boolean(),
      dataScope: z.enum(CARD7_DATA_SCOPES),
    }),
  ),
});

const approvalSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  permissionId: idSchema,
  approverRoleId: idSchema,
  thresholdAmount: z.number().positive().nullable().optional(),
  thresholdUnit: z.enum(CARD7_THRESHOLD_UNITS).nullable().optional(),
  active: z.boolean(),
});

const assignmentSchema = z.object({
  restaurantId: idSchema,
  membershipId: idSchema,
  hotelRoleId: idSchema.nullable(),
});

export const getCard7SecurityRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard7SecuritySnapshot(pmsDb(supabaseAdmin), data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCard7SecurityReadiness(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

export const saveCard7HotelRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7SecuritySnapshot(db, data.restaurantId);
    const departmentId = data.departmentId ?? null;
    assertDepartment(before.departments, departmentId);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: blankToNull(data.description),
      department_id: departmentId,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_hotel_roles")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_hotel_roles").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That hotel role code is already used.");
      unavailable(result.error);
    }
    const after = await loadCard7SecuritySnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_SECURITY_AUDIT, {
      before: before.roles,
      after: after.roles,
    });
    return {
      ok: true as const,
      snapshot: after,
      readiness: evaluateCard7SecurityReadiness(after),
    };
  });

export const saveCard7RolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mappingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7SecuritySnapshot(db, data.restaurantId);
    const role = before.roles.find((row) => row.id === data.roleId);
    if (!role) throw new Error("Hotel role is not on this property.");
    const permissionIds = new Set(before.permissions.map((row) => row.id));
    for (const row of data.mappings) {
      if (!permissionIds.has(row.permissionId)) {
        throw new Error("Mappings must use the global permission catalogue.");
      }
      if (row.dataScope === "department" && row.allowed && !role.departmentId) {
        throw new Error("Department scope requires a department on this hotel role.");
      }
    }
    const removed = await db
      .from("pms_role_permissions")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("role_id", data.roleId);
    if (removed.error) unavailable(removed.error);
    if (data.mappings.length > 0) {
      const inserted = await db.from("pms_role_permissions").insert(
        data.mappings.map((row) => ({
          restaurant_id: data.restaurantId,
          role_id: data.roleId,
          permission_id: row.permissionId,
          allowed: row.allowed,
          data_scope: row.dataScope,
        })),
      );
      if (inserted.error) unavailable(inserted.error);
    }
    const after = await loadCard7SecuritySnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_MAPPING_AUDIT, {
      roleId: data.roleId,
      before: before.mappings,
      after: after.mappings,
    });
    return {
      ok: true as const,
      snapshot: after,
      readiness: evaluateCard7SecurityReadiness(after),
    };
  });

export const saveCard7ApprovalRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => approvalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7SecuritySnapshot(db, data.restaurantId);
    if (!before.permissions.some((row) => row.id === data.permissionId)) {
      throw new Error("Approval rules must target a catalogue permission.");
    }
    if (!before.roles.some((row) => row.id === data.approverRoleId)) {
      throw new Error("Approver must be a hotel role on this property.");
    }
    const amount = data.thresholdAmount ?? null;
    const unit = data.thresholdUnit ?? null;
    if ((amount == null) !== (unit == null)) {
      throw new Error("Set both a threshold amount and unit, or neither.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      permission_id: data.permissionId,
      approver_role_id: data.approverRoleId,
      threshold_amount: amount,
      threshold_unit: unit,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_approval_rules")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_approval_rules").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") {
        throw new Error("That permission already has an approval rule.");
      }
      unavailable(result.error);
    }
    const after = await loadCard7SecuritySnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_APPROVAL_AUDIT, {
      before: before.approvalRules,
      after: after.approvalRules,
    });
    return {
      ok: true as const,
      snapshot: after,
      readiness: evaluateCard7SecurityReadiness(after),
    };
  });

export const saveCard7MembershipHotelRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assignmentSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7SecuritySnapshot(db, data.restaurantId);
    const membership = before.memberships.find((row) => row.membershipId === data.membershipId);
    if (!membership) throw new Error("Membership is not on this property.");
    if (data.hotelRoleId && !before.roles.some((row) => row.id === data.hotelRoleId && row.active)) {
      throw new Error("Assign an active hotel role, or clear the assignment.");
    }
    const result = await db
      .from("restaurant_users")
      .update({ hotel_role_id: data.hotelRoleId })
      .eq("id", data.membershipId)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    const after = await loadCard7SecuritySnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_ASSIGNMENT_AUDIT, {
      membershipId: data.membershipId,
      before: membership.hotelRoleId,
      after: data.hotelRoleId,
      staffRoleUnchanged: membership.staffRole,
    });
    return {
      ok: true as const,
      snapshot: after,
      readiness: evaluateCard7SecurityReadiness(after),
    };
  });
