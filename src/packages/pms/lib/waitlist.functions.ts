import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRoomTypeOccupancy } from "./create-reservation-phase1-section4";
import { quoteStay } from "./rates.functions";
import { createReservation } from "./reservations.functions";
import { assertStayDates, requireReservationManager } from "./reservations.server";
import { getRoomTypeAvailabilityCompat } from "./room-inventory-compat";
import {
  WAITLIST_DISPLAY_STATUSES,
  WAITLIST_REQUEST_STATUSES,
  defaultOfferExpiresAt,
  deriveWaitlistRequestStatus,
  effectiveOfferStatus,
  occupancyFits,
} from "./waitlist";
import type {
  WaitlistDetail,
  WaitlistHistoryEvent,
  WaitlistListRow,
  WaitlistMatchCandidate,
  WaitlistOfferRead,
  WaitlistOfferRow,
  WaitlistOfferSnapshot,
  WaitlistRequestRead,
  WaitlistRequestRow,
} from "./waitlist";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
type LooseResult = {
  data: unknown;
  error: { message?: string | null } | null;
  count?: number | null;
};
type LooseQuery = PromiseLike<LooseResult> & {
  select(columns: string, options?: { count?: "exact"; head?: boolean }): LooseQuery;
  eq(column: string, value: unknown): LooseQuery;
  in(column: string, values: unknown[]): LooseQuery;
  or(filters: string): LooseQuery;
  ilike(column: string, value: string): LooseQuery;
  gte(column: string, value: unknown): LooseQuery;
  lte(column: string, value: unknown): LooseQuery;
  order(column: string, options?: { ascending?: boolean }): LooseQuery;
  limit(value: number): LooseQuery;
  maybeSingle(): PromiseLike<LooseResult>;
  insert(values: Record<string, unknown>): LooseQuery;
  update(values: Record<string, unknown>): LooseQuery;
  delete(): LooseQuery;
};
type LooseDb = { from(table: string): LooseQuery };
function db(client: unknown): LooseDb {
  return client as LooseDb;
}

async function requireWaitlistWriter(context: never, restaurantId: string) {
  const membership = await requireReservationManager(context, restaurantId);
  if (membership.role !== "owner" && membership.role !== "manager") {
    throw new Error("You don't have permission to manage Waitlist.");
  }
  return membership;
}
const REQUEST_SELECT =
  "id, confirmation_number, guest_id, arrival_date, departure_date, adults, children, requested_room_type_id, alternate_room_type_ids, flexible_dates, priority, status, notes, reservation_id, created_at, updated_at";

