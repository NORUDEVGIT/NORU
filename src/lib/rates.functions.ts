import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  REVENUE_STATUSES,
  blankToNull,
  canManageRates,
  eachDate,
  parseSnapshot,
  rateError,
  requireRateManager,
  toQuote,
  type StayQuote,
} from "./rates.server";
import { callerMembership } from "./workforce.server";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/* ------------------------------------------------------------------- types */

export interface RateCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface RatePlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  roomTypeId: string;
  roomTypeName: string;
  currency: string;
  baseRate: number;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
}

export interface RateCalendarRow {
  date: string;
  baseRate: number;
  overrideRate: number | null;
  effectiveRate: number;
}

export interface RateRestrictionRow {
  date: string;
  minStay: number | null;
  maxStay: number | null;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  stopSell: boolean;
}

export interface RevenueOverview {
  from: string;
  to: string;
  currency: string;
  availableRoomNights: number;
  soldRoomNights: number;
  roomRevenue: number;
  occupancyPercent: number;
  adr: number;
  revPar: number;
  pricedShare: number;
}

export type { StayQuote } from "./rates.server";

/* ------------------------------------------------------------------ access */

export const getRatesAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const me = await callerMembership(context as never, data.restaurantId);
    return { role: me.role, canManage: canManageRates(me.role) };
  });

/* -------------------------------------------------------------- categories */

export const listRateCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<RateCategory[]> => {
    await requireRateManager(context as never, data.restaurantId);
    const { data: rows, error } = await context.supabase
      .from("hotel_rate_categories")
      .select("id, code, name, description, active")
      .eq("restaurant_id", data.restaurantId)
      .order("code");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      active: r.active,
    }));
  });

export const saveRateCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        categoryId: idSchema.optional(),
        code: z.string().min(1).max(20),
        name: z.string().min(1).max(80),
        description: z.string().max(500).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireRateManager(context as never, data.restaurantId);
    const payload = {
      restaurant_id: data.restaurantId,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      description: blankToNull(data.description),
      active: data.active ?? true,
    };

    if (data.categoryId) {
      const { error } = await context.supabase
        .from("hotel_rate_categories")
        .update(payload)
        .eq("id", data.categoryId)
        .eq("restaurant_id", data.restaurantId);
      if (error) throw rateError(error.message);
      return { id: data.categoryId };
    }

    const { data: created, error } = await context.supabase
      .from("hotel_rate_categories")
      .insert({ ...payload, created_by_membership_id: me.id })
      .select("id")
      .single();
    if (error) throw rateError(error.message);
    return { id: created.id };
  });

/* ------------------------------------------------------------------- plans */

const PLAN_SELECT = `
  id, code, name, description, rate_category_id, room_type_id, currency, base_rate,
  valid_from, valid_to, active,
  hotel_rate_categories!hotel_rate_plans_category_same_property ( name ),
  room_types!hotel_rate_plans_type_same_property ( name )
`;

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rate_category_id: string;
  room_type_id: string;
  currency: string;
  base_rate: number | string;
  valid_from: string | null;
  valid_to: string | null;
  active: boolean;
  hotel_rate_categories: { name: string } | null;
  room_types: { name: string } | null;
};

function toPlan(row: PlanRow): RatePlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    categoryId: row.rate_category_id,
    categoryName: row.hotel_rate_categories?.name ?? "Category",
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    currency: row.currency,
    baseRate: Number(row.base_rate),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    active: row.active,
  };
}

export const listRatePlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema.optional(),
        activeOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RatePlan[]> => {
    await requireRateManager(context as never, data.restaurantId);
    let query = context.supabase
      .from("hotel_rate_plans")
      .select(PLAN_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .order("code");
    if (data.roomTypeId) query = query.eq("room_type_id", data.roomTypeId);
    if (data.activeOnly) query = query.eq("active", true);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as PlanRow[]).map(toPlan);
  });

