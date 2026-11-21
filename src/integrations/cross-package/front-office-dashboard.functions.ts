import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PMS_PERMISSIONS } from "@/packages/pms/lib/pms-permissions";
import { requirePmsActorAny } from "@/packages/pms/lib/pms-permissions.server";
import {
  checkedInRoomIds,
  expandStayRooms,
} from "@/packages/pms/lib/reservation-room-units";
import {
  classifyFoDepartureAttention,
  type FoDepartureAttentionKind,
} from "@/packages/pms/lib/reservation-workspace/fo-departure-attention";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Inline — avoid importing reservations.server into this cross-package handler. */
function assertBusinessDate(value: string): string {
  if (!DATE_ONLY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("Business date must be a valid date.");
  }
  return value;
}

/** Same predicate as fo-exceptions — local pure helper, no UI/server graph. */
function isOpenDiscrepancyStatus(status: string): boolean {
  return status === "open" || status === "unresolved";
}

/** Same codes as pms-set2-structure.isMissingSchemaError — inlined for a thin graph. */
function isMissingSchemaError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "42P01" || error.code === "PGRST204" || error.code === "PGRST205") {
    return true;
  }
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the") ||
    /column .* (was )?not found/.test(msg)
  );
}

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
    const today = assertBusinessDate(data.today);
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

    // Property timezone / check-out clock: same admin read pattern as fo-control.
    // User-scoped SELECT on restaurants fails with "permission denied for table restaurants"
    // for this desk role and previously aborted the entire dashboard after Attention was added.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    ] = await Promise.all([
      // Same status sets as loadReservationDeskKpis / operationalViewStatuses.
      reservations().in("status", ["pending", "confirmed"]).eq("arrival_date", today),
      reservations().in("status", ["confirmed", "checked_in"]).eq("departure_date", today),
      reservations().eq("status", "checked_in"),
      rooms("available"),
      rooms("out_of_order"),
      rooms("out_of_service"),
      supabaseAdmin
        .from("restaurants")
        .select("timezone, check_out_time")
        .eq("id", data.restaurantId)
        .maybeSingle(),
      context.supabase
        .from("hotel_reservations")
        .select(
          "id, status, room_id, arrival_date, departure_date, late_checkout_granted, late_checkout_until",
        )
        .eq("restaurant_id", data.restaurantId)
        .eq("status", "checked_in"),
      context.supabase
        .from("housekeeping_discrepancies")
        .select("id, status")
        .eq("restaurant_id", data.restaurantId)
        .limit(200),
    ]);

    for (const result of [arrivals, departures, inHouse, available, ooo, oos] as const) {
      if (result.error) throw new Error(result.error.message);
    }
    if (propertyResult.error) throw new Error(propertyResult.error.message);
    if (inHouseStayResult.error) throw new Error(inHouseStayResult.error.message);

    const property = propertyResult.data;
    const timezone = property?.timezone || "UTC";
    const checkOutTime =
      property?.check_out_time != null ? String(property.check_out_time) : null;

    const stayRows = inHouseStayResult.data ?? [];
    const departureAttention: FoDepartureAttentionRow[] = [];
    for (const row of stayRows) {
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

    // Same unit-aware occupied-room source as listOccupancy (expandStayRooms + checkedInRoomIds).
    const unitResult =
      stayRows.length === 0
        ? { data: [], error: null }
        : await context.supabase
            .from("hotel_reservation_rooms")
            .select(
              "id, reservation_id, room_id, status, arrival_date, departure_date, unit_sequence",
            )
            .eq("restaurant_id", data.restaurantId)
            .in(
              "reservation_id",
              stayRows.map((stay) => String(stay.id)),
            );
    if (unitResult.error && !isMissingSchemaError(unitResult.error)) {
      throw new Error(unitResult.error.message);
    }
    const unitRows =
      unitResult.error && isMissingSchemaError(unitResult.error)
        ? null
        : ((unitResult.data ?? []) as Array<{
            id: string;
            reservation_id: string;
            room_id: string | null;
            status: string | null;
            arrival_date: string;
            departure_date: string;
            unit_sequence: number;
          }>);
    const occupiedSlices = expandStayRooms(
      stayRows.map((stay) => ({
        id: String(stay.id),
        roomId: stay.room_id ? String(stay.room_id) : null,
        status: String(stay.status ?? "checked_in"),
        arrivalDate: String(stay.arrival_date),
        departureDate: String(stay.departure_date),
      })),
      unitRows
        ? unitRows.map((unit) => ({
            id: unit.id,
            reservationId: unit.reservation_id,
            roomId: unit.room_id,
            status: unit.status,
            arrivalDate: unit.arrival_date,
            departureDate: unit.departure_date,
            unitSequence: unit.unit_sequence,
          }))
        : null,
    );
    const occupiedRooms = checkedInRoomIds(occupiedSlices).length;
    const availableStatusRooms = available.count ?? 0;

    return {
      today,
      arrivalsToday: arrivals.count ?? 0,
      departuresToday: departures.count ?? 0,
      inHouse: inHouse.count ?? 0,
      availableRooms: Math.max(0, availableStatusRooms - occupiedRooms),
      occupiedRooms,
      outOfOrder: ooo.count ?? 0,
      outOfService: oos.count ?? 0,
      attention: departureAttention.length + openDiscrepancies,
      departureAttention,
      checkedAt,
    };
  });