function mapRequestBase(row: WaitlistRequestRow): Omit<WaitlistRequestRead, "guestName" | "requestedRoomTypeName" | "displayStatus"> {
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    adults: row.adults,
    children: row.children,
    requestedRoomTypeId: row.requested_room_type_id,
    alternateRoomTypeIds: row.alternate_room_type_ids ?? [],
    flexibleDates: row.flexible_dates,
    priority: row.priority,
    storedStatus: row.status,
    notes: row.notes,
    reservationId: row.reservation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function recordHistory(
client: unknown,
input: {
    restaurantId: string;
    requestId: string;
    eventType: string;
    actorId: string;
    previous?: Record<string, unknown> | null;
    next?: Record<string, unknown> | null;
    notes?: string | null;
  },
) {
  await db(client).from("pms_waitlist_history").insert({
    restaurant_id: input.restaurantId,
    waitlist_request_id: input.requestId,
    event_type: input.eventType,
    previous_values: input.previous ?? null,
    new_values: input.next ?? null,
    notes: input.notes ?? null,
    actor_membership_id: input.actorId,
  });
}

async function loadOffers(client: unknown, restaurantId: string, requestIds: string[]): Promise<WaitlistOfferRow[]> {
  if (requestIds.length === 0) return [];
  const loaded = await db(client)
    .from("pms_waitlist_offers")
    .select(
      "id, waitlist_request_id, arrival_date, departure_date, room_type_id, rate_plan_id, quoted_total, quoted_currency, expires_at, status, created_at",
    )
    .eq("restaurant_id", restaurantId)
    .in("waitlist_request_id", requestIds)
    .order("created_at", { ascending: false });
  if (loaded.error) throw new Error(loaded.error.message || "Could not load waitlist offers.");
  return (loaded.data ?? []) as WaitlistOfferRow[];
}

function offerSnapshots(offers: WaitlistOfferRow[]): WaitlistOfferSnapshot[] {
  return offers.map(asOfferSnapshot);
}

function asOfferSnapshot(offer: WaitlistOfferRow): WaitlistOfferSnapshot {
  return { status: offer.status, expiresAt: offer.expires_at };
}

async function persistDerivedRequestStatus(
client: unknown,
restaurantId: string,
request: WaitlistRequestRow,
offers: WaitlistOfferRow[],
) {
  const display = deriveWaitlistRequestStatus(request.status, offerSnapshots(offers), request.reservation_id);
  const stored = display === "expired" ? "offered" : display;
  if (stored !== request.status) {
    await db(client)
      .from("pms_waitlist_requests")
      .update({ status: stored })
      .eq("restaurant_id", restaurantId)
      .eq("id", request.id);
    request.status = stored;
  }
  return display;
}

async function cancelPendingOffers(
client: unknown,
restaurantId: string,
requestId: string,
exceptOfferId?: string,
) {
  const offers = await loadOffers(client, restaurantId, [requestId]);
  const pending = offers.filter((offer) => offer.status === "pending" && offer.id !== exceptOfferId);
  for (const offer of pending) {
    await db(client)
      .from("pms_waitlist_offers")
      .update({ status: "cancelled" })
      .eq("restaurant_id", restaurantId)
      .eq("id", offer.id);
  }
}

async function guestNames(client: unknown, restaurantId: string, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const loaded = await db(client)
    .from("guest_profiles")
    .select("id, first_name, last_name")
    .eq("restaurant_id", restaurantId)
    .in("id", unique);
  if (loaded.error) throw new Error(loaded.error.message || "Could not load guests.");
  return new Map(
    ((loaded.data ?? []) as Array<{ id: string; first_name: string; last_name: string | null }>).map((row) => [
row.id,
      [row.first_name, row.last_name].filter(Boolean).join(" "),
    ]),
  );
}

async function roomTypeNames(client: unknown, restaurantId: string): Promise<Map<string, string>> {
  const loaded = await db(client).from("room_types").select("id, name").eq("restaurant_id", restaurantId);
  if (loaded.error) throw new Error(loaded.error.message || "Could not load room types.");
  return new Map(((loaded.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]));
}
const requestWriteSchema = z.object({
  restaurantId: idSchema,
  guestId: idSchema,
  arrivalDate: dateSchema,
  departureDate: dateSchema,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  requestedRoomTypeId: idSchema.nullable().optional(),
  alternateRoomTypeIds: z.array(idSchema).max(12).optional(),
  flexibleDates: z.boolean().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const listWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        search: z.string().trim().max(120).optional(),
        status: z.enum(WAITLIST_DISPLAY_STATUSES).optional(),
        arrivalFrom: dateSchema.optional(),
        arrivalTo: dateSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    let query = db(context.supabase)
      .from("pms_waitlist_requests")
      .select(REQUEST_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .order("priority", { ascending: true })
      .limit(200);
    if (data.status && (WAITLIST_REQUEST_STATUSES as readonly string[]).includes(data.status)) {
      query = query.eq("status", data.status === "expired" ? "offered" : data.status);
    }
    if (data.arrivalFrom) query = query.gte("arrival_date", data.arrivalFrom);
    if (data.arrivalTo) query = query.lte("arrival_date", data.arrivalTo);
    if (data.search && data.search.length >= 2) {
      const term = `%${data.search.replaceAll("%", "")}%`;
      query = query.ilike("confirmation_number", term);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message || "Could not load waitlist.");
    const requests = (rows ?? []) as WaitlistRequestRow[];
    const offers = await loadOffers(
context.supabase,
data.restaurantId,
      requests.map((row) => row.id),
    );
    const names = await guestNames(
context.supabase,
data.restaurantId,
      requests.map((row) => row.guest_id),
    );
    const types = await roomTypeNames(context.supabase, data.restaurantId);
    const now = new Date().toISOString();
    const list: WaitlistListRow[] = requests.map((row) => {
      const rowOffers = offers.filter((offer) => offer.waitlist_request_id === row.id);
      const displayStatus = deriveWaitlistRequestStatus(
row.status,
        offerSnapshots(rowOffers),
row.reservation_id,
        now,
      );
      const live = rowOffers.find((offer) => effectiveOfferStatus(asOfferSnapshot(offer), now) === "pending");
      return {
        ...mapRequestBase(row),
        guestName: names.get(row.guest_id) ?? null,
        requestedRoomTypeName: row.requested_room_type_id ? types.get(row.requested_room_type_id) ?? null : null,
        displayStatus,
        liveOfferExpiresAt: live?.expires_at ?? null,
      };
    });
    const filtered =
data.status === "expired"
        ? list.filter((row) => row.displayStatus === "expired")
        : data.status
          ? list.filter((row) => row.displayStatus === data.status)
          : list;
    return { requests: filtered };
  });

export const getWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema, requestId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    await requireReservationManager(context as never, data.restaurantId);
    const loaded = await db(context.supabase)
      .from("pms_waitlist_requests")
      .select(REQUEST_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (loaded.error) throw new Error(loaded.error.message || "Could not load waitlist request.");
    if (!loaded.data) throw new Error("Waitlist request not found.");
    const row = loaded.data as WaitlistRequestRow;
    const [offers, historyResult, names, types] = await Promise.all([
      loadOffers(context.supabase, data.restaurantId, [row.id]),
      db(context.supabase)
        .from("pms_waitlist_history")
        .select("id, event_type, previous_values, new_values, notes, created_at, actor_membership_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("waitlist_request_id", row.id)
        .order("created_at", { ascending: false })
        .limit(50),
      guestNames(context.supabase, data.restaurantId, [row.guest_id]),
      roomTypeNames(context.supabase, data.restaurantId),
    ]);
    if (historyResult.error) throw new Error(historyResult.error.message || "Could not load waitlist history.");
    const now = new Date().toISOString();
    const request: WaitlistRequestRead = {
      ...mapRequestBase(row),
      guestName: names.get(row.guest_id) ?? null,
      requestedRoomTypeName: row.requested_room_type_id ? types.get(row.requested_room_type_id) ?? null : null,
      displayStatus: deriveWaitlistRequestStatus(row.status, offerSnapshots(offers), row.reservation_id, now),
    };
    const offerReads: WaitlistOfferRead[] = offers.map((offer) => ({
      id: offer.id,
      arrivalDate: offer.arrival_date,
      departureDate: offer.departure_date,
      roomTypeId: offer.room_type_id,
      roomTypeName: types.get(offer.room_type_id) ?? null,
      ratePlanId: offer.rate_plan_id,
      quotedTotal: offer.quoted_total == null ? null : Number(offer.quoted_total),
      quotedCurrency: offer.quoted_currency,
      expiresAt: offer.expires_at,
      storedStatus: offer.status,
      displayStatus: effectiveOfferStatus(asOfferSnapshot(offer), now),
      createdAt: offer.created_at,
    }));
    return {
      request,
      offers: offerReads,
      history: ((historyResult.data ?? []) as Array<{
        id: string;
        event_type: string;
        previous_values: unknown;
        new_values: unknown;
        notes: string | null;
        created_at: string;
        actor_membership_id: string | null;
      }>).map((event) => ({
        id: event.id,
        event_type: event.event_type,
        previous_values: event.previous_values == null ? null : JSON.stringify(event.previous_values),
        new_values: event.new_values == null ? null : JSON.stringify(event.new_values),
        notes: event.notes,
        created_at: event.created_at,
        actor_membership_id: event.actor_membership_id,
      })),
    };
  });

export const createWaitlistRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestWriteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireWaitlistWriter(context as never, data.restaurantId);
    assertStayDates(data.arrivalDate, data.departureDate);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const counted = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId);
    const confirmationNumber = `WL-${String((counted.count ?? 0) + 1).padStart(6, "0")}`;
    const inserted = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .insert({
        restaurant_id: data.restaurantId,
        confirmation_number: confirmationNumber,
        guest_id: data.guestId,
        arrival_date: data.arrivalDate,
        departure_date: data.departureDate,
        adults: data.adults,
        children: data.children,
        requested_room_type_id: data.requestedRoomTypeId ?? null,
        alternate_room_type_ids: data.alternateRoomTypeIds ?? [],
        flexible_dates: data.flexibleDates ?? false,
        priority: data.priority ?? 3,
        status: "open",
        notes: data.notes ?? null,
        created_by_membership_id: me.id,
      })
      .select(REQUEST_SELECT)
      .maybeSingle();
    if (inserted.error) throw new Error(inserted.error.message || "Could not create waitlist request.");
    const row = inserted.data as WaitlistRequestRow;
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      requestId: row.id,
      eventType: "request_created",
      actorId: me.id,
      next: { confirmationNumber, arrivalDate: row.arrival_date, departureDate: row.departure_date },
    });
    return mapRequestBase(row);
  });

