import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireRoomManager } from "./rooms.server";
import type { ServiceCategoryRecord } from "./service-categories-card4.server";
import {
  validateServiceDepartmentAssignmentDraft,
  type AssignmentDepartment,
  type ServiceDepartmentAssignmentRecord,
  type ServiceDepartmentAssignmentSnapshot,
} from "./service-department-assignment-card4.server";
import type { ServiceTypeRecord } from "./service-types-card4.server";

// Generated schema predates 0086.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    serviceTypeId: idSchema,
    departmentId: idSchema,
    active: z.boolean(),
  })
  .strict();

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error(
      "Department assignment is unavailable until its approved migration is applied.",
    );
  }
  throw new Error(error?.message ?? "Unable to load department assignments.");
}

function mapCategory(row: {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}): ServiceCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    active: row.active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapServiceType(row: {
  id: string;
  category_id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}): ServiceTypeRecord {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    code: row.code,
    description: row.description,
    active: row.active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDepartment(row: {
  id: string;
  code: string;
  name: string;
  active: boolean;
}): AssignmentDepartment {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
  };
}

function mapAssignment(row: {
  id: string;
  service_type_id: string;
  department_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}): ServiceDepartmentAssignmentRecord {
  return {
    id: row.id,
    serviceTypeId: row.service_type_id,
    departmentId: row.department_id,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    metadata: { section: "card4-department-assignment", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card4-department-assignment] audit", result.error.message);
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<ServiceDepartmentAssignmentSnapshot> {
  const [categoriesRes, serviceTypesRes, departmentsRes, assignmentsRes] = await Promise.all([
    db
      .from("pms_guest_service_categories")
      .select("id, name, code, description, active, display_order, created_at, updated_at")
      .eq("restaurant_id", restaurantId)
      .order("display_order")
      .order("name"),
    db
      .from("pms_guest_service_types")
      .select(
        "id, category_id, name, code, description, active, display_order, created_at, updated_at",
      )
      .eq("restaurant_id", restaurantId)
      .order("display_order")
      .order("name"),
    db
      .from("pms_departments")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_guest_service_department_assignments")
      .select("id, service_type_id, department_id, active, created_at, updated_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at"),
  ]);

  if (categoriesRes.error) unavailable(categoriesRes.error);
  if (serviceTypesRes.error) unavailable(serviceTypesRes.error);
  if (departmentsRes.error) {
    if (
      departmentsRes.error.code === "42P01" ||
      departmentsRes.error.code === "PGRST204" ||
      departmentsRes.error.code === "PGRST205"
    ) {
      throw new Error("Departments are unavailable until the department catalogue is applied.");
    }
    unavailable(departmentsRes.error);
  }
  if (assignmentsRes.error) unavailable(assignmentsRes.error);

  const categories = (categoriesRes.data ?? []).map(mapCategory);
  const serviceTypes = (serviceTypesRes.data ?? []).map(mapServiceType);
  const departments = (departmentsRes.data ?? []).map(mapDepartment);
  const assignments = (assignmentsRes.data ?? []).map(mapAssignment);
  const lastUpdatedAt = assignments.reduce<string | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  return { categories, serviceTypes, departments, assignments, lastUpdatedAt };
}

export const getPmsCard4ServiceDepartmentAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard4ServiceDepartmentAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const errors = validateServiceDepartmentAssignmentDraft(
      {
        id: data.id ?? null,
        serviceTypeId: data.serviceTypeId,
        departmentId: data.departmentId,
        active: data.active,
      },
      snapshot.assignments,
      snapshot.serviceTypes,
      snapshot.departments,
    );
    if (errors.length > 0) {
      throw new Error(errors[0]?.message ?? "Fix the assignment before saving.");
    }

    const payload = {
      restaurant_id: data.restaurantId,
      service_type_id: data.serviceTypeId,
      department_id: data.departmentId,
      active: data.active,
      updated_by: context.userId,
    };
    const result = data.id
      ? await db
          .from("pms_guest_service_department_assignments")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
          .maybeSingle()
      : await db
          .from("pms_guest_service_department_assignments")
          .insert(payload)
          .select("id")
          .single();
    if (result.error?.code === "23505") {
      throw new Error("This service type is already assigned to this department.");
    }
    if (result.error?.code === "23503") {
      throw new Error("Select a valid service type and department for this property.");
    }
    if (result.error) unavailable(result.error);
    const id = result.data?.id;
    if (!id) throw new Error("Could not save department assignment.");
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_service_department_assignment_saved",
      {
        id,
        serviceTypeId: data.serviceTypeId,
        departmentId: data.departmentId,
      },
    );
    return { ok: true as const, id };
  });

export const setPmsCard4ServiceDepartmentAssignmentActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_department_assignments")
      .update({ active: data.active, updated_by: context.userId })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_service_department_assignment_toggled",
      {
        id: data.id,
        active: data.active,
      },
    );
    return { ok: true as const };
  });

export const deletePmsCard4ServiceDepartmentAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const result = await db
      .from("pms_guest_service_department_assignments")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error?.code === "23503") {
      throw new Error("This assignment cannot be deleted because it is already in use.");
    }
    if (result.error) unavailable(result.error);
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      "pms_card4_service_department_assignment_deleted",
      {
        id: data.id,
      },
    );
    return { ok: true as const };
  });
