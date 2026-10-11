/**
 * Cashiering Phases 7–12 — transfers, accounts, deposits, settlement, exceptions, reports.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertIdempotencyKey,
  blankToNull,
  canManageCashiering,
  cashierError,
  categoryForType,
  requireCashierManager,
  requireCashierOperator,
  requireCashieringAccess,
  type TransactionType,
} from "./cashiering.server";
import type { CashierResult } from "./cashiering.functions";
import { propertyDayBounds } from "./cashiering-control";

const idSchema = z.string().uuid();

export interface FolioWindowRow {
  id: string;
  folioId: string;
  windowNumber: number;
  label: string;
  isPrimary: boolean;
}

export interface FinancialAccountRow {
  id: string;
  masterId: string;
  masterName: string;
  accountKind: "company" | "group" | "master";
  accountNumber: string;
  currency: string;
  status: "open" | "closed";
  balance: number;
  creditLimitAmount: number | null;
  openedAt: string;
  closedAt: string | null;
}

export interface DepositAllocationRow {
  id: string;
  depositTransactionId: string;
  chargeTransactionId: string;
  amount: number;
  createdAt: string;
}

export interface CashieringExceptionRow {
  kind: string;
  folioId?: string;
  folioNumber?: string;
  balance?: number;
  shiftId?: string;
  variance?: number;
  reason?: string | null;
  at?: string | null;
}

export interface CashieringReportTotals {
  charges: number;
  payments: number;
  deposits: number;
  refunds: number;
  adjustments: number;
  discounts: number;
  transfersOut: number;
  transfersIn: number;
  lineCount: number;
  netMovement: number;
}

export interface CashieringReportLine {
  id: string;
  folioId: string;
  folioNumber: string;
  guestName: string;
  type: string;
  description: string;
  amount: number;
  paymentMethod: string | null;
  postedAt: string;
}

export interface CashieringReport {
  totals: CashieringReportTotals;
  lines: CashieringReportLine[];
}

export const listFolioWindows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; folioId: string }) =>
    z.object({ restaurantId: idSchema, folioId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<FolioWindowRow[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("guest_folio_windows")
      .select("id, folio_id, window_number, label, is_primary")
      .eq("restaurant_id", data.restaurantId)
      .eq("folio_id", data.folioId)
      .order("window_number");
    if (error) throw cashierError(error.message);
    return (rows ?? []).map((w) => ({
      id: w.id,
      folioId: w.folio_id,
      windowNumber: w.window_number,
      label: w.label,
      isPrimary: w.is_primary,
    }));
  });

export const postFolioTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      restaurantId: string;
      sourceFolioId: string;
      targetFolioId: string;
      sourceTransactionId: string;
      targetWindowId: string;
      amount: number;
      description: string;
      idempotencyKey: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          sourceFolioId: idSchema,
          targetFolioId: idSchema,
          sourceTransactionId: idSchema,
          targetWindowId: idSchema,
          amount: z.number().positive(),
          description: z.string().min(1).max(200),
          idempotencyKey: z.string().min(8).max(80),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult & { transferId?: string }> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("post_folio_transfer", {
      _restaurant_id: data.restaurantId,
      _source_folio_id: data.sourceFolioId,
      _target_folio_id: data.targetFolioId,
      _source_transaction_id: data.sourceTransactionId,
      _target_window_id: data.targetWindowId,
      _amount: data.amount,
      _description: data.description.trim(),
      _membership_id: me.id,
      _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    const payload = result as { transfer_id: string; transfer_out_id: string };
    return { ok: true, id: payload.transfer_out_id, transferId: payload.transfer_id };
  });

export const postCrossLedgerTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      restaurantId: string;
      sourceType: "guest_folio" | "financial_account";
      sourceId: string;
      sourceTransactionId: string;
      destinationType: "guest_folio" | "financial_account";
      destinationId: string;
      amount: number;
      description: string;
      idempotencyKey: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          sourceType: z.enum(["guest_folio", "financial_account"]),
          sourceId: idSchema,
          sourceTransactionId: idSchema,
          destinationType: z.enum(["guest_folio", "financial_account"]),
          destinationId: idSchema,
          amount: z.number().positive(),
          description: z.string().min(1).max(200),
          idempotencyKey: z.string().min(8).max(80),
        })
        .refine(
          (value) => value.sourceType !== value.destinationType,
          "Choose a guest folio and a financial account.",
        )
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult & { transferId?: string }> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("post_cross_ledger_transfer", {
      _restaurant_id: data.restaurantId,
      _source_type: data.sourceType,
      _source_id: data.sourceId,
      _source_transaction_id: data.sourceTransactionId,
      _destination_type: data.destinationType,
      _destination_id: data.destinationId,
      _amount: data.amount,
      _description: data.description.trim(),
      _membership_id: me.id,
      _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    const payload = result as { transfer_id: string; transfer_out_id: string };
    return { ok: true, id: payload.transfer_out_id, transferId: payload.transfer_id };
  });

export const listFinancialAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<FinancialAccountRow[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("financial_accounts")
      .select("id, master_id, account_kind, account_number, currency, status, opened_at, closed_at")
      .eq("restaurant_id", data.restaurantId)
      .order("opened_at", { ascending: false });
    if (error) throw cashierError(error.message);

    const list = (rows ?? []) as Array<{
      id: string;
      master_id: string;
      account_kind: "company" | "group" | "master";
      account_number: string;
      currency: string;
      status: "open" | "closed";
      opened_at: string;
      closed_at: string | null;
    }>;

    const masterIds = [...new Set(list.map((row) => row.master_id))];
    const masterNames = new Map<string, string>();
    const masterLimits = new Map<string, number | null>();
    if (masterIds.length > 0) {
      const { data: masters } = await supabaseAdmin
        .from("guest_account_masters")
        .select("id, name, credit_limit_amount")
        .eq("restaurant_id", data.restaurantId)
        .in("id", masterIds);
      for (const master of (masters ?? []) as Array<{
        id: string;
        name: string;
        credit_limit_amount: number | string | null;
      }>) {
        masterNames.set(master.id, master.name);
        masterLimits.set(
          master.id,
          master.credit_limit_amount == null ? null : Number(master.credit_limit_amount),
        );
      }
    }

    const out: FinancialAccountRow[] = [];
    for (const row of list) {
      const { data: bal } = await supabaseAdmin.rpc("financial_account_balance", {
        _restaurant_id: data.restaurantId,
        _account_id: row.id,
      });
      out.push({
        id: row.id,
        masterId: row.master_id,
        masterName: masterNames.get(row.master_id) ?? "Account",
        accountKind: row.account_kind,
        accountNumber: row.account_number,
        currency: row.currency,
        status: row.status,
        balance: Number(bal ?? 0),
        creditLimitAmount: masterLimits.get(row.master_id) ?? null,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
      });
    }
    return out;
  });

export interface FinancialAccountChargeRow {
  id: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  postedAt: string;
  originalTransactionId: string | null;
  transferId: string | null;
  sourceDescription: string | null;
  departmentName: string | null;
  quantity: number | null;
  unitAmount: number | null;
}

export const listFinancialAccountCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; accountId: string }) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<FinancialAccountChargeRow[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("folio_transactions")
      .select(
        "id, transaction_type, category, description, amount, posted_at, original_transaction_id, transfer_id",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("financial_account_id", data.accountId)
      .order("posted_at", { ascending: true });
    if (error) throw cashierError(error.message);
    const lines = (rows ?? []) as Array<{
      id: string;
      transaction_type: string;
      category: string;
      description: string;
      amount: number | string;
      posted_at: string;
      original_transaction_id: string | null;
      transfer_id: string | null;
    }>;
    const missing = [
      ...new Set(
        lines
          .map((row) => row.original_transaction_id)
          .filter((id): id is string => Boolean(id) && !lines.some((line) => line.id === id)),
      ),
    ];
    const sources = new Map<
      string,
      {
        description: string;
        charge_snapshot: Record<string, unknown> | null;
        quantity: number | string | null;
        unit_amount: number | string | null;
      }
    >();
    if (missing.length > 0) {
      const { data: sourceRows, error: sourceError } = await supabaseAdmin
        .from("folio_transactions")
        .select("id, description, charge_snapshot, quantity, unit_amount")
        .eq("restaurant_id", data.restaurantId)
        .in("id", missing);
      if (sourceError && sourceError.code !== "42703") throw cashierError(sourceError.message);
      for (const row of (sourceRows ?? []) as Array<{
        id: string;
        description: string;
        charge_snapshot: Record<string, unknown> | null;
        quantity: number | string | null;
        unit_amount: number | string | null;
      }>) {
        sources.set(row.id, row);
      }
    }
    return lines.map((row) => {
      const source = row.original_transaction_id
        ? sources.get(row.original_transaction_id)
        : undefined;
      const local = lines.find((line) => line.id === row.original_transaction_id);
      const department = source?.charge_snapshot?.departmentName;
      const quantity = source?.quantity ?? null;
      const unitAmount = source?.unit_amount ?? null;
      return {
        id: row.id,
        type: row.transaction_type,
        category: row.category,
        description: row.description,
        amount: Number(row.amount),
        postedAt: row.posted_at,
        originalTransactionId: row.original_transaction_id,
        transferId: row.transfer_id,
        sourceDescription: source?.description ?? local?.description ?? null,
        departmentName: typeof department === "string" && department.trim() ? department : null,
        quantity: quantity == null || quantity === "" ? null : Number(quantity),
        unitAmount: unitAmount == null || unitAmount === "" ? null : Number(unitAmount),
      };
    });
  });

export const openFinancialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      restaurantId: string;
      masterId: string;
      accountKind: "company" | "group" | "master";
      currency: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          masterId: idSchema,
          accountKind: z.enum(["company", "group", "master"]),
          currency: z.string().min(3).max(3),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct, error } = await supabaseAdmin.rpc("open_financial_account", {
      _restaurant_id: data.restaurantId,
      _master_id: data.masterId,
      _account_kind: data.accountKind,
      _currency: data.currency.toUpperCase(),
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (acct as { id: string }).id };
  });

export const getMasterBillingCurrency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; masterId: string }) =>
    z.object({ restaurantId: idSchema, masterId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ currency: string | null }> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { masterBillingCurrency } = await import("./cashiering-account-workspace");
    const { data: row, error } = await supabaseAdmin
      .from("guest_account_masters")
      .select("billing_currency_code, account_operations")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.masterId)
      .maybeSingle();
    if (error) throw new Error(cashierError(error.message).message);
    return { currency: masterBillingCurrency(row) };
  });

export const postFinancialAccountEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      restaurantId: string;
      accountId: string;
      type: TransactionType;
      amount: number;
      description: string;
      method?: string;
      originalTransactionId?: string;
      idempotencyKey: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          accountId: idSchema,
          type: z.enum(["charge", "payment", "deposit", "refund", "adjustment", "discount"]),
          amount: z.number().finite(),
          description: z.string().min(1).max(200),
          method: z.string().max(60).optional(),
          originalTransactionId: idSchema.optional(),
          idempotencyKey: z.string().min(8).max(80),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me =
      data.type === "payment" || data.type === "deposit"
        ? await requireCashierOperator(context as never, data.restaurantId)
        : await requireCashierManager(context as never, data.restaurantId);
    if ((data.type === "payment" || data.type === "deposit") && !blankToNull(data.method)) {
      return { ok: false, message: "Choose a payment method." };
    }
    if (data.type === "refund" && !data.originalTransactionId) {
      return { ok: false, message: "Choose the payment this refunds." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: txn, error } = await supabaseAdmin.rpc("post_financial_account_transaction", {
      _restaurant_id: data.restaurantId,
      _account_id: data.accountId,
      _type: data.type,
      _category: categoryForType(data.type),
      _description: data.description.trim(),
      _amount: Math.round(data.amount * 100) / 100,
      _membership_id: me.id,
      _payment_method: blankToNull(data.method ?? null) ?? undefined,
      _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
      _original_transaction_id: data.originalTransactionId,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (txn as { id: string }).id };
  });

export const closeFinancialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; accountId: string }) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acct, error } = await supabaseAdmin.rpc("close_financial_account", {
      _restaurant_id: data.restaurantId,
      _account_id: data.accountId,
      _membership_id: me.id,
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (acct as { id: string }).id };
  });

export const getDepositUnallocated = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; depositTransactionId: string }) =>
    z.object({ restaurantId: idSchema, depositTransactionId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ unallocated: number | null }> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: remainder, error } = await supabaseAdmin.rpc("deposit_unallocated_remainder", {
      _restaurant_id: data.restaurantId,
      _deposit_id: data.depositTransactionId,
    });
    if (error) throw cashierError(error.message);
    return { unallocated: remainder === null ? null : Number(remainder) };
  });

export const allocateFolioDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      restaurantId: string;
      depositTransactionId: string;
      chargeTransactionId: string;
      amount: number;
      idempotencyKey: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          depositTransactionId: idSchema,
          chargeTransactionId: idSchema,
          amount: z.number().positive(),
          idempotencyKey: z.string().min(8).max(80),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("allocate_folio_deposit", {
      _restaurant_id: data.restaurantId,
      _deposit_transaction_id: data.depositTransactionId,
      _charge_transaction_id: data.chargeTransactionId,
      _amount: data.amount,
      _membership_id: me.id,
      _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (row as { id: string }).id };
  });

export const postSettlementWriteOff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      restaurantId: string;
      folioId?: string;
      accountId?: string;
      amount: number;
      reason: string;
      idempotencyKey: string;
    }) =>
      z
        .object({
          restaurantId: idSchema,
          folioId: idSchema.optional(),
          accountId: idSchema.optional(),
          amount: z.number().positive(),
          reason: z.string().min(1).max(300),
          idempotencyKey: z.string().min(8).max(80),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: txn, error } = await supabaseAdmin.rpc("post_settlement_write_off", {
      _restaurant_id: data.restaurantId,
      _folio_id: data.folioId ?? null,
      _account_id: data.accountId ?? null,
      _amount: data.amount,
      _reason: data.reason.trim(),
      _membership_id: me.id,
      _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
    });
    if (error) return { ok: false, message: cashierError(error.message).message };
    return { ok: true, id: (txn as { id: string }).id };
  });

export const listCashieringExceptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) => z.object({ restaurantId: idSchema }).parse(d))
  .handler(async ({ data, context }): Promise<CashieringExceptionRow[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: folios, error: folioError } = await supabaseAdmin
      .from("guest_folios")
      .select("id, folio_number, settlement_exception_reason, settlement_exception_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "open")
      .eq("settlement_exception", "unsettled_checkout");
    if (folioError) throw cashierError(folioError.message);

    const openExceptions = (folios ?? []) as Array<{
      id: string;
      folio_number: string;
      settlement_exception_reason: string | null;
      settlement_exception_at: string | null;
    }>;
    const balances = new Map<string, number>();
    if (openExceptions.length > 0) {
      const { data: txns, error: txnError } = await supabaseAdmin
        .from("folio_transactions")
        .select("folio_id, amount")
        .eq("restaurant_id", data.restaurantId)
        .in(
          "folio_id",
          openExceptions.map((folio) => folio.id),
        );
      if (txnError) throw cashierError(txnError.message);
      for (const txn of (txns ?? []) as Array<{ folio_id: string; amount: number | string }>) {
        balances.set(txn.folio_id, (balances.get(txn.folio_id) ?? 0) + Number(txn.amount));
      }
    }

    const rows: CashieringExceptionRow[] = openExceptions.map((folio) => ({
      kind: "unsettled_checkout",
      folioId: folio.id,
      folioNumber: folio.folio_number,
      balance: Math.round((balances.get(folio.id) ?? 0) * 100) / 100,
      reason: folio.settlement_exception_reason,
      at: folio.settlement_exception_at,
    }));

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: shifts, error: shiftError } = await supabaseAdmin
      .from("hotel_cashier_shifts")
      .select("id, closed_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("status", "closed")
      .gte("closed_at", since);
    if (shiftError) throw cashierError(shiftError.message);
    for (const shift of (shifts ?? []) as Array<{ id: string; closed_at: string | null }>) {
      const { data: figures, error: figureError } = await supabaseAdmin.rpc(
        "hotel_drawer_figures",
        { _restaurant_id: data.restaurantId, _shift_id: shift.id },
      );
      if (figureError) throw cashierError(figureError.message);
      const variance = Number((figures as { variance?: number | string | null } | null)?.variance);
      if (!Number.isFinite(variance) || Math.abs(variance) < 0.01) continue;
      rows.push({
        kind: "drawer_variance",
        shiftId: shift.id,
        variance: Math.round(variance * 100) / 100,
        at: shift.closed_at,
      });
    }
    return rows;
  });

const reportDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getCashieringReportTotals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; fromDate: string; toDate: string }) =>
    z.object({ restaurantId: idSchema, fromDate: reportDate, toDate: reportDate }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CashieringReport> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fromDate = data.fromDate <= data.toDate ? data.fromDate : data.toDate;
    const toDate = data.fromDate <= data.toDate ? data.toDate : data.fromDate;
    const span =
      (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000;
    if (span > 31) throw cashierError("Choose a report range of 31 days or less.");

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .select("timezone")
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (restaurantError) throw cashierError(restaurantError.message);
    const timezone = (restaurant as { timezone: string | null } | null)?.timezone?.trim() || "UTC";
    const boundsStart = propertyDayBounds(fromDate, timezone).startIso;
    const boundsEnd = propertyDayBounds(toDate, timezone).endIso;

    const { data: txns, error } = await supabaseAdmin
      .from("folio_transactions")
      .select("id, folio_id, transaction_type, description, amount, payment_method, posted_at")
      .eq("restaurant_id", data.restaurantId)
      .gte("posted_at", boundsStart)
      .lt("posted_at", boundsEnd)
      .order("posted_at", { ascending: false })
      .limit(500);
    if (error) throw cashierError(error.message);

    const ledger = (txns ?? []) as Array<{
      id: string;
      folio_id: string;
      transaction_type: string;
      description: string;
      amount: number | string;
      payment_method: string | null;
      posted_at: string;
    }>;
    const sum = (type: string, signed: (amount: number) => number) =>
      Math.round(
        ledger
          .filter((row) => row.transaction_type === type)
          .reduce((total, row) => total + signed(Number(row.amount)), 0) * 100,
      ) / 100;
    const totals: CashieringReportTotals = {
      charges: sum("charge", (amount) => amount),
      payments: sum("payment", (amount) => -amount),
      deposits: sum("deposit", (amount) => -amount),
      refunds: sum("refund", (amount) => amount),
      adjustments: sum("adjustment", (amount) => amount),
      discounts: sum("discount", (amount) => -amount),
      transfersOut: sum("transfer_out", (amount) => -amount),
      transfersIn: sum("transfer_in", (amount) => amount),
      lineCount: ledger.length,
      netMovement:
        Math.round(ledger.reduce((total, row) => total + Number(row.amount), 0) * 100) / 100,
    };

    const shown = ledger.slice(0, 80);
    const folioIds = [...new Set(shown.map((row) => row.folio_id))];
    const folioMeta = new Map<string, { number: string; guest: string }>();
    if (folioIds.length > 0) {
      const { data: folios } = await supabaseAdmin
        .from("guest_folios")
        .select(
          "id, folio_number, guest_profiles!guest_folios_guest_same_property(first_name, last_name)",
        )
        .eq("restaurant_id", data.restaurantId)
        .in("id", folioIds);
      for (const folio of (folios ?? []) as unknown as Array<{
        id: string;
        folio_number: string;
        guest_profiles: { first_name: string | null; last_name: string | null } | null;
      }>) {
        const guest = [folio.guest_profiles?.first_name, folio.guest_profiles?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        folioMeta.set(folio.id, { number: folio.folio_number, guest: guest || "Guest" });
      }
    }

    return {
      totals,
      lines: shown.map((row) => ({
        id: row.id,
        folioId: row.folio_id,
        folioNumber: folioMeta.get(row.folio_id)?.number ?? "—",
        guestName: folioMeta.get(row.folio_id)?.guest ?? "Guest",
        type: row.transaction_type,
        description: row.description,
        amount: Number(row.amount),
        paymentMethod: row.payment_method,
        postedAt: row.posted_at,
      })),
    };
  });

export function canPostFinancialAccount(role: string): boolean {
  return canManageCashiering(role);
}
