import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findAiosellConnection,
  listAiosellRateMappings,
  listAiosellRoomMappings,
  planAiosellMetadataSave,
  planAiosellOtaChannel,
  projectAiosellConnectionRead,
  upsertAiosellConnectedChannel,
  upsertAiosellConnection,
  upsertAiosellRateMapping,
  upsertAiosellRoomMapping,
  validateAiosellCurrencyCompatibility,
  validateAiosellTimezoneCompatibility,
  type AiosellCatalog,
  type AiosellConnectionState,
} from "./aiosell-connection";

function read(name: string) {
  return readFileSync(resolve(process.cwd(), name), "utf8");
}

const propertyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const propertyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const roomTypeA = "11111111-1111-1111-1111-111111111111";
const roomTypeB = "22222222-2222-2222-2222-222222222222";
const physicalRoom = "33333333-3333-3333-3333-333333333333";
const ratePlanA = "44444444-4444-4444-4444-444444444444";
const ratePlanB = "55555555-5555-5555-5555-555555555555";
const ratePlanOther = "66666666-6666-6666-6666-666666666666";
const ratePlanSameRoom = "77777777-7777-7777-7777-777777777777";

function emptyState(): AiosellConnectionState {
  return { connections: [], channels: [], roomMappings: [], rateMappings: [] };
}

function catalog(): AiosellCatalog {
  return {
    roomTypes: [
      { id: roomTypeA, restaurantId: propertyA },
      { id: roomTypeB, restaurantId: propertyA },
    ],
    physicalRooms: [{ id: physicalRoom, restaurantId: propertyA }],
    ratePlans: [
      { id: ratePlanA, restaurantId: propertyA, roomTypeId: roomTypeA, currency: "INR" },
      { id: ratePlanB, restaurantId: propertyA, roomTypeId: roomTypeB, currency: "INR" },
      { id: ratePlanSameRoom, restaurantId: propertyA, roomTypeId: roomTypeA, currency: "INR" },
      { id: ratePlanOther, restaurantId: propertyB, roomTypeId: roomTypeA, currency: "INR" },
    ],
  };
}

function connect(
  state: AiosellConnectionState,
  overrides: {
    environment?: "sandbox" | "production";
    hotelCode?: string;
    partnerSlug?: string;
  } = {},
) {
  return upsertAiosellConnection(state, {
    restaurantId: propertyA,
    provider: "Aiosell",
    environment: overrides.environment ?? "sandbox",
    partnerSlug: overrides.partnerSlug ?? "partner-east",
    hotelCode: overrides.hotelCode ?? "Hotel-East",
  });
}

function readyInput(
  state: AiosellConnectionState,
  overrides: Partial<{
    aiosellCurrency: string;
    aiosellTimezone: string;
    propertyCurrency: string;
    propertyTimezone: string;
    environment: "sandbox" | "production";
  }> = {},
) {
  return projectAiosellConnectionRead({
    state,
    catalog: catalog(),
    restaurantId: propertyA,
    environment: overrides.environment ?? "sandbox",
    propertyCurrency: overrides.propertyCurrency ?? "INR",
    propertyTimezone: overrides.propertyTimezone ?? "Asia/Kolkata",
    aiosellCurrency: overrides.aiosellCurrency ?? "INR",
    aiosellTimezone: overrides.aiosellTimezone ?? "Asia/Kolkata",
  });
}

