/**
 * FO-FS3 — Cancel / No-show money writes.
 *
 * Front Office desk cancel → `completeFoCancel` (fees, room_id clear, history).
 * Reservation pre-arrival cancel → `setReservationStatus` (Reservations-owned).
 * Both write status and settle the folio through processReservationCancellation.
 *
 * Fee/charge posts through post_folio_transaction type `charge` before the
 * Live status flip, on a fee-only folio when none exists. Deposits and payments
 * stay on the folio. Refunds are taken in Cashiering.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  blankToNull,
  recordReservationEvent,
  reservationError,
} from "./reservations.server";
import {
  hasEffectivePermission,
  requirePmsActor,
  requirePmsActorAll,
  requirePmsActorAny,
  resolveEffectivePermissions,
} from "./pms-permissions.server";
import { PMS_PERMISSIONS } from "./pms-permissions";
import { callPostFolioTransaction, cashierError } from "./cashiering.server";
import { parseSnapshot } from "./rates.server";
import type { FrontOfficeStay } from "./frontoffice.functions";
import { nightsBetween } from "./reservation-dates";
import { isMissingSchemaError } from "./pms-set2-structure";
import {
  canCompleteCancel,
  canCompleteNoShow,
  CREATED_BY_UNKNOWN,
  FEE_REQUIRED_BANNER,
  feeAmountAllowed,
  folioHasPostedFee,
  isCreditBalance,
  isFeePostedLine,
  isFeeSatisfied,
  isReasonComplete,
  mapCashierShiftError,
  roundMoney,
  suggestFirstNight,
  walkInCreatedByLabel,
  type CancelNoShowKind,
  type WalkInCompletionFilter,
  type WalkInHistoryRow,
} from "./fo-cancel-noshow";
import { computeNoShowPenalty, isMatchingNoShowCharge } from "./fo-no-show-readiness";
import {
  applySettlementAndRecord,
  loadCancellationPenaltyQuote,
  processReservationCancellation,
  settleReservationFolio,
} from "./reservation-cancellation.server";
import type { CancellationSettlement } from "./reservation-cancellation-settlement";

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export type CancelNoShowLedgerLine = {
  id: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  referenceType: string | null;
  referenceId: string | null;
};

export type CancelNoShowFolioState = {
  folioId: string | null;
  folioNumber: string | null;
  status: "open" | "closed" | null;
  currency: string;
  charges: number;
  credits: number;
  balance: number;
  transactions: CancelNoShowLedgerLine[];
};

export type CancelNoShowFeePolicy = {
  required: boolean;
  defaultAmount: number;
};

export type CancelNoShowContext = {
  stay: FrontOfficeStay;
  kind: CancelNoShowKind;
  folio: CancelNoShowFolioState;
  policy: CancelNoShowFeePolicy;
  suggestedFirstNight: number | null;
  posted: boolean;
  waived: boolean;
  waiveReason: string | null;
  canWaive: boolean;
  rateMissing: boolean;
  actorName: string;
};

export type WalkInHistoryListItem = WalkInHistoryRow & {
  stay: FrontOfficeStay;
};

const EMPTY_FOLIO: CancelNoShowFolioState = {
  folioId: null,
  folioNumber: null,
  status: null,
  currency: "GBP",
  charges: 0,
  credits: 0,
  balance: 0,
  transactions: [],
};

const DEFAULT_POLICY: CancelNoShowFeePolicy = { required: true, defaultAmount: 0 };

async function callCompleteNoShowRpc(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  args: {
    _restaurant_id: string;
    _reservation_id: string;
    _membership_id: string;
    _reason: string;
    _additional_notes: string | null;
    _reservation_room_id?: string;
  },
): Promise<{ data: unknown; error: { message: string } | null }> {
  return supabaseAdmin.rpc(
    "complete_hotel_reservation_no_show" as never,
    args as never,
  ) as Promise<{ data: unknown; error: { message: string } | null }>;
}

function joinName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function totals(rows: { amount: number }[]): { charges: number; credits: number; balance: number } {
  let charges = 0;
  let credits = 0;
  for (const r of rows) {
    if (r.amount >= 0) charges += r.amount;
    else credits += -r.amount;
  }
  return {
    charges: roundMoney(charges),
    credits: roundMoney(credits),
    balance: roundMoney(charges - credits),
  };
}

async function mayWaiveFee(context: unknown, restaurantId: string): Promise<boolean> {
  return hasEffectivePermission(
    await resolveEffectivePermissions(context as never, restaurantId),
    PMS_PERMISSIONS.FRONT_OFFICE_FEE_OVERRIDE,
  );
}

function isFeeWaiver(values: unknown, kind: CancelNoShowKind): values is { reason?: string } {
  if (!values || typeof values !== "object") return false;
  const row = values as { cancel_fee_waived?: unknown; noshow_fee_waived?: unknown };
  return kind === "cancel" ? row.cancel_fee_waived === true : row.noshow_fee_waived === true;
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

async function loadStay(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<{
  stay: FrontOfficeStay;
  rateMissing: boolean;
  roomSubtotal: number | null;
  nightlyRates: { date: string; rate: number }[];
}> {
  const { data: row, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, adults, children, status, special_requests, rate_plan_id, room_subtotal, nightly_rate_snapshot, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ), room_types!hotel_reservations_type_same_property ( name ), hotel_rooms!hotel_reservations_room_same_type ( room_number )",
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
    email: string | null;
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
  const roomSubtotal =
    row.room_subtotal === null || row.room_subtotal === undefined
      ? null
      : Number(row.room_subtotal);
  return {
    stay,
    rateMissing: row.rate_plan_id == null && (roomSubtotal == null || roomSubtotal === 0),
    roomSubtotal,
    nightlyRates: parseSnapshot(row.nightly_rate_snapshot),
  };
}

async function loadNoShowPenaltyQuote(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
  reservationRoomId?: string,
) {
  const { data: reservation, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select("room_subtotal, nightly_rate_snapshot, currency, no_show_policy_snapshot")
    .eq("restaurant_id", restaurantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!reservation) throw new Error("Reservation not found for this property.");

  let roomSubtotal = reservation.room_subtotal == null ? null : Number(reservation.room_subtotal);
  let nightlyRates = parseSnapshot(reservation.nightly_rate_snapshot);
  let currency = reservation.currency ?? null;
  if (reservationRoomId) {
    const { data: unit, error: unitError } = await supabaseAdmin
      .from("hotel_reservation_rooms")
      .select("room_subtotal, nightly_rate_snapshot, currency")
      .eq("restaurant_id", restaurantId)
      .eq("reservation_id", reservationId)
      .eq("id", reservationRoomId)
      .maybeSingle();
    if (unitError) throw new Error(unitError.message);
    if (!unit) throw reservationError("ROOM_UNIT_NOT_FOUND");
    roomSubtotal = unit.room_subtotal == null ? null : Number(unit.room_subtotal);
    nightlyRates = parseSnapshot(unit.nightly_rate_snapshot);
    currency = unit.currency ?? currency;
  }
  return computeNoShowPenalty({
    snapshot: reservation.no_show_policy_snapshot,
    roomSubtotal: Number.isFinite(roomSubtotal) ? roomSubtotal : null,
    nightlyRates,
    currency,
  });
}

const loadCancellationPenalty = loadCancellationPenaltyQuote;

async function openFeeFolio(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
  membershipId: string,
): Promise<string> {
  const { data, error } = (await supabaseAdmin.rpc("open_reservation_fee_folio" as never, {
    _restaurant_id: restaurantId,
    _reservation_id: reservationId,
    _membership_id: membershipId,
  } as never)) as { data: unknown; error: { message: string } | null };
  if (error) throw cashierError(error.message);
  return (data as { id: string }).id;
}

async function loadFolioState(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<CancelNoShowFolioState> {
  const { data: folio } = await supabaseAdmin
    .from("guest_folios")
    .select("id, folio_number, status, currency")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (!folio) return { ...EMPTY_FOLIO };

  const { data: txns } = await supabaseAdmin
    .from("folio_transactions")
    .select(
      "id, transaction_type, category, description, amount, posted_at, reference_type, reference_id",
    )
    .eq("restaurant_id", restaurantId)
    .eq("folio_id", folio.id)
    .order("posted_at", { ascending: true });

  const transactions: CancelNoShowLedgerLine[] = (
    (txns ?? []) as {
      id: string;
      transaction_type: string;
      category: string;
      description: string;
      amount: number | string;
      posted_at: string;
      reference_type: string | null;
      reference_id: string | null;
    }[]
  ).map((t) => ({
    id: t.id,
    type: t.transaction_type,
    category: t.category,
    description: t.description,
    amount: Number(t.amount),
    postedAt: t.posted_at,
    referenceType: t.reference_type,
    referenceId: t.reference_id,
  }));

  return {
    folioId: folio.id,
    folioNumber: folio.folio_number,
    status: folio.status as "open" | "closed",
    currency: folio.currency || "GBP",
    transactions,
    ...totals(transactions.map((t) => ({ amount: t.amount }))),
  };
}

async function loadWaiver(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
  kind: CancelNoShowKind,
  reservationRoomId?: string,
): Promise<{ waived: boolean; reason: string | null }> {
  const { data } = await supabaseAdmin
    .from("hotel_reservation_history")
    .select("new_values, notes")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .eq("event_type", "amended")
    .order("created_at", { ascending: false })
    .limit(40);

  for (const row of (data ?? []) as { new_values: unknown; notes: string | null }[]) {
    if (isFeeWaiver(row.new_values, kind)) {
      const values = row.new_values as { reason?: string; reservation_room_id?: string };
      if ((values.reservation_room_id ?? null) !== (reservationRoomId ?? null)) continue;
      return {
        waived: true,
        reason: values.reason ?? row.notes,
      };
    }
  }
  return { waived: false, reason: null };
}

async function loadFeePolicy(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  kind: CancelNoShowKind,
): Promise<CancelNoShowFeePolicy> {
  const { data, error } = await supabaseAdmin
    .from("restaurants")
    .select(
      "fo_cancel_fee_required, fo_cancel_fee_default, fo_noshow_fee_required, fo_noshow_fee_default",
    )
    .eq("id", restaurantId)
    .maybeSingle();

  if (error || !data) {
    // 0042 is PR-only until Abel applies it. Required ON / default 0 is the approved fallback.
    return { ...DEFAULT_POLICY };
  }

  const row = data as {
    fo_cancel_fee_required?: boolean | null;
    fo_cancel_fee_default?: number | string | null;
    fo_noshow_fee_required?: boolean | null;
    fo_noshow_fee_default?: number | string | null;
  };
  if (kind === "cancel") {
    return {
      required: row.fo_cancel_fee_required ?? true,
      defaultAmount: Number(row.fo_cancel_fee_default ?? 0) || 0,
    };
  }
  return {
    required: row.fo_noshow_fee_required ?? true,
    defaultAmount: Number(row.fo_noshow_fee_default ?? 0) || 0,
  };
}

export async function buildCancelNoShowContext(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
  kind: CancelNoShowKind,
  membershipId: string,
  canWaive: boolean,
  reservationRoomId?: string,
): Promise<CancelNoShowContext> {
  const loaded = await loadStay(supabaseAdmin, restaurantId, reservationId);
  const [folio, waiver, propertyPolicy, actorName, cancelPenalty] = await Promise.all([
    loadFolioState(supabaseAdmin, restaurantId, reservationId),
    loadWaiver(supabaseAdmin, restaurantId, reservationId, kind, reservationRoomId),
    loadFeePolicy(supabaseAdmin, restaurantId, kind),
    actorDisplayName(supabaseAdmin, membershipId, restaurantId),
    kind === "cancel"
      ? loadCancellationPenalty(supabaseAdmin, restaurantId, reservationId)
      : Promise.resolve(null),
  ]);
  const frozen = cancelPenalty?.calculable === true ? cancelPenalty : null;
  const policy = frozen
    ? {
        required: frozen.required,
        defaultAmount: frozen.amount ?? 0,
      }
    : propertyPolicy;
  const posted = frozen
    ? folio.transactions.some(
        (line) =>
          isFeePostedLine(line, "cancel") && Math.abs(line.amount - (frozen.amount ?? 0)) < 0.01,
      )
    : folioHasPostedFee(folio.transactions, kind);
  return {
    stay: loaded.stay,
    kind,
    folio,
    policy,
    suggestedFirstNight: suggestFirstNight({
      roomSubtotal: loaded.roomSubtotal,
      nightlyRates: loaded.nightlyRates,
      nights: loaded.stay.nights,
    }),
    posted,
    waived: waiver.waived,
    waiveReason: waiver.reason,
    canWaive,
    rateMissing: loaded.rateMissing,
    actorName,
  };
}

export const getCancelNoShowContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        kind: z.enum(["cancel", "noshow"]),
        reservationRoomId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CancelNoShowContext> => {
    const me = await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.FRONT_OFFICE_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildCancelNoShowContext(
      supabaseAdmin,
      data.restaurantId,
      data.reservationId,
      data.kind,
      me.id,
      await mayWaiveFee(context, data.restaurantId),
      data.reservationRoomId,
    );
  });

export const ensureCancelNoShowFolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CancelNoShowFolioState> => {
    const me = await requirePmsActorAny(context as never, data.restaurantId, [
      PMS_PERMISSIONS.FRONT_OFFICE_CANCEL,
      PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW,
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    if (existing.folioId) return existing;

    await openFeeFolio(supabaseAdmin, data.restaurantId, data.reservationId, me.id);
    return loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
  });

/**
 * Thin charge wrapper. Still calls post_folio_transaction type `charge`.
 * Same manager gate as Cashiering postFolioEntry for charges.
 */
