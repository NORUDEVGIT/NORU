import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  TRANSACTION_TYPES,
  assertIdempotencyKey,
  blankToNull,
  callPostFolioTransaction,
  canManageCashiering,
  cashierError,
  categoryForType,
  CORRECTION_AUTHORIZER,
  correctionThresholdNotice,
  remainingOnPaymentSource,
  requireCashierManager,
  requireCashierOperator,
  requireCashieringAccess,
  CASHIER_OPERATE_ROLES,
  type FolioStatus,
  type TransactionType,
} from "./cashiering.server";
import { callerMembership } from "@/core/lib/workforce.server";
import { folioTenderFromCatalogue } from "./pms-polish1-payment-admin";
import { loadPolish1Snapshot } from "./pms-polish1-payment-admin.functions";
import { isMissingSchemaError } from "./pms-set2-structure";
import { formatDepositPolicyResult, type DepositPolicyType } from "./payments-card3.server";

const idSchema = z.string().uuid();

export type CashierResult = { ok: true; id: string } | { ok: false; message: string };

/* ------------------------------------------------------------------- types */

export interface FolioRow {
  id: string;
  folioNumber: string;
  status: FolioStatus;
  currency: string;
  guestName: string;
  reservationId: string | null;
  confirmationNumber: string | null;
  openedAt: string;
  closedAt: string | null;
  charges: number;
  credits: number;
  balance: number;
  unsettledCheckout: boolean;
  roomNumber: string | null;
  roomTypeName: string | null;
  reservationStatus: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  ratePlanName?: string | null;
  marketSegment?: string | null;
  bookingSource?: string | null;
}

export interface FolioTransactionRow {
  id: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  referenceType: string | null;
  paymentMethod: string | null;
  postedBy: string | null;
  originalTransactionId: string | null;
  sourceDescription: string | null;
}

export interface FolioDetail extends FolioRow {
  guestId: string;
  guestEmail: string | null;
  guestPhone: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  reservationStatus: string | null;
  transactions: FolioTransactionRow[];
}

export interface CashierShiftRow {
  id: string;
  membershipId: string;
  staffName: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  openingCash: number | null;
  closingCash: number | null;
  cashIn: number;
  cashOut: number;
  hotelCash: number;
  expected: number;
  variance: number | null;
  notes: string | null;
}

export interface CashieringDashboard {
  currency: string;
  openFolios: number;
  outstandingBalance: number;
  todayPayments: number;
  todayCharges: number;
  todayDeposits: number;
  todayRefunds: number;
  /** Folio-to-folio transfers post via post_folio_transfer (Phase 7). */
  transfersSupported: boolean;
  openShifts: number;
  myOpenShiftId: string | null;
}

/* ------------------------------------------------------------------ access */

export const getDefaultDepositPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<{ summary: string | null }> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: restaurant }, policies] = await Promise.all([
      supabaseAdmin
        .from("restaurants")
        .select("currency_code")
        .eq("id", data.restaurantId)
        .maybeSingle(),
      supabaseAdmin
        .from("pms_deposit_policies")
        .select("name, required, deposit_type, deposit_value, is_default, active")
        .eq("restaurant_id", data.restaurantId),
    ]);
    if (policies.error) {
      if (isMissingSchemaError(policies.error)) return { summary: null };
      throw cashierError(policies.error.message);
    }
    const rows = (policies.data ?? []) as Array<{
      name: string;
      required: boolean | null;
      deposit_type: string | null;
      deposit_value: number | string | null;
      is_default: boolean | null;
      active: boolean | null;
    }>;
    const policy = rows.find((row) => row.active !== false && row.is_default === true);
    const depositType = (["none", "percent", "fixed", "first_night"] as const).includes(
      policy?.deposit_type as DepositPolicyType,
    )
      ? (policy?.deposit_type as DepositPolicyType)
      : "none";
    return {
      summary: formatDepositPolicyResult(
        policy
          ? {
              name: policy.name,
              required: policy.required === true,
              depositType,
              depositValue: Number(policy.deposit_value ?? 0),
            }
          : null,
        String((restaurant as { currency_code?: string } | null)?.currency_code ?? ""),
      ),
    };
  });

export const getCashieringCorrectionNotice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      authorizer: string;
      adjustmentThreshold: string | null;
      discountThreshold: string | null;
    }> => {
      await requireCashieringAccess(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return {
        authorizer: CORRECTION_AUTHORIZER,
        adjustmentThreshold: await readThresholdNotice(
          supabaseAdmin,
          data.restaurantId,
          "cashiering.adjustment.post",
        ),
        discountThreshold: await readThresholdNotice(
          supabaseAdmin,
          data.restaurantId,
          "cashiering.discount.post",
        ),
      };
    },
  );

