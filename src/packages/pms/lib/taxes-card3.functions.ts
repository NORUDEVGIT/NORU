import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import {
  CARD3_TAXES_AUDIT_SECTION,
  CARD3_TAXES_UNAVAILABLE,
  EXEMPTION_REASONS,
  FEE_BASIS,
  TAX_BASIS,
  TAX_CALCULATIONS,
  TAX_CHARGE_TYPES,
  amountIsValid,
  evaluateTaxesCard3Readiness,
  isSetupCode,
  type ExemptionReason,
  type ExemptionRuleRow,
  type FeeBasis,
  type FeeRow,
  type ServiceChargeRow,
  type TaxBasis,
  type TaxCalculation,
  type TaxChargeType,
  type TaxGroupRow,
  type TaxRow,
  type TaxesCard3Snapshot,
} from "./taxes-card3.server";

type DbClient = any;

const idSchema = z.string().uuid();
const setupCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => isSetupCode(value), "Use 1–20 letters, numbers, or underscores.");

const taxSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(80),
  chargeType: z.enum(TAX_CHARGE_TYPES),
  amount: z.number().positive("Amount must be greater than zero."),
  basis: z.enum(TAX_BASIS),
  calculation: z.enum(TAX_CALCULATIONS),
  active: z.boolean(),
});

const groupSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
  taxIds: z.array(idSchema),
});

const serviceSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(80),
  chargeType: z.enum(TAX_CHARGE_TYPES),
  amount: z.number().positive("Amount must be greater than zero."),
  basis: z.enum(TAX_BASIS),
  active: z.boolean(),
});

const feeSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(80),
  chargeType: z.enum(TAX_CHARGE_TYPES),
  amount: z.number().positive("Amount must be greater than zero."),
  basis: z.enum(FEE_BASIS),
  active: z.boolean(),
});

const exemptionSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  reasonCategory: z.enum(EXEMPTION_REASONS),
  documentationRequired: z.boolean(),
  approvalRequired: z.boolean(),
  active: z.boolean(),
});

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    throw new Error(CARD3_TAXES_UNAVAILABLE);
  }
  throw new Error(error?.message ?? CARD3_TAXES_UNAVAILABLE);
}

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function asChargeType(value: unknown): TaxChargeType {
  return (TAX_CHARGE_TYPES as readonly string[]).includes(String(value)) ? (value as TaxChargeType) : "percentage";
}

function asTaxBasis(value: unknown): TaxBasis {
  return (TAX_BASIS as readonly string[]).includes(String(value)) ? (value as TaxBasis) : "all";
}

function asFeeBasis(value: unknown): FeeBasis {
  return (FEE_BASIS as readonly string[]).includes(String(value)) ? (value as FeeBasis) : "stay";
}

function asCalculation(value: unknown): TaxCalculation {
  return (TAX_CALCULATIONS as readonly string[]).includes(String(value)) ? (value as TaxCalculation) : "exclusive";
}

function asReason(value: unknown): ExemptionReason {
  return (EXEMPTION_REASONS as readonly string[]).includes(String(value)) ? (value as ExemptionReason) : "other";
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
    metadata: { section: CARD3_TAXES_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card3-taxes] audit", result.error.message);
}

function mapTax(row: any): TaxRow {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    chargeType: asChargeType(row.charge_type),
    amount: Number(row.amount),
    basis: asTaxBasis(row.basis),
    calculation: asCalculation(row.calculation),
    active: row.active !== false,
  };
}

function mapService(row: any): ServiceChargeRow {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    chargeType: asChargeType(row.charge_type),
    amount: Number(row.amount),
    basis: asTaxBasis(row.basis),
    active: row.active !== false,
  };
}

function mapFee(row: any): FeeRow {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    chargeType: asChargeType(row.charge_type),
    amount: Number(row.amount),
    basis: asFeeBasis(row.basis),
    active: row.active !== false,
  };
}

