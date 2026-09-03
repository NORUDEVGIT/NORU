import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  TRANSACTION_TYPES,
  blankToNull,
  canManageCashiering,
  cashierError,
  categoryForType,
  requireCashierManager,
  requireCashierOperator,
  requireCashieringAccess,
  CASHIER_OPERATE_ROLES,
  type FolioStatus,
  type TransactionType,
} from "./cashiering.server";
import { callerMembership } from "./workforce.server";

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
}

export interface FolioTransactionRow {
  id: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  referenceType: string | null;
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
  notes: string | null;
}

export interface CashieringDashboard {
  currency: string;
  openFolios: number;
  outstandingBalance: number;
  todayPayments: number;
  todayCharges: number;
  openShifts: number;
  myOpenShiftId: string | null;
}

/* ------------------------------------------------------------------ access */

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
        "id, folio_number, status, currency, opened_at, closed_at, reservation_id, guest_id, " +
          "guest_profiles!guest_folios_guest_same_property(first_name, last_name), " +
          "hotel_reservations!guest_folios_reservation_same_property(confirmation_number)",
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
      guest_profiles: { first_name: string | null; last_name: string | null } | null;
      hotel_reservations: { confirmation_number: string } | null;
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
          ...sums,
        };
      })
      .filter(
        (f) =>
          term === "" ||
          f.folioNumber.toLowerCase().includes(term) ||
          f.guestName.toLowerCase().includes(term) ||
          (f.confirmationNumber ?? "").toLowerCase().includes(term),
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
        "id, folio_number, status, currency, opened_at, closed_at, reservation_id, guest_id, " +
          "guest_profiles!guest_folios_guest_same_property(first_name, last_name, email, phone), " +
          "hotel_reservations!guest_folios_reservation_same_property(confirmation_number, arrival_date, departure_date, status)",
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
      } | null;
    };

    const { data: txns } = await supabaseAdmin
      .from("folio_transactions")
      .select("id, folio_id, transaction_type, category, description, amount, posted_at, reference_type")
      .eq("restaurant_id", data.restaurantId)
      .eq("folio_id", f.id)
      .order("posted_at", { ascending: true });

    const transactions: FolioTransactionRow[] = ((txns ?? []) as TxnRow[]).map((t) => ({
      id: t.id,
      type: t.transaction_type as TransactionType,
      category: t.category,
      description: t.description,
      amount: Number(t.amount),
      postedAt: t.posted_at,
      referenceType: t.reference_type,
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
    async ({ data, context }): Promise<{ id: string; folioNumber: string; balance: number } | null> => {
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
      const sums = totals(((txns ?? []) as { amount: number | string }[]).map((t) => ({ amount: Number(t.amount) })));
      return { id: folio.id, folioNumber: folio.folio_number, balance: sums.balance };
    },
  );

export const getCashieringDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; today: string }) =>
    z
      .object({ restaurantId: idSchema, today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(d),
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
        ((txns ?? []) as { amount: number | string }[]).reduce((sum, t) => sum + Number(t.amount), 0),
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
    for (const t of (todayTxns ?? []) as { transaction_type: string; amount: number | string }[]) {
      const amount = Number(t.amount);
      if (t.transaction_type === "payment" || t.transaction_type === "deposit") todayPayments += -amount;
      if (t.transaction_type === "charge") todayCharges += amount;
    }

    const { data: shifts } = await supabaseAdmin
      .from("cashier_shifts")
      .select("id, membership_id, status")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open");
    const openShiftRows = (shifts ?? []) as { id: string; membership_id: string }[];

    return {
      currency: (restaurant as { currency_code: string } | null)?.currency_code ?? "GBP",
      openFolios: openIds.length,
      outstandingBalance: outstanding,
      todayPayments: round2(todayPayments),
      todayCharges: round2(todayCharges),
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
    }) =>
      z
        .object({
          restaurantId: idSchema,
          folioId: idSchema,
          type: z.enum(TRANSACTION_TYPES),
          amount: z.number().finite(),
          description: z.string().min(1).max(200),
          method: z.string().max(60).optional(),
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

    const method = blankToNull(data.method ?? null);
    const description = method ? `${data.description.trim()} (${method})` : data.description.trim();

    const { data: txn, error } = await supabaseAdmin.rpc("post_folio_transaction", {
      _restaurant_id: data.restaurantId,
      _folio_id: data.folioId,
      _type: data.type,
      _category: categoryForType(data.type),
      _description: description,
      _amount: Math.round(data.amount * 100) / 100,
      _reference_type: null as unknown as string,
      _reference_id: null as unknown as string,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };

    // Night audit rolls payments up by method, so store the normalized code alongside the ledger row.
    const normalized = method ? method.trim().toLowerCase().replace(/\s+/g, "_") : null;
    const allowed = ["cash", "card", "bank_transfer", "mobile_money", "other"];
    if (normalized && ["payment", "deposit", "refund"].includes(data.type)) {
      await supabaseAdmin
        .from("folio_transactions")
        .update({ payment_method: allowed.includes(normalized) ? normalized : "other" })
        .eq("id", (txn as { id: string }).id)
        .eq("restaurant_id", data.restaurantId);
    }

    return { ok: true, id: (txn as { id: string }).id };

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

    const { data: rows, error } = await supabaseAdmin
      .from("cashier_shifts")
      .select("id, membership_id, status, opened_at, closed_at, opening_cash, closing_cash, notes")
      .eq("restaurant_id", data.restaurantId)
      .order("opened_at", { ascending: false })
      .limit(100);
    if (error) throw cashierError(error.message);

    const list = (rows ?? []) as Array<{
      id: string;
      membership_id: string;
      status: "open" | "closed";
      opened_at: string;
      closed_at: string | null;
      opening_cash: number | string | null;
      closing_cash: number | string | null;
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
            .in("id", memberRows.map((m) => m.user_id))
        : { data: [] as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }> };
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
      openingCash: s.opening_cash === null ? null : Number(s.opening_cash),
      closingCash: s.closing_cash === null ? null : Number(s.closing_cash),
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
    const { data: shift, error } = await supabaseAdmin.rpc("open_cashier_shift", {
      _restaurant_id: data.restaurantId,
      _membership_id: me.id,
      _opening_cash: data.openingCash,
      _notes: blankToNull(data.notes ?? null) as unknown as string,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (shift as { id: string }).id };
  });

export const closeCashierShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; shiftId: string; closingCash: number; notes?: string }) =>
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
      const { data: owned } = await supabaseAdmin
        .from("cashier_shifts")
        .select("id, membership_id")
        .eq("id", data.shiftId)
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      if (!owned || owned.membership_id !== me.id) {
        return { ok: false, message: "You can only close your own cashier shift." };
      }
    }

    const { data: shift, error } = await supabaseAdmin.rpc("close_cashier_shift", {
      _restaurant_id: data.restaurantId,
      _shift_id: data.shiftId,
      _closing_cash: data.closingCash,
      _notes: blankToNull(data.notes ?? null) as unknown as string,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (shift as { id: string }).id };
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