async function readThresholdNotice(
  supabaseAdmin: SupabaseAdmin,
  restaurantId: string,
  code: string,
): Promise<string | null> {
  const permission = await supabaseAdmin
    .from("pms_permissions")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (permission.error || !permission.data?.id) return null;
  const rule = await supabaseAdmin
    .from("pms_approval_rules")
    .select("threshold_amount, threshold_unit, active")
    .eq("restaurant_id", restaurantId)
    .eq("permission_id", permission.data.id)
    .eq("active", true)
    .maybeSingle();
  if (rule.error || !rule.data) return null;
  const unit =
    rule.data.threshold_unit === "percent" || rule.data.threshold_unit === "amount"
      ? rule.data.threshold_unit
      : null;
  return correctionThresholdNotice(
    rule.data.threshold_amount == null ? null : Number(rule.data.threshold_amount),
    unit,
  );
}

export const getCashieringAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    return {
      canManage: canManageCashiering(me.role),
      canOperate: (CASHIER_OPERATE_ROLES as readonly string[]).includes(me.role),
      role: me.role,
      membershipId: me.id,
    };
  });

/* ------------------------------------------------------------------ helpers */

type TxnRow = {
  id: string;
  folio_id: string;
  transaction_type: string;
  category: string;
  description: string;
  amount: number | string;
  posted_at: string;
  reference_type: string | null;
  payment_method?: string | null;
  posted_by_membership_id?: string | null;
  original_transaction_id?: string | null;
};

function totals(rows: { amount: number }[]): { charges: number; credits: number; balance: number } {
  let charges = 0;
  let credits = 0;
  for (const r of rows) {
    if (r.amount >= 0) charges += r.amount;
    else credits += -r.amount;
  }
  return { charges: round2(charges), credits: round2(credits), balance: round2(charges - credits) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function guestName(g: { first_name?: string | null; last_name?: string | null } | null): string {
  if (!g) return "Guest";
  return [g.first_name, g.last_name].filter(Boolean).join(" ").trim() || "Guest";
}

type SupabaseAdmin = typeof import("@/integrations/supabase/client.server").supabaseAdmin;

async function staffNames(
  supabaseAdmin: SupabaseAdmin,
  restaurantId: string,
  membershipIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(membershipIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return names;
  const { data: members } = await supabaseAdmin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  const memberRows = (members ?? []) as Array<{ id: string; user_id: string }>;
  const { data: profiles } = memberRows.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in(
          "id",
          memberRows.map((m) => m.user_id),
        )
    : {
        data: [] as Array<{
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
        }>,
      };
  const byUser = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Staff member",
    ]),
  );
  for (const member of memberRows)
    names.set(member.id, byUser.get(member.user_id) ?? "Staff member");
  return names;
}

/* ------------------------------------------------------------------- reads */