describe("AIOS-03 Aiosell connection and mappings", () => {
  const migration = read("drizzle/migrations/0163_aiosell_connection_metadata.sql");
  const migrationCopy = read("supabase/migrations/0163_aiosell_connection_metadata.sql");
  const source = read("src/packages/pms/lib/distribution/aiosell-connection.ts");
  const server = read("src/packages/pms/lib/distribution/aiosell-connection.server.ts");

  it("locks connection columns without secrets or a second mapping table", () => {
    expect(migrationCopy).toBe(migration);
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS partner_slug text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS external_property_code text");
    expect(migration).toContain("pms_integrations_aiosell_active_unique");
    expect(migration).toContain("distribution_room_mappings_external_code_unique");
    expect(migration).toContain("external_room_code");
    expect(migration).not.toContain("ADD COLUMN IF NOT EXISTS password");
    expect(migration).not.toContain("ADD COLUMN IF NOT EXISTS username");
    expect(migration).not.toContain(
      "CREATE OR REPLACE FUNCTION public.pms_integration_config_is_safe",
    );
    expect(migration).not.toContain("ALTER TABLE public.hotel_reservations");
    expect(migration).not.toContain("CREATE TABLE public.distribution_room_mappings");
    expect(migration).not.toContain("CREATE TABLE public.distribution_rate_mappings");
    expect(source).not.toContain("pms_exchange_rates");
    expect(source).not.toContain("live.aiosell");
    expect(source).not.toContain("fetch(");
    expect(server).not.toContain("live.aiosell");
    expect(server).not.toContain("fetch(");
    expect(server).not.toContain("password");
  });

  it("stores partner slug and hotelCode separately and reads them back", () => {
    const state = emptyState();
    const created = connect(state);
    const read = findAiosellConnection(state, propertyA, "sandbox");
    expect(created.provider).toBe("aiosell");
    expect(read?.id).toBe(created.id);
    expect(read?.partnerSlug).toBe("partner-east");
    expect(read?.hotelCode).toBe("Hotel-East");
    expect(read?.partnerSlug).not.toBe(read?.hotelCode);
    expect(read?.config).toEqual({});
  });

  it("keeps a sandbox connection out of the production read", () => {
    const state = emptyState();
    connect(state, { hotelCode: "Hotel-Sandbox" });
    connect(state, {
      environment: "production",
      hotelCode: "Hotel-Live",
      partnerSlug: "partner-live",
    });
    expect(findAiosellConnection(state, propertyA, "sandbox")?.hotelCode).toBe("Hotel-Sandbox");
    expect(findAiosellConnection(state, propertyA, "production")?.hotelCode).toBe("Hotel-Live");
  });

  it("rejects secret-shaped connection config", () => {
    const state = emptyState();
    expect(() =>
      upsertAiosellConnection(state, {
        restaurantId: propertyA,
        provider: "aiosell",
        environment: "sandbox",
        partnerSlug: "partner-east",
        hotelCode: "Hotel-East",
        config: { password: "hidden" },
      }),
    ).toThrow("AIOSELL_CONFIG_SECRET");
    expect(() =>
      upsertAiosellConnection(state, {
        restaurantId: propertyA,
        provider: "aiosell",
        environment: "sandbox",
        partnerSlug: "partner-east",
        hotelCode: "Hotel-East",
        config: { username: "hidden" },
      }),
    ).toThrow("AIOSELL_CONFIG_SECRET");
    expect(state.connections).toHaveLength(0);
  });

  it("maps a room type to an exact roomCode and rejects conflicts", () => {
    const state = emptyState();
    connect(state);
    const mapped = upsertAiosellRoomMapping(state, catalog(), {
      restaurantId: propertyA,
      environment: "sandbox",
      roomTypeId: roomTypeA,
      roomCode: "Executive ",
    });
    expect(listAiosellRoomMappings(state, propertyA, "sandbox")[0]?.roomCode).toBe("Executive ");
    const again = upsertAiosellRoomMapping(state, catalog(), {
      restaurantId: propertyA,
      environment: "sandbox",
      roomTypeId: roomTypeA,
      roomCode: "Executive ",
    });
    expect(again.id).toBe(mapped.id);
    expect(state.roomMappings).toHaveLength(1);
    expect(() =>
      upsertAiosellRoomMapping(state, catalog(), {
        restaurantId: propertyA,
        environment: "sandbox",
        roomTypeId: roomTypeB,
        roomCode: "Executive ",
      }),
    ).toThrow("ROOM_CODE_CONFLICT");
    expect(() =>
      upsertAiosellRoomMapping(state, catalog(), {
        restaurantId: propertyA,
        environment: "sandbox",
        roomTypeId: physicalRoom,
        roomCode: "physical",
      }),
    ).toThrow("ROOM_TYPE_REQUIRED");
    expect(() =>
      upsertAiosellRoomMapping(
        state,
        {
          ...catalog(),
          roomTypes: [{ id: roomTypeA, restaurantId: propertyB }],
        },
        {
          restaurantId: propertyA,
          environment: "sandbox",
          roomTypeId: roomTypeA,
          roomCode: "other",
        },
      ),
    ).toThrow("CROSS_PROPERTY_ROOM");
  });

  it("maps a rate plan under its room and rejects the wrong room", () => {
    const state = emptyState();
    connect(state);
    upsertAiosellRoomMapping(state, catalog(), {
      restaurantId: propertyA,
      environment: "sandbox",
      roomTypeId: roomTypeA,
      roomCode: "executive",
    });
    const mapped = upsertAiosellRateMapping(state, catalog(), {
      restaurantId: propertyA,
      environment: "sandbox",
      ratePlanId: ratePlanA,
      roomCode: "executive",
      rateplanCode: "executive-s-ep",
    });
    expect(listAiosellRateMappings(state, propertyA, "sandbox")[0]?.rateplanCode).toBe(
      "executive-s-ep",
    );
    const again = upsertAiosellRateMapping(state, catalog(), {
      restaurantId: propertyA,
      environment: "sandbox",
      ratePlanId: ratePlanA,
      roomCode: "executive",
      rateplanCode: "executive-s-ep",
    });
    expect(again.id).toBe(mapped.id);
    upsertAiosellRoomMapping(state, catalog(), {
      restaurantId: propertyA,
      environment: "sandbox",
      roomTypeId: roomTypeB,
      roomCode: "suite",
    });
    expect(() =>
      upsertAiosellRateMapping(state, catalog(), {
        restaurantId: propertyA,
        environment: "sandbox",
        ratePlanId: ratePlanB,
        roomCode: "executive",
        rateplanCode: "suite-d-cp",
      }),
    ).toThrow("WRONG_ROOM_RATE_PLAN");
    expect(() =>
      upsertAiosellRateMapping(state, catalog(), {
        restaurantId: propertyA,
        environment: "sandbox",
        ratePlanId: ratePlanOther,
        roomCode: "executive",
        rateplanCode: "other",
      }),
    ).toThrow("CROSS_PROPERTY_RATE_PLAN");
    expect(() =>
      upsertAiosellRateMapping(state, catalog(), {
        restaurantId: propertyA,
        environment: "sandbox",
        ratePlanId: ratePlanSameRoom,
        roomCode: "executive",
        rateplanCode: "executive-s-ep",
      }),
    ).toThrow("RATEPLAN_CODE_CONFLICT");
  });

  it("compares currency and timezone without conversion or mutation", () => {
    const property = { currency: "INR", timezone: "Asia/Kolkata" };
    const before = { ...property };
    const match = validateAiosellCurrencyCompatibility({
      aiosellCurrency: "INR",
      propertyCurrency: property.currency,
      mappedRatePlans: [{ ratePlanId: ratePlanA, currency: "INR" }],
    });
    const propertyMismatch = validateAiosellCurrencyCompatibility({
      aiosellCurrency: "USD",
      propertyCurrency: property.currency,
      mappedRatePlans: [],
    });
    const planMismatch = validateAiosellCurrencyCompatibility({
      aiosellCurrency: "INR",
      propertyCurrency: property.currency,
      mappedRatePlans: [{ ratePlanId: ratePlanA, currency: "EUR" }],
    });
    const zone = validateAiosellTimezoneCompatibility({
      aiosellTimezone: "Asia/Kolkata",
      propertyTimezone: property.timezone,
    });
    const zoneMismatch = validateAiosellTimezoneCompatibility({
      aiosellTimezone: "Europe/London",
      propertyTimezone: property.timezone,
    });
    expect(match.compatible).toBe(true);
    expect(match.fxApplied).toBe(false);
    expect(propertyMismatch.compatible).toBe(false);
    expect(JSON.stringify(propertyMismatch)).not.toContain("AIOSELL_RESPONSE_INVALID");
    expect(planMismatch.ratePlanMismatches).toEqual([{ ratePlanId: ratePlanA, currency: "EUR" }]);
    expect(zone.match).toBe(true);
    expect(zoneMismatch.blocksReadiness).toBe(true);
    expect(JSON.stringify(zoneMismatch)).not.toContain("AIOSELL_RESPONSE_INVALID");
    expect(property).toEqual(before);
  });

  it("keeps an OTA channel key exact and does not store a multiplier", () => {
    const state = emptyState();
    connect(state);
    const channel = upsertAiosellConnectedChannel(state, {
      restaurantId: propertyA,
      environment: "sandbox",
      partnerId: "booking.com",
      hotelCode: "452981",
      operation: "rates",
      rateMultiplier: 1.2,
    });
    expect(channel.code).toBe("booking.com");
    expect(channel.channelPropertyCode).toBe("452981");
    expect(channel.operations).toEqual(["rates"]);
    expect(channel).not.toHaveProperty("rateMultiplier");
  });

  it("reports outbound readiness only when the local connection is complete", () => {
    const bare = emptyState();
    expect(readyInput(bare).readiness.readyForOutboundAri).toBe(false);
    expect(readyInput(bare).readiness.hasHotelCode).toBe(false);

    const roomsOnly = emptyState();
    connect(roomsOnly);
    expect(readyInput(roomsOnly).readiness.hasRoomMappings).toBe(false);
    expect(readyInput(roomsOnly).readiness.readyForOutboundAri).toBe(false);
    upsertAiosellRoomMapping(roomsOnly, catalog(), {
      restaurantId: propertyA,
      environment: "sandbox",
      roomTypeId: roomTypeA,
      roomCode: "executive",
    });
    expect(readyInput(roomsOnly).readiness.hasRateMappings).toBe(false);
    expect(readyInput(roomsOnly).readiness.readyForOutboundAri).toBe(false);

    const complete = emptyState();
    connect(complete);
    upsertAiosellRoomMapping(complete, catalog(), {
      restaurantId: propertyA,
      environment: "sandbox",
      roomTypeId: roomTypeA,
      roomCode: "executive",
    });
    upsertAiosellRateMapping(complete, catalog(), {
      restaurantId: propertyA,
      environment: "sandbox",
      ratePlanId: ratePlanA,
      roomCode: "executive",
      rateplanCode: "executive-s-ep",
    });
    expect(readyInput(complete, { aiosellCurrency: "USD" }).readiness.currencyCompatible).toBe(
      false,
    );
    expect(readyInput(complete, { aiosellCurrency: "USD" }).readiness.readyForOutboundAri).toBe(
      false,
    );
    expect(
      readyInput(complete, { aiosellTimezone: "Europe/London" }).readiness.timezoneCompatible,
    ).toBe(false);
    expect(
      readyInput(complete, { aiosellTimezone: "Europe/London" }).readiness.readyForOutboundAri,
    ).toBe(false);
    expect(readyInput(complete).readiness.readyForOutboundAri).toBe(true);
  });
});

