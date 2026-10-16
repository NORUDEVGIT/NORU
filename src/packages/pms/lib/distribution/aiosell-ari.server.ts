/**
 * AIOS-04 outbound Aiosell orchestration.
 * Reads NORU availability and rates, then calls the HTTP client.
 * It does not change those formulas and does not import reservations.
 */
import { getRoomTypeAvailabilityCompat } from "../room-inventory-compat";
import {
  compareAiosellPropertyDetails,
  noruStayForAiosellRange,
  prepareAiosellInventoryPush,
  prepareAiosellInventoryRestrictions,
  prepareAiosellRatePush,
  prepareAiosellRateRestrictions,
  readAvailabilityNights,
  type PreparedAiosellPush,
} from "./aiosell-ari";
import { createAiosellClient, resolveAiosellBasicAuth, runAiosellOutbound } from "./aiosell-client";
import type { AiosellEnvironment } from "./aiosell-connection";
import { getAiosellConnectionRecord } from "./aiosell-connection.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function propertyProfile(db: Admin, restaurantId: string) {
  const result = await db
    .from("restaurants")
    .select("currency_code, timezone")
    .eq("id", restaurantId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("PROPERTY_NOT_FOUND");
  return { currency: result.data.currency_code, timezone: result.data.timezone };
}

async function mappingChannel(db: Admin, restaurantId: string, environment: AiosellEnvironment) {
  const code = environment === "sandbox" ? "aiosell.sandbox" : "aiosell.production";
  const result = await db
    .from("distribution_channels")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("code", code)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data?.id ?? null;
}

export async function syncAiosellPropertyMetadata(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
}) {
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const auth = resolveAiosellBasicAuth(process.env);
  if ("error" in auth) return { ready: false, error: auth.error, comparison: null, details: null };
  const db = await admin();
  const property = await propertyProfile(db, input.restaurantId);
  const client = createAiosellClient({
    partnerSlug: connection.partnerSlug,
    username: auth.username,
    password: auth.password,
  });
  const details = await runAiosellOutbound({
    restaurantId: input.restaurantId,
    operation: "property_details",
    secrets: auth,
    call: () => client.getPropertyDetails(connection.hotelCode),
    record: async (event) => {
      const saved = await db.from("pms_distribution_sync_events").insert(event);
      if (saved.error) throw new Error(saved.error.message);
    },
  });
  if (!details.ok) return { ready: false, error: details.code, comparison: null, details: null };
  const comparison = compareAiosellPropertyDetails({
    configuredHotelCode: connection.hotelCode,
    details: details.data,
    propertyCurrency: property.currency,
    propertyTimezone: property.timezone,
  });
  return { ready: !comparison.pushBlocked, error: null, comparison, details: details.data };
}

export async function prepareAiosellInventoryPushRecord(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  startDate: string;
  endDate: string;
  roomTypeIds: string[];
}) {
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const db = await admin();
  const channelId = await mappingChannel(db, input.restaurantId, input.environment);
  const mappings = channelId
    ? await db
        .from("distribution_room_mappings")
        .select("room_type_id, external_room_code")
        .eq("restaurant_id", input.restaurantId)
        .eq("channel_id", channelId)
    : { data: [], error: null };
  if (mappings.error) throw new Error(mappings.error.message);
  const stay = noruStayForAiosellRange(input.startDate, input.endDate);
  const rooms = [];
  for (const roomTypeId of input.roomTypeIds) {
    const availability = await getRoomTypeAvailabilityCompat(db, {
      restaurantId: input.restaurantId,
      roomTypeId,
      arrival: stay.arrival,
      departure: stay.departure,
    });
    if (availability.source !== "canonical" || availability.nightly.length === 0) {
      return {
        environment: input.environment,
        hotelCode: connection.hotelCode,
        payload: null,
        warnings: [],
        errors: [
          {
            code: "AVAILABILITY_NIGHTLY_UNAVAILABLE",
            message: "Aiosell inventory needs the nightly availability rows.",
          },
        ],
        ready: false,
        upsert: true as const,
      };
    }
    rooms.push({ roomTypeId, nights: readAvailabilityNights(availability.nightly) });
  }
  return prepareAiosellInventoryPush({
    environment: input.environment,
    hotelCode: connection.hotelCode,
    startDate: input.startDate,
    endDate: input.endDate,
    rooms,
    roomMappings: (mappings.data ?? []).flatMap((row) =>
      row.external_room_code
        ? [{ roomTypeId: row.room_type_id, roomCode: row.external_room_code }]
        : [],
    ),
  });
}

export async function pushAiosellInventory(
  input: Parameters<typeof prepareAiosellInventoryPushRecord>[0] & { dryRun?: boolean },
) {
  const prepared = await prepareAiosellInventoryPushRecord(input);
  if (input.dryRun || !prepared.ready || !prepared.payload) return prepared;
  const auth = resolveAiosellBasicAuth(process.env);
  if ("error" in auth)
    return { ...prepared, ready: false, errors: [{ code: auth.error, message: auth.error }] };
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const db = await admin();
  const client = createAiosellClient({
    partnerSlug: connection.partnerSlug,
    username: auth.username,
    password: auth.password,
  });
  const result = await runAiosellOutbound({
    restaurantId: input.restaurantId,
    operation: "inventory_push",
    secrets: auth,
    call: () => client.pushInventory(prepared.payload!),
    record: async (event) => {
      const saved = await db.from("pms_distribution_sync_events").insert(event);
      if (saved.error) throw new Error(saved.error.message);
    },
  });
  return { ...prepared, result };
}

