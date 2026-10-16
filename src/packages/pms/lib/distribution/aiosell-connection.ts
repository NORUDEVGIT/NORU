/**
 * AIOS-03 Aiosell connection and mapping rules.
 * No Aiosell HTTP call. No credentials. No reservation import.
 * Room and rate rows stay on the existing distribution mapping tables.
 * Mapping channels aiosell.sandbox and aiosell.production are NORU anchors,
 * not Aiosell OTA keys. OTA keys are stored exactly as partner_id.
 */
import { SECRET_KEY_PATTERN } from "../integrations-card6.server";
import { distributionProvider, type DistributionProvider } from "./external-reservation-identity";

export const AIOSELL_ENVIRONMENTS = ["sandbox", "production"] as const;
export type AiosellEnvironment = (typeof AIOSELL_ENVIRONMENTS)[number];

const EXTRA_SECRET_KEY = /(username|authorization|creditcard|cardnumber|card_?key|basic_auth)/i;

export type AiosellConfig = Record<string, string | number | boolean>;

export type AiosellConnection = {
  id: string;
  restaurantId: string;
  provider: DistributionProvider;
  environment: AiosellEnvironment;
  partnerSlug: string;
  hotelCode: string;
  status: "pending";
  enabled: boolean;
  config: AiosellConfig;
  lastValidatedAt: string | null;
  lastError: string | null;
};

export type AiosellChannel = {
  id: string;
  restaurantId: string;
  integrationId: string;
  environment: AiosellEnvironment;
  code: string;
  role: "mapping" | "connected";
  channelPropertyCode: string | null;
  operations: string[];
  enabled: boolean;
};

export type AiosellRoomMapping = {
  id: string;
  restaurantId: string;
  channelId: string;
  roomTypeId: string;
  roomCode: string;
};

export type AiosellRateMapping = {
  id: string;
  restaurantId: string;
  channelId: string;
  ratePlanId: string;
  roomTypeId: string;
  roomCode: string;
  rateplanCode: string;
};

export type AiosellCatalog = {
  roomTypes: { id: string; restaurantId: string }[];
  physicalRooms: { id: string; restaurantId: string }[];
  ratePlans: { id: string; restaurantId: string; roomTypeId: string; currency: string }[];
};

export type AiosellConnectionState = {
  connections: AiosellConnection[];
  channels: AiosellChannel[];
  roomMappings: AiosellRoomMapping[];
  rateMappings: AiosellRateMapping[];
};

export type AiosellConnectionRead = {
  provider: DistributionProvider | null;
  environment: AiosellEnvironment | null;
  partnerSlug: string | null;
  hotelCode: string | null;
  status: AiosellConnection["status"] | null;
  propertyCurrency: string;
  propertyTimezone: string;
  currencyCompatible: boolean;
  timezoneCompatible: boolean;
  roomMappings: AiosellRoomMapping[];
  rateMappings: AiosellRateMapping[];
  connectedChannels: AiosellChannel[];
  readiness: {
    hasConnectionMetadata: boolean;
    hasPartnerSlug: boolean;
    hasHotelCode: boolean;
    hasRoomMappings: boolean;
    hasRateMappings: boolean;
    roomRateRelationshipValid: boolean;
    currencyCompatible: boolean;
    timezoneCompatible: boolean;
    environmentExplicit: boolean;
    readyForOutboundAri: boolean;
  };
};

export function aiosellMappingChannelCode(environment: AiosellEnvironment): string {
  return environment === "sandbox" ? "aiosell.sandbox" : "aiosell.production";
}

export function assertAiosellConfigSafe(config: AiosellConfig): void {
  for (const key of Object.keys(config)) {
    if (SECRET_KEY_PATTERN.test(key) || EXTRA_SECRET_KEY.test(key)) {
      throw new Error("AIOSELL_CONFIG_SECRET");
    }
  }
}

function requireEnvironment(environment: string): AiosellEnvironment {
  if (environment !== "sandbox" && environment !== "production") {
    throw new Error("AIOSELL_ENVIRONMENT_INVALID");
  }
  return environment;
}

function requireText(value: string, code: string): string {
  if (value === "") throw new Error(code);
  return value;
}

function nextId(): string {
  return crypto.randomUUID();
}

