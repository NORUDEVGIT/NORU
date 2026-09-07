import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  BOOKING_UNAVAILABLE,
  LOOKUP_FAILED,
  admin,
  directChannelId,
  logDistribution,
  matchOrCreateGuest,
  resolveStayProperty,
  type StayProperty,
  type StayPropertyStatus,
} from "./public-booking.server";
import { signRoomImages } from "./rooms.server";
import { parseSnapshot, rateError, toQuote, type StayQuote } from "./rates.server";
import { nightsBetween, propertyToday } from "./reservation-dates";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/i, "invalid slug");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const idSchema = z.string().uuid();

const staySchema = z.object({
  slug: slugSchema,
  arrival: dateSchema,
  departure: dateSchema,
  adults: z.number().int().min(1).max(10),
  children: z.number().int().min(0).max(10),
});

/* ------------------------------------------------------------------- types */

export interface PublicRatePlanOption {
  ratePlanId: string;
  name: string;
  description: string | null;
  quote: StayQuote | null;
  unavailableReason: string | null;
}

export interface PublicRoomTypeOffer {
  roomTypeId: string;
  name: string;
  description: string | null;
  maxOccupancy: number;
  adultCapacity: number;
  childCapacity: number;
  bedType: string | null;
  bedCount: number | null;
  roomSize: string | null;
  roomView: string | null;
  amenities: string[];
  images: string[];
  coverUrl: string | null;
  available: number;
  plans: PublicRatePlanOption[];
}

export interface PublicBookingDetail {
  confirmationNumber: string;
  status: string;
  guestName: string;
  propertyName: string;
  roomTypeName: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  adults: number;
  children: number;
  ratePlanName: string | null;
  currency: string | null;
  total: number | null;
  nightly: { date: string; rate: number }[];
  specialRequests: string | null;
  canCancel: boolean;
}

/* ---------------------------------------------------------------- property */

export const getStayProperty = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ slug: slugSchema }).parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ status: StayPropertyStatus; property: StayProperty | null }> => {
      const { resolveStayPropertyPublic } = await import("./public-booking.server");
      return resolveStayPropertyPublic(data.slug);
    },
  );

/* ------------------------------------------------------------------ search */

export const searchStay = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => staySchema.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ ok: false; message: string } | { ok: true; offers: PublicRoomTypeOffer[]; nights: number }> => {
      const property = await resolveStayProperty(data.slug);
      if (!property) return { ok: false, message: "This property isn't taking direct bookings right now." };
      if (data.departure <= data.arrival) return { ok: false, message: "Check-out must be after check-in." };
      if (data.arrival < propertyToday(property.timezone)) {
        return { ok: false, message: "Check-in can't be in the past." };
      }

      const db = await admin();
      const guests = data.adults + data.children;

      const { data: types } = await db
        .from("room_types")
        .select(
          "id, name, description, max_occupancy, adult_capacity, child_capacity, bed_type, bed_count, room_size, room_view",
        )
        .eq("restaurant_id", property.id)
        .eq("active", true)
        .eq("sellable", true)
        .order("name");

      const candidates = (types ?? []).filter((t) => t.max_occupancy >= guests);
      if (candidates.length === 0) return { ok: true, offers: [], nights: nightsBetween(data.arrival, data.departure) };

      const ids = candidates.map((t) => t.id);

      const [{ data: amenityRows }, { data: imageRows }, { data: planRows }] = await Promise.all([
        db
          .from("room_type_amenities")
          .select("room_type_id, room_amenities ( name )")
          .eq("restaurant_id", property.id)
          .in("room_type_id", ids),
        db
          .from("room_type_images")
          .select("room_type_id, storage_path, is_cover, display_order")
          .eq("restaurant_id", property.id)
          .in("room_type_id", ids)
          .order("display_order"),
        db
          .from("hotel_rate_plans")
          .select("id, room_type_id, name, description")
          .eq("restaurant_id", property.id)
          .in("room_type_id", ids)
          .eq("active", true)
          .order("name"),
      ]);

      const signed = await signRoomImages((imageRows ?? []).map((r) => r.storage_path));

      const offers: PublicRoomTypeOffer[] = [];
      for (const type of candidates) {
        const { data: total } = await db.rpc("count_sellable_rooms", {
          _restaurant_id: property.id,
          _room_type_id: type.id,
        });
        const { data: reserved } = await db.rpc("count_reserved_rooms", {
          _restaurant_id: property.id,
          _room_type_id: type.id,
          _arrival: data.arrival,
          _departure: data.departure,
        });
        const available = Math.max(0, Number(total ?? 0) - Number(reserved ?? 0));
        if (available <= 0) continue;

        const plans: PublicRatePlanOption[] = [];
        for (const plan of (planRows ?? []).filter((p) => p.room_type_id === type.id)) {
          const { data: pricing, error } = await db.rpc("price_hotel_stay", {
            _restaurant_id: property.id,
            _rate_plan_id: plan.id,
            _room_type_id: type.id,
            _arrival: data.arrival,
            _departure: data.departure,
          });
          plans.push({
            ratePlanId: plan.id,
            name: plan.name,
            description: plan.description,
            quote: error ? null : toQuote(pricing),
            unavailableReason: error ? rateError(error.message).message : null,
          });
        }

        const typeImages = (imageRows ?? []).filter((i) => i.room_type_id === type.id);
        const cover = typeImages.find((i) => i.is_cover) ?? typeImages[0];

        offers.push({
          roomTypeId: type.id,
          name: type.name,
          description: type.description,
          maxOccupancy: type.max_occupancy,
          adultCapacity: type.adult_capacity,
          childCapacity: type.child_capacity,
          bedType: type.bed_type,
          bedCount: type.bed_count,
          roomSize: type.room_size,
          roomView: type.room_view,
          amenities: (amenityRows ?? [])
            .filter((a) => a.room_type_id === type.id)
            .map((a) => (a.room_amenities as { name: string } | null)?.name ?? "")
            .filter(Boolean),
          images: typeImages.map((i) => signed.get(i.storage_path) ?? "").filter(Boolean),
          coverUrl: cover ? (signed.get(cover.storage_path) ?? null) : null,
          available,
          plans,
        });
      }

      return { ok: true, offers, nights: nightsBetween(data.arrival, data.departure) };
    },
  );