export const amendWaitlistRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestWriteSchema.extend({ requestId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await requireWaitlistWriter(context as never, data.restaurantId);
    assertStayDates(data.arrivalDate, data.departureDate);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const current = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .select(REQUEST_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message || "Could not load waitlist request.");
    if (!current.data) throw new Error("Waitlist request not found.");
    const previous = current.data as WaitlistRequestRow;
    if (previous.status === "converted" || previous.reservation_id) {
      throw new Error("A converted waitlist request cannot be amended.");
    }
    if (previous.status === "cancelled") {
      throw new Error("Restore this waitlist request before amending it.");
    }
    await cancelPendingOffers(supabaseAdmin, data.restaurantId, data.requestId);
    const updated = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .update({
        guest_id: data.guestId,
        arrival_date: data.arrivalDate,
        departure_date: data.departureDate,
        adults: data.adults,
        children: data.children,
        requested_room_type_id: data.requestedRoomTypeId ?? null,
        alternate_room_type_ids: data.alternateRoomTypeIds ?? [],
        flexible_dates: data.flexibleDates ?? false,
        priority: data.priority ?? previous.priority,
        notes: data.notes ?? null,
        status: "open",
      })
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .select(REQUEST_SELECT)
      .maybeSingle();
    if (updated.error) throw new Error(updated.error.message || "Could not amend waitlist request.");
    const row = updated.data as WaitlistRequestRow;
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      requestId: row.id,
      eventType: "request_amended",
      actorId: me.id,
      previous: { arrivalDate: previous.arrival_date, departureDate: previous.departure_date, status: previous.status },
      next: { arrivalDate: row.arrival_date, departureDate: row.departure_date, status: row.status },
      notes: "Pending offers were invalidated.",
    });
    return mapRequestBase(row);
  });

