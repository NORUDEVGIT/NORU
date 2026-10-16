/**
 * FO Phase 3 — In-House desk and Quick View read models.
 * Aggregates existing reservation, guest, room, HK, folio, late checkout, and history.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFoStaySignals } from "./fo-exceptions.functions";
import type { FolioSignalLane, StayMoneySignal } from "./fo-exceptions";
import {
  loadFrontOfficeInHouse,
  loadFrontOfficeStay,
  type FrontOfficeStay,
} from "./frontoffice.functions";
import { normalizeClock } from "./pms-set1-foundation";
import { assertDateOnly, requireReservationManager } from "./reservations.server";
import { resolvePropertyBusinessDate } from "./reservation-workspace/business-date";
import { financialFromSignal, parseLateCheckoutPolicy } from "./reservation-workspace/arrivals-departures";
import type { LateCheckoutPolicy } from "./reservation-workspace/shared-read-models";
import {
  FO_INHOUSE_EXCEPTION_LABELS,
  foInHouseActionHints,
  foInHouseBlockingKeys,
  foInHouseExceptionKeys,
  type FoInHouseActionHints,
  type FoInHouseExceptionKey,
  type FoInHouseHistoryItem,
} from "./fo-inhouse";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

export type FoInHousePropertySettings = {
  timezone: string;
  checkOutTime: string | null;
  lateCheckout: LateCheckoutPolicy;
};

export type FoInHouseRoomState = {
  operationalStatus: string | null;
  housekeepingStatus: string | null;
  maintenanceStatus: string | null;
  floor: string | null;
};

export type FoInHouseDeskRow = {
  stay: FrontOfficeStay;
  assigned: boolean;
  floor: string | null;
  housekeepingStatus: string | null;
  operationalStatus: string | null;
  financialLane: FolioSignalLane;
  folioId: string | null;
  folioNumber: string | null;
  balance: number | null;
  departingToday: boolean;
  exceptionKeys: FoInHouseExceptionKey[];
  hints: FoInHouseActionHints;
};

export type FoInHouseExceptionItem = {
  key: FoInHouseExceptionKey;
  label: string;
  blocking: boolean;
};

export type FoInHouseQuickView = {
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
    open: boolean | null;
  };
  lateCheckout: {
    granted: boolean;
    until: string | null;
    note: string | null;
    policy: LateCheckoutPolicy;
  };
  exceptions: FoInHouseExceptionItem[];
  hints: FoInHouseActionHints;
  history: FoInHouseHistoryItem[];
  businessDate: string;
  settings: FoInHousePropertySettings;
};

async function loadInHouseSettings(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
): Promise<FoInHousePropertySettings & { businessDate: string | null }> {
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

async function loadInHouseRooms(
  supabase: WorkspaceClient,
  restaurantId: string,
  stays: FrontOfficeStay[],
): Promise<Map<string, FoInHouseRoomState>> {
  const ids = [...new Set(stays.map((stay) => stay.roomId).filter((id): id is string => Boolean(id)))];
  const byId = new Map<string, FoInHouseRoomState>();
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
  room: FoInHouseRoomState | undefined;
  settings: FoInHousePropertySettings;
  businessDate: string;
  folioLane: FolioSignalLane;
  signal: StayMoneySignal | undefined;
  staffRole: string;
}): FoInHouseDeskRow {
  const assigned = params.stay.roomId !== null;
  const financial = financialFromSignal(params.folioLane, params.signal);
  const exceptionKeys = foInHouseExceptionKeys({
    status: params.stay.status,
    roomId: params.stay.roomId,
    operationalStatus: params.room?.operationalStatus,
    maintenanceStatus: params.room?.maintenanceStatus,
    overstay: params.stay.overstay,
    folioLane: params.folioLane,
    balance: financial.balance,
    specialRequests: params.stay.specialRequests,
    lateCheckoutGranted: params.stay.lateCheckoutGranted === true,
    lateCheckoutUntil: params.stay.lateCheckoutUntil ?? null,
    lateCheckoutPolicy: params.settings.lateCheckout,
    arrivalDate: params.stay.arrivalDate,
    departureDate: params.stay.departureDate,
  });
  const blocking = foInHouseBlockingKeys(exceptionKeys);
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
    departingToday: params.stay.departureDate === params.businessDate,
    exceptionKeys,
    hints: foInHouseActionHints({
      status: params.stay.status,
      assigned,
      folioId: financial.folioId,
      guestId: params.stay.guestId,
      blockingKeys: blocking,
      lateCheckoutNeedsApproval: params.settings.lateCheckout.needsApproval,
      staffRole: params.staffRole,
    }),
  };
}

export const listFrontOfficeInHouseDesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, today: dateSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ date: string; rows: FoInHouseDeskRow[] }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadInHouseSettings(supabaseAdmin, data.restaurantId);
    const today = data.today
      ? assertDateOnly(data.today, "Business date")
      : resolvePropertyBusinessDate(settings.businessDate, settings.timezone);
    const stays = await loadFrontOfficeInHouse(context.supabase, {
      restaurantId: data.restaurantId,
      today,
    });
    const [rooms, signals] = await Promise.all([
      loadInHouseRooms(context.supabase, data.restaurantId, stays),
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

export const getFrontOfficeInHouseQuickView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FoInHouseQuickView> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadInHouseSettings(supabaseAdmin, data.restaurantId);
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

    const roomState: FoInHouseRoomState | undefined = roomRow
      ? {
          operationalStatus: roomRow.status as string | null,
          housekeepingStatus: roomRow.housekeeping_status as string | null,
          maintenanceStatus: (roomRow.maintenance_status as string | null) ?? null,
          floor: (roomRow.floor as string | null) ?? null,
        }
      : undefined;
    const signal = signals.byStay[stay.id];
    const financial = financialFromSignal(signals.folioLane, signal);
    const exceptionKeys = foInHouseExceptionKeys({
      status: stay.status,
      roomId: stay.roomId,
      operationalStatus: roomState?.operationalStatus,
      maintenanceStatus: roomState?.maintenanceStatus,
      overstay: stay.overstay,
      folioLane: signals.folioLane,
      balance: financial.balance,
      specialRequests: stay.specialRequests,
      lateCheckoutGranted: stay.lateCheckoutGranted === true,
      lateCheckoutUntil: stay.lateCheckoutUntil ?? null,
      lateCheckoutPolicy: settings.lateCheckout,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
    });
    const blocking = foInHouseBlockingKeys(exceptionKeys);
    const assigned = stay.roomId !== null;
    const hints = foInHouseActionHints({
      status: stay.status,
      assigned,
      folioId: financial.folioId,
      guestId: stay.guestId,
      blockingKeys: blocking,
      lateCheckoutNeedsApproval: settings.lateCheckout.needsApproval,
      staffRole: me.role,
    });

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
        open: financial.folioId != null ? true : null,
      },
      lateCheckout: {
        granted: stay.lateCheckoutGranted === true,
        until: stay.lateCheckoutUntil ?? null,
        note: stay.lateCheckoutNote ?? null,
        policy: settings.lateCheckout,
      },
      exceptions: exceptionKeys.map((key) => ({
        key,
        label: FO_INHOUSE_EXCEPTION_LABELS[key],
        blocking: blocking.includes(key),
      })),
      hints,
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
