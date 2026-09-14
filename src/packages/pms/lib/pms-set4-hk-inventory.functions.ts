/**
 * PMS-SET4 — load / save HK status, cleaning posture, OOO/OOS, catalogues, SLA.
 *
 * 0050 tables are optional at runtime: missing relations never crash the hub.
 * Audit insert failure does not roll back the save.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import type { Json } from "@/integrations/supabase/types";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  SET4_AUDIT_CATEGORY,
  SET4_AUDIT_HK_CLEANING,
  SET4_AUDIT_HK_STATUS,
  SET4_AUDIT_OOO_OOS,
  SET4_AUDIT_PRIORITY,
  SET4_AUDIT_REASON,
  SET4_AUDIT_SLA,
  SET4_AUDIT_TYPE_TAG,
  activateInputFromSet4Snapshot,
  emptyHkCleaningPosture,
  emptyHkStatusRules,
  emptyMaintenanceSla,
  emptyOooOosPosture,
  emptySet4Snapshot,
  hkStatusSaveBlocked,
  oooOosSaveBlocked,
  parseHkCleaningPosture,
  parseHkStatusRules,
  parseMaintenanceSla,
  parseOooOosPosture,
  type HkCleaningPosture,
  type HkStatusRules,
  type MaintenanceSla,
  type OooOosPosture,
  type PmsSet4CatalogueItem,
  type Set4Snapshot,
} from "./pms-set4-hk-inventory";

const idSchema = z.string().uuid();
const SET4_UNAVAILABLE_RULES = "Those housekeeping rules are unavailable until migration 0050 is applied.";
const SET4_UNAVAILABLE_RI = "Room inventory rules are unavailable until migration 0050 is applied.";
const SET4_UNAVAILABLE_CATALOGUE = "Those catalogues are unavailable until migration 0050 is applied.";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function writeAudit(
  supabaseAdmin: Admin,
  params: {
    restaurantId: string;
    actorUserId: string;
    action: string;
    before: unknown;
    after: unknown;
    section?: string;
  },
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("restaurant_staff_audit_log").insert({
    restaurant_id: params.restaurantId,
    actor_user_id: params.actorUserId,
    target_user_id: params.actorUserId,
    action: params.action,
    metadata: {
      section: params.section ?? null,
      before: params.before as Json,
      after: params.after as Json,
      when: new Date().toISOString(),
    },
  });
  if (error) {
    console.error("[pms-set4] audit", error.message);
    return false;
  }
  return true;
}

function mapCatalogue(row: { id: string; code: string; name: string; active: boolean }): PmsSet4CatalogueItem {
  return { id: row.id, code: row.code, name: row.name, active: row.active };
}

async function loadCatalogue(
  supabaseAdmin: Admin,
  table:
    | "pms_restriction_reasons"
    | "pms_maintenance_categories"
    | "pms_maintenance_priorities"
    | "pms_maintenance_type_tags",
  restaurantId: string,
): Promise<{ available: boolean; rows: PmsSet4CatalogueItem[] }> {
  const result = await supabaseAdmin
    .from(table)
    .select("id, code, name, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (result.error && isMissingSchemaError(result.error)) return { available: false, rows: [] };
  if (result.error) throw new Error(result.error.message);
  return { available: true, rows: ((result.data ?? []) as PmsSet4CatalogueItem[]).map(mapCatalogue) };
}

export async function loadSet4Snapshot(supabaseAdmin: Admin, restaurantId: string): Promise<Set4Snapshot> {
  const snapshot = emptySet4Snapshot();

  const rulesRes = await supabaseAdmin
    .from("restaurants")
    .select("pms_hk_status_rules, pms_hk_cleaning_posture, pms_ooo_oos_posture, pms_maintenance_sla")
    .eq("id", restaurantId)
    .maybeSingle();
  if (rulesRes.error && isMissingSchemaError(rulesRes.error)) {
    snapshot.hkColumnsAvailable = false;
    snapshot.oooOosAvailable = false;
    snapshot.statusRules = emptyHkStatusRules();
    snapshot.cleaningPosture = emptyHkCleaningPosture();
    snapshot.oooOosPosture = emptyOooOosPosture();
    snapshot.maintenanceSla = emptyMaintenanceSla();
  } else if (rulesRes.error) {
    throw new Error(rulesRes.error.message);
  } else {
    snapshot.hkColumnsAvailable = true;
    snapshot.oooOosAvailable = true;
    snapshot.statusRules = parseHkStatusRules(rulesRes.data?.pms_hk_status_rules);
    snapshot.cleaningPosture = parseHkCleaningPosture(rulesRes.data?.pms_hk_cleaning_posture);
    snapshot.oooOosPosture = parseOooOosPosture(rulesRes.data?.pms_ooo_oos_posture);
    snapshot.maintenanceSla = parseMaintenanceSla(rulesRes.data?.pms_maintenance_sla);
  }

  const [reasons, categories, priorities, tags] = await Promise.all([
    loadCatalogue(supabaseAdmin, "pms_restriction_reasons", restaurantId),
    loadCatalogue(supabaseAdmin, "pms_maintenance_categories", restaurantId),
    loadCatalogue(supabaseAdmin, "pms_maintenance_priorities", restaurantId),
    loadCatalogue(supabaseAdmin, "pms_maintenance_type_tags", restaurantId),
  ]);
  snapshot.cataloguesAvailable = reasons.available && categories.available && priorities.available && tags.available;
  snapshot.restrictionReasons = reasons.rows;
  snapshot.maintenanceCategories = categories.rows;
  snapshot.maintenancePriorities = priorities.rows;
  snapshot.maintenanceTypeTags = tags.rows;

  return snapshot;
}

export async function loadSet4CreateCatalogues(
  supabaseAdmin: Admin,
  restaurantId: string,
): Promise<Set4Snapshot> {
  return loadSet4Snapshot(supabaseAdmin, restaurantId);
}

export const getPmsSet4Snapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    return {
      snapshot,
      activate: activateInputFromSet4Snapshot(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

const statusRulesSchema = z.object({
  restaurantId: idSchema,
  statuses: z.array(
    z.object({
      code: z.enum(["dirty", "clean", "inspected", "pickup"]),
      label: z.string().trim().min(1).max(40),
      active: z.boolean(),
    }),
  ),
});

export const savePmsHkStatusRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => statusRulesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const rules: HkStatusRules = {
      statuses: data.statuses,
      savedAt: new Date().toISOString(),
    };
    const blocked = hkStatusSaveBlocked(rules);
    if (blocked) throw new Error(blocked);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.hkColumnsAvailable) throw new Error(SET4_UNAVAILABLE_RULES);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_hk_status_rules: rules as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET4_UNAVAILABLE_RULES);
      throw new Error(error.message);
    }
    const after = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET4_AUDIT_HK_STATUS,
      section: "housekeeping-rules",
      before: before.statusRules,
      after: after.statusRules,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const cleaningSchema = z.object({
  restaurantId: idSchema,
  types: z.array(
    z.object({
      code: z.enum(["departure_cleaning", "stayover_cleaning", "touch_up", "deep_cleaning", "re_clean", "turn_down"]),
      label: z.string().trim().min(1).max(60),
      active: z.boolean(),
    }),
  ),
  priorities: z.array(
    z.object({
      code: z.enum(["normal", "high", "urgent"]),
      label: z.string().trim().min(1).max(40),
      active: z.boolean(),
    }),
  ),
  inspectionGate: z.boolean(),
  serviceTiming: z.object({
    morningFrom: z.string().trim().max(8),
    morningTo: z.string().trim().max(8),
    eveningFrom: z.string().trim().max(8),
    eveningTo: z.string().trim().max(8),
  }),
});

export const savePmsHkCleaningPosture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cleaningSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const posture: HkCleaningPosture = {
      types: data.types,
      priorities: data.priorities,
      inspectionGate: data.inspectionGate,
      serviceTiming: data.serviceTiming,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.hkColumnsAvailable) throw new Error(SET4_UNAVAILABLE_RULES);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_hk_cleaning_posture: posture as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET4_UNAVAILABLE_RULES);
      throw new Error(error.message);
    }
    const after = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET4_AUDIT_HK_CLEANING,
      section: "housekeeping-rules",
      before: before.cleaningPosture,
      after: after.cleaningPosture,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const oooSchema = z.object({
  restaurantId: idSchema,
  oooMeaning: z.string().trim().min(1).max(400),
  oosMeaning: z.string().trim().min(1).max(400),
  reasonRequired: z.boolean(),
  expectedReturnRequired: z.boolean(),
});

export const savePmsOooOosPosture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => oooSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const posture: OooOosPosture = {
      oooMeaning: data.oooMeaning,
      oosMeaning: data.oosMeaning,
      reasonRequired: data.reasonRequired,
      expectedReturnRequired: data.expectedReturnRequired,
      savedAt: new Date().toISOString(),
    };
    const blocked = oooOosSaveBlocked(posture);
    if (blocked) throw new Error(blocked);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.oooOosAvailable) throw new Error(SET4_UNAVAILABLE_RI);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_ooo_oos_posture: posture as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET4_UNAVAILABLE_RI);
      throw new Error(error.message);
    }
    const after = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET4_AUDIT_OOO_OOS,
      section: "room-inventory-rules",
      before: before.oooOosPosture,
      after: after.oooOosPosture,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const slaSchema = z.object({
  restaurantId: idSchema,
  acknowledgeHours: z.number().min(0).max(720).nullable(),
  resolveHours: z.number().min(0).max(720).nullable(),
  guidance: z.string().trim().max(400),
});

export const savePmsMaintenanceSla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => slaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const sla: MaintenanceSla = {
      acknowledgeHours: data.acknowledgeHours && data.acknowledgeHours > 0 ? data.acknowledgeHours : null,
      resolveHours: data.resolveHours && data.resolveHours > 0 ? data.resolveHours : null,
      guidance: data.guidance,
      savedAt: new Date().toISOString(),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.oooOosAvailable) throw new Error(SET4_UNAVAILABLE_CATALOGUE);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_maintenance_sla: sla as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET4_UNAVAILABLE_CATALOGUE);
      throw new Error(error.message);
    }
    const after = await loadSet4Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET4_AUDIT_SLA,
      section: "maintenance-rules",
      before: before.maintenanceSla,
      after: after.maintenanceSla,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const catalogueItemSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
});

type CatalogueTable =
  | "pms_restriction_reasons"
  | "pms_maintenance_categories"
  | "pms_maintenance_priorities"
  | "pms_maintenance_type_tags";

async function saveCatalogueRow(params: {
  table: CatalogueTable;
  action: string;
  section: string;
  duplicateMessage: string;
  restaurantId: string;
  actorUserId: string;
  id?: string;
  code: string;
  name: string;
  active: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const before = await loadSet4Snapshot(supabaseAdmin, params.restaurantId);
  if (!before.cataloguesAvailable) throw new Error(SET4_UNAVAILABLE_CATALOGUE);
  const payload = {
    restaurant_id: params.restaurantId,
    code: params.code.toUpperCase(),
    name: params.name,
    active: params.active,
  };
  const result = params.id
    ? await supabaseAdmin.from(params.table).update(payload).eq("id", params.id).eq("restaurant_id", params.restaurantId)
    : await supabaseAdmin.from(params.table).insert(payload);
  if (result.error) {
    if (result.error.code === "23505") throw new Error(params.duplicateMessage);
    if (isMissingSchemaError(result.error)) throw new Error(SET4_UNAVAILABLE_CATALOGUE);
    throw new Error(result.error.message);
  }
  const after = await loadSet4Snapshot(supabaseAdmin, params.restaurantId);
  const auditWritten = await writeAudit(supabaseAdmin, {
    restaurantId: params.restaurantId,
    actorUserId: params.actorUserId,
    action: params.action,
    section: params.section,
    before,
    after,
  });
  return { ok: true as const, snapshot: after, auditWritten };
}

export const savePmsRestrictionReason = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogueItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    return saveCatalogueRow({
      table: "pms_restriction_reasons",
      action: SET4_AUDIT_REASON,
      section: "room-inventory-rules",
      duplicateMessage: "That restriction-reason code is already used.",
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      ...(data.id ? { id: data.id } : {}),
      code: data.code,
      name: data.name,
      active: data.active,
    });
  });

export const savePmsMaintenanceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogueItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    return saveCatalogueRow({
      table: "pms_maintenance_categories",
      action: SET4_AUDIT_CATEGORY,
      section: "maintenance-rules",
      duplicateMessage: "That category code is already used.",
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      ...(data.id ? { id: data.id } : {}),
      code: data.code,
      name: data.name,
      active: data.active,
    });
  });

export const savePmsMaintenancePriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogueItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    return saveCatalogueRow({
      table: "pms_maintenance_priorities",
      action: SET4_AUDIT_PRIORITY,
      section: "maintenance-rules",
      duplicateMessage: "That priority code is already used.",
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      ...(data.id ? { id: data.id } : {}),
      code: data.code,
      name: data.name,
      active: data.active,
    });
  });

export const savePmsMaintenanceTypeTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogueItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    return saveCatalogueRow({
      table: "pms_maintenance_type_tags",
      action: SET4_AUDIT_TYPE_TAG,
      section: "maintenance-rules",
      duplicateMessage: "That type-tag code is already used.",
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      ...(data.id ? { id: data.id } : {}),
      code: data.code,
      name: data.name,
      active: data.active,
    });
  });

export type { Set4Snapshot };
