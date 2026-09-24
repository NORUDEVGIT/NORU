import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireCashieringAccess } from "../cashiering.server";
import { isPermissionDeniedMessage } from "../front-office-shell";
import { requireReservationManager } from "../reservations.server";
import { deskActionHints } from "./desk.server";
import { resolvePropertyBusinessDate } from "./business-date";
import {
  OPERATIONAL_RESERVATION_SELECT,
  operationalRoomState,
  toReservationOperationalSummary,
  type OperationalReservationRow,
} from "./search.server";
import type {
  QuickViewExceptionKey,
  QuickViewFinancialState,
  ReservationOperationalSummary,
  ReservationQuickView,
} from "./shared-read-models";

const idSchema = z.string().uuid();

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

function linkedMaster(
  id: string | null,
  name: string | null,
): { id: string; name: string | null } | null {
  if (!id) return null;
  return { id, name };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function quickViewExceptionKeys(input: {
  status: ReservationOperationalSummary["status"];
  roomId: string | null;
  operationalStatus: string | null;
  housekeepingStatus: string | null;
  ratePlanId: string | null;
  roomSubtotal: number | null;
  arrivalDate: string;
  departureDate: string;
  businessDate: string;
}): QuickViewExceptionKey[] {
  const keys: QuickViewExceptionKey[] = [];
  const pendingOrConfirmed = input.status === "pending" || input.status === "confirmed";
  if (pendingOrConfirmed && input.roomId === null) keys.push("unassigned");
  if (
    input.roomId &&
    (input.operationalStatus === "out_of_order" || input.operationalStatus === "out_of_service")
  ) {
    keys.push("room_unavailable");
  }
  if (
    input.roomId &&
    (input.housekeepingStatus === "dirty" || input.housekeepingStatus === "pickup")
  ) {
    keys.push("room_not_ready");
  }
  if (input.status === "confirmed" && (input.ratePlanId === null || input.roomSubtotal === null)) {
    keys.push("missing_rate_snapshot");
  }
  if (pendingOrConfirmed && input.arrivalDate < input.businessDate) keys.push("overdue_arrival");
  if (input.status === "checked_in" && input.departureDate < input.businessDate) {
    keys.push("overdue_departure");
  }
  return keys;
}

async function loadQuickViewFinancial(
  context: Parameters<typeof requireReservationManager>[0],
  restaurantId: string,
  reservationId: string,
): Promise<ReservationQuickView["financial"]> {
  const empty = {
    folioId: null as string | null,
    folioNumber: null as string | null,
    balance: null as number | null,
  };
  try {
    await requireCashieringAccess(context, restaurantId);
  } catch (error) {
    const state: QuickViewFinancialState = isPermissionDeniedMessage(error)
      ? "permission_denied"
      : "not_available";
    return { state, ...empty };
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: folio, error: folioError } = await supabaseAdmin
      .from("guest_folios")
      .select("id, folio_number")
      .eq("restaurant_id", restaurantId)
      .eq("reservation_id", reservationId)
      .maybeSingle();
    if (folioError) return { state: "not_available", ...empty };
    if (!folio) return { state: "available", ...empty };

    const { data: txns, error: txnError } = await supabaseAdmin
      .from("folio_transactions")
      .select("amount")
      .eq("restaurant_id", restaurantId)
      .eq("folio_id", folio.id);
    if (txnError) return { state: "not_available", ...empty };

    let charges = 0;
    let credits = 0;
    for (const row of (txns ?? []) as Array<{ amount: number | string }>) {
      const amount = Number(row.amount);
      if (amount >= 0) charges += amount;
      else credits += -amount;
    }
    return {
      state: "available",
      folioId: folio.id,
      folioNumber: folio.folio_number,
      balance: round2(charges - credits),
    };
  } catch {
    return { state: "not_available", ...empty };
  }
}