/* ------------------------------------------------------------------ submit */

export const submitDirectBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staySchema
      .extend({
        roomTypeId: idSchema,
        ratePlanId: idSchema.nullable().optional(),
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().max(80).optional(),
        email: z.string().trim().email().max(160),
        phone: z.string().trim().min(5).max(40),
        nationality: z.string().trim().max(80).optional(),
        specialRequests: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: false; message: string } | { ok: true; confirmationNumber: string }> => {
      const property = await resolveStayProperty(data.slug);
      if (!property) return { ok: false, message: "This property isn't taking direct bookings right now." };
      if (data.departure <= data.arrival) return { ok: false, message: "Check-out must be after check-in." };
      if (data.arrival < propertyToday(property.timezone)) {
        return { ok: false, message: "Check-in can't be in the past." };
      }

      const db = await admin();

      // Every id is re-validated against the property resolved from the slug.
      const { data: type } = await db
        .from("room_types")
        .select("id, max_occupancy")
        .eq("restaurant_id", property.id)
        .eq("id", data.roomTypeId)
        .eq("active", true)
        .eq("sellable", true)
        .maybeSingle();
      if (!type) return { ok: false, message: BOOKING_UNAVAILABLE };
      if (data.adults + data.children > type.max_occupancy) {
        return { ok: false, message: "That room type can't take this many guests." };
      }

      let ratePlanId: string | null = null;
      if (data.ratePlanId) {
        const { data: plan } = await db
          .from("hotel_rate_plans")
          .select("id")
          .eq("restaurant_id", property.id)
          .eq("id", data.ratePlanId)
          .eq("room_type_id", data.roomTypeId)
          .eq("active", true)
          .maybeSingle();
        if (!plan) return { ok: false, message: "That rate is no longer available." };
        ratePlanId = plan.id;
      }

      const guestId = await matchOrCreateGuest(property.id, {
        firstName: data.firstName,
        lastName: data.lastName?.trim() || null,
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        nationality: data.nationality?.trim() || null,
      });

      // The locked database function is the authority on availability and price.
      const { data: created, error } = await db.rpc("create_direct_booking", {
        _restaurant_id: property.id,
        _guest_id: guestId,
        _room_type_id: data.roomTypeId,
        _arrival: data.arrival,
        _departure: data.departure,
        _adults: data.adults,
        _children: data.children,
        _special_requests: (data.specialRequests?.trim() || null) as unknown as string,
        _rate_plan_id: ratePlanId as unknown as string,
      });

      if (error) {
        const message = /NO_AVAILABILITY/.test(error.message)
          ? BOOKING_UNAVAILABLE
          : rateError(error.message).message;
        await logDistribution({
          restaurantId: property.id,
          channelId: await directChannelId(property.id),
          eventType: "direct_booking_failed",
          status: "failed",
          message,
          summary: { arrival: data.arrival, departure: data.departure, room_type_id: data.roomTypeId },
        });
        return { ok: false, message };
      }

      const row = created as unknown as { id: string; confirmation_number: string };
      await logDistribution({
        restaurantId: property.id,
        channelId: await directChannelId(property.id),
        eventType: "direct_booking_created",
        message: `Direct booking ${row.confirmation_number}`,
        referenceType: "reservation",
        referenceId: row.id,
        summary: { arrival: data.arrival, departure: data.departure, nights: nightsBetween(data.arrival, data.departure) },
      });

      return { ok: true, confirmationNumber: row.confirmation_number };
    },
  );

/* ------------------------------------------------------------------ lookup */

