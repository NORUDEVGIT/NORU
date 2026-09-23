/**
 * Card 7 Phase 2 — Audit load/save and federated read-only viewer.
 * Writes policy/matrix/coverage only. Does not insert domain history or login events.
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
import { emptyAuditRetention } from "./pms-set5-depts-guestsvc";
import {
  CARD7_AUDIT_AUDIT,
  CARD7_AUDIT_AUDIT_SECTION,
  CARD7_AUDIT_CATEGORY_AUDIT,
  CARD7_AUDIT_COVERAGE_AUDIT,
  CARD7_AUDIT_COVERAGE_VALUES,
  CARD7_AUDIT_EVENT_SOURCES,
  CARD7_AUDIT_SEVERITIES,
  CARD7_AUDIT_UNAVAILABLE,
  CARD7_AUDIT_VIEWER_GATE_COPY,
  CARD7_AUDIT_VIEWER_LIMITATIONS,
  categoryCodeForStaffAction,
  deriveEventSeverity,
  emptyAuditPolicy,
  emptyAuditSnapshot,
  evaluateCard7AuditReadiness,
  filterFederatedEvents,
  parseAuditCoverage,
  parseAuditSeverity,
  parseAuditSeverityOverride,
  retentionDaysValid,
  type Card7AuditCategory,
  type Card7AuditCategorySetting,
  type Card7AuditCoverageRow,
  type Card7AuditEvent,
  type Card7AuditEventSource,
  type Card7AuditPolicy,
  type Card7AuditSensitivePermission,
  type Card7AuditSnapshot,
} from "./audit-card7.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;
const idSchema = z.string().uuid();

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(CARD7_AUDIT_UNAVAILABLE);
  throw new Error(error?.message ?? CARD7_AUDIT_UNAVAILABLE);
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
    metadata: { section: CARD7_AUDIT_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card7-audit] audit", result.error.message);
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapCategory(row: Record<string, unknown>): Card7AuditCategory {
  const data = row as any;
  return {
    id: String(data.id),
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    description: String(data.description ?? ""),
    defaultSeverity: parseAuditSeverity(data.default_severity),
    active: data.active !== false,
  };
}

function mapSetting(row: Record<string, unknown>): Card7AuditCategorySetting {
  const data = row as any;
  return {
    id: String(data.id),
    categoryId: String(data.category_id),
    enabled: data.enabled !== false,
    severity: parseAuditSeverityOverride(data.severity),
    critical: data.critical === true,
  };
}

function mapCoverage(row: Record<string, unknown>): Card7AuditCoverageRow {
  const data = row as any;
  return {
    id: String(data.id),
    permissionId: String(data.permission_id),
    coverage: parseAuditCoverage(data.coverage),
    notes: String(data.notes ?? ""),
  };
}

function mapPolicy(row: Record<string, unknown> | null): Card7AuditPolicy {
  if (!row) return emptyAuditPolicy();
  const data = row as any;
  return emptyAuditPolicy({
    exists: true,
    enabled: data.enabled === true,
    retentionDays: data.retention_days == null ? null : Number(data.retention_days),
    maskIdNumbers: data.mask_id_numbers !== false,
    restrictGuestExport: data.restrict_guest_export === true,
    active: data.active !== false,
  });
}

export async function mirrorAuditRetentionPosture(
  db: DbClient,
  restaurantId: string,
  policy: Pick<Card7AuditPolicy, "retentionDays" | "maskIdNumbers" | "restrictGuestExport">,
) {
  const posture = emptyAuditRetention({
    retentionDays: policy.retentionDays,
    maskIdNumbers: policy.maskIdNumbers,
    restrictGuestExport: policy.restrictGuestExport,
    savedAt: new Date().toISOString(),
  });
  const saved = await db
    .from("restaurants")
    .update({ pms_audit_retention_posture: posture as unknown as Json })
    .eq("id", restaurantId);
  if (saved.error && !isMissingSchemaError(saved.error)) throw new Error(saved.error.message);
}

export async function upsertAuditPolicyFromSet5(
  db: DbClient,
  restaurantId: string,
  posture: Pick<Card7AuditPolicy, "retentionDays" | "maskIdNumbers" | "restrictGuestExport">,
) {
  const existing = await db
    .from("pms_audit_policies")
    .select("id, enabled, active")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (existing.error) {
    if (isMissingSchemaError(existing.error)) return;
    throw new Error(existing.error.message);
  }
  const payload = {
    restaurant_id: restaurantId,
    enabled: existing.data?.enabled === true,
    retention_days: posture.retentionDays,
    mask_id_numbers: posture.maskIdNumbers,
    restrict_guest_export: posture.restrictGuestExport,
    active: existing.data?.active !== false,
  };
  const result = existing.data?.id
    ? await db.from("pms_audit_policies").update(payload).eq("id", existing.data.id).eq("restaurant_id", restaurantId)
    : await db.from("pms_audit_policies").insert(payload);
  if (result.error && !isMissingSchemaError(result.error)) throw new Error(result.error.message);
}

export async function loadCard7AuditSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<Card7AuditSnapshot> {
  const categoriesRes = await db
    .from("pms_audit_categories")
    .select("id, code, name, description, default_severity, active")
    .order("code");
  if (categoriesRes.error) unavailable(categoriesRes.error);

  const policyRes = await db
    .from("pms_audit_policies")
    .select("id, enabled, retention_days, mask_id_numbers, restrict_guest_export, active")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (policyRes.error) unavailable(policyRes.error);

  const settingsRes = await db
    .from("pms_audit_category_settings")
    .select("id, category_id, enabled, severity, critical")
    .eq("restaurant_id", restaurantId);
  if (settingsRes.error) unavailable(settingsRes.error);

  const coverageRes = await db
    .from("pms_audit_sensitive_coverage")
    .select("id, permission_id, coverage, notes")
    .eq("restaurant_id", restaurantId);
  if (coverageRes.error) unavailable(coverageRes.error);

  const permissionsRes = await db
    .from("pms_permissions")
    .select("id, code, name, module, active, sensitive")
    .eq("sensitive", true)
    .order("code");
  if (permissionsRes.error) unavailable(permissionsRes.error);

  const sensitivePermissions: Card7AuditSensitivePermission[] = (
    (permissionsRes.data ?? []) as Record<string, unknown>[]
  ).map((row) => {
    const data = row as any;
    return {
      id: String(data.id),
      code: String(data.code ?? ""),
      name: String(data.name ?? ""),
      module: String(data.module ?? ""),
      active: data.active !== false,
    };
  });

  return {
    policy: mapPolicy((policyRes.data ?? null) as Record<string, unknown> | null),
    categories: ((categoriesRes.data ?? []) as Record<string, unknown>[]).map(mapCategory),
    categorySettings: ((settingsRes.data ?? []) as Record<string, unknown>[]).map(mapSetting),
    coverage: ((coverageRes.data ?? []) as Record<string, unknown>[]).map(mapCoverage),
    sensitivePermissions,
  };
}

async function loadActorNames(
  db: DbClient,
  restaurantId: string,
  userIds: string[],
  membershipIds: string[],
): Promise<{ byUser: Map<string, string>; membershipUser: Map<string, string> }> {
  const membershipUser = new Map<string, string>();
  const extraUserIds = [...userIds];
  if (membershipIds.length > 0) {
    const memberships = await db
      .from("restaurant_users")
      .select("id, user_id")
      .eq("restaurant_id", restaurantId)
      .in("id", membershipIds);
    if (!memberships.error) {
      for (const row of (memberships.data ?? []) as Array<{ id: string; user_id: string }>) {
        membershipUser.set(row.id, row.user_id);
        extraUserIds.push(row.user_id);
      }
    }
  }
  const unique = [...new Set(extraUserIds.filter(Boolean))];
  const byUser = new Map<string, string>();
  if (unique.length === 0) return { byUser, membershipUser };
  const profiles = await db.from("profiles").select("id, first_name, last_name, email").in("id", unique);
  if (profiles.error) return { byUser, membershipUser };
  for (const row of (profiles.data ?? []) as Array<{
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  }>) {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    byUser.set(row.id, name || row.email || "Staff member");
  }
  return { byUser, membershipUser };
}

function eventBase(partial: Omit<Card7AuditEvent, "limitations"> & { limitations?: string[] }): Card7AuditEvent {
  return {
    ...partial,
    limitations: partial.limitations ?? [],
  };
}

async function loadSource(
  db: DbClient,
  table: string,
  restaurantId: string,
  from: string | null,
  to: string | null,
  columns: string,
) {
  let query = db.from(table).select(columns).eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(100);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  const result = await query;
  if (result.error) {
    if (isMissingSchemaError(result.error)) return [] as Record<string, unknown>[];
    console.error(`[card7-audit] ${table}`, result.error.message);
    return [] as Record<string, unknown>[];
  }
  return (result.data ?? []) as Record<string, unknown>[];
}

export async function loadCard7AuditEvents(
  db: DbClient,
  restaurantId: string,
  snapshot: Card7AuditSnapshot,
  range: { from: string | null; to: string | null },
): Promise<Card7AuditEvent[]> {
  const [staff, reservations, guests, folios, night, housekeeping, distribution] = await Promise.all([
    loadSource(
      db,
      "restaurant_staff_audit_log",
      restaurantId,
      range.from,
      range.to,
      "id, actor_user_id, target_user_id, action, old_role, new_role, old_active, new_active, metadata, created_at",
    ),
    loadSource(
      db,
      "hotel_reservation_history",
      restaurantId,
      range.from,
      range.to,
      "id, event_type, previous_values, new_values, notes, actor_membership_id, created_at",
    ),
    loadSource(
      db,
      "guest_profile_history",
      restaurantId,
      range.from,
      range.to,
      "id, event_type, previous_values, new_values, notes, actor_membership_id, created_at",
    ),
    loadSource(
      db,
      "folio_history",
      restaurantId,
      range.from,
      range.to,
      "id, event_type, previous_values, new_values, notes, actor_membership_id, created_at",
    ),
    loadSource(
      db,
      "night_audit_runs",
      restaurantId,
      range.from,
      range.to,
      "id, status, notes, summary, started_by_membership_id, created_at",
    ),
    loadSource(
      db,
      "housekeeping_history",
      restaurantId,
      range.from,
      range.to,
      "id, event_type, previous_values, new_values, notes, actor_membership_id, created_at",
    ),
    loadSource(
      db,
      "distribution_logs",
      restaurantId,
      range.from,
      range.to,
      "id, event_type, status, message, payload_summary, created_at",
    ),
  ]);

  const userIds: string[] = [];
  const membershipIds: string[] = [];
  for (const row of staff) if (row.actor_user_id) userIds.push(String(row.actor_user_id));
  for (const row of [...reservations, ...guests, ...folios, ...housekeeping]) {
    if (row.actor_membership_id) membershipIds.push(String(row.actor_membership_id));
  }
  for (const row of night) {
    if (row.started_by_membership_id) membershipIds.push(String(row.started_by_membership_id));
  }
  const names = await loadActorNames(db, restaurantId, userIds, membershipIds);

  function actorFromMembership(membershipId: unknown): { actorUserId: string | null; actorName: string } {
    const membership = membershipId ? String(membershipId) : "";
    const userId = membership ? (names.membershipUser.get(membership) ?? null) : null;
    return {
      actorUserId: userId,
      actorName: userId ? (names.byUser.get(userId) ?? "Staff member") : "Unknown actor",
    };
  }

  const events: Card7AuditEvent[] = [];

  for (const row of staff) {
    const metadata = asRecord(row.metadata);
    const action = String(row.action ?? "");
    const categoryCode = categoryCodeForStaffAction(action, metadata);
    const actorUserId = row.actor_user_id ? String(row.actor_user_id) : null;
    events.push(
      eventBase({
        id: `staff_audit:${String(row.id)}`,
        source: "staff_audit",
        createdAt: String(row.created_at ?? ""),
        action,
        categoryCode,
        module: String(metadata?.section ?? "iam"),
        actorUserId,
        actorName: actorUserId ? (names.byUser.get(actorUserId) ?? "Staff member") : "Unknown actor",
        departmentId: null,
        severity: deriveEventSeverity(categoryCode, snapshot),
        metadata,
        previousValues: { role: row.old_role ?? null, active: row.old_active ?? null },
        newValues: { role: row.new_role ?? null, active: row.new_active ?? null },
        notes: null,
      }),
    );
  }

  function pushHistory(
    source: Card7AuditEventSource,
    categoryCode: string | null,
    module: string,
    row: Record<string, unknown>,
    extraLimitations: string[] = [],
  ) {
    const actor = actorFromMembership(row.actor_membership_id);
    events.push(
      eventBase({
        id: `${source}:${String(row.id)}`,
        source,
        createdAt: String(row.created_at ?? ""),
        action: String(row.event_type ?? ""),
        categoryCode,
        module,
        actorUserId: actor.actorUserId,
        actorName: actor.actorName,
        departmentId: null,
        severity: deriveEventSeverity(categoryCode, snapshot),
        metadata: asRecord(row.new_values),
        previousValues: row.previous_values ?? null,
        newValues: row.new_values ?? null,
        notes: row.notes == null ? null : String(row.notes),
        limitations: extraLimitations,
      }),
    );
  }

  for (const row of reservations) pushHistory("reservation_history", "front_office", "front_office", row);
  for (const row of guests) pushHistory("guest_history", "guest_privacy", "guest", row);
  for (const row of folios) {
    pushHistory("folio_history", "cashiering", "cashiering", row, [
      "folio_history is federated; refund/close writers may not populate this table.",
    ]);
  }
  for (const row of housekeeping) {
    pushHistory("housekeeping", null, "housekeeping", row, [
      "Housekeeping is operational history and is not a Card 7 audit category.",
    ]);
  }

  for (const row of night) {
    const actor = actorFromMembership(row.started_by_membership_id);
    events.push(
      eventBase({
        id: `night_audit:${String(row.id)}`,
        source: "night_audit",
        createdAt: String(row.created_at ?? ""),
        action: String(row.status ?? "night_audit"),
        categoryCode: "night_audit",
        module: "night_audit",
        actorUserId: actor.actorUserId,
        actorName: actor.actorName,
        departmentId: null,
        severity: deriveEventSeverity("night_audit", snapshot),
        metadata: asRecord(row.summary),
        previousValues: null,
        newValues: row.summary ?? null,
        notes: row.notes == null ? null : String(row.notes),
      }),
    );
  }

  for (const row of distribution) {
    events.push(
      eventBase({
        id: `distribution:${String(row.id)}`,
        source: "distribution",
        createdAt: String(row.created_at ?? ""),
        action: String(row.event_type ?? ""),
        categoryCode: "distribution",
        module: "distribution",
        actorUserId: null,
        actorName: "System",
        departmentId: null,
        severity: deriveEventSeverity("distribution", snapshot),
        metadata: asRecord(row.payload_summary),
        previousValues: null,
        newValues: row.payload_summary ?? null,
        notes: row.message == null ? null : String(row.message),
        limitations: ["Distribution logs have no actor or department columns."],
      }),
    );
  }

  events.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return events.slice(0, 200);
}

const policySchema = z.object({
  restaurantId: idSchema,
  enabled: z.boolean(),
  retentionDays: z.number().int().min(1).max(3650),
  maskIdNumbers: z.boolean(),
  restrictGuestExport: z.boolean(),
  active: z.boolean(),
});

const categoriesSchema = z.object({
  restaurantId: idSchema,
  settings: z.array(
    z.object({
      categoryId: idSchema,
      enabled: z.boolean(),
      severity: z.enum(CARD7_AUDIT_SEVERITIES).nullable(),
      critical: z.boolean(),
    }),
  ),
});

const coverageSchema = z.object({
  restaurantId: idSchema,
  rows: z.array(
    z.object({
      permissionId: idSchema,
      coverage: z.enum(CARD7_AUDIT_COVERAGE_VALUES),
      notes: z.string().trim().max(500).optional(),
    }),
  ),
});

const eventsSchema = z.object({
  restaurantId: idSchema,
  from: z.string().optional(),
  to: z.string().optional(),
  query: z.string().optional(),
  source: z.enum(["all", ...CARD7_AUDIT_EVENT_SOURCES]).optional(),
  categoryCode: z.string().optional(),
  action: z.string().optional(),
  actorUserId: z.string().optional(),
  severity: z.enum(["all", ...CARD7_AUDIT_SEVERITIES]).optional(),
});

export const getCard7Audit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard7AuditSnapshot(pmsDb(supabaseAdmin), data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCard7AuditReadiness(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
      canViewEvents: canEditSet1(me.role),
      viewerLimitations: [...CARD7_AUDIT_VIEWER_LIMITATIONS],
    };
  });

export const saveCard7AuditPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => policySchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    if (!retentionDaysValid(data.retentionDays)) {
      throw new Error("Retention days must be between 1 and 3650.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7AuditSnapshot(db, data.restaurantId);
    const payload = {
      restaurant_id: data.restaurantId,
      enabled: data.enabled,
      retention_days: data.retentionDays,
      mask_id_numbers: data.maskIdNumbers,
      restrict_guest_export: data.restrictGuestExport,
      active: data.active,
    };
    const existing = await db
      .from("pms_audit_policies")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (existing.error) unavailable(existing.error);
    const result = existing.data?.id
      ? await db
          .from("pms_audit_policies")
          .update(payload)
          .eq("id", existing.data.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_audit_policies").insert(payload);
    if (result.error) unavailable(result.error);
    await mirrorAuditRetentionPosture(db, data.restaurantId, {
      retentionDays: data.retentionDays,
      maskIdNumbers: data.maskIdNumbers,
      restrictGuestExport: data.restrictGuestExport,
    });
    const after = await loadCard7AuditSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_AUDIT_AUDIT, {
      before: before.policy,
      after: after.policy,
    });
    return { ok: true as const, snapshot: after, readiness: evaluateCard7AuditReadiness(after) };
  });

export const saveCard7AuditCategorySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categoriesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7AuditSnapshot(db, data.restaurantId);
    const categoryIds = new Set(before.categories.map((row) => row.id));
    for (const row of data.settings) {
      if (!categoryIds.has(row.categoryId)) throw new Error("Category settings must use the global catalogue.");
    }
    const removed = await db.from("pms_audit_category_settings").delete().eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    if (data.settings.length > 0) {
      const inserted = await db.from("pms_audit_category_settings").insert(
        data.settings.map((row) => ({
          restaurant_id: data.restaurantId,
          category_id: row.categoryId,
          enabled: row.enabled,
          severity: row.severity,
          critical: row.critical,
        })),
      );
      if (inserted.error) unavailable(inserted.error);
    }
    const after = await loadCard7AuditSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_AUDIT_CATEGORY_AUDIT, {
      before: before.categorySettings,
      after: after.categorySettings,
    });
    return { ok: true as const, snapshot: after, readiness: evaluateCard7AuditReadiness(after) };
  });

export const saveCard7AuditSensitiveCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => coverageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard7AuditSnapshot(db, data.restaurantId);
    const sensitiveIds = new Set(before.sensitivePermissions.map((row) => row.id));
    for (const row of data.rows) {
      if (!sensitiveIds.has(row.permissionId)) {
        throw new Error("Coverage rows must target 0085 sensitive permissions.");
      }
    }
    const removed = await db.from("pms_audit_sensitive_coverage").delete().eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    if (data.rows.length > 0) {
      const inserted = await db.from("pms_audit_sensitive_coverage").insert(
        data.rows.map((row) => ({
          restaurant_id: data.restaurantId,
          permission_id: row.permissionId,
          coverage: row.coverage,
          notes: blankToNull(row.notes),
        })),
      );
      if (inserted.error) unavailable(inserted.error);
    }
    const after = await loadCard7AuditSnapshot(db, data.restaurantId);
    await persistCard7Overall(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, CARD7_AUDIT_COVERAGE_AUDIT, {
      before: before.coverage,
      after: after.coverage,
    });
    return { ok: true as const, snapshot: after, readiness: evaluateCard7AuditReadiness(after) };
  });

export const getCard7AuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => eventsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) {
      return {
        events: [] as Card7AuditEvent[],
        canViewEvents: false,
        viewerLimitations: [...CARD7_AUDIT_VIEWER_LIMITATIONS, CARD7_AUDIT_VIEWER_GATE_COPY],
      };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const snapshot = await loadCard7AuditSnapshot(db, data.restaurantId);
    const loaded = await loadCard7AuditEvents(db, data.restaurantId, snapshot, {
      from: data.from?.trim() ? data.from : null,
      to: data.to?.trim() ? data.to : null,
    });
    return {
      events: filterFederatedEvents(loaded, {
        query: data.query,
        source: data.source,
        categoryCode: data.categoryCode,
        action: data.action,
        actorUserId: data.actorUserId,
        severity: data.severity,
      }),
      canViewEvents: true,
      viewerLimitations: [...CARD7_AUDIT_VIEWER_LIMITATIONS],
    };
  });
