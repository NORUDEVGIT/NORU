import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  mapAccountInvoiceGroup,
  mapAccountInvoiceSnapshot,
  mapAccountBillTo,
  type AccountInvoiceBoard,
  type AccountInvoiceKind,
  type IssuedAccountInvoice,
} from "./cashiering-account-invoices";
import {
  assertIdempotencyKey,
  canManageCashiering,
  cashierError,
  requireCashierManager,
  requireCashieringAccess,
} from "./cashiering.server";

const idSchema = z.string().uuid();
const draftNotes = z.string().max(500).optional();

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapIssued(row: {
  id: string;
  issued_number: string;
  sequence_number: number;
  issued_at: string;
  reprint_count: number;
  last_reprinted_at: string | null;
  snapshot: unknown;
}): IssuedAccountInvoice {
  return {
    id: row.id,
    issuedNumber: row.issued_number,
    sequenceNumber: row.sequence_number,
    issuedAt: row.issued_at,
    reprintCount: row.reprint_count,
    lastReprintedAt: row.last_reprinted_at,
    snapshot: mapAccountInvoiceSnapshot(row.snapshot),
  };
}

export const getFinancialAccountInvoiceBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      AccountInvoiceBoard & { canManage: boolean; invoiceSettingsAvailable: boolean }
    > => {
      const me = await requireCashieringAccess(context as never, data.restaurantId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: payload, error } = await supabaseAdmin.rpc(
        "list_financial_account_invoice_groups",
        {
          _restaurant_id: data.restaurantId,
          _account_id: data.accountId,
        },
      );
      if (error) throw cashierError(error.message);
      const row = (payload ?? {}) as Record<string, unknown>;
      const account = (row.account ?? {}) as Record<string, unknown>;
      const kind: AccountInvoiceKind = account.accountKind === "group" ? "group" : "company";
      const draft = (row.draft ?? null) as Record<string, unknown> | null;
      const { data: settings } = await supabaseAdmin
        .from("pms_invoice_settings")
        .select("restaurant_id")
        .eq("restaurant_id", data.restaurantId)
        .maybeSingle();
      return {
        account: {
          id: String(account.id ?? data.accountId),
          accountNumber: String(account.accountNumber ?? ""),
          accountKind: kind,
          status: account.status === "closed" ? "closed" : "open",
          currency: String(account.currency ?? "ETB"),
          balance: num(account.balance),
          creditLimitAmount:
            account.creditLimitAmount == null ? null : num(account.creditLimitAmount),
        },
        billTo: mapAccountBillTo(row.billTo, kind),
        invoiceableAmount: num(row.invoiceableAmount),
        groups: Array.isArray(row.groups) ? row.groups.map(mapAccountInvoiceGroup) : [],
        draft: draft
          ? {
              id: String(draft.id ?? ""),
              notes: typeof draft.notes === "string" ? draft.notes : null,
              updatedAt: String(draft.updatedAt ?? ""),
              selectedIds: Array.isArray(draft.selectedIds)
                ? draft.selectedIds.map((id) => String(id))
                : [],
            }
          : null,
        canManage: canManageCashiering(me.role),
        invoiceSettingsAvailable: Boolean(settings),
      };
    },
  );

export const listFinancialAccountInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<IssuedAccountInvoice[]> => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("financial_account_invoices")
      .select(
        "id, issued_number, sequence_number, issued_at, reprint_count, last_reprinted_at, snapshot",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("financial_account_id", data.accountId)
      .order("issued_at", { ascending: false });
    if (error) throw cashierError(error.message);
    return ((rows ?? []) as Parameters<typeof mapIssued>[0][]).map(mapIssued);
  });

export const previewFinancialAccountInvoiceSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        sourceIds: z.array(idSchema).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: preview, error } = await supabaseAdmin.rpc(
      "preview_financial_account_invoice_selection",
      {
        _restaurant_id: data.restaurantId,
        _account_id: data.accountId,
        _source_ids: data.sourceIds,
      },
    );
    if (error) throw cashierError(error.message);
    const row = (preview ?? {}) as Record<string, unknown>;
    return {
      groups: Array.isArray(row.groups) ? row.groups.map(mapAccountInvoiceGroup) : [],
      warnings: Array.isArray(row.warnings)
        ? row.warnings.map((warning) => {
            const item = warning as Record<string, unknown>;
            return {
              sourceGroupId: String(item.sourceGroupId ?? ""),
              code: String(item.code ?? "ACCOUNT_CHARGE_NOT_INVOICEABLE"),
            };
          })
        : [],
      subtotal: num(row.subtotal),
      tax: num(row.tax),
      serviceCharge: num(row.serviceCharge),
      total: num(row.total),
    };
  });

export const createFinancialAccountInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema, notes: draftNotes }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("create_financial_account_invoice_draft", {
      _restaurant_id: data.restaurantId,
      _account_id: data.accountId,
      _notes: data.notes ?? null,
      _membership_id: me.id,
    });
    if (error) return { ok: false as const, message: cashierError(error.message).message };
    return { ok: true as const, draftId: String((row as { id?: string } | null)?.id ?? "") };
  });

export const updateFinancialAccountInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draftId: idSchema,
        notes: draftNotes,
        sourceIds: z.array(idSchema).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("update_financial_account_invoice_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _notes: data.notes ?? null,
      _source_ids: data.sourceIds,
      _membership_id: me.id,
    });
    if (error) return { ok: false as const, message: cashierError(error.message).message };
    return { ok: true as const };
  });

export const deleteFinancialAccountInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, draftId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("delete_financial_account_invoice_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _membership_id: me.id,
    });
    if (error) return { ok: false as const, message: cashierError(error.message).message };
    return { ok: true as const };
  });

export const issueFinancialAccountInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        draftId: idSchema,
        idempotencyKey: z.string().min(8).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("issue_financial_account_invoice_draft", {
      _restaurant_id: data.restaurantId,
      _draft_id: data.draftId,
      _membership_id: me.id,
      _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
    });
    if (error) return { ok: false as const, message: cashierError(error.message).message };
    const invoice = row as Parameters<typeof mapIssued>[0] | null;
    if (!invoice?.id) return { ok: false as const, message: "The invoice could not be issued." };
    return { ok: true as const, invoice: mapIssued(invoice) };
  });

export const reprintFinancialAccountInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, invoiceId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierManager(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("reprint_financial_account_invoice", {
      _restaurant_id: data.restaurantId,
      _invoice_id: data.invoiceId,
      _membership_id: me.id,
    });
    if (error) return { ok: false as const, message: cashierError(error.message).message };
    const invoice = row as Parameters<typeof mapIssued>[0] | null;
    if (!invoice?.id) return { ok: false as const, message: "The invoice could not be reprinted." };
    return { ok: true as const, invoice: mapIssued(invoice) };
  });
