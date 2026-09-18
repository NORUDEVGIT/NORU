import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireDistributionManager } from "./distribution.server";
import {
  DIRECT_CHANNEL_CODE,
  DISTRIBUTION_ENVIRONMENTS,
  DEFAULT_DISTRIBUTION_SYNC_CONFIG,
  asDistributionEnvironment,
  isSelectableDistributionIntegration,
  mappingStatusAfterSave,
  mappingStatusAfterToggle,
  type DistributionChannelDetail,
  type DistributionDraft,
  type DistributionMappingRow,
  type DistributionMappingStatus,
  type DistributionCard6Snapshot,
  type DistributionSyncConfig,
  type EligibleIntegration,
  type MappingPair,
  type NamedEntity,
  normalizeDistributionSyncConfig,
} from "./distribution-card6.server";
import {
  channelSupports,
  distributionChannel,
  distributionChannelLabel,
  distributionProvider,
  draftHasBlockingErrors,
  draftHasIncompleteMappings,
  externalEntityLabel,
  isEligibleDistributionIntegration,
  distributionSyncCapabilities,
  validateDistributionSyncConfig,
  validateDistributionDraft,
} from "./distribution-catalog";
import { SECRET_KEY_PATTERN } from "./integrations-card6.server";

// Supabase's generated schema predates the additive Card 6 migrations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = any;

const idSchema = z.string().uuid();
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/);

const pairSchema = z.object({
  noruId: idSchema,
  externalId: slugSchema,
});

const syncConfigSchema = z
  .object({
    inventory: z
      .object({
        enabled: z.boolean(),
        direction: z.literal("outbound"),
        availability: z.boolean(),
        roomStatus: z.boolean(),
        outOfOrder: z.boolean(),
        outOfService: z.boolean(),
      })
      .strict(),
    rates: z
      .object({
        enabled: z.boolean(),
        direction: z.literal("outbound"),
        rateUpdates: z.boolean(),
        baseRates: z.boolean(),
        derivedRates: z.boolean(),
      })
      .strict(),
    restrictions: z
      .object({
        enabled: z.boolean(),
        minimumStay: z.boolean(),
        maximumStay: z.boolean(),
        closedToArrival: z.boolean(),
        closedToDeparture: z.boolean(),
        stopSell: z.boolean(),
      })
      .strict(),
    frequency: z.literal("manual"),
    automaticSync: z.literal(false),
    retryEnabled: z.literal(false),
    maxRetries: z.literal(0),
  })
  .strict();

const saveSchema = z
  .object({
    restaurantId: idSchema,
    id: idSchema.optional(),
    integrationId: idSchema,
    channel: slugSchema,
    environment: z.enum(DISTRIBUTION_ENVIRONMENTS),
    enabled: z.boolean(),
    rooms: z.array(pairSchema).max(80),
    rates: z.array(pairSchema).max(80),
    meals: z.array(pairSchema).max(80),
    syncConfig: syncConfigSchema.optional(),
  })
  .strict();

function rejectSecrets(payload: unknown) {
  if (!payload || typeof payload !== "object") return;
  for (const key of Object.keys(payload as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(
        "Distribution does not accept credentials. Configure them on the Integrations tab.",
      );
    }
  }
}

function unavailable(error: { code?: string; message?: string } | null): never {
  if (error?.code === "42P01" || error?.code === "PGRST204" || error?.code === "PGRST205") {
    throw new Error("Distribution mapping is unavailable until its approved migration is applied.");
  }
  throw new Error(error?.message ?? "Distribution mapping is unavailable.");
}

function nameOf(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return fallback;
}

function toDraft(data: {
  integrationId: string;
  channel: string;
  environment: "sandbox" | "production";
  rooms: MappingPair[];
  rates: MappingPair[];
  meals: MappingPair[];
}): DistributionDraft {
  return {
    integrationId: data.integrationId,
    channel: data.channel,
    environment: data.environment,
    rooms: data.rooms,
    rates: data.rates,
    meals: data.meals,
  };
}