export function findAiosellConnection(
  state: AiosellConnectionState,
  restaurantId: string,
  environment: AiosellEnvironment,
): AiosellConnection | null {
  const current = state.connections.filter(
    (row) =>
      row.restaurantId === restaurantId &&
      row.provider === "aiosell" &&
      row.environment === environment &&
      row.enabled,
  );
  if (current.length > 1) throw new Error("AIOSELL_CONNECTION_AMBIGUOUS");
  return current[0] ?? null;
}

export function upsertAiosellConnection(
  state: AiosellConnectionState,
  input: {
    restaurantId: string;
    provider: string;
    environment: AiosellEnvironment;
    partnerSlug: string;
    hotelCode: string;
    config?: AiosellConfig;
  },
): AiosellConnection {
  const provider = distributionProvider(input.provider);
  const environment = requireEnvironment(input.environment);
  const partnerSlug = requireText(input.partnerSlug, "AIOSELL_CONNECTION_INCOMPLETE");
  const hotelCode = requireText(input.hotelCode, "AIOSELL_CONNECTION_INCOMPLETE");
  const config = input.config ?? {};
  assertAiosellConfigSafe(config);
  const existing = state.connections.filter(
    (row) =>
      row.restaurantId === input.restaurantId &&
      row.provider === provider &&
      row.environment === environment,
  );
  if (existing.length > 1) throw new Error("AIOSELL_CONNECTION_AMBIGUOUS");
  const connection: AiosellConnection = {
    id: existing[0]?.id ?? nextId(),
    restaurantId: input.restaurantId,
    provider,
    environment,
    partnerSlug,
    hotelCode,
    status: "pending",
    enabled: true,
    config,
    lastValidatedAt: existing[0]?.lastValidatedAt ?? null,
    lastError: existing[0]?.lastError ?? null,
  };
  state.connections = [...state.connections.filter((row) => row.id !== connection.id), connection];
  const anchorCode = aiosellMappingChannelCode(environment);
  const anchor = state.channels.find(
    (row) => row.restaurantId === input.restaurantId && row.code === anchorCode,
  );
  if (!anchor) {
    state.channels.push({
      id: nextId(),
      restaurantId: input.restaurantId,
      integrationId: connection.id,
      environment,
      code: anchorCode,
      role: "mapping",
      channelPropertyCode: null,
      operations: [],
      enabled: true,
    });
  } else {
    anchor.integrationId = connection.id;
  }
  return connection;
}

export type AiosellMetadataSavePlan = {
  integration:
    | {
        action: "update";
        id: string;
        partnerSlug: string;
        hotelCode: string;
        name: string;
      }
    | {
        action: "insert";
        id: string;
        restaurantId: string;
        environment: AiosellEnvironment;
        partnerSlug: string;
        hotelCode: string;
        name: string;
      };
  channel:
    | { action: "update"; id: string; integrationId: string; name: string }
    | {
        action: "insert";
        id: string;
        restaurantId: string;
        code: string;
        environment: AiosellEnvironment;
        integrationId: string;
        name: string;
      };
};

export function planAiosellMetadataSave(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  partnerSlug: string;
  hotelCode: string;
  proposedIntegrationId: string;
  proposedChannelId: string;
  existingIntegration: { id: string } | null;
  existingChannel: { id: string } | null;
}): AiosellMetadataSavePlan {
  const environment = requireEnvironment(input.environment);
  const partnerSlug = requireText(input.partnerSlug, "AIOSELL_CONNECTION_INCOMPLETE");
  const hotelCode = requireText(input.hotelCode, "AIOSELL_CONNECTION_INCOMPLETE");
  const name = environment === "sandbox" ? "Aiosell sandbox" : "Aiosell production";
  const integrationId = input.existingIntegration?.id ?? input.proposedIntegrationId;
  const code = aiosellMappingChannelCode(environment);
  return {
    integration: input.existingIntegration
      ? { action: "update", id: input.existingIntegration.id, partnerSlug, hotelCode, name }
      : {
          action: "insert",
          id: input.proposedIntegrationId,
          restaurantId: input.restaurantId,
          environment,
          partnerSlug,
          hotelCode,
          name,
        },
    channel: input.existingChannel
      ? { action: "update", id: input.existingChannel.id, integrationId, name }
      : {
          action: "insert",
          id: input.proposedChannelId,
          restaurantId: input.restaurantId,
          code,
          environment,
          integrationId,
          name,
        },
  };
}