export const listFolios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; status?: string; search?: string }) =>
    z
      .object({
        restaurantId: idSchema,
        status: z.enum(["all", "open", "closed"]).optional(),
        search: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FolioRow[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("guest_folios")
      .select(
        "id, folio_number, status, currency, opened_at, closed_at, reservation_id, guest_id, settlement_exception, " +
          "guest_profiles!guest_folios_guest_same_property(first_name, last_name), " +
          "hotel_reservations!guest_folios_reservation_same_property(confirmation_number, status, arrival_date, departure_date, hotel_rooms!hotel_reservations_room_same_type(room_number), room_types!hotel_reservations_type_same_property(name))",
      )
      .eq("restaurant_id", data.restaurantId)
      .order("opened_at", { ascending: false })
      .limit(200);

    if (data.status && data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw cashierError(error.message);

    const list = (rows ?? []) as unknown as Array<{
      id: string;
      folio_number: string;
      status: FolioStatus;
      currency: string;
      opened_at: string;
      closed_at: string | null;
      reservation_id: string | null;
      guest_id: string;
      settlement_exception: string | null;
      guest_profiles: { first_name: string | null; last_name: string | null } | null;
      hotel_reservations: {
        confirmation_number: string;
        status: string;
        arrival_date: string;
        departure_date: string;
        hotel_rooms: { room_number: string } | null;
        room_types: { name: string } | null;
      } | null;
    }>;

    const ids = list.map((f) => f.id);
    const byFolio = new Map<string, { amount: number }[]>();
    if (ids.length > 0) {
      const { data: txns } = await supabaseAdmin
        .from("folio_transactions")
        .select("folio_id, amount")
        .eq("restaurant_id", data.restaurantId)
        .in("folio_id", ids);
      for (const t of (txns ?? []) as { folio_id: string; amount: number | string }[]) {
        const bucket = byFolio.get(t.folio_id) ?? [];
        bucket.push({ amount: Number(t.amount) });
        byFolio.set(t.folio_id, bucket);
      }
    }

    const term = (data.search ?? "").trim().toLowerCase();

    return list
      .map((f) => {
        const sums = totals(byFolio.get(f.id) ?? []);
        return {
          id: f.id,
          folioNumber: f.folio_number,
          status: f.status,
          currency: f.currency,
          guestName: guestName(f.guest_profiles),
          reservationId: f.reservation_id,
          confirmationNumber: f.hotel_reservations?.confirmation_number ?? null,
          openedAt: f.opened_at,
          closedAt: f.closed_at,
          unsettledCheckout: f.settlement_exception === "unsettled_checkout" && f.status === "open",
          roomNumber: f.hotel_reservations?.hotel_rooms?.room_number ?? null,
          roomTypeName: f.hotel_reservations?.room_types?.name ?? null,
          reservationStatus: f.hotel_reservations?.status ?? null,
          arrivalDate: f.hotel_reservations?.arrival_date ?? null,
          departureDate: f.hotel_reservations?.departure_date ?? null,
          ...sums,
        };
      })
      .filter(
        (f) =>
          term === "" ||
          f.folioNumber.toLowerCase().includes(term) ||
          f.guestName.toLowerCase().includes(term) ||
          (f.confirmationNumber ?? "").toLowerCase().includes(term) ||
          (f.roomNumber ?? "").toLowerCase().includes(term),
      );
  });

export const getFolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; folioId: string }) =>
    z.object({ restaurantId: idSchema, folioId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<FolioDetail | null> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("guest_folios")
      .select(
        "id, folio_number, status, currency, opened_at, closed_at, reservation_id, guest_id, settlement_exception, " +
          "guest_profiles!guest_folios_guest_same_property(first_name, last_name, email, phone), " +
          "hotel_reservations!guest_folios_reservation_same_property(confirmation_number, arrival_date, departure_date, status, market_segment, commercial_booking_source, hotel_rooms!hotel_reservations_room_same_type(room_number), room_types!hotel_reservations_type_same_property(name), rate_plan:hotel_rate_plans!hotel_reservations_rate_plan_same_property(name))",
      )
      .eq("id", data.folioId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (error) throw cashierError(error.message);
    if (!row) return null;

    const f = row as unknown as {
      id: string;
      folio_number: string;
      status: FolioStatus;
      currency: string;
      opened_at: string;
      closed_at: string | null;
      reservation_id: string | null;
      guest_id: string;
      settlement_exception: string | null;
      guest_profiles: {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
      } | null;
      hotel_reservations: {
        confirmation_number: string;
        arrival_date: string;
        departure_date: string;
        status: string;
        market_segment: string | null;
        commercial_booking_source: string | null;
        hotel_rooms: { room_number: string } | null;
        room_types: { name: string } | null;
        rate_plan: { name: string } | null;
      } | null;
    };

    const { data: txns } = await supabaseAdmin
      .from("folio_transactions")
      .select(
        "id, folio_id, transaction_type, category, description, amount, posted_at, reference_type, payment_method, posted_by_membership_id, original_transaction_id",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("folio_id", f.id)
      .order("posted_at", { ascending: true });

    const txnRows = (txns ?? []) as TxnRow[];
    const names = await staffNames(
      supabaseAdmin,
      data.restaurantId,
      txnRows.map((t) => t.posted_by_membership_id),
    );
    const descriptions = new Map(txnRows.map((t) => [t.id, t.description]));
    const transactions: FolioTransactionRow[] = txnRows.map((t) => ({
      id: t.id,
      type: t.transaction_type as TransactionType,
      category: t.category,
      description: t.description,
      amount: Number(t.amount),
      postedAt: t.posted_at,
      referenceType: t.reference_type,
      paymentMethod: t.payment_method ?? null,
      postedBy: t.posted_by_membership_id ? (names.get(t.posted_by_membership_id) ?? null) : null,
      originalTransactionId: t.original_transaction_id ?? null,
      sourceDescription: t.original_transaction_id
        ? (descriptions.get(t.original_transaction_id) ?? null)
        : null,
    }));

    return {
      id: f.id,
      folioNumber: f.folio_number,
      status: f.status,
      currency: f.currency,
      guestId: f.guest_id,
      guestName: guestName(f.guest_profiles),
      guestEmail: f.guest_profiles?.email ?? null,
      guestPhone: f.guest_profiles?.phone ?? null,
      reservationId: f.reservation_id,
      confirmationNumber: f.hotel_reservations?.confirmation_number ?? null,
      arrivalDate: f.hotel_reservations?.arrival_date ?? null,
      departureDate: f.hotel_reservations?.departure_date ?? null,
      reservationStatus: f.hotel_reservations?.status ?? null,
      openedAt: f.opened_at,
      closedAt: f.closed_at,
      unsettledCheckout: f.settlement_exception === "unsettled_checkout" && f.status === "open",
      roomNumber: f.hotel_reservations?.hotel_rooms?.room_number ?? null,
      roomTypeName: f.hotel_reservations?.room_types?.name ?? null,
      ratePlanName: f.hotel_reservations?.rate_plan?.name ?? null,
      marketSegment: f.hotel_reservations?.market_segment ?? null,
      bookingSource: f.hotel_reservations?.commercial_booking_source ?? null,
      transactions,
      ...totals(transactions.map((t) => ({ amount: t.amount }))),
    };
  });

/** The folio for a reservation, if one has been opened. */
export const getReservationFolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; reservationId: string }) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ id: string; folioNumber: string; balance: number } | null> => {
      await requireCashieringAccess(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row } = await supabaseAdmin
        .from("guest_folios")
        .select("id, folio_number")
        .eq("restaurant_id", data.restaurantId)
        .eq("reservation_id", data.reservationId)
        .maybeSingle();
      if (!row) return null;
      const folio = row as { id: string; folio_number: string };
      const { data: txns } = await supabaseAdmin
        .from("folio_transactions")
        .select("amount")
        .eq("restaurant_id", data.restaurantId)
        .eq("folio_id", folio.id);
      const sums = totals(
        ((txns ?? []) as { amount: number | string }[]).map((t) => ({ amount: Number(t.amount) })),
      );
      return { id: folio.id, folioNumber: folio.folio_number, balance: sums.balance };
    },
  );