async function loadEntities(db: DbClient, restaurantId: string) {
  const [rooms, rates, meals, integrations] = await Promise.all([
    db
      .from("room_types")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name"),
    db
      .from("hotel_rate_plans")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name"),
    db
      .from("pms_meal_plans")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name"),
    db
      .from("pms_integrations")
      .select("id, name, provider, environment, status, enabled")
      .eq("restaurant_id", restaurantId)
      .order("name"),
  ]);
  if (rooms.error) unavailable(rooms.error);
  if (rates.error) unavailable(rates.error);
  if (meals.error && meals.error.code !== "42P01" && meals.error.code !== "PGRST205") {
    unavailable(meals.error);
  }
  if (integrations.error) unavailable(integrations.error);

  const roomTypes: NamedEntity[] = rooms.data ?? [];
  const ratePlans: NamedEntity[] = rates.data ?? [];
  const mealPlans: NamedEntity[] = meals.error ? [] : (meals.data ?? []);
  const eligible: EligibleIntegration[] = (integrations.data ?? [])
    .filter((row: { provider: string }) => distributionProvider(row.provider))
    .map(
      (row: {
        id: string;
        name: string;
        provider: string;
        environment: string;
        status: string;
        enabled: boolean;
      }) => ({
        id: row.id,
        name: row.name,
        provider: row.provider,
        environment: asDistributionEnvironment(row.environment),
        status: row.status,
        enabled: row.enabled,
        selectable: isSelectableDistributionIntegration(row),
      }),
    );
  return { roomTypes, ratePlans, mealPlans, integrations: eligible };
}

function mappingRows(
  kind: "rooms" | "rates" | "meals",
  provider: string,
  channel: string,
  rows: Array<{
    id: string;
    noruId: string;
    noruName: string;
    externalId: string | null;
  }>,
): DistributionMappingRow[] {
  return rows
    .filter((row) => Boolean(row.externalId))
    .map((row) => ({
      id: row.id,
      noruId: row.noruId,
      noruName: row.noruName,
      externalId: row.externalId as string,
      externalLabel: externalEntityLabel(provider, channel, kind, row.externalId as string),
    }));
}

async function loadSnapshot(
  db: DbClient,
  restaurantId: string,
): Promise<DistributionCard6Snapshot> {
  const entities = await loadEntities(db, restaurantId);
  const channelsRes = await db
    .from("distribution_channels")
    .select(
      "id, code, name, status, notes, integration_id, environment, mapping_status, sync_config, sync_active, activated_at, created_at, updated_at",
    )
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (channelsRes.error) unavailable(channelsRes.error);

  const [rooms, rates, meals] = await Promise.all([
    db
      .from("distribution_room_mappings")
      .select("id, channel_id, room_type_id, external_entity_id, room_types ( name )")
      .eq("restaurant_id", restaurantId),
    db
      .from("distribution_rate_mappings")
      .select("id, channel_id, rate_plan_id, external_entity_id, hotel_rate_plans ( name )")
      .eq("restaurant_id", restaurantId),
    db
      .from("distribution_meal_mappings")
      .select("id, channel_id, meal_plan_id, external_entity_id, pms_meal_plans ( name )")
      .eq("restaurant_id", restaurantId),
  ]);
  if (rooms.error) unavailable(rooms.error);
  if (rates.error) unavailable(rates.error);
  if (meals.error && meals.error.code !== "42P01" && meals.error.code !== "PGRST205") {
    unavailable(meals.error);
  }

  const integrationById = new Map(entities.integrations.map((row) => [row.id, row]));
  const details: DistributionChannelDetail[] = [];

  for (const row of channelsRes.data ?? []) {
    if (row.code === DIRECT_CHANNEL_CODE) continue;
    if (!row.integration_id) continue;
    const integration = integrationById.get(row.integration_id);
    const provider = integration?.provider ?? "";
    const channel = row.code as string;
    const roomMappings = mappingRows(
      "rooms",
      provider,
      channel,
      (rooms.data ?? [])
        .filter((item: { channel_id: string }) => item.channel_id === row.id)
        .map(
          (item: {
            id: string;
            room_type_id: string;
            external_entity_id: string | null;
            room_types: unknown;
          }) => ({
            id: item.id,
            noruId: item.room_type_id,
            noruName: nameOf(item.room_types, "Room type"),
            externalId: item.external_entity_id,
          }),
        ),
    );
    const rateMappings = mappingRows(
      "rates",
      provider,
      channel,
      (rates.data ?? [])
        .filter((item: { channel_id: string }) => item.channel_id === row.id)
        .map(
          (item: {
            id: string;
            rate_plan_id: string;
            external_entity_id: string | null;
            hotel_rate_plans: unknown;
          }) => ({
            id: item.id,
            noruId: item.rate_plan_id,
            noruName: nameOf(item.hotel_rate_plans, "Rate plan"),
            externalId: item.external_entity_id,
          }),
        ),
    );
    const mealMappings = mappingRows(
      "meals",
      provider,
      channel,
      (meals.data ?? [])
        .filter((item: { channel_id: string }) => item.channel_id === row.id)
        .map(
          (item: {
            id: string;
            meal_plan_id: string;
            external_entity_id: string | null;
            pms_meal_plans: unknown;
          }) => ({
            id: item.id,
            noruId: item.meal_plan_id,
            noruName: nameOf(item.pms_meal_plans, "Meal plan"),
            externalId: item.external_entity_id,
          }),
        ),
    );
    const mappingStatus = (row.mapping_status ?? "pending") as DistributionMappingStatus;
    const syncConfig = normalizeDistributionSyncConfig(row.sync_config);
    const active = row.sync_active === true;
    details.push({
      id: row.id,
      integrationId: row.integration_id,
      integrationName: integration?.name ?? "Integration",
      provider,
      channel,
      channelLabel: distributionChannelLabel(provider, channel) || row.name,
      environment: asDistributionEnvironment(row.environment),
      mappingStatus,
      activationStatus: active ? "active" : "inactive",
      enabled: mappingStatus !== "disabled",
      roomMapped: roomMappings.length,
      roomTotal: entities.roomTypes.length,
      rateMapped: rateMappings.length,
      rateTotal: entities.ratePlans.length,
      mealMapped: mealMappings.length,
      mealTotal: entities.mealPlans.length,
      syncConfig,
      syncStatus: {
        status: active ? "never_synced" : "disabled",
        lastSyncAt: null,
        nextSyncAt: null,
        lastResult: null,
        recordsProcessed: null,
        recordsUpdated: null,
        recordsSkipped: null,
        errorCount: null,
      },
      activatedAt: row.activated_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      roomMappings,
      rateMappings,
      mealMappings,
    });
  }

  return {
    channels: details,
    integrations: entities.integrations,
    roomTypes: entities.roomTypes,
    ratePlans: entities.ratePlans,
    mealPlans: entities.mealPlans,
  };
}

