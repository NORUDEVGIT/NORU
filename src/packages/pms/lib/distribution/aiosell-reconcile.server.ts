/**
 * AIOS-06 server entry points.
 * Property-scoped. No public route. No local no-show status change.
 */
import { createAiosellClient, resolveAiosellBasicAuth } from "./aiosell-client";
import type { AiosellEnvironment } from "./aiosell-connection";
import { getAiosellConnectionRecord } from "./aiosell-connection.server";
import { notifyAiosellNoShow, reconcileAiosellReservations } from "./aiosell-reconcile";
import { aiosellReservationDirectory } from "./aiosell-reservation.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function reconcileAiosellPropertyReservations(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  startDate: string;
  endDate: string;
}) {
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  const directory = await aiosellReservationDirectory();
  if (!connection?.enabled) {
    return reconcileAiosellReservations(
      {
        restaurantId: input.restaurantId,
        hotelCode: connection?.hotelCode ?? "",
        startDate: input.startDate,
        endDate: input.endDate,
      },
      {
        directory,
        fetchReservations: async () => ({
          ok: false,
          code: "AIOSELL_CONNECTION_REQUIRED",
          message: "Aiosell connection is not ready.",
          httpStatus: null,
        }),
        findFingerprint: async () => ({ found: false, fingerprint: null }),
      },
    );
  }
  const auth = resolveAiosellBasicAuth(process.env);
  if ("error" in auth) {
    return reconcileAiosellReservations(
      {
        restaurantId: input.restaurantId,
        hotelCode: connection.hotelCode,
        startDate: input.startDate,
        endDate: input.endDate,
      },
      {
        directory,
        fetchReservations: async () => ({
          ok: false,
          code: auth.error,
          message: "Aiosell credentials are missing.",
          httpStatus: null,
        }),
        findFingerprint: async () => ({ found: false, fingerprint: null }),
      },
    );
  }
  const db = await admin();
  const client = createAiosellClient({
    partnerSlug: connection.partnerSlug,
    username: auth.username,
    password: auth.password,
  });
  return reconcileAiosellReservations(
    {
      restaurantId: input.restaurantId,
      hotelCode: connection.hotelCode,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    {
      directory,
      fetchReservations: (request) => client.fetchReservations(request),
      async findFingerprint(query) {
        const mapping = await db
          .from("pms_external_reservation_mappings")
          .select("reservation_id")
          .eq("restaurant_id", query.restaurantId)
          .eq("provider", "aiosell")
          .eq("hotel_code", query.hotelCode)
          .eq("channel", query.channel)
          .eq("external_booking_id", query.bookingId)
          .maybeSingle();
        if (mapping.error) throw new Error("AIOSELL_LOOKUP_FAILED");
        if (!mapping.data?.reservation_id) return { found: false, fingerprint: null };
        const snapshot = await db
          .from("pms_external_reservation_snapshots")
          .select("state_fingerprint")
          .eq("restaurant_id", query.restaurantId)
          .eq("reservation_id", mapping.data.reservation_id)
          .maybeSingle();
        if (snapshot.error) throw new Error("AIOSELL_LOOKUP_FAILED");
        return {
          found: true,
          fingerprint: snapshot.data?.state_fingerprint ?? null,
        };
      },
    },
  );
}

export async function notifyAiosellReservationNoShow(input: {
  restaurantId: string;
  environment: AiosellEnvironment;
  reservationId: string;
}) {
  const connection = await getAiosellConnectionRecord(input.restaurantId, input.environment);
  const db = await admin();
  const auth = connection
    ? resolveAiosellBasicAuth(process.env)
    : { error: "AIOSELL_CREDENTIALS_MISSING" as const };
  const client =
    connection && !("error" in auth)
      ? createAiosellClient({
          partnerSlug: connection.partnerSlug,
          username: auth.username,
          password: auth.password,
        })
      : null;
  return notifyAiosellNoShow(input, {
    async loadReservation(restaurantId, reservationId) {
      const row = await db
        .from("hotel_reservations")
        .select("id")
        .eq("id", reservationId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (row.error) throw new Error("AIOSELL_LOOKUP_FAILED");
      return Boolean(row.data?.id);
    },
    async loadMapping(restaurantId, reservationId) {
      const row = await db
        .from("pms_external_reservation_mappings")
        .select("provider, hotel_code, channel, external_booking_id")
        .eq("restaurant_id", restaurantId)
        .eq("reservation_id", reservationId)
        .maybeSingle();
      if (row.error) throw new Error("AIOSELL_LOOKUP_FAILED");
      if (!row.data?.hotel_code || !row.data.channel || !row.data.external_booking_id) return null;
      return {
        provider: String(row.data.provider),
        hotelCode: String(row.data.hotel_code),
        channel: String(row.data.channel),
        bookingId: String(row.data.external_booking_id),
      };
    },
    async markNoShow(request) {
      if (!client) {
        return {
          ok: false,
          code: connection
            ? "error" in auth
              ? auth.error
              : "AIOSELL_CONNECTION_REQUIRED"
            : "AIOSELL_CONNECTION_REQUIRED",
          message: "Aiosell connection is not ready.",
          httpStatus: null,
        };
      }
      return client.markNoShow(request);
    },
    async record(event) {
      const saved = await db.from("pms_distribution_sync_events").insert(event);
      if (saved.error) throw new Error("AIOSELL_LOG_FAILED");
    },
  });
}
