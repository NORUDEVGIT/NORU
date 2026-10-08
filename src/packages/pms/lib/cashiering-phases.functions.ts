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

export const listFinancialAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string }) =>
    z.object({ restaurantId: idSchema }).parse(d),
  )
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
    if (masterIds.length > 0) {
      const { data: masters } = await supabaseAdmin
        .from("guest_account_masters")
        .select("id, name")
        .eq("restaurant_id", data.restaurantId)
        .in("id", masterIds);
      for (const master of (masters ?? []) as Array<{ id: string; name: string }>) {
        masterNames.set(master.id, master.name);
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
        openedAt: row.opened_at,
        closedAt: row.closed_at,
      });
    }
    return out;
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
          idempotencyKey: z.string().min(8).max(80),
        })
        .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashierResult> => {
    const me =
      data.type === "payment" || data.type === "deposit"
        ? await requireCashierOperator(context as never, data.restaurantId)
        : await requireCashierManager(context as never, data.restaurantId);
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
  .inputValidator((d: { restaurantId: string }) =>
    z.object({ restaurantId: idSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<CashieringExceptionRow[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payload, error } = await supabaseAdmin.rpc("list_cashiering_exceptions", {
      _restaurant_id: data.restaurantId,
    });
    if (error) throw cashierError(error.message);
    const body = payload as {
      unsettled_checkouts: Array<Record<string, unknown>>;
      drawer_variances: Array<Record<string, unknown>>;
    };
    const rows: CashieringExceptionRow[] = [];
    for (const item of body.unsettled_checkouts ?? []) {
      rows.push({
        kind: "unsettled_checkout",
        folioId: String(item.folio_id ?? ""),
        folioNumber: String(item.folio_number ?? ""),
        balance: Number(item.balance ?? 0),
        reason: (item.reason as string | null) ?? null,
        at: (item.at as string | null) ?? null,
      });
    }
    for (const item of body.drawer_variances ?? []) {
      rows.push({
        kind: "drawer_variance",
        shiftId: String(item.shift_id ?? ""),
        variance: Number(item.variance ?? 0),
        at: (item.closed_at as string | null) ?? null,
      });
    }
    return rows;
  });

export const getCashieringReportTotals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { restaurantId: string; from: string; to: string }) =>
    z
      .object({
        restaurantId: idSchema,
        from: z.string().datetime(),
        to: z.string().datetime(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<CashieringReportTotals> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payload, error } = await supabaseAdmin.rpc("cashiering_report_totals", {
      _restaurant_id: data.restaurantId,
      _from: data.from,
      _to: data.to,
    });
    if (error) throw cashierError(error.message);
    const row = payload as Record<string, number>;
    return {
      charges: Number(row.charges ?? 0),
      payments: Number(row.payments ?? 0),
      deposits: Number(row.deposits ?? 0),
      refunds: Number(row.refunds ?? 0),
      adjustments: Number(row.adjustments ?? 0),
      discounts: Number(row.discounts ?? 0),
      transfersOut: Number(row.transfers_out ?? 0),
      transfersIn: Number(row.transfers_in ?? 0),
      lineCount: Number(row.line_count ?? 0),
    };
  });

export function canPostFinancialAccount(role: string): boolean {
  return canManageCashiering(role);
}
