/**
 * Card 8 Phase 1 — Offline & Sync policy load/save.
 * Writes pms_offline_* policy tables only. No runtime, queue, or types.ts regen.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { callerMembership } from "@/core/lib/workforce.server";
import { withPmsPackage } from "./pms-package.server";
import { SET1_DENIED, canEditSet1 } from "./pms-set1-foundation";
import { isMissingSchemaError } from "./pms-set2-structure";
import { persistCard8Overall } from "./card8-readiness.functions";
import {
  CARD8_CONFLICT_POLICIES,
  CARD8_FAILED_EVENT_POLICIES,
  CARD8_FINANCIAL_OFFLINE,
  CARD8_OFFLINE_AUDIT,
  CARD8_OFFLINE_AUDIT_SECTION,
  CARD8_OFFLINE_CAPABILITY_CODES,
  CARD8_OFFLINE_UNAVAILABLE,
  CARD8_POLICY_STATES,
  CARD8_SYNC_MODES,
  card8OfflineCapabilityErrors,
  card8OfflinePolicyErrors,
  controlledFinancialFor,
  emptyCard8OfflineCapability,
  emptyCard8OfflinePolicy,
  emptyCard8OfflineSnapshot,
  evaluateCard8OfflineReadiness,
  isCard8CapabilityCode,
  isCard8ConflictPolicy,
  isCard8FailedEventPolicy,
  isCard8FinancialOffline,
  isCard8PolicyState,
  isCard8SyncMode,
  isCard8SyncPriority,
  type Card8OfflineCapabilityRow,
  type Card8OfflinePolicyRow,
  type Card8OfflineSnapshot,
  type Card8SyncPriority,
} from "./pms-property-setup-card8-offline";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DbClient = any;
const idSchema = z.string().uuid();

function pmsDb(client: unknown): DbClient {
  return client as DbClient;
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error && isMissingSchemaError(error)) throw new Error(CARD8_OFFLINE_UNAVAILABLE);
  throw new Error(error?.message ?? CARD8_OFFLINE_UNAVAILABLE);
}

async function writeAudit(
  db: DbClient,
  restaurantId: string,
  userId: string,
  metadata: Record<string, unknown>,
) {
  const result = await db.from("restaurant_staff_audit_log").insert({
    restaurant_id: restaurantId,
    actor_user_id: userId,
    target_user_id: userId,
    action: CARD8_OFFLINE_AUDIT,
    metadata: { section: CARD8_OFFLINE_AUDIT_SECTION, ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card8-offline] audit", result.error.message);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapPolicy(row: Record<string, unknown> | null): Card8OfflinePolicyRow {
  const empty = emptyCard8OfflinePolicy();
  if (!row) return empty;
  const data = row as any;
  return {
    id: data.id ? String(data.id) : null,
    offlineModeEnabled: data.offline_mode_enabled === true,
    configured: data.configured === true,
    cachePreviousDays: Number(data.cache_previous_days ?? empty.cachePreviousDays),
    cacheFutureDays: Number(data.cache_future_days ?? empty.cacheFutureDays),
    syncMode: isCard8SyncMode(data.sync_mode) ? data.sync_mode : empty.syncMode,
    syncIntervalMinutes: Number(data.sync_interval_minutes ?? empty.syncIntervalMinutes),
    retryIntervalMinutes: Number(data.retry_interval_minutes ?? empty.retryIntervalMinutes),
    maximumRetryAttempts: Number(data.maximum_retry_attempts ?? empty.maximumRetryAttempts),
    conflictPolicy: isCard8ConflictPolicy(data.conflict_policy)
      ? data.conflict_policy
      : empty.conflictPolicy,
    failedEventPolicy: isCard8FailedEventPolicy(data.failed_event_policy)
      ? data.failed_event_policy
      : empty.failedEventPolicy,
    financialOfflinePolicy: isCard8FinancialOffline(data.financial_offline_policy)
      ? data.financial_offline_policy
      : empty.financialOfflinePolicy,
    updatedAt: data.updated_at ? String(data.updated_at) : null,
  };
}

function mapCapability(row: Record<string, unknown>): Card8OfflineCapabilityRow | null {
  const data = row as any;
  if (!isCard8CapabilityCode(data.capability_key)) return null;
  const fallback = emptyCard8OfflineCapability(data.capability_key);
  return {
    id: data.id ? String(data.id) : null,
    capabilityKey: data.capability_key,
    policyState: isCard8PolicyState(data.policy_state) ? data.policy_state : fallback.policyState,
    syncPriority: isCard8SyncPriority(data.sync_priority)
      ? (Number(data.sync_priority) as Card8SyncPriority)
      : fallback.syncPriority,
    controlledFinancial: controlledFinancialFor(data.capability_key),
    active: data.active !== false,
  };
}

function mergeCapabilities(rows: Card8OfflineCapabilityRow[]): Card8OfflineCapabilityRow[] {
  const byKey = new Map(rows.map((row) => [row.capabilityKey, row]));
  return CARD8_OFFLINE_CAPABILITY_CODES.map(
    (code) => byKey.get(code) ?? emptyCard8OfflineCapability(code),
  );
}

export async function loadCard8OfflineSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<Card8OfflineSnapshot> {
  const policyRes = await db
    .from("pms_offline_policies")
    .select(
      "id, restaurant_id, offline_mode_enabled, configured, cache_previous_days, cache_future_days, sync_mode, sync_interval_minutes, retry_interval_minutes, maximum_retry_attempts, conflict_policy, failed_event_policy, financial_offline_policy, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (policyRes.error) {
    if (isMissingSchemaError(policyRes.error))
      return emptyCard8OfflineSnapshot({ available: false });
    unavailable(policyRes.error);
  }
  const capabilityRes = await db
    .from("pms_offline_capabilities")
    .select(
      "id, restaurant_id, capability_key, policy_state, sync_priority, controlled_financial, active",
    )
    .eq("restaurant_id", restaurantId);
  if (capabilityRes.error) {
    if (isMissingSchemaError(capabilityRes.error))
      return emptyCard8OfflineSnapshot({ available: false });
    unavailable(capabilityRes.error);
  }
  const mapped = Array.isArray(capabilityRes.data)
    ? capabilityRes.data
        .map((row: unknown) => mapCapability(asRecord(row) ?? {}))
        .filter((row: Card8OfflineCapabilityRow | null): row is Card8OfflineCapabilityRow =>
          Boolean(row),
        )
    : [];
  return {
    available: true,
    policy: mapPolicy(asRecord(policyRes.data)),
    capabilities: mergeCapabilities(mapped),
  };
}

const capabilitySchema = z.object({
  capabilityKey: z.enum(CARD8_OFFLINE_CAPABILITY_CODES),
  policyState: z.enum(CARD8_POLICY_STATES),
  syncPriority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  active: z.boolean(),
});

const saveSchema = z.object({
  restaurantId: idSchema,
  offlineModeEnabled: z.boolean(),
  cachePreviousDays: z.number().int().min(0).max(365),
  cacheFutureDays: z.number().int().min(0).max(365),
  syncMode: z.enum(CARD8_SYNC_MODES),
  syncIntervalMinutes: z.number().int().min(1).max(10080),
  retryIntervalMinutes: z.number().int().min(1).max(1440),
  maximumRetryAttempts: z.number().int().min(0).max(20),
  conflictPolicy: z.enum(CARD8_CONFLICT_POLICIES),
  failedEventPolicy: z.enum(CARD8_FAILED_EVENT_POLICIES),
  financialOfflinePolicy: z.enum(CARD8_FINANCIAL_OFFLINE),
  capabilities: z.array(capabilitySchema).min(7).max(7),
});

export const getCard8OfflinePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadCard8OfflineSnapshot(pmsDb(supabaseAdmin), data.restaurantId);
    return {
      snapshot,
      readiness: evaluateCard8OfflineReadiness(snapshot),
      role: me.role,
      canEdit: canEditSet1(me.role),
    };
  });

export const saveCard8OfflinePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await withPmsPackage(
      data.restaurantId,
      callerMembership(context as never, data.restaurantId),
    );
    if (!canEditSet1(me.role)) throw new Error(SET1_DENIED);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = pmsDb(supabaseAdmin);
    const before = await loadCard8OfflineSnapshot(db, data.restaurantId);
    if (!before.available) throw new Error(CARD8_OFFLINE_UNAVAILABLE);

    const draftPolicy: Card8OfflinePolicyRow = {
      ...emptyCard8OfflinePolicy(),
      ...before.policy,
      offlineModeEnabled: data.offlineModeEnabled,
      configured: true,
      cachePreviousDays: data.cachePreviousDays,
      cacheFutureDays: data.cacheFutureDays,
      syncMode: data.syncMode,
      syncIntervalMinutes: data.syncIntervalMinutes,
      retryIntervalMinutes: data.retryIntervalMinutes,
      maximumRetryAttempts: data.maximumRetryAttempts,
      conflictPolicy: data.conflictPolicy,
      failedEventPolicy: data.failedEventPolicy,
      financialOfflinePolicy: data.financialOfflinePolicy,
    };
    const draftCapabilities = mergeCapabilities(
      data.capabilities.map((row) => ({
        id: null,
        capabilityKey: row.capabilityKey,
        policyState: row.policyState,
        syncPriority: row.syncPriority,
        controlledFinancial: controlledFinancialFor(row.capabilityKey),
        active: row.active,
      })),
    );
    const policyErrors = card8OfflinePolicyErrors(draftPolicy);
    const capabilityErrors = card8OfflineCapabilityErrors(draftCapabilities);
    if (policyErrors.length || capabilityErrors.length) {
      throw new Error([...policyErrors, ...capabilityErrors][0]);
    }

    const payload = {
      restaurant_id: data.restaurantId,
      offline_mode_enabled: draftPolicy.offlineModeEnabled,
      configured: true,
      cache_previous_days: draftPolicy.cachePreviousDays,
      cache_future_days: draftPolicy.cacheFutureDays,
      sync_mode: draftPolicy.syncMode,
      sync_interval_minutes: draftPolicy.syncIntervalMinutes,
      retry_interval_minutes: draftPolicy.retryIntervalMinutes,
      maximum_retry_attempts: draftPolicy.maximumRetryAttempts,
      conflict_policy: draftPolicy.conflictPolicy,
      failed_event_policy: draftPolicy.failedEventPolicy,
      financial_offline_policy: draftPolicy.financialOfflinePolicy,
    };
    const savedPolicy = before.policy.id
      ? await db
          .from("pms_offline_policies")
          .update(payload)
          .eq("id", before.policy.id)
          .eq("restaurant_id", data.restaurantId)
      : await db.from("pms_offline_policies").insert(payload);
    if (savedPolicy.error) unavailable(savedPolicy.error);

    const removed = await db
      .from("pms_offline_capabilities")
      .delete()
      .eq("restaurant_id", data.restaurantId);
    if (removed.error) unavailable(removed.error);
    const inserted = await db.from("pms_offline_capabilities").insert(
      draftCapabilities.map((row) => ({
        restaurant_id: data.restaurantId,
        capability_key: row.capabilityKey,
        policy_state: row.policyState,
        sync_priority: row.syncPriority,
        controlled_financial: row.controlledFinancial,
        active: row.active,
      })),
    );
    if (inserted.error) unavailable(inserted.error);

    const after = await loadCard8OfflineSnapshot(db, data.restaurantId);
    await writeAudit(db, data.restaurantId, context.userId, {
      before: before.policy,
      after: after.policy,
    });
    const overall = await persistCard8Overall(db, data.restaurantId, context.userId, me.role);
    return { ok: true as const, snapshot: after, readiness: overall.offline };
  });
