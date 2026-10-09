/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireFrontOfficeAccess, requireRoomManager } from "./rooms.server";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  CARD3_TAXES_AUDIT_SECTION,
  CARD3_TAXES_UNAVAILABLE,
  EXEMPTION_REASONS,
  FEE_BASIS,
  TAX_APPLICABILITY_SCOPES,
  TAX_BASIS,
  TAX_CALCULATIONS,
  TAX_CHARGE_TYPES,
  amountIsValid,
  applicabilityFromBasis,
  basisForApplicability,
  evaluateTaxesCard3Readiness,
  isSetupCode,
  type ExemptionReason,
  type ExemptionRuleRow,
  type FeeBasis,
  type FeeRow,
  type ServiceChargeRow,
  type TaxApplicabilityScope,
  type TaxBasis,
  type TaxCalculation,
  type TaxChargeType,
  type TaxDepartmentOption,
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
  .refine(
    (value) => isSetupCode(value),
    "Use 1–20 letters, numbers, or underscores. Example: VAT_15.",
  );

const taxSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: setupCode,
    name: z.string().trim().min(1).max(80),
    chargeType: z.enum(TAX_CHARGE_TYPES),
    amount: z.number().positive("Amount must be greater than zero."),
    applicabilityScope: z.enum(["all", "rate_plans", "services", "departments", "folio"] as const),
    departmentIds: z.array(idSchema).default([]),
    calculation: z.enum(TAX_CALCULATIONS),
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.applicabilityScope === "departments" && value.departmentIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Choose at least one department.",
        path: ["departmentIds"],
      });
    }
  });

const groupSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: setupCode,
  name: z.string().trim().min(1).max(80),
  active: z.boolean(),
  taxIds: z.array(idSchema),
});

const serviceSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: setupCode,
    name: z.string().trim().min(1).max(80),
    chargeType: z.enum(TAX_CHARGE_TYPES),
    amount: z.number().positive("Amount must be greater than zero."),
    applicabilityScope: z.enum(["all", "rate_plans", "services", "departments", "folio"] as const),
    departmentIds: z.array(idSchema).default([]),
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.applicabilityScope === "departments" && value.departmentIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Choose at least one department.",
        path: ["departmentIds"],
      });
    }
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
  customReason: z.string().trim().max(200).nullable().optional(),
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
  return (TAX_CHARGE_TYPES as readonly string[]).includes(String(value))
    ? (value as TaxChargeType)
    : "percentage";
}

function asTaxBasis(value: unknown): TaxBasis {
  return (TAX_BASIS as readonly string[]).includes(String(value)) ? (value as TaxBasis) : "all";
}

function asApplicability(value: unknown, basis: TaxBasis): TaxApplicabilityScope {
  const scope = String(value ?? "");
  if (scope === "folio" || (TAX_APPLICABILITY_SCOPES as readonly string[]).includes(scope)) {
    return scope as TaxApplicabilityScope;
  }
  return applicabilityFromBasis(basis);
}

function asFeeBasis(value: unknown): FeeBasis {
  return (FEE_BASIS as readonly string[]).includes(String(value)) ? (value as FeeBasis) : "stay";
}

function asCalculation(value: unknown): TaxCalculation {
  return (TAX_CALCULATIONS as readonly string[]).includes(String(value))
    ? (value as TaxCalculation)
    : "exclusive";
}

function asReason(value: unknown): ExemptionReason {
  return (EXEMPTION_REASONS as readonly string[]).includes(String(value))
    ? (value as ExemptionReason)
    : "other";
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

function mapTax(row: any, departmentIds: string[] = []): TaxRow {
  const basis = asTaxBasis(row.basis);
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    chargeType: asChargeType(row.charge_type),
    amount: Number(row.amount),
    basis,
    applicabilityScope: asApplicability(row.applicability_scope, basis),
    departmentIds,
    calculation: asCalculation(row.calculation),
    active: row.active !== false,
  };
}

