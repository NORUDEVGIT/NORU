import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDateOnly, requireReservationManager } from "@/packages/pms/lib/reservations.server";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export interface FrontOfficeDashboard {
  today: string;
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  availableRooms: number;
  occupiedRooms: number;
  outOfOrder: number;
  outOfService: number;
}

/**
 * Hotel snapshot shared with Property Home and Back Office reports.
 * Lives outside the PMS package so Back Office does not import PMS UI or
 * the Front Office function module.
 */
export const getFrontOfficeDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, today: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FrontOfficeDashboard> => {
    await requireReservationManager(context as never, data.restaurantId);
    const today = assertDateOnly(data.today, "Business date");

    const reservations = () =>
      context.supabase
        .from("hotel_reservations")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", data.restaurantId);

    const rooms = (status: string) =>
      context.supabase
        .from("hotel_rooms")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", data.restaurantId)
        .eq("active", true)
        .eq("status", status);

    const [arrivals, departures, inHouse, available, ooo, oos] = await Promise.all([
      reservations().in("status", ["pending", "confirmed"]).eq("arrival_date", today),
      reservations().in("status", ["confirmed", "checked_in"]).eq("departure_date", today),
      reservations().eq("status", "checked_in"),
      rooms("available"),
      rooms("out_of_order"),
      rooms("out_of_service"),
    ]);

    const { data: occupiedRows } = await context.supabase
      .from("hotel_reservations")
      .select("room_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "checked_in")
      .not("room_id", "is", null);
    const occupiedRooms = new Set((occupiedRows ?? []).map((r) => r.room_id)).size;

    const availableRooms = available.count ?? 0;
    return {
      today,
      arrivalsToday: arrivals.count ?? 0,
      departuresToday: departures.count ?? 0,
      inHouse: inHouse.count ?? 0,
      availableRooms: Math.max(0, availableRooms - occupiedRooms),
      occupiedRooms,
      outOfOrder: ooo.count ?? 0,
      outOfService: oos.count ?? 0,
    };
  });