const sandboxChannelId = "9362fc52-3460-4579-b6ad-77e1b70057e2";
const sandboxIntegrationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01";
const replacementChannelId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02";
const replacementIntegrationId = "cccccccc-cccc-cccc-cccc-cccccccccc03";
const productionChannelId = "dddddddd-dddd-dddd-dddd-dddddddddd04";
const productionIntegrationId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05";

type MetadataStore = {
  integrations: {
    id: string;
    restaurantId: string;
    environment: "sandbox" | "production";
    partnerSlug: string | null;
    hotelCode: string | null;
    name: string;
  }[];
  channels: {
    id: string;
    restaurantId: string;
    code: string;
    environment: "sandbox" | "production";
    integrationId: string | null;
    name: string;
  }[];
  roomMappings: { id: string; channelId: string }[];
  rateMappings: { id: string; channelId: string }[];
};

function mappedSandboxStore(): MetadataStore {
  return {
    integrations: [
      {
        id: sandboxIntegrationId,
        restaurantId: propertyA,
        environment: "sandbox",
        partnerSlug: null,
        hotelCode: null,
        name: "Aiosell sandbox",
      },
    ],
    channels: [
      {
        id: sandboxChannelId,
        restaurantId: propertyA,
        code: "aiosell.sandbox",
        environment: "sandbox",
        integrationId: null,
        name: "Aiosell sandbox",
      },
    ],
    roomMappings: [{ id: "room-map-1", channelId: sandboxChannelId }],
    rateMappings: [{ id: "rate-map-1", channelId: sandboxChannelId }],
  };
}

