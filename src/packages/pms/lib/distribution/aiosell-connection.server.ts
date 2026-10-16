/**
 * AIOS-03 database writer for Aiosell connection metadata.
 * Calls no Aiosell endpoint and stores no Basic Auth secret.
 */
import type { AiosellEnvironment } from "./aiosell-connection";
import {
  aiosellMappingChannelCode,
  findAiosellConnection,
  listAiosellRateMappings,
  listAiosellRoomMappings,
  planAiosellMetadataSave,
  planAiosellOtaChannel,
  projectAiosellConnectionRead,
  upsertAiosellConnection,
  upsertAiosellRateMapping,
  upsertAiosellRoomMapping,
  type AiosellCatalog,
  type AiosellChannel,
  type AiosellConfig,
  type AiosellConnection,
  type AiosellConnectionState,
} from "./aiosell-connection";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function toConnection(row: {
  id: string;
  restaurant_id: string;
  environment: string;
  partner_slug: string | null;
  external_property_code: string | null;
  enabled: boolean;
  config: unknown;
  last_validated_at: string | null;
  last_error: string | null;
}): AiosellConnection | null {
  if (row.environment !== "sandbox" && row.environment !== "production") return null;
  const config =
    row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? (row.config as AiosellConfig)
      : {};
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    provider: "aiosell",
    environment: row.environment,
    partnerSlug: row.partner_slug ?? "",
    hotelCode: row.external_property_code ?? "",
    status: "pending",
    enabled: row.enabled,
    config,
    lastValidatedAt: row.last_validated_at,
    lastError: row.last_error,
  };
}

async function loadState(db: Admin, restaurantId: string): Promise<AiosellConnectionState> {
  const integrations = await db
    .from("pms_integrations")
    .select(
      "id, restaurant_id, environment, partner_slug, external_property_code, enabled, config, last_validated_at, last_error",
    )
    .eq("restaurant_id", restaurantId)
    .eq("provider", "aiosell");
  fail(integrations.error);
  const connections = (integrations.data ?? []).flatMap((row) => {
    const connection = toConnection(row);
    return connection ? [connection] : [];
  });
  const channelsResult = await db
    .from("distribution_channels")
    .select(
      "id, restaurant_id, integration_id, environment, code, channel_property_code, external_operations, status",
    )
    .eq("restaurant_id", restaurantId);
  fail(channelsResult.error);
  const channels: AiosellChannel[] = (channelsResult.data ?? []).flatMap((row) => {
    if (row.environment !== "sandbox" && row.environment !== "production") return [];
    const mapping =
      row.code === aiosellMappingChannelCode("sandbox") ||
      row.code === aiosellMappingChannelCode("production");
    if (!row.integration_id && !mapping) return [];
    return [
      {
        id: row.id,
        restaurantId: row.restaurant_id,
        integrationId: row.integration_id ?? "",
        environment: row.environment,
        code: row.code,
        role: mapping ? "mapping" : "connected",
        channelPropertyCode: row.channel_property_code,
        operations: row.external_operations ?? [],
        enabled: row.status !== "inactive",
      },
    ];
  });
  const channelIds = channels.filter((row) => row.role === "mapping").map((row) => row.id);
  const roomResult =
    channelIds.length === 0
      ? { data: [], error: null }
      : await db
          .from("distribution_room_mappings")
          .select("id, restaurant_id, channel_id, room_type_id, external_room_code")
          .eq("restaurant_id", restaurantId)
          .in("channel_id", channelIds);
  fail(roomResult.error);
  const rateResult =
    channelIds.length === 0
      ? { data: [], error: null }
      : await db
          .from("distribution_rate_mappings")
          .select(
            "id, restaurant_id, channel_id, rate_plan_id, external_room_code, external_rate_code",
          )
          .eq("restaurant_id", restaurantId)
          .in("channel_id", channelIds);
  fail(rateResult.error);
  return {
    connections,
    channels,
    roomMappings: (roomResult.data ?? []).flatMap((row) =>
      row.external_room_code
        ? [
            {
              id: row.id,
              restaurantId: row.restaurant_id,
              channelId: row.channel_id,
              roomTypeId: row.room_type_id,
              roomCode: row.external_room_code,
            },
          ]
        : [],
    ),
    rateMappings: (rateResult.data ?? []).flatMap((row) =>
      row.external_room_code && row.external_rate_code
        ? [
            {
              id: row.id,
              restaurantId: row.restaurant_id,
              channelId: row.channel_id,
              ratePlanId: row.rate_plan_id,
              roomTypeId: "",
              roomCode: row.external_room_code,
              rateplanCode: row.external_rate_code,
            },
          ]
        : [],
    ),
  };
}