export const getCashieringDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; today: string }) =>
    z.object({ restaurantId: idSchema, today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CashieringDashboard> => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("currency_code")
      .eq("id", data.restaurantId)
      .maybeSingle();

    const { data: folios } = await supabaseAdmin
      .from("guest_folios")
      .select("id, status")
      .eq("restaurant_id", data.restaurantId);
    const openIds = ((folios ?? []) as { id: string; status: string }[])
      .filter((f) => f.status === "open")
      .map((f) => f.id);

    let outstanding = 0;
    if (openIds.length > 0) {
      const { data: txns } = await supabaseAdmin
        .from("folio_transactions")
        .select("amount")
        .eq("restaurant_id", data.restaurantId)
        .in("folio_id", openIds);
      outstanding = round2(
        ((txns ?? []) as { amount: number | string }[]).reduce(
          (sum, t) => sum + Number(t.amount),
          0,
        ),
      );
    }

    const { data: todayTxns } = await supabaseAdmin
      .from("folio_transactions")
      .select("transaction_type, amount")
      .eq("restaurant_id", data.restaurantId)
      .gte("posted_at", `${data.today}T00:00:00Z`)
      .lte("posted_at", `${data.today}T23:59:59Z`);

    let todayPayments = 0;
    let todayCharges = 0;
    let todayDeposits = 0;
    let todayRefunds = 0;
    for (const t of (todayTxns ?? []) as { transaction_type: string; amount: number | string }[]) {
      const amount = Number(t.amount);
      if (t.transaction_type === "payment" || t.transaction_type === "deposit")
        todayPayments += -amount;
      if (t.transaction_type === "deposit") todayDeposits += -amount;
      if (t.transaction_type === "refund") todayRefunds += Math.abs(amount);
      if (t.transaction_type === "charge") todayCharges += amount;
    }

    const { data: drawerRows } = await supabaseAdmin.rpc("list_hotel_drawers", {
      _restaurant_id: data.restaurantId,
    });
    const openShiftRows = (Array.isArray(drawerRows) ? drawerRows : []).filter(
      (row) => (row as { status?: string }).status === "open",
    ) as { id: string; membership_id: string }[];

    return {
      currency: (restaurant as { currency_code: string } | null)?.currency_code ?? "GBP",
      openFolios: openIds.length,
      outstandingBalance: outstanding,
      todayPayments: round2(todayPayments),
      todayCharges: round2(todayCharges),
      todayDeposits: round2(todayDeposits),
      todayRefunds: round2(todayRefunds),
      transfersSupported: true,
      openShifts: openShiftRows.length,
      myOpenShiftId: openShiftRows.find((s) => s.membership_id === me.id)?.id ?? null,
    };
  });

