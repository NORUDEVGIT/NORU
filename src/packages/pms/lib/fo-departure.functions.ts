/**
 * FO Phase 4 — Departures desk and Quick View read models.
 * Aggregates existing reservation, guest, room, HK, folio, late checkout, and history.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFoStaySignals } from "./fo-exceptions.functions";
import type { FolioSignalLane, StayMoneySignal } from "./fo-exceptions";
import {
  loadFrontOfficeDepartures,
  loadFrontOfficeStay,
  type FrontOfficeStay,
} from "./frontoffice.functions";
import { normalizeClock } from "./pms-set1-foundation";
import { assertDateOnly, requireReservationManager } from "./reservations.server";
import { resolvePropertyBusinessDate } from "./reservation-workspace/business-date";
import { financialFromSignal, parseLateCheckoutPolicy } from "./reservation-workspace/arrivals-departures";
import type { LateCheckoutPolicy } from "./reservation-workspace/shared-read-models";
import {
  FO_DEPARTURE_EXCEPTION_LABELS,
  foCheckoutReadiness,
  foDepartureActionHints,
  foDepartureBlockingKeys,
  foDepartureExceptionKeys,
  foDepartureTiming,
  type FoCheckoutReadiness,
  type FoDepartureActionHints,
  type FoDepartureExceptionKey,
  type FoDepartureHistoryItem,
  type FoDepartureTiming,
} from "./fo-departure";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

export type FoDeparturePropertySettings = {
  timezone: string;
  checkOutTime: string | null;
  lateCheckout: LateCheckoutPolicy;
};

export type FoDepartureRoomState = {
  operationalStatus: string | null;
  housekeepingStatus: string | null;
  maintenanceStatus: string | null;
  floor: string | null;
};

export type FoDepartureDeskRow = {
  stay: FrontOfficeStay;
  assigned: boolean;
  floor: string | null;
  housekeepingStatus: string | null;
  operationalStatus: string | null;
  financialLane: FolioSignalLane;
  folioId: string | null;
  folioNumber: string | null;
  balance: number | null;
  timing: FoDepartureTiming;
  exceptionKeys: FoDepartureExceptionKey[];
  hints: FoDepartureActionHints;
  readiness: FoCheckoutReadiness;
};

export type FoDepartureExceptionItem = {
  key: FoDepartureExceptionKey;
  label: string;
  blocking: boolean;
};

export type FoDepartureQuickView = {
  stay: FrontOfficeStay;
  guest: {
    fullName: string;
    phone: string | null;
    email: string | null;
    vip: boolean;
  };
  room: {
    id: string | null;
    roomNumber: string | null;
    floor: string | null;
    status: string | null;
    housekeepingStatus: string | null;
    maintenanceStatus: string | null;
    assigned: boolean;
  };
  financial: {
    lane: FolioSignalLane;
    folioId: string | null;
    folioNumber: string | null;
    balance: number | null;
    status: string | null;
    needsSettlement: boolean;
  };
  lateCheckout: {
    granted: boolean;
    until: string | null;
    note: string | null;
    policy: LateCheckoutPolicy;
  };
  timing: FoDepartureTiming;
  exceptions: FoDepartureExceptionItem[];
  hints: FoDepartureActionHints;
  readiness: FoCheckoutReadiness;
  history: FoDepartureHistoryItem[];
  businessDate: string;
  settings: FoDeparturePropertySettings;
};

async function loadDepartureSettings(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
): Promise<FoDeparturePropertySettings & { businessDate: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select(
      "timezone, business_date, check_out_time, late_checkout_allowed, late_checkout_fee, late_checkout_needs_approval",
    )
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Property not found.");
  return {
    timezone: data.timezone || "UTC",
    businessDate: data.business_date ?? null,
    checkOutTime: normalizeClock(String(data.check_out_time ?? "")) || null,
    lateCheckout: parseLateCheckoutPolicy(data),
  };
}

async function loadDepartureRooms(
  supabase: WorkspaceClient,
  restaurantId: string,
  stays: FrontOfficeStay[],
): Promise<Map<string, FoDepartureRoomState>> {
  const ids = [...new Set(stays.map((stay) => stay.roomId).filter((id): id is string => Boolean(id)))];
  const byId = new Map<string, FoDepartureRoomState>();
  if (ids.length === 0) return byId;
  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("id, status, housekeeping_status, maintenance_status, floor")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{
    id: string;
    status: string | null;
    housekeeping_status: string | null;
    maintenance_status: string | null;
    floor: string | null;
  }>) {
    byId.set(row.id, {
      operationalStatus: row.status,
      housekeepingStatus: row.housekeeping_status,
      maintenanceStatus: row.maintenance_status,
      floor: row.floor,
    });
  }
  return byId;
}

function mapDeskRow(params: {
  stay: FrontOfficeStay;
  room: FoDepartureRoomState | undefined;
  settings: FoDeparturePropertySettings;
  businessDate: string;
  folioLane: FolioSignalLane;
  signal: StayMoneySignal | undefined;
  staffRole: string;
}): FoDepartureDeskRow {
  const assigned = params.stay.roomId !== null;
  const financial = financialFromSignal(params.folioLane, params.signal);
  const datesValid = Boolean(
    params.stay.arrivalDate && params.stay.departureDate && params.stay.arrivalDate < params.stay.departureDate,
  );
  const exceptionKeys = foDepartureExceptionKeys({
    status: params.stay.status,
    roomId: params.stay.roomId,
    operationalStatus: params.room?.operationalStatus,
    maintenanceStatus: params.room?.maintenanceStatus,
    overstay: params.stay.overstay,
    folioLane: params.folioLane,
    folioId: financial.folioId,
    balance: financial.balance,
    specialRequests: params.stay.specialRequests,
    lateCheckoutGranted: params.stay.lateCheckoutGranted === true,
    lateCheckoutUntil: params.stay.lateCheckoutUntil ?? null,
    lateCheckoutPolicy: params.settings.lateCheckout,
    arrivalDate: params.stay.arrivalDate,
    departureDate: params.stay.departureDate,
  });
  const blocking = foDepartureBlockingKeys(exceptionKeys);
  const hints = foDepartureActionHints({
    status: params.stay.status,
    assigned,
    folioId: financial.folioId,
    folioLane: params.folioLane,
    balance: financial.balance,
    guestId: params.stay.guestId,
    blockingKeys: blocking,
    datesValid,
    lateCheckoutNeedsApproval: params.settings.lateCheckout.needsApproval,
    staffRole: params.staffRole,
  });
  return {
    stay: params.stay,
    assigned,
    floor: params.room?.floor ?? null,
    housekeepingStatus: params.room?.housekeepingStatus ?? null,
    operationalStatus: params.room?.operationalStatus ?? null,
    financialLane: params.folioLane,
    folioId: financial.folioId,
    folioNumber: params.signal?.folioNumber ?? null,
    balance: financial.balance,
    timing: foDepartureTiming({
      departureDate: params.stay.departureDate,
      businessDate: params.businessDate,
      overstay: params.stay.overstay,
      lateCheckoutGranted: params.stay.lateCheckoutGranted === true,
    }),
    exceptionKeys,
    hints,
    readiness: foCheckoutReadiness({
      status: params.stay.status,
      assigned,
      folioId: financial.folioId,
      folioLane: params.folioLane,
      balance: financial.balance,
      blockingKeys: blocking,
      datesValid,
    }),
  };
}

export const listFrontOfficeDeparturesDesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, date: dateSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ date: string; rows: FoDepartureDeskRow[] }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadDepartureSettings(supabaseAdmin, data.restaurantId);
    const today = data.date
      ? assertDateOnly(data.date, "Business date")
      : resolvePropertyBusinessDate(settings.businessDate, settings.timezone);
    const stays = (await loadFrontOfficeDepartures(context.supabase, { restaurantId: data.restaurantId, date: today })).filter(
      (stay) => stay.status === "checked_in",
    );
    const [rooms, signals] = await Promise.all([
      loadDepartureRooms(context.supabase, data.restaurantId, stays),
      loadFoStaySignals({
        context: context as never,
        restaurantId: data.restaurantId,
        reservationIds: stays.map((stay) => stay.id),
      }),
    ]);
    return {
      date: today,
      rows: stays.map((stay) =>
        mapDeskRow({
          stay,
          room: stay.roomId ? rooms.get(stay.roomId) : undefined,
          settings,
          businessDate: today,
          folioLane: signals.folioLane,
          signal: signals.byStay[stay.id],
          staffRole: me.role,
        }),
      ),
    };
  });

export const getFrontOfficeDepartureQuickView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FoDepartureQuickView> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadDepartureSettings(supabaseAdmin, data.restaurantId);
    const today = resolvePropertyBusinessDate(settings.businessDate, settings.timezone);
    const stay = await loadFrontOfficeStay(context.supabase, {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      today,
    });
    if (!stay) throw new Error("Reservation not found for this property.");

    const [{ data: guestRow }, { data: roomRow }, signals, { data: historyRows }] = await Promise.all([
      supabaseAdmin
        .from("guest_profiles")
        .select("first_name, last_name, phone, email, vip_status")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", stay.guestId)
        .maybeSingle(),
      stay.roomId
        ? supabaseAdmin
            .from("hotel_rooms")
            .select("id, room_number, status, housekeeping_status, maintenance_status, floor")
            .eq("restaurant_id", data.restaurantId)
            .eq("id", stay.roomId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      loadFoStaySignals({
        context: context as never,
        restaurantId: data.restaurantId,
        reservationIds: [stay.id],
      }),
      context.supabase
        .from("hotel_reservation_history")
        .select("event_type, notes, created_at")
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", stay.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const guest = {
      fullName:
        [guestRow?.first_name, guestRow?.last_name].filter(Boolean).join(" ").trim() || stay.guestName,
      phone: (guestRow?.phone as string | null) ?? stay.guestPhone,
      email: (guestRow?.email as string | null) ?? stay.guestEmail,
      vip: guestRow?.vip_status === true || stay.guestVip,
    };

    const roomState: FoDepartureRoomState | undefined = roomRow
      ? {
          operationalStatus: roomRow.status as string | null,
          housekeepingStatus: roomRow.housekeeping_status as string | null,
          maintenanceStatus: (roomRow.maintenance_status as string | null) ?? null,
          floor: (roomRow.floor as string | null) ?? null,
        }
      : undefined;
    const signal = signals.byStay[stay.id];
    const financial = financialFromSignal(signals.folioLane, signal);
    const datesValid = Boolean(stay.arrivalDate && stay.departureDate && stay.arrivalDate < stay.departureDate);
    const exceptionKeys = foDepartureExceptionKeys({
      status: stay.status,
      roomId: stay.roomId,
      operationalStatus: roomState?.operationalStatus,
      maintenanceStatus: roomState?.maintenanceStatus,
      overstay: stay.overstay,
      folioLane: signals.folioLane,
      folioId: financial.folioId,
      balance: financial.balance,
      specialRequests: stay.specialRequests,
      lateCheckoutGranted: stay.lateCheckoutGranted === true,
      lateCheckoutUntil: stay.lateCheckoutUntil ?? null,
      lateCheckoutPolicy: settings.lateCheckout,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
    });
    const blocking = foDepartureBlockingKeys(exceptionKeys);
    const assigned = stay.roomId !== null;
    const hints = foDepartureActionHints({
      status: stay.status,
      assigned,
      folioId: financial.folioId,
      folioLane: signals.folioLane,
      balance: financial.balance,
      guestId: stay.guestId,
      blockingKeys: blocking,
      datesValid,
      lateCheckoutNeedsApproval: settings.lateCheckout.needsApproval,
      staffRole: me.role,
    });
    const readiness = foCheckoutReadiness({
      status: stay.status,
      assigned,
      folioId: financial.folioId,
      folioLane: signals.folioLane,
      balance: financial.balance,
      blockingKeys: blocking,
      datesValid,
    });

    let folioStatus: string | null = null;
    if (financial.folioId) {
      const { data: folioRow } = await supabaseAdmin
        .from("guest_folios")
        .select("status")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", financial.folioId)
        .maybeSingle();
      folioStatus = (folioRow?.status as string | null) ?? null;
    }

    return {
      stay,
      guest,
      room: {
        id: stay.roomId,
        roomNumber: stay.roomNumber,
        floor: roomState?.floor ?? null,
        status: roomState?.operationalStatus ?? null,
        housekeepingStatus: roomState?.housekeepingStatus ?? null,
        maintenanceStatus: roomState?.maintenanceStatus ?? null,
        assigned,
      },
      financial: {
        lane: signals.folioLane,
        folioId: financial.folioId,
        folioNumber: signal?.folioNumber ?? null,
        balance: financial.balance,
        status: folioStatus,
        needsSettlement: readiness.needsSettlement,
      },
      lateCheckout: {
        granted: stay.lateCheckoutGranted === true,
        until: stay.lateCheckoutUntil ?? null,
        note: stay.lateCheckoutNote ?? null,
        policy: settings.lateCheckout,
      },
      timing: foDepartureTiming({
        departureDate: stay.departureDate,
        businessDate: today,
        overstay: stay.overstay,
        lateCheckoutGranted: stay.lateCheckoutGranted === true,
      }),
      exceptions: exceptionKeys.map((key) => ({
        key,
        label: FO_DEPARTURE_EXCEPTION_LABELS[key],
        blocking: blocking.includes(key),
      })),
      hints,
      readiness,
      history: ((historyRows ?? []) as Array<{ event_type: string; notes: string | null; created_at: string }>).map(
        (row) => ({
          eventType: row.event_type,
          notes: row.notes,
          createdAt: row.created_at,
        }),
      ),
      businessDate: today,
      settings,
    };
  });
