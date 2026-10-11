import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  allocationCapabilities,
  invoiceOriginalAmount,
  noteTotals,
  paymentAvailable,
  paymentFace,
  roundAllocationMoney,
  summarizeInvoiceSettlement,
  type SettlementState,
} from "./cashiering-account-allocation";
import {
  assertIdempotencyKey,
  cashierError,
  requireCashierAllocator,
  requireCashieringAccess,
} from "./cashiering.server";

const idSchema = z.string().uuid();

type ServiceClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

const targetSchema = z.object({
  invoiceId: idSchema,
  amount: z.number().positive().finite(),
  expectedOutstanding: z.number().finite(),
});

type InvoiceRow = {
  id: string;
  issued_number: string | null;
  issued_at: string;
  snapshot: {
    totals?: { invoiceTotal?: number | null; balance?: number | null };
    account?: { currency?: string | null };
  } | null;
  financial_account_id: string;
};

type NoteRow = { account_invoice_id: string; note_type: string; total_delta: number | string };
type AllocRow = { invoice_id: string; payment_transaction_id: string; amount: number | string };

export type InvoiceSettlementRow = {
  invoiceId: string;
  number: string;
  issuedAt: string;
  originalAmount: number;
  creditNoteTotal: number;
  debitNoteTotal: number;
  effectiveNet: number;
  allocated: number;
  outstanding: number;
  settlementState: SettlementState;
  currency: string;
};

export const listFinancialAccountOutstandingInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = await loadAccount(supabaseAdmin, data.restaurantId, data.accountId);
    if (!account) return null;
    return loadSettlements(supabaseAdmin, data.restaurantId, account);
  });

export const getFinancialAccountInvoiceSettlement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema, invoiceId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = await loadAccount(supabaseAdmin, data.restaurantId, data.accountId);
    if (!account) return null;
    const rows = await loadSettlements(supabaseAdmin, data.restaurantId, account);
    const settlement = rows.find((row) => row.invoiceId === data.invoiceId);
    if (!settlement) return null;
    const lines = await supabaseAdmin
      .from("financial_account_payment_allocations")
      .select(
        "id, payment_transaction_id, amount, created_at, created_by_membership_id, reverses_allocation_id, reason",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("invoice_id", data.invoiceId);
    if (lines.error && lines.error.code !== "42P01") throw cashierError(lines.error.message);
    const allocationRows = (lines.data ?? []) as Array<{
      id: string;
      payment_transaction_id: string;
      amount: number | string;
      created_at: string;
      created_by_membership_id: string | null;
      reverses_allocation_id: string | null;
      reason: string | null;
    }>;
    const paymentIds = [...new Set(allocationRows.map((row) => row.payment_transaction_id))];
    const payments = new Map<string, { postedAt: string; method: string | null }>();
    if (paymentIds.length > 0) {
      const paymentResult = await supabaseAdmin
        .from("folio_transactions")
        .select("id, posted_at, payment_method")
        .eq("restaurant_id", data.restaurantId)
        .in("id", paymentIds);
      if (paymentResult.error) throw cashierError(paymentResult.error.message);
      for (const payment of (paymentResult.data ?? []) as Array<{
        id: string;
        posted_at: string;
        payment_method: string | null;
      }>) {
        payments.set(payment.id, { postedAt: payment.posted_at, method: payment.payment_method });
      }
    }
    const actors = await actorNames(
      supabaseAdmin,
      data.restaurantId,
      allocationRows.map((row) => row.created_by_membership_id),
    );
    return {
      ...settlement,
      allocations: allocationRows
        .filter((row) => Number(row.amount) > 0)
        .map((row) => {
          const payment = payments.get(row.payment_transaction_id);
          const reversed = allocationRows
            .filter((other) => other.reverses_allocation_id === row.id)
            .reduce((sum, other) => sum + Number(other.amount), 0);
          return {
            id: row.id,
            paymentId: row.payment_transaction_id,
            paymentDate: payment?.postedAt ?? row.created_at,
            method: payment?.method ?? null,
            amount: roundAllocationMoney(Number(row.amount) + reversed),
            actorName: row.created_by_membership_id
              ? (actors.get(row.created_by_membership_id) ?? "Staff member")
              : "System",
          };
        })
        .filter((row) => row.amount > 0.01),
    };
  });

export const getFinancialAccountPaymentAllocationWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, accountId: idSchema, paymentId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = await loadAccount(supabaseAdmin, data.restaurantId, data.accountId);
    if (!account) return null;
    const paymentResult = await supabaseAdmin
      .from("folio_transactions")
      .select("id, transaction_type, amount, posted_at, payment_method, financial_account_id")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.paymentId)
      .maybeSingle();
    if (paymentResult.error) throw cashierError(paymentResult.error.message);
    const payment = paymentResult.data as {
      id: string;
      transaction_type: string;
      amount: number | string;
      posted_at: string;
      payment_method: string | null;
      financial_account_id: string | null;
    } | null;
    if (
      !payment ||
      payment.financial_account_id !== account.id ||
      payment.transaction_type !== "payment"
    ) {
      return null;
    }
    const refunds = await supabaseAdmin
      .from("folio_transactions")
      .select("amount")
      .eq("restaurant_id", data.restaurantId)
      .eq("financial_account_id", account.id)
      .eq("transaction_type", "refund")
      .eq("original_transaction_id", payment.id);
    if (refunds.error) throw cashierError(refunds.error.message);
    const refunded = roundAllocationMoney(
      ((refunds.data ?? []) as Array<{ amount: number | string }>).reduce(
        (sum, row) => sum + Number(row.amount),
        0,
      ),
    );
    const allocationResult = await supabaseAdmin
      .from("financial_account_payment_allocations")
      .select(
        "id, invoice_id, amount, created_at, created_by_membership_id, reverses_allocation_id, reason",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("payment_transaction_id", payment.id);
    if (allocationResult.error && allocationResult.error.code !== "42P01") {
      throw cashierError(allocationResult.error.message);
    }
    const allocationRows = (allocationResult.data ?? []) as Array<{
      id: string;
      invoice_id: string;
      amount: number | string;
      created_at: string;
      created_by_membership_id: string | null;
      reverses_allocation_id: string | null;
      reason: string | null;
    }>;
    const allocated = roundAllocationMoney(
      allocationRows.reduce((sum, row) => sum + Number(row.amount), 0),
    );
    const face = paymentFace(Number(payment.amount));
    const settlements = await loadSettlements(supabaseAdmin, data.restaurantId, account);
    const rights = allocationCapabilities({ role: me.role, status: account.status });
    return {
      payment: {
        id: payment.id,
        postedAt: payment.posted_at,
        method: payment.payment_method,
        face,
        refunded,
        allocated,
        available: paymentAvailable(face, refunded, allocated),
        currency: account.currency,
      },
      allocations: allocationRows,
      invoices: settlements.filter(
        (row) => row.outstanding > 0.01 && row.currency === account.currency,
      ),
      canAllocate: rights.canAllocate && paymentAvailable(face, refunded, allocated) > 0.01,
      canReverse: rights.canReverse,
    };
  });

export const previewFinancialAccountPaymentAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        paymentId: idSchema,
        targets: z
          .array(z.object({ invoiceId: idSchema, amount: z.number().positive() }))
          .min(1)
          .max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: preview, error } = await supabaseAdmin.rpc(
      "preview_financial_account_payment_allocation",
      {
        _restaurant_id: data.restaurantId,
        _account_id: data.accountId,
        _payment_id: data.paymentId,
        _targets: data.targets,
      },
    );
    if (error) throw cashierError(error.message);
    return preview as {
      payment: {
        id: string;
        face: number;
        refunded: number;
        allocated: number;
        available: number;
        currency: string;
      };
      targets: Array<{
        invoiceId: string;
        invoiceNumber: string;
        issuedAt: string;
        effectiveNet: number;
        allocated: number;
        outstanding: number;
        proposed: number;
        remainingOutstanding: number;
      }>;
      operationTotal: number;
      remainingAvailable: number;
    };
  });

export const applyFinancialAccountPaymentAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        accountId: idSchema,
        paymentId: idSchema,
        targets: z.array(targetSchema).min(1).max(40),
        expectedPaymentAvailable: z.number().finite(),
        idempotencyKey: z.string().min(8).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierAllocator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: applied, error } = await supabaseAdmin.rpc(
      "apply_financial_account_payment_allocations",
      {
        _restaurant_id: data.restaurantId,
        _account_id: data.accountId,
        _payment_id: data.paymentId,
        _targets: data.targets,
        _expected_available: data.expectedPaymentAvailable,
        _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
        _membership_id: me.id,
      },
    );
    if (error) throw cashierError(error.message);
    return applied;
  });

export const reverseFinancialAccountPaymentAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        allocationId: idSchema,
        reason: z.string().trim().min(1).max(500),
        idempotencyKey: z.string().min(8).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await requireCashierAllocator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reversed, error } = await supabaseAdmin.rpc(
      "reverse_financial_account_payment_allocation",
      {
        _restaurant_id: data.restaurantId,
        _allocation_id: data.allocationId,
        _reason: data.reason.trim(),
        _idempotency_key: assertIdempotencyKey(data.idempotencyKey),
        _membership_id: me.id,
      },
    );
    if (error) throw cashierError(error.message);
    return reversed;
  });

async function loadAccount(supabaseAdmin: ServiceClient, restaurantId: string, accountId: string) {
  const result = await supabaseAdmin
    .from("financial_accounts")
    .select("id, currency, status")
    .eq("restaurant_id", restaurantId)
    .eq("id", accountId)
    .maybeSingle();
  if (result.error) throw cashierError(result.error.message);
  return result.data as { id: string; currency: string; status: "open" | "closed" } | null;
}

async function loadSettlements(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  account: { id: string; currency: string },
): Promise<InvoiceSettlementRow[]> {
  const invoices = await supabaseAdmin
    .from("financial_account_invoices")
    .select("id, issued_number, issued_at, snapshot, financial_account_id")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", account.id)
    .not("issued_number", "is", null);
  if (invoices.error) throw cashierError(invoices.error.message);
  const notes = await supabaseAdmin
    .from("invoice_credit_notes")
    .select("account_invoice_id, note_type, total_delta")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", account.id);
  if (notes.error && notes.error.code !== "42P01") throw cashierError(notes.error.message);
  const allocations = await supabaseAdmin
    .from("financial_account_payment_allocations")
    .select("invoice_id, payment_transaction_id, amount")
    .eq("restaurant_id", restaurantId)
    .eq("financial_account_id", account.id);
  if (allocations.error && allocations.error.code !== "42P01") {
    throw cashierError(allocations.error.message);
  }
  const noteRows = (notes.data ?? []) as NoteRow[];
  const allocRows = (allocations.data ?? []) as AllocRow[];
  return ((invoices.data ?? []) as InvoiceRow[])
    .filter((invoice) => invoice.issued_number)
    .map((invoice) => {
      const invoiceNotes = noteRows.filter((note) => note.account_invoice_id === invoice.id);
      const totals = noteTotals(
        invoiceNotes.map((note) => ({
          noteType: note.note_type,
          totalDelta: Number(note.total_delta),
        })),
      );
      const allocated = roundAllocationMoney(
        allocRows
          .filter((row) => row.invoice_id === invoice.id)
          .reduce((sum, row) => sum + Number(row.amount), 0),
      );
      const summary = summarizeInvoiceSettlement({
        invoiceTotal: invoiceOriginalAmount(invoice.snapshot),
        noteDeltas: invoiceNotes.map((note) => Number(note.total_delta)),
        allocatedNet: allocated,
      });
      return {
        invoiceId: invoice.id,
        number: invoice.issued_number as string,
        issuedAt: invoice.issued_at,
        originalAmount: summary.originalAmount,
        creditNoteTotal: totals.creditNoteTotal,
        debitNoteTotal: totals.debitNoteTotal,
        effectiveNet: summary.effectiveNet,
        allocated: summary.allocated,
        outstanding: summary.outstanding,
        settlementState: summary.settlementState,
        currency: invoice.snapshot?.account?.currency || account.currency,
      };
    })
    .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1));
}

async function actorNames(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  membershipIds: Array<string | null>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(membershipIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return names;
  const members = await supabaseAdmin
    .from("restaurant_users")
    .select("id, user_id")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  const memberRows = (members.data ?? []) as Array<{ id: string; user_id: string }>;
  const userIds = [...new Set(memberRows.map((row) => row.user_id))];
  if (userIds.length === 0) return names;
  const profiles = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", userIds);
  for (const profile of (profiles.data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>) {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
    const member = memberRows.find((row) => row.user_id === profile.id);
    if (member && name) names.set(member.id, name);
  }
  return names;
}