export const saveRatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        ratePlanId: idSchema.optional(),
        rateCategoryId: idSchema,
        roomTypeId: idSchema,
        code: z.string().min(1).max(30),
        name: z.string().min(1).max(120),
        description: z.string().max(1000).nullable().optional(),
        baseRate: z.number().min(0).max(10_000_000),
        validFrom: dateSchema.nullable().optional(),
        validTo: dateSchema.nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const me = await requireRateManager(context as never, data.restaurantId);

    // Category and room type must both belong to this property.
    const [{ data: category }, { data: roomType }, { data: restaurant }] = await Promise.all([
      context.supabase
        .from("hotel_rate_categories")
        .select("id")
        .eq("id", data.rateCategoryId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle(),
      context.supabase
        .from("room_types")
        .select("id")
        .eq("id", data.roomTypeId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle(),
      context.supabase.from("restaurants").select("currency_code").eq("id", data.restaurantId).maybeSingle(),
    ]);
    if (!category) throw new Error("That rate category doesn't belong to this property.");
    if (!roomType) throw new Error("That room type doesn't belong to this property.");

    const payload = {
      restaurant_id: data.restaurantId,
      rate_category_id: data.rateCategoryId,
      room_type_id: data.roomTypeId,
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      description: blankToNull(data.description),
      currency: restaurant?.currency_code ?? "USD",
      base_rate: data.baseRate,
      valid_from: data.validFrom ?? null,
      valid_to: data.validTo ?? null,
      active: data.active ?? true,
    };

    if (data.ratePlanId) {
      const { error } = await context.supabase
        .from("hotel_rate_plans")
        .update(payload)
        .eq("id", data.ratePlanId)
        .eq("restaurant_id", data.restaurantId);
      if (error) throw rateError(error.message);
      return { id: data.ratePlanId };
    }

    const { data: created, error } = await context.supabase
      .from("hotel_rate_plans")
      .insert({ ...payload, created_by_membership_id: me.id })
      .select("id")
      .single();
    if (error) throw rateError(error.message);
    return { id: created.id };
  });

export const setRatePlanActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, ratePlanId: idSchema, active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; active: boolean }> => {
    await requireRateManager(context as never, data.restaurantId);
    const { error } = await context.supabase
      .from("hotel_rate_plans")
      .update({ active: data.active })
      .eq("id", data.ratePlanId)
      .eq("restaurant_id", data.restaurantId);
    if (error) throw rateError(error.message);
    return { id: data.ratePlanId, active: data.active };
  });

/** A rate plan id that must belong to this property. */
async function assertPlan(context: { supabase: never }, restaurantId: string, ratePlanId: string) {
  const client = context.supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { base_rate: number | string } | null }> } };
      };
    };
  };
  const { data } = await client
    .from("hotel_rate_plans")
    .select("base_rate")
    .eq("id", ratePlanId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!data) throw new Error("That rate plan doesn't belong to this property.");
  return { baseRate: Number(data.base_rate) };
}

/* ---------------------------------------------------------------- calendar */

export const listRateCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, ratePlanId: idSchema, from: dateSchema, to: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RateCalendarRow[]> => {
    await requireRateManager(context as never, data.restaurantId);
    const plan = await assertPlan(context as never, data.restaurantId, data.ratePlanId);

    const { data: rows, error } = await context.supabase
      .from("hotel_rate_calendar")
      .select("rate_date, nightly_rate")
      .eq("restaurant_id", data.restaurantId)
      .eq("rate_plan_id", data.ratePlanId)
      .gte("rate_date", data.from)
      .lte("rate_date", data.to);
    if (error) throw new Error(error.message);

    const overrides = new Map<string, number>();
    for (const r of rows ?? []) overrides.set(r.rate_date, Number(r.nightly_rate));

    return eachDate(data.from, data.to).map((date) => {
      const override = overrides.get(date) ?? null;
      return {
        date,
        baseRate: plan.baseRate,
        overrideRate: override,
        effectiveRate: override ?? plan.baseRate,
      };
    });
  });

export const saveRateOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        ratePlanId: idSchema,
        date: dateSchema,
        nightlyRate: z.number().min(0).max(10_000_000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ date: string }> => {
    const me = await requireRateManager(context as never, data.restaurantId);
    await assertPlan(context as never, data.restaurantId, data.ratePlanId);

    if (data.nightlyRate === null) {
      const { error } = await context.supabase
        .from("hotel_rate_calendar")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("rate_plan_id", data.ratePlanId)
        .eq("rate_date", data.date);
      if (error) throw rateError(error.message);
      return { date: data.date };
    }

    const { error } = await context.supabase.from("hotel_rate_calendar").upsert(
      {
        restaurant_id: data.restaurantId,
        rate_plan_id: data.ratePlanId,
        rate_date: data.date,
        nightly_rate: data.nightlyRate,
        created_by_membership_id: me.id,
      },
      { onConflict: "rate_plan_id,rate_date" },
    );
    if (error) throw rateError(error.message);
    return { date: data.date };
  });

