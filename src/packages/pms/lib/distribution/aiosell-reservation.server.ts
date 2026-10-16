/**
 * AIOS-05 server adapter for the Aiosell reservation webhook.
 * The route authenticates and normalizes. The database function performs the write.
 */
import {
  receiveAiosellReservation,
  aiosellWebhookChannelAccepted,
  type AiosellReservationDirectory,
} from "./aiosell-reservation";

type Admin = {
  from: (table: string) => {
    select: (columns: string) => AdminQuery;
    insert: (row: unknown) => Promise<{ error: { message: string } | null }>;
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type AdminQuery = {
  eq: (column: string, value: string | boolean) => AdminQuery;
  neq: (column: string, value: string) => AdminQuery;
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  }>;
  then: Promise<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>["then"];
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

function rows(result: {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}) {
  if (result.error) throw new Error("AIOSELL_LOOKUP_FAILED");
  return result.data ?? [];
}

export async function aiosellReservationDirectory(): Promise<AiosellReservationDirectory> {
  const db = await admin();
  return {
    async findProperties(hotelCode) {
      const result = await db
        .from("pms_integrations")
        .select("restaurant_id, environment")
        .eq("provider", "aiosell")
        .eq("external_property_code", hotelCode)
        .eq("enabled", true)
        .neq("status", "disabled");
      const matches = [];
      for (const row of rows(await result)) {
        const restaurantId = String(row.restaurant_id);
        const property = await db
          .from("restaurants")
          .select("currency_code")
          .eq("id", restaurantId)
          .maybeSingle();
        if (property.error || !property.data) continue;
        const environment = row.environment === "production" ? "production" : "sandbox";
        matches.push({
          restaurantId,
          environment,
          currency: String(property.data.currency_code),
        });
      }
      return matches;
    },
    async hasChannel(restaurantId, environment, channel) {
      const integration = await db
        .from("pms_integrations")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("provider", "aiosell")
        .eq("environment", environment)
        .eq("enabled", true)
        .neq("status", "disabled")
        .maybeSingle();
      if (integration.error) throw new Error("AIOSELL_LOOKUP_FAILED");
      const channelRow = await db
        .from("distribution_channels")
        .select("restaurant_id, environment, code, channel_type, status, integration_id")
        .eq("restaurant_id", restaurantId)
        .eq("environment", environment)
        .eq("code", channel)
        .maybeSingle();
      if (channelRow.error) throw new Error("AIOSELL_LOOKUP_FAILED");
      const row = channelRow.data;
      const rowEnvironment = row?.environment === "production" ? "production" : "sandbox";
      return aiosellWebhookChannelAccepted({
        restaurantId,
        environment,
        channel,
        integrationId: integration.data?.id ? String(integration.data.id) : null,
        channels: row
          ? [
              {
                restaurantId: String(row.restaurant_id),
                environment: rowEnvironment,
                code: String(row.code),
                channelType: String(row.channel_type),
                status: String(row.status),
                integrationId: row.integration_id ? String(row.integration_id) : null,
              },
            ]
          : [],
      });
    },
    async resolveRoom(restaurantId, environment, roomCode) {
      const channel = await db
        .from("distribution_channels")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("code", environment === "sandbox" ? "aiosell.sandbox" : "aiosell.production")
        .maybeSingle();
      if (!channel.data?.id) return null;
      const mapping = await db
        .from("distribution_room_mappings")
        .select("room_type_id")
        .eq("channel_id", String(channel.data.id))
        .eq("external_room_code", roomCode)
        .maybeSingle();
      if (!mapping.data?.room_type_id) return null;
      return { roomTypeId: String(mapping.data.room_type_id) };
    },
    async resolveRate(restaurantId, environment, roomCode, rateplanCode) {
      const channel = await db
        .from("distribution_channels")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("code", environment === "sandbox" ? "aiosell.sandbox" : "aiosell.production")
        .maybeSingle();
      if (!channel.data?.id) return null;
      const mapping = await db
        .from("distribution_rate_mappings")
        .select("rate_plan_id")
        .eq("channel_id", String(channel.data.id))
        .eq("external_room_code", roomCode)
        .eq("external_rate_code", rateplanCode)
        .maybeSingle();
      if (!mapping.data?.rate_plan_id) return null;
      const plan = await db
        .from("hotel_rate_plans")
        .select("room_type_id")
        .eq("id", String(mapping.data.rate_plan_id))
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (!plan.data?.room_type_id) return null;
      return {
        ratePlanId: String(mapping.data.rate_plan_id),
        roomTypeId: String(plan.data.room_type_id),
      };
    },
    async apply(command) {
      const result = await db.rpc("apply_external_reservation_event", { _payload: command });
      if (result.error) {
        if (result.error.message.includes("NO_AVAILABILITY")) {
          return {
            outcome: "status_conflict",
            reservationId: null,
            confirmationNumber: null,
            folioId: null,
          };
        }
        throw new Error("AIOSELL_WRITE_FAILED");
      }
      const data = result.data as {
        outcome:
          | "created"
          | "duplicate"
          | "modified"
          | "modify_idempotent"
          | "cancelled"
          | "cancel_idempotent"
          | "not_found"
          | "status_conflict";
        reservationId: string | null;
        confirmationNumber: string | null;
        folioId: string | null;
      };
      return data;
    },
    async record(event) {
      const saved = await db.from("pms_distribution_sync_events").insert(event);
      if (saved.error) throw new Error("AIOSELL_LOG_FAILED");
    },
  };
}

export async function handleAiosellReservationWebhook(request: Request): Promise<Response> {
  const username = process.env["AIOSELL_BASIC_AUTH_USERNAME"] ?? "";
  const password = process.env["AIOSELL_BASIC_AUTH_PASSWORD"] ?? "";
  const rawText = await request.text();
  let body: unknown;
  if (rawText === "") body = undefined;
  else {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = undefined;
    }
  }
  const result = await receiveAiosellReservation(
    {
      authorization: request.headers.get("authorization"),
      username,
      password,
      body,
      rawText: body === undefined ? rawText : "",
    },
    await aiosellReservationDirectory(),
  );
  return Response.json(result.body, { status: result.status });
}