function mappingChannel(
  state: AiosellConnectionState,
  restaurantId: string,
  environment: AiosellEnvironment,
): AiosellChannel {
  const code = aiosellMappingChannelCode(environment);
  const channel = state.channels.find(
    (row) => row.restaurantId === restaurantId && row.code === code && row.role === "mapping",
  );
  if (!channel) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  return channel;
}

export function listAiosellRoomMappings(
  state: AiosellConnectionState,
  restaurantId: string,
  environment: AiosellEnvironment,
): AiosellRoomMapping[] {
  const channel = mappingChannel(state, restaurantId, environment);
  return state.roomMappings.filter((row) => row.channelId === channel.id);
}

export function upsertAiosellRoomMapping(
  state: AiosellConnectionState,
  catalog: AiosellCatalog,
  input: {
    restaurantId: string;
    environment: AiosellEnvironment;
    roomTypeId: string;
    roomCode: string;
  },
): AiosellRoomMapping {
  const roomCode = requireText(input.roomCode, "ROOM_CODE_REQUIRED");
  if (catalog.physicalRooms.some((row) => row.id === input.roomTypeId)) {
    const alsoType = catalog.roomTypes.some((row) => row.id === input.roomTypeId);
    if (!alsoType) throw new Error("ROOM_TYPE_REQUIRED");
  }
  const roomType = catalog.roomTypes.find((row) => row.id === input.roomTypeId);
  if (!roomType) throw new Error("ROOM_TYPE_NOT_FOUND");
  if (roomType.restaurantId !== input.restaurantId) throw new Error("CROSS_PROPERTY_ROOM");
  const channel = mappingChannel(state, input.restaurantId, input.environment);
  const sameCode = state.roomMappings.find(
    (row) => row.channelId === channel.id && row.roomCode === roomCode,
  );
  if (sameCode && sameCode.roomTypeId !== input.roomTypeId) {
    throw new Error("ROOM_CODE_CONFLICT");
  }
  const sameType = state.roomMappings.find(
    (row) => row.channelId === channel.id && row.roomTypeId === input.roomTypeId,
  );
  if (sameType) {
    sameType.roomCode = roomCode;
    return sameType;
  }
  const created: AiosellRoomMapping = {
    id: nextId(),
    restaurantId: input.restaurantId,
    channelId: channel.id,
    roomTypeId: input.roomTypeId,
    roomCode,
  };
  state.roomMappings.push(created);
  return created;
}

export function removeAiosellRoomMapping(
  state: AiosellConnectionState,
  restaurantId: string,
  environment: AiosellEnvironment,
  roomTypeId: string,
): void {
  const channel = mappingChannel(state, restaurantId, environment);
  state.roomMappings = state.roomMappings.filter(
    (row) => !(row.channelId === channel.id && row.roomTypeId === roomTypeId),
  );
}

export function listAiosellRateMappings(
  state: AiosellConnectionState,
  restaurantId: string,
  environment: AiosellEnvironment,
): AiosellRateMapping[] {
  const channel = mappingChannel(state, restaurantId, environment);
  return state.rateMappings.filter((row) => row.channelId === channel.id);
}

export function upsertAiosellRateMapping(
  state: AiosellConnectionState,
  catalog: AiosellCatalog,
  input: {
    restaurantId: string;
    environment: AiosellEnvironment;
    ratePlanId: string;
    roomCode: string;
    rateplanCode: string;
  },
): AiosellRateMapping {
  const roomCode = requireText(input.roomCode, "ROOM_CODE_REQUIRED");
  const rateplanCode = requireText(input.rateplanCode, "RATEPLAN_CODE_REQUIRED");
  const plan = catalog.ratePlans.find((row) => row.id === input.ratePlanId);
  if (!plan) throw new Error("RATE_PLAN_NOT_FOUND");
  if (plan.restaurantId !== input.restaurantId) throw new Error("CROSS_PROPERTY_RATE_PLAN");
  const channel = mappingChannel(state, input.restaurantId, input.environment);
  const roomMapping = state.roomMappings.find(
    (row) => row.channelId === channel.id && row.roomTypeId === plan.roomTypeId,
  );
  if (!roomMapping) throw new Error("ROOM_MAPPING_REQUIRED");
  if (roomMapping.roomCode !== roomCode) throw new Error("WRONG_ROOM_RATE_PLAN");
  const sameCode = state.rateMappings.find(
    (row) =>
      row.channelId === channel.id &&
      row.roomCode === roomCode &&
      row.rateplanCode === rateplanCode,
  );
  if (sameCode && sameCode.ratePlanId !== input.ratePlanId) {
    throw new Error("RATEPLAN_CODE_CONFLICT");
  }
  const samePlan = state.rateMappings.find(
    (row) => row.channelId === channel.id && row.ratePlanId === input.ratePlanId,
  );
  if (samePlan) {
    samePlan.roomCode = roomCode;
    samePlan.rateplanCode = rateplanCode;
    samePlan.roomTypeId = plan.roomTypeId;
    return samePlan;
  }
  const created: AiosellRateMapping = {
    id: nextId(),
    restaurantId: input.restaurantId,
    channelId: channel.id,
    ratePlanId: input.ratePlanId,
    roomTypeId: plan.roomTypeId,
    roomCode,
    rateplanCode,
  };
  state.rateMappings.push(created);
  return created;
}