function mapExemption(row: any): ExemptionRuleRow {
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    reasonCategory: asReason(row.reason_category),
    documentationRequired: row.documentation_required === true,
    approvalRequired: row.approval_required === true,
    active: row.active !== false,
  };
}

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<TaxesCard3Snapshot> {
  const [taxes, groups, mappings, services, fees, rules] = await Promise.all([
    db.from("pms_taxes").select("id, code, name, charge_type, amount, basis, calculation, active").eq("restaurant_id", restaurantId).order("code"),
    db.from("pms_tax_groups").select("id, code, name, active").eq("restaurant_id", restaurantId).order("code"),
    db.from("pms_tax_group_taxes").select("tax_group_id, tax_id").eq("restaurant_id", restaurantId),
    db.from("pms_service_charges").select("id, code, name, charge_type, amount, basis, active").eq("restaurant_id", restaurantId).order("code"),
    db.from("pms_fees").select("id, code, name, charge_type, amount, basis, active").eq("restaurant_id", restaurantId).order("code"),
    db
      .from("pms_tax_exemption_rules")
      .select("id, code, name, description, reason_category, documentation_required, approval_required, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
  ]);
  for (const result of [taxes, groups, mappings, services, fees, rules]) {
    if (result.error) unavailable(result.error);
  }
  const taxIdsByGroup = new Map<string, string[]>();
  for (const row of mappings.data ?? []) {
    const groupId = String(row.tax_group_id);
    const list = taxIdsByGroup.get(groupId) ?? [];
    list.push(String(row.tax_id));
    taxIdsByGroup.set(groupId, list);
  }
  const mappedGroups: TaxGroupRow[] = (groups.data ?? []).map((row: any) => ({
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    active: row.active !== false,
    taxIds: taxIdsByGroup.get(row.id) ?? [],
  }));
  return {
    taxes: (taxes.data ?? []).map(mapTax),
    groups: mappedGroups,
    serviceCharges: (services.data ?? []).map(mapService),
    fees: (fees.data ?? []).map(mapFee),
    exemptionRules: (rules.data ?? []).map(mapExemption),
  };
}

async function loadAudit(db: DbClient, restaurantId: string) {
  const result = await db
    .from("restaurant_staff_audit_log")
    .select("id, action, created_at, metadata")
    .eq("restaurant_id", restaurantId)
    .contains("metadata", { section: CARD3_TAXES_AUDIT_SECTION })
    .order("created_at", { ascending: false })
    .limit(20);
  if (result.error) return [];
  return (result.data ?? []).map((row: any) => ({
    id: row.id,
    action: String(row.action ?? ""),
    createdAt: String(row.created_at ?? ""),
    detail: typeof row.metadata?.detail === "string" ? row.metadata.detail : null,
  }));
}

async function requireImmutableCode(
  db: DbClient,
  table: string,
  restaurantId: string,
  id: string,
  nextCode: string,
) {
  const existing = await db.from(table).select("id, code").eq("id", id).eq("restaurant_id", restaurantId).maybeSingle();
  if (existing.error) unavailable(existing.error);
  if (!existing.data) throw new Error("Record was not found.");
  if (String(existing.data.code).toUpperCase() !== nextCode) {
    throw new Error("Code cannot be changed after it is saved.");
  }
}

export const getTaxesCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFrontOfficeAccess(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return {
      snapshot,
      readiness: evaluateTaxesCard3Readiness(snapshot),
      audit: await loadAudit(db, data.restaurantId),
    };
  });

export const saveTaxCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => taxSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    if (!amountIsValid(data.chargeType, data.amount)) {
      throw new Error("Percentage amounts must be greater than 0 and at most 100.");
    }
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      charge_type: data.chargeType,
      amount: data.amount,
      basis: data.basis,
      calculation: data.calculation,
      active: data.active,
    };
    if (data.id) {
      await requireImmutableCode(db, "pms_taxes", data.restaurantId, data.id, data.code);
      const updated = await db.from("pms_taxes").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("pms_taxes").insert(payload);
      if (inserted.error) unavailable(inserted.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_tax_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateTaxesCard3Readiness(snapshot) };
  });

