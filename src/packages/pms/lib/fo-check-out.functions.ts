/**
 * FO-FS2 — Check-out stepper server writes.
 *
 * A–D gates live here. The Live status flip is still check_out_hotel_reservation
 * via completeFoCheckOut after the gates pass. Folio money stays on the
 * Cashiering ledger (open_folio_for_reservation / post_folio_transaction /
 * close_guest_folio). No second ledger.
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
import { cashierError, requireCashierOperator } from "./cashiering.server";
import {
  canCompleteCheckOut,
  canContinueClose,
  canContinueFolio,
  canContinueSettle,
  canContinueStay,
  checkoutDocumentSubject,
  isFolioSettled,
  mapCashierShiftError,
  mapSettlementMethod,
  overrideKindForBalance,
  paymentAmountAllowed,
  platformEmailConfigured,
  renderCheckoutDocumentHtml,
  renderCheckoutDocumentText,
  roundMoney,
  shouldCloseFolioAtCheckout,
  type CheckOutDocumentSnapshot,
  type CheckoutOverrideKind,
} from "./fo-check-out";
import type { FrontOfficeStay } from "./frontoffice.functions";
import { nightsBetween } from "./reservation-dates";

const idSchema = z.string().uuid();

export type CheckOutLedgerLine = {
  id: string;
  type: string;
  description: string;
  amount: number;
  postedAt: string;
};

export type CheckOutFolioState = {
  folioId: string | null;
  folioNumber: string | null;
  status: "open" | "closed" | null;
  currency: string;
  charges: number;
  credits: number;
  balance: number;
  transactions: CheckOutLedgerLine[];
};

export type CheckOutOverrideState = {
  recorded: boolean;
  kind: CheckoutOverrideKind | null;
  reason: string | null;
};

export type CheckOutContext = {
  stay: FrontOfficeStay;
  rateMissing: boolean;
  propertyName: string;
  guestEmail: string | null;
  folio: CheckOutFolioState;
  override: CheckOutOverrideState;
  canOverride: boolean;
  emailConfigured: boolean;
  actorName: string;
};

const EMPTY_FOLIO: CheckOutFolioState = {
  folioId: null,
  folioNumber: null,
  status: null,
  currency: "GBP",
  charges: 0,
  credits: 0,
  balance: 0,
  transactions: [],
};

function joinName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function emailSecrets(): { apiKey: string | null; from: string | null } {
  return {
    apiKey: process.env["RESEND_API_KEY"]?.trim() || null,
    from: process.env["RECEIPT_EMAIL_FROM"]?.trim() || null,
  };
}

function requireSupervisor(role: string): void {
  if (!(MANAGE_ROLES as readonly string[]).includes(role)) {
    throw new Error("You don't have permission to override checkout settlement.");
  }
}

function isCheckoutOverride(values: unknown): values is {
  checkout_override: true;
  kind?: CheckoutOverrideKind;
  reason?: string;
} {
  if (!values || typeof values !== "object") return false;
  return (values as { checkout_override?: unknown }).checkout_override === true;
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
  guestId: string;
  guestEmail: string | null;
}> {
  const { data: row, error } = await supabaseAdmin
    .from("hotel_reservations")
    .select(
      "id, confirmation_number, guest_id, room_type_id, room_id, arrival_date, departure_date, adults, children, status, special_requests, rate_plan_id, room_subtotal, guest_profiles!hotel_reservations_guest_same_property ( first_name, last_name, phone, email, vip_status ), room_types!hotel_reservations_type_same_property ( name ), hotel_rooms!hotel_reservations_room_same_type ( room_number )",
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
  return {
    stay,
    rateMissing: row.rate_plan_id == null && (row.room_subtotal == null || Number(row.room_subtotal) === 0),
    guestId: row.guest_id,
    guestEmail: guest?.email ?? null,
  };
}

async function loadFolioState(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<CheckOutFolioState> {
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

  const transactions: CheckOutLedgerLine[] = (
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

async function loadOverride(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
  reservationId: string,
): Promise<CheckOutOverrideState> {
  const { data } = await supabaseAdmin
    .from("hotel_reservation_history")
    .select("new_values, notes")
    .eq("restaurant_id", restaurantId)
    .eq("reservation_id", reservationId)
    .eq("event_type", "amended")
    .order("created_at", { ascending: false })
    .limit(30);

  for (const row of (data ?? []) as { new_values: unknown; notes: string | null }[]) {
    if (isCheckoutOverride(row.new_values)) {
      return {
        recorded: true,
        kind: row.new_values.kind ?? null,
        reason: row.new_values.reason ?? row.notes,
      };
    }
  }
  return { recorded: false, kind: null, reason: null };
}

async function loadPropertyName(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  restaurantId: string,
): Promise<string> {
  const { data } = await supabaseAdmin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? "Property";
}

function documentSnapshot(
  stay: FrontOfficeStay,
  folio: CheckOutFolioState,
  propertyName: string,
  overrideOpen: boolean,
): CheckOutDocumentSnapshot {
  return {
    propertyName,
    guestName: stay.guestName,
    confirmationNumber: stay.confirmationNumber,
    folioNumber: folio.folioNumber ?? "—",
    roomNumber: stay.roomNumber,
    arrivalDate: stay.arrivalDate,
    departureDate: stay.departureDate,
    currency: folio.currency,
    lines: folio.transactions.map((t) => ({
      description: t.description,
      amount: t.amount,
      type: t.type,
      postedAt: t.postedAt,
    })),
    charges: folio.charges,
    credits: folio.credits,
    balance: folio.balance,
    folioStatus: folio.status ?? "open",
    overrideOpen,
  };
}

export const getCheckOutContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckOutContext> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
    const [folio, override, propertyName, actorName] = await Promise.all([
      loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId),
      loadOverride(supabaseAdmin, data.restaurantId, data.reservationId),
      loadPropertyName(supabaseAdmin, data.restaurantId),
      actorDisplayName(supabaseAdmin, me.id, data.restaurantId),
    ]);
    const secrets = emailSecrets();
    return {
      stay: loaded.stay,
      rateMissing: loaded.rateMissing,
      propertyName,
      guestEmail: loaded.guestEmail,
      folio,
      override,
      canOverride: (MANAGE_ROLES as readonly string[]).includes(me.role),
      emailConfigured: platformEmailConfigured(secrets),
      actorName,
    };
  });

export const ensureCheckOutFolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckOutFolioState> => {
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

export const postCheckOutPayment = createServerFn({ method: "POST" })
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
  .handler(async ({ data, context }): Promise<CheckOutFolioState> => {
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
    const folio = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    const amount = roundMoney(data.amount);
    if (!paymentAmountAllowed(amount, folio.balance)) {
      throw new Error("Enter an amount no greater than the remaining balance.");
    }

    const ledgerMethod = mapSettlementMethod(data.method);
    const reference = blankToNull(data.reference);
    const description = reference
      ? `Check-out payment (${ledgerMethod}) · ${reference}`
      : `Check-out payment (${ledgerMethod})`;

    // Same live path as postFolioEntry({ type: "payment" }) — do not invent a second ledger.
    const posted = await supabaseAdmin.rpc("post_folio_transaction", {
      _restaurant_id: data.restaurantId,
      _folio_id: folioId,
      _type: "payment",
      _category: "payment",
      _description: description,
      _amount: amount,
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

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: { checkout_payment_id: txnId, amount, method: ledgerMethod },
      notes: "Check-out payment posted to folio.",
      actorMembershipId: me.id,
    });
    return loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
  });

export const overrideCheckOutSettlement = createServerFn({ method: "POST" })
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
  .handler(async ({ data, context }): Promise<{ ok: true; kind: CheckoutOverrideKind }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    requireSupervisor(me.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folio = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    const kind = overrideKindForBalance(folio.balance);
    if (!kind) throw new Error("The folio is already settled. An override is not needed.");

    await recordReservationEvent({
      restaurantId: data.restaurantId,
      reservationId: data.reservationId,
      eventType: "amended",
      newValues: {
        checkout_override: true,
        kind,
        reason: data.reason,
        balance: folio.balance,
        folio_id: folio.folioId,
      },
      notes: "Checkout settlement overridden — folio left open.",
      actorMembershipId: me.id,
    });
    return { ok: true, kind };
  });

/**
 * Thin close used at check-out only. Still calls close_guest_folio, only when
 * |balance| < 0.01, and never after an override. Gated by FO reservation
 * manager + cashier-operator. The RPC itself is balance-only (no manager
 * check) — if it later rejects non-managers, surface the error; do not rewrite it.
 */