export function upsertAiosellConnectedChannel(
  state: AiosellConnectionState,
  input: {
    restaurantId: string;
    environment: AiosellEnvironment;
    partnerId: string;
    hotelCode: string;
    operation: string;
    rateMultiplier?: number | null;
  },
): AiosellChannel {
  const connection = findAiosellConnection(state, input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const partnerId = requireText(input.partnerId, "CHANNEL_REQUIRED");
  const hotelCode = requireText(input.hotelCode, "CHANNEL_PROPERTY_CODE_REQUIRED");
  const operation = requireText(input.operation, "CHANNEL_OPERATION_REQUIRED");
  if (
    partnerId === aiosellMappingChannelCode("sandbox") ||
    partnerId === aiosellMappingChannelCode("production")
  ) {
    throw new Error("CHANNEL_ANCHOR_RESERVED");
  }
  void input.rateMultiplier;
  const existing = state.channels.find(
    (row) =>
      row.restaurantId === input.restaurantId && row.code === partnerId && row.role === "connected",
  );
  if (existing) {
    if (existing.channelPropertyCode !== hotelCode) {
      throw new Error("CHANNEL_PROPERTY_CODE_CONFLICT");
    }
    if (!existing.operations.includes(operation)) existing.operations.push(operation);
    return existing;
  }
  const created: AiosellChannel = {
    id: nextId(),
    restaurantId: input.restaurantId,
    integrationId: connection.id,
    environment: input.environment,
    code: partnerId,
    role: "connected",
    channelPropertyCode: hotelCode,
    operations: [operation],
    enabled: true,
  };
  state.channels.push(created);
  return created;
}

export const AIOSELL_BOOKING_CHANNEL_CODE = "booking.com" as const;

export type AiosellOtaChannelPlan = {
  action: "insert" | "update";
  id: string | null;
  restaurantId: string;
  integrationId: string;
  environment: AiosellEnvironment;
  code: typeof AIOSELL_BOOKING_CHANNEL_CODE;
  channelType: "ota";
  status: "active";
  name: "Booking.com";
};

export function planAiosellOtaChannel(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  integrationId: string;
  existing: {
    id: string;
    restaurantId: string;
    code: string;
    environment: AiosellEnvironment;
  } | null;
}): AiosellOtaChannelPlan {
  const environment = requireEnvironment(input.environment);
  const integrationId = requireText(input.integrationId, "AIOSELL_CONNECTION_REQUIRED");
  if (
    input.existing &&
    (input.existing.code === aiosellMappingChannelCode("sandbox") ||
      input.existing.code === aiosellMappingChannelCode("production"))
  ) {
    throw new Error("CHANNEL_ANCHOR_RESERVED");
  }
  if (input.existing && input.existing.restaurantId !== input.restaurantId) {
    throw new Error("AIOSELL_CHANNEL_PROPERTY_MISMATCH");
  }
  if (input.existing && input.existing.environment !== environment) {
    throw new Error("AIOSELL_CHANNEL_ENVIRONMENT_CONFLICT");
  }
  return {
    action: input.existing ? "update" : "insert",
    id: input.existing?.id ?? null,
    restaurantId: input.restaurantId,
    integrationId,
    environment,
    code: AIOSELL_BOOKING_CHANNEL_CODE,
    channelType: "ota",
    status: "active",
    name: "Booking.com",
  };
}

