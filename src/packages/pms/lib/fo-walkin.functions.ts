/**
 * FO Phase 5 — Walk-in desk and Quick View. Aggregates existing reservations
 * with source=walk_in. No walk-in table.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFoStaySignals } from "./fo-exceptions.functions";
import type { FolioSignalLane } from "./fo-exceptions";
import { isRoomReady, type RegistrationDraft } from "./fo-check-in";
import { loadCard2HousekeepingSnapshot } from "./housekeeping-card2.functions";
import { loadFrontOfficeStay, type FrontOfficeStay } from "./frontoffice.functions";
import { loadGuestProfileRules } from "./pms-set3-rates-guest.functions";
import type { GuestProfileRules } from "./pms-set3-rates-guest";
import { nightsBetween } from "./reservation-dates";
import { assertDateOnly, requireReservationManager } from "./reservations.server";
import { resolvePropertyBusinessDate } from "./reservation-workspace/business-date";
import { financialFromSignal, type RoomInventoryState } from "./reservation-workspace/arrivals-departures";
import { normalizeClock } from "./pms-set1-foundation";
import {
  depositOkFromSignals,
  foArrivalActionHints,
  foArrivalBlockingKeys,
  foCheckInReadiness,
  guestVerificationMissing,
  registrationOkFromProgress,
  roomEligibleStatus,
  type FoArrivalActionHints,
  type FoCheckInReadiness,
} from "./fo-arrival";
import {
  FO_WALKIN_EXCEPTION_LABELS,
  foWalkInExceptionKeys,
  isOperationalWalkIn,
  type FoWalkInExceptionKey,
} from "./fo-walkin";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

export type FoWalkInDeskRow = {
  stay: FrontOfficeStay;
  createdAt: string;
  assigned: boolean;
  roomReady: boolean;
  housekeepingStatus: string | null;
  financialLane: FolioSignalLane;
  ratePlanName: string | null;
  roomSubtotal: number | null;
  nightlyRate: number | null;
  walkInIncomplete: boolean;
  exceptionKeys: FoWalkInExceptionKey[];
  hints: FoArrivalActionHints;
  readiness: FoCheckInReadiness;
};

export type FoWalkInExceptionItem = {
  key: FoWalkInExceptionKey;
  label: string;
  blocking: boolean;
};

export type FoWalkInQuickView = {
  stay: FrontOfficeStay;
  createdAt: string | null;
  guest: {
    fullName: string;
    phone: string | null;
    email: string | null;
    vip: boolean;
  };
  room: {
    id: string | null;
    roomNumber: string | null;
    status: string | null;
    housekeepingStatus: string | null;
    assigned: boolean;
    eligible: boolean;
    ready: boolean;
    readyReason: string | null;
  };
  pricing: {
    ratePlanName: string | null;
    roomSubtotal: number | null;
    nightlyRate: number | null;
    nights: number;
  };
  financial: {
    lane: FolioSignalLane;
    folioId: string | null;
    folioNumber: string | null;
    depositRequired: boolean | null;
    depositRequiredAmount: number | null;
    depositPosted: number;
    depositWaived: boolean;
    outstanding: boolean;
  };
  registration: { complete: boolean; waived: boolean };
  verification: { complete: boolean; missing: string[] };
  exceptions: FoWalkInExceptionItem[];
  hints: FoArrivalActionHints;
  readiness: FoCheckInReadiness;
  walkInIncomplete: boolean;
  guestRules: GuestProfileRules | null;
};

async function loadWalkInSettings(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select("timezone, business_date, check_in_time, deposit_required, deposit_type, deposit_value")
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Property not found.");
  const depositRaw = data.deposit_value;
  return {
    timezone: data.timezone || "UTC",
    businessDate: data.business_date ?? null,
    checkInTime: normalizeClock(String(data.check_in_time ?? "")) || null,
    depositRequired: data.deposit_required ?? null,
    depositType: data.deposit_type ?? null,
    depositValue:
      depositRaw == null || depositRaw === "" || Number.isNaN(Number(depositRaw)) ? null : Number(depositRaw),
  };
}

async function loadRooms(
  supabase: WorkspaceClient,
  restaurantId: string,
  stays: FrontOfficeStay[],
): Promise<Map<string, RoomInventoryState & { maintenanceStatus: string | null }>> {
  const ids = [...new Set(stays.map((stay) => stay.roomId).filter((id): id is string => Boolean(id)))];
  const byId = new Map<string, RoomInventoryState & { maintenanceStatus: string | null }>();
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

function mapStay(row: {
  id: string;
  confirmation_number: string;
  guest_id: string;
  room_type_id: string;
  room_id: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number;
  children: number;
  status: string;
  special_requests: string | null;
  source: string | null;
  guest_profiles: {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    vip_status: boolean;
  } | null;
  room_types: { name: string; code?: string | null } | null;
  hotel_rooms: { room_number: string } | null;
}, today: string, walkInIncomplete: boolean): FrontOfficeStay {
  const guest = row.guest_profiles;
  return {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName: [guest?.first_name, guest?.last_name].filter(Boolean).join(" ").trim() || "Guest",
    guestVip: guest?.vip_status ?? false,
    guestPhone: guest?.phone ?? null,
    guestEmail: guest?.email ?? null,
    roomTypeId: row.room_type_id,
    roomTypeName: row.room_types?.name ?? "Room type",
    roomTypeCode: row.room_types?.code ?? null,
    roomId: row.room_id,
    roomNumber: row.hotel_rooms?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    adults: row.adults,
    children: row.children,
    status: row.status as FrontOfficeStay["status"],
    specialRequests: row.special_requests,
    source: row.source,
    overstay: false,
    walkInIncomplete,
  };
}

export const listFrontOfficeWalkInsDesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, date: dateSchema.optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ date: string; rows: FoWalkInDeskRow[] }> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadWalkInSettings(supabaseAdmin, data.restaurantId);
    const today = data.date
      ? assertDateOnly(data.date, "Business date")
      : resolvePropertyBusinessDate(settings.businessDate, settings.timezone);

    const { data: rows, error } = await context.supabase
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, adults, children, status, special_requests, source, created_at, rate_plan_id, room_subtotal, nightly_rate_snapshot, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ), room_types!hotel_reservations_type_same_property ( name, code ), hotel_rooms!hotel_reservations_room_same_type ( room_number ), rate_plan:hotel_rate_plans!hotel_reservations_rate_plan_same_property ( name )",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("source", "walk_in")
      .in("status", ["pending", "confirmed", "checked_in"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const raw = (rows ?? []) as Array<{
      id: string;
      confirmation_number: string;
      guest_id: string;
      room_type_id: string;
      room_id: string | null;
      arrival_date: string;
      departure_date: string;
      adults: number;
      children: number;
      status: string;
      special_requests: string | null;
      source: string | null;
      created_at: string;
      room_subtotal: number | string | null;
      nightly_rate_snapshot: unknown;
      guest_profiles: {
        first_name: string;
        last_name: string | null;
        phone: string | null;
        email: string | null;
        vip_status: boolean;
      } | null;
      room_types: { name: string; code?: string | null } | null;
      hotel_rooms: { room_number: string } | null;
      rate_plan: { name: string } | null;
    }>;

    const { data: progressRows } = await supabaseAdmin
      .from("fo_checkin_progress")
      .select("reservation_id, walk_in_incomplete, registration_snapshot, registration_waived, deposit_amount, deposit_waived")
      .eq("restaurant_id", data.restaurantId)
      .in(
        "reservation_id",
        raw.map((row) => row.id),
      );

    const progressById = new Map(
      ((progressRows ?? []) as Array<{
        reservation_id: string;
        walk_in_incomplete: boolean;
        registration_snapshot: RegistrationDraft | null;
        registration_waived: boolean | null;
        deposit_amount: number | string | null;
        deposit_waived: boolean | null;
      }>).map((row) => [row.reservation_id, row]),
    );

    const stays = raw
      .filter((row) =>
        isOperationalWalkIn({
          source: row.source,
          status: row.status as FrontOfficeStay["status"],
          arrivalDate: row.arrival_date,
          businessDate: today,
        }),
      )
      .map((row) => ({
        row,
        stay: mapStay(row, today, progressById.get(row.id)?.walk_in_incomplete === true),
      }));

    const [rooms, signals, hk, guestRules] = await Promise.all([
      loadRooms(
        context.supabase,
        data.restaurantId,
        stays.map((item) => item.stay),
      ),
      loadFoStaySignals({
        context: context as never,
        restaurantId: data.restaurantId,
        reservationIds: stays.map((item) => item.stay.id),
      }),
      loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId),
      loadGuestProfileRules(supabaseAdmin, data.restaurantId),
    ]);

    return {
      date: today,
      rows: stays.map(({ row, stay }) => {
        const assigned = stay.roomId !== null;
        const room = stay.roomId ? rooms.get(stay.roomId) : undefined;
        const ready = assigned
          ? isRoomReady(
              {
                status: room?.operationalStatus ?? null,
                housekeepingStatus: room?.housekeepingStatus ?? null,
                maintenanceStatus: room?.maintenanceStatus ?? null,
              },
              hk.settings,
            ).ready
          : false;
        const eligible = roomEligibleStatus(room?.operationalStatus);
        const financial = financialFromSignal(signals.folioLane, signals.byStay[stay.id]);
        const progress = progressById.get(stay.id);
        const registrationOk = registrationOkFromProgress({
          snapshot: progress?.registration_snapshot ?? null,
          waived: progress?.registration_waived === true,
          guest: {
            fullName: stay.guestName,
            phone: stay.guestPhone,
            email: stay.guestEmail,
            idDocumentType: null,
            idDocumentNumber: null,
          },
        });
        const missing = guestVerificationMissing({
          rules: guestRules,
          firstName: stay.guestName.split(/\s+/)[0],
          lastName: stay.guestName.split(/\s+/).slice(1).join(" ") || null,
          phone: stay.guestPhone,
          email: stay.guestEmail,
        });
        const depositOk = depositOkFromSignals({
          postedAmount: Number(progress?.deposit_amount ?? signals.byStay[stay.id]?.depositPosted ?? 0),
          waived: progress?.deposit_waived === true || signals.byStay[stay.id]?.depositWaived === true,
          requiredAmount: settings.depositRequired && settings.depositValue ? settings.depositValue : null,
        });
        const snapshots = Array.isArray(row.nightly_rate_snapshot)
          ? (row.nightly_rate_snapshot as Array<{ rate?: number }>)
          : [];
        const nightly = snapshots[0]?.rate != null ? Number(snapshots[0].rate) : null;
        const priced = row.room_subtotal != null && Number(row.room_subtotal) > 0;
        const gate = foCheckInReadiness({
          status: stay.status,
          arrivalDate: stay.arrivalDate,
          departureDate: stay.departureDate,
          assigned,
          roomEligible: !assigned || eligible,
          roomReady: ready,
          registrationOk,
          missingGuestFields: missing,
          depositOk,
          blockingKeys: [],
        });
        const exceptionKeys = foWalkInExceptionKeys({
          missingGuest: missing.length > 0,
          assigned,
          roomEligible: !assigned || eligible,
          roomReady: ready,
          priced,
          depositOk,
          registrationOk,
          canComplete: gate.canComplete,
          status: stay.status,
        });
        const hints = foArrivalActionHints({
          status: stay.status,
          assigned,
          roomReady: ready,
          registrationOk,
          depositOk,
          missingGuestFields: missing,
          blockingKeys: foArrivalBlockingKeys([]),
          folioId: financial.folioId,
          guestId: stay.guestId,
        });
        return {
          stay,
          createdAt: row.created_at,
          assigned,
          roomReady: ready,
          housekeepingStatus: room?.housekeepingStatus ?? null,
          financialLane: signals.folioLane,
          ratePlanName: row.rate_plan?.name ?? null,
          roomSubtotal: row.room_subtotal == null ? null : Number(row.room_subtotal),
          nightlyRate: nightly,
          walkInIncomplete: stay.walkInIncomplete === true,
          exceptionKeys,
          hints,
          readiness: gate,
        };
      }),
    };
  });

export const getFrontOfficeWalkInQuickView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FoWalkInQuickView> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadWalkInSettings(supabaseAdmin, data.restaurantId);
    const today = resolvePropertyBusinessDate(settings.businessDate, settings.timezone);
    const stay = await loadFrontOfficeStay(context.supabase, {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      today,
    });
    if (!stay) throw new Error("Reservation not found for this property.");

    const [{ data: guestRow }, { data: roomRow }, { data: progressRow }, { data: pricedRow }, signals, hk, guestRules] =
      await Promise.all([
        supabaseAdmin
          .from("guest_profiles")
          .select("first_name, last_name, phone, email, vip_status")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", stay.guestId)
          .maybeSingle(),
        stay.roomId
          ? supabaseAdmin
              .from("hotel_rooms")
              .select("id, room_number, status, housekeeping_status, maintenance_status")
              .eq("restaurant_id", data.restaurantId)
              .eq("id", stay.roomId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabaseAdmin
          .from("fo_checkin_progress")
          .select("walk_in_incomplete, registration_snapshot, registration_waived, deposit_amount, deposit_method, deposit_waived")
          .eq("restaurant_id", data.restaurantId)
          .eq("reservation_id", stay.id)
          .maybeSingle(),
        supabaseAdmin
          .from("hotel_reservations")
          .select("created_at, room_subtotal, nightly_rate_snapshot, rate_plan:hotel_rate_plans!hotel_reservations_rate_plan_same_property ( name )")
          .eq("restaurant_id", data.restaurantId)
          .eq("id", stay.id)
          .maybeSingle(),
        loadFoStaySignals({
          context: context as never,
          restaurantId: data.restaurantId,
          reservationIds: [stay.id],
        }),
        loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId),
        loadGuestProfileRules(supabaseAdmin, data.restaurantId),
      ]);

    const guest = {
      fullName:
        [guestRow?.first_name, guestRow?.last_name].filter(Boolean).join(" ").trim() || stay.guestName,
      phone: (guestRow?.phone as string | null) ?? stay.guestPhone,
      email: (guestRow?.email as string | null) ?? stay.guestEmail,
      vip: guestRow?.vip_status === true || stay.guestVip,
    };
    const snapshot = (progressRow?.registration_snapshot as RegistrationDraft | null) ?? null;
    const registrationWaived = progressRow?.registration_waived === true;
    const registrationOk = registrationOkFromProgress({
      snapshot,
      waived: registrationWaived,
      guest: {
        fullName: guest.fullName,
        phone: guest.phone,
        email: guest.email,
        idDocumentType: null,
        idDocumentNumber: null,
      },
    });
    const missing = guestVerificationMissing({
      rules: guestRules,
      firstName: String(guestRow?.first_name ?? stay.guestName.split(/\s+/)[0]),
      lastName:
        (guestRow?.last_name as string | null) ??
        (stay.guestName.split(/\s+/).slice(1).join(" ") || null),
      phone: guest.phone,
      email: guest.email,
    });
    const assigned = stay.roomId !== null;
    const eligible = roomEligibleStatus(roomRow?.status as string | null);
    const roomEval = isRoomReady(
      roomRow
        ? {
            status: roomRow.status as string | null,
            housekeepingStatus: roomRow.housekeeping_status as string | null,
            maintenanceStatus: (roomRow.maintenance_status as string | null) ?? null,
          }
        : null,
      hk.settings,
    );
    const signal = signals.byStay[stay.id];
    const financial = financialFromSignal(signals.folioLane, signal);
    const depositWaived = progressRow?.deposit_waived === true || signal?.depositWaived === true;
    const postedAmount = Number(progressRow?.deposit_amount ?? signal?.depositPosted ?? 0);
    const depositOk = depositOkFromSignals({
      postedAmount,
      waived: depositWaived,
      requiredAmount: settings.depositRequired && settings.depositValue ? settings.depositValue : null,
    });
    const pricedRowTyped = pricedRow as {
      created_at?: string;
      room_subtotal?: number | string | null;
      nightly_rate_snapshot?: unknown;
      rate_plan?: { name: string } | null;
    } | null;
    const snapshots = Array.isArray(pricedRowTyped?.nightly_rate_snapshot)
      ? (pricedRowTyped?.nightly_rate_snapshot as Array<{ rate?: number }>)
      : [];
    const nightly = snapshots[0]?.rate != null ? Number(snapshots[0].rate) : null;
    const priced = pricedRowTyped?.room_subtotal != null && Number(pricedRowTyped.room_subtotal) > 0;
    const gate = foCheckInReadiness({
      status: stay.status,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
      assigned,
      roomEligible: !assigned || eligible,
      roomReady: roomEval.ready,
      registrationOk,
      missingGuestFields: missing,
      depositOk,
      blockingKeys: [],
    });
    const exceptionKeys = foWalkInExceptionKeys({
      missingGuest: missing.length > 0,
      assigned,
      roomEligible: !assigned || eligible,
      roomReady: roomEval.ready,
      priced,
      depositOk,
      registrationOk,
      canComplete: gate.canComplete,
      status: stay.status,
    });
    const hints = foArrivalActionHints({
      status: stay.status,
      assigned,
      roomReady: roomEval.ready,
      registrationOk,
      depositOk,
      missingGuestFields: missing,
      blockingKeys: foArrivalBlockingKeys([]),
      folioId: financial.folioId,
      guestId: stay.guestId,
    });

    return {
      stay,
      createdAt: pricedRowTyped?.created_at ?? null,
      guest,
      room: {
        id: stay.roomId,
        roomNumber: stay.roomNumber,
        status: (roomRow?.status as string | null) ?? null,
        housekeepingStatus: (roomRow?.housekeeping_status as string | null) ?? null,
        assigned,
        eligible,
        ready: roomEval.ready,
        readyReason: roomEval.reason,
      },
      pricing: {
        ratePlanName: pricedRowTyped?.rate_plan?.name ?? null,
        roomSubtotal: pricedRowTyped?.room_subtotal == null ? null : Number(pricedRowTyped.room_subtotal),
        nightlyRate: nightly,
        nights: stay.nights,
      },
      financial: {
        lane: signals.folioLane,
        folioId: financial.folioId,
        folioNumber: signal?.folioNumber ?? null,
        depositRequired: settings.depositRequired,
        depositRequiredAmount: settings.depositValue,
        depositPosted: postedAmount,
        depositWaived,
        outstanding: !depositOk,
      },
      registration: { complete: registrationOk, waived: registrationWaived },
      verification: { complete: missing.length === 0, missing },
      exceptions: exceptionKeys.map((key) => ({
        key,
        label: FO_WALKIN_EXCEPTION_LABELS[key],
        blocking: key !== "check_in_blocker" || stay.status === "confirmed",
      })),
      hints,
      readiness: gate,
      walkInIncomplete: progressRow?.walk_in_incomplete === true || stay.walkInIncomplete === true,
      guestRules,
    };
  });
