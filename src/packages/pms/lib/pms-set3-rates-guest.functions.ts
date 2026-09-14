/**
 * PMS-SET3 — load / save meal & package catalogues, guest rules, ID/VIP.
 *
 * 0049 tables are optional at runtime: missing relations never crash the hub.
 * hotel_rate_plans.active COUNT still works without 0049.
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
  SET3_AUDIT_GUEST_RULES,
  SET3_AUDIT_ID_TYPE,
  SET3_AUDIT_MEAL,
  SET3_AUDIT_PACKAGE,
  SET3_AUDIT_VIP,
  activateInputFromSet3Snapshot,
  emptyGuestProfileRules,
  emptySet3Snapshot,
  guestRulesSaveBlocked,
  parseGuestProfileRules,
  parseMealPlanType,
  parsePackageType,
  parseRatePackageRules,
  parseStringList,
  parseTaxPosture,
  type GuestProfileRules,
  type PmsGuestIdType,
  type PmsGuestVipLevel,
  type PmsMealPlan,
  type PmsPackage,
  type Set3Snapshot,
} from "./pms-set3-rates-guest";

const idSchema = z.string().uuid();
const SET3_UNAVAILABLE_CATALOGUE = "Those catalogues are unavailable until migration 0049 is applied.";
const SET3_UNAVAILABLE_RULES = "Guest profile rules are unavailable until migration 0049 is applied.";

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
    console.error("[pms-set3] audit", error.message);
    return false;
  }
  return true;
}

function mapMeal(row: {
  id: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
  included: unknown;
  chargeable: unknown;
  applicable_outlet_ids: string[] | null;
  tax_posture: string;
}): PmsMealPlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: parseMealPlanType(row.type) || "custom",
    active: row.active,
    included: parseStringList(row.included),
    chargeable: parseStringList(row.chargeable),
    applicableOutletIds: Array.isArray(row.applicable_outlet_ids) ? row.applicable_outlet_ids : [],
    taxPosture: parseTaxPosture(row.tax_posture),
  };
}

function mapPackage(row: {
  id: string;
  type: string;
  code: string;
  name: string;
  active: boolean;
  inclusion: unknown;
}): PmsPackage {
  return {
    id: row.id,
    type: parsePackageType(row.type) || "custom",
    code: row.code,
    name: row.name,
    active: row.active,
    inclusion: parseStringList(row.inclusion),
  };
}

export async function loadSet3Snapshot(supabaseAdmin: Admin, restaurantId: string): Promise<Set3Snapshot> {
  const snapshot = emptySet3Snapshot();

  const ratesRes = await supabaseAdmin
    .from("hotel_rate_plans")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("active", true);
  if (!ratesRes.error) snapshot.activeRatePlanCount = ratesRes.count ?? 0;

  const mealsRes = await supabaseAdmin
    .from("pms_meal_plans")
    .select("id, code, name, type, active, included, chargeable, applicable_outlet_ids, tax_posture")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (mealsRes.error && isMissingSchemaError(mealsRes.error)) {
    snapshot.mealPlansAvailable = false;
  } else if (mealsRes.error) {
    throw new Error(mealsRes.error.message);
  } else {
    snapshot.mealPlansAvailable = true;
    snapshot.mealPlans = ((mealsRes.data ?? []) as Array<Parameters<typeof mapMeal>[0]>).map(mapMeal);
  }

  const packagesRes = await supabaseAdmin
    .from("pms_packages")
    .select("id, type, code, name, active, inclusion")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (packagesRes.error && isMissingSchemaError(packagesRes.error)) {
    snapshot.packagesAvailable = false;
  } else if (packagesRes.error) {
    throw new Error(packagesRes.error.message);
  } else {
    snapshot.packagesAvailable = true;
    snapshot.packages = ((packagesRes.data ?? []) as Array<Parameters<typeof mapPackage>[0]>).map(mapPackage);
  }

  const idTypesRes = await supabaseAdmin
    .from("pms_guest_id_types")
    .select("id, code, name, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  const vipRes = await supabaseAdmin
    .from("pms_guest_vip_levels")
    .select("id, code, name, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (
    (idTypesRes.error && isMissingSchemaError(idTypesRes.error)) ||
    (vipRes.error && isMissingSchemaError(vipRes.error))
  ) {
    snapshot.idVipAvailable = false;
  } else if (idTypesRes.error) {
    throw new Error(idTypesRes.error.message);
  } else if (vipRes.error) {
    throw new Error(vipRes.error.message);
  } else {
    snapshot.idVipAvailable = true;
    snapshot.idTypes = (idTypesRes.data ?? []) as PmsGuestIdType[];
    snapshot.vipLevels = (vipRes.data ?? []) as PmsGuestVipLevel[];
  }

  const rulesRes = await supabaseAdmin
    .from("restaurants")
    .select("pms_guest_profile_rules, pms_rate_package_rules")
    .eq("id", restaurantId)
    .maybeSingle();
  if (rulesRes.error && isMissingSchemaError(rulesRes.error)) {
    snapshot.guestRulesAvailable = false;
    snapshot.guestRules = emptyGuestProfileRules();
  } else if (rulesRes.error) {
    throw new Error(rulesRes.error.message);
  } else {
    snapshot.guestRulesAvailable = true;
    snapshot.guestRules = parseGuestProfileRules(rulesRes.data?.pms_guest_profile_rules);
    snapshot.ratePackageRules = parseRatePackageRules(rulesRes.data?.pms_rate_package_rules);
  }

  return snapshot;
}

export async function loadGuestProfileRules(
  supabaseAdmin: Admin,
  restaurantId: string,
): Promise<GuestProfileRules | null> {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("pms_guest_profile_rules")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw new Error(error.message);
  }
  const rules = parseGuestProfileRules(data?.pms_guest_profile_rules);
  return rules.savedAt ? rules : null;
}

export const getPmsSet3Snapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    return {
      snapshot,
      activate: activateInputFromSet3Snapshot(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

const mealSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  type: z.enum(["room_only", "breakfast", "half_board", "full_board", "all_inclusive", "custom"]),
  active: z.boolean(),
  included: z.array(z.string().trim().max(80)).max(40),
  chargeable: z.array(z.string().trim().max(80)).max(40),
  applicableOutletIds: z.array(idSchema).max(40),
  taxPosture: z.enum(["inclusive", "exclusive", "inherit"]),
});

export const savePmsMealPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mealSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.mealPlansAvailable) throw new Error(SET3_UNAVAILABLE_CATALOGUE);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      type: data.type,
      active: data.active,
      included: data.included.filter(Boolean),
      chargeable: data.chargeable.filter(Boolean),
      applicable_outlet_ids: data.applicableOutletIds,
      tax_posture: data.taxPosture,
    };
    const result = data.id
      ? await supabaseAdmin.from("pms_meal_plans").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_meal_plans").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That meal-plan code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET3_UNAVAILABLE_CATALOGUE);
      throw new Error(result.error.message);
    }
    const after = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET3_AUDIT_MEAL,
      section: "rates",
      before: before.mealPlans,
      after: after.mealPlans,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const packageSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  type: z.enum(["accommodation", "business", "romantic", "conference", "custom"]),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(120),
  active: z.boolean(),
  inclusion: z.array(z.string().trim().max(80)).max(40),
});

export const savePmsPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => packageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.packagesAvailable) throw new Error(SET3_UNAVAILABLE_CATALOGUE);
    const payload = {
      restaurant_id: data.restaurantId,
      type: data.type,
      code: data.code.toUpperCase(),
      name: data.name,
      active: data.active,
      inclusion: data.inclusion.filter(Boolean),
    };
    const result = data.id
      ? await supabaseAdmin.from("pms_packages").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_packages").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That package code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET3_UNAVAILABLE_CATALOGUE);
      throw new Error(result.error.message);
    }
    const after = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET3_AUDIT_PACKAGE,
      section: "rates",
      before: before.packages,
      after: after.packages,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

const guestRulesSchema = z.object({
  restaurantId: idSchema,
  requiredFields: z.object({
    firstName: z.boolean(),
    lastName: z.boolean(),
    phone: z.boolean(),
    email: z.boolean(),
  }),
  consentDefaults: z.object({
    marketing: z.boolean(),
    dataProcessing: z.boolean(),
  }),
  companyRelationshipEnabled: z.boolean(),
});

export const savePmsGuestProfileRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => guestRulesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const rules: GuestProfileRules = {
      requiredFields: { ...data.requiredFields, firstName: true },
      consentDefaults: data.consentDefaults,
      companyRelationshipEnabled: data.companyRelationshipEnabled,
      savedAt: new Date().toISOString(),
    };
    const blocked = guestRulesSaveBlocked(rules);
    if (blocked) throw new Error(blocked);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.guestRulesAvailable) throw new Error(SET3_UNAVAILABLE_RULES);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ pms_guest_profile_rules: rules as unknown as Json })
      .eq("id", data.restaurantId);
    if (error) {
      if (isMissingSchemaError(error)) throw new Error(SET3_UNAVAILABLE_RULES);
      throw new Error(error.message);
    }
    const after = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET3_AUDIT_GUEST_RULES,
      section: "guest-profile",
      before: before.guestRules,
      after: after.guestRules,
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

export const savePmsGuestIdType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogueItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.idVipAvailable) throw new Error(SET3_UNAVAILABLE_CATALOGUE);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from("pms_guest_id_types").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_guest_id_types").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That ID-type code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET3_UNAVAILABLE_CATALOGUE);
      throw new Error(result.error.message);
    }
    const after = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET3_AUDIT_ID_TYPE,
      section: "guest-profile",
      before: before.idTypes,
      after: after.idTypes,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export const savePmsGuestVipLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogueItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const before = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    if (!before.idVipAvailable) throw new Error(SET3_UNAVAILABLE_CATALOGUE);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.toUpperCase(),
      name: data.name,
      active: data.active,
    };
    const result = data.id
      ? await supabaseAdmin.from("pms_guest_vip_levels").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId)
      : await supabaseAdmin.from("pms_guest_vip_levels").insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That VIP-level code is already used.");
      if (isMissingSchemaError(result.error)) throw new Error(SET3_UNAVAILABLE_CATALOGUE);
      throw new Error(result.error.message);
    }
    const after = await loadSet3Snapshot(supabaseAdmin, data.restaurantId);
    const auditWritten = await writeAudit(supabaseAdmin, {
      restaurantId: data.restaurantId,
      actorUserId: context.userId,
      action: SET3_AUDIT_VIP,
      section: "guest-profile",
      before: before.vipLevels,
      after: after.vipLevels,
    });
    return { ok: true as const, snapshot: after, auditWritten };
  });

export type { Set3Snapshot };