function applyMetadataSave(
  store: MetadataStore,
  input: {
    environment: "sandbox" | "production";
    partnerSlug: string;
    hotelCode: string;
    proposedIntegrationId: string;
    proposedChannelId: string;
  },
) {
  const plan = planAiosellMetadataSave({
    restaurantId: propertyA,
    environment: input.environment,
    partnerSlug: input.partnerSlug,
    hotelCode: input.hotelCode,
    proposedIntegrationId: input.proposedIntegrationId,
    proposedChannelId: input.proposedChannelId,
    existingIntegration:
      store.integrations.find(
        (row) => row.restaurantId === propertyA && row.environment === input.environment,
      ) ?? null,
    existingChannel:
      store.channels.find(
        (row) =>
          row.restaurantId === propertyA &&
          row.code === (input.environment === "sandbox" ? "aiosell.sandbox" : "aiosell.production"),
      ) ?? null,
  });
  if (plan.integration.action === "update") {
    const row = store.integrations.find((item) => item.id === plan.integration.id);
    if (!row) throw new Error("missing integration");
    row.partnerSlug = plan.integration.partnerSlug;
    row.hotelCode = plan.integration.hotelCode;
    row.name = plan.integration.name;
  } else {
    store.integrations.push({
      id: plan.integration.id,
      restaurantId: plan.integration.restaurantId,
      environment: plan.integration.environment,
      partnerSlug: plan.integration.partnerSlug,
      hotelCode: plan.integration.hotelCode,
      name: plan.integration.name,
    });
  }
  if (plan.channel.action === "update") {
    const row = store.channels.find((item) => item.id === plan.channel.id);
    if (!row) throw new Error("distribution_room_mappings_channel_fk");
    row.integrationId = plan.channel.integrationId;
    row.name = plan.channel.name;
    return plan;
  }
  store.channels.push({
    id: plan.channel.id,
    restaurantId: plan.channel.restaurantId,
    code: plan.channel.code,
    environment: plan.channel.environment,
    integrationId: plan.channel.integrationId,
    name: plan.channel.name,
  });
  return plan;
}