export const getReservationQuickView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationQuickView> => {
    await requireReservationManager(context as never, data.restaurantId);
    const generatedAt = new Date().toISOString();
    const supabase: WorkspaceClient = context.supabase;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [propertyResult, reservationResult, historyResult, financial] = await Promise.all([
      supabaseAdmin
        .from("restaurants")
        .select("business_date, timezone")
        .eq("id", data.restaurantId)
        .maybeSingle(),
      supabase
        .from("hotel_reservations")
        .select(OPERATIONAL_RESERVATION_SELECT)
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.reservationId)
        .maybeSingle(),
      supabase
        .from("hotel_reservation_history")
        .select("event_type, notes, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId)
        .order("created_at", { ascending: false })
        .limit(1),
      loadQuickViewFinancial(context as never, data.restaurantId, data.reservationId),
    ]);

    if (propertyResult.error) throw new Error(propertyResult.error.message);
    if (!propertyResult.data) throw new Error("Property not found.");
    if (reservationResult.error) throw new Error(reservationResult.error.message);
    if (!reservationResult.data) throw new Error("Reservation not found for this property.");

    const row = reservationResult.data as unknown as OperationalReservationRow;
    const summary = toReservationOperationalSummary(row);
    const roomState = operationalRoomState(row);
    const businessDate = resolvePropertyBusinessDate(
      propertyResult.data.business_date,
      propertyResult.data.timezone,
    );
    const last = (historyResult.data ?? [])[0] as
      { event_type: string; notes: string | null; created_at: string } | undefined;

    return {
      reservationId: summary.reservationId,
      confirmationNumber: summary.confirmationNumber,
      restaurantId: data.restaurantId,
      businessDate,
      generatedAt,
      updatedAt: summary.updatedAt,
      identity: {
        guestId: summary.guestId,
        guestName: summary.guestName,
        phone: summary.guestPhone,
        email: summary.guestEmail,
        vip: summary.guestVip,
        company: linkedMaster(summary.companyMasterId, summary.companyName),
        travelAgent: linkedMaster(summary.travelAgentMasterId, summary.travelAgentName),
        group: linkedMaster(summary.groupAccountMasterId, summary.groupName),
      },
      stay: {
        arrivalDate: summary.arrivalDate,
        departureDate: summary.departureDate,
        nights: summary.nights,
        adults: summary.adults,
        children: summary.children,
        status: summary.status,
        source: summary.source,
      },
      room: {
        roomTypeId: summary.roomTypeId,
        roomTypeName: summary.roomTypeName,
        roomId: summary.roomId,
        roomNumber: summary.roomNumber,
        assigned: summary.roomId !== null,
        operationalStatus: roomState.operationalStatus,
        housekeepingStatus: roomState.housekeepingStatus,
      },
      commercial: {
        ratePlanId: summary.ratePlanId,
        ratePlanName: summary.ratePlanName,
        roomSubtotal: summary.roomSubtotal,
        currency: summary.currency,
        commercialBookingSource: summary.commercialBookingSource,
        marketSegment: summary.marketSegment,
        externalReference: summary.externalReference,
        guaranteeMethod: summary.guaranteeMethod,
      },
      financial,
      operational: {
        specialRequests: summary.specialRequests,
        notes: summary.notes,
        exceptionKeys: quickViewExceptionKeys({
          status: summary.status,
          roomId: summary.roomId,
          operationalStatus: roomState.operationalStatus,
          housekeepingStatus: roomState.housekeepingStatus,
          ratePlanId: summary.ratePlanId,
          roomSubtotal: summary.roomSubtotal,
          arrivalDate: summary.arrivalDate,
          departureDate: summary.departureDate,
          businessDate,
        }),
        lastHistoryEvent: last
          ? { eventType: last.event_type, createdAt: last.created_at, notes: last.notes }
          : null,
      },
      actionHints: {
        ...deskActionHints(summary),
        canOpenFolio: financial.state === "available" && financial.folioId !== null,
      },
    };
  });
