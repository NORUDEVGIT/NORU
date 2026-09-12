/**
 * FO-FS3 — Cancel / No-show money writes.
 *
 * Fee/charge posts through post_folio_transaction type `charge` before the
 * Live status flip. No Cashiering RPC rewrite. Deposits stay visible only.
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
  type ReservationEventType,
} from "./reservations.server";
import { cashierError, requireCashierOperator } from "./cashiering.server";
import { parseSnapshot } from "./rates.server";
import type { FrontOfficeStay } from "./frontoffice.functions";
import { nightsBetween } from "./reservation-dates";
import {
  canCompleteCancel,
  canCompleteNoShow,
  CREATED_BY_UNKNOWN,
  FEE_REQUIRED_BANNER,
  feeAmountAllowed,
  folioHasPostedFee,
  isCreditBalance,
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

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export type CancelNoShowLedgerLine = {
  id: string;
  type: string;
  description: string;
  amount: number;
  postedAt: string;
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
  return { charges: roundMoney(charges), credits: roundMoney(credits), balance: roundMoney(charges - credits) };
}

function requireSupervisor(role: string): void {
  if (!(MANAGE_ROLES as readonly string[]).includes(role)) {
    throw new Error("You don't have permission to waive this fee.");
  }
}

function isFeeWaiver(
  values: unknown,
  kind: CancelNoShowKind,
): values is { reason?: string } {
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
    row.room_subtotal === null || row.room_subtotal === undefined ? null : Number(row.room_subtotal);
  return {
    stay,
    rateMissing: row.rate_plan_id == null && (roomSubtotal == null || roomSubtotal === 0),
    roomSubtotal,
    nightlyRates: parseSnapshot(row.nightly_rate_snapshot),
  };
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
    .select("id, transaction_type, description, amount, posted_at")
    .eq("restaurant_id", restaurantId)
    .eq("folio_id", folio.id)
    .order("posted_at", { ascending: true });

  const transactions: CancelNoShowLedgerLine[] = (
    (txns ?? []) as {
      id: string;
      transaction_type: string;
      description: string;
      amount: number | string;
      posted_at: string;
    }[]
  ).map((t) => ({
    id: t.id,
    type: t.transaction_type,
    description: t.description,
    amount: Number(t.amount),
    postedAt: t.posted_at,
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
      return {
        waived: true,
        reason: (row.new_values as { reason?: string }).reason ?? row.notes,
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
    .select("fo_cancel_fee_required, fo_cancel_fee_default, fo_noshow_fee_required, fo_noshow_fee_default")
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

async function buildContext(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
  kind: CancelNoShowKind,
  membershipId: string,
  role: string,
): Promise<CancelNoShowContext> {
  const loaded = await loadStay(supabaseAdmin, restaurantId, reservationId);
  const [folio, waiver, policy, actorName] = await Promise.all([
    loadFolioState(supabaseAdmin, restaurantId, reservationId),
    loadWaiver(supabaseAdmin, restaurantId, reservationId, kind),
    loadFeePolicy(supabaseAdmin, restaurantId, kind),
    actorDisplayName(supabaseAdmin, membershipId, restaurantId),
  ]);
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
    posted: folioHasPostedFee(folio.transactions, kind),
    waived: waiver.waived,
    waiveReason: waiver.reason,
    canWaive: (MANAGE_ROLES as readonly string[]).includes(role),
    rateMissing: loaded.rateMissing,
    actorName,
  };
}

export const getCancelNoShowContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        kind: z.enum(["cancel", "noshow"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CancelNoShowContext> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return buildContext(supabaseAdmin, data.restaurantId, data.reservationId, data.kind, me.id, me.role);
  });

export const ensureCancelNoShowFolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CancelNoShowFolioState> => {
    await requireReservationManager(context as never, data.restaurantId);
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    if (existing.folioId) return existing;

    const { error } = await supabaseAdmin.rpc("open_folio_for_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
  });

/**
 * Thin charge wrapper. Still calls post_folio_transaction type `charge`.
 * Gated FO requireReservationManager + cashier-operator, before status flip.
 * The RPC itself is not manager-only today. If it later rejects non-managers,
 * surface the error — do not rewrite the RPC.
 */