export const closeFolioAtCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckOutFolioState> => {
    await requireReservationManager(context as never, data.restaurantId);
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folio = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    if (!folio.folioId) throw new Error("Open the folio before closing it.");
    const override = await loadOverride(supabaseAdmin, data.restaurantId, data.reservationId);
    if (override.recorded) {
      throw new Error("Override leaves the folio open. Do not close a non-zero or overridden folio.");
    }
    if (!shouldCloseFolioAtCheckout({ balance: folio.balance, override: false, folioStatus: folio.status })) {
      if (!isFolioSettled(folio.balance)) {
        throw new Error("Settle the outstanding balance before closing this folio.");
      }
      return folio;
    }

    const { error } = await supabaseAdmin.rpc("close_guest_folio", {
      _restaurant_id: data.restaurantId,
      _folio_id: folio.folioId,
      _membership_id: me.id,
    });
    if (error) throw cashierError(error.message);
    return loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
  });

export const sendCheckOutDocumentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        reservationId: idSchema,
        toEmail: z.string().trim().max(254),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true } | { ok: false; message: string; configured: boolean }> => {
      await requireReservationManager(context as never, data.restaurantId);
      const secrets = emailSecrets();
      if (!platformEmailConfigured(secrets)) {
        return { ok: false, message: "Email not configured.", configured: false };
      }
      const to = data.toEmail.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return { ok: false, message: "Enter a valid email address.", configured: true };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
      const folio = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
      const override = await loadOverride(supabaseAdmin, data.restaurantId, data.reservationId);
      const propertyName = await loadPropertyName(supabaseAdmin, data.restaurantId);
      const snapshot = documentSnapshot(loaded.stay, folio, propertyName, override.recorded);

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secrets.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: secrets.from,
          to: [to],
          subject: checkoutDocumentSubject(snapshot),
          html: renderCheckoutDocumentHtml(snapshot),
          text: renderCheckoutDocumentText(snapshot),
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error("[sendCheckOutDocumentEmail]", response.status, body);
        return { ok: false, message: "The guest document could not be sent. Try again.", configured: true };
      }
      return { ok: true };
    },
  );