export function validateAiosellCurrencyCompatibility(input: {
  aiosellCurrency: string;
  propertyCurrency: string;
  mappedRatePlans: { ratePlanId: string; currency: string }[];
}): {
  propertyMatch: boolean;
  ratePlanMismatches: { ratePlanId: string; currency: string }[];
  compatible: boolean;
  fxApplied: false;
} {
  const propertyMatch = input.aiosellCurrency === input.propertyCurrency;
  const ratePlanMismatches = input.mappedRatePlans.filter(
    (row) => row.currency !== input.aiosellCurrency,
  );
  return {
    propertyMatch,
    ratePlanMismatches,
    compatible: propertyMatch && ratePlanMismatches.length === 0,
    fxApplied: false,
  };
}

export function validateAiosellTimezoneCompatibility(input: {
  aiosellTimezone: string;
  propertyTimezone: string;
}): { match: boolean; blocksReadiness: boolean } {
  const match = input.aiosellTimezone === input.propertyTimezone;
  return { match, blocksReadiness: !match };
}

export function projectAiosellConnectionRead(input: {
  state: AiosellConnectionState;
  catalog: AiosellCatalog;
  restaurantId: string;
  environment: AiosellEnvironment;
  propertyCurrency: string;
  propertyTimezone: string;
  aiosellCurrency: string;
  aiosellTimezone: string;
}): AiosellConnectionRead {
  const connection = findAiosellConnection(input.state, input.restaurantId, input.environment);
  const roomMappings = connection
    ? listAiosellRoomMappings(input.state, input.restaurantId, input.environment)
    : [];
  const rateMappings = connection
    ? listAiosellRateMappings(input.state, input.restaurantId, input.environment)
    : [];
  const connectedChannels = input.state.channels.filter(
    (row) =>
      row.restaurantId === input.restaurantId &&
      row.environment === input.environment &&
      row.role === "connected",
  );
  const mappedPlans = rateMappings.flatMap((row) => {
    const plan = input.catalog.ratePlans.find((candidate) => candidate.id === row.ratePlanId);
    return plan ? [{ ratePlanId: plan.id, currency: plan.currency }] : [];
  });
  const currency = validateAiosellCurrencyCompatibility({
    aiosellCurrency: input.aiosellCurrency,
    propertyCurrency: input.propertyCurrency,
    mappedRatePlans: mappedPlans,
  });
  const timezone = validateAiosellTimezoneCompatibility({
    aiosellTimezone: input.aiosellTimezone,
    propertyTimezone: input.propertyTimezone,
  });
  const roomRateRelationshipValid = rateMappings.every((row) =>
    roomMappings.some(
      (room) => room.roomTypeId === row.roomTypeId && room.roomCode === row.roomCode,
    ),
  );
  const readiness = {
    hasConnectionMetadata: connection !== null,
    hasPartnerSlug: Boolean(connection?.partnerSlug),
    hasHotelCode: Boolean(connection?.hotelCode),
    hasRoomMappings: roomMappings.length > 0,
    hasRateMappings: rateMappings.length > 0,
    roomRateRelationshipValid,
    currencyCompatible: currency.compatible,
    timezoneCompatible: timezone.match,
    environmentExplicit:
      connection?.environment === "sandbox" || connection?.environment === "production",
    readyForOutboundAri: false,
  };
  readiness.readyForOutboundAri =
    readiness.hasConnectionMetadata &&
    readiness.hasPartnerSlug &&
    readiness.hasHotelCode &&
    readiness.hasRoomMappings &&
    readiness.hasRateMappings &&
    readiness.roomRateRelationshipValid &&
    readiness.currencyCompatible &&
    readiness.timezoneCompatible &&
    readiness.environmentExplicit;
  return {
    provider: connection?.provider ?? null,
    environment: connection?.environment ?? null,
    partnerSlug: connection?.partnerSlug ?? null,
    hotelCode: connection?.hotelCode ?? null,
    status: connection?.status ?? null,
    propertyCurrency: input.propertyCurrency,
    propertyTimezone: input.propertyTimezone,
    currencyCompatible: currency.compatible,
    timezoneCompatible: timezone.match,
    roomMappings,
    rateMappings,
    connectedChannels,
    readiness,
  };
}
