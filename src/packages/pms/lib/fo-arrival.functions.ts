import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MANAGE_ROLES } from "@/core/lib/workforce.server";
import { loadFoStaySignals } from "./fo-exceptions.functions";
import type { FolioSignalLane, StayMoneySignal } from "./fo-exceptions";
import { isRoomReady, type IdDocumentType, type RegistrationDraft } from "./fo-check-in";
import { loadCard2HousekeepingSnapshot } from "./housekeeping-card2.functions";
import {
  loadFrontOfficeArrivals,
  loadFrontOfficeStay,
  type FrontOfficeStay,
} from "./frontoffice.functions";
import { loadGuestProfileRules } from "./pms-set3-rates-guest.functions";
import type { GuestProfileRules } from "./pms-set3-rates-guest";
import { normalizeClock } from "./pms-set1-foundation";
import { assertDateOnly, requireReservationManager } from "./reservations.server";
import { resolvePropertyBusinessDate } from "./reservation-workspace/business-date";
import {
  financialFromSignal,
  outstandingBalance,
  type RoomInventoryState,
} from "./reservation-workspace/arrivals-departures";
import {
  depositOkFromSignals,
  etaTiming,
  foArrivalActionHints,
  foArrivalBlockingKeys,
  foArrivalExceptionKeys,
  foCheckInReadiness,
  guestVerificationMissing,
  registrationOkFromProgress,
  roomEligibleStatus,
  FO_ARRIVAL_EXCEPTION_LABELS,
  GUARANTEE_HOLD_UNSUPPORTED,
  type FoArrivalActionHints,
  type FoArrivalExceptionKey,
  type FoCheckInReadiness,
  type FoEtaTiming,
} from "./fo-arrival";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

type WorkspaceClient = Parameters<typeof requireReservationManager>[0]["supabase"];

export type FoArrivalPropertySettings = {
  timezone: string;
  checkInTime: string | null;
  earlyCheckinAllowed: boolean | null;
  earlyCheckinNeedsApproval: boolean | null;
  depositRequired: boolean | null;
  depositType: string | null;
  depositValue: number | null;
};

export type FoArrivalDeskRow = {
  stay: FrontOfficeStay;
  assigned: boolean;
  roomReady: boolean;
  housekeepingStatus: string | null;
  operationalStatus: string | null;
  etaLabel: string | null;
  etaTiming: FoEtaTiming | null;
  financialLane: FolioSignalLane;
  depositPosted: number | null;
  depositWaived: boolean | null;
  folioId: string | null;
  exceptionKeys: FoArrivalExceptionKey[];
  hints: FoArrivalActionHints;
};

export type FoArrivalExceptionItem = {
  key: FoArrivalExceptionKey;
  label: string;
  blocking: boolean;
};

export type FoArrivalQuickView = {
  stay: FrontOfficeStay;
  guest: {
    firstName: string;
    lastName: string | null;
    fullName: string;
    phone: string | null;
    email: string | null;
    vip: boolean;
    nationality: string | null;
    addressLine1: string | null;
    idDocumentType: IdDocumentType | null;
    idDocumentNumber: string | null;
    idDocumentExpiry: string | null;
  };
  room: {
    id: string | null;
    roomNumber: string | null;
    status: string | null;
    housekeepingStatus: string | null;
    maintenanceStatus: string | null;
    assigned: boolean;
    eligible: boolean;
    ready: boolean;
    readyReason: string | null;
  };
  eta: {
    expectedArrivalAt: string | null;
    checkInTime: string | null;
    timing: FoEtaTiming | null;
    earlyCheckinAllowed: boolean | null;
    earlyCheckinNeedsApproval: boolean | null;
  };
  financial: {
    folioId: string | null;
    folioNumber: string | null;
    folioOpen: boolean | null;
    lane: FolioSignalLane;
    depositRequired: boolean | null;
    depositRequiredAmount: number | null;
    depositPosted: number;
    depositWaived: boolean;
    depositMethod: string | null;
    outstanding: boolean;
    guaranteeMethod: string | null;
    guaranteeHoldUnsupported: string;
  };
  verification: { complete: boolean; missing: string[] };
  registration: { complete: boolean; waived: boolean };
  exceptions: FoArrivalExceptionItem[];
  hints: FoArrivalActionHints;
  readiness: FoCheckInReadiness;
  settings: FoArrivalPropertySettings;
  guestRules: GuestProfileRules | null;
  canWaive: boolean;
};

