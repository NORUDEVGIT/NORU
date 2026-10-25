import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireCashieringAccess } from "../cashiering.server";
import { isPermissionDeniedMessage } from "../front-office-shell";
import { isRoomReady } from "../fo-check-in";
import { loadCard2HousekeepingSnapshot } from "../housekeeping-card2.functions";
import type { HousekeepingReadinessPolicy } from "../housekeeping-card2.server";
import { nightsBetween, type ReservationStatus } from "../reservation-dates";
import { requireReservationManager, RESERVATION_STATUSES } from "../reservations.server";
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

/** Positive folio amounts are charges. Negative amounts are payments, deposits, and other credits. */
export function signedFolioBalance(amounts: ReadonlyArray<number>): number {
  let charges = 0;
  let credits = 0;
  for (const amount of amounts) {
    if (amount >= 0) charges += amount;
    else credits += -amount;
  }
  return round2(charges - credits);
}

export type QuickViewRoomUnit = {
  reservationRoomId: string;
  unitSequence: number;
  roomTypeId: string;
  roomTypeName: string;
  roomId: string | null;
  roomNumber: string | null;
  operationalStatus: string | null;
  housekeepingStatus: string | null;
  maintenanceStatus: string | null;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  status: ReservationStatus;
};

function reservationStatus(value: string, fallback: ReservationStatus): ReservationStatus {
  return (RESERVATION_STATUSES as readonly string[]).includes(value)
    ? (value as ReservationStatus)
    : fallback;
}

export function projectReservationQuickView(input: {
  summary: ReservationOperationalSummary;
  restaurantId: string;
  businessDate: string;
  generatedAt: string;
  financial: ReservationQuickView["financial"];
  roomState: {
    operationalStatus: string | null;
    housekeepingStatus: string | null;
    maintenanceStatus: string | null;
  };
  lastHistoryEvent: ReservationQuickView["operational"]["lastHistoryEvent"];
  housekeepingPolicy?: HousekeepingReadinessPolicy;
  unit?: QuickViewRoomUnit | null;
}): ReservationQuickView {
  const summary = input.summary;
  const view: ReservationQuickView = {
    reservationId: summary.reservationId,
    confirmationNumber: summary.confirmationNumber,
    restaurantId: input.restaurantId,
    businessDate: input.businessDate,
    generatedAt: input.generatedAt,
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
      operationalStatus: input.roomState.operationalStatus,
      housekeepingStatus: input.roomState.housekeepingStatus,
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
    financial: input.financial,
    operational: {
      specialRequests: summary.specialRequests,
      notes: summary.notes,
      exceptionKeys: quickViewExceptionKeys({
        status: summary.status,
        roomId: summary.roomId,
        operationalStatus: input.roomState.operationalStatus,
        housekeepingStatus: input.roomState.housekeepingStatus,
        maintenanceStatus: input.roomState.maintenanceStatus,
        ratePlanId: summary.ratePlanId,
        roomSubtotal: summary.roomSubtotal,
        arrivalDate: summary.arrivalDate,
        departureDate: summary.departureDate,
        businessDate: input.businessDate,
        housekeepingPolicy: input.housekeepingPolicy,
      }),
      lastHistoryEvent: input.lastHistoryEvent,
    },
    actionHints: {
      ...deskActionHints(summary),
      canOpenFolio: input.financial.state === "available" && input.financial.folioId !== null,
    },
    selectedUnit: null,
  };
  return applyQuickViewRoomUnit(view, input.unit ?? null, input.housekeepingPolicy);
}

export function applyQuickViewRoomUnit(
  view: ReservationQuickView,
  unit: QuickViewRoomUnit | null,
  housekeepingPolicy?: HousekeepingReadinessPolicy,
): ReservationQuickView {
  if (!unit) return { ...view, selectedUnit: null };
  const status = reservationStatus(unit.status, view.stay.status);
  return {
    ...view,
    selectedUnit: {
      reservationRoomId: unit.reservationRoomId,
      unitSequence: unit.unitSequence,
    },
    stay: {
      ...view.stay,
      arrivalDate: unit.arrivalDate,
      departureDate: unit.departureDate,
      nights: nightsBetween(unit.arrivalDate, unit.departureDate),
      adults: unit.adults,
      children: unit.children,
      status,
    },
    room: {
      roomTypeId: unit.roomTypeId,
      roomTypeName: unit.roomTypeName,
      roomId: unit.roomId,
      roomNumber: unit.roomNumber,
      assigned: unit.roomId !== null,
      operationalStatus: unit.operationalStatus,
      housekeepingStatus: unit.housekeepingStatus,
    },
    operational: {
      ...view.operational,
      exceptionKeys: quickViewExceptionKeys({
        status,
        roomId: unit.roomId,
        operationalStatus: unit.operationalStatus,
        housekeepingStatus: unit.housekeepingStatus,
        maintenanceStatus: unit.maintenanceStatus,
        ratePlanId: view.commercial.ratePlanId,
        roomSubtotal: view.commercial.roomSubtotal,
        arrivalDate: unit.arrivalDate,
        departureDate: unit.departureDate,
        businessDate: view.businessDate,
        housekeepingPolicy,
      }),
    },
    actionHints: {
      ...deskActionHints({ status, roomId: unit.roomId }),
      canOpenFolio: view.financial.state === "available" && view.financial.folioId !== null,
    },
  };
}