/* ------------------------------------------------------------------ writes */

/** Opens (or reuses) the primary folio for a reservation and posts the room charge once. */
export const initializeFolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; reservationId: string }) =>
    z.object({ restaurantId: idSchema, reservationId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reservation } = await supabaseAdmin
      .from("hotel_reservations")
      .select("id")
      .eq("id", data.reservationId)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (!reservation) return { ok: false, message: "Reservation not found for this property." };

    const { data: folio, error } = await supabaseAdmin.rpc("open_folio_for_reservation", {
      _restaurant_id: data.restaurantId,
      _reservation_id: data.reservationId,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (folio as { id: string }).id };
  });

export const postFolioEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      restaurantId: string;
      folioId: string;
      type: TransactionType;
      amount: number;
      description: string;
      method?: string;
      idempotencyKey: string;
      originalTransactionId?: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          folioId: idSchema,
          type: z.enum(TRANSACTION_TYPES),
          amount: z.number().finite(),
          description: z.string().min(1).max(200),
          method: z.string().max(60).optional(),
          idempotencyKey: z.string().min(8).max(80),
          originalTransactionId: idSchema.optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me =
      data.type === "payment" || data.type === "deposit"
        ? await requireCashierOperator(context as never, data.restaurantId)
        : await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.type !== "adjustment" && data.amount <= 0) {
      return { ok: false, message: "Enter an amount greater than zero." };
    }
    if (data.type === "adjustment" && data.amount === 0) {
      return { ok: false, message: "Enter a non-zero adjustment." };
    }

    let idempotencyKey: string;
    try {
      idempotencyKey = assertIdempotencyKey(data.idempotencyKey);
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }

    const method = blankToNull(data.method ?? null);
    const needsTender =
      data.type === "payment" || data.type === "deposit" || data.type === "refund";
    let paymentMethod: string | null = null;
    if (needsTender) {
      if (!method) return { ok: false, message: "Choose a payment method." };
      const snapshot = await loadPolish1Snapshot(supabaseAdmin, data.restaurantId);
      const tender = folioTenderFromCatalogue(
        method,
        snapshot.paymentMethodsAvailable ? snapshot.paymentMethods : null,
      );
      if (!tender.ok) return { ok: false, message: tender.message };
      paymentMethod = tender.stored;
    }

    const description = method ? `${data.description.trim()} (${method})` : data.description.trim();
    const correction =
      data.type === "refund" || data.type === "adjustment" || data.type === "discount";
    let originalTransactionId: string | null = null;
    if (correction && !data.originalTransactionId) {
      return { ok: false, message: "Choose the folio line this corrects." };
    }
    if (data.originalTransactionId) {
      if (!correction) {
        return {
          ok: false,
          message: "A source line can only be stored on a refund, adjustment, or discount.",
        };
      }
      const { data: source } = await supabaseAdmin
        .from("folio_transactions")
        .select("id, amount, transaction_type")
        .eq("id", data.originalTransactionId)
        .eq("restaurant_id", data.restaurantId)
        .eq("folio_id", data.folioId)
        .maybeSingle();
      if (!source) return { ok: false, message: "Choose a source line from this folio." };
      const sourceType = (source as { transaction_type: string }).transaction_type;
      const sourceAmount = Number((source as { amount: number | string }).amount);
      if (data.type === "refund" && sourceType !== "payment" && sourceType !== "deposit") {
        return { ok: false, message: "A refund must name a payment or deposit on this folio." };
      }
      if (data.type === "discount" && sourceType !== "charge") {
        return { ok: false, message: "A discount must name a charge on this folio." };
      }
      if (data.type === "refund") {
        const { data: linked } = await supabaseAdmin
          .from("folio_transactions")
          .select("amount")
          .eq("restaurant_id", data.restaurantId)
          .eq("folio_id", data.folioId)
          .eq("original_transaction_id", data.originalTransactionId)
          .eq("transaction_type", "refund");
        const remaining = remainingOnPaymentSource(
          { id: data.originalTransactionId, type: sourceType, amount: sourceAmount },
          ((linked ?? []) as Array<{ amount: number | string }>).map((row) => ({
            type: "refund",
            amount: Number(row.amount),
            originalTransactionId: data.originalTransactionId ?? null,
          })),
        );
        if (remaining == null || Math.round(data.amount * 100) / 100 > remaining + 0.001) {
          return {
            ok: false,
            message: "A refund can't exceed the remaining amount on that payment.",
          };
        }
      }
      originalTransactionId = data.originalTransactionId;
    }

    try {
      const txn = await callPostFolioTransaction({
        restaurantId: data.restaurantId,
        folioId: data.folioId,
        type: data.type,
        category: categoryForType(data.type),
        description,
        amount: Math.round(data.amount * 100) / 100,
        membershipId: me.id,
        paymentMethod,
        idempotencyKey,
        originalTransactionId,
      });
      return { ok: true, id: txn.id };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  });