export const matchWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        requestId: idSchema,
        arrivalDate: dateSchema.optional(),
        departureDate: dateSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ candidates: WaitlistMatchCandidate[] }> => {
    await requireReservationManager(context as never, data.restaurantId);
    const loaded = await db(context.supabase)
      .from("pms_waitlist_requests")
      .select(REQUEST_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (loaded.error) throw new Error(loaded.error.message || "Could not load waitlist request.");
    if (!loaded.data) throw new Error("Waitlist request not found.");
    const request = loaded.data as WaitlistRequestRow;
    const arrival = data.arrivalDate ?? request.arrival_date;
    const departure = data.departureDate ?? request.departure_date;
    assertStayDates(arrival, departure);
    if (!request.flexible_dates && (arrival !== request.arrival_date || departure !== request.departure_date)) {
      throw new Error("This waitlist request is not marked flexible for other dates.");
    }
    const { data: types, error } = await context.supabase
      .from("room_types")
      .select("id, code, name, max_occupancy")
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true)
      .eq("sellable", true)
      .order("name");
    if (error) throw new Error(error.message);
    const alternates = new Set(request.alternate_room_type_ids ?? []);
    const candidates: WaitlistMatchCandidate[] = [];
    for (const type of types ?? []) {
      const availability = await getRoomTypeAvailabilityCompat(context.supabase, {
        restaurantId: data.restaurantId,
        roomTypeId: type.id,
        arrival,
        departure,
      });
      const fits = occupancyFits(request.adults, request.children, type.max_occupancy);
      const requested = request.requested_room_type_id === type.id;
      const alternate = alternates.has(type.id);
      if (!requested && !alternate && availability.available <= 0) continue;
      const quotesRaw = await quoteStay({
        data: {
          restaurantId: data.restaurantId,
          roomTypeId: type.id,
          arrival,
          departure,
        },
      });
      candidates.push({
        roomTypeId: type.id,
        code: type.code,
        name: type.name,
        available: availability.available,
        occupancyFits: fits,
        requested,
        alternate,
        quotes: quotesRaw.map((row) => ({
          ratePlanId: row.plan.id,
          code: row.plan.code,
          name: row.plan.name,
          subtotal: row.quote?.subtotal ?? 0,
          currency: row.quote?.currency ?? row.plan.currency,
          unavailableReason: row.unavailableReason,
        })),
      });
    }
    candidates.sort((left, right) => {
      if (left.requested !== right.requested) return left.requested ? -1 : 1;
      if (left.alternate !== right.alternate) return left.alternate ? -1 : 1;
      return right.available - left.available;
    });
    return { candidates };
  });