async function saveConnection(db: Admin, connection: AiosellConnection, channel: AiosellChannel) {
  const existingIntegration = await db
    .from("pms_integrations")
    .select("id")
    .eq("restaurant_id", connection.restaurantId)
    .eq("provider", "aiosell")
    .eq("environment", connection.environment)
    .maybeSingle();
  fail(existingIntegration.error);
  const existingChannel = await db
    .from("distribution_channels")
    .select("id")
    .eq("restaurant_id", connection.restaurantId)
    .eq("code", channel.code)
    .maybeSingle();
  fail(existingChannel.error);
  const plan = planAiosellMetadataSave({
    restaurantId: connection.restaurantId,
    environment: connection.environment,
    partnerSlug: connection.partnerSlug,
    hotelCode: connection.hotelCode,
    proposedIntegrationId: connection.id,
    proposedChannelId: channel.id,
    existingIntegration: existingIntegration.data,
    existingChannel: existingChannel.data,
  });
  if (plan.integration.action === "update") {
    const saved = await db
      .from("pms_integrations")
      .update({
        name: plan.integration.name,
        partner_slug: plan.integration.partnerSlug,
        external_property_code: plan.integration.hotelCode,
      })
      .eq("id", plan.integration.id)
      .eq("restaurant_id", connection.restaurantId);
    fail(saved.error);
  } else {
    const saved = await db.from("pms_integrations").insert({
      id: plan.integration.id,
      restaurant_id: plan.integration.restaurantId,
      name: plan.integration.name,
      category: "distribution",
      provider: "aiosell",
      environment: plan.integration.environment,
      status: "pending",
      enabled: true,
      auth_method: "basic",
      config: connection.config,
      partner_slug: plan.integration.partnerSlug,
      external_property_code: plan.integration.hotelCode,
    });
    fail(saved.error);
  }
  if (plan.channel.action === "update") {
    const saved = await db
      .from("distribution_channels")
      .update({
        integration_id: plan.channel.integrationId,
        name: plan.channel.name,
      })
      .eq("id", plan.channel.id)
      .eq("restaurant_id", connection.restaurantId);
    fail(saved.error);
    return;
  }
  const inserted = await db.from("distribution_channels").insert({
    id: plan.channel.id,
    restaurant_id: plan.channel.restaurantId,
    integration_id: plan.channel.integrationId,
    channel_type: "ota",
    code: plan.channel.code,
    name: plan.channel.name,
    status: "not_connected",
    environment: plan.channel.environment,
    mapping_status: "pending",
  });
  fail(inserted.error);
}

export async function getAiosellConnectionRecord(
  restaurantId: string,
  environment: AiosellEnvironment,
): Promise<AiosellConnection | null> {
  const db = await admin();
  const state = await loadState(db, restaurantId);
  return findAiosellConnection(state, restaurantId, environment);
}

export async function upsertAiosellConnectionRecord(input: {
  restaurantId: string;
  provider: string;
  environment: AiosellEnvironment;
  partnerSlug: string;
  hotelCode: string;
  config?: AiosellConfig;
}): Promise<AiosellConnection> {
  const db = await admin();
  const state = await loadState(db, input.restaurantId);
  const connection = upsertAiosellConnection(state, input);
  const channel = state.channels.find(
    (row) => row.code === aiosellMappingChannelCode(connection.environment),
  );
  if (!channel) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  await saveConnection(db, connection, channel);
  return connection;
}

async function loadCatalog(db: Admin, restaurantId: string): Promise<AiosellCatalog> {
  const [roomTypes, rooms, plans] = await Promise.all([
    db.from("room_types").select("id, restaurant_id").eq("restaurant_id", restaurantId),
    db.from("hotel_rooms").select("id, restaurant_id").eq("restaurant_id", restaurantId),
    db
      .from("hotel_rate_plans")
      .select("id, restaurant_id, room_type_id, currency")
      .eq("restaurant_id", restaurantId),
  ]);
  fail(roomTypes.error);
  fail(rooms.error);
  fail(plans.error);
  return {
    roomTypes: (roomTypes.data ?? []).map((row) => ({
      id: row.id,
      restaurantId: row.restaurant_id,
    })),
    physicalRooms: (rooms.data ?? []).map((row) => ({
      id: row.id,
      restaurantId: row.restaurant_id,
    })),
    ratePlans: (plans.data ?? []).map((row) => ({
      id: row.id,
      restaurantId: row.restaurant_id,
      roomTypeId: row.room_type_id,
      currency: row.currency,
    })),
  };
}

export async function upsertAiosellRoomMappingRecord(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  roomTypeId: string;
  roomCode: string;
}) {
  const db = await admin();
  const state = await loadState(db, input.restaurantId);
  const catalog = await loadCatalog(db, input.restaurantId);
  const mapped = upsertAiosellRoomMapping(state, catalog, input);
  const saved = await db.from("distribution_room_mappings").upsert(
    {
      id: mapped.id,
      restaurant_id: mapped.restaurantId,
      channel_id: mapped.channelId,
      room_type_id: mapped.roomTypeId,
      external_room_code: mapped.roomCode,
      active: true,
    },
    { onConflict: "channel_id,room_type_id" },
  );
  fail(saved.error);
  return mapped;
}

