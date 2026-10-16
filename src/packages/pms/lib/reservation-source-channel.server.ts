/**
 * Property-scoped reservation channel read. Selects no integration config.
 */
import type { PmsSet6CatalogueItem } from "./pms-set6-sales-distribution";
import {
  enabledReservationEnvironments,
  projectReservationSources,
  reservationCreateEnvironment,
  reservationSourceChannelDecision,
  selectReservationOtaChannels,
  OTA_CHANNEL_EMPTY_MESSAGE,
  OTA_CHANNEL_REQUIRED_MESSAGE,
  type ReservationCreateChannel,
  type ReservationEnvironment,
  type ReservationSourceOption,
} from "./reservation-source-channel";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type ReservationCreateSourceChannelRead = {
  sources: ReservationSourceOption[];
  channels: ReservationCreateChannel[];
};

export async function loadReservationCreateSourceChannel(input: {
  restaurantId: string;
  environment?: ReservationEnvironment;
}): Promise<ReservationCreateSourceChannelRead> {
  const db = await admin();
  const [sources, channels, integrations] = await Promise.all([
    db
      .from("pms_source_codes")
      .select("id, code, name, description, active")
      .eq("restaurant_id", input.restaurantId),
    db
      .from("distribution_channels")
      .select("id, restaurant_id, code, name, channel_type, status, environment, integration_id")
      .eq("restaurant_id", input.restaurantId),
    db
      .from("pms_integrations")
      .select("id, environment, enabled, status")
      .eq("restaurant_id", input.restaurantId),
  ]);
  fail(sources.error);
  fail(channels.error);
  fail(integrations.error);
  const sourceRows: PmsSet6CatalogueItem[] = (sources.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    active: row.active,
  }));
  const environment =
    input.environment ??
    reservationCreateEnvironment(
      enabledReservationEnvironments(
        (integrations.data ?? []).map((row) => ({
          environment: row.environment,
          enabled: row.enabled,
          status: row.status,
        })),
      ),
    );
  const enabledIntegrationIds = (integrations.data ?? [])
    .filter(
      (row) =>
        row.enabled &&
        row.status !== "disabled" &&
        environment != null &&
        row.environment === environment,
    )
    .map((row) => row.id);
  return {
    sources: projectReservationSources(sourceRows),
    channels: environment
      ? selectReservationOtaChannels({
          restaurantId: input.restaurantId,
          environment,
          enabledIntegrationIds,
          channels: (channels.data ?? []).map((row) => ({
            id: row.id,
            restaurantId: row.restaurant_id,
            code: row.code,
            name: row.name,
            channelType: row.channel_type,
            status: row.status,
            environment: row.environment,
            integrationId: row.integration_id,
          })),
        })
      : [],
  };
}

export async function assertReservationCreateSourceChannel(input: {
  restaurantId: string;
  commercialBookingSource: string | null;
  commercialSalesChannel: string | null;
}): Promise<{ commercialSalesChannel: string | null }> {
  const read = await loadReservationCreateSourceChannel({ restaurantId: input.restaurantId });
  const source = read.sources.find((row) => row.id === input.commercialBookingSource) ?? null;
  const decision = reservationSourceChannelDecision({
    source: source ? { code: source.code, name: source.name } : null,
    channelId: source?.otaCategory ? input.commercialSalesChannel : null,
    channels: read.channels,
  });
  if (!decision.accepted) {
    throw new Error(
      decision.code === "OTA_CHANNEL_REQUIRED" && read.channels.length === 0
        ? OTA_CHANNEL_EMPTY_MESSAGE
        : OTA_CHANNEL_REQUIRED_MESSAGE,
    );
  }
  return { commercialSalesChannel: source?.otaCategory ? input.commercialSalesChannel : null };
}