export const closeFolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; folioId: string }) =>
    z.object({ restaurantId: idSchema, folioId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: folio, error } = await supabaseAdmin.rpc("close_guest_folio", {
      _restaurant_id: data.restaurantId,
      _folio_id: data.folioId,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (folio as { id: string }).id };
  });

/* ---------------------------------------------------------- cashier shifts */

export const listCashierShifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<CashierShiftRow[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("list_hotel_drawers", {
      _restaurant_id: data.restaurantId,
    });
    if (error) throw cashierError(error.message);

    const list = (Array.isArray(rows) ? rows : []) as Array<{
      id: string;
      membership_id: string;
      status: "open" | "closed";
      opened_at: string;
      closed_at: string | null;
      opening: number | string | null;
      closing_count: number | string | null;
      cash_in: number | string | null;
      cash_out: number | string | null;
      hotel_cash: number | string | null;
      expected: number | string | null;
      variance: number | string | null;
      notes: string | null;
    }>;

    const names = new Map<string, string>();
    if (list.length > 0) {
      const { data: members } = await supabaseAdmin
        .from("restaurant_users")
        .select("id, user_id")
        .eq("restaurant_id", data.restaurantId)
        .in("id", Array.from(new Set(list.map((s) => s.membership_id))));
      const memberRows = (members ?? []) as Array<{ id: string; user_id: string }>;
      const { data: profiles } = memberRows.length
        ? await supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name, email")
            .in(
              "id",
              memberRows.map((m) => m.user_id),
            )
        : {
            data: [] as Array<{
              id: string;
              first_name: string | null;
              last_name: string | null;
              email: string | null;
            }>,
          };
      const byUser = new Map(
        (profiles ?? []).map((p) => [
          p.id,
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Staff member",
        ]),
      );
      for (const m of memberRows) names.set(m.id, byUser.get(m.user_id) ?? "Staff member");
    }

    return list.map((s) => ({
      id: s.id,
      membershipId: s.membership_id,
      staffName: names.get(s.membership_id) ?? "Staff member",
      status: s.status,
      openedAt: s.opened_at,
      closedAt: s.closed_at,
      openingCash: s.opening === null ? null : Number(s.opening),
      closingCash: s.closing_count === null ? null : Number(s.closing_count),
      cashIn: Number(s.cash_in ?? 0),
      cashOut: Number(s.cash_out ?? 0),
      hotelCash: Number(s.hotel_cash ?? 0),
      expected: Number(s.expected ?? 0),
      variance: s.variance === null || s.variance === undefined ? null : Number(s.variance),
      notes: s.notes,
    }));
  });

export const openCashierShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; openingCash: number; notes?: string }) =>
    z
      .object({
        restaurantId: idSchema,
        openingCash: z.number().min(0),
        notes: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shift, error } = await supabaseAdmin.rpc("open_hotel_cashier_shift", {
      _restaurant_id: data.restaurantId,
      _membership_id: me.id,
      _opening_cash: data.openingCash,
      _notes: blankToNull(data.notes ?? null) as unknown as string,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (shift as { shift_id: string }).shift_id };
  });