async function requireOwnChannel(db: DbClient, restaurantId: string, id: string) {
  const result = await db
    .from("distribution_channels")
    .select(
      "id, code, name, integration_id, environment, mapping_status, sync_config, sync_active, activated_at",
    )
    .eq("id", id)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (result.error) unavailable(result.error);
  if (!result.data) throw new Error("That distribution configuration no longer exists.");
  if (result.data.code === DIRECT_CHANNEL_CODE) {
    throw new Error("NORU Direct Booking is not configured from this tab.");
  }
  return result.data;
}

async function replaceMappings(
  db: DbClient,
  restaurantId: string,
  channelId: string,
  rooms: MappingPair[],
  rates: MappingPair[],
  meals: MappingPair[],
  mealsSupported: boolean,
) {
  const delRooms = await db
    .from("distribution_room_mappings")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("channel_id", channelId);
  if (delRooms.error) unavailable(delRooms.error);
  const delRates = await db
    .from("distribution_rate_mappings")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("channel_id", channelId);
  if (delRates.error) unavailable(delRates.error);
  const delMeals = await db
    .from("distribution_meal_mappings")
    .delete()
    .eq("restaurant_id", restaurantId)
    .eq("channel_id", channelId);
  if (delMeals.error && delMeals.error.code !== "42P01" && delMeals.error.code !== "PGRST205") {
    unavailable(delMeals.error);
  }

  if (rooms.length > 0) {
    const result = await db.from("distribution_room_mappings").insert(
      rooms.map((row) => ({
        restaurant_id: restaurantId,
        channel_id: channelId,
        room_type_id: row.noruId,
        external_entity_id: row.externalId,
        external_room_code: row.externalId,
        active: true,
      })),
    );
    if (result.error) unavailable(result.error);
  }
  if (rates.length > 0) {
    const result = await db.from("distribution_rate_mappings").insert(
      rates.map((row) => ({
        restaurant_id: restaurantId,
        channel_id: channelId,
        rate_plan_id: row.noruId,
        external_entity_id: row.externalId,
        external_rate_code: row.externalId,
        active: true,
      })),
    );
    if (result.error) unavailable(result.error);
  }
  if (mealsSupported && meals.length > 0) {
    const result = await db.from("distribution_meal_mappings").insert(
      meals.map((row) => ({
        restaurant_id: restaurantId,
        channel_id: channelId,
        meal_plan_id: row.noruId,
        external_entity_id: row.externalId,
        active: true,
      })),
    );
    if (result.error) unavailable(result.error);
  }
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
    metadata: { section: "card6-distribution", ...metadata } as unknown as Json,
  });
  if (result.error) console.error("[card6-distribution] audit", result.error.message);
}