function mapService(row: any, departmentIds: string[] = []): ServiceChargeRow {
  const basis = asTaxBasis(row.basis);
  return {
    id: row.id,
    code: String(row.code ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    chargeType: asChargeType(row.charge_type),
    amount: Number(row.amount),
    basis,
    applicabilityScope: asApplicability(row.applicability_scope, basis),
    departmentIds,
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
    customReason: row.custom_reason ? String(row.custom_reason) : null,
    documentationRequired: row.documentation_required === true,
    approvalRequired: row.approval_required === true,
    active: row.active !== false,
  };
}

async function loadDefaultRoomTaxGroupId(
  db: DbClient,
  restaurantId: string,
): Promise<string | null> {
  const result = await db
    .from("restaurants")
    .select("default_room_tax_group_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error) {
    if (
      isMissingSchemaError(result.error) ||
      String(result.error.message).includes("default_room_tax_group")
    ) {
      return null;
    }
    unavailable(result.error);
  }
  const value = result.data?.default_room_tax_group_id;
  return value ? String(value) : null;
}

async function loadDepartmentOptions(
  db: DbClient,
  restaurantId: string,
): Promise<TaxDepartmentOption[]> {
  const result = await db
    .from("pms_departments")
    .select("id, code, name, active")
    .eq("restaurant_id", restaurantId)
    .eq("active", true)
    .order("name");
  if (result.error) {
    if (isMissingSchemaError(result.error)) return [];
    unavailable(result.error);
  }
  return (result.data ?? []).map((row: any) => ({
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
  }));
}

async function replaceDepartmentTargets(
  db: DbClient,
  table: "pms_tax_department_targets" | "pms_service_charge_department_targets",
  parentColumn: "tax_id" | "service_charge_id",
  restaurantId: string,
  parentId: string,
  departmentIds: string[],
) {
  const uniqueIds = [...new Set(departmentIds)];
  if (uniqueIds.length > 0) {
    const owned = await db
      .from("pms_departments")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .in("id", uniqueIds);
    if (owned.error) unavailable(owned.error);
    if ((owned.data ?? []).length !== uniqueIds.length) {
      throw new Error("Choose departments from this property.");
    }
  }
  const removed = await db
    .from(table)
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq(parentColumn, parentId);
  if (removed.error) unavailable(removed.error);
  if (uniqueIds.length === 0) return;
  const inserted = await db.from(table).insert(
    uniqueIds.map((departmentId) => ({
      restaurant_id: restaurantId,
      [parentColumn]: parentId,
      department_id: departmentId,
    })),
  );
  if (inserted.error) unavailable(inserted.error);
}

async function loadSnapshot(db: DbClient, restaurantId: string): Promise<TaxesCard3Snapshot> {
  const [
    taxes,
    groups,
    mappings,
    services,
    fees,
    taxTargets,
    serviceTargets,
    departments,
    defaultRoomTaxGroupId,
  ] = await Promise.all([
    db
      .from("pms_taxes")
      .select(
        "id, code, name, charge_type, amount, basis, applicability_scope, calculation, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_tax_groups")
      .select("id, code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db.from("pms_tax_group_taxes").select("tax_group_id, tax_id").eq("restaurant_id", restaurantId),
    db
      .from("pms_service_charges")
      .select("id, code, name, charge_type, amount, basis, applicability_scope, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_fees")
      .select("id, code, name, charge_type, amount, basis, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_tax_department_targets")
      .select("tax_id, department_id")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_service_charge_department_targets")
      .select("service_charge_id, department_id")
      .eq("restaurant_id", restaurantId),
    loadDepartmentOptions(db, restaurantId),
    loadDefaultRoomTaxGroupId(db, restaurantId),
  ]);

  let rules = await db
    .from("pms_tax_exemption_rules")
    .select(
      "id, code, name, description, reason_category, custom_reason, documentation_required, approval_required, active",
    )
    .eq("restaurant_id", restaurantId)
    .order("code");

  if (
    rules.error &&
    (isMissingSchemaError(rules.error) || String(rules.error.message).includes("custom_reason"))
  ) {
    rules = await db
      .from("pms_tax_exemption_rules")
      .select(
        "id, code, name, description, reason_category, documentation_required, approval_required, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("code");
  }

  for (const result of [
    taxes,
    groups,
    mappings,
    services,
    fees,
    taxTargets,
    serviceTargets,
    rules,
  ]) {
    if (result.error) unavailable(result.error);
  }
  const taxDepartments = new Map<string, string[]>();
  for (const row of taxTargets.data ?? []) {
    const list = taxDepartments.get(String(row.tax_id)) ?? [];
    list.push(String(row.department_id));
    taxDepartments.set(String(row.tax_id), list);
  }
  const serviceDepartments = new Map<string, string[]>();
  for (const row of serviceTargets.data ?? []) {
    const list = serviceDepartments.get(String(row.service_charge_id)) ?? [];
    list.push(String(row.department_id));
    serviceDepartments.set(String(row.service_charge_id), list);
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
    taxes: (taxes.data ?? []).map((row: any) =>
      mapTax(row, taxDepartments.get(String(row.id)) ?? []),
    ),
    groups: mappedGroups,
    serviceCharges: (services.data ?? []).map((row: any) =>
      mapService(row, serviceDepartments.get(String(row.id)) ?? []),
    ),
    fees: (fees.data ?? []).map(mapFee),
    exemptionRules: (rules.data ?? []).map(mapExemption),
    defaultRoomTaxGroupId,
    departments,
  };
}

export { loadSnapshot as loadTaxesCard3Snapshot };

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
  const existing = await db
    .from(table)
    .select("id, code")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
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
    const departmentIds = data.applicabilityScope === "departments" ? data.departmentIds : [];
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      charge_type: data.chargeType,
      amount: data.amount,
      basis: basisForApplicability(data.applicabilityScope),
      applicability_scope: data.applicabilityScope,
      calculation: data.calculation,
      active: data.active,
    };
    let taxId = data.id;
    if (data.id) {
      await requireImmutableCode(db, "pms_taxes", data.restaurantId, data.id, data.code);
      const updated = await db
        .from("pms_taxes")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db.from("pms_taxes").insert(payload).select("id").maybeSingle();
      if (inserted.error) unavailable(inserted.error);
      taxId = inserted.data?.id;
    }
    if (!taxId) throw new Error("Tax could not be saved.");
    await replaceDepartmentTargets(
      db,
      "pms_tax_department_targets",
      "tax_id",
      data.restaurantId,
      taxId,
      departmentIds,
    );
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
      const owned = await db
        .from("pms_taxes")
        .select("id")
        .eq("restaurant_id", data.restaurantId)
        .in("id", uniqueTaxIds);
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
      const inserted = await db
        .from("pms_tax_groups")
        .insert(groupPayload)
        .select("id")
        .maybeSingle();
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
    const departmentIds = data.applicabilityScope === "departments" ? data.departmentIds : [];
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      charge_type: data.chargeType,
      amount: data.amount,
      basis: basisForApplicability(data.applicabilityScope),
      applicability_scope: data.applicabilityScope,
      active: data.active,
    };
    let serviceId = data.id;
    if (data.id) {
      await requireImmutableCode(db, "pms_service_charges", data.restaurantId, data.id, data.code);
      const updated = await db
        .from("pms_service_charges")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
      if (updated.error) unavailable(updated.error);
    } else {
      const inserted = await db
        .from("pms_service_charges")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (inserted.error) unavailable(inserted.error);
      serviceId = inserted.data?.id;
    }
    if (!serviceId) throw new Error("Service charge could not be saved.");
    await replaceDepartmentTargets(
      db,
      "pms_service_charge_department_targets",
      "service_charge_id",
      data.restaurantId,
      serviceId,
      departmentIds,
    );
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
      const updated = await db
        .from("pms_fees")
        .update(payload)
        .eq("id", data.id)
        .eq("restaurant_id", data.restaurantId);
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
    const isOther = data.reasonCategory === "other";
    const customReasonVal = isOther && data.customReason?.trim() ? data.customReason.trim() : null;

    let payload: Record<string, unknown> = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: data.description?.trim() ? data.description.trim() : null,
      reason_category: data.reasonCategory,
      custom_reason: customReasonVal,
      documentation_required: data.documentationRequired,
      approval_required: data.approvalRequired,
      active: data.active,
    };

    const executeSave = async (record: Record<string, unknown>) => {
      if (data.id) {
        await requireImmutableCode(
          db,
          "pms_tax_exemption_rules",
          data.restaurantId,
          data.id,
          data.code,
        );
        return await db
          .from("pms_tax_exemption_rules")
          .update(record)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId);
      } else {
        return await db.from("pms_tax_exemption_rules").insert(record);
      }
    };

    let result = await executeSave(payload);

    if (
      result.error &&
      (isMissingSchemaError(result.error) || String(result.error.message).includes("custom_reason"))
    ) {
      const { custom_reason: _discard, ...rest } = payload;
      payload = rest;
      result = await executeSave(payload);
    }

    if (
      result.error &&
      (result.error.code === "23514" || String(result.error.message).includes("reason_check"))
    ) {
      payload = { ...payload, reason_category: "other" };
      result = await executeSave(payload);
    }

    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "card3_exemption_rule_saved", {
      detail: `${data.code} ${data.name}`,
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateTaxesCard3Readiness(snapshot) };
  });