export const createWaitlistOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        requestId: idSchema,
        roomTypeId: idSchema,
        ratePlanId: idSchema.nullable().optional(),
        arrivalDate: dateSchema.optional(),
        departureDate: dateSchema.optional(),
        expiresAt: z.string().min(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireWaitlistWriter(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .select(REQUEST_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (loaded.error) throw new Error(loaded.error.message || "Could not load waitlist request.");
    if (!loaded.data) throw new Error("Waitlist request not found.");
    const request = loaded.data as WaitlistRequestRow;
    if (request.status === "converted" || request.reservation_id) {
      throw new Error("This waitlist request is already converted.");
    }
    if (request.status === "cancelled") throw new Error("This waitlist request is cancelled.");
    const arrival = data.arrivalDate ?? request.arrival_date;
    const departure = data.departureDate ?? request.departure_date;
    assertStayDates(arrival, departure);
    if (!request.flexible_dates && (arrival !== request.arrival_date || departure !== request.departure_date)) {
      throw new Error("This waitlist request is not marked flexible for other dates.");
    }
    const { data: roomType, error: typeError } = await context.supabase
      .from("room_types")
      .select("max_occupancy")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.roomTypeId)
      .maybeSingle();
    if (typeError) throw new Error(typeError.message);
    if (!roomType) throw new Error("Room type not found for this property.");
    assertRoomTypeOccupancy(request.adults, request.children, roomType.max_occupancy);
    const availability = await getRoomTypeAvailabilityCompat(context.supabase, {
      restaurantId: data.restaurantId,
      roomTypeId: data.roomTypeId,
      arrival,
      departure,
    });
    if (availability.available <= 0) {
      throw new Error("That room type is not available for the offered stay.");
    }
    const quotes = await quoteStay({
      data: {
        restaurantId: data.restaurantId,
        roomTypeId: data.roomTypeId,
        arrival,
        departure,
        ratePlanId: data.ratePlanId ?? undefined,
      },
    });
    const selected = quotes.find((row) => !row.unavailableReason && row.quote) ?? quotes[0] ?? null;
    await cancelPendingOffers(supabaseAdmin, data.restaurantId, data.requestId);
    const inserted = await db(supabaseAdmin)
      .from("pms_waitlist_offers")
      .insert({
        restaurant_id: data.restaurantId,
        waitlist_request_id: data.requestId,
        arrival_date: arrival,
        departure_date: departure,
        room_type_id: data.roomTypeId,
        rate_plan_id: selected?.plan.id ?? data.ratePlanId ?? null,
        quoted_total: selected?.quote?.subtotal ?? null,
        quoted_currency: selected?.quote?.currency ?? null,
        expires_at: data.expiresAt ?? defaultOfferExpiresAt(),
        status: "pending",
        created_by_membership_id: me.id,
      })
      .select(
        "id, waitlist_request_id, arrival_date, departure_date, room_type_id, rate_plan_id, quoted_total, quoted_currency, expires_at, status, created_at",
      )
      .maybeSingle();
    if (inserted.error) throw new Error(inserted.error.message || "Could not create waitlist offer.");
    await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .update({ status: "offered" })
      .eq("id", data.requestId)
      .eq("restaurant_id", data.restaurantId);
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      requestId: data.requestId,
      eventType: "offer_created",
      actorId: me.id,
      next: {
        offerId: (inserted.data as WaitlistOfferRow).id,
        roomTypeId: data.roomTypeId,
        expiresAt: (inserted.data as WaitlistOfferRow).expires_at,
      },
    });
    return inserted.data as WaitlistOfferRow;
  });

