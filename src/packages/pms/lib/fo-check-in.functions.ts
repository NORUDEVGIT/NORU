/**
 * FO-FS1 — Check-in stepper server writes.
 *
 * A–D gates live here. The Live status flip is still check_in_hotel_reservation
 * via completeFoCheckIn after the gates pass.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MANAGE_ROLES } from "@/core/lib/workforce.server";
import {
  blankToNull,
  recordReservationEvent,
  requireReservationManager,
  reservationError,
} from "./reservations.server";
import { requireCashierOperator, cashierError } from "./cashiering.server";
import { diffFields, recordGuestEvent } from "./guests.server";
import {
  ID_DOCUMENT_TYPES,
  KEY_ACCESS_TYPES,
  canCompleteCheckIn,
  canContinueKey,
  canContinueRegistration,
  isDepositSatisfied,
  isRoomReady,
  mapCashierShiftError,
  mapDepositMethod,
  type IdDocumentType,
  type RegistrationDraft,
} from "./fo-check-in";
import type { FrontOfficeStay } from "./frontoffice.functions";
import { nightsBetween } from "./reservation-dates";

const idSchema = z.string().uuid();

export type CheckInRoomState = {
  id: string;
  roomNumber: string;
  status: string;
  housekeepingStatus: string | null;
};

export type CheckInProgressRow = {
  walkInIncomplete: boolean;
  registrationSnapshot: RegistrationDraft | null;
  registrationWaived: boolean;
  registrationWaiverReason: string | null;
  depositTransactionId: string | null;
  depositAmount: number | null;
  depositMethod: string | null;
  depositWaived: boolean;
  depositWaiverReason: string | null;
  keyAccessType: string | null;
  keyIdentifier: string | null;
  keyCount: number | null;
  keyIssuedAt: string | null;
  keyIssuedBy: string | null;
  keyWaived: boolean;
  keyWaiverReason: string | null;
  completedAt: string | null;
};

export type CheckInFolioStrip = {
  folioId: string | null;
  folioNumber: string | null;
  open: boolean;
  required: true;
  postedAmount: number;
  postedMethod: string | null;
  outstanding: number;
  satisfied: boolean;
};

export type CheckInContext = {
  stay: FrontOfficeStay;
  room: CheckInRoomState | null;
  rateMissing: boolean;
  guest: {
    firstName: string;
    lastName: string | null;
    fullName: string;
    phone: string | null;
    email: string | null;
    nationality: string | null;
    addressLine1: string | null;
    city: string | null;
    country: string | null;
    idDocumentType: IdDocumentType | null;
    idDocumentNumber: string | null;
    idDocumentExpiry: string | null;
  };
  progress: CheckInProgressRow;
  folio: CheckInFolioStrip;
  canWaive: boolean;
  actorName: string;
};

type ProgressDb = {
  walk_in_incomplete: boolean;
  registration_snapshot: RegistrationDraft | null;
  registration_waived: boolean;
  registration_waiver_reason: string | null;
  deposit_transaction_id: string | null;
  deposit_amount: number | string | null;
  deposit_method: string | null;
  deposit_waived: boolean;
  deposit_waiver_reason: string | null;
  key_access_type: string | null;
  key_identifier: string | null;
  key_count: number | null;
  key_issued_at: string | null;
  key_issued_by: string | null;
  key_waived: boolean;
  key_waiver_reason: string | null;
  completed_at: string | null;
};

const EMPTY_PROGRESS: CheckInProgressRow = {
  walkInIncomplete: false,
  registrationSnapshot: null,
  registrationWaived: false,
  registrationWaiverReason: null,
  depositTransactionId: null,
  depositAmount: null,
  depositMethod: null,
  depositWaived: false,
  depositWaiverReason: null,
  keyAccessType: null,
  keyIdentifier: null,
  keyCount: 1,
  keyIssuedAt: null,
  keyIssuedBy: null,
  keyWaived: false,
  keyWaiverReason: null,
  completedAt: null,
};

function toProgress(row: ProgressDb | null): CheckInProgressRow {
  if (!row) return { ...EMPTY_PROGRESS };
  return {
    walkInIncomplete: row.walk_in_incomplete,
    registrationSnapshot: row.registration_snapshot,
    registrationWaived: row.registration_waived,
    registrationWaiverReason: row.registration_waiver_reason,
    depositTransactionId: row.deposit_transaction_id,
    depositAmount: row.deposit_amount === null ? null : Number(row.deposit_amount),
    depositMethod: row.deposit_method,
    depositWaived: row.deposit_waived,
    depositWaiverReason: row.deposit_waiver_reason,
    keyAccessType: row.key_access_type,
    keyIdentifier: row.key_identifier,
    keyCount: row.key_count,
    keyIssuedAt: row.key_issued_at,
    keyIssuedBy: row.key_issued_by,
    keyWaived: row.key_waived,
    keyWaiverReason: row.key_waiver_reason,
    completedAt: row.completed_at,
  };
}

function requireSupervisor(role: string): void {
  if (!(MANAGE_ROLES as readonly string[]).includes(role)) {
    throw new Error("You don't have permission to waive check-in requirements.");
  }
}

function splitName(fullName: string): { firstName: string; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: null };
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function joinName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

async function actorDisplayName(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  membershipId: string,
  restaurantId: string,
): Promise<string> {
  const { data: member } = await supabaseAdmin
    .from("restaurant_users")
    .select("user_id")
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!member) return "Staff member";
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", member.user_id)
    .maybeSingle();
  const name = joinName(profile?.first_name ?? "", profile?.last_name ?? null);
  return name || profile?.email || "Staff member";
}

async function loadProgress(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<CheckInProgressRow> {
  const { data } = await supabaseAdmin
    .from("fo_checkin_progress")
    .select(
      "walk_in_incomplete, registration_snapshot, registration_waived, registration_waiver_reason, deposit_transaction_id, deposit_amount, deposit_method, deposit_waived, deposit_waiver_reason, key_access_type, key_identifier, key_count, key_issued_at, key_issued_by, key_waived, key_waiver_reason, completed_at",
    )
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .maybeSingle();
  return toProgress(data as ProgressDb | null);
}

async function patchProgress(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("fo_checkin_progress")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabaseAdmin
      .from("fo_checkin_progress")
      .update(patch as never)
      .eq("id", existing.id)
      .eq("restaurant_id", restaurantId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabaseAdmin.from("fo_checkin_progress").insert({
    restaurant_id: restaurantId,
    reservation_id: reservationId,
    ...(patch as object),
  } as never);
  if (error) throw new Error(error.message);
}

async function loadFolioStrip(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
  waived: boolean,
): Promise<CheckInFolioStrip> {
  const { data: folio } = await supabaseAdmin
    .from("guest_folios")
    .select("id, folio_number, status")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (!folio) {
    return {
      folioId: null,
      folioNumber: null,
      open: false,
      required: true,
      postedAmount: 0,
      postedMethod: null,
      outstanding: waived ? 0 : 1,
      satisfied: waived,
    };
  }

  const { data: txns } = await supabaseAdmin
    .from("folio_transactions")
    .select("id, amount, payment_method, transaction_type")
    .eq("restaurant_id", restaurantId)
    .eq("folio_id", folio.id)
    .eq("transaction_type", "deposit");

  let postedAmount = 0;
  let postedMethod: string | null = null;
  for (const t of (txns ?? []) as { amount: number | string; payment_method: string | null }[]) {
    postedAmount += Math.abs(Number(t.amount));
    if (!postedMethod && t.payment_method) postedMethod = t.payment_method;
  }
  const satisfied = isDepositSatisfied({ postedAmount, waived });
  return {
    folioId: folio.id,
    folioNumber: folio.folio_number,
    open: folio.status === "open",
    required: true,
    postedAmount,
    postedMethod,
    outstanding: satisfied ? 0 : Math.max(0, 1 - postedAmount),
    satisfied,
  };
}

async function loadStay(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<{
  stay: FrontOfficeStay;
  rateMissing: boolean;
  guestId: string;
  roomTypeId: string;
  notes: string | null;
}> {
  const { data: row, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, adults, children, status, special_requests, notes, rate_plan_id, room_subtotal, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, vip_status ), room_types!hotel_reservations_type_same_property ( name ), hotel_rooms!hotel_reservations_room_same_type ( room_number )",
    )
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Reservation not found for this property.");

  const guest = row.guest_profiles as {
    first_name: string;
    last_name: string | null;
    phone: string | null;
    vip_status: boolean;
  } | null;
  const stay: FrontOfficeStay = {
    id: row.id,
    confirmationNumber: row.confirmation_number,
    guestId: row.guest_id,
    guestName: joinName(guest?.first_name ?? "", guest?.last_name ?? null) || "Guest",
    guestVip: guest?.vip_status ?? false,
    guestPhone: guest?.phone ?? null,
    roomTypeId: row.room_type_id,
    roomTypeName: (row.room_types as { name: string } | null)?.name ?? "Room type",
    roomId: row.room_id,
    roomNumber: (row.hotel_rooms as { room_number: string } | null)?.room_number ?? null,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    nights: nightsBetween(row.arrival_date, row.departure_date),
    adults: row.adults,
    children: row.children,
    status: row.status as FrontOfficeStay["status"],
    specialRequests: row.special_requests,
    overstay: false,
  };
  return {
    stay,
    rateMissing: row.rate_plan_id == null && (row.room_subtotal == null || Number(row.room_subtotal) === 0),
    guestId: row.guest_id,
    roomTypeId: row.room_type_id,
    notes: row.notes,
  };
}

export const getCheckInContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckInContext> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
    const progress = await loadProgress(supabaseAdmin, data.restaurantId, data.reservationId);

    let room: CheckInRoomState | null = null;
    if (loaded.stay.roomId) {
      const { data: roomRow } = await supabaseAdmin
        .from("hotel_rooms")
        .select("id, room_number, status, housekeeping_status")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", loaded.stay.roomId)
        .maybeSingle();
      if (roomRow) {
        room = {
          id: roomRow.id,
          roomNumber: roomRow.room_number,
          status: roomRow.status,
          housekeepingStatus: roomRow.housekeeping_status,
        };
      }
    }

    const { data: guestRow } = await supabaseAdmin
      .from("guest_profiles")
      .select(
        "first_name, last_name, phone, email, nationality, address_line1, city, country, id_document_type, id_document_number, id_document_expiry",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", loaded.guestId)
      .maybeSingle();
    if (!guestRow) throw new Error("That guest could not be found.");

    const folio = await loadFolioStrip(
      supabaseAdmin,
      data.restaurantId,
      data.reservationId,
      progress.depositWaived,
    );
    const actorName = await actorDisplayName(supabaseAdmin, me.id, data.restaurantId);

    return {
      stay: { ...loaded.stay, walkInIncomplete: progress.walkInIncomplete },
      room,
      rateMissing: loaded.rateMissing,
      guest: {
        firstName: guestRow.first_name,
        lastName: guestRow.last_name,
        fullName: joinName(guestRow.first_name, guestRow.last_name),
        phone: guestRow.phone,
        email: guestRow.email,
        nationality: guestRow.nationality,
        addressLine1: guestRow.address_line1,
        city: guestRow.city,
        country: guestRow.country,
        idDocumentType: (guestRow.id_document_type as IdDocumentType | null) ?? null,
        idDocumentNumber: guestRow.id_document_number,
        idDocumentExpiry: guestRow.id_document_expiry,
      },
      progress,
      folio,
      canWaive: (MANAGE_ROLES as readonly string[]).includes(me.role),
      actorName,
    };
  });

export const startWalkInCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await patchProgress(supabaseAdmin, data.restaurantId, data.reservationId, {
      walk_in_incomplete: true,
    });
    return { ok: true };
  });

const registrationSchema = z.object({
  restaurantId: idSchema,
  reservationId: idSchema,
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().max(60).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  idDocumentType: z.enum(ID_DOCUMENT_TYPES).nullable(),
  idDocumentNumber: z.string().max(80).optional().nullable(),
  idDocumentExpiry: z.string().max(20).optional().nullable(),
  nationality: z.string().max(120).optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
});

export const saveCheckInRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registrationSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
    const names = splitName(data.fullName);
    const snapshot: RegistrationDraft & {
      nationality: string | null;
      addressLine1: string | null;
      city: string | null;
      country: string | null;
      adults: number;
      children: number;
    } = {
      fullName: data.fullName.trim(),
      phone: blankToNull(data.phone),
      email: blankToNull(data.email),
      idDocumentType: data.idDocumentType,
      idDocumentNumber: blankToNull(data.idDocumentNumber),
      idDocumentExpiry: blankToNull(data.idDocumentExpiry),
      nationality: blankToNull(data.nationality),
      addressLine1: blankToNull(data.addressLine1),
      city: blankToNull(data.city),
      country: blankToNull(data.country),
      adults: data.adults,
      children: data.children,
    };

    const { data: before } = await supabaseAdmin
      .from("guest_profiles")
      .select(
        "first_name, last_name, phone, email, nationality, address_line1, city, country, id_document_type, id_document_number, id_document_expiry",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("id", loaded.guestId)
      .maybeSingle();
    if (!before) throw new Error("That guest could not be found.");

    const columns = {
      first_name: names.firstName,
      last_name: names.lastName,
      phone: snapshot.phone,
      email: snapshot.email,
      nationality: snapshot.nationality,
      address_line1: snapshot.addressLine1,
      city: snapshot.city,
      country: snapshot.country,
      id_document_type: snapshot.idDocumentType,
      id_document_number: snapshot.idDocumentNumber,
      id_document_expiry: snapshot.idDocumentExpiry ?? null,
    };
    const { error } = await supabaseAdmin
      .from("guest_profiles")
      .update(columns)
      .eq("restaurant_id", data.restaurantId)
      .eq("id", loaded.guestId);
    if (error) throw new Error(error.message);

    const profileDiff = diffFields(
      before as unknown as Record<string, unknown>,
      columns as unknown as Record<string, unknown>,
      Object.keys(columns),
    );
    if (profileDiff) {
      await recordGuestEvent({
        restaurantId: data.restaurantId,
        guestId: loaded.guestId,
        eventType: "profile_updated",
        previousValues: profileDiff.previous,
        newValues: profileDiff.next,
        actorMembershipId: me.id,
      });
    }

    if (data.adults !== loaded.stay.adults || data.children !== loaded.stay.children) {
      const { error: amendError } = await supabaseAdmin.rpc("amend_hotel_reservation", {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _room_type_id: loaded.roomTypeId,
        _room_id: (loaded.stay.roomId ?? null) as unknown as string,
        _arrival: loaded.stay.arrivalDate,
        _departure: loaded.stay.departureDate,
        _adults: data.adults,
        _children: data.children,
        _special_requests: (loaded.stay.specialRequests ?? null) as unknown as string,
        _notes: (loaded.notes ?? null) as unknown as string,
        _membership_id: me.id,
      });
      if (amendError) throw reservationError(amendError.message);
    }

    await patchProgress(supabaseAdmin, data.restaurantId, data.reservationId, {
      registration_snapshot: snapshot,
    });
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: { registration: snapshot },
      notes: "Check-in registration saved.",
      actorMembershipId: me.id,
    });
    return { ok: true };
  });

export const waiveCheckInRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    requireSupervisor(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await patchProgress(supabaseAdmin, data.restaurantId, data.reservationId, {
      registration_waived: true,
      registration_waiver_reason: data.reason,
      registration_waived_by: me.id,
      registration_waived_at: new Date().toISOString(),
    });
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: { registration_waived: true, reason: data.reason },
      notes: "Registration waived.",
      actorMembershipId: me.id,
    });
    return { ok: true };
  });

export const ensureCheckInFolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckInFolioStrip> => {
    await requireReservationManager(context as never, data.restaurantId);
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("open_folio_for_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    const progress = await loadProgress(supabaseAdmin, data.restaurantId, data.reservationId);
    return loadFolioStrip(supabaseAdmin, data.restaurantId, data.reservationId, progress.depositWaived);
  });

export const postCheckInDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        amount: z.number().positive(),
        method: z.enum(["cash", "card", "transfer", "other"]),
        reference: z.string().max(80).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckInFolioStrip> => {
    await requireReservationManager(context as never, data.restaurantId);
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const opened = await supabaseAdmin.rpc("open_folio_for_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (opened.error) throw cashierError(opened.error.message);
    const folioId = (opened.data as { id: string }).id;
    const ledgerMethod = mapDepositMethod(data.method);
    const reference = blankToNull(data.reference);
    const description = reference
      ? `Check-in deposit (${ledgerMethod}) · ${reference}`
      : `Check-in deposit (${ledgerMethod})`;

    const posted = await supabaseAdmin.rpc("post_folio_transaction", {
      _restaurant_id: data.restaurantId,
      _folio_id: folioId,
      _type: "deposit",
      _category: "deposit",
      _description: description,
      _amount: Math.round(data.amount * 100) / 100,
      _reference_type: null as unknown as string,
      _reference_id: null as unknown as string,
      _membership_id: me.id,
    });
    if (posted.error) {
      throw new Error(mapCashierShiftError(cashierError(posted.error.message).message));
    }
    const txnId = (posted.data as { id: string }).id;
    await supabaseAdmin
      .from("folio_transactions")
      .update({ payment_method: ledgerMethod })
      .eq("id", txnId)
      .eq("restaurant_id", data.restaurantId);

    await patchProgress(supabaseAdmin, data.restaurantId, data.reservationId, {
      deposit_transaction_id: txnId,
      deposit_amount: Math.round(data.amount * 100) / 100,
      deposit_method: ledgerMethod,
    });
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: { deposit_transaction_id: txnId, amount: data.amount, method: ledgerMethod },
      notes: "Check-in deposit posted to folio.",
      actorMembershipId: me.id,
    });
    const progress = await loadProgress(supabaseAdmin, data.restaurantId, data.reservationId);
    return loadFolioStrip(supabaseAdmin, data.restaurantId, data.reservationId, progress.depositWaived);
  });

export const waiveCheckInDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    requireSupervisor(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await patchProgress(supabaseAdmin, data.restaurantId, data.reservationId, {
      deposit_waived: true,
      deposit_waiver_reason: data.reason,
      deposit_waived_by: me.id,
      deposit_waived_at: new Date().toISOString(),
    });
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: { deposit_waived: true, reason: data.reason },
      notes: "Check-in deposit waived.",
      actorMembershipId: me.id,
    });
    return { ok: true };
  });

export const recordCheckInKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        accessType: z.enum(KEY_ACCESS_TYPES),
        identifier: z.string().trim().min(1).max(120),
        keyCount: z.number().int().min(1).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; issuedAt: string; issuedBy: string }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const issuedAt = new Date().toISOString();
    await patchProgress(supabaseAdmin, data.restaurantId, data.reservationId, {
      key_access_type: data.accessType,
      key_identifier: data.identifier.trim(),
      key_count: data.keyCount ?? 1,
      key_issued_at: issuedAt,
      key_issued_by: me.id,
    });
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: {
        key_access_type: data.accessType,
        key_identifier: data.identifier.trim(),
        key_count: data.keyCount ?? 1,
      },
      notes: "Check-in key recorded.",
      actorMembershipId: me.id,
    });
    return { ok: true, issuedAt, issuedBy: me.id };
  });

export const waiveCheckInKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    requireSupervisor(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await patchProgress(supabaseAdmin, data.restaurantId, data.reservationId, {
      key_waived: true,
      key_waiver_reason: data.reason,
      key_waived_by: me.id,
      key_waived_at: new Date().toISOString(),
    });
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: { key_waived: true, reason: data.reason },
      notes: "Keys later — check-in key waived.",
      actorMembershipId: me.id,
    });
    return { ok: true };
  });

export const completeFoCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; roomNumber: string | null }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
    if (loaded.stay.status !== "confirmed") {
      throw new Error("Only confirmed stays can be checked in.");
    }
    if (!loaded.stay.roomId) throw new Error("Assign a room before completing check-in.");

    const { data: roomRow } = await supabaseAdmin
      .from("hotel_rooms")
      .select("id, room_number, status, housekeeping_status")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", loaded.stay.roomId)
      .maybeSingle();
    const readiness = isRoomReady(
      roomRow
        ? { status: roomRow.status, housekeepingStatus: roomRow.housekeeping_status }
        : null,
    );
    if (!readiness.ready) throw new Error(readiness.reason ?? "The assigned room is not ready.");

    const progress = await loadProgress(supabaseAdmin, data.restaurantId, data.reservationId);
    const folio = await loadFolioStrip(
      supabaseAdmin,
      data.restaurantId,
      data.reservationId,
      progress.depositWaived,
    );
    const snap = progress.registrationSnapshot;
    const registrationOk = canContinueRegistration(
      snap ?? { fullName: "", phone: null, email: null, idDocumentType: null, idDocumentNumber: null },
      progress.registrationWaived,
    );
    const depositOk = isDepositSatisfied({
      postedAmount: folio.postedAmount,
      waived: progress.depositWaived,
    });
    const keyOk = canContinueKey({
      accessType: progress.keyAccessType,
      identifier: progress.keyIdentifier,
      waived: progress.keyWaived,
    });
    if (!canCompleteCheckIn({ roomReady: readiness.ready, registrationOk, depositOk, keyOk })) {
      if (!registrationOk) throw new Error("Complete registration or request a waiver.");
      if (!depositOk) throw new Error("Deposit required before check-in can finish.");
      if (!keyOk) throw new Error("Record a key or waive keys for later.");
      throw new Error("Check-in cannot finish until every step is complete.");
    }

    const { error } = await supabaseAdmin.rpc("check_in_hotel_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _room_id: loaded.stay.roomId as unknown as string,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);

    await patchProgress(supabaseAdmin, data.restaurantId, data.reservationId, {
      walk_in_incomplete: false,
      completed_at: new Date().toISOString(),
    });
    return { id: data.reservationId, roomNumber: roomRow?.room_number ?? loaded.stay.roomNumber };
  });