export const postCancelOrNoShowFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        kind: z.enum(["cancel", "noshow"]),
        amount: z.number().positive(),
        idempotencyKey: z.string().min(8).max(80),
        reservationRoomId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CancelNoShowFolioState> => {
    const me = await requirePmsActorAll(context as never, data.restaurantId, [
      data.kind === "cancel"
        ? PMS_PERMISSIONS.FRONT_OFFICE_CANCEL
        : PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW,
      PMS_PERMISSIONS.CASHIERING_CHARGE_POST,
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
    if (loaded.stay.status === "cancelled" || loaded.stay.status === "no_show") {
      throw new Error("Cancelled and no-show reservations can't be billed.");
    }

    const folioId = await openFeeFolio(supabaseAdmin, data.restaurantId, data.reservationId, me.id);
    const amount = roundMoney(data.amount);
    const feeReferenceType = data.kind === "noshow" ? "reservation_no_show" : "reservation_cancel";
    const { data: priorFees, error: priorError } = await supabaseAdmin
      .from("folio_transactions")
      .select("id, amount")
      .eq("restaurant_id", data.restaurantId)
      .eq("folio_id", folioId)
      .eq("transaction_type", "charge")
      .eq("reference_type", feeReferenceType)
      .eq("reference_id", data.reservationRoomId ?? data.reservationId);
    if (priorError) throw new Error(priorError.message);
    for (const prior of (priorFees ?? []) as { id: string }[]) {
      const { data: remaining } = (await supabaseAdmin.rpc("charge_group_remaining_gross" as never, {
        _restaurant_id: data.restaurantId,
        _charge_id: prior.id,
      } as never)) as { data: unknown };
      if (Number(remaining ?? 0) >= 0.01) {
        throw new Error(
          data.kind === "cancel"
            ? "A cancel fee is already posted to this folio."
            : "A no-show charge is already posted to this folio.",
        );
      }
    }
    if (!feeAmountAllowed(amount)) throw new Error("Enter an amount greater than zero.");
    const noShowPenalty =
      data.kind === "noshow"
        ? await loadNoShowPenaltyQuote(
            supabaseAdmin,
            data.restaurantId,
            data.reservationId,
            data.reservationRoomId,
          )
        : null;
    const cancelPenalty =
      data.kind === "cancel"
        ? await loadCancellationPenalty(supabaseAdmin, data.restaurantId, data.reservationId)
        : null;
    if (noShowPenalty && !noShowPenalty.calculable) {
      throw new Error("The frozen no-show policy cannot produce an authoritative charge amount.");
    }
    if (
      noShowPenalty?.amount == null ||
      (data.kind === "noshow" && Math.abs(noShowPenalty.amount - amount) >= 0.01)
    ) {
      if (data.kind === "noshow") {
        throw new Error("The no-show charge must match the frozen policy amount.");
      }
    }
    if (cancelPenalty && cancelPenalty.basis !== "not_evaluated") {
      if (!cancelPenalty.calculable || cancelPenalty.amount == null) {
        throw new Error("The frozen cancellation policy cannot produce an authoritative charge amount.");
      }
      if (!cancelPenalty.required) {
        throw new Error("This cancellation policy does not charge a fee.");
      }
      if (Math.abs(cancelPenalty.amount - amount) >= 0.01) {
        throw new Error("The cancellation charge must match the frozen policy amount.");
      }
    }

    const description = data.kind === "cancel" ? "Cancel fee" : "No-show charge";
    let postedId: string;
    try {
      const posted = await callPostFolioTransaction({
        restaurantId: data.restaurantId,
        folioId,
        type: "charge",
        category: "manual",
        description,
        amount,
        referenceType: feeReferenceType,
        referenceId: data.reservationRoomId ?? data.reservationId,
        membershipId: me.id,
        // One live fee per stay or room: concurrent posts share this key.
        idempotencyKey: `${data.kind === "cancel" ? "cxfee" : "nsfee"}${(
          data.reservationRoomId ?? data.reservationId
        ).replace(/-/g, "")}${(priorFees ?? []).length}`,
      });
      postedId = posted.id;
    } catch (error) {
      throw new Error(mapCashierShiftError((error as Error).message));
    }

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: {
        fee_kind: data.kind,
        amount,
        description,
        transaction_id: postedId,
        reference_type: data.kind === "noshow" ? "reservation_no_show" : "reservation_cancel",
        reference_id: data.reservationRoomId ?? data.reservationId,
        ...(data.reservationRoomId ? { reservation_room_id: data.reservationRoomId } : {}),
        ...(noShowPenalty
          ? {
              policy_basis: noShowPenalty.basis,
              policy_amount: noShowPenalty.amount,
              currency: noShowPenalty.currency,
            }
          : {}),
      },
      notes: `${description} posted to folio.`,
      actorMembershipId: me.id,
    });
    return loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
  });

export const waiveCancelOrNoShowFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        kind: z.enum(["cancel", "noshow"]),
        reason: z.string().trim().min(1).max(500),
        reservationRoomId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const me = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.FRONT_OFFICE_FEE_OVERRIDE,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const noShowPenalty =
      data.kind === "noshow"
        ? await loadNoShowPenaltyQuote(
            supabaseAdmin,
            data.restaurantId,
            data.reservationId,
            data.reservationRoomId,
          )
        : null;
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: {
        cancel_fee_waived: data.kind === "cancel",
        noshow_fee_waived: data.kind === "noshow",
        reason: data.reason,
        ...(data.reservationRoomId ? { reservation_room_id: data.reservationRoomId } : {}),
        ...(noShowPenalty
          ? {
              policy_basis: noShowPenalty.basis,
              policy_amount: noShowPenalty.amount,
              currency: noShowPenalty.currency,
            }
          : {}),
      },
      notes: data.kind === "cancel" ? "Cancel fee waived." : "No-show charge waived.",
      actorMembershipId: me.id,
    });
    return { ok: true };
  });

export const completeFoCancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reason: z.string().trim().min(3).max(500),
        reservationRoomId: idSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CompleteCancelResult> => {
    const me = await requirePmsActor(
      context as never,
      data.restaurantId,
      PMS_PERMISSIONS.FRONT_OFFICE_CANCEL,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!isReasonComplete(data.reason)) {
      throw new Error("Enter a cancellation reason of at least 3 characters.");
    }
    await assertCancelFeeSatisfied(supabaseAdmin, {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      membershipId: me.id,
      canWaive: await mayWaiveFee(context, data.restaurantId),
    });

    const units = await supabaseAdmin
      .from("hotel_reservation_rooms")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("reservation_id", data.reservationId);
    if (units.error && !isMissingSchemaError(units.error)) throw new Error(units.error.message);
    const unitRows = units.error ? [] : (units.data ?? []);
    if (unitRows.length > 1 && !data.reservationRoomId) {
      throw reservationError("ROOM_UNIT_REQUIRED");
    }

    return processReservationCancellation(supabaseAdmin, {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      reservationRoomId: data.reservationRoomId ?? null,
      source: "front_office",
      reason: data.reason,
      actorMembershipId: me.id,
      ledgerMembershipId: me.id,
    });
  });