export const respondWaitlistOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        requestId: idSchema,
        offerId: idSchema,
        response: z.enum(["accepted", "declined"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireWaitlistWriter(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await db(supabaseAdmin)
      .from("pms_waitlist_offers")
      .select(
        "id, waitlist_request_id, arrival_date, departure_date, room_type_id, rate_plan_id, quoted_total, quoted_currency, expires_at, status, created_at",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.offerId)
      .eq("waitlist_request_id", data.requestId)
      .maybeSingle();
    if (loaded.error) throw new Error(loaded.error.message || "Could not load waitlist offer.");
    if (!loaded.data) throw new Error("Waitlist offer not found.");
    const offer = loaded.data as WaitlistOfferRow;
    if (effectiveOfferStatus(asOfferSnapshot(offer)) === "expired") {
      throw new Error("This offer has expired.");
    }
    if (offer.status !== "pending") throw new Error("This offer is no longer awaiting a response.");
    if (data.response === "accepted") {
      await cancelPendingOffers(supabaseAdmin, data.restaurantId, data.requestId, offer.id);
    }
    const updated = await db(supabaseAdmin)
      .from("pms_waitlist_offers")
      .update({ status: data.response })
      .eq("id", offer.id)
      .eq("restaurant_id", data.restaurantId);
    if (updated.error) throw new Error(updated.error.message || "Could not record the offer response.");
    await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .update({ status: data.response === "accepted" ? "accepted" : "open" })
      .eq("id", data.requestId)
      .eq("restaurant_id", data.restaurantId);
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      requestId: data.requestId,
      eventType: data.response === "accepted" ? "offer_accepted" : "offer_declined",
      actorId: me.id,
      next: { offerId: offer.id, response: data.response },
    });
    return { offerId: offer.id, response: data.response };
  });