/* ------------------------------------------------------------ restrictions */

export const listRateRestrictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, ratePlanId: idSchema, from: dateSchema, to: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RateRestrictionRow[]> => {
    await requireRateManager(context as never, data.restaurantId);
    await assertPlan(context as never, data.restaurantId, data.ratePlanId);

    const { data: rows, error } = await context.supabase
      .from("hotel_rate_restrictions")
      .select("restriction_date, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell")
      .eq("restaurant_id", data.restaurantId)
      .eq("rate_plan_id", data.ratePlanId)
      .gte("restriction_date", data.from)
      .lte("restriction_date", data.to);
    if (error) throw new Error(error.message);

    const byDate = new Map<string, RateRestrictionRow>();
    for (const r of rows ?? []) {
      byDate.set(r.restriction_date, {
        date: r.restriction_date,
        minStay: r.min_stay,
        maxStay: r.max_stay,
        closedToArrival: r.closed_to_arrival,
        closedToDeparture: r.closed_to_departure,
        stopSell: r.stop_sell,
      });
    }

    return eachDate(data.from, data.to).map(
      (date) =>
        byDate.get(date) ?? {
          date,
          minStay: null,
          maxStay: null,
          closedToArrival: false,
          closedToDeparture: false,
          stopSell: false,
        },
    );
  });

export const saveRateRestriction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        ratePlanId: idSchema,
        date: dateSchema,
        minStay: z.number().int().min(1).max(365).nullable(),
        maxStay: z.number().int().min(1).max(365).nullable(),
        closedToArrival: z.boolean(),
        closedToDeparture: z.boolean(),
        stopSell: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ date: string }> => {
    const me = await requireRateManager(context as never, data.restaurantId);
    await assertPlan(context as never, data.restaurantId, data.ratePlanId);

    if (data.minStay !== null && data.maxStay !== null && data.maxStay < data.minStay) {
      throw new Error("Maximum stay must be at least the minimum stay.");
    }

    const empty =
      data.minStay === null &&
      data.maxStay === null &&
      !data.closedToArrival &&
      !data.closedToDeparture &&
      !data.stopSell;

    if (empty) {
      const { error } = await context.supabase
        .from("hotel_rate_restrictions")
        .delete()
        .eq("restaurant_id", data.restaurantId)
        .eq("rate_plan_id", data.ratePlanId)
        .eq("restriction_date", data.date);
      if (error) throw rateError(error.message);
      return { date: data.date };
    }

    const { error } = await context.supabase.from("hotel_rate_restrictions").upsert(
      {
        restaurant_id: data.restaurantId,
        rate_plan_id: data.ratePlanId,
        restriction_date: data.date,
        min_stay: data.minStay,
        max_stay: data.maxStay,
        closed_to_arrival: data.closedToArrival,
        closed_to_departure: data.closedToDeparture,
        stop_sell: data.stopSell,
        created_by_membership_id: me.id,
      },
      { onConflict: "rate_plan_id,restriction_date" },
    );
    if (error) throw rateError(error.message);
    return { date: data.date };
  });

/* ----------------------------------------------------------------- quoting */

export interface RatePlanQuote {
  plan: RatePlan;
  quote: StayQuote | null;
  /** Why this plan can't be sold for the requested stay, if it can't. */
  unavailableReason: string | null;
}