const lookupSchema = z.object({
  slug: slugSchema,
  confirmationNumber: z.string().trim().min(3).max(40),
  contact: z.string().trim().min(3).max(160),
});

const RESERVATION_PUBLIC_SELECT = `
  id, confirmation_number, status, arrival_date, departure_date, adults, children,
  special_requests, currency, room_subtotal, nightly_rate_snapshot, guest_id,
  guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, email, phone ),
  room_types!hotel_reservations_type_same_property ( name ),
  hotel_rate_plans ( name )
`;

type PublicRow = {
  id: string;
  confirmation_number: string;
  status: string;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  special_requests: string | null;
  currency: string | null;
  room_subtotal: number | string | null;
  nightly_rate_snapshot: unknown;
  guest_id: string;
  guest_profiles: { first_name: string; last_name: string | null; email: string | null; phone: string | null } | null;
  room_types: { name: string } | null;
  hotel_rate_plans: { name: string } | null;
};

/** Confirmation number plus email or phone. Any mismatch returns one generic message. */
async function findBooking(
  slug: string,
  confirmationNumber: string,
  contact: string,
): Promise<{ property: StayProperty; row: PublicRow } | null> {
  const property = await resolveStayProperty(slug);
  if (!property) return null;

  const db = await admin();
  const { data: row } = await db
    .from("hotel_reservations")
    .select(RESERVATION_PUBLIC_SELECT)
    .eq("restaurant_id", property.id)
    .eq("confirmation_number", confirmationNumber.trim().toUpperCase())
    .maybeSingle();
  if (!row) return null;

  const typed = row as unknown as PublicRow;
  const needle = contact.trim().toLowerCase();
  const digits = needle.replace(/[^0-9]/g, "");
  const email = (typed.guest_profiles?.email ?? "").toLowerCase();
  const phone = (typed.guest_profiles?.phone ?? "").replace(/[^0-9]/g, "");
  const matches = (email !== "" && email === needle) || (phone !== "" && digits !== "" && phone === digits);
  if (!matches) return null;

  return { property, row: typed };
}

function toPublicDetail(property: StayProperty, row: PublicRow): PublicBookingDetail {
  const guest = row.guest_profiles;
  return {
    confirmationNumber: row.confirmation_number,
    status: row.status,
    guestName: [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest",
    propertyName: property.name,
    roomTypeName: row.room_types?.name ?? "Room",
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    adults: row.adults,
    children: row.children,
    ratePlanName: row.hotel_rate_plans?.name ?? null,
    currency: row.currency ?? property.currency,
    total: row.room_subtotal === null || row.room_subtotal === undefined ? null : Number(row.room_subtotal),
    nightly: parseSnapshot(row.nightly_rate_snapshot),
    specialRequests: row.special_requests,
    canCancel:
      ["pending", "confirmed"].includes(row.status) && row.arrival_date >= propertyToday(property.timezone),
  };
}

export const lookupDirectBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => lookupSchema.parse(input))
  .handler(
    async ({ data }): Promise<{ ok: false; message: string } | { ok: true; booking: PublicBookingDetail }> => {
      const found = await findBooking(data.slug, data.confirmationNumber, data.contact);
      if (!found) return { ok: false, message: LOOKUP_FAILED };
      return { ok: true, booking: toPublicDetail(found.property, found.row) };
    },
  );

export const cancelDirectBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => lookupSchema.parse(input))
  .handler(
    async ({ data }): Promise<{ ok: false; message: string } | { ok: true; booking: PublicBookingDetail }> => {
      const found = await findBooking(data.slug, data.confirmationNumber, data.contact);
      if (!found) return { ok: false, message: LOOKUP_FAILED };

      const detail = toPublicDetail(found.property, found.row);
      if (!detail.canCancel) {
        return { ok: false, message: "This booking can't be cancelled online. Please contact the property." };
      }

      const db = await admin();
      const { error } = await db
        .from("hotel_reservations")
        .update({ status: "cancelled", cancellation_reason: "Cancelled by the guest online." })
        .eq("id", found.row.id)
        .eq("restaurant_id", found.property.id);
      if (error) return { ok: false, message: "We couldn't cancel that booking. Please contact the property." };

      await db.from("hotel_reservation_history").insert({
        restaurant_id: found.property.id,
        reservation_id: found.row.id,
        event_type: "cancelled",
        previous_values: { status: found.row.status } as never,
        new_values: { status: "cancelled" } as never,
        notes: "Cancelled by the guest through direct booking.",
        actor_membership_id: null,
      });

      await logDistribution({
        restaurantId: found.property.id,
        channelId: await directChannelId(found.property.id),
        eventType: "direct_booking_cancelled",
        message: `Guest cancelled ${found.row.confirmation_number}`,
        referenceType: "reservation",
        referenceId: found.row.id,
      });

      return { ok: true, booking: { ...detail, status: "cancelled", canCancel: false } };
    },
  );