export function prepareAiosellInventoryRestrictionsRecord(): PreparedAiosellPush<never> {
  return prepareAiosellInventoryRestrictions();
}

export async function prepareAiosellRatePushRecord(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  startDate: string;
  endDate: string;
  aiosellCurrency: string;
  ratePlanIds: string[];
}) {
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const db = await admin();
  const property = await propertyProfile(db, input.restaurantId);
  const channelId = await mappingChannel(db, input.restaurantId, input.environment);
  const [rooms, rates, plans, calendar] = await Promise.all([
    channelId
      ? db
          .from("distribution_room_mappings")
          .select("room_type_id, external_room_code")
          .eq("channel_id", channelId)
      : Promise.resolve({ data: [], error: null }),
    channelId
      ? db
          .from("distribution_rate_mappings")
          .select("rate_plan_id, external_room_code, external_rate_code")
          .eq("channel_id", channelId)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("hotel_rate_plans")
      .select("id, room_type_id, base_rate, currency")
      .eq("restaurant_id", input.restaurantId)
      .in("id", input.ratePlanIds),
    db
      .from("hotel_rate_calendar")
      .select("rate_plan_id, rate_date, nightly_rate")
      .eq("restaurant_id", input.restaurantId)
      .gte("rate_date", input.startDate)
      .lte("rate_date", input.endDate)
      .in("rate_plan_id", input.ratePlanIds),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (rates.error) throw new Error(rates.error.message);
  if (plans.error) throw new Error(plans.error.message);
  if (calendar.error) throw new Error(calendar.error.message);
  const roomMappings = (rooms.data ?? []).flatMap((row) =>
    row.external_room_code
      ? [{ roomTypeId: row.room_type_id, roomCode: row.external_room_code }]
      : [],
  );
  const rateRows = rates.data ?? [];
  return prepareAiosellRatePush({
    environment: input.environment,
    hotelCode: connection.hotelCode,
    startDate: input.startDate,
    endDate: input.endDate,
    aiosellCurrency: input.aiosellCurrency,
    propertyCurrency: property.currency,
    roomMappings,
    plans: input.ratePlanIds.map((ratePlanId) => {
      const plan = (plans.data ?? []).find((row) => row.id === ratePlanId);
      const rate = rateRows.find((row) => row.rate_plan_id === ratePlanId);
      return {
        ratePlanId,
        roomTypeId: plan?.room_type_id ?? "",
        roomCode: rate?.external_room_code ?? "",
        rateplanCode: rate?.external_rate_code ?? "",
        baseRate: Number(plan?.base_rate ?? 0),
        currency: plan?.currency ?? property.currency,
      };
    }),
    calendar: (calendar.data ?? []).map((row) => ({
      ratePlanId: row.rate_plan_id,
      date: row.rate_date,
      nightlyRate: Number(row.nightly_rate),
    })),
  });
}

export async function pushAiosellRates(
  input: Parameters<typeof prepareAiosellRatePushRecord>[0] & { dryRun?: boolean },
) {
  const prepared = await prepareAiosellRatePushRecord(input);
  if (input.dryRun || !prepared.ready || !prepared.payload) return prepared;
  const auth = resolveAiosellBasicAuth(process.env);
  if ("error" in auth)
    return { ...prepared, ready: false, errors: [{ code: auth.error, message: auth.error }] };
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const db = await admin();
  const client = createAiosellClient({
    partnerSlug: connection.partnerSlug,
    username: auth.username,
    password: auth.password,
  });
  const result = await runAiosellOutbound({
    restaurantId: input.restaurantId,
    operation: "rate_push",
    secrets: auth,
    call: () => client.pushRates(prepared.payload!),
    record: async (event) => {
      const saved = await db.from("pms_distribution_sync_events").insert(event);
      if (saved.error) throw new Error(saved.error.message);
    },
  });
  return { ...prepared, result };
}

export async function prepareAiosellRateRestrictionsRecord(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  startDate: string;
  endDate: string;
  ratePlanIds: string[];
}) {
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const db = await admin();
  const channelId = await mappingChannel(db, input.restaurantId, input.environment);
  const [rooms, rates, channels, restrictions] = await Promise.all([
    channelId
      ? db
          .from("distribution_room_mappings")
          .select("room_type_id, external_room_code")
          .eq("channel_id", channelId)
      : Promise.resolve({ data: [], error: null }),
    channelId
      ? db
          .from("distribution_rate_mappings")
          .select("rate_plan_id, external_room_code, external_rate_code")
          .eq("channel_id", channelId)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("distribution_channels")
      .select("code")
      .eq("restaurant_id", input.restaurantId)
      .eq("environment", input.environment),
    db
      .from("hotel_rate_restrictions")
      .select(
        "rate_plan_id, restriction_date, stop_sell, min_stay, max_stay, closed_to_arrival, closed_to_departure",
      )
      .eq("restaurant_id", input.restaurantId)
      .gte("restriction_date", input.startDate)
      .lte("restriction_date", input.endDate)
      .in("rate_plan_id", input.ratePlanIds),
  ]);
  if (rooms.error) throw new Error(rooms.error.message);
  if (rates.error) throw new Error(rates.error.message);
  if (channels.error) throw new Error(channels.error.message);
  if (restrictions.error) throw new Error(restrictions.error.message);
  const plans = await db
    .from("hotel_rate_plans")
    .select("id, room_type_id")
    .eq("restaurant_id", input.restaurantId)
    .in("id", input.ratePlanIds);
  if (plans.error) throw new Error(plans.error.message);
  const rateRows = rates.data ?? [];
  return prepareAiosellRateRestrictions({
    environment: input.environment,
    hotelCode: connection.hotelCode,
    startDate: input.startDate,
    endDate: input.endDate,
    toChannels: (channels.data ?? []).map((row) => row.code),
    roomMappings: (rooms.data ?? []).flatMap((row) =>
      row.external_room_code
        ? [{ roomTypeId: row.room_type_id, roomCode: row.external_room_code }]
        : [],
    ),
    plans: (plans.data ?? []).flatMap((plan) => {
      const rate = rateRows.find((row) => row.rate_plan_id === plan.id);
      if (!rate?.external_rate_code || !rate.external_room_code) return [];
      return [
        {
          ratePlanId: plan.id,
          roomTypeId: plan.room_type_id,
          roomCode: rate.external_room_code,
          rateplanCode: rate.external_rate_code,
        },
      ];
    }),
    restrictions: (restrictions.data ?? []).map((row) => ({
      ratePlanId: row.rate_plan_id,
      date: row.restriction_date,
      stopSell: row.stop_sell,
      minimumStay: row.min_stay,
      maximumStay: row.max_stay,
      closeOnArrival: row.closed_to_arrival,
      closeOnDeparture: row.closed_to_departure,
    })),
  });
}

export async function pushAiosellRateRestrictions(
  input: Parameters<typeof prepareAiosellRateRestrictionsRecord>[0] & { dryRun?: boolean },
) {
  const prepared = await prepareAiosellRateRestrictionsRecord(input);
  if (input.dryRun || !prepared.ready || !prepared.payload) return prepared;
  const auth = resolveAiosellBasicAuth(process.env);
  if ("error" in auth) {
    return { ...prepared, ready: false, errors: [{ code: auth.error, message: auth.error }] };
  }
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const db = await admin();
  const client = createAiosellClient({
    partnerSlug: connection.partnerSlug,
    username: auth.username,
    password: auth.password,
  });
  const result = await runAiosellOutbound({
    restaurantId: input.restaurantId,
    operation: "rate_restrictions",
    channel: prepared.payload.toChannels.join(",").slice(0, 200),
    secrets: auth,
    call: () => client.pushRateRestrictions(prepared.payload),
    record: async (event) => {
      const saved = await db.from("pms_distribution_sync_events").insert(event);
      if (saved.error) throw new Error(saved.error.message);
    },
  });
  return { ...prepared, result };
}

export async function fetchAiosellInventoryVerification(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  startDate: string;
  endDate: string;
}) {
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const auth = resolveAiosellBasicAuth(process.env);
  if ("error" in auth) return { ok: false as const, code: auth.error };
  const db = await admin();
  const client = createAiosellClient({
    partnerSlug: connection.partnerSlug,
    username: auth.username,
    password: auth.password,
  });
  return runAiosellOutbound({
    restaurantId: input.restaurantId,
    operation: "fetch_inventory",
    secrets: auth,
    call: () =>
      client.fetchInventory({
        type: "inventory",
        hotelCode: connection.hotelCode,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    record: async (event) => {
      const saved = await db.from("pms_distribution_sync_events").insert(event);
      if (saved.error) throw new Error(saved.error.message);
    },
  });
}

export async function fetchAiosellRateVerification(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  startDate: string;
  endDate: string;
}) {
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  if (!connection) throw new Error("AIOSELL_CONNECTION_REQUIRED");
  const auth = resolveAiosellBasicAuth(process.env);
  if ("error" in auth) return { ok: false as const, code: auth.error };
  const db = await admin();
  const client = createAiosellClient({
    partnerSlug: connection.partnerSlug,
    username: auth.username,
    password: auth.password,
  });
  return runAiosellOutbound({
    restaurantId: input.restaurantId,
    operation: "fetch_rates",
    secrets: auth,
    call: () =>
      client.fetchRates({
        type: "rates",
        hotelCode: connection.hotelCode,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    record: async (event) => {
      const saved = await db.from("pms_distribution_sync_events").insert(event);
      if (saved.error) throw new Error(saved.error.message);
    },
  });
}