/** Authoritative server pricing for every plan of a room type across a stay. */
export const quoteStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        roomTypeId: idSchema,
        arrival: dateSchema,
        departure: dateSchema,
        ratePlanId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<RatePlanQuote[]> => {
    await requireRateManager(context as never, data.restaurantId);
    if (data.departure <= data.arrival) throw new Error("Departure must be after arrival.");

    let query = context.supabase
      .from("hotel_rate_plans")
      .select(PLAN_SELECT)
      .eq("restaurant_id", data.restaurantId)
      .eq("room_type_id", data.roomTypeId)
      .eq("active", true)
      .order("code");
    if (data.ratePlanId) query = query.eq("id", data.ratePlanId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const plans = ((rows ?? []) as unknown as PlanRow[]).map(toPlan);
    if (plans.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const out: RatePlanQuote[] = [];
    for (const plan of plans) {
      const { data: pricing, error: priceError } = await supabaseAdmin.rpc("price_hotel_stay", {
        _restaurant_id: data.restaurantId,
        _rate_plan_id: plan.id,
        _room_type_id: data.roomTypeId,
        _arrival: data.arrival,
        _departure: data.departure,
      });
      if (priceError) {
        out.push({ plan, quote: null, unavailableReason: rateError(priceError.message).message });
        continue;
      }
      out.push({ plan, quote: toQuote(pricing), unavailableReason: null });
    }
    return out;
  });

/* --------------------------------------------------------------- repricing */

export const repriceReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema, ratePlanId: idSchema }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; id: string; subtotal: number } | { ok: false; message: string }> => {
      const me = await requireRateManager(context as never, data.restaurantId);

      const { data: reservation } = await context.supabase
        .from("hotel_reservations")
        .select("id")
        .eq("id", data.reservationId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!reservation) return { ok: false, message: "Reservation not found for this property." };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: updated, error } = await supabaseAdmin.rpc("reprice_hotel_reservation", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _rate_plan_id: data.ratePlanId,
        _membership_id: me.id,
      });
      // Restriction / rate-plan rejections are expected outcomes, not server faults.
      if (error) return { ok: false, message: rateError(error.message).message };

      const row = updated as unknown as { id: string; room_subtotal: number | string };
      return { ok: true, id: row.id, subtotal: Number(row.room_subtotal ?? 0) };
    },
  );

/* ---------------------------------------------------------------- overview */

export const getRevenueOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, from: dateSchema, to: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<RevenueOverview> => {
    await requireRateManager(context as never, data.restaurantId);
    // An inverted range is normal mid-edit in the date pickers — normalize instead of failing.
    const from = data.to < data.from ? data.to : data.from;
    const to = data.to < data.from ? data.from : data.to;

    const dates = new Set(eachDate(from, to, 400));
    const days = dates.size;

    const { data: restaurant } = await context.supabase
      .from("restaurants")
      .select("currency_code")
      .eq("id", data.restaurantId)
      .maybeSingle();

    const { count: sellableRooms } = await context.supabase
      .from("hotel_rooms")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", data.restaurantId)
      .eq("active", true);

    // Departure is exclusive, so a stay counts only while it overlaps the range.
    const { data: rows, error } = await context.supabase
      .from("hotel_reservations")
      .select("arrival_date, departure_date, room_subtotal, nightly_rate_snapshot")
      .eq("restaurant_id", data.restaurantId)
      .in("status", REVENUE_STATUSES as unknown as string[])
      .lte("arrival_date", to)
      .gt("departure_date", from);
    if (error) throw new Error(error.message);

    let soldNights = 0;
    let revenue = 0;
    let pricedNights = 0;

    for (const row of rows ?? []) {
      const nightly = parseSnapshot(row.nightly_rate_snapshot);
      const stayNights = eachDate(row.arrival_date, row.departure_date, 400).filter(
        (d) => d < row.departure_date && dates.has(d),
      );
      soldNights += stayNights.length;
      if (nightly.length === 0) continue;
      for (const night of nightly) {
        if (!dates.has(night.date)) continue;
        revenue += night.rate;
        pricedNights += 1;
      }
    }

    const availableRoomNights = (sellableRooms ?? 0) * days;
    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      from,
      to,
      currency: restaurant?.currency_code ?? "USD",
      availableRoomNights,
      soldRoomNights: soldNights,
      roomRevenue: round2(revenue),
      occupancyPercent: availableRoomNights > 0 ? round2((soldNights / availableRoomNights) * 100) : 0,
      adr: soldNights > 0 ? round2(revenue / soldNights) : 0,
      revPar: availableRoomNights > 0 ? round2(revenue / availableRoomNights) : 0,
      pricedShare: soldNights > 0 ? round2((pricedNights / soldNights) * 100) : 0,
    };
  });