export const saveTaxGroupCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => groupSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const uniqueTaxIds = [...new Set(data.taxIds)];
    if (uniqueTaxIds.length > 0) {
      const owned = await db.from("pms_taxes").select("id").eq("restaurant_id", data.restaurantId).in("id", uniqueTaxIds);
      if (owned.error) unavailable(owned.error);
      if ((owned.data ?? []).length !== uniqueTaxIds.length) {
        throw new Error("Tax group mappings must use taxes from this property.");
      }
    }

    let groupId = data.id;
    const groupPayload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      active: data.active,
    };
    if (data.id) {
      await requireImmutableCode(db, "pms_tax_groups", data.restaurantId, data.id, data.code);
      const updated = await db
        .from("pms_tax_groups")
        .update(groupPayload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("pms_tax_groups").insert(groupPayload).select("id").maybeSingle();
      if (inserted.error) unavailable(inserted.error);
      groupId = inserted.data?.id;
    }
    if (!groupId) throw new Error("Tax group could not be saved.");

    const removed = await db
      .from("pms_tax_group_taxes")
      .delete()
      .eq("restaurant_id", data.restaurantId)
      .eq("tax_group_id", groupId);
    if (removed.error) unavailable(removed.error);
    if (uniqueTaxIds.length > 0) {
      const mapped = await db.from("pms_tax_group_taxes").insert(
        uniqueTaxIds.map((taxId) => ({
          restaurant_id: data.restaurantId,
          tax_group_id: groupId,
          tax_id: taxId,
        })),
      );
      if (mapped.error) unavailable(mapped.error);
    }

    await writeAudit(db, data.restaurantId, context.userId, "card3_tax_group_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateTaxesCard3Readiness(snapshot) };
  });

export const saveServiceChargeCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => serviceSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    if (!amountIsValid(data.chargeType, data.amount)) {
      throw new Error("Percentage amounts must be greater than 0 and at most 100.");
    }
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      charge_type: data.chargeType,
      amount: data.amount,
      basis: data.basis,
      active: data.active,
    };
    if (data.id) {
      await requireImmutableCode(db, "pms_service_charges", data.restaurantId, data.id, data.code);
      const updated = await db
        .from("pms_service_charges")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("pms_service_charges").insert(payload);
      if (inserted.error) unavailable(inserted.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_service_charge_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateTaxesCard3Readiness(snapshot) };
  });

export const saveFeeCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => feeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    if (!amountIsValid(data.chargeType, data.amount)) {
      throw new Error("Percentage amounts must be greater than 0 and at most 100.");
    }
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      charge_type: data.chargeType,
      amount: data.amount,
      basis: data.basis,
      active: data.active,
    };
    if (data.id) {
      await requireImmutableCode(db, "pms_fees", data.restaurantId, data.id, data.code);
      const updated = await db.from("pms_fees").update(payload).eq("id", data.id).eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("pms_fees").insert(payload);
      if (inserted.error) unavailable(inserted.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_fee_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateTaxesCard3Readiness(snapshot) };
  });

export const saveExemptionRuleCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => exemptionSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      reason_category: data.reasonCategory,
      documentation_required: data.documentationRequired,
      approval_required: data.approvalRequired,
      active: data.active,
    };
    if (data.id) {
      await requireImmutableCode(db, "pms_tax_exemption_rules", data.restaurantId, data.id, data.code);
      const updated = await db
        .from("pms_tax_exemption_rules")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("pms_tax_exemption_rules").insert(payload);
      if (inserted.error) unavailable(inserted.error);
    }
    await writeAudit(db, data.restaurantId, context.userId, "card3_exemption_rule_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateTaxesCard3Readiness(snapshot) };
  });
