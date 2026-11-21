import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { requirePmsActorAny } from "@/packages/pms/lib/pms-permissions.server";
import { assertDateOnly } from "@/packages/pms/lib/reservations.server";
import { isOpenDiscrepancyStatus } from "@/packages/pms/lib/fo-exceptions";
import {
  classifyFoDepartureAttention,
  type FoDepartureAttentionKind,
} from "@/packages/pms/lib/reservation-workspace/arrivals-departures";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export type FoDepartureAttentionRow = {
  reservationId: string;
  kind: FoDepartureAttentionKind;
  label: string;
};

export interface FrontOfficeDashboard {
  today: string;
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  availableRooms: number;
  occupiedRooms: number;
  outOfOrder: number;
  outOfService: number;
  /**
   * Authoritative Attention KPI: departure-timing stays (once each) plus open
   * housekeeping discrepancies when that feed is readable.
   */
  attention: number;
  /** Checked-in stays needing departure attention — same classifier as Night Audit timing. */
  departureAttention: FoDepartureAttentionRow[];
  checkedAt: string;
}

/**
 * Hotel snapshot shared with Property Home and Back Office reports.
 * Lives outside the PMS package so Back Office does not import PMS UI or
 * the Front Office function module.
 */
export const getFrontOfficeDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, today: dateSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FrontOfficeDashboard> => {
    await requirePmsActorAny(context as never, data.restaurantId, [
      PMS_PERMISSIONS.FRONT_OFFICE_VIEW,
      PMS_PERMISSIONS.RESERVATION_VIEW,
      PMS_PERMISSIONS.REPORTS_VIEW,
    ]);
    const today = assertDateOnly(data.today, "Business date");
    const checkedAt = new Date().toISOString();

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

    const [
      arrivals,
      departures,
      inHouse,
      available,
      ooo,
      oos,
      propertyResult,
      inHouseStayResult,
      discrepancyResult,
      occupiedResult,
    ] = await Promise.all([
      reservations().in("status", ["pending", "confirmed"]).eq("arrival_date", today),
      reservations().in("status", ["confirmed", "checked_in"]).eq("departure_date", today),
      reservations().eq("status", "checked_in"),
      rooms("available"),
      rooms("out_of_order"),
      rooms("out_of_service"),
      context.supabase
        .from("restaurants")
        .select("timezone, check_out_time")
        .eq("id", data.restaurantId)
        .maybeSingle(),
      context.supabase
        .from("hotel_reservations")
        .select("id, status, departure_date, late_checkout_granted, late_checkout_until")
        .eq("restaurant_id", data.restaurantId)
        .eq("status", "checked_in"),
      context.supabase
        .from("housekeeping_discrepancies")
        .select("id, status")
        .eq("restaurant_id", data.restaurantId)
        .limit(200),
      context.supabase
        .from("hotel_reservations")
        .select("room_id")
        .eq("restaurant_id", data.restaurantId)
        .eq("status", "checked_in")
        .not("room_id", "is", null),
    ]);

    if (propertyResult.error) throw new Error(propertyResult.error.message);
    if (inHouseStayResult.error) throw new Error(inHouseStayResult.error.message);
    if (occupiedResult.error) throw new Error(occupiedResult.error.message);

    const property = propertyResult.data;
    const timezone = property?.timezone || "UTC";
    // FO passes the property business date as `today`. Timing uses property TZ + server instant.
    const checkOutTime =
      property?.check_out_time != null ? String(property.check_out_time) : null;

    const departureAttention: FoDepartureAttentionRow[] = [];
    for (const row of inHouseStayResult.data ?? []) {
      const attention = classifyFoDepartureAttention({
        status: String(row.status ?? "checked_in"),
        departureDate: String(row.departure_date),
        businessDate: today,
        checkedAt,
        timezone,
        checkOutTime,
        lateCheckoutGranted: row.late_checkout_granted === true,
        lateCheckoutUntil: row.late_checkout_until ? String(row.late_checkout_until) : null,
      });
      if (!attention) continue;
      departureAttention.push({
        reservationId: String(row.id),
        kind: attention.kind,
        label: attention.label,
      });
    }

    let openDiscrepancies = 0;
    if (!discrepancyResult.error) {
      openDiscrepancies = (discrepancyResult.data ?? []).filter((row) =>
        isOpenDiscrepancyStatus(String(row.status ?? "")),
      ).length;
    }

    const occupiedRooms = new Set((occupiedResult.data ?? []).map((r) => r.room_id)).size;
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
      attention: departureAttention.length + openDiscrepancies,
      departureAttention,
      checkedAt,
    };
  });