describe("Aiosell metadata save preserves channel identity", () => {
  it("updates metadata on the existing sandbox anchor without rewriting mapping channel ids", () => {
    const store = mappedSandboxStore();
    const plan = applyMetadataSave(store, {
      environment: "sandbox",
      partnerSlug: "sample-pms",
      hotelCode: "sandbox-pms",
      proposedIntegrationId: replacementIntegrationId,
      proposedChannelId: replacementChannelId,
    });

    expect(plan.channel).toEqual({
      action: "update",
      id: sandboxChannelId,
      integrationId: sandboxIntegrationId,
      name: "Aiosell sandbox",
    });
    expect(plan.channel).not.toHaveProperty("code");
    expect(store.channels).toHaveLength(1);
    expect(store.channels[0]?.id).toBe(sandboxChannelId);
    expect(store.channels[0]?.code).toBe("aiosell.sandbox");
    expect(store.roomMappings[0]?.channelId).toBe(sandboxChannelId);
    expect(store.rateMappings[0]?.channelId).toBe(sandboxChannelId);
    expect(store.integrations[0]).toMatchObject({
      id: sandboxIntegrationId,
      partnerSlug: "sample-pms",
      hotelCode: "sandbox-pms",
      environment: "sandbox",
    });
  });

  it("keeps the same channel and integration ids on a repeated save", () => {
    const store = mappedSandboxStore();
    applyMetadataSave(store, {
      environment: "sandbox",
      partnerSlug: "sample-pms",
      hotelCode: "sandbox-pms",
      proposedIntegrationId: replacementIntegrationId,
      proposedChannelId: replacementChannelId,
    });
    const again = applyMetadataSave(store, {
      environment: "sandbox",
      partnerSlug: "sample-pms",
      hotelCode: "sandbox-pms",
      proposedIntegrationId: replacementIntegrationId,
      proposedChannelId: replacementChannelId,
    });

    expect(again.integration.action).toBe("update");
    expect(again.channel.action).toBe("update");
    expect(store.channels.map((row) => row.id)).toEqual([sandboxChannelId]);
    expect(store.integrations.map((row) => row.id)).toEqual([sandboxIntegrationId]);
    expect(store.roomMappings[0]?.channelId).toBe(sandboxChannelId);
    expect(store.rateMappings[0]?.channelId).toBe(sandboxChannelId);
  });

  it("does not recreate the channel when the partner slug or hotel code changes", () => {
    const store = mappedSandboxStore();
    applyMetadataSave(store, {
      environment: "sandbox",
      partnerSlug: "sample-pms",
      hotelCode: "sandbox-pms",
      proposedIntegrationId: replacementIntegrationId,
      proposedChannelId: replacementChannelId,
    });
    applyMetadataSave(store, {
      environment: "sandbox",
      partnerSlug: "other-pms",
      hotelCode: "sandbox-pms",
      proposedIntegrationId: replacementIntegrationId,
      proposedChannelId: replacementChannelId,
    });
    applyMetadataSave(store, {
      environment: "sandbox",
      partnerSlug: "other-pms",
      hotelCode: "other-hotel",
      proposedIntegrationId: replacementIntegrationId,
      proposedChannelId: replacementChannelId,
    });

    expect(store.channels).toEqual([
      expect.objectContaining({ id: sandboxChannelId, code: "aiosell.sandbox" }),
    ]);
    expect(store.integrations[0]).toMatchObject({
      id: sandboxIntegrationId,
      partnerSlug: "other-pms",
      hotelCode: "other-hotel",
    });
    expect(store.roomMappings[0]?.channelId).toBe(sandboxChannelId);
    expect(store.rateMappings[0]?.channelId).toBe(sandboxChannelId);
  });

  it("opens a production anchor without moving sandbox mappings", () => {
    const store = mappedSandboxStore();
    applyMetadataSave(store, {
      environment: "sandbox",
      partnerSlug: "sample-pms",
      hotelCode: "sandbox-pms",
      proposedIntegrationId: replacementIntegrationId,
      proposedChannelId: replacementChannelId,
    });
    const production = applyMetadataSave(store, {
      environment: "production",
      partnerSlug: "sample-pms",
      hotelCode: "live-hotel",
      proposedIntegrationId: productionIntegrationId,
      proposedChannelId: productionChannelId,
    });

    expect(production.channel).toMatchObject({
      action: "insert",
      id: productionChannelId,
      code: "aiosell.production",
      environment: "production",
    });
    expect(store.channels.find((row) => row.code === "aiosell.sandbox")).toMatchObject({
      id: sandboxChannelId,
      environment: "sandbox",
    });
    expect(store.roomMappings[0]?.channelId).toBe(sandboxChannelId);
    expect(store.rateMappings[0]?.channelId).toBe(sandboxChannelId);
    expect(store.channels.find((row) => row.id === productionChannelId)?.code).toBe(
      "aiosell.production",
    );
  });

  it("does not upsert distribution_channels on restaurant and code", () => {
    const source = read("src/packages/pms/lib/distribution/aiosell-connection.server.ts");
    expect(source).not.toContain('from("distribution_channels").upsert');
    expect(source).not.toContain('onConflict: "restaurant_id,code"');
  });
});