export const getPmsCard6Distribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return loadSnapshot(supabaseAdmin, data.restaurantId);
  });

export const savePmsCard6Distribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    rejectSecrets(input);
    return saveSchema.parse(input);
  })
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    if (data.channel === DIRECT_CHANNEL_CODE.toLowerCase() || data.channel === "direct") {
      throw new Error("NORU Direct Booking is not configured from this tab.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const snapshot = await loadSnapshot(db, data.restaurantId);
    const integration = snapshot.integrations.find((row) => row.id === data.integrationId) ?? null;
    if (!integration) throw new Error("Choose a distribution integration first.");
    if (!isEligibleDistributionIntegration(integration)) {
      throw new Error("That integration is not available for distribution.");
    }
    const channelDef = distributionChannel(integration.provider, data.channel);
    if (!channelDef) throw new Error("That channel is not available for this provider.");

    const rooms = channelSupports(integration.provider, data.channel, "rooms") ? data.rooms : [];
    const rates = channelSupports(integration.provider, data.channel, "rates") ? data.rates : [];
    const meals = channelSupports(integration.provider, data.channel, "meals") ? data.meals : [];
    const checks = validateDistributionDraft(toDraft({ ...data, rooms, rates, meals }), {
      integration,
      roomTypes: snapshot.roomTypes,
      ratePlans: snapshot.ratePlans,
      mealPlans: snapshot.mealPlans,
      takenChannels: snapshot.channels.map((row) => ({
        integrationId: row.integrationId,
        channel: row.channel,
        excludeId: row.id,
      })),
      excludeId: data.id ?? null,
    });
    if (draftHasBlockingErrors(checks)) {
      const first = checks.find((row) => !row.passed && !row.warning);
      throw new Error(first?.detail ?? first?.label ?? "Fix the mapping issues before saving.");
    }

    const mappingStatus = mappingStatusAfterSave(data.enabled, draftHasIncompleteMappings(checks));
    const syncConfig = data.syncConfig ?? DEFAULT_DISTRIBUTION_SYNC_CONFIG;
    const syncChecks = validateDistributionSyncConfig(
      syncConfig,
      distributionSyncCapabilities(integration.provider, data.channel),
    );
    if (draftHasBlockingErrors(syncChecks)) {
      const first = syncChecks.find((row) => !row.passed && !row.warning);
      throw new Error(first?.detail ?? first?.label ?? "Fix the sync settings before saving.");
    }
    const payload = {
      restaurant_id: data.restaurantId,
      channel_type: "ota",
      code: data.channel,
      name: distributionChannelLabel(integration.provider, data.channel),
      status: "not_connected",
      notes: null,
      integration_id: data.integrationId,
      environment: data.environment,
      mapping_status: mappingStatus,
      sync_config: syncConfig as unknown as Json,
      sync_active: false,
      activated_at: null,
    };

    let channelId = data.id;
    if (data.id) {
      const existing = await requireOwnChannel(db, data.restaurantId, data.id);
      const result = await db
        .from("distribution_channels")
        .update(payload)
        .eq("id", existing.id)
        .eq("restaurant_id", data.restaurantId)
        .select("id")
        .maybeSingle();
      if (result.error?.code === "23505") throw new Error("That channel is already configured.");
      if (result.error) unavailable(result.error);
      channelId = result.data?.id;
    } else {
      const result = await db
        .from("distribution_channels")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (result.error?.code === "23505") throw new Error("That channel is already configured.");
      if (result.error) unavailable(result.error);
      channelId = result.data?.id;
    }

    if (!channelId) throw new Error("Could not save the channel.");

    await replaceMappings(
      db,
      data.restaurantId,
      channelId,
      rooms,
      rates,
      meals,
      channelSupports(integration.provider, data.channel, "meals"),
    );
    await writeAudit(db, data.restaurantId, context.userId, "pms_card6_distribution_saved", {
      channelId,
      channel: data.channel,
      provider: integration.provider,
    });
    const next = await loadSnapshot(db, data.restaurantId);
    return {
      ok: true as const,
      channel: next.channels.find((row) => row.id === channelId) ?? null,
    };
  });