const defaultRoomTaxGroupSchema = z.object({
  restaurantId: idSchema,
  taxGroupId: idSchema.nullable(),
});

export const saveDefaultRoomTaxGroupCard3 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => defaultRoomTaxGroupSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const db = pmsDb((await import("@/integrations/supabase/client.server")).supabaseAdmin);

    if (data.taxGroupId) {
      const group = await db
        .from("pms_tax_groups")
        .select("id, code, name")
        .eq("id", data.taxGroupId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (group.error) unavailable(group.error);
      if (!group.data) throw new Error("Tax group was not found on this property.");
    }

    const updated = await db
      .from("restaurants")
      .update({ default_room_tax_group_id: data.taxGroupId })
      .eq("id", data.restaurantId);
    if (updated.error) {
      if (
        isMissingSchemaError(updated.error) ||
        String(updated.error.message).includes("default_room_tax_group")
      ) {
        throw new Error(CARD3_TAXES_UNAVAILABLE);
      }
      unavailable(updated.error);
    }

    await writeAudit(db, data.restaurantId, context.userId, "card3_default_room_tax_group_saved", {
      detail: data.taxGroupId ?? "cleared",
    });
    const snapshot = await loadSnapshot(db, data.restaurantId);
    return { snapshot, readiness: evaluateTaxesCard3Readiness(snapshot) };
  });