export type CompleteCancelResult = {
  id: string;
  status: string;
  settlement: CancellationSettlement | null;
  settlementError: string | null;
};

/**
 * Cancel fee gate shared by every staff cancel path. A frozen policy with a
 * penalty needs the fee posted or waived first.
 */
export async function assertCancelFeeSatisfied(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  input: { restaurantId: string; reservationId: string; membershipId: string; canWaive: boolean },
): Promise<void> {
  const ctx = await buildCancelNoShowContext(
    supabaseAdmin,
    input.restaurantId,
    input.reservationId,
    "cancel",
    input.membershipId,
    input.canWaive,
  );
  const feeOk = isFeeSatisfied({
    required: ctx.policy.required,
    posted: ctx.posted,
    waived: ctx.waived,
  });
  if (!canCompleteCancel({ reasonOk: true, feeOk })) {
    throw new Error(FEE_REQUIRED_BANNER);
  }
}

const settlementInput = z.object({
  restaurantId: idSchema,
  reservationId: idSchema,
  reservationRoomId: idSchema.optional(),
  kind: z.enum(["cancel", "noshow", "unit_removal"]),
});

/** Dry run: what cancelling would reverse, release, and leave on the folio. */
export const getCancellationSettlementPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => settlementInput.parse(input))
  .handler(async ({ data, context }): Promise<CancellationSettlement> => {
    await requirePmsActorAny(context as never, data.restaurantId, [
      PMS_PERMISSIONS.FRONT_OFFICE_VIEW,
      PMS_PERMISSIONS.RESERVATION_VIEW,
      PMS_PERMISSIONS.CASHIERING_VIEW,
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return settleReservationFolio(supabaseAdmin, {
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      reservationRoomId: data.reservationRoomId ?? null,
      kind: data.kind,
      membershipId: null,
      dryRun: true,
    });
  });

/** Run settlement again for a cancelled or no-show stay. Safe to repeat. */
export const rerunCancellationSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => settlementInput.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ settlement: CancellationSettlement | null; settlementError: string | null }> => {
      const me = await requirePmsActorAll(context as never, data.restaurantId, [
        PMS_PERMISSIONS.CASHIERING_ADJUSTMENT_POST,
      ]);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: stay, error } = await supabaseAdmin
        .from("hotel_reservations")
        .select("status")
        .eq("restaurant_id", data.restaurantId)
        .eq("id", data.reservationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!stay) throw new Error("Reservation not found for this property.");
      if (data.reservationRoomId) {
        const { data: unit } = await supabaseAdmin
          .from("hotel_reservation_rooms")
          .select("status")
          .eq("restaurant_id", data.restaurantId)
          .eq("reservation_id", data.reservationId)
          .eq("id", data.reservationRoomId)
          .maybeSingle();
        if (!unit || (unit.status !== "cancelled" && unit.status !== "no_show")) {
          throw new Error("Only a cancelled or no-show room can be settled.");
        }
      } else if (stay.status !== "cancelled" && stay.status !== "no_show") {
        throw new Error("Only a cancelled or no-show reservation can be settled.");
      }
      return applySettlementAndRecord(supabaseAdmin, {
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        reservationRoomId: data.reservationRoomId ?? null,
        kind: data.kind,
        ledgerMembershipId: me.id,
        actorMembershipId: me.id,
      });
    },
  );