export const closeCashierShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { restaurantId: string; shiftId: string; closingCash: number; notes?: string }) =>
      z
        .object({
          restaurantId: idSchema,
          shiftId: idSchema,
          closingCash: z.number().min(0),
          notes: z.string().max(300).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // A cashier may only close their own drawer; owners/managers may close any.
    if (!canManageCashiering(me.role)) {
      const { data: drawers } = await supabaseAdmin.rpc("list_hotel_drawers", {
        _restaurant_id: data.restaurantId,
      });
      const owned = (Array.isArray(drawers) ? drawers : []).find(
        (row) => (row as { id?: string }).id === data.shiftId,
      ) as { membership_id?: string } | undefined;
      if (!owned || owned.membership_id !== me.id) {
        return { ok: false, message: "You can only close your own cashier shift." };
      }
    }

    const { data: shift, error } = await supabaseAdmin.rpc("close_hotel_cashier_shift", {
      _restaurant_id: data.restaurantId,
      _shift_id: data.shiftId,
      _closing_count: data.closingCash,
      _notes: blankToNull(data.notes ?? null) as unknown as string,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (shift as { shift_id: string }).shift_id };
  });

export const postHotelDrawerMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      restaurantId: string;
      shiftId: string;
      movementType: "cash_in" | "cash_out";
      amount: number;
      notes?: string;
      idempotencyKey: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          shiftId: idSchema,
          movementType: z.enum(["cash_in", "cash_out"]),
          amount: z.number().positive(),
          notes: z.string().max(300).optional(),
          idempotencyKey: z.string().min(8).max(80),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: drawers } = await supabaseAdmin.rpc("list_hotel_drawers", {
      _restaurant_id: data.restaurantId,
    });
    const owned = (Array.isArray(drawers) ? drawers : []).find(
      (row) => (row as { id?: string }).id === data.shiftId,
    ) as { membership_id?: string; status?: string } | undefined;
    if (!owned || owned.status !== "open") {
      return { ok: false, message: "That cashier shift is already closed." };
    }
    if (!canManageCashiering(me.role) && owned.membership_id !== me.id) {
      return { ok: false, message: "You can only record movements on your own cashier shift." };
    }
    const { data: figures, error } = await supabaseAdmin.rpc("post_hotel_drawer_movement", {
      _restaurant_id: data.restaurantId,
      _shift_id: data.shiftId,
      _movement_type: data.movementType,
      _amount: data.amount,
      _notes: blankToNull(data.notes ?? null) as unknown as string,
      _membership_id: me.id,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (figures as { shift_id: string }).shift_id };
  });

/** Cash movement recorded while a shift was open, for the closing count. */
export const getShiftSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; shiftId: string }) =>
    z.object({ restaurantId: idSchema, shiftId: idSchema }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ payments: number; deposits: number; refunds: number; transactions: number }> => {
      await requireCashieringAccess(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: shift } = await supabaseAdmin
        .from("cashier_shifts")
        .select("opened_at, closed_at")
        .eq("id", data.shiftId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!shift) return { payments: 0, deposits: 0, refunds: 0, transactions: 0 };
      const s = shift as { opened_at: string; closed_at: string | null };

      let query = supabaseAdmin
        .from("folio_transactions")
        .select("transaction_type, amount")
        .eq("restaurant_id", data.restaurantId)
        .gte("posted_at", s.opened_at);
      if (s.closed_at) query = query.lte("posted_at", s.closed_at);

      const { data: txns } = await query;
      let payments = 0;
      let deposits = 0;
      let refunds = 0;
      const rows = (txns ?? []) as { transaction_type: string; amount: number | string }[];
      for (const t of rows) {
        const amount = Number(t.amount);
        if (t.transaction_type === "payment") payments += -amount;
        if (t.transaction_type === "deposit") deposits += -amount;
        if (t.transaction_type === "refund") refunds += amount;
      }
      return {
        payments: round2(payments),
        deposits: round2(deposits),
        refunds: round2(refunds),
        transactions: rows.length,
      };
    },
  );

/* ------------------------------------------- ledger reads by movement type */

export interface LedgerEntryRow {
  id: string;
  folioId: string;
  folioNumber: string;
  guestName: string;
  confirmationNumber: string | null;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string | null;
  postedAt: string;
  postedBy: string | null;
  roomNumber: string | null;
  referenceType: string | null;
}

/**
 * Phase 7D.2F1 — read-only view of the existing folio ledger filtered by
 * movement type (payments, deposits, refunds). This never writes and never
 * derives a second ledger: every row is one authoritative folio_transactions
 * record.
 */
