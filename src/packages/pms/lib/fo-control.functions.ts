/**
 * FO Phase 7 — Exceptions aggregator.
 * Combines existing arrival / in-house / departure / room-ops / GS signals.
 * No exception table and no resolve writer.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPermissionDeniedMessage } from "./front-office-shell";
import { isMissingSchemaError } from "./pms-set2-structure";
import { assertDateOnly, requireReservationManager } from "./reservations.server";
import { requireGuestManager } from "./guests.server";
import { resolvePropertyBusinessDate } from "./reservation-workspace/business-date";
import { loadFrontOfficeArrivals, loadFrontOfficeDepartures, loadFrontOfficeInHouse, type FrontOfficeStay } from "./frontoffice.functions";
import { loadFoStaySignals } from "./fo-exceptions.functions";
import { loadFrontOfficeRoomOpsQueue } from "./front-office-room-operations.server";
import { loadGuestProfileRules } from "./pms-set3-rates-guest.functions";
import { financialFromSignal, outstandingBalance, parseLateCheckoutPolicy } from "./reservation-workspace/arrivals-departures";
import { normalizeClock } from "./pms-set1-foundation";
import { foArrivalExceptionKeys, guestVerificationMissing, etaTiming, depositOkFromSignals } from "./fo-arrival";
import { foInHouseExceptionKeys } from "./fo-inhouse";
import { foDepartureExceptionKeys } from "./fo-departure";
import { foGuestServiceSignals, isActiveGuestServiceStatus } from "./fo-guest-services";
import { isGuestServiceStatus, type GuestServicePriority } from "./guest-services-workspace";
import {
  buildFrontOfficeExceptionList,
  type FoControlStayContext,
  type FrontOfficeExceptionItem,
} from "./fo-control";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type FoControlSourceLane = "live" | "unavailable" | "permission_denied";

export type FoControlPartialSource = {
  source: "arrivals" | "in_house" | "departures" | "rooms" | "guest_services" | "folio";
  lane: FoControlSourceLane;
  message: string;
};

export type FoControlSnapshot = {
  available: boolean;
  permissionDenied: boolean;
  businessDate: string;
  items: FrontOfficeExceptionItem[];
  stays: FrontOfficeStay[];
  partialSources: FoControlPartialSource[];
  openDiscrepancyRoomIds: string[];
};

function stayContext(stay: FrontOfficeStay): FoControlStayContext {
  return {
    id: stay.id,
    guestId: stay.guestId,
    guestName: stay.guestName,
    confirmationNumber: stay.confirmationNumber,
    roomId: stay.roomId,
    roomNumber: stay.roomNumber,
    status: stay.status,
  };
}

type RoomState = {
  operationalStatus: string | null;
  housekeepingStatus: string | null;
  maintenanceStatus: string | null;
};

async function loadRooms(
  supabase: { from: (table: string) => any },
  restaurantId: string,
  stays: FrontOfficeStay[],
): Promise<Map<string, RoomState>> {
  const ids = [...new Set(stays.map((stay) => stay.roomId).filter((id): id is string => Boolean(id)))];
  const byId = new Map<string, RoomState>();
  if (ids.length === 0) return byId;
  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("id, status, housekeeping_status, maintenance_status")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{
    id: string;
    status: string | null;
    housekeeping_status: string | null;
    maintenance_status: string | null;
  }>) {
    byId.set(row.id, {
      operationalStatus: row.status,
      housekeepingStatus: row.housekeeping_status,
      maintenanceStatus: row.maintenance_status,
    });
  }
  return byId;
}

export const getFrontOfficeExceptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, businessDate: dateSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FoControlSnapshot> => {
    let membership;
    try {
      membership = await requireReservationManager(context as never, data.restaurantId);
    } catch (error) {
      if (isPermissionDeniedMessage(error)) {
        return {
          available: false,
          permissionDenied: true,
          businessDate: data.businessDate ?? "",
          items: [],
          stays: [],
          partialSources: [],
          openDiscrepancyRoomIds: [],
        };
      }
      throw error;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: property, error: propertyError } = await supabaseAdmin
      .from("restaurants")
      .select(
        "timezone, business_date, check_in_time, check_out_time, deposit_required, deposit_value, late_checkout_allowed, late_checkout_fee, late_checkout_needs_approval",
      )
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    if (!property) throw new Error("Property not found.");
    const timezone = property.timezone || "UTC";
    const businessDate = data.businessDate
      ? assertDateOnly(data.businessDate, "Business date")
      : resolvePropertyBusinessDate(property.business_date, timezone);
    const lateCheckout = parseLateCheckoutPolicy(property);
    const partialSources: FoControlPartialSource[] = [];

    let arrivals: FrontOfficeStay[] = [];
    let inHouse: FrontOfficeStay[] = [];
    let departures: FrontOfficeStay[] = [];
    try {
      [arrivals, inHouse, departures] = await Promise.all([
        loadFrontOfficeArrivals(context.supabase, { restaurantId: data.restaurantId, date: businessDate }),
        loadFrontOfficeInHouse(context.supabase, { restaurantId: data.restaurantId, today: businessDate }),
        loadFrontOfficeDepartures(context.supabase, { restaurantId: data.restaurantId, date: businessDate }).then((rows) =>
          rows.filter((stay) => stay.status === "checked_in"),
        ),
      ]);
    } catch (error) {
      if (isPermissionDeniedMessage(error)) {
        return {
          available: false,
          permissionDenied: true,
          businessDate,
          items: [],
          stays: [],
          partialSources: [],
          openDiscrepancyRoomIds: [],
        };
      }
      throw error;
    }

    const stays = [...arrivals, ...inHouse, ...departures].filter(
      (stay, index, list) => list.findIndex((row) => row.id === stay.id) === index,
    );

    let rooms = new Map<string, RoomState>();
    try {
      rooms = await loadRooms(context.supabase, data.restaurantId, stays);
    } catch (error) {
      partialSources.push({
        source: "rooms",
        lane: "unavailable",
        message: error instanceof Error ? error.message : "Room inventory could not be read.",
      });
    }

    const signals = await loadFoStaySignals({
      context: context as never,
      restaurantId: data.restaurantId,
      reservationIds: stays.map((stay) => stay.id),
    });
    if (signals.folioLane === "permission_denied") {
      partialSources.push({
        source: "folio",
        lane: "permission_denied",
        message: "Payment issues are hidden — folio access is denied.",
      });
    } else if (signals.folioLane === "coming_soon") {
      partialSources.push({
        source: "folio",
        lane: "unavailable",
        message: "Folio signals are unavailable.",
      });
    }

    const guestRules = await loadGuestProfileRules(supabaseAdmin, data.restaurantId).catch(() => null);

    const arrivalRows = arrivals.map((stay) => {
      const room = stay.roomId ? rooms.get(stay.roomId) : undefined;
      const financial = financialFromSignal(signals.folioLane, signals.byStay[stay.id]);
      const missing = guestVerificationMissing({
        rules: guestRules,
        firstName: stay.guestName.split(/\s+/)[0],
        lastName: stay.guestName.split(/\s+/).slice(1).join(" ") || null,
        phone: stay.guestPhone,
        email: stay.guestEmail,
      });
      const depositOk = depositOkFromSignals({
        postedAmount: signals.byStay[stay.id]?.depositPosted ?? 0,
        waived: signals.byStay[stay.id]?.depositWaived === true,
        requiredAmount: property.deposit_required && property.deposit_value ? Number(property.deposit_value) : null,
      });
      const keys = foArrivalExceptionKeys({
        status: stay.status,
        roomId: stay.roomId,
        room,
        financialState: financial.state,
        depositUnpaid: !depositOk && signals.folioLane === "live",
        outstandingBalance: outstandingBalance(signals.byStay[stay.id]),
        specialRequests: stay.specialRequests,
        missingGuestFields: missing,
        registrationOk: false,
        etaTiming: etaTiming({
          expectedArrivalAt: stay.expectedArrivalAt ?? null,
          checkInTime: normalizeClock(String(property.check_in_time ?? "")) || null,
          timezone,
        }),
      });
      return { stay: stayContext(stay), keys };
    });

    const inHouseRows = inHouse.map((stay) => {
      const room = stay.roomId ? rooms.get(stay.roomId) : undefined;
      const financial = financialFromSignal(signals.folioLane, signals.byStay[stay.id]);
      const keys = foInHouseExceptionKeys({
        status: stay.status,
        roomId: stay.roomId,
        operationalStatus: room?.operationalStatus,
        maintenanceStatus: room?.maintenanceStatus,
        overstay: stay.overstay,
        folioLane: signals.folioLane,
        balance: financial.balance,
        specialRequests: stay.specialRequests,
        lateCheckoutGranted: stay.lateCheckoutGranted === true,
        lateCheckoutUntil: stay.lateCheckoutUntil ?? null,
        lateCheckoutPolicy: lateCheckout,
        arrivalDate: stay.arrivalDate,
        departureDate: stay.departureDate,
      });
      return { stay: stayContext(stay), keys };
    });

    const departureRows = departures.map((stay) => {
      const room = stay.roomId ? rooms.get(stay.roomId) : undefined;
      const financial = financialFromSignal(signals.folioLane, signals.byStay[stay.id]);
      const keys = foDepartureExceptionKeys({
        status: stay.status,
        roomId: stay.roomId,
        operationalStatus: room?.operationalStatus,
        maintenanceStatus: room?.maintenanceStatus,
        overstay: stay.overstay,
        folioLane: signals.folioLane,
        folioId: financial.folioId,
        balance: financial.balance,
        specialRequests: stay.specialRequests,
        lateCheckoutGranted: stay.lateCheckoutGranted === true,
        lateCheckoutUntil: stay.lateCheckoutUntil ?? null,
        lateCheckoutPolicy: lateCheckout,
        arrivalDate: stay.arrivalDate,
        departureDate: stay.departureDate,
      });
      return { stay: stayContext(stay), keys };
    });

    let roomOps: Awaited<ReturnType<typeof loadFrontOfficeRoomOpsQueue>> = [];
    try {
      roomOps = await loadFrontOfficeRoomOpsQueue({
        supabase: context.supabase,
        context: context as never,
        membership,
        restaurantId: data.restaurantId,
        businessDate,
      });
    } catch (error) {
      partialSources.push({
        source: "rooms",
        lane: isPermissionDeniedMessage(error) ? "permission_denied" : "unavailable",
        message: "Room operations signals could not be read.",
      });
    }

    const guestServices: Array<{ stay: FoControlStayContext; signals: ReturnType<typeof foGuestServiceSignals> }> = [];
    try {
      await requireGuestManager(context as never, data.restaurantId);
      const ids = stays.map((stay) => stay.id);
      if (ids.length > 0) {
        const result = await context.supabase
          .from("guest_service_history")
          .select("id, reservation_id, status, priority, preferred_at")
          .eq("restaurant_id", data.restaurantId)
          .in("reservation_id", ids)
          .limit(400);
        if (result.error && isMissingSchemaError(result.error)) {
          partialSources.push({
            source: "guest_services",
            lane: "unavailable",
            message: "Guest Services is unavailable until its workspace is configured.",
          });
        } else if (result.error) {
          throw new Error(result.error.message);
        } else {
          const nowMs = Date.now();
          const byStay = new Map<string, Array<{ status: string; priority: GuestServicePriority; preferredAt: string | null }>>();
          for (const row of (result.data ?? []) as Array<{
            reservation_id: string | null;
            status: string;
            priority: string | null;
            preferred_at: string | null;
          }>) {
            if (!row.reservation_id || !isGuestServiceStatus(row.status)) continue;
            if (!isActiveGuestServiceStatus(row.status)) continue;
            const list = byStay.get(row.reservation_id) ?? [];
            list.push({
              status: row.status,
              priority: row.priority === "urgent" || row.priority === "high" ? row.priority : "normal",
              preferredAt: row.preferred_at,
            });
            byStay.set(row.reservation_id, list);
          }
          for (const stay of stays) {
            const items = byStay.get(stay.id);
            if (!items?.length) continue;
            guestServices.push({ stay: stayContext(stay), signals: foGuestServiceSignals(items, nowMs) });
          }
        }
      }
    } catch (error) {
      partialSources.push({
        source: "guest_services",
        lane: isPermissionDeniedMessage(error) ? "permission_denied" : "unavailable",
        message: isPermissionDeniedMessage(error)
          ? "Guest Services exceptions are hidden — access is denied."
          : "Guest Services signals could not be read.",
      });
    }

    const items = buildFrontOfficeExceptionList({
      businessDate,
      arrivals: arrivalRows,
      inHouse: inHouseRows,
      departures: departureRows,
      guestServices,
      roomOps,
    });

    return {
      available: true,
      permissionDenied: false,
      businessDate,
      items,
      stays,
      partialSources,
      openDiscrepancyRoomIds: items.filter((row) => row.key === "room_discrepancy" && row.roomId).map((row) => row.roomId as string),
    };
  });