describe("Aiosell Booking.com channel", () => {
  const integrationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11";

  it("adds an active OTA row without moving the sandbox anchor or its mappings", () => {
    const anchor = { id: sandboxChannelId, code: "aiosell.sandbox" as const };
    const roomMappings = [{ channelId: anchor.id }];
    const rateMappings = [{ channelId: anchor.id }];
    const plan = planAiosellOtaChannel({
      restaurantId: propertyA,
      environment: "sandbox",
      integrationId,
      existing: null,
    });
    expect(plan).toEqual({
      action: "insert",
      id: null,
      restaurantId: propertyA,
      integrationId,
      environment: "sandbox",
      code: "booking.com",
      channelType: "ota",
      status: "active",
      name: "Booking.com",
    });
    expect(anchor).toEqual({ id: sandboxChannelId, code: "aiosell.sandbox" });
    expect(roomMappings[0]?.channelId).toBe(sandboxChannelId);
    expect(rateMappings[0]?.channelId).toBe(sandboxChannelId);
    expect(() =>
      planAiosellOtaChannel({
        restaurantId: propertyA,
        environment: "sandbox",
        integrationId,
        existing: {
          id: sandboxChannelId,
          restaurantId: propertyA,
          code: "aiosell.sandbox",
          environment: "sandbox",
        },
      }),
    ).toThrow("CHANNEL_ANCHOR_RESERVED");
  });

  it("does not reuse another property's Booking.com row", () => {
    expect(() =>
      planAiosellOtaChannel({
        restaurantId: propertyA,
        environment: "sandbox",
        integrationId,
        existing: {
          id: "99999999-9999-9999-9999-999999999999",
          restaurantId: propertyB,
          code: "booking.com",
          environment: "sandbox",
        },
      }),
    ).toThrow("AIOSELL_CHANNEL_PROPERTY_MISMATCH");
  });
});