export async function upsertAiosellRateMappingRecord(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  ratePlanId: string;
  roomCode: string;
  rateplanCode: string;
}) {
  const db = await admin();
  const state = await loadState(db, input.restaurantId);
  const catalog = await loadCatalog(db, input.restaurantId);
  const mapped = upsertAiosellRateMapping(state, catalog, input);
  const saved = await db.from("distribution_rate_mappings").upsert(
    {
      id: mapped.id,
      restaurant_id: mapped.restaurantId,
      channel_id: mapped.channelId,
      rate_plan_id: mapped.ratePlanId,
      external_room_code: mapped.roomCode,
      external_rate_code: mapped.rateplanCode,
      active: true,
    },
    { onConflict: "channel_id,rate_plan_id" },
  );
  fail(saved.error);
  return mapped;
}

export async function readAiosellConnectionProjection(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  aiosellCurrency: string;
  aiosellTimezone: string;
}) {
  const db = await admin();
  const [state, catalog, property] = await Promise.all([
    loadState(db, input.restaurantId),
    loadCatalog(db, input.restaurantId),
    db
      .from("restaurants")
      .select("currency_code, timezone")
      .eq("id", input.restaurantId)
      .maybeSingle(),
  ]);
  fail(property.error);
  if (!property.data) throw new Error("PROPERTY_NOT_FOUND");
  return projectAiosellConnectionRead({
    state,
    catalog,
    restaurantId: input.restaurantId,
    environment: input.environment,
    propertyCurrency: property.data.currency_code,
    propertyTimezone: property.data.timezone,
    aiosellCurrency: input.aiosellCurrency,
    aiosellTimezone: input.aiosellTimezone,
  });
}

export async function listAiosellRoomMappingRecords(
  restaurantId: string,
  environment: AiosellEnvironment,
) {
  const db = await admin();
  const state = await loadState(db, restaurantId);
  return listAiosellRoomMappings(state, restaurantId, environment);
}

export async function listAiosellRateMappingRecords(
  restaurantId: string,
  environment: AiosellEnvironment,
) {
  const db = await admin();
  const state = await loadState(db, restaurantId);
  return listAiosellRateMappings(state, restaurantId, environment);
}

export async function recordAiosellValidationResult(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  error: string | null;
}) {
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const db = await admin();
  const saved = await db
    .from("pms_integrations")
    .update({
      last_validated_at: new Date().toISOString(),
      last_error: input.error,
    })
    .eq("id", connection.id)
    .eq("restaurant_id", input.restaurantId);
  fail(saved.error);
}

export async function setAiosellRoomMappingActive(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  roomTypeId: string;
  active: boolean;
}) {
  const db = await admin();
  const state = await loadState(db, input.restaurantId);
  const channel = state.channels.find(
    (row) =>
      row.restaurantId === input.restaurantId &&
      row.code === aiosellMappingChannelCode(input.environment) &&
      row.role === "mapping",
  );
  if (!channel) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const saved = await db
    .from("distribution_room_mappings")
    .update({ active: input.active })
    .eq("restaurant_id", input.restaurantId)
    .eq("channel_id", channel.id)
    .eq("room_type_id", input.roomTypeId);
  fail(saved.error);
}

export async function setAiosellRateMappingActive(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  ratePlanId: string;
  active: boolean;
}) {
  const db = await admin();
  const state = await loadState(db, input.restaurantId);
  const channel = state.channels.find(
    (row) =>
      row.restaurantId === input.restaurantId &&
      row.code === aiosellMappingChannelCode(input.environment) &&
      row.role === "mapping",
  );
  if (!channel) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const saved = await db
    .from("distribution_rate_mappings")
    .update({ active: input.active })
    .eq("restaurant_id", input.restaurantId)
    .eq("channel_id", channel.id)
    .eq("rate_plan_id", input.ratePlanId);
  fail(saved.error);
}

export async function activateAiosellBookingChannel(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
}) {
  const db = await admin();
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const existing = await db
    .from("distribution_channels")
    .select("id, restaurant_id, code, environment")
    .eq("restaurant_id", input.restaurantId)
    .eq("code", "booking.com")
    .maybeSingle();
  fail(existing.error);
  const row = existing.data;
  if (row && row.environment !== "sandbox" && row.environment !== "production") {
    throw new Error("AIOSELL_CHANNEL_ENVIRONMENT_CONFLICT");
  }
  const plan = planAiosellOtaChannel({
    restaurantId: input.restaurantId,
    environment: input.environment,
    integrationId: connection.id,
    existing: row
      ? {
          id: row.id,
          restaurantId: row.restaurant_id,
          code: row.code,
          environment: row.environment as AiosellEnvironment,
        }
      : null,
  });
  if (plan.action === "update" && plan.id) {
    const saved = await db
      .from("distribution_channels")
      .update({
        integration_id: plan.integrationId,
        channel_type: plan.channelType,
        status: plan.status,
        name: plan.name,
      })
      .eq("id", plan.id)
      .eq("restaurant_id", input.restaurantId);
    fail(saved.error);
    return;
  }
  const inserted = await db.from("distribution_channels").insert({
    restaurant_id: plan.restaurantId,
    integration_id: plan.integrationId,
    channel_type: plan.channelType,
    code: plan.code,
    name: plan.name,
    status: plan.status,
    environment: plan.environment,
  });
  fail(inserted.error);
}