export const convertWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, requestId: idSchema, offerId: idSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireWaitlistWriter(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .select(REQUEST_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (loaded.error) throw new Error(loaded.error.message || "Could not load waitlist request.");
    if (!loaded.data) throw new Error("Waitlist request not found.");
    const request = loaded.data as WaitlistRequestRow;
    if (request.reservation_id) return { reservationId: request.reservation_id };
    if (request.status === "cancelled") throw new Error("A cancelled waitlist request cannot be converted.");
    const offers = await loadOffers(supabaseAdmin, data.restaurantId, [request.id]);
    const now = new Date().toISOString();
    const accepted =
      offers.find((offer) => offer.id === data.offerId && effectiveOfferStatus(asOfferSnapshot(offer), now) === "accepted") ??
      offers.find((offer) => effectiveOfferStatus(asOfferSnapshot(offer), now) === "accepted");
    if (!accepted) throw new Error("Accept an offer before converting waitlist to a reservation.");
    const created = await createReservation({
      data: {
        restaurantId: data.restaurantId,
        guestId: request.guest_id,
        roomTypeId: accepted.room_type_id,
        roomId: null,
        arrival: accepted.arrival_date,
        departure: accepted.departure_date,
        adults: request.adults,
        children: request.children,
        notes: request.notes,
        ratePlanId: accepted.rate_plan_id,
        status: "pending",
      },
    });
    const linked = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .update({ reservation_id: created.id, status: "converted" })
      .eq("id", request.id)
      .eq("restaurant_id", data.restaurantId);
    if (linked.error) throw new Error(linked.error.message || "Reservation created but waitlist link failed.");
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      requestId: request.id,
      eventType: "converted",
      actorId: me.id,
      next: { reservationId: created.id, confirmationNumber: created.confirmationNumber, offerId: accepted.id },
    });
    return { reservationId: created.id, confirmationNumber: created.confirmationNumber };
  });

export const cancelWaitlistRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        requestId: idSchema,
        notes: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireWaitlistWriter(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .select(REQUEST_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (loaded.error) throw new Error(loaded.error.message || "Could not load waitlist request.");
    if (!loaded.data) throw new Error("Waitlist request not found.");
    const request = loaded.data as WaitlistRequestRow;
    if (request.status === "converted" || request.reservation_id) {
      throw new Error("A converted waitlist request cannot be cancelled.");
    }
    await cancelPendingOffers(supabaseAdmin, data.restaurantId, data.requestId);
    const updated = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .update({ status: "cancelled" })
      .eq("id", data.requestId)
      .eq("restaurant_id", data.restaurantId);
    if (updated.error) throw new Error(updated.error.message || "Could not cancel waitlist request.");
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      requestId: data.requestId,
      eventType: "request_cancelled",
      actorId: me.id,
      previous: { status: request.status },
      next: { status: "cancelled" },
      notes: data.notes ?? null,
    });
    return { requestId: data.requestId, status: "cancelled" as const };
  });

export const expireWaitlistOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, requestId: idSchema, offerId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireWaitlistWriter(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await db(supabaseAdmin)
      .from("pms_waitlist_offers")
      .select(
        "id, waitlist_request_id, arrival_date, departure_date, room_type_id, rate_plan_id, quoted_total, quoted_currency, expires_at, status, created_at",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.offerId)
      .eq("waitlist_request_id", data.requestId)
      .maybeSingle();
    if (loaded.error) throw new Error(loaded.error.message || "Could not load waitlist offer.");
    if (!loaded.data) throw new Error("Waitlist offer not found.");
    const offer = loaded.data as WaitlistOfferRow;
    if (offer.status !== "pending") return { offerId: offer.id, displayStatus: effectiveOfferStatus(asOfferSnapshot(offer)) };
    if (effectiveOfferStatus(asOfferSnapshot(offer)) !== "expired") {
      throw new Error("This offer has not reached its expiry time.");
    }
    await db(supabaseAdmin)
      .from("pms_waitlist_offers")
      .update({ status: "cancelled" })
      .eq("id", offer.id)
      .eq("restaurant_id", data.restaurantId);
    const remaining = await loadOffers(supabaseAdmin, data.restaurantId, [data.requestId]);
    const request = await db(supabaseAdmin)
      .from("pms_waitlist_requests")
      .select(REQUEST_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.requestId)
      .maybeSingle();
    if (request.data) {
      await persistDerivedRequestStatus(supabaseAdmin, data.restaurantId, request.data as WaitlistRequestRow, remaining);
    }
    await recordHistory(supabaseAdmin, {
      restaurantId: data.restaurantId,
      requestId: data.requestId,
      eventType: "offer_expired",
      actorId: me.id,
      next: { offerId: offer.id },
    });
    return { offerId: offer.id, displayStatus: "expired" as const };
  });
