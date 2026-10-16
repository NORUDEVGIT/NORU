/**
 * AIOS-02 external reservation identity service.
 * This module does not create, amend, or cancel reservations.
 */
import type { Database } from "@/integrations/supabase/types";
import {
  externalReservationIdentity,
  type ExternalReservationIdentity,
  type ExternalReservationIdentityInput,
} from "./external-reservation-identity";

export type ExternalReservationMapping = {
  id: string;
  restaurantId: string;
  provider: "aiosell";
  hotelCode: string;
  channel: string;
  externalBookingId: string;
  cmBookingId: string | null;
  reservationId: string;
  createdAt: string;
  updatedAt: string;
};

export type ExternalReservationMappingStore = {
  findReservationRestaurant(reservationId: string): Promise<string | null>;
  findByIdentity(identity: ExternalReservationIdentity): Promise<ExternalReservationMapping | null>;
  insert(
    row: Omit<ExternalReservationMapping, "id" | "createdAt" | "updatedAt">,
  ): Promise<ExternalReservationMapping>;
};

export type CreateExternalReservationMappingInput = ExternalReservationIdentityInput & {
  reservationId: string;
  cmBookingId?: string | null;
};

type MappingRow = Database["public"]["Tables"]["pms_external_reservation_mappings"]["Row"];

function sameIdentity(
  left: ExternalReservationMapping,
  identity: ExternalReservationIdentity,
): boolean {
  return (
    left.restaurantId === identity.restaurantId &&
    left.provider === identity.provider &&
    left.hotelCode === identity.hotelCode &&
    left.channel === identity.channel &&
    left.externalBookingId === identity.externalBookingId
  );
}

export function toExternalReservationMapping(row: MappingRow): ExternalReservationMapping {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    provider: "aiosell",
    hotelCode: row.hotel_code,
    channel: row.channel,
    externalBookingId: row.external_booking_id,
    cmBookingId: row.cm_booking_id,
    reservationId: row.reservation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findExternalReservationMapping(
  store: ExternalReservationMappingStore,
  input: ExternalReservationIdentityInput,
): Promise<ExternalReservationMapping | null> {
  return store.findByIdentity(externalReservationIdentity(input));
}

export async function createExternalReservationMapping(
  store: ExternalReservationMappingStore,
  input: CreateExternalReservationMappingInput,
): Promise<ExternalReservationMapping> {
  const identity = externalReservationIdentity(input);
  if (!input.reservationId) {
    throw new Error("RESERVATION_NOT_FOUND");
  }
  const owner = await store.findReservationRestaurant(input.reservationId);
  if (!owner) {
    throw new Error("RESERVATION_NOT_FOUND");
  }
  if (owner !== identity.restaurantId) {
    throw new Error("EXTERNAL_RESERVATION_PROPERTY_MISMATCH");
  }
  const existing = await store.findByIdentity(identity);
  if (existing) {
    if (existing.reservationId !== input.reservationId) {
      throw new Error("EXTERNAL_RESERVATION_CONFLICT");
    }
    return existing;
  }
  const created = await store.insert({
    restaurantId: identity.restaurantId,
    provider: identity.provider,
    hotelCode: identity.hotelCode,
    channel: identity.channel,
    externalBookingId: identity.externalBookingId,
    cmBookingId: input.cmBookingId ?? null,
    reservationId: input.reservationId,
  });
  if (!sameIdentity(created, identity) || created.reservationId !== input.reservationId) {
    throw new Error("EXTERNAL_RESERVATION_CONFLICT");
  }
  return created;
}

export async function findExternalReservationMappingRecord(
  input: ExternalReservationIdentityInput,
): Promise<ExternalReservationMapping | null> {
  const identity = externalReservationIdentity(input);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("pms_external_reservation_mappings")
    .select("*")
    .eq("restaurant_id", identity.restaurantId)
    .eq("provider", identity.provider)
    .eq("hotel_code", identity.hotelCode)
    .eq("channel", identity.channel)
    .eq("external_booking_id", identity.externalBookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toExternalReservationMapping(data) : null;
}

export async function createExternalReservationMappingRecord(
  input: CreateExternalReservationMappingInput,
): Promise<ExternalReservationMapping> {
  const identity = externalReservationIdentity(input);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("create_external_reservation_mapping", {
    _restaurant_id: identity.restaurantId,
    _provider: identity.provider,
    _hotel_code: identity.hotelCode,
    _channel: identity.channel,
    _external_booking_id: identity.externalBookingId,
    _reservation_id: input.reservationId,
    _cm_booking_id: input.cmBookingId ?? undefined,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("RESERVATION_NOT_FOUND");
  return toExternalReservationMapping(data);
}