async function loadPropertySettings(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
): Promise<FoArrivalPropertySettings & { businessDate: string | null }> {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select(
      "timezone, business_date, check_in_time, early_checkin_allowed, early_checkin_needs_approval, deposit_required, deposit_type, deposit_value",
    )
    .eq("id", restaurantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Property not found.");
  const depositRaw = data.deposit_value;
  return {
    timezone: data.timezone || "UTC",
    businessDate: data.business_date ?? null,
    checkInTime: normalizeClock(String(data.check_in_time ?? "")) || null,
    earlyCheckinAllowed: data.early_checkin_allowed ?? null,
    earlyCheckinNeedsApproval: data.early_checkin_needs_approval ?? null,
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

function formatEtaClock(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function mapDeskRow(params: {
  stay: FrontOfficeStay;
  room: (RoomInventoryState & { maintenanceStatus?: string | null }) | undefined;
  settings: FoArrivalPropertySettings;
  folioLane: FolioSignalLane;
  signal: StayMoneySignal | undefined;
  hk: Parameters<typeof isRoomReady>[1];
  guestRules: GuestProfileRules | null;
}): FoArrivalDeskRow {
  const assigned = params.stay.roomId !== null;
  const ready = assigned
    ? isRoomReady(
        {
          status: params.room?.operationalStatus ?? null,
          housekeepingStatus: params.room?.housekeepingStatus ?? null,
          maintenanceStatus: params.room?.maintenanceStatus ?? null,
        },
        params.hk,
      ).ready
    : false;
  const financial = financialFromSignal(params.folioLane, params.signal);
  const missing = guestVerificationMissing({
    rules: params.guestRules,
    firstName: params.stay.guestName.split(/\s+/)[0],
    lastName: params.stay.guestName.split(/\s+/).slice(1).join(" ") || null,
    phone: params.stay.guestPhone,
    email: params.stay.guestEmail,
  });
  const depositOk = depositOkFromSignals({
    postedAmount: params.signal?.depositPosted ?? 0,
    waived: params.signal?.depositWaived === true,
    requiredAmount: params.settings.depositRequired && params.settings.depositValue ? params.settings.depositValue : null,
  });
  const timing = etaTiming({
    expectedArrivalAt: params.stay.expectedArrivalAt ?? null,
    checkInTime: params.settings.checkInTime,
    timezone: params.settings.timezone,
  });
  const exceptionKeys = foArrivalExceptionKeys({
    status: params.stay.status,
    roomId: params.stay.roomId,
    room: params.room,
    financialState: financial.state,
    depositUnpaid: !depositOk && params.folioLane === "live",
    outstandingBalance: outstandingBalance(params.signal),
    specialRequests: params.stay.specialRequests,
    missingGuestFields: missing,
    registrationOk: false,
    etaTiming: timing,
  });
  const blocking = foArrivalBlockingKeys(exceptionKeys);
  return {
    stay: params.stay,
    assigned,
    roomReady: ready,
    housekeepingStatus: params.room?.housekeepingStatus ?? null,
    operationalStatus: params.room?.operationalStatus ?? null,
    etaLabel: formatEtaClock(params.stay.expectedArrivalAt ?? null, params.settings.timezone),
    etaTiming: timing,
    financialLane: params.folioLane,
    depositPosted: financial.depositPosted,
    depositWaived: financial.depositWaived,
    folioId: financial.folioId,
    exceptionKeys,
    hints: foArrivalActionHints({
      status: params.stay.status,
      assigned,
      roomReady: ready,
      registrationOk: false,
      depositOk,
      missingGuestFields: missing,
      blockingKeys: blocking,
      folioId: financial.folioId,
      guestId: params.stay.guestId,
    }),
  };
}

export const listFrontOfficeArrivalsDesk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        date: dateSchema.optional(),
        status: z.enum(["pending", "confirmed"]).optional(),
        roomTypeId: idSchema.optional(),
        assignment: z.enum(["assigned", "unassigned"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ date: string; rows: FoArrivalDeskRow[] }> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadPropertySettings(supabaseAdmin, data.restaurantId);
    const date = data.date
      ? assertDateOnly(data.date, "Arrival date")
      : resolvePropertyBusinessDate(settings.businessDate, settings.timezone);
    const stays = await loadFrontOfficeArrivals(context.supabase, {
      restaurantId: data.restaurantId,
      date,
      status: data.status,
      roomTypeId: data.roomTypeId,
      assignment: data.assignment,
    });
    const [rooms, signals, hk, guestRules] = await Promise.all([
      loadRooms(context.supabase, data.restaurantId, stays),
      loadFoStaySignals({
        context: context as never,
        restaurantId: data.restaurantId,
        reservationIds: stays.map((stay) => stay.id),
      }),
      loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId),
      loadGuestProfileRules(supabaseAdmin, data.restaurantId),
    ]);
    return {
      date,
      rows: stays.map((stay) =>
        mapDeskRow({
          stay,
          room: stay.roomId ? rooms.get(stay.roomId) : undefined,
          settings,
          folioLane: signals.folioLane,
          signal: signals.byStay[stay.id],
          hk: hk.settings,
          guestRules,
        }),
      ),
    };
  });

export const getFrontOfficeArrivalQuickView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<FoArrivalQuickView> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await loadPropertySettings(supabaseAdmin, data.restaurantId);
    const today = resolvePropertyBusinessDate(settings.businessDate, settings.timezone);
    const stay = await loadFrontOfficeStay(context.supabase, {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      today,
    });
    if (!stay) throw new Error("Reservation not found for this property.");

    const [{ data: guestRow }, { data: roomRow }, { data: progressRow }, signals, hk, guestRules] = await Promise.all([
      supabaseAdmin
        .from("guest_profiles")
        .select(
          "first_name, last_name, phone, email, nationality, address_line1, id_document_type, id_document_number, id_document_expiry, vip_status",
        )
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
        .select("registration_snapshot, registration_waived, deposit_amount, deposit_method, deposit_waived")
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", stay.id)
        .maybeSingle(),
      loadFoStaySignals({
        context: context as never,
        restaurantId: data.restaurantId,
        reservationIds: [stay.id],
      }),
      loadCard2HousekeepingSnapshot(supabaseAdmin, data.restaurantId),
      loadGuestProfileRules(supabaseAdmin, data.restaurantId),
    ]);

    if (!guestRow) throw new Error("That guest could not be found.");

    const guest = {
      firstName: guestRow.first_name as string,
      lastName: (guestRow.last_name as string | null) ?? null,
      fullName: [guestRow.first_name, guestRow.last_name].filter(Boolean).join(" ").trim() || stay.guestName,
      phone: (guestRow.phone as string | null) ?? null,
      email: (guestRow.email as string | null) ?? null,
      vip: guestRow.vip_status === true || stay.guestVip,
      nationality: (guestRow.nationality as string | null) ?? null,
      addressLine1: (guestRow.address_line1 as string | null) ?? null,
      idDocumentType: (guestRow.id_document_type as IdDocumentType | null) ?? null,
      idDocumentNumber: (guestRow.id_document_number as string | null) ?? null,
      idDocumentExpiry: (guestRow.id_document_expiry as string | null) ?? null,
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
        idDocumentType: guest.idDocumentType,
        idDocumentNumber: guest.idDocumentNumber,
      },
    });
    const missing = guestVerificationMissing({
      rules: guestRules,
      firstName: guest.firstName,
      lastName: guest.lastName,
      phone: guest.phone,
      email: guest.email,
    });

    const roomState = roomRow
      ? {
          operationalStatus: roomRow.status as string | null,
          housekeepingStatus: roomRow.housekeeping_status as string | null,
          maintenanceStatus: (roomRow.maintenance_status as string | null) ?? null,
        }
      : undefined;
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
    const assigned = stay.roomId !== null;
    const eligible = roomEligibleStatus(roomRow?.status as string | null);
    const signal = signals.byStay[stay.id];
    const financial = financialFromSignal(signals.folioLane, signal);
    const depositWaived = progressRow?.deposit_waived === true || signal?.depositWaived === true;
    const postedAmount = Number(progressRow?.deposit_amount ?? signal?.depositPosted ?? 0) || (signal?.depositPosted ?? 0);
    const depositOk = depositOkFromSignals({
      postedAmount,
      waived: depositWaived,
      requiredAmount: settings.depositRequired && settings.depositValue ? settings.depositValue : null,
    });
    const timing = etaTiming({
      expectedArrivalAt: stay.expectedArrivalAt ?? null,
      checkInTime: settings.checkInTime,
      timezone: settings.timezone,
    });
    const exceptionKeys = foArrivalExceptionKeys({
      status: stay.status,
      roomId: stay.roomId,
      room: roomState,
      financialState: financial.state,
      depositUnpaid: !depositOk && signals.folioLane === "live",
      outstandingBalance: outstandingBalance(signal),
      specialRequests: stay.specialRequests,
      missingGuestFields: missing,
      registrationOk,
      etaTiming: timing,
    });
    const blocking = foArrivalBlockingKeys(exceptionKeys);
    const hints = foArrivalActionHints({
      status: stay.status,
      assigned,
      roomReady: roomEval.ready,
      registrationOk,
      depositOk,
      missingGuestFields: missing,
      blockingKeys: blocking,
      folioId: financial.folioId,
      guestId: stay.guestId,
    });
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
      blockingKeys: blocking,
    });

    return {
      stay,
      guest,
      room: {
        id: stay.roomId,
        roomNumber: stay.roomNumber,
        status: (roomRow?.status as string | null) ?? null,
        housekeepingStatus: (roomRow?.housekeeping_status as string | null) ?? null,
        maintenanceStatus: (roomRow?.maintenance_status as string | null) ?? null,
        assigned,
        eligible,
        ready: roomEval.ready,
        readyReason: roomEval.reason,
      },
      eta: {
        expectedArrivalAt: stay.expectedArrivalAt ?? null,
        checkInTime: settings.checkInTime,
        timing,
        earlyCheckinAllowed: settings.earlyCheckinAllowed,
        earlyCheckinNeedsApproval: settings.earlyCheckinNeedsApproval,
      },
      financial: {
        folioId: financial.folioId,
        folioNumber: signal?.folioNumber ?? null,
        folioOpen: financial.state === "available" ? signal?.folioId != null : null,
        lane: signals.folioLane,
        depositRequired: settings.depositRequired,
        depositRequiredAmount: settings.depositRequired ? settings.depositValue : null,
        depositPosted: postedAmount,
        depositWaived,
        depositMethod: (progressRow?.deposit_method as string | null) ?? null,
        outstanding: outstandingBalance(signal),
        guaranteeMethod: stay.guaranteeMethod ?? null,
        guaranteeHoldUnsupported: GUARANTEE_HOLD_UNSUPPORTED,
      },
      verification: { complete: missing.length === 0, missing },
      registration: { complete: registrationOk, waived: registrationWaived },
      exceptions: exceptionKeys.map((key) => ({
        key,
        label: FO_ARRIVAL_EXCEPTION_LABELS[key],
        blocking: blocking.includes(key),
      })),
      hints,
      readiness: gate,
      settings,
      guestRules,
      canWaive: (MANAGE_ROLES as readonly string[]).includes(me.role),
    };
  });