export const listLedgerEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; types: string[]; search?: string }) =>
    z
      .object({
        restaurantId: idSchema,
        types: z.array(z.enum(TRANSACTION_TYPES)).min(1),
        search: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<LedgerEntryRow[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: txns, error } = await supabaseAdmin
      .from("folio_transactions")
      .select(
        "id, folio_id, transaction_type, category, description, amount, payment_method, posted_at, posted_by_membership_id, reference_type",
      )
      .eq("restaurant_id", data.restaurantId)
      .in("transaction_type", data.types)
      .order("posted_at", { ascending: false })
      .limit(200);
    if (error) throw cashierError(error.message);

    const rows = (txns ?? []) as {
      id: string;
      folio_id: string;
      transaction_type: string;
      category: string;
      description: string;
      amount: number | string;
      payment_method: string | null;
      posted_at: string;
      posted_by_membership_id: string | null;
      reference_type: string | null;
    }[];

    const folioIds = [...new Set(rows.map((r) => r.folio_id))];
    const folioMeta = new Map<
      string,
      {
        folioNumber: string;
        guestName: string;
        confirmationNumber: string | null;
        roomNumber: string | null;
      }
    >();

    if (folioIds.length > 0) {
      const { data: folios } = await supabaseAdmin
        .from("guest_folios")
        .select(
          "id, folio_number, guest_profiles!guest_folios_guest_same_property(first_name, last_name), " +
            "hotel_reservations!guest_folios_reservation_same_property(confirmation_number, hotel_rooms!hotel_reservations_room_same_type(room_number))",
        )
        .eq("restaurant_id", data.restaurantId)
        .in("id", folioIds);

      for (const f of (folios ?? []) as unknown as {
        id: string;
        folio_number: string;
        guest_profiles: { first_name: string | null; last_name: string | null } | null;
        hotel_reservations: {
          confirmation_number: string;
          hotel_rooms: { room_number: string } | null;
        } | null;
      }[]) {
        folioMeta.set(f.id, {
          folioNumber: f.folio_number,
          guestName: guestName(f.guest_profiles),
          confirmationNumber: f.hotel_reservations?.confirmation_number ?? null,
          roomNumber: f.hotel_reservations?.hotel_rooms?.room_number ?? null,
        });
      }
    }

    const names = new Map<string, string>();
    const membershipIds = [
      ...new Set(
        rows.map((r) => r.posted_by_membership_id).filter((id): id is string => Boolean(id)),
      ),
    ];
    if (membershipIds.length > 0) {
      const { data: members } = await supabaseAdmin
        .from("restaurant_users")
        .select("id, user_id")
        .eq("restaurant_id", data.restaurantId)
        .in("id", membershipIds);
      const memberRows = (members ?? []) as Array<{ id: string; user_id: string }>;
      const { data: profiles } = memberRows.length
        ? await supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name, email")
            .in(
              "id",
              memberRows.map((m) => m.user_id),
            )
        : {
            data: [] as Array<{
              id: string;
              first_name: string | null;
              last_name: string | null;
              email: string | null;
            }>,
          };
      const byUser = new Map(
        (profiles ?? []).map((p) => [
          p.id,
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Staff member",
        ]),
      );
      for (const m of memberRows) names.set(m.id, byUser.get(m.user_id) ?? "Staff member");
    }

    const term = (data.search ?? "").trim().toLowerCase();

    return rows
      .map((r) => {
        const meta = folioMeta.get(r.folio_id);
        return {
          id: r.id,
          folioId: r.folio_id,
          folioNumber: meta?.folioNumber ?? "—",
          guestName: meta?.guestName ?? "Guest",
          confirmationNumber: meta?.confirmationNumber ?? null,
          type: r.transaction_type as TransactionType,
          category: r.category,
          description: r.description,
          amount: Math.abs(Number(r.amount)),
          paymentMethod: r.payment_method,
          postedAt: r.posted_at,
          postedBy: r.posted_by_membership_id
            ? (names.get(r.posted_by_membership_id) ?? null)
            : null,
          roomNumber: meta?.roomNumber ?? null,
          referenceType: r.reference_type,
        };
      })
      .filter(
        (r) =>
          term === "" ||
          r.folioNumber.toLowerCase().includes(term) ||
          r.guestName.toLowerCase().includes(term) ||
          (r.confirmationNumber ?? "").toLowerCase().includes(term) ||
          (r.roomNumber ?? "").toLowerCase().includes(term) ||
          r.id.toLowerCase().includes(term),
      );
  });