export type CancellationSettlementException = {
  reservationId: string;
  confirmationNumber: string;
  status: string;
  folioId: string;
  folioNumber: string | null;
  currency: string;
  reversibleAmount: number;
  pendingCount: number;
  refundDue: number;
  amountDue: number;
};

/** Cancelled and no-show stays whose open folio still needs settlement. */
export const listCancellationSettlementExceptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ restaurantId: idSchema }).parse(input))
  .handler(async ({ data, context }): Promise<CancellationSettlementException[]> => {
    await requirePmsActorAny(context as never, data.restaurantId, [
      PMS_PERMISSIONS.CASHIERING_VIEW,
      PMS_PERMISSIONS.FRONT_OFFICE_VIEW,
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = (await supabaseAdmin.rpc(
      "list_cancelled_reservation_settlement_exceptions" as never,
      { _restaurant_id: data.restaurantId } as never,
    )) as { data: unknown; error: { message: string } | null };
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
      reservationId: String(row["reservation_id"]),
      confirmationNumber: String(row["confirmation_number"] ?? ""),
      status: String(row["status"] ?? ""),
      folioId: String(row["folio_id"]),
      folioNumber: (row["folio_number"] as string | null) ?? null,
      currency: String(row["currency"] ?? "GBP"),
      reversibleAmount: roundMoney(Number(row["reversible_amount"] ?? 0)),
      pendingCount: Number(row["pending_count"] ?? 0),
      refundDue: roundMoney(Number(row["refund_due"] ?? 0)),
      amountDue: roundMoney(Number(row["amount_due"] ?? 0)),
    }));
  });

