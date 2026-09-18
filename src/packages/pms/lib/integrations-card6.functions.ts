import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { callerMembership } from "@/core/lib/workforce.server";
import { requireRoomManager } from "./rooms.server";
import { withPmsPackage } from "./pms-package.server";
import {
  INTEGRATION_ENVIRONMENTS,
  INTEGRATION_TEST_RESULTS,
  SECRET_KEY_PATTERN,
  integrationWebhookPath,
  statusAfterSave,
  statusAfterSimulatedTest,
  statusAfterToggle,
  type IntegrationActivityEvent,
  type IntegrationActivityRecord,
  type IntegrationRecord,
  type IntegrationStatus,
  type IntegrationsCard6Snapshot,
} from "./integrations-card6.server";
import {
  INTEGRATION_AUTH_METHODS,
  INTEGRATION_CATEGORIES,
  categoryEventValues,
  integrationProvider,
  persistableFieldIds,
} from "./integrations-catalog";

type DbClient = any;

const ACTIVITY_LIMIT = 50;

const idSchema = z.string().uuid();

/**
 * Only scalars are accepted, and the key allowlist is applied after parsing.
 * Zod alone is not trusted to keep credentials out — see sanitizeConfig.
 */
const configSchema = z.record(z.string(), z.union([z.string().max(800), z.number(), z.boolean()]));

const saveSchema = z.object({
  restaurantId: idSchema,
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(80),
  category: z.enum(INTEGRATION_CATEGORIES),
  provider: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/),
  environment: z.enum(INTEGRATION_ENVIRONMENTS),
  authMethod: z.enum(INTEGRATION_AUTH_METHODS),
  enabled: z.boolean(),
  description: z.string().trim().max(400),
  events: z.array(z.string().trim().min(1).max(60)).max(20),
  config: configSchema,
});

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST205") {
    throw new Error("Integrations are unavailable until their approved migration is applied.");
  }
  throw new Error(error?.message ?? "Integrations are unavailable.");
}

/**
 * Second gate on credentials. The drawer already excludes secret fields, but
 * the server rebuilds config from the catalog allowlist rather than trusting
 * whatever the browser sent.
 */
function sanitizeConfig(
  category: string,
  provider: string,
  input: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const allowed = new Set(persistableFieldIds(category, provider));
  const config: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    if (SECRET_KEY_PATTERN.test(key)) continue;
    config[key] = value;
  }
  return config;
}

