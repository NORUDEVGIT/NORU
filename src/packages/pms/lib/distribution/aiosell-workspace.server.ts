/**
 * AIOS-07 server load for the Aiosell operator panel.
 * Returns projected status only. Credential values stay on the server.
 */
import { resolveAiosellBasicAuth } from "./aiosell-client";
import type { AiosellEnvironment } from "./aiosell-connection";
import { aiosellMappingChannelCode } from "./aiosell-connection";
import { getAiosellConnectionRecord } from "./aiosell-connection.server";
import {
  aiosellWorkspaceView,
  aiosellRateMappingError,
  type AiosellSyncEventView,
} from "./aiosell-workspace";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error("AIOSELL_LOOKUP_FAILED");
}

export function aiosellCredentialFlag(env: Record<string, string | undefined>): boolean {
  const auth = resolveAiosellBasicAuth(env);
  return !("error" in auth);
}

export function projectLoadedWorkspace(input: {
  environment: AiosellEnvironment;
  connection: Awaited<ReturnType<typeof getAiosellConnectionRecord>>;
  credentialsConfigured: boolean;
  currencyCompatible: boolean | null;
  timezoneCompatible: boolean | null;
  roomTypes: { id: string; name: string; code: string | null }[];
  roomMappings: { roomTypeId: string; roomCode: string; active: boolean }[];
  ratePlans: { id: string; name: string; roomTypeId: string }[];
  rateMappings: {
    ratePlanId: string;
    roomCode: string;
    rateplanCode: string;
    active: boolean;
  }[];
  channels: { code: string; operations: string[]; enabled: boolean }[];
  events: AiosellSyncEventView[];
  publicBaseUrl: string | null;
}) {
  const roomName = new Map(input.roomTypes.map((row) => [row.id, row.name]));
  const planRoom = new Map(input.ratePlans.map((row) => [row.id, row.roomTypeId]));
  return aiosellWorkspaceView({
    environment: input.environment,
    connection: input.connection
      ? {
          partnerSlug: input.connection.partnerSlug,
          hotelCode: input.connection.hotelCode,
          status: input.connection.status,
          enabled: input.connection.enabled,
          lastValidatedAt: input.connection.lastValidatedAt,
          lastError: input.connection.lastError,
        }
      : null,
    credentialsConfigured: input.credentialsConfigured,
    currencyCompatible: input.currencyCompatible,
    timezoneCompatible: input.timezoneCompatible,
    roomTypes: input.roomTypes,
    roomMappings: input.roomMappings,
    ratePlans: input.ratePlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      roomTypeId: plan.roomTypeId,
      roomTypeName: roomName.get(plan.roomTypeId) ?? "Room type",
    })),
    rateMappings: input.rateMappings.map((row) => {
      const roomTypeId = planRoom.get(row.ratePlanId);
      const room = input.roomMappings.find(
        (mapped) => mapped.roomTypeId === roomTypeId && mapped.active,
      );
      const error = aiosellRateMappingError({
        roomCode: row.roomCode,
        mappedRoomCode: room?.roomCode ?? null,
      });
      return { ...row, error };
    }),
    channels: input.channels.filter((row) => !row.code.startsWith("aiosell.")),
    events: input.events,
    publicBaseUrl: input.publicBaseUrl,
  });
}

export async function loadAiosellWorkspace(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
}) {
  const db = await admin();
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  const anchor = aiosellMappingChannelCode(input.environment);
  const [rooms, plans, events, channels] = await Promise.all([
    db
      .from("room_types")
      .select("id, name, code")
      .eq("restaurant_id", input.restaurantId)
      .eq("active", true)
      .eq("sellable", true),
    db
      .from("hotel_rate_plans")
      .select("id, name, room_type_id")
      .eq("restaurant_id", input.restaurantId)
      .eq("active", true),
    db
      .from("pms_distribution_sync_events")
      .select(
        "operation, direction, status, channel, external_booking_id, response_message, created_at",
      )
      .eq("restaurant_id", input.restaurantId)
      .eq("provider", "aiosell")
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("distribution_channels")
      .select("id, code, external_operations, status, environment")
      .eq("restaurant_id", input.restaurantId)
      .eq("environment", input.environment),
  ]);
  fail(rooms.error);
  fail(plans.error);
  fail(events.error);
  fail(channels.error);
  const anchorRow = (channels.data ?? []).find((row) => row.code === anchor);
  const roomMappings = anchorRow
    ? await db
        .from("distribution_room_mappings")
        .select("room_type_id, external_room_code, active")
        .eq("restaurant_id", input.restaurantId)
        .eq("channel_id", anchorRow.id)
    : { data: [], error: null };
  const rateMappings = anchorRow
    ? await db
        .from("distribution_rate_mappings")
        .select("rate_plan_id, external_room_code, external_rate_code, active")
        .eq("restaurant_id", input.restaurantId)
        .eq("channel_id", anchorRow.id)
    : { data: [], error: null };
  fail(roomMappings.error);
  fail(rateMappings.error);
  const safeEvents: AiosellSyncEventView[] = (events.data ?? []).flatMap((row) => {
    if (row.direction !== "inbound" && row.direction !== "outbound") return [];
    if (row.status !== "success" && row.status !== "failed" && row.status !== "info") return [];
    return [
      {
        operation: row.operation,
        direction: row.direction,
        status: row.status,
        channel: row.channel,
        bookingId: row.external_booking_id,
        message: row.response_message,
        createdAt: row.created_at,
      },
    ];
  });
  return projectLoadedWorkspace({
    environment: input.environment,
    connection,
    credentialsConfigured: aiosellCredentialFlag(process.env),
    currencyCompatible: connection?.lastValidatedAt ? connection.lastError === null : null,
    timezoneCompatible: connection?.lastValidatedAt ? connection.lastError === null : null,
    roomTypes: (rooms.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
    })),
    roomMappings: (roomMappings.data ?? []).flatMap((row) =>
      row.external_room_code
        ? [{ roomTypeId: row.room_type_id, roomCode: row.external_room_code, active: row.active }]
        : [],
    ),
    ratePlans: (plans.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      roomTypeId: row.room_type_id,
    })),
    rateMappings: (rateMappings.data ?? []).flatMap((row) =>
      row.external_room_code && row.external_rate_code
        ? [
            {
              ratePlanId: row.rate_plan_id,
              roomCode: row.external_room_code,
              rateplanCode: row.external_rate_code,
              active: row.active,
            },
          ]
        : [],
    ),
    channels: (channels.data ?? [])
      .filter((row) => row.code !== anchor)
      .map((row) => ({
        code: row.code,
        operations: row.external_operations ?? [],
        enabled: row.status !== "inactive",
      })),
    events: safeEvents,
    publicBaseUrl: process.env.VITE_PUBLIC_APP_URL ?? null,
  });
}