export function quickViewExceptionKeys(input: {
  status: ReservationOperationalSummary["status"];
  roomId: string | null;
  operationalStatus: string | null;
  housekeepingStatus: string | null;
  maintenanceStatus?: string | null;
  ratePlanId: string | null;
  roomSubtotal: number | null;
  arrivalDate: string;
  departureDate: string;
  businessDate: string;
  housekeepingPolicy?: HousekeepingReadinessPolicy;
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
    input.operationalStatus !== "out_of_order" &&
    input.operationalStatus !== "out_of_service"
  ) {
    const ready = isRoomReady(
      {
        status: input.operationalStatus,
        housekeepingStatus: input.housekeepingStatus,
        maintenanceStatus: input.maintenanceStatus ?? null,
      },
      input.housekeepingPolicy,
    ).ready;
    if (!ready) keys.push("room_not_ready");
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

    const amounts = ((txns ?? []) as Array<{ amount: number | string }>).map((row) =>
      Number(row.amount),
    );
    return {
      state: "available",
      folioId: folio.id,
      folioNumber: folio.folio_number,
      balance: signedFolioBalance(amounts),
    };
  } catch {
    return { state: "not_available", ...empty };
  }
}

type RoomUnitRow = {
  id: string;
  unit_sequence: number;
  room_id: string | null;
  room_type_id: string;
  status: string;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
};

async function loadQuickViewRoomUnit(
  supabase: WorkspaceClient,
  restaurantId: string,
  reservationId: string,
  reservationRoomId: string,
  fallbackStatus: ReservationStatus,
): Promise<QuickViewRoomUnit> {
  const { data, error } = await supabase
    .from("hotel_reservation_rooms")
    .select(
      "id, unit_sequence, room_id, room_type_id, status, arrival_date, departure_date, adults, children",
    )
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .eq("id", reservationRoomId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Reservation room unit not found for this property.");
  const unit = data as RoomUnitRow;

  const { data: roomType, error: roomTypeError } = await supabase
    .from("room_types")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .eq("id", unit.room_type_id)
    .maybeSingle();
  if (roomTypeError) throw new Error(roomTypeError.message);
  if (!roomType?.name) throw new Error("Reservation room unit is missing a room type.");

  let roomNumber: string | null = null;
  let operationalStatus: string | null = null;
  let housekeepingStatus: string | null = null;
  let maintenanceStatus: string | null = null;
  if (unit.room_id) {
    const { data: room, error: roomError } = await supabase
      .from("hotel_rooms")
      .select("room_number, status, housekeeping_status, maintenance_status")
      .eq("restaurant_id", restaurantId)
      .eq("id", unit.room_id)
      .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    roomNumber = room?.room_number ?? null;
    operationalStatus = room?.status ?? null;
    housekeepingStatus = room?.housekeeping_status ?? null;
    maintenanceStatus = room?.maintenance_status ?? null;
  }

  return {
    reservationRoomId: unit.id,
    unitSequence: unit.unit_sequence,
    roomTypeId: unit.room_type_id,
    roomTypeName: roomType.name,
    roomId: unit.room_id,
    roomNumber,
    operationalStatus,
    housekeepingStatus,
    maintenanceStatus,
    arrivalDate: unit.arrival_date,
    departureDate: unit.departure_date,
    adults: unit.adults,
    children: unit.children,
    status: reservationStatus(unit.status, fallbackStatus),
  };
}

export const getReservationQuickView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reservationRoomId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ReservationQuickView> => {
    await requireReservationManager(context as never, data.restaurantId);
    const generatedAt = new Date().toISOString();
    const supabase: WorkspaceClient = context.supabase;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [propertyResult, reservationResult, historyResult, financial, hkSnapshot] =
      await Promise.all([
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
        loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId, false),
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
    const unit = data.reservationRoomId
      ? await loadQuickViewRoomUnit(
          supabase,
          data.restaurantId,
          data.reservationId,
          data.reservationRoomId,
          summary.status,
        )
      : null;

    return projectReservationQuickView({
      summary,
      restaurantId: data.restaurantId,
      businessDate,
      generatedAt,
      financial,
      roomState,
      housekeepingPolicy: hkSnapshot.settings,
      lastHistoryEvent: last
        ? { eventType: last.event_type, createdAt: last.created_at, notes: last.notes }
        : null,
      unit,
    });
  });
