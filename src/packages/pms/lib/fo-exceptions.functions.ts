/**
 * FO-FS6 + FO-EX1 — batch reads of existing folio / check-in / discrepancy /
 * demand signals. No new table, RPC, RLS or migration.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canManageHousekeeping } from "./housekeeping.server";
import { requireCashieringAccess } from "./cashiering.server";
import { isPermissionDeniedMessage } from "./front-office-shell";
import { addDays } from "./reservation-dates";
import { requireReservationManager } from "./reservations.server";
import {
  EXCEPTION_FEED_ROW_CAP,
  OVERBOOKING_HORIZON_DAYS,
  isOpenDiscrepancyStatus,
  type ExceptionDiscrepancyLike,
  type FolioSignalLane,
  type OverbookStayLike,
  type StayMoneySignal,
} from "./fo-exceptions";

const idSchema = z.string().uuid();

export type FoStaySignalsResult = {
  folioLane: FolioSignalLane;
  byStay: Record<string, StayMoneySignal>;
};

function emptySignal(): StayMoneySignal {
  return {
    folioId: null,
    folioNumber: null,
    balance: null,
    depositPosted: null,
    depositWaived: false,
    checkoutOverride: false,
    keyIssued: false,
    keyWaived: false,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ensureSignal(map: Record<string, StayMoneySignal>, stayId: string): StayMoneySignal {
  const existing = map[stayId];
  if (existing) return existing;
  const created = emptySignal();
  map[stayId] = created;
  return created;
}

export const listFoStaySignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationIds: z.array(idSchema).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FoStaySignalsResult> => {
    await requireReservationManager(context as never, data.restaurantId);
    const byStay: Record<string, StayMoneySignal> = {};
    const ids = data.reservationIds ?? [];

    if (ids.length === 0) {
      try {
        await requireCashieringAccess(context as never, data.restaurantId);
        return { folioLane: "live", byStay };
      } catch (error) {
        return {
          folioLane: isPermissionDeniedMessage(error) ? "permission_denied" : "coming_soon",
          byStay,
        };
      }
    }

    const { data: progressRows, error: progressError } = await context.supabase
      .from("fo_checkin_progress")
      .select(
        "reservation_id, deposit_amount, deposit_waived, key_access_type, key_identifier, key_issued_at, key_waived",
      )
      .eq("restaurant_id", data.restaurantId)
      .in("reservation_id", ids);

    if (!progressError) {
      for (const row of (progressRows ?? []) as Array<{
        reservation_id: string;
        deposit_amount: number | string | null;
        deposit_waived: boolean | null;
        key_access_type: string | null;
        key_identifier: string | null;
        key_issued_at: string | null;
        key_waived: boolean | null;
      }>) {
        const signal = ensureSignal(byStay, row.reservation_id);
        signal.depositWaived = row.deposit_waived === true;
        if (row.deposit_amount != null) signal.depositPosted = Number(row.deposit_amount);
        signal.keyIssued = Boolean((row.key_access_type ?? "").trim() && (row.key_identifier ?? "").trim());
        signal.keyWaived = row.key_waived === true;
        if (row.key_issued_at) signal.keyIssued = true;
      }
    }

    const { data: historyRows } = await context.supabase
      .from("hotel_reservation_history")
      .select("reservation_id, new_values")
      .eq("restaurant_id", data.restaurantId)
      .eq("event_type", "amended")
      .in("reservation_id", ids);

    for (const row of (historyRows ?? []) as Array<{ reservation_id: string; new_values: unknown }>) {
      const values = row.new_values as { checkout_override?: unknown; deposit_waived?: unknown } | null;
      if (!values || typeof values !== "object") continue;
      const signal = ensureSignal(byStay, row.reservation_id);
      if (values.checkout_override === true) signal.checkoutOverride = true;
      if (values.deposit_waived === true) signal.depositWaived = true;
    }

    let folioLane: FolioSignalLane = "live";
    try {
      await requireCashieringAccess(context as never, data.restaurantId);
    } catch (error) {
      folioLane = isPermissionDeniedMessage(error) ? "permission_denied" : "coming_soon";
      return { folioLane, byStay };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let folioQuery = supabaseAdmin
        .from("guest_folios")
        .select("id, folio_number, reservation_id")
        .eq("restaurant_id", data.restaurantId);
      if (ids.length > 0) folioQuery = folioQuery.in("reservation_id", ids);
      const { data: folios, error: folioError } = await folioQuery;
      if (folioError) return { folioLane: "coming_soon", byStay };

      const folioList = (folios ?? []) as Array<{
        id: string;
        folio_number: string;
        reservation_id: string | null;
      }>;
      const folioIds = folioList.map((f) => f.id);
      const amounts = new Map<string, number[]>();
      const deposits = new Map<string, number>();

      if (folioIds.length > 0) {
        const { data: txns, error: txnError } = await supabaseAdmin
          .from("folio_transactions")
          .select("folio_id, amount, transaction_type")
          .eq("restaurant_id", data.restaurantId)
          .in("folio_id", folioIds);
        if (txnError) return { folioLane: "coming_soon", byStay };
        for (const t of (txns ?? []) as Array<{
          folio_id: string;
          amount: number | string;
          transaction_type: string;
        }>) {
          const bucket = amounts.get(t.folio_id) ?? [];
          bucket.push(Number(t.amount));
          amounts.set(t.folio_id, bucket);
          if (t.transaction_type === "deposit") {
            deposits.set(t.folio_id, (deposits.get(t.folio_id) ?? 0) + Math.abs(Number(t.amount)));
          }
        }
      }

      for (const folio of folioList) {
        if (!folio.reservation_id) continue;
        const signal = ensureSignal(byStay, folio.reservation_id);
        signal.folioId = folio.id;
        signal.folioNumber = folio.folio_number;
        const txnAmounts = amounts.get(folio.id) ?? [];
        let charges = 0;
        let credits = 0;
        for (const amount of txnAmounts) {
          if (amount >= 0) charges += amount;
          else credits += -amount;
        }
        signal.balance = round2(charges - credits);
        const posted = deposits.get(folio.id);
        if (posted != null) signal.depositPosted = posted;
      }

      return { folioLane, byStay };
    } catch {
      return { folioLane: "coming_soon", byStay };
    }
  });

export type FoExceptionFeedsResult = {
  overbookingLane: FolioSignalLane;
  discrepancyLane: FolioSignalLane;
  canResolveDiscrepancy: boolean;
  demandStays: OverbookStayLike[];
  discrepancies: ExceptionDiscrepancyLike[];
};

function classifyFeedError(error: unknown): FolioSignalLane {
  return isPermissionDeniedMessage(error) ? "permission_denied" : "coming_soon";
}

export const listFoExceptionFeeds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<FoExceptionFeedsResult> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const canResolveDiscrepancy = canManageHousekeeping(me.role);
    const endDate = addDays(data.businessDate, OVERBOOKING_HORIZON_DAYS - 1);

    let overbookingLane: FolioSignalLane = "live";
    let demandStays: OverbookStayLike[] = [];
    try {
      const { data: rows, error } = await context.supabase
        .from("hotel_reservations")
        .select(
          `
          id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, status,
          guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name ),
          room_types!hotel_reservations_type_same_property ( name ),
          hotel_rooms!hotel_reservations_room_same_type ( room_number )
        `,
        )
        .eq("restaurant_id", data.restaurantId)
        .in("status", ["pending", "confirmed", "checked_in"])
        .lte("arrival_date", endDate)
        .limit(EXCEPTION_FEED_ROW_CAP);
      if (error) throw new Error(error.message);
      const list = (rows ?? []) as unknown as Array<{
        id: string;
        confirmation_number: string;
        guest_id: string;
        room_type_id: string;
        room_id: string | null;
        arrival_date: string;
        departure_date: string;
        status: string;
        guest_profiles: { first_name: string; last_name: string | null } | null;
        room_types: { name: string } | null;
        hotel_rooms: { room_number: string } | null;
      }>;
      if (list.length >= EXCEPTION_FEED_ROW_CAP) {
        overbookingLane = "coming_soon";
      } else {
        demandStays = list.map((row) => ({
          id: row.id,
          confirmationNumber: row.confirmation_number,
          guestName:
            [row.guest_profiles?.first_name, row.guest_profiles?.last_name].filter(Boolean).join(" ").trim() ||
            "Guest",
          guestId: row.guest_id,
          roomTypeId: row.room_type_id,
          roomTypeName: row.room_types?.name ?? "Room type",
          roomId: row.room_id,
          roomNumber: row.hotel_rooms?.room_number ?? null,
          arrivalDate: row.arrival_date,
          departureDate: row.departure_date,
          status: row.status,
        }));
      }
    } catch (error) {
      overbookingLane = classifyFeedError(error);
      demandStays = [];
    }

    let discrepancyLane: FolioSignalLane = "live";
    let discrepancies: ExceptionDiscrepancyLike[] = [];
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error } = await supabaseAdmin
        .from("housekeeping_discrepancies")
        .select(
          "id, room_id, reported_occupancy, actual_occupancy, reported_hk_status, actual_hk_status, reason, status, hotel_rooms!inner ( room_number )",
        )
        .eq("restaurant_id", data.restaurantId)
        .limit(200);
      if (error) throw new Error(error.message);
      discrepancies = (
        (rows ?? []) as unknown as Array<{
          id: string;
          room_id: string;
          reported_occupancy: string | null;
          actual_occupancy: string | null;
          reported_hk_status: string | null;
          actual_hk_status: string | null;
          reason: string | null;
          status: string;
          hotel_rooms: { room_number: string } | null;
        }>
      )
        .filter((row) => isOpenDiscrepancyStatus(row.status))
        .map((row) => ({
          id: row.id,
          roomId: row.room_id,
          roomNumber: row.hotel_rooms?.room_number ?? "—",
          reportedOccupancy: row.reported_occupancy,
          actualOccupancy: row.actual_occupancy,
          reportedHkStatus: row.reported_hk_status,
          actualHkStatus: row.actual_hk_status,
          reason: row.reason,
          status: row.status,
        }));
    } catch (error) {
      discrepancyLane = classifyFeedError(error);
      discrepancies = [];
    }

    return {
      overbookingLane,
      discrepancyLane,
      canResolveDiscrepancy,
      demandStays: overbookingLane === "live" ? demandStays : [],
      discrepancies: discrepancyLane === "live" ? discrepancies : [],
    };
  });