export const postCancelOrNoShowFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        kind: z.enum(["cancel", "noshow"]),
        amount: z.number().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CancelNoShowFolioState> => {
    await requireReservationManager(context as never, data.restaurantId);
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
    if (loaded.stay.status === "cancelled" || loaded.stay.status === "no_show") {
      throw new Error("Cancelled and no-show reservations can't be billed.");
    }

    const opened = await supabaseAdmin.rpc("open_folio_for_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (opened.error) throw cashierError(opened.error.message);
    const folioId = (opened.data as { id: string }).id;
    const amount = roundMoney(data.amount);
    if (!feeAmountAllowed(amount)) throw new Error("Enter an amount greater than zero.");

    const description = data.kind === "cancel" ? "Cancel fee" : "No-show charge";
    const posted = await supabaseAdmin.rpc("post_folio_transaction", {
      _restaurant_id: data.restaurantId,
      _folio_id: folioId,
      _type: "charge",
      _category: "manual",
      _description: description,
      _amount: amount,
      _reference_type: null as unknown as string,
      _reference_id: null as unknown as string,
      _membership_id: me.id,
    });
    if (posted.error) {
      throw new Error(mapCashierShiftError(cashierError(posted.error.message).message));
    }

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: {
        fee_kind: data.kind,
        amount,
        description,
        transaction_id: (posted.data as { id: string }).id,
      },
      notes: `${description} posted to folio.`,
      actorMembershipId: me.id,
    });
    return loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
  });

export const waiveCancelOrNoShowFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        kind: z.enum(["cancel", "noshow"]),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    requireSupervisor(me.role);
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: {
        cancel_fee_waived: data.kind === "cancel",
        noshow_fee_waived: data.kind === "noshow",
        reason: data.reason,
      },
      notes:
        data.kind === "cancel" ? "Cancel fee waived." : "No-show charge waived.",
      actorMembershipId: me.id,
    });
    return { ok: true };
  });

export const completeFoCancel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: "cancelled" }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ctx = await buildContext(supabaseAdmin, data.restaurantId, data.reservationId, "cancel", me.id, me.role);

    const reasonOk = isReasonComplete(data.reason);
    const feeOk = isFeeSatisfied({
      required: ctx.policy.required,
      posted: ctx.posted,
      waived: ctx.waived,
    });
    if (!canCompleteCancel({ reasonOk, feeOk })) {
      if (!reasonOk) throw new Error("Enter a cancellation reason of at least 3 characters.");
      throw new Error(FEE_REQUIRED_BANNER);
    }

    if (ctx.stay.status === "cancelled") {
      return { id: data.reservationId, status: "cancelled" };
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from("hotel_reservations")
      .select("id, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.reservationId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Reservation not found for this property.");

    const { error } = await supabaseAdmin
      .from("hotel_reservations")
      .update({
        status: "cancelled",
        cancellation_reason: blankToNull(data.reason),
      })
      .eq("id", data.reservationId)
      .eq("restaurant_id", data.restaurantId);
    if (error) throw new Error(error.message);

    const eventType: ReservationEventType = "cancelled";
    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType,
      previousValues: { status: existing.status },
      newValues: { status: "cancelled" },
      notes: blankToNull(data.reason),
      actorMembershipId: me.id,
    });
    return { id: data.reservationId, status: "cancelled" };
  });

export const completeFoNoShow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        today: dateSchema,
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; status: "no_show" }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ctx = await buildContext(supabaseAdmin, data.restaurantId, data.reservationId, "noshow", me.id, me.role);

    const reasonOk = isReasonComplete(data.reason);
    const feeOk = isFeeSatisfied({
      required: ctx.policy.required,
      posted: ctx.posted,
      waived: ctx.waived,
    });
    if (!canCompleteNoShow({ reasonOk, feeOk })) {
      if (!reasonOk) throw new Error("Enter a no-show reason of at least 3 characters.");
      throw new Error(FEE_REQUIRED_BANNER);
    }

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: { no_show_reason: data.reason },
      notes: data.reason,
      actorMembershipId: me.id,
    });

    const { error } = await supabaseAdmin.rpc("mark_hotel_reservation_no_show", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _business_date: data.today,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId, status: "no_show" };
  });

export const listWalkInsHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
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
    await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const completion: WalkInCompletionFilter = data.completion ?? "all";

    const { data: progressRows, error: progressError } = await supabaseAdmin
      .from("fo_checkin_progress")
      .select("reservation_id, walk_in_incomplete")
      .eq("restaurant_id", data.restaurantId);
    if (progressError) throw new Error(progressError.message);

    const progressByReservation = new Map(
      ((progressRows ?? []) as { reservation_id: string; walk_in_incomplete: boolean }[]).map((p) => [
        p.reservation_id,
        p.walk_in_incomplete,
      ]),
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
        actorNames.set(membershipId, await actorDisplayName(supabaseAdmin, membershipId, data.restaurantId));
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
        joinName(row.guest_profiles?.first_name ?? "", row.guest_profiles?.last_name ?? null) || "Guest";
      if (
        search &&
        !guestName.toLowerCase().includes(search) &&
        !row.confirmation_number.toLowerCase().includes(search)
      ) {
        continue;
      }
      const actorId = actorByReservation.get(row.id);
      const createdBy = walkInCreatedByLabel(actorId ? actorNames.get(actorId) : CREATED_BY_UNKNOWN);
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
