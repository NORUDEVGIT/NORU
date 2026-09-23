/**
 * Card 7 Phase 4 — Data Import setup load/save.
 * Writes governance tables only. Never parses files or calls domain writers.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callerMembership } from "@/core/lib/workforce.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { persistCard7Overall } from "./card7-readiness.functions";
import {
  CARD7_IMPORT_AUDIT_SECTION,
  CARD7_IMPORT_DUPLICATE_ACTIONS,
  CARD7_IMPORT_DUPLICATES_AUDIT,
  CARD7_IMPORT_POLICY_AUDIT,
  CARD7_IMPORT_RULE_KINDS,
  CARD7_IMPORT_TEMPLATES_AUDIT,
  CARD7_IMPORT_TYPES_AUDIT,
  CARD7_IMPORT_UNAVAILABLE,
  CARD7_IMPORT_VALIDATION_AUDIT,
  CARD7_SUPPORTED_IMPORT_CODES,
  emptyImportPolicy,
  evaluateCard7ImportReadiness,
  parseImportDuplicateAction,
  parseImportJobStatus,
  parseImportRuleKind,
  parseImportValueKind,
  supportedImportTypes,
  type Card7ImportDuplicatePolicy,
  type Card7ImportFieldDefinition,
  type Card7ImportJob,
  type Card7ImportJobIssue,
  type Card7ImportMappingField,
  type Card7ImportMappingTemplate,
  type Card7ImportPolicy,
  type Card7ImportSnapshot,
  type Card7ImportType,
  type Card7ImportTypeSetting,
  type Card7ImportValidationRule,
} from "./import-card7.server";
import { withPmsPackage } from "./pms-package.server";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;
const idSchema = z.string().uuid();

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(CARD7_IMPORT_UNAVAILABLE);
  throw new Error(error?.message ?? CARD7_IMPORT_UNAVAILABLE);
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
    metadata: { section: CARD7_IMPORT_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card7-import] audit", result.error.message);
}

function mapType(row: Record<string, unknown>): Card7ImportType {
  const data = row as any;
  return {
    id: String(data.id),
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    handlerKey: String(data.handler_key ?? ""),
    active: data.active !== false,
  };
}

function mapTypeSetting(row: Record<string, unknown>): Card7ImportTypeSetting {
  const data = row as any;
  return {
    id: String(data.id),
    importTypeId: String(data.import_type_id),
    enabled: data.enabled !== false,
  };
}

function mapField(row: Record<string, unknown>): Card7ImportFieldDefinition {
  const data = row as any;
  return {
    id: String(data.id),
    importTypeId: String(data.import_type_id),
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    required: data.required === true,
    valueKind: parseImportValueKind(data.value_kind),
    active: data.active !== false,
  };
}

function mapTemplate(row: Record<string, unknown>): Omit<Card7ImportMappingTemplate, "fields"> {
  const data = row as any;
  return {
    id: String(data.id),
    importTypeId: String(data.import_type_id),
    name: String(data.name ?? ""),
    active: data.active !== false,
  };
}

function mapTemplateField(row: Record<string, unknown>): Card7ImportMappingField {
  const data = row as any;
  return {
    id: String(data.id),
    templateId: String(data.template_id),
    fieldDefinitionId: String(data.field_definition_id),
    sourceColumn: String(data.source_column ?? ""),
  };
}

function mapValidation(row: Record<string, unknown>): Card7ImportValidationRule {
  const data = row as any;
  return {
    id: String(data.id),
    importTypeId: String(data.import_type_id),
    fieldCode: String(data.field_code ?? ""),
    ruleKind: parseImportRuleKind(data.rule_kind),
    enabled: data.enabled !== false,
  };
}

function mapDuplicate(row: Record<string, unknown>): Card7ImportDuplicatePolicy {
  const data = row as any;
  return {
    id: String(data.id),
    importTypeId: String(data.import_type_id),
    matchKeys: String(data.match_keys ?? ""),
    action: parseImportDuplicateAction(data.action),
  };
}

function mapPolicy(row: Record<string, unknown> | null): Card7ImportPolicy {
  if (!row) return emptyImportPolicy();
  const data = row as any;
  return emptyImportPolicy({
    exists: true,
    enabled: data.enabled === true,
    previewRequired: data.preview_required !== false,
    maxRows: Number(data.max_rows ?? 500),
    ownerManagerExecuteOnly: data.owner_manager_execute_only !== false,
    active: data.active !== false,
  });
}

function mapJob(row: Record<string, unknown>): Card7ImportJob {
  const data = row as any;
  return {
    id: String(data.id),
    importTypeId: String(data.import_type_id),
    status: parseImportJobStatus(data.status),
    originalFilename: data.original_filename == null ? null : String(data.original_filename),
    rowCount: data.row_count == null ? null : Number(data.row_count),
    notes: data.notes == null ? null : String(data.notes),
    createdAt: String(data.created_at ?? ""),
  };
}

function mapIssue(row: Record<string, unknown>): Card7ImportJobIssue {
  const data = row as any;
  return {
    id: String(data.id),
    jobId: String(data.job_id),
    severity: data.severity === "warning" ? "warning" : "error",
    rowNumber: data.row_number == null ? null : Number(data.row_number),
    code: String(data.code ?? ""),
    message: String(data.message ?? ""),
  };
}

export async function loadCard7ImportSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<Card7ImportSnapshot> {
  const [
    typesRes,
    settingsRes,
    fieldsRes,
    templatesRes,
    templateFieldsRes,
    validationRes,
    duplicatesRes,
    policyRes,
    jobsRes,
    issuesRes,
  ] = await Promise.all([
    db.from("pms_import_types").select("id, code, name, description, handler_key, active").order("code"),
    db
      .from("pms_import_type_settings")
      .select("id, import_type_id, enabled")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_import_field_definitions")
      .select("id, import_type_id, code, name, required, value_kind, active")
      .order("code"),
    db
      .from("pms_import_mapping_templates")
      .select("id, import_type_id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name"),
    db
      .from("pms_import_mapping_template_fields")
      .select("id, template_id, field_definition_id, source_column")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_import_validation_rules")
      .select("id, import_type_id, field_code, rule_kind, enabled")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_import_duplicate_policies")
      .select("id, import_type_id, match_keys, action")
      .eq("restaurant_id", restaurantId),
    db
      .from("pms_import_policies")
      .select(
        "id, enabled, preview_required, max_rows, allowed_format, owner_manager_execute_only, active",
      )
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    db
      .from("pms_import_jobs")
      .select("id, import_type_id, status, original_filename, row_count, notes, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false }),
    db
      .from("pms_import_job_issues")
      .select("id, job_id, severity, row_number, code, message")
      .eq("restaurant_id", restaurantId),
  ]);

  for (const response of [
    typesRes,
    settingsRes,
    fieldsRes,
    templatesRes,
    templateFieldsRes,
    validationRes,
    duplicatesRes,
    policyRes,
    jobsRes,
    issuesRes,
  ]) {
    if (response.error) unavailable(response.error);
  }

  const allowed = new Set<string>(CARD7_SUPPORTED_IMPORT_CODES);
  const types = ((typesRes.data ?? []) as Record<string, unknown>[])
    .map(mapType)
    .filter((row) => allowed.has(row.code));
  const typeIds = new Set(types.map((row) => row.id));
  const fieldsByTemplate = new Map<string, Card7ImportMappingField[]>();
  for (const field of ((templateFieldsRes.data ?? []) as Record<string, unknown>[]).map(
    mapTemplateField,
  )) {
    const list = fieldsByTemplate.get(field.templateId) ?? [];
    list.push(field);
    fieldsByTemplate.set(field.templateId, list);
  }

  return {
    types,
    typeSettings: ((settingsRes.data ?? []) as Record<string, unknown>[])
      .map(mapTypeSetting)
      .filter((row) => typeIds.has(row.importTypeId)),
    fields: ((fieldsRes.data ?? []) as Record<string, unknown>[])
      .map(mapField)
      .filter((row) => typeIds.has(row.importTypeId)),
    templates: ((templatesRes.data ?? []) as Record<string, unknown>[])
      .map(mapTemplate)
      .filter((row) => typeIds.has(row.importTypeId))
      .map((template) => ({
        ...template,
        fields: fieldsByTemplate.get(template.id) ?? [],
      })),
    validationRules: ((validationRes.data ?? []) as Record<string, unknown>[])
      .map(mapValidation)
      .filter((row) => typeIds.has(row.importTypeId)),
    duplicatePolicies: ((duplicatesRes.data ?? []) as Record<string, unknown>[])
      .map(mapDuplicate)
      .filter((row) => typeIds.has(row.importTypeId)),
    policy: mapPolicy((policyRes.data ?? null) as Record<string, unknown> | null),
    jobs: ((jobsRes.data ?? []) as Record<string, unknown>[])
      .map(mapJob)
      .filter((row) => typeIds.has(row.importTypeId)),
    jobIssues: ((issuesRes.data ?? []) as Record<string, unknown>[]).map(mapIssue),
    historyAvailable: true,
  };
}

async function requireEditor(restaurantId: string, context: unknown) {
  const me = await withPmsPackage(
    restaurantId,
    callerMembership(context as never, restaurantId),
  );
  if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
  return me;
}

function assertSupportedTypes(snapshot: Card7ImportSnapshot, importTypeIds: string[]) {
  const allowed = new Set(supportedImportTypes(snapshot).map((row) => row.id));
  if (importTypeIds.some((id) => !allowed.has(id))) {
    throw new Error("Import settings must use supported types only.");
  }
}

export const getCard7Import = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard7ImportSnapshot(pmsDb(supabaseAdmin), data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCard7ImportReadiness(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

export const saveCard7ImportPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        enabled: z.boolean(),
        previewRequired: z.boolean(),
        maxRows: z.number().int().min(1).max(10000),
        ownerManagerExecuteOnly: z.boolean(),
        active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7ImportSnapshot(db, data.restaurantId);
    const saved = await db.from("pms_import_policies").upsert(
      {
        restaurant_id: data.restaurantId,
        enabled: data.enabled,
        preview_required: data.previewRequired,
        max_rows: data.maxRows,
        allowed_format: "csv",
        owner_manager_execute_only: data.ownerManagerExecuteOnly,
        active: data.active,
      },
      { onConflict: "restaurant_id" },
    );
    if (saved.error) unavailable(saved.error);
    const after = await loadCard7ImportSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_IMPORT_POLICY_AUDIT, {
      before: before.policy,
      after: after.policy,
    });
    return { snapshot: after, readiness: evaluateCard7ImportReadiness(after) };
  });

export const saveCard7ImportTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        settings: z.array(z.object({ importTypeId: idSchema, enabled: z.boolean() })),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7ImportSnapshot(db, data.restaurantId);
    assertSupportedTypes(
      before,
      data.settings.map((row) => row.importTypeId),
    );
    const removed = await db
      .from("pms_import_type_settings")
      .delete()
      .eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    if (data.settings.length > 0) {
      const inserted = await db.from("pms_import_type_settings").insert(
        data.settings.map((row) => ({
          restaurant_id: data.restaurantId,
          import_type_id: row.importTypeId,
          enabled: row.enabled,
        })),
      );
      if (inserted.error) unavailable(inserted.error);
    }
    const after = await loadCard7ImportSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_IMPORT_TYPES_AUDIT, {
      before: before.typeSettings,
      after: after.typeSettings,
    });
    return { snapshot: after, readiness: evaluateCard7ImportReadiness(after) };
  });

export const saveCard7ImportTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        templates: z.array(
          z.object({
            importTypeId: idSchema,
            name: z.string().trim().min(1).max(80),
            active: z.boolean(),
            fields: z.array(
              z.object({
                fieldDefinitionId: idSchema,
                sourceColumn: z.string().trim().min(1).max(80),
              }),
            ),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7ImportSnapshot(db, data.restaurantId);
    assertSupportedTypes(
      before,
      data.templates.map((row) => row.importTypeId),
    );
    const fieldsByType = new Map<string, Set<string>>();
    for (const field of before.fields) {
      const set = fieldsByType.get(field.importTypeId) ?? new Set<string>();
      set.add(field.id);
      fieldsByType.set(field.importTypeId, set);
    }
    for (const template of data.templates) {
      const allowed = fieldsByType.get(template.importTypeId) ?? new Set<string>();
      if (template.fields.some((field) => !allowed.has(field.fieldDefinitionId))) {
        throw new Error("Mapping templates may only use approved Noru fields.");
      }
    }
    const removed = await db
      .from("pms_import_mapping_templates")
      .delete()
      .eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    for (const template of data.templates) {
      const inserted = await db
        .from("pms_import_mapping_templates")
        .insert({
          restaurant_id: data.restaurantId,
          import_type_id: template.importTypeId,
          name: template.name,
          active: template.active,
        })
        .select("id")
        .single();
      if (inserted.error) unavailable(inserted.error);
      if (template.fields.length > 0) {
        const fields = await db.from("pms_import_mapping_template_fields").insert(
          template.fields.map((field) => ({
            restaurant_id: data.restaurantId,
            template_id: inserted.data.id,
            field_definition_id: field.fieldDefinitionId,
            source_column: field.sourceColumn,
          })),
        );
        if (fields.error) unavailable(fields.error);
      }
    }
    const after = await loadCard7ImportSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_IMPORT_TEMPLATES_AUDIT, {
      before: before.templates,
      after: after.templates,
    });
    return { snapshot: after, readiness: evaluateCard7ImportReadiness(after) };
  });

export const saveCard7ImportValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        rules: z.array(
          z.object({
            importTypeId: idSchema,
            fieldCode: z.string().trim().min(1).max(40),
            ruleKind: z.enum(CARD7_IMPORT_RULE_KINDS),
            enabled: z.boolean(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7ImportSnapshot(db, data.restaurantId);
    assertSupportedTypes(
      before,
      data.rules.map((row) => row.importTypeId),
    );
    const allowedCodes = new Set(
      before.fields.map((field) => `${field.importTypeId}:${field.code}`),
    );
    if (data.rules.some((row) => !allowedCodes.has(`${row.importTypeId}:${row.fieldCode}`))) {
      throw new Error("Validation rules must use approved field codes.");
    }
    const removed = await db
      .from("pms_import_validation_rules")
      .delete()
      .eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    if (data.rules.length > 0) {
      const inserted = await db.from("pms_import_validation_rules").insert(
        data.rules.map((row) => ({
          restaurant_id: data.restaurantId,
          import_type_id: row.importTypeId,
          field_code: row.fieldCode,
          rule_kind: row.ruleKind,
          enabled: row.enabled,
        })),
      );
      if (inserted.error) unavailable(inserted.error);
    }
    const after = await loadCard7ImportSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_IMPORT_VALIDATION_AUDIT, {
      before: before.validationRules,
      after: after.validationRules,
    });
    return { snapshot: after, readiness: evaluateCard7ImportReadiness(after) };
  });

export const saveCard7ImportDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        policies: z.array(
          z.object({
            importTypeId: idSchema,
            matchKeys: z.string().trim().min(1).max(120),
            action: z.enum(CARD7_IMPORT_DUPLICATE_ACTIONS),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(data.restaurantId, context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7ImportSnapshot(db, data.restaurantId);
    assertSupportedTypes(
      before,
      data.policies.map((row) => row.importTypeId),
    );
    const removed = await db
      .from("pms_import_duplicate_policies")
      .delete()
      .eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    if (data.policies.length > 0) {
      const inserted = await db.from("pms_import_duplicate_policies").insert(
        data.policies.map((row) => ({
          restaurant_id: data.restaurantId,
          import_type_id: row.importTypeId,
          match_keys: blankToNull(row.matchKeys) ?? row.matchKeys,
          action: row.action,
        })),
      );
      if (inserted.error) unavailable(inserted.error);
    }
    const after = await loadCard7ImportSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_IMPORT_DUPLICATES_AUDIT, {
      before: before.duplicatePolicies,
      after: after.duplicatePolicies,
    });
    return { snapshot: after, readiness: evaluateCard7ImportReadiness(after) };
  });
