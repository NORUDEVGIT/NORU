/**
 * Card 5 Phase 3 — Sales & Events setup load/save.
 * Writes SET6 catalogues and 0079 setup tables only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callerMembership } from "@/core/lib/workforce.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { withPmsPackage } from "./pms-package.server";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import { persistCard5Overall } from "./card5-readiness.functions";
import {
  SET6_AUDIT_EVENT_TYPE,
  SET6_AUDIT_FUNCTION_SPACE,
  SET6_AUDIT_MARKET_SEGMENT,
  SET6_AUDIT_SOURCE_CODE,
} from "./pms-set6-sales-distribution";
import {
  CARD5_PRICING_METHODS,
  CARD5_SALES_AUDIT,
  CARD5_SALES_AUDIT_SECTION,
  CARD5_SALES_UNAVAILABLE,
  emptySalesSnapshot,
  evaluateCard5SalesReadiness,
  type Card5FunctionSpace,
  type Card5NamedOption,
  type Card5OrderedItem,
  type Card5PackageTemplate,
  type Card5PipelineStage,
  type Card5SalesItem,
  type Card5SalesSnapshot,
} from "./sales-events-card5.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;
const idSchema = z.string().uuid();
const nullableId = idSchema.nullable().optional();

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(CARD5_SALES_UNAVAILABLE);
  throw new Error(error?.message ?? CARD5_SALES_UNAVAILABLE);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

async function writeAudit(
  db: DbClient,
  restaurantId: string,
  userId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action,
    metadata: { section: CARD5_SALES_AUDIT_SECTION, before, after } as unknown as Json,
  });
  if (result.error) console.error("[card5-sales-events] audit", result.error.message);
}

function mapItem(row: any): Card5SalesItem {
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    active: row.active !== false,
  };
}

function mapOrdered(row: any): Card5OrderedItem {
  return { ...mapItem(row), sortOrder: Number(row.sort_order ?? 0) };
}

function mapOptions(rows: any[]): Card5NamedOption[] {
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? row.code ?? ""),
    active: row.active !== false,
    code: row.code == null ? undefined : String(row.code),
  }));
}

export async function loadCard5SalesSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<Card5SalesSnapshot> {
  const [
    segments,
    sources,
    leads,
    eventTypes,
    statuses,
    labels,
    mappings,
    stages,
    templates,
    templateOutlets,
    templateServices,
    contracts,
    facilities,
    services,
    taxGroups,
    currencies,
    deposits,
  ] = await Promise.all([
    db
      .from("pms_market_segments")
      .select("id, code, name, description, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_source_codes")
      .select("id, code, name, description, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_lead_types")
      .select("id, code, name, description, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_event_types")
      .select("id, code, name, description, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_event_statuses")
      .select("id, code, name, description, sort_order, active")
      .eq("restaurant_id", restaurantId)
      .order("sort_order"),
    db
      .from("pms_function_space_labels")
      .select("id, code, name, description, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_function_space_outlets")
      .select("function_space_label_id, outlet_id, active")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_sales_pipeline_stages")
      .select("id, code, name, sort_order, is_terminal, active")
      .eq("restaurant_id", restaurantId)
      .order("sort_order"),
    db
      .from("pms_event_package_templates")
      .select(
        "id, code, name, event_type_id, pricing_method, default_price, currency_code, tax_group_id, valid_from, valid_to, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_event_package_template_outlets")
      .select("template_id, outlet_id")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_event_package_template_services")
      .select("template_id, fo_service_id")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_event_contract_defaults")
      .select(
        "id, contract_type, deposit_policy_id, payment_terms, cancellation_policy, approval_required, default_validity_days, active",
      )
      .eq("restaurant_id", restaurantId)
      .order("contract_type"),
    db
      .from("pms_outlets")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("fo_service_catalogue")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_tax_groups")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_property_currencies")
      .select("code, name, active")
      .eq("restaurant_id", restaurantId)
      .order("code"),
    db
      .from("pms_deposit_policies")
      .select("id, name, code, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
  ]);

  for (const result of [
    segments,
    sources,
    eventTypes,
    labels,
    leads,
    statuses,
    mappings,
    stages,
    templates,
    templateOutlets,
    templateServices,
    contracts,
  ]) {
    if (result.error) unavailable(result.error);
  }
  for (const result of [facilities, services, taxGroups, currencies, deposits]) {
    if (result.error) throw new Error(result.error.message);
  }

  const outletsByLabel = new Map<string, string[]>();
  for (const row of (mappings.data ?? []) as any[]) {
    if (row.active === false) continue;
    const key = String(row.function_space_label_id);
    const list = outletsByLabel.get(key) ?? [];
    list.push(String(row.outlet_id));
    outletsByLabel.set(key, list);
  }
  const outletsByTemplate = new Map<string, string[]>();
  for (const row of (templateOutlets.data ?? []) as any[]) {
    const key = String(row.template_id);
    const list = outletsByTemplate.get(key) ?? [];
    list.push(String(row.outlet_id));
    outletsByTemplate.set(key, list);
  }
  const servicesByTemplate = new Map<string, string[]>();
  for (const row of (templateServices.data ?? []) as any[]) {
    const key = String(row.template_id);
    const list = servicesByTemplate.get(key) ?? [];
    list.push(String(row.fo_service_id));
    servicesByTemplate.set(key, list);
  }

  return {
    ...emptySalesSnapshot(),
    marketSegments: ((segments.data ?? []) as any[]).map(mapItem),
    sourceCodes: ((sources.data ?? []) as any[]).map(mapItem),
    leadTypes: ((leads.data ?? []) as any[]).map(mapItem),
    eventTypes: ((eventTypes.data ?? []) as any[]).map(mapItem),
    eventStatuses: ((statuses.data ?? []) as any[]).map(mapOrdered),
    functionSpaces: ((labels.data ?? []) as any[]).map((row) => ({
      ...mapItem(row),
      outletIds: outletsByLabel.get(String(row.id)) ?? [],
    })),
    pipelineStages: ((stages.data ?? []) as any[]).map((row): Card5PipelineStage => ({
      ...mapOrdered(row),
      isTerminal: row.is_terminal === true,
    })),
    packageTemplates: ((templates.data ?? []) as any[]).map((row): Card5PackageTemplate => ({
      id: String(row.id),
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      eventTypeId: row.event_type_id == null ? null : String(row.event_type_id),
      pricingMethod: CARD5_PRICING_METHODS.includes(row.pricing_method)
        ? row.pricing_method
        : "per_event",
      defaultPrice: row.default_price == null ? null : Number(row.default_price),
      currencyCode: row.currency_code == null ? null : String(row.currency_code),
      taxGroupId: row.tax_group_id == null ? null : String(row.tax_group_id),
      validFrom: row.valid_from == null ? null : String(row.valid_from),
      validTo: row.valid_to == null ? null : String(row.valid_to),
      outletIds: outletsByTemplate.get(String(row.id)) ?? [],
      serviceIds: servicesByTemplate.get(String(row.id)) ?? [],
      active: row.active !== false,
    })),
    contractDefaults: ((contracts.data ?? []) as any[]).map((row) => ({
      id: String(row.id),
      contractType: String(row.contract_type ?? ""),
      depositPolicyId: row.deposit_policy_id == null ? null : String(row.deposit_policy_id),
      paymentTerms: String(row.payment_terms ?? ""),
      cancellationPolicy: String(row.cancellation_policy ?? ""),
      approvalRequired: row.approval_required === true,
      defaultValidityDays:
        row.default_validity_days == null ? null : Number(row.default_validity_days),
      active: row.active !== false,
    })),
    facilities: mapOptions(facilities.data ?? []),
    services: mapOptions(services.data ?? []),
    taxGroups: mapOptions(taxGroups.data ?? []),
    currencies: ((currencies.data ?? []) as any[]).map((row) => ({
      code: String(row.code),
      name: String(row.name ?? row.code),
      active: row.active !== false,
    })),
    depositPolicies: mapOptions(deposits.data ?? []),
  };
}

const SET6_KINDS = ["market_segment", "source_code", "event_type"] as const;
const SET6_TABLE = {
  market_segment: "pms_market_segments",
  source_code: "pms_source_codes",
  event_type: "pms_event_types",
} as const;
const SET6_AUDIT = {
  market_segment: SET6_AUDIT_MARKET_SEGMENT,
  source_code: SET6_AUDIT_SOURCE_CODE,
  event_type: SET6_AUDIT_EVENT_TYPE,
} as const;

const catalogueSchema = z.object({
  restaurantId: idSchema,
  kind: z.enum(["market_segment", "source_code", "event_type", "lead_type"]),
  id: idSchema.optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  active: z.boolean(),
});

const orderedSchema = z.object({
  restaurantId: idSchema,
  kind: z.enum(["event_status", "pipeline_stage"]),
  id: idSchema.optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.number().int(),
  isTerminal: z.boolean().optional(),
  active: z.boolean(),
});

const functionSpaceSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional(),
  active: z.boolean(),
  outletIds: z.array(idSchema),
});

const packageSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase()),
    name: z.string().trim().min(1).max(80),
    eventTypeId: nullableId,
    pricingMethod: z.enum(CARD5_PRICING_METHODS),
    defaultPrice: z.number().min(0).nullable(),
    currencyCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    taxGroupId: nullableId,
    validFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    validTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    outletIds: z.array(idSchema),
    serviceIds: z.array(idSchema),
    active: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.validFrom && value.validTo && value.validFrom > value.validTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Validity start must be on or before the end date.",
        path: ["validTo"],
      });
    }
  });

const contractSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  contractType: z.string().trim().min(1).max(40),
  depositPolicyId: nullableId,
  paymentTerms: z.string().trim().max(80).optional(),
  cancellationPolicy: z.string().trim().max(2000).optional(),
  approvalRequired: z.boolean(),
  defaultValidityDays: z.number().int().min(1).nullable(),
  active: z.boolean(),
});

function requireKnown(ids: string[], allowed: Card5NamedOption[], label: string) {
  for (const id of ids) {
    if (!allowed.some((row) => row.id === id && row.active)) {
      throw new Error(`${label} must be an active option from this property.`);
    }
  }
}

async function replaceMappings(
  db: DbClient,
  table: string,
  restaurantId: string,
  parentColumn: string,
  parentId: string,
  childColumn: string,
  childIds: string[],
) {
  const removed = await db
    .from(table)
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq(parentColumn, parentId);
  if (removed.error) unavailable(removed.error);
  if (childIds.length === 0) return;
  const inserted = await db.from(table).insert(
    childIds.map((childId) => ({
      restaurant_id: restaurantId,
      [parentColumn]: parentId,
      [childColumn]: childId,
    })),
  );
  if (inserted.error) unavailable(inserted.error);
}

export const getCard5SalesEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard5SalesSnapshot(pmsDb(supabaseAdmin), data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCard5SalesReadiness(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

export const saveCard5SalesCatalogue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => catalogueSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard5SalesSnapshot(db, data.restaurantId);
    const isSet6 = (SET6_KINDS as readonly string[]).includes(data.kind);
    const table = isSet6 ? SET6_TABLE[data.kind as (typeof SET6_KINDS)[number]] : "pms_lead_types";
    const payload = isSet6
      ? {
          restaurant_id: data.restaurantId,
          code: data.code,
          name: data.name,
          description: data.description ?? "",
          attrs: {} as Json,
          active: data.active,
        }
      : {
          restaurant_id: data.restaurantId,
          code: data.code,
          name: data.name,
          description: blankToNull(data.description),
          active: data.active,
        };
    const result = data.id
      ? await db
          .from(table)
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from(table).insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That catalogue code is already used.");
      unavailable(result.error);
    }
    const after = await loadCard5SalesSnapshot(db, data.restaurantId);
    await persistCard5Overall(db, data.restaurantId);
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      isSet6 ? SET6_AUDIT[data.kind as (typeof SET6_KINDS)[number]] : CARD5_SALES_AUDIT,
      before,
      after,
    );
    return { ok: true as const, snapshot: after, readiness: evaluateCard5SalesReadiness(after) };
  });

export const saveCard5SalesOrdered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderedSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard5SalesSnapshot(db, data.restaurantId);
    const table = data.kind === "event_status" ? "pms_event_statuses" : "pms_sales_pipeline_stages";
    const payload =
      data.kind === "event_status"
        ? {
            restaurant_id: data.restaurantId,
            code: data.code,
            name: data.name,
            description: blankToNull(data.description),
            sort_order: data.sortOrder,
            active: data.active,
          }
        : {
            restaurant_id: data.restaurantId,
            code: data.code,
            name: data.name,
            sort_order: data.sortOrder,
            is_terminal: data.isTerminal === true,
            active: data.active,
          };
    const result = data.id
      ? await db
          .from(table)
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from(table).insert(payload);
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That catalogue code is already used.");
      unavailable(result.error);
    }
    const after = await loadCard5SalesSnapshot(db, data.restaurantId);
    await persistCard5Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD5_SALES_AUDIT, before, after);
    return { ok: true as const, snapshot: after, readiness: evaluateCard5SalesReadiness(after) };
  });

export const saveCard5FunctionSpace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => functionSpaceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard5SalesSnapshot(db, data.restaurantId);
    requireKnown(data.outletIds, before.facilities, "Facility");
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      description: data.description ?? "",
      attrs: {} as Json,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_function_space_labels")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
      : await db.from("pms_function_space_labels").insert(payload).select("id");
    if (result.error) {
      if (result.error.code === "23505")
        throw new Error("That function-space code is already used.");
      unavailable(result.error);
    }
    const savedId = data.id ?? String((result.data ?? [])[0]?.id ?? "");
    if (!savedId) throw new Error(CARD5_SALES_UNAVAILABLE);
    await replaceMappings(
      db,
      "pms_function_space_outlets",
      data.restaurantId,
      "function_space_label_id",
      savedId,
      "outlet_id",
      data.outletIds,
    );
    const after = await loadCard5SalesSnapshot(db, data.restaurantId);
    await persistCard5Overall(db, data.restaurantId);
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      SET6_AUDIT_FUNCTION_SPACE,
      before.functionSpaces,
      after.functionSpaces,
    );
    return { ok: true as const, snapshot: after, readiness: evaluateCard5SalesReadiness(after) };
  });

export const saveCard5PackageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => packageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard5SalesSnapshot(db, data.restaurantId);
    if (data.eventTypeId && !before.eventTypes.some((row) => row.id === data.eventTypeId)) {
      throw new Error("Event type must belong to this property.");
    }
    requireKnown(data.outletIds, before.facilities, "Facility");
    requireKnown(data.serviceIds, before.services, "Service");
    if (
      data.taxGroupId &&
      !before.taxGroups.some((row) => row.id === data.taxGroupId && row.active)
    ) {
      throw new Error("Tax group must be an active Card 3 group.");
    }
    if (
      data.currencyCode &&
      !before.currencies.some((row) => row.code === data.currencyCode && row.active)
    ) {
      throw new Error("Currency must be supported by this property.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code,
      name: data.name,
      event_type_id: data.eventTypeId ?? null,
      pricing_method: data.pricingMethod,
      default_price: data.defaultPrice,
      currency_code: data.currencyCode ?? null,
      tax_group_id: data.taxGroupId ?? null,
      valid_from: data.validFrom ?? null,
      valid_to: data.validTo ?? null,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_event_package_templates")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
          .select("id")
      : await db.from("pms_event_package_templates").insert(payload).select("id");
    if (result.error) {
      if (result.error.code === "23505") throw new Error("That package code is already used.");
      unavailable(result.error);
    }
    const savedId = data.id ?? String((result.data ?? [])[0]?.id ?? "");
    if (!savedId) throw new Error(CARD5_SALES_UNAVAILABLE);
    await replaceMappings(
      db,
      "pms_event_package_template_outlets",
      data.restaurantId,
      "template_id",
      savedId,
      "outlet_id",
      data.outletIds,
    );
    await replaceMappings(
      db,
      "pms_event_package_template_services",
      data.restaurantId,
      "template_id",
      savedId,
      "fo_service_id",
      data.serviceIds,
    );
    const after = await loadCard5SalesSnapshot(db, data.restaurantId);
    await persistCard5Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD5_SALES_AUDIT, before, after);
    return { ok: true as const, snapshot: after, readiness: evaluateCard5SalesReadiness(after) };
  });

export const saveCard5ContractDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => contractSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard5SalesSnapshot(db, data.restaurantId);
    if (
      data.depositPolicyId &&
      !before.depositPolicies.some((row) => row.id === data.depositPolicyId && row.active)
    ) {
      throw new Error("Deposit policy must be an active Card 3 policy.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      contract_type: data.contractType,
      deposit_policy_id: data.depositPolicyId ?? null,
      payment_terms: blankToNull(data.paymentTerms),
      cancellation_policy: blankToNull(data.cancellationPolicy),
      approval_required: data.approvalRequired,
      default_validity_days: data.defaultValidityDays,
      active: data.active,
    };
    const result = data.id
      ? await db
          .from("pms_event_contract_defaults")
          .update(payload)
          .eq("id", data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_event_contract_defaults").insert(payload);
    if (result.error) {
      if (result.error.code === "23505")
        throw new Error("That contract type already has defaults.");
      unavailable(result.error);
    }
    const after = await loadCard5SalesSnapshot(db, data.restaurantId);
    await persistCard5Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD5_SALES_AUDIT, before, after);
    return { ok: true as const, snapshot: after, readiness: evaluateCard5SalesReadiness(after) };
  });