export const completeFoCheckOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ id: string; roomNumber: string | null }> => {
    const me = await requireReservationManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const loaded = await loadStay(supabaseAdmin, data.restaurantId, data.reservationId);
    const stayOk = canContinueStay({ loaded: true, status: loaded.stay.status });
    if (!stayOk) throw new Error("Only in-house stays can be checked out.");

    const folio = await loadFolioState(supabaseAdmin, data.restaurantId, data.reservationId);
    const override = await loadOverride(supabaseAdmin, data.restaurantId, data.reservationId);
    const folioOk = canContinueFolio({ folioId: folio.folioId });
    const settleOk = canContinueSettle({ balance: folio.balance, override: override.recorded });
    const closeOk = canContinueClose({
      balance: folio.balance,
      override: override.recorded,
      folioStatus: folio.status,
    });
    if (!canCompleteCheckOut({ stayOk, folioOk, settleOk, closeOk })) {
      if (!folioOk) throw new Error("Open the folio before completing check-out.");
      if (!settleOk) throw new Error("Settle the folio or request a supervisor override.");
      if (!closeOk) throw new Error("Close the folio at zero before completing check-out.");
      throw new Error("Check-out cannot finish until every step is complete.");
    }

    const { error } = await supabaseAdmin.rpc("check_out_hotel_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (error) throw reservationError(error.message);
    return { id: data.reservationId, roomNumber: loaded.stay.roomNumber };
  });