export const completeFoNoShow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        today: dateSchema.optional(),
        reason: z.string().trim().min(3).max(500),
        additionalNotes: z.string().trim().max(500).optional(),
        reservationRoomId: idSchema.optional(),
      })
      .superRefine((value, refinement) => {
        const combined = value.additionalNotes?.trim()
          ? `${value.reason.trim()}: ${value.additionalNotes.trim()}`
          : value.reason.trim();
        if (combined.length > 500) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["additionalNotes"],
            message: "Reason and additional notes must be 500 characters or fewer.",
          });
        }
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      status: string;
      reservationRoomId: string | null;
      unitStatus: string | null;
      releasedRoomId: string | null;
      businessDate: string;
      historyId: string;
      settlement: CancellationSettlement | null;
      settlementError: string | null;
    }> => {
      const me = await requirePmsActor(
        context as never,
        data.restaurantId,
        PMS_PERMISSIONS.FRONT_OFFICE_NO_SHOW,
      );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const ctx = await buildCancelNoShowContext(
        supabaseAdmin,
        data.restaurantId,
        data.reservationId,
        "noshow",
        me.id,
        await mayWaiveFee(context, data.restaurantId),
        data.reservationRoomId,
      );

      const reasonOk = isReasonComplete(data.reason);
      const penalty = await loadNoShowPenaltyQuote(
        supabaseAdmin,
        data.restaurantId,
        data.reservationId,
        data.reservationRoomId,
      );
      const posted = ctx.folio.transactions.some((line) =>
        isMatchingNoShowCharge(line, {
          reservationId: data.reservationId,
          reservationRoomId: data.reservationRoomId ?? null,
          expectedAmount: penalty.amount,
        }),
      );
      const feeOk = isFeeSatisfied({
        required: ctx.policy.required && penalty.basis !== "none",
        posted,
        waived: ctx.waived,
      });
      if (!canCompleteNoShow({ reasonOk, feeOk })) {
        if (!reasonOk) throw new Error("Enter a no-show reason of at least 3 characters.");
        throw new Error(FEE_REQUIRED_BANNER);
      }

      const { data: progressRows, error: progressError } = await supabaseAdmin
        .from("fo_checkin_progress")
        .select(
          "reservation_room_id, completed_at, registration_snapshot, deposit_transaction_id, key_issued_at",
        )
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId);
      if (progressError) throw new Error(progressError.message);
      const scopedProgress = (progressRows ?? []).filter((row) =>
        data.reservationRoomId
          ? row.reservation_room_id === data.reservationRoomId
          : row.reservation_room_id == null,
      );
      if (
        scopedProgress.some(
          (row) =>
            Boolean(row.completed_at) ||
            Boolean(row.registration_snapshot) ||
            Boolean(row.deposit_transaction_id) ||
            Boolean(row.key_issued_at),
        )
      ) {
        throw new Error(
          "Check-in progress exists for this room. Resolve it before marking no-show.",
        );
      }

      const { data: completed, error } = await callCompleteNoShowRpc(supabaseAdmin, {
        _restaurant_id: data.restaurantId,
        _reservation_id: data.reservationId,
        _membership_id: me.id,
        _reason: data.reason,
        _additional_notes: blankToNull(data.additionalNotes),
        ...(data.reservationRoomId ? { _reservation_room_id: data.reservationRoomId } : {}),
      });
      if (error) throw reservationError(error.message);
      const settled = await applySettlementAndRecord(supabaseAdmin, {
        restaurantId: data.restaurantId,
        reservationId: data.reservationId,
        reservationRoomId: data.reservationRoomId ?? null,
        kind: "noshow",
        ledgerMembershipId: me.id,
        actorMembershipId: me.id,
      });
      const { resyncGroupBlockInventoryForReservation } = await import("./groups.functions");
      await resyncGroupBlockInventoryForReservation(
        supabaseAdmin,
        me.id,
        data.restaurantId,
        data.reservationId,
      );
      const result = completed as {
        id: string;
        reservation_status: string;
        reservation_room_id: string | null;
        unit_status: string | null;
        released_room_id: string | null;
        business_date: string;
        history_id: string;
      };
      return {
        id: result.id,
        status: result.reservation_status,
        reservationRoomId: result.reservation_room_id,
        unitStatus: result.unit_status,
        releasedRoomId: result.released_room_id,
        businessDate: result.business_date,
        historyId: result.history_id,
        ...settled,
      };
    },
  );