export const setPmsCard6DistributionEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, enabled: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnChannel(db, data.restaurantId, data.id);
    const mappingStatus = mappingStatusAfterToggle(
      data.enabled,
      (existing.mapping_status ?? "pending") as DistributionMappingStatus,
    );
    const result = await db
      .from("distribution_channels")
      .update({
        mapping_status: mappingStatus,
        ...(data.enabled ? {} : { sync_active: false, activated_at: null }),
      })
      .eq("id", existing.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card6_distribution_toggled", {
      channelId: existing.id,
      enabled: data.enabled,
    });
    return { ok: true as const };
  });

export const setPmsCard6DistributionActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema, active: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnChannel(db, data.restaurantId, data.id);

    if (data.active) {
      if ((existing.mapping_status ?? "pending") === "disabled") {
        throw new Error("Enable this distribution before activating it.");
      }
      const snapshot = await loadSnapshot(db, data.restaurantId);
      const channel = snapshot.channels.find((row) => row.id === data.id);
      if (!channel) throw new Error("That distribution configuration no longer exists.");
      const integration =
        snapshot.integrations.find((row) => row.id === channel.integrationId) ?? null;
      const mappingChecks = validateDistributionDraft(
        toDraft({
          integrationId: channel.integrationId,
          channel: channel.channel,
          environment: channel.environment,
          rooms: channel.roomMappings.map((row) => ({
            noruId: row.noruId,
            externalId: row.externalId,
          })),
          rates: channel.rateMappings.map((row) => ({
            noruId: row.noruId,
            externalId: row.externalId,
          })),
          meals: channel.mealMappings.map((row) => ({
            noruId: row.noruId,
            externalId: row.externalId,
          })),
        }),
        {
          integration,
          roomTypes: snapshot.roomTypes,
          ratePlans: snapshot.ratePlans,
          mealPlans: snapshot.mealPlans,
          takenChannels: snapshot.channels.map((row) => ({
            integrationId: row.integrationId,
            channel: row.channel,
            excludeId: row.id,
          })),
          excludeId: channel.id,
        },
      );
      const syncChecks = validateDistributionSyncConfig(
        channel.syncConfig,
        distributionSyncCapabilities(channel.provider, channel.channel),
      );
      const blocking = [...mappingChecks, ...syncChecks].find((row) => !row.passed);
      if (blocking) {
        throw new Error(blocking.detail ?? blocking.label);
      }
    }

    const result = await db
      .from("distribution_channels")
      .update({
        sync_active: data.active,
        activated_at: data.active ? new Date().toISOString() : null,
      })
      .eq("id", existing.id)
      .eq("restaurant_id", data.restaurantId)
      .select("id")
      .maybeSingle();
    if (result.error) unavailable(result.error);
    await writeAudit(
      db,
      data.restaurantId,
      context.userId,
      data.active ? "pms_card6_distribution_activated" : "pms_card6_distribution_deactivated",
      { channelId: existing.id },
    );
    return { ok: true as const };
  });

export const deletePmsCard6Distribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, id: idSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as DbClient;
    const existing = await requireOwnChannel(db, data.restaurantId, data.id);
    const result = await db
      .from("distribution_channels")
      .delete()
      .eq("id", existing.id)
      .eq("restaurant_id", data.restaurantId);
    if (result.error) unavailable(result.error);
    await writeAudit(db, data.restaurantId, context.userId, "pms_card6_distribution_deleted", {
      channelId: existing.id,
      code: existing.code,
    });
    return { ok: true as const };
  });

export const validatePmsCard6Distribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    rejectSecrets(input);
    return saveSchema.parse(input);
  })
  .handler(async ({ data, context }) => {
    await requireDistributionManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = await loadSnapshot(supabaseAdmin, data.restaurantId);
    const integration = snapshot.integrations.find((row) => row.id === data.integrationId) ?? null;
    const mappingChecks = validateDistributionDraft(toDraft(data), {
      integration,
      roomTypes: snapshot.roomTypes,
      ratePlans: snapshot.ratePlans,
      mealPlans: snapshot.mealPlans,
      takenChannels: snapshot.channels.map((row) => ({
        integrationId: row.integrationId,
        channel: row.channel,
        excludeId: row.id,
      })),
      excludeId: data.id ?? null,
    });
    const checks = [
      ...mappingChecks,
      ...validateDistributionSyncConfig(
        data.syncConfig ?? DEFAULT_DISTRIBUTION_SYNC_CONFIG,
        distributionSyncCapabilities(integration?.provider ?? "", data.channel),
      ),
    ];
    return { checks, blocking: draftHasBlockingErrors(checks) };
  });