function mapIntegration(row: any): IntegrationRecord {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    provider: row.provider,
    environment: row.environment,
    status: row.status,
    enabled: row.enabled,
    description: row.description ?? null,
    authMethod: row.auth_method ?? null,
    config: row.config && typeof row.config === "object" ? row.config : {},
    events: Array.isArray(row.events) ? row.events : [],
    webhookPath: row.webhook_path ?? null,
    lastTestAt: row.last_test_at ?? null,
    lastTestResult: row.last_test_result ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActivity(row: any): IntegrationActivityRecord {
  return {
    id: row.id,
    integrationId: row.integration_id ?? null,
    integrationName: row.integration_name,
    event: row.event,
    detail: row.detail ?? null,
    simulated: row.simulated === true,
    createdAt: row.created_at,
  };
}

async function logActivity(
  db: DbClient,
  restaurantId: string,
  userId: string,
  entry: {
    integrationId: string | null;
    integrationName: string;
    event: IntegrationActivityEvent;
    detail: string | null;
    simulated: boolean;
  },
) {
  const result = await db.from("pms_integration_activity").insert({
    restaurant_id: restaurantId,
    integration_id: entry.integrationId,
    integration_name: entry.integrationName,
    event: entry.event,
    detail: entry.detail,
    simulated: entry.simulated,
    actor_user_id: userId,
  });
  if (result.error) console.error("[card6-integrations] activity", result.error.message);
}

async function writeSetupAudit(
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
    metadata: { section: "card6-integrations", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card6-integrations] audit", result.error.message);
}

export async function loadCard6IntegrationsSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<IntegrationsCard6Snapshot> {
  const [integrations, activity] = await Promise.all([
    db
      .from("pms_integrations")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false }),
    db
      .from("pms_integration_activity")
      .select("id, integration_id, integration_name, event, detail, simulated, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ]);
  if (integrations.error) unavailable(integrations.error);
  if (activity.error) unavailable(activity.error);
  return {
    integrations: (integrations.data ?? []).map(mapIntegration),
    activity: (activity.data ?? []).map(mapActivity),
  };
}

async function requireOwnIntegration(db: DbClient, restaurantId: string, id: string) {
  const result = await db
    .from("pms_integrations")
    .select("*")
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("That integration no longer exists.");
  return mapIntegration(result.data);
}

export const getPmsCard6Integrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await withPmsPackage(data.restaurantId, callerMembership(context as never, data.restaurantId));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadCard6IntegrationsSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard6Integration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const providerDef = integrationProvider(data.category, data.provider);
    if (!providerDef) throw new Error("That provider is not available for this integration type.");
    if (!providerDef.authMethods.includes(data.authMethod)) {
      throw new Error("That authentication method is not available for this provider.");
    }
    const allowedEvents = new Set(categoryEventValues(data.category));
    const events = Array.from(new Set(data.events.filter((event) => allowedEvents.has(event))));
    const config = sanitizeConfig(data.category, data.provider, data.config);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = data.id ? await requireOwnIntegration(db, data.restaurantId, data.id) : null;
    const status: IntegrationStatus = statusAfterSave(data.enabled, existing?.status);

    const payload = {
      restaurant_id: data.restaurantId,
      name: data.name,
      category: data.category,
      provider: data.provider,
      environment: data.environment,
      status,
      enabled: data.enabled,
      description: data.description.length > 0 ? data.description : null,
      auth_method: data.authMethod,
      config: config as unknown as Json,
      events,
    };

    let saved: IntegrationRecord;
    if (existing) {
      const result = await db
        .from("pms_integrations")
        .update(payload)
        .eq("id", existing.id)
        .eq("restaurant_id", data.restaurantId)
        .select("*")
        .maybeSingle();
      if (result.error?.code === "23505")
        throw new Error("An integration with that name already exists.");
      if (result.error) unavailable(result.error);
      saved = mapIntegration(result.data);
    } else {
      const result = await db.from("pms_integrations").insert(payload).select("*").maybeSingle();
      if (result.error?.code === "23505")
        throw new Error("An integration with that name already exists.");
      if (result.error) unavailable(result.error);
      saved = mapIntegration(result.data);
    }

    if (providerDef.supportsWebhook && !saved.webhookPath) {
      const path = integrationWebhookPath(data.restaurantId, saved.id);
      const result = await db
        .from("pms_integrations")
        .update({ webhook_path: path })
        .eq("id", saved.id)
        .eq("restaurant_id", data.restaurantId)
        .select("*")
        .maybeSingle();
      if (result.error) unavailable(result.error);
      saved = mapIntegration(result.data);
    }

    await logActivity(db, data.restaurantId, context.userId, {
      integrationId: saved.id,
      integrationName: saved.name,
      event: existing ? "updated" : "created",
      detail: `${saved.provider} · ${saved.environment}`,
      simulated: false,
    });
    await writeSetupAudit(db, data.restaurantId, context.userId, "pms_card6_integration_saved", {
      integrationId: saved.id,
      category: saved.category,
      provider: saved.provider,
      created: !existing,
    });
    return { ok: true as const, integration: saved };
  });

export const setPmsCard6IntegrationEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnIntegration(db, data.restaurantId, data.id);
    const result = await db
      .from("pms_integrations")
      .update({ enabled: data.enabled, status: statusAfterToggle(data.enabled, existing.status) })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("*")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    const saved = mapIntegration(result.data);
    await logActivity(db, data.restaurantId, context.userId, {
      integrationId: saved.id,
      integrationName: saved.name,
      event: data.enabled ? "enabled" : "disabled",
      detail: null,
      simulated: false,
    });
    return { ok: true as const, integration: saved };
  });

export const deletePmsCard6Integration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnIntegration(db, data.restaurantId, data.id);
    const result = await db
      .from("pms_integrations")
      .delete()
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    // integration_id is ON DELETE SET NULL, so the feed keeps the denormalised name.
    await logActivity(db, data.restaurantId, context.userId, {
      integrationId: null,
      integrationName: existing.name,
      event: "deleted",
      detail: null,
      simulated: false,
    });
    await writeSetupAudit(db, data.restaurantId, context.userId, "pms_card6_integration_deleted", {
      category: existing.category,
      provider: existing.provider,
    });
    return { ok: true as const };
  });

/**
 * Records the outcome of a simulated connection test. Nothing here reaches a
 * third party, so a pass leaves the integration pending rather than connected.
 */
export const recordPmsCard6IntegrationTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        id: idSchema,
        result: z.enum(INTEGRATION_TEST_RESULTS),
        detail: z.string().trim().max(400),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireRoomManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnIntegration(db, data.restaurantId, data.id);
    const status = statusAfterSimulatedTest(data.result, existing.enabled);
    const saved = await db
      .from("pms_integrations")
      .update({
        status,
        last_test_at: new Date().toISOString(),
        last_test_result: data.result,
      })
      .eq("id", data.id)
      .eq("restaurant_id", data.restaurantId)
      .select("*")
      .maybeSingle();
    if (saved.error) unavailable(saved.error);
    await logActivity(db, data.restaurantId, context.userId, {
      integrationId: existing.id,
      integrationName: existing.name,
      event: data.result === "passed" ? "test_passed" : "test_failed",
      detail: data.detail.length > 0 ? data.detail : null,
      simulated: true,
    });
    return { ok: true as const, integration: mapIntegration(saved.data) };
  });
