/**
 * Card 7 Phase 3 — Reports setup load/save.
 * Writes setup tables and compatible SET6 posture only. Never executes reports.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callerMembership } from "@/core/lib/workforce.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { withPmsPackage } from "./pms-package.server";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import { persistCard7Overall } from "./card7-readiness.functions";
import {
  CARD7_REPORT_CADENCES,
  CARD7_REPORT_PERIOD_BASES,
  CARD7_REPORTS_AUDIT_SECTION,
  CARD7_REPORTS_CATALOGUE_AUDIT,
  CARD7_REPORTS_METRICS_AUDIT,
  CARD7_REPORTS_PERMISSIONS_AUDIT,
  CARD7_REPORTS_POLICY_AUDIT,
  CARD7_REPORTS_UNAVAILABLE,
  emptyReportPolicy,
  evaluateCard7ReportsReadiness,
  parseMetricUnit,
  parseReportCadence,
  parseReportPeriodBasis,
  type Card7FiscalReference,
  type Card7MetricDefinition,
  type Card7MetricSetting,
  type Card7ReportCategory,
  type Card7ReportDefinition,
  type Card7ReportDefinitionSetting,
  type Card7ReportPermission,
  type Card7ReportPermissionMapping,
  type Card7ReportPolicy,
  type Card7ReportsSnapshot,
} from "./reports-card7.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;
const idSchema = z.string().uuid();

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(CARD7_REPORTS_UNAVAILABLE);
  throw new Error(error?.message ?? CARD7_REPORTS_UNAVAILABLE);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
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
    metadata: { section: CARD7_REPORTS_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card7-reports] audit", result.error.message);
}

function mapCategory(row: Record<string, unknown>): Card7ReportCategory {
  const data = row as any;
  return {
    id: String(data.id),
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    active: data.active !== false,
  };
}

function mapDefinition(row: Record<string, unknown>): Card7ReportDefinition {
  const data = row as any;
  return {
    id: String(data.id),
    code: String(data.code ?? ""),
    categoryId: String(data.category_id),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    queryKey: String(data.query_key ?? ""),
    active: data.active !== false,
  };
}

function mapDefinitionSetting(row: Record<string, unknown>): Card7ReportDefinitionSetting {
  const data = row as any;
  return {
    id: String(data.id),
    definitionId: String(data.definition_id),
    enabled: data.enabled !== false,
  };
}

function mapMetric(row: Record<string, unknown>): Card7MetricDefinition {
  const data = row as any;
  return {
    id: String(data.id),
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    formulaNotes: String(data.formula_notes ?? ""),
    unit: parseMetricUnit(data.unit),
    queryKey: String(data.query_key ?? ""),
    active: data.active !== false,
  };
}

function mapMetricSetting(row: Record<string, unknown>): Card7MetricSetting {
  const data = row as any;
  return {
    id: String(data.id),
    metricId: String(data.metric_id),
    enabled: data.enabled !== false,
    displayName: String(data.display_name ?? ""),
  };
}

function mapPermission(row: Record<string, unknown>): Card7ReportPermission {
  const data = row as any;
  return {
    id: String(data.id),
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    action: String(data.action ?? ""),
    active: data.active !== false,
  };
}

function mapPermissionMapping(row: Record<string, unknown>): Card7ReportPermissionMapping {
  const data = row as any;
  return {
    id: String(data.id),
    definitionId: String(data.definition_id),
    permissionId: String(data.permission_id),
  };
}

function mapPolicy(row: Record<string, unknown> | null): Card7ReportPolicy {
  if (!row) return emptyReportPolicy();
  const data = row as any;
  return emptyReportPolicy({
    exists: true,
    exportAllowed: data.export_allowed === true,
    exportCsv: data.export_csv === true,
    exportPdf: data.export_pdf === true,
    maskGuestNames: data.mask_guest_names !== false,
    ownerManagerExportOnly: data.owner_manager_export_only !== false,
    defaultDateRangeDays: Number(data.default_date_range_days ?? 30),
    scheduleIntentEnabled: data.schedule_intent_enabled === true,
    scheduleCadence: parseReportCadence(data.schedule_cadence),
    periodBasis: parseReportPeriodBasis(data.period_basis),
    active: data.active !== false,
  });
}

export async function loadCard7ReportsSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<Card7ReportsSnapshot> {
  const [
    categoriesRes,
    definitionsRes,
    definitionSettingsRes,
    metricsRes,
    metricSettingsRes,
    permissionsRes,
    mappingsRes,
    policyRes,
    fiscalRes,
  ] = await Promise.all([
    db.from("pms_report_categories").select("id, code, name, description, active").order("code"),
    db
      .from("pms_report_definitions")
      .select("id, code, category_id, name, description, query_key, active")
      .order("code"),
    db
      .from("pms_report_definition_settings")
      .select("id, definition_id, enabled")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_metric_definitions")
      .select("id, code, name, description, formula_notes, unit, query_key, active")
      .order("code"),
    db
      .from("pms_metric_definition_settings")
      .select("id, metric_id, enabled, display_name")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_permissions")
      .select("id, code, name, action, active")
      .or("module.eq.reports,and(module.eq.configuration,function.eq.reports)")
      .order("code"),
    db
      .from("pms_report_permissions")
      .select("id, definition_id, permission_id")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_report_policies")
      .select(
        "id, export_allowed, export_csv, export_pdf, mask_guest_names, owner_manager_export_only, default_date_range_days, schedule_intent_enabled, schedule_cadence, period_basis, active",
      )
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    db
      .from("pms_financial_settings")
      .select("fiscal_year_start_month, fiscal_year_start_day")
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  for (const response of [
    categoriesRes,
    definitionsRes,
    definitionSettingsRes,
    metricsRes,
    metricSettingsRes,
    permissionsRes,
    mappingsRes,
    policyRes,
  ]) {
    if (response.error) unavailable(response.error);
  }

  const fiscalReference: Card7FiscalReference = fiscalRes.error
    ? { saved: false, startMonth: 1, startDay: 1 }
    : {
        saved: Boolean(fiscalRes.data),
        startMonth: Number(fiscalRes.data?.fiscal_year_start_month ?? 1),
        startDay: Number(fiscalRes.data?.fiscal_year_start_day ?? 1),
      };

  return {
    categories: ((categoriesRes.data ?? []) as Record<string, unknown>[]).map(mapCategory),
    definitions: ((definitionsRes.data ?? []) as Record<string, unknown>[]).map(mapDefinition),
    definitionSettings: (
      (definitionSettingsRes.data ?? []) as Record<string, unknown>[]
    ).map(mapDefinitionSetting),
    metrics: ((metricsRes.data ?? []) as Record<string, unknown>[]).map(mapMetric),
    metricSettings: ((metricSettingsRes.data ?? []) as Record<string, unknown>[]).map(
      mapMetricSetting,
    ),
    permissions: ((permissionsRes.data ?? []) as Record<string, unknown>[]).map(mapPermission),
    permissionMappings: ((mappingsRes.data ?? []) as Record<string, unknown>[]).map(
      mapPermissionMapping,
    ),
    policy: mapPolicy((policyRes.data ?? null) as Record<string, unknown> | null),
    fiscalReference,
  };
}

async function mirrorSet6Catalogue(
  db: DbClient,
  restaurantId: string,
  snapshot: Card7ReportsSnapshot,
) {
  const current = await db
    .from("restaurants")
    .select("pms_reports_catalogue_posture")
    .eq("id", restaurantId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const existing = record(current.data?.pms_reports_catalogue_posture);
  const existingPacks = record(existing["packs"]);
  const packs = { ...existingPacks };
  for (const definition of snapshot.definitions) {
    packs[definition.code] =
      snapshot.definitionSettings.find((row) => row.definitionId === definition.id)?.enabled ??
      true;
  }
  const saved = await db
    .from("restaurants")
    .update({
      pms_reports_catalogue_posture: {
        ...existing,
        packs,
        savedAt: new Date().toISOString(),
      } as unknown as Json,
    })
    .eq("id", restaurantId);
  if (saved.error) throw new Error(saved.error.message);
}

async function mirrorSet6Schedule(
  db: DbClient,
  restaurantId: string,
  policy: Card7ReportPolicy,
) {
  const current = await db
    .from("restaurants")
    .select("pms_reports_schedule_access_posture")
    .eq("id", restaurantId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const existing = record(current.data?.pms_reports_schedule_access_posture);
  const saved = await db
    .from("restaurants")
    .update({
      pms_reports_schedule_access_posture: {
        ...existing,
        scheduleEnabled: policy.scheduleIntentEnabled,
        ownerManagerAccessOnly: policy.ownerManagerExportOnly,
        savedAt: new Date().toISOString(),
      } as unknown as Json,
    })
    .eq("id", restaurantId);
  if (saved.error) throw new Error(saved.error.message);
}

export async function syncCard7DefinitionsFromSet6(
  db: DbClient,
  restaurantId: string,
  packs: Record<string, boolean>,
) {
  const definitions = await db.from("pms_report_definitions").select("id, code");
  if (definitions.error) {
    if (isMissingSchemaError(definitions.error)) return;
    throw new Error(definitions.error.message);
  }
  for (const definition of (definitions.data ?? []) as Array<{ id: string; code: string }>) {
    if (typeof packs[definition.code] !== "boolean") continue;
    const saved = await db.from("pms_report_definition_settings").upsert(
      {
        restaurant_id: restaurantId,
        definition_id: definition.id,
        enabled: packs[definition.code],
      },
      { onConflict: "restaurant_id,definition_id" },
    );
    if (saved.error && !isMissingSchemaError(saved.error)) throw new Error(saved.error.message);
  }
}

export async function syncCard7PolicyFromSet6(
  db: DbClient,
  restaurantId: string,
  posture: { scheduleEnabled: boolean; ownerManagerAccessOnly: boolean },
) {
  const existing = await db
    .from("pms_report_policies")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (existing.error) {
    if (isMissingSchemaError(existing.error)) return;
    throw new Error(existing.error.message);
  }
  const saved = await db.from("pms_report_policies").upsert(
    {
      ...(existing.data ?? {}),
      restaurant_id: restaurantId,
      schedule_intent_enabled: posture.scheduleEnabled,
      owner_manager_export_only: posture.ownerManagerAccessOnly,
    },
    { onConflict: "restaurant_id" },
  );
  if (saved.error && !isMissingSchemaError(saved.error)) throw new Error(saved.error.message);
}

const definitionsSchema = z.object({
  restaurantId: idSchema,
  settings: z.array(
    z.object({
      definitionId: idSchema,
      enabled: z.boolean(),
    }),
  ),
});

const metricsSchema = z.object({
  restaurantId: idSchema,
  settings: z.array(
    z.object({
      metricId: idSchema,
      enabled: z.boolean(),
      displayName: z.string().trim().max(80).optional(),
    }),
  ),
});

const permissionsSchema = z.object({
  restaurantId: idSchema,
  mappings: z.array(
    z.object({
      definitionId: idSchema,
      permissionId: idSchema,
    }),
  ),
});

const policySchema = z.object({
  restaurantId: idSchema,
  exportAllowed: z.boolean(),
  exportCsv: z.boolean(),
  exportPdf: z.boolean(),
  maskGuestNames: z.boolean(),
  ownerManagerExportOnly: z.boolean(),
  defaultDateRangeDays: z.number().int().min(1).max(365),
  scheduleIntentEnabled: z.boolean(),
  scheduleCadence: z.enum(CARD7_REPORT_CADENCES).nullable(),
  periodBasis: z.enum(CARD7_REPORT_PERIOD_BASES),
  active: z.boolean(),
});

async function requireEditor(restaurantId: string, context: unknown) {
  const me = await withPmsPackage(
    restaurantId,
    callerMembership(context as never, restaurantId),
  );
  if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
  return me;
}

export const getCard7Reports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard7ReportsSnapshot(pmsDb(supabaseAdmin), data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCard7ReportsReadiness(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

export const saveCard7ReportDefinitions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => definitionsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7ReportsSnapshot(db, data.restaurantId);
    const definitionIds = new Set(before.definitions.map((row) => row.id));
    if (data.settings.some((row) => !definitionIds.has(row.definitionId))) {
      throw new Error("Definition settings must use the global report catalogue.");
    }
    const removed = await db
      .from("pms_report_definition_settings")
      .delete()
      .eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    if (data.settings.length > 0) {
      const inserted = await db.from("pms_report_definition_settings").insert(
        data.settings.map((row) => ({
          restaurant_id: data.restaurantId,
          definition_id: row.definitionId,
          enabled: row.enabled,
        })),
      );
      if (inserted.error) unavailable(inserted.error);
    }
    const after = await loadCard7ReportsSnapshot(db, data.restaurantId);
    await mirrorSet6Catalogue(db, data.restaurantId, after);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_REPORTS_CATALOGUE_AUDIT, {
      before: before.definitionSettings,
      after: after.definitionSettings,
    });
    return { snapshot: after, readiness: evaluateCard7ReportsReadiness(after) };
  });

export const saveCard7ReportMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => metricsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7ReportsSnapshot(db, data.restaurantId);
    const metricIds = new Set(before.metrics.map((row) => row.id));
    if (data.settings.some((row) => !metricIds.has(row.metricId))) {
      throw new Error("Metric settings must use canonical global definitions.");
    }
    const removed = await db
      .from("pms_metric_definition_settings")
      .delete()
      .eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    if (data.settings.length > 0) {
      const inserted = await db.from("pms_metric_definition_settings").insert(
        data.settings.map((row) => ({
          restaurant_id: data.restaurantId,
          metric_id: row.metricId,
          enabled: row.enabled,
          display_name: blankToNull(row.displayName),
        })),
      );
      if (inserted.error) unavailable(inserted.error);
    }
    const after = await loadCard7ReportsSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_REPORTS_METRICS_AUDIT, {
      before: before.metricSettings,
      after: after.metricSettings,
    });
    return { snapshot: after, readiness: evaluateCard7ReportsReadiness(after) };
  });

export const saveCard7ReportPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => permissionsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7ReportsSnapshot(db, data.restaurantId);
    const definitionIds = new Set(before.definitions.map((row) => row.id));
    const permissionIds = new Set(before.permissions.map((row) => row.id));
    if (
      data.mappings.some(
        (row) =>
          !definitionIds.has(row.definitionId) || !permissionIds.has(row.permissionId),
      )
    ) {
      throw new Error("Mappings must use report definitions and report permissions.");
    }
    const removed = await db
      .from("pms_report_permissions")
      .delete()
      .eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    if (data.mappings.length > 0) {
      const inserted = await db.from("pms_report_permissions").insert(
        data.mappings.map((row) => ({
          restaurant_id: data.restaurantId,
          definition_id: row.definitionId,
          permission_id: row.permissionId,
        })),
      );
      if (inserted.error) unavailable(inserted.error);
    }
    const after = await loadCard7ReportsSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_REPORTS_PERMISSIONS_AUDIT, {
      before: before.permissionMappings,
      after: after.permissionMappings,
    });
    return { snapshot: after, readiness: evaluateCard7ReportsReadiness(after) };
  });

export const saveCard7ReportPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => policySchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    if (data.exportAllowed && !data.exportCsv && !data.exportPdf) {
      throw new Error("Choose CSV or PDF when exports are allowed.");
    }
    if (data.scheduleIntentEnabled && !data.scheduleCadence) {
      throw new Error("Choose a cadence when schedule intent is enabled.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7ReportsSnapshot(db, data.restaurantId);
    const saved = await db.from("pms_report_policies").upsert(
      {
        restaurant_id: data.restaurantId,
        export_allowed: data.exportAllowed,
        export_csv: data.exportCsv,
        export_pdf: data.exportPdf,
        mask_guest_names: data.maskGuestNames,
        owner_manager_export_only: data.ownerManagerExportOnly,
        default_date_range_days: data.defaultDateRangeDays,
        schedule_intent_enabled: data.scheduleIntentEnabled,
        schedule_cadence: data.scheduleCadence,
        period_basis: data.periodBasis,
        active: data.active,
      },
      { onConflict: "restaurant_id" },
    );
    if (saved.error) unavailable(saved.error);
    const after = await loadCard7ReportsSnapshot(db, data.restaurantId);
    await mirrorSet6Schedule(db, data.restaurantId, after.policy);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_REPORTS_POLICY_AUDIT, {
      before: before.policy,
      after: after.policy,
    });
    return { snapshot: after, readiness: evaluateCard7ReportsReadiness(after) };
  });
