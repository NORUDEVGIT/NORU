import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFoStaySignals } from "../fo-exceptions.functions";
import {
  loadFrontOfficeArrivals,
  loadFrontOfficeDepartures,
  type FrontOfficeStay,
} from "../frontoffice.functions";
import { assertDateOnly, requireReservationManager } from "../reservations.server";
import {
  dailyControlTotals,
  mapArrivalRow,
  mapDepartureRow,
  parseLateCheckoutPolicy,
  type RoomInventoryState,
} from "./arrivals-departures";
import { resolvePropertyBusinessDate } from "./business-date";
import {
  FINANCIAL_SIGNAL_BATCH_CAP,
  type LateCheckoutPolicy,
  type ReservationArrivalsDeparturesSnapshot,
} from "./shared-read-models";

export {
  arrivalCheckInHint,
  arrivalExceptionKeys,
  dailyControlTotals,
  departureCheckOutHint,
  departureExceptionKeys,
  mapArrivalRow,
  mapDepartureRow,
  stayRoomReady,
} from "./arrivals-departures";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

function applyArrivalFilters(
  stays: FrontOfficeStay[],
  filters: { vip?: boolean },
): FrontOfficeStay[] {
  if (filters.vip === true) return stays.filter((stay) => stay.guestVip);
  return stays;
}

function applyDepartureFilters(
  stays: FrontOfficeStay[],
  filters: {
    overstay?: boolean;
    roomTypeId?: string;
    status?: "confirmed" | "checked_in";
  },
): FrontOfficeStay[] {
  return stays.filter((stay) => {
    if (filters.overstay === true && !stay.overstay) return false;
    if (filters.roomTypeId && stay.roomTypeId !== filters.roomTypeId) return false;
    if (filters.status && stay.status !== filters.status) return false;
    return true;
  });
}

async function loadRoomInventory(
  supabase: WorkspaceClient,
  restaurantId: string,
  stays: FrontOfficeStay[],
): Promise<Map<string, RoomInventoryState>> {
  const ids = [...new Set(stays.map((stay) => stay.roomId).filter((id): id is string => !!id))];
  const byId = new Map<string, RoomInventoryState>();
  if (ids.length === 0) return byId;

  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("id, status, housekeeping_status")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Array<{
    id: string;
    status: string | null;
    housekeeping_status: string | null;
  }>) {
    byId.set(row.id, {
      operationalStatus: row.status,
      housekeepingStatus: row.housekeeping_status,
    });
  }
  return byId;
}

export const getReservationArrivalsDepartures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        date: dateSchema.optional(),
        vip: z.boolean().optional(),
        assignment: z.enum(["assigned", "unassigned"]).optional(),
        roomTypeId: idSchema.optional(),
        arrivalStatus: z.enum(["pending", "confirmed"]).optional(),
        overstay: z.boolean().optional(),
        departureStatus: z.enum(["confirmed", "checked_in"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationArrivalsDeparturesSnapshot> => {
    await requireReservationManager(context as never, data.restaurantId);
    const generatedAt = new Date().toISOString();
    const supabase: WorkspaceClient = context.supabase;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: property, error: propertyError } = await supabaseAdmin
      .from("restaurants")
      .select(
        "business_date, timezone, check_out_time, late_checkout_allowed, late_checkout_fee, late_checkout_needs_approval",
      )
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    if (!property) throw new Error("Property not found.");

    const businessDate = resolvePropertyBusinessDate(property.business_date, property.timezone);
    const selectedDate = data.date ? assertDateOnly(data.date, "Operational date") : businessDate;
    const policy: LateCheckoutPolicy = parseLateCheckoutPolicy(property);

    const [arrivalStays, departureStays] = await Promise.all([
      loadFrontOfficeArrivals(supabase, {
        restaurantId: data.restaurantId,
        date: selectedDate,
        status: data.arrivalStatus,
        roomTypeId: data.roomTypeId,
        assignment: data.assignment,
      }),
      loadFrontOfficeDepartures(supabase, {
        restaurantId: data.restaurantId,
        date: selectedDate,
      }),
    ]);

    const arrivalsFiltered = applyArrivalFilters(arrivalStays, { vip: data.vip });
    const departuresFiltered = applyDepartureFilters(departureStays, {
      overstay: data.overstay,
      roomTypeId: data.roomTypeId,
      status: data.departureStatus,
    });

    const financialIds = [
      ...new Set([...arrivalsFiltered, ...departuresFiltered].map((stay) => stay.id)),
    ];
    const truncated = financialIds.length > FINANCIAL_SIGNAL_BATCH_CAP;
    const batchedIds = financialIds.slice(0, FINANCIAL_SIGNAL_BATCH_CAP);

    const [rooms, signals] = await Promise.all([
      loadRoomInventory(supabase, data.restaurantId, [...arrivalsFiltered, ...departuresFiltered]),
      loadFoStaySignals({
        context: context as never,
        restaurantId: data.restaurantId,
        reservationIds: batchedIds,
      }),
    ]);

    const arrivals = arrivalsFiltered.map((stay) =>
      mapArrivalRow({
        stay,
        room: stay.roomId ? rooms.get(stay.roomId) : undefined,
        folioLane: signals.folioLane,
        signal: signals.byStay[stay.id],
      }),
    );
    const departures = departuresFiltered.map((stay) =>
      mapDepartureRow({
        stay,
        room: stay.roomId ? rooms.get(stay.roomId) : undefined,
        folioLane: signals.folioLane,
        signal: signals.byStay[stay.id],
        policy,
      }),
    );

    return {
      restaurantId: data.restaurantId,
      businessDate,
      selectedDate,
      generatedAt,
      arrivals,
      departures,
      totals: dailyControlTotals(arrivals, departures),
      pagination: {
        page: 1,
        hasMore: false,
        reason: "daily_operational_queues",
      },
      financial: {
        batchCap: FINANCIAL_SIGNAL_BATCH_CAP,
        truncated,
      },
      deferred: {
        checkedInOutToday: true,
      },
    };
  });
