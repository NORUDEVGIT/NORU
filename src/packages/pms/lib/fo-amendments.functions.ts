/**
 * FO-FS4 — Amendment writes.
 *
 * Persist then audit. Upgrade changes room type through
 * amend_hotel_reservation, then assigns a room of the new type. Same-type
 * room move is not used. Service charges reuse post_folio_transaction type
 * `charge` / category `manual` after opening a folio — same honesty as FO-FS3.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  recordReservationEvent,
  requireReservationManager,
  reservationError,
} from "./reservations.server";
import { cashierError, requireCashierOperator } from "./cashiering.server";
import { parseSnapshot } from "./rates.server";
import { nightsBetween } from "./reservation-dates";
import type { FrontOfficeStay } from "./frontoffice.functions";
import {
  GUEST_REQUESTS_UNAVAILABLE,
  SPECIAL_REQUEST_CATEGORIES,
  occupancyBlockMessage,
  guestRequestPersistError,
  isReasonComplete,
  serviceLineTotal,
  servicePostsToFolio,
  specialRequestCategoryError,
  targetRoomRequired,
  upgradeRoomBlocked,
  type GuestRequestStatus,
  type SpecialRequestCategory,
} from "./fo-amendments";
import { mapCashierShiftError } from "./fo-cancel-noshow";

const idSchema = z.string().uuid();

export type AmendRoomType = {
  id: string;
  name: string;
  maxOccupancy: number;
  available: number;
};

export type AmendRoomState = {
  id: string;
  roomNumber: string;
  status: string;
  housekeepingStatus: string | null;
  restrictionReason: string | null;
};

export type FoGuestRequestRow = {
  id: string;
  reservationId: string;
  requestText: string;
  status: GuestRequestStatus;
  createdAt: string;
  updatedAt: string;
  actorName: string | null;
};

export type AmendContext = {
  stay: FrontOfficeStay;
  currency: string;
  roomSubtotal: number | null;
  nightlyRates: { date: string; rate: number }[];
  rateAvailable: boolean;
  currentRoom: AmendRoomState | null;
  roomTypes: AmendRoomType[];
  maxOccupancy: number;
  specialRequestCategory: SpecialRequestCategory | null;
  guestRequests: FoGuestRequestRow[];
  guestRequestsError: string | null;
  actorName: string;
};

function joinName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

async function actorDisplayName(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  membershipId: string,
  restaurantId: string,
): Promise<string> {
  const { data: member } = await supabaseAdmin
    .from("restaurant_users")
    .select("user_id")
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!member) return "Staff member";
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", member.user_id)
    .maybeSingle();
  const name = joinName(profile?.first_name ?? "", profile?.last_name ?? null);
  return name || profile?.email || "Staff member";
}

async function loadStayRow(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
) {
  const { data: row, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, adults, children, status, special_requests, notes, rate_plan_id, room_subtotal, nightly_rate_snapshot, currency, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ), room_types!hotel_reservations_type_same_property ( name, max_occupancy ), hotel_rooms!hotel_reservations_room_same_type ( room_number )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Reservation not found for this property.");
  return row;
}

function toStay(
  row: {
    id: string;
    confirmation_number: string;
    guest_id: string;
    room_type_id: string;
    room_id: string | null;
    arrival_date: string;
    departure_date: string;
    adults: number;
    children: number;
    status: string;
    special_requests: string | null;
    guest_profiles: {
      first_name: string;
      last_name: string | null;
      phone: string | null;
      vip_status: boolean;
    } | null;
    room_types: { name: string; max_occupancy?: number } | null;
    hotel_rooms: { room_number: string } | null;
  },
): FrontOfficeStay {
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName: joinName(row.guest_profiles?.first_name ?? "", row.guest_profiles?.last_name ?? null) || "Guest",
    guestVip: row.guest_profiles?.vip_status ?? false,
    guestPhone: row.guest_profiles?.phone ?? null,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    roomId: row.room_id,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    adults: row.adults,
    children: row.children,
    status: row.status as FrontOfficeStay["status"],
    specialRequests: row.special_requests,
    overstay: false,
  };
}

async function loadCurrentRoom(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  roomId: string | null,
): Promise<AmendRoomState | null> {
  if (!roomId) return null;
  const { data } = await supabaseAdmin
    .from("hotel_rooms")
    .select("id, room_number, status, housekeeping_status, restriction_reason")
    .eq("restaurant_id", restaurantId)
    .eq("id", roomId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    roomNumber: data.room_number,
    status: data.status,
    housekeepingStatus: data.housekeeping_status ?? null,
    restrictionReason: data.restriction_reason ?? null,
  };
}

async function loadGuestRequests(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<{ rows: FoGuestRequestRow[]; error: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("fo_guest_requests")
    .select("id, reservation_id, request_text, status, created_at, updated_at, actor_membership_id")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: false });
  if (error) {
    return { rows: [], error: guestRequestPersistError(error).message };
  }
  const rows = (data ?? []) as Array<{
    id: string;
    reservation_id: string;
    request_text: string;
    status: string;
    created_at: string;
    updated_at: string;
    actor_membership_id: string | null;
  }>;
  const actorIds = [...new Set(rows.map((r) => r.actor_membership_id).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  await Promise.all(
    actorIds.map(async (id) => {
      names.set(id, await actorDisplayName(supabaseAdmin, id, restaurantId));
    }),
  );
  return {
    rows: rows.map((r) => ({
      id: r.id,
      reservationId: r.reservation_id,
      requestText: r.request_text,
      status: r.status as GuestRequestStatus,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      actorName: r.actor_membership_id ? (names.get(r.actor_membership_id) ?? null) : null,
    })),
    error: null,
  };
}

async function loadSpecialRequestCategory(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<SpecialRequestCategory | null> {
  const { data, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select("special_request_category")
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) return null;
  const value = (data as { special_request_category?: string | null } | null)?.special_request_category;
  return SPECIAL_REQUEST_CATEGORIES.includes(value as SpecialRequestCategory)
    ? (value as SpecialRequestCategory)
    : null;
}

export const getAmendContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AmendContext> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadStayRow(supabaseAdmin, data.restaurantId, data.reservationId);
    const stay = toStay(row as never);
    const roomSubtotal =
      row.room_subtotal === null || row.room_subtotal === undefined ? null : Number(row.room_subtotal);
    const nightlyRates = parseSnapshot(row.nightly_rate_snapshot);

    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("currency_code")
      .eq("id", data.restaurantId)
      .maybeSingle();

    const { data: types } = await supabaseAdmin
      .from("room_types")
      .select("id, name, max_occupancy")
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .eq("sellable", true)
      .order("name");

    const roomTypes: AmendRoomType[] = [];
    for (const type of types ?? []) {
      const { data: total } = await supabaseAdmin.rpc("count_sellable_rooms", {
        _restaurant_id: data.restaurantId,
        _room_type_id: type.id,
      });
      const { data: reserved } = await supabaseAdmin.rpc("count_reserved_rooms", {
        _restaurant_id: data.restaurantId,
        _room_type_id: type.id,
        _arrival: stay.arrivalDate,
        _departure: stay.departureDate,
        _exclude_reservation_id: stay.id,
      });
      roomTypes.push({
        id: type.id,
        name: type.name,
        maxOccupancy: type.max_occupancy,
        available: Math.max(0, Number(total ?? 0) - Number(reserved ?? 0)),
      });
    }

    const [currentRoom, guestRequests, specialRequestCategory, actorName] = await Promise.all([
      loadCurrentRoom(supabaseAdmin, data.restaurantId, stay.roomId),
      loadGuestRequests(supabaseAdmin, data.restaurantId, stay.id),
      loadSpecialRequestCategory(supabaseAdmin, data.restaurantId, stay.id),
      actorDisplayName(supabaseAdmin, me.id, data.restaurantId),
    ]);

    const currentType = roomTypes.find((t) => t.id === stay.roomTypeId);

    return {
      stay,
      currency: (restaurant as { currency_code?: string } | null)?.currency_code || row.currency || "GBP",
      roomSubtotal,
      nightlyRates,
      rateAvailable: (roomSubtotal != null && roomSubtotal > 0) || nightlyRates.some((n) => n.rate > 0),
      currentRoom,
      roomTypes,
      maxOccupancy: currentType?.maxOccupancy ?? (row.room_types as { max_occupancy?: number } | null)?.max_occupancy ?? 0,
      specialRequestCategory,
      guestRequests: guestRequests.rows,
      guestRequestsError: guestRequests.error,
      actorName,
    };
  });

async function persistStayFields(params: {
  restaurantId: string;
  reservationId: string;
  membershipId: string;
  roomTypeId: string;
  roomId: string | null;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  specialRequests: string | null;
  notes: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("amend_hotel_reservation", {
    _restaurant_id: params.restaurantId,
    _reservation_id: params.reservationId,
    _room_type_id: params.roomTypeId,
    _room_id: params.roomId as unknown as string,
    _arrival: params.arrival,
    _departure: params.departure,
    _adults: params.adults,
    _children: params.children,
    _special_requests: params.specialRequests as unknown as string,
    _notes: params.notes as unknown as string,
    _membership_id: params.membershipId,
  });
  if (error) throw reservationError(error.message);
}

export const upgradeReservationType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        roomTypeId: idSchema,
        roomId: idSchema.nullable().optional(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadStayRow(supabaseAdmin, data.restaurantId, data.reservationId);
    const stay = toStay(row as never);
    if (stay.status === "cancelled" || stay.status === "checked_out" || stay.status === "no_show") {
      throw new Error("This stay can no longer be upgraded or downgraded.");
    }
    if (data.roomTypeId === stay.roomTypeId) {
      throw new Error("Pick a different room type.");
    }
    if (!isReasonComplete(data.reason)) {
      throw new Error("Enter a reason of at least 3 characters.");
    }

    const roomRequired = targetRoomRequired({ status: stay.status, roomId: stay.roomId });
    const roomId = data.roomId ?? null;
    if (roomRequired && !roomId) {
      throw new Error("Assign a room of the new type.");
    }

    if (roomId) {
      const { data: target } = await supabaseAdmin
        .from("hotel_rooms")
        .select("id, room_number, status, housekeeping_status, restriction_reason, room_type_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", roomId)
        .maybeSingle();
      if (!target || target.room_type_id !== data.roomTypeId) {
        throw new Error("That room is not of the selected type.");
      }
      const blocked = upgradeRoomBlocked({
        status: target.status,
        housekeepingStatus: target.housekeeping_status,
      });
      if (blocked.blocked) throw new Error(blocked.reason ?? "That room is not available.");
    }

    const previous = {
      room_type_id: stay.roomTypeId,
      room_type_name: stay.roomTypeName,
      room_id: stay.roomId,
      room_number: stay.roomNumber,
      room_subtotal: row.room_subtotal === null || row.room_subtotal === undefined ? null : Number(row.room_subtotal),
    };

    // Persist the new type first. Same-type room move is not used.
    // After the type is the NEW type, a pending/confirmed room uses the same
    // assignReservationRoom / listAssignableRooms honesty (available, same-type
    // of the new type). Checked-in stays persist type + room together because
    // assignReservationRoom is pre-check-in only.
    await persistStayFields({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      membershipId: me.id,
      roomTypeId: data.roomTypeId,
      roomId: roomId,
      arrival: stay.arrivalDate,
      departure: stay.departureDate,
      adults: stay.adults,
      children: stay.children,
      specialRequests: stay.specialRequests,
      notes: (row as { notes?: string | null }).notes ?? null,
    });

    if (roomId && (stay.status === "pending" || stay.status === "confirmed") && stay.roomId !== roomId) {
      const { error: assignError } = await supabaseAdmin.rpc("amend_hotel_reservation", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _room_type_id: data.roomTypeId,
        _room_id: roomId as unknown as string,
        _arrival: stay.arrivalDate,
        _departure: stay.departureDate,
        _adults: stay.adults,
        _children: stay.children,
        _special_requests: stay.specialRequests as unknown as string,
        _notes: ((row as { notes?: string | null }).notes ?? null) as unknown as string,
        _membership_id: me.id,
      });
      if (assignError) throw reservationError(assignError.message);
    }

    const after = await loadStayRow(supabaseAdmin, data.restaurantId, data.reservationId);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      previousValues: previous,
      newValues: {
        room_type_id: after.room_type_id,
        room_type_name: (after.room_types as { name?: string } | null)?.name ?? null,
        room_id: after.room_id,
        room_number: (after.hotel_rooms as { room_number?: string } | null)?.room_number ?? null,
        room_subtotal:
          after.room_subtotal === null || after.room_subtotal === undefined ? null : Number(after.room_subtotal),
      },
      notes: data.reason,
      actorMembershipId: me.id,
    });
    return { id: data.reservationId };
  });

export const amendStayGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        adults: z.number().int().min(1).max(20),
        children: z.number().int().min(0).max(20),
        guestId: idSchema.optional(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadStayRow(supabaseAdmin, data.restaurantId, data.reservationId);
    const stay = toStay(row as never);
    const { data: roomType } = await supabaseAdmin
      .from("room_types")
      .select("max_occupancy")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", stay.roomTypeId)
      .maybeSingle();
    const maxOccupancy = roomType?.max_occupancy ?? 0;
    const blocked = occupancyBlockMessage(data.adults, data.children, maxOccupancy);
    if (blocked) throw new Error(blocked);

    const previous = {
      adults: stay.adults,
      children: stay.children,
      guest_id: stay.guestId,
      guest_name: stay.guestName,
    };

    await persistStayFields({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      membershipId: me.id,
      roomTypeId: stay.roomTypeId,
      roomId: stay.roomId,
      arrival: stay.arrivalDate,
      departure: stay.departureDate,
      adults: data.adults,
      children: data.children,
      specialRequests: stay.specialRequests,
      notes: (row as { notes?: string | null }).notes ?? null,
    });

    if (data.guestId && data.guestId !== stay.guestId) {
      const { error } = await supabaseAdmin
        .from("hotel_reservations")
        .update({ guest_id: data.guestId })
        .eq("id", data.reservationId)
        .eq("restaurant_id", data.restaurantId);
      if (error) throw new Error(error.message);
    }

    const after = await loadStayRow(supabaseAdmin, data.restaurantId, data.reservationId);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      previousValues: previous,
      newValues: {
        adults: after.adults,
        children: after.children,
        guest_id: after.guest_id,
        guest_name: joinName(
          (after.guest_profiles as { first_name?: string } | null)?.first_name ?? "",
          (after.guest_profiles as { last_name?: string | null } | null)?.last_name ?? null,
        ),
      },
      notes: data.reason,
      actorMembershipId: me.id,
    });
    return { id: data.reservationId };
  });

export const addStayService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        name: z.string().trim().min(1).max(200),
        amount: z.number().finite().min(0),
        quantity: z.number().int().min(1).max(99).optional(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; posted: boolean }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const quantity = data.quantity ?? 1;
    const unit = data.amount;
    const lineTotal = serviceLineTotal(unit, quantity);
    const description = quantity === 1 ? data.name : `${data.name} × ${quantity}`;

    let posted = false;
    let transactionId: string | null = null;
    if (servicePostsToFolio(lineTotal)) {
      const cashier = await requireCashierOperator(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const opened = await supabaseAdmin.rpc("open_folio_for_reservation", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _membership_id: cashier.id,
      });
      if (opened.error) throw cashierError(opened.error.message);
      const folioId = (opened.data as { id: string }).id;
      const postedTxn = await supabaseAdmin.rpc("post_folio_transaction", {
        _restaurant_id: data.restaurantId,
        _folio_id: folioId,
        _type: "charge",
        _category: "manual",
        _description: description,
        _amount: lineTotal,
        _reference_type: null as unknown as string,
        _reference_id: null as unknown as string,
        _membership_id: cashier.id,
      });
      if (postedTxn.error) {
        throw new Error(mapCashierShiftError(cashierError(postedTxn.error.message).message));
      }
      posted = true;
      transactionId = (postedTxn.data as { id: string }).id;
    }

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      previousValues: { service: null, amount: 0, posted: false },
      newValues: {
        service: data.name,
        amount: lineTotal,
        quantity,
        posted,
        transaction_id: transactionId,
      },
      notes: data.reason,
      actorMembershipId: me.id,
    });
    return { id: data.reservationId, posted };
  });

export const addSpecialRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        category: z.enum(SPECIAL_REQUEST_CATEGORIES),
        text: z.string().trim().min(3).max(2000),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await loadStayRow(supabaseAdmin, data.restaurantId, data.reservationId);
    const stay = toStay(row as never);

    await persistStayFields({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      membershipId: me.id,
      roomTypeId: stay.roomTypeId,
      roomId: stay.roomId,
      arrival: stay.arrivalDate,
      departure: stay.departureDate,
      adults: stay.adults,
      children: stay.children,
      specialRequests: data.text,
      notes: (row as { notes?: string | null }).notes ?? null,
    });

    const { error: categoryError } = await supabaseAdmin
      .from("hotel_reservations")
      .update({ special_request_category: data.category } as never)
      .eq("id", data.reservationId)
      .eq("restaurant_id", data.restaurantId);
    if (categoryError) throw specialRequestCategoryError(categoryError);

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      previousValues: {
        special_requests: stay.specialRequests,
        special_request_category: null,
      },
      newValues: {
        special_requests: data.text,
        special_request_category: data.category,
      },
      notes: data.reason,
      actorMembershipId: me.id,
    });
    return { id: data.reservationId };
  });

export const createGuestRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        text: z.string().trim().min(3).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadStayRow(supabaseAdmin, data.restaurantId, data.reservationId);

    const { data: created, error } = await supabaseAdmin
      .from("fo_guest_requests")
      .insert({
        restaurant_id: data.restaurantId,
        reservation_id: data.reservationId,
        request_text: data.text,
        status: "open",
        actor_membership_id: me.id,
      })
      .select("id")
      .maybeSingle();
    if (error) throw guestRequestPersistError(error);
    if (!created) throw new Error(GUEST_REQUESTS_UNAVAILABLE);

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      previousValues: { guest_request: null },
      newValues: { guest_request: data.text, status: "open", guest_request_id: created.id },
      notes: data.text,
      actorMembershipId: me.id,
    });
    return { id: created.id };
  });

export const setGuestRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        requestId: idSchema,
        status: z.enum(["open", "done"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: GuestRequestStatus }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: readError } = await supabaseAdmin
      .from("fo_guest_requests")
      .select("id, reservation_id, request_text, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (readError) throw guestRequestPersistError(readError);
    if (!existing) throw new Error("Guest request not found for this property.");

    const { error } = await supabaseAdmin
      .from("fo_guest_requests")
      .update({ status: data.status })
      .eq("id", data.requestId)
      .eq("restaurant_id", data.restaurantId);
    if (error) throw guestRequestPersistError(error);

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: existing.reservation_id,
      eventType: "amended",
      previousValues: { guest_request_id: existing.id, status: existing.status },
      newValues: { guest_request_id: existing.id, status: data.status },
      notes: existing.request_text,
      actorMembershipId: me.id,
    });
    return { id: existing.id, status: data.status };
  });

export const listGuestRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FoGuestRequestRow[]> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadGuestRequests(supabaseAdmin, data.restaurantId, data.reservationId);
    if (loaded.error) throw new Error(loaded.error);
    return loaded.rows;
  });