export const listWalkInsHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        from: dateSchema,
        to: dateSchema,
        completion: z.enum(["all", "complete", "incomplete"]).optional(),
        search: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<WalkInHistoryListItem[]> => {
    await requirePmsActor(context as never, data.restaurantId, PMS_PERMISSIONS.FRONT_OFFICE_VIEW);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const completion: WalkInCompletionFilter = data.completion ?? "all";

    const { data: progressRows, error: progressError } = await supabaseAdmin
      .from("fo_checkin_progress")
      .select("reservation_id, walk_in_incomplete")
      .eq("restaurant_id", data.restaurantId);
    if (progressError) throw new Error(progressError.message);

    const progressByReservation = new Map(
      ((progressRows ?? []) as { reservation_id: string; walk_in_incomplete: boolean }[]).map(
        (p) => [p.reservation_id, p.walk_in_incomplete],
      ),
    );

    const { data: sourced, error: sourceError } = await supabaseAdmin
      .from("hotel_reservations")
      .select("id")
      .eq("restaurant_id", data.restaurantId)
      .eq("source", "walk_in");
    if (sourceError) throw new Error(sourceError.message);

    const ids = new Set<string>([
      ...progressByReservation.keys(),
      ...((sourced ?? []) as { id: string }[]).map((r) => r.id),
    ]);
    if (ids.size === 0) return [];

    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const timeZone = (restaurant as { timezone?: string } | null)?.timezone ?? "UTC";

    const { data: rows, error } = await supabaseAdmin
      .from("hotel_reservations")
      .select(
        "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, adults, children, status, special_requests, created_at, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, vip_status ), room_types!hotel_reservations_type_same_property ( name ), hotel_rooms!hotel_reservations_room_same_type ( room_number )",
      )
      .eq("restaurant_id", data.restaurantId)
      .in("id", [...ids])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: historyRows } = await supabaseAdmin
      .from("hotel_reservation_history")
      .select("reservation_id, actor_membership_id, created_at")
      .eq("restaurant_id", data.restaurantId)
      .in("reservation_id", [...ids])
      .eq("event_type", "created")
      .order("created_at", { ascending: true });

    const actorByReservation = new Map<string, string>();
    for (const row of (historyRows ?? []) as {
      reservation_id: string;
      actor_membership_id: string | null;
      created_at: string;
    }[]) {
      if (!actorByReservation.has(row.reservation_id) && row.actor_membership_id) {
        actorByReservation.set(row.reservation_id, row.actor_membership_id);
      }
    }

    const actorIds = [...new Set(actorByReservation.values())];
    const actorNames = new Map<string, string>();
    await Promise.all(
      actorIds.map(async (membershipId) => {
        actorNames.set(
          membershipId,
          await actorDisplayName(supabaseAdmin, membershipId, data.restaurantId),
        );
      }),
    );

    const search = (data.search ?? "").trim().toLowerCase();
    const out: WalkInHistoryListItem[] = [];
    for (const row of (rows ?? []) as Array<{
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
      created_at: string;
      guest_profiles: {
        first_name: string;
        last_name: string | null;
        phone: string | null;
        vip_status: boolean;
      } | null;
      room_types: { name: string } | null;
      hotel_rooms: { room_number: string } | null;
    }>) {
      const createdLocal = new Date(row.created_at).toLocaleDateString("en-CA", { timeZone });
      if (createdLocal < data.from || createdLocal > data.to) continue;
      const walkInIncomplete = progressByReservation.get(row.id) === true;
      if (completion === "complete" && walkInIncomplete) continue;
      if (completion === "incomplete" && !walkInIncomplete) continue;
      const guestName =
        joinName(row.guest_profiles?.first_name ?? "", row.guest_profiles?.last_name ?? null) ||
        "Guest";
      if (
        search &&
        !guestName.toLowerCase().includes(search) &&
        !row.confirmation_number.toLowerCase().includes(search)
      ) {
        continue;
      }
      const actorId = actorByReservation.get(row.id);
      const createdBy = walkInCreatedByLabel(
        actorId ? actorNames.get(actorId) : CREATED_BY_UNKNOWN,
      );
      const stay: FrontOfficeStay = {
        id: row.id,
        confirmationNumber: row.confirmation_number,
        guestId: row.guest_id,
        guestName,
        guestVip: row.guest_profiles?.vip_status ?? false,
        guestPhone: row.guest_profiles?.phone ?? null,
        roomTypeId: row.room_type_id,
        roomTypeName: row.room_types?.name ?? "Room type",
        roomId: row.room_id,
        roomNumber: row.hotel_rooms?.room_number ?? null,
        arrivalDate: row.arrival_date,
        departureDate: row.departure_date,
        nights: nightsBetween(row.arrival_date, row.departure_date),
        adults: row.adults,
        children: row.children,
        status: row.status as FrontOfficeStay["status"],
        specialRequests: row.special_requests,
        overstay: false,
        walkInIncomplete,
      };
      out.push({
        id: row.id,
        createdAt: row.created_at,
        guestName,
        confirmationNumber: row.confirmation_number,
        roomNumber: stay.roomNumber,
        createdBy,
        walkInIncomplete,
        stay,
      });
    }
    return out;
  });

export function leftoverCredit(balance: number): number {
  return isCreditBalance(balance) ? roundMoney(Math.abs(balance)) : 0;
}
