import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  guestInvoiceEffectiveNet,
  guestInvoiceOriginalAmount,
  guestInvoiceOutstanding,
  guestPaymentAvailable,
  guestPaymentFace,
  guestSettlementState,
  roundGuestMoney,
  type GuestSettlementState,
} from "./cashiering-guest-allocation";
import { fiscalSnapshotMode, registeredCashDebitCover } from "./cashiering-cash-debit-cover";
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

export type GuestInvoiceSettlementRow = {
  invoiceId: string;
  number: string;
  issuedAt: string;
  coverageScope: "charge_groups" | "legacy_folio";
  eligible: boolean;
  originalAmount: number | null;
  creditNoteTotal: number;
  debitNoteTotal: number;
  cashDebitCovered: number;
  effectiveNet: number | null;
  allocated: number;
  outstanding: number | null;
  settlementState: GuestSettlementState | null;
  currency: string;
};

export type GuestPaymentAllocationLine = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  allocatedAt: string;
  actor: string | null;
  reason: string | null;
  reversesAllocationId: string | null;
  active: boolean;
};

const previewTargetSchema = z.object({
  invoiceId: idSchema,
  amount: z.number().positive().finite(),
});

export const listGuestInvoiceSettlementForFolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, folioId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folio = await loadFolio(supabaseAdmin, data.restaurantId, data.folioId);
    if (!folio) return null;
    return loadGuestSettlements(supabaseAdmin, data.restaurantId, folio);
  });

export const getGuestInvoiceSettlement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, folioId: idSchema, invoiceId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const folio = await loadFolio(supabaseAdmin, data.restaurantId, data.folioId);
    if (!folio) return null;
    const rows = await loadGuestSettlements(supabaseAdmin, data.restaurantId, folio);
    const settlement = rows.find((row) => row.invoiceId === data.invoiceId);
    if (!settlement) return null;
    const lines = await supabaseAdmin
      .from("guest_payment_invoice_allocations")
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
    const names = await actorNames(
      supabaseAdmin,
      data.restaurantId,
      allocationRows.map((row) => row.created_by_membership_id),
    );
    return {
      settlement,
      payments: allocationRows
        .filter((row) => Number(row.amount) > 0)
        .map((row) => ({
          id: row.id,
          paymentId: row.payment_transaction_id,
          postedAt: payments.get(row.payment_transaction_id)?.postedAt ?? row.created_at,
          method: payments.get(row.payment_transaction_id)?.method ?? null,
          amount: roundGuestMoney(Number(row.amount)),
          actor: row.created_by_membership_id
            ? (names.get(row.created_by_membership_id) ?? null)
            : null,
          reversed: allocationRows.some(
            (other) => other.reverses_allocation_id === row.id && Number(other.amount) < 0,
          ),
        })),
    };
  });

export async function loadGuestInvoiceSettlementForWrite(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  folioId: string,
  invoiceId: string,
): Promise<GuestInvoiceSettlementRow | null> {
  const folio = await loadFolio(supabaseAdmin, restaurantId, folioId);
  if (!folio) return null;
  const rows = await loadGuestSettlements(supabaseAdmin, restaurantId, folio);
  return rows.find((row) => row.invoiceId === invoiceId) ?? null;
}

export const getGuestPaymentAllocationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: idSchema, folioId: idSchema, paymentId: idSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payment = await supabaseAdmin
      .from("folio_transactions")
      .select("id, folio_id, transaction_type, amount, payment_method, posted_at")
      .eq("restaurant_id", data.restaurantId)
      .eq("id", data.paymentId)
      .maybeSingle();
    if (payment.error) throw cashierError(payment.error.message);
    const row = payment.data as {
      id: string;
      folio_id: string | null;
      transaction_type: string;
      amount: number | string;
      payment_method: string | null;
      posted_at: string;
    } | null;
    if (!row || row.folio_id !== data.folioId || row.transaction_type !== "payment") return null;
    const refunds = await supabaseAdmin
      .from("folio_transactions")
      .select("amount")
      .eq("restaurant_id", data.restaurantId)
      .eq("folio_id", data.folioId)
      .eq("transaction_type", "refund")
      .eq("original_transaction_id", row.id);
    if (refunds.error) throw cashierError(refunds.error.message);
    const refunded = roundGuestMoney(
      ((refunds.data ?? []) as Array<{ amount: number | string }>).reduce(
        (sum, line) => sum + Number(line.amount),
        0,
      ),
    );
    const allocations = await supabaseAdmin
      .from("guest_payment_invoice_allocations")
      .select(
        "id, invoice_id, amount, created_at, created_by_membership_id, reverses_allocation_id, reason",
      )
      .eq("restaurant_id", data.restaurantId)
      .eq("payment_transaction_id", row.id);
    if (allocations.error && allocations.error.code !== "42P01") {
      throw cashierError(allocations.error.message);
    }
    const allocRows = (allocations.data ?? []) as Array<{
      id: string;
      invoice_id: string;
      amount: number | string;
      created_at: string;
      created_by_membership_id: string | null;
      reverses_allocation_id: string | null;
      reason: string | null;
    }>;
    const allocated = roundGuestMoney(
      allocRows.reduce((sum, line) => sum + Number(line.amount), 0),
    );
    const face = guestPaymentFace(Number(row.amount));
    const invoiceIds = [...new Set(allocRows.map((line) => line.invoice_id))];
    const numbers = new Map<string, string>();
    if (invoiceIds.length > 0) {
      const invoices = await supabaseAdmin
        .from("guest_folio_invoices")
        .select("id, issued_number")
        .eq("restaurant_id", data.restaurantId)
        .in("id", invoiceIds);
      if (invoices.error) throw cashierError(invoices.error.message);
      for (const invoice of (invoices.data ?? []) as Array<{ id: string; issued_number: string }>) {
        numbers.set(invoice.id, invoice.issued_number);
      }
    }
    const names = await actorNames(
      supabaseAdmin,
      data.restaurantId,
      allocRows.map((line) => line.created_by_membership_id),
    );
    const lines: GuestPaymentAllocationLine[] = allocRows.map((line) => {
      const amount = roundGuestMoney(Number(line.amount));
      const reversed = allocRows.some(
        (other) => other.reverses_allocation_id === line.id && Number(other.amount) < 0,
      );
      return {
        id: line.id,
        invoiceId: line.invoice_id,
        invoiceNumber: numbers.get(line.invoice_id) ?? "Invoice",
        amount,
        allocatedAt: line.created_at,
        actor: line.created_by_membership_id
          ? (names.get(line.created_by_membership_id) ?? null)
          : null,
        reason: line.reason,
        reversesAllocationId: line.reverses_allocation_id,
        active: amount > 0 && !reversed,
      };
    });
    return {
      paymentId: row.id,
      method: row.payment_method,
      postedAt: row.posted_at,
      face,
      refunded,
      allocated,
      available: guestPaymentAvailable(face, refunded, allocated),
      lines,
    };
  });

export const previewGuestPaymentInvoiceAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        folioId: idSchema,
        paymentId: idSchema,
        targets: z.array(previewTargetSchema).min(1).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCashieringAccess(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: preview, error } = await supabaseAdmin.rpc(
      "preview_guest_payment_invoice_allocation",
      {
        _restaurant_id: data.restaurantId,
        _folio_id: data.folioId,
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

export const applyGuestPaymentInvoiceAllocations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        restaurantId: idSchema,
        folioId: idSchema,
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
      "apply_guest_payment_invoice_allocations",
      {
        _restaurant_id: data.restaurantId,
        _folio_id: data.folioId,
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

export const reverseGuestPaymentInvoiceAllocation = createServerFn({ method: "POST" })
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
      "reverse_guest_payment_invoice_allocation",
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

async function loadFolio(supabaseAdmin: ServiceClient, restaurantId: string, folioId: string) {
  const result = await supabaseAdmin
    .from("guest_folios")
    .select("id, currency, status")
    .eq("restaurant_id", restaurantId)
    .eq("id", folioId)
    .maybeSingle();
  if (result.error) throw cashierError(result.error.message);
  return result.data as { id: string; currency: string; status: "open" | "closed" } | null;
}

async function loadGuestSettlements(
  supabaseAdmin: ServiceClient,
  restaurantId: string,
  folio: { id: string; currency: string },
): Promise<GuestInvoiceSettlementRow[]> {
  const invoices = await supabaseAdmin
    .from("guest_folio_invoices")
    .select("id, issued_number, issued_at, snapshot, coverage_scope, folio_id")
    .eq("restaurant_id", restaurantId)
    .eq("folio_id", folio.id);
  if (invoices.error) throw cashierError(invoices.error.message);
  const notes = await supabaseAdmin
    .from("invoice_credit_notes")
    .select("id, guest_invoice_id, note_type, total_delta")
    .eq("restaurant_id", restaurantId)
    .eq("folio_id", folio.id);
  if (notes.error && notes.error.code !== "42P01") throw cashierError(notes.error.message);
  const allocations = await supabaseAdmin
    .from("guest_payment_invoice_allocations")
    .select("invoice_id, amount")
    .eq("restaurant_id", restaurantId)
    .eq("guest_folio_id", folio.id);
  if (allocations.error && allocations.error.code !== "42P01") {
    throw cashierError(allocations.error.message);
  }
  const noteRows = (notes.data ?? []) as Array<{
    id: string;
    guest_invoice_id: string | null;
    note_type: string;
    total_delta: number | string;
  }>;
  const debitIds = noteRows.filter((note) => note.note_type === "debit").map((note) => note.id);
  const cashDebitRegistrations = new Map<
    string,
    { status: string; mode: "CASH" | "CREDIT" | null }
  >();
  if (debitIds.length > 0) {
    const registrations = await supabaseAdmin
      .from("fiscal_registrations")
      .select("source_id, status, request_snapshot")
      .eq("restaurant_id", restaurantId)
      .eq("source_type", "debit_note")
      .eq("fiscal_document_type", "DEB")
      .in("source_id", debitIds);
    if (registrations.error && registrations.error.code !== "42P01") {
      throw cashierError(registrations.error.message);
    }
    for (const row of (registrations.data ?? []) as Array<{
      source_id: string;
      status: string;
      request_snapshot: unknown;
    }>) {
      cashDebitRegistrations.set(row.source_id, {
        status: row.status,
        mode: fiscalSnapshotMode(row.request_snapshot),
      });
    }
  }
  const allocRows = (allocations.data ?? []) as Array<{
    invoice_id: string;
    amount: number | string;
  }>;
  return (
    (invoices.data ?? []) as Array<{
      id: string;
      issued_number: string;
      issued_at: string;
      coverage_scope: string;
      snapshot: { totals?: { invoiceTotal?: number | null }; property?: { currencyCode?: string } };
    }>
  )
    .map((invoice) => {
      const coverageScope =
        invoice.coverage_scope === "legacy_folio" ? "legacy_folio" : "charge_groups";
      const eligible = coverageScope === "charge_groups";
      const original = guestInvoiceOriginalAmount(invoice.snapshot);
      const invoiceNotes = noteRows.filter((note) => note.guest_invoice_id === invoice.id);
      const deltas = invoiceNotes.map((note) => Number(note.total_delta));
      const allocated = roundGuestMoney(
        allocRows
          .filter((row) => row.invoice_id === invoice.id)
          .reduce((sum, row) => sum + Number(row.amount), 0),
      );
      const creditNoteTotal = roundGuestMoney(
        invoiceNotes
          .filter((note) => note.note_type !== "debit")
          .reduce((sum, note) => sum + Number(note.total_delta), 0),
      );
      const debitNoteTotal = roundGuestMoney(
        invoiceNotes
          .filter((note) => note.note_type === "debit")
          .reduce((sum, note) => sum + Number(note.total_delta), 0),
      );
      const cashDebitCovered = registeredCashDebitCover(
        invoiceNotes.map((note) => ({
          id: note.id,
          noteType: note.note_type,
          totalDelta: Number(note.total_delta),
        })),
        invoiceNotes.map((note) => ({
          sourceId: note.id,
          status: cashDebitRegistrations.get(note.id)?.status ?? "",
          mode: cashDebitRegistrations.get(note.id)?.mode ?? null,
        })),
      );
      if (!eligible || original == null) {
        return {
          invoiceId: invoice.id,
          number: invoice.issued_number,
          issuedAt: invoice.issued_at,
          coverageScope,
          eligible: false,
          originalAmount: original,
          creditNoteTotal,
          debitNoteTotal,
          cashDebitCovered,
          effectiveNet: null,
          allocated: 0,
          outstanding: null,
          settlementState: null,
          currency: invoice.snapshot?.property?.currencyCode || folio.currency,
        } satisfies GuestInvoiceSettlementRow;
      }
      const effectiveNet = guestInvoiceEffectiveNet(original, deltas);
      const settled = roundGuestMoney(allocated + cashDebitCovered);
      return {
        invoiceId: invoice.id,
        number: invoice.issued_number,
        issuedAt: invoice.issued_at,
        coverageScope,
        eligible: true,
        originalAmount: original,
        creditNoteTotal,
        debitNoteTotal,
        cashDebitCovered,
        effectiveNet,
        allocated,
        outstanding: Math.max(0, guestInvoiceOutstanding(effectiveNet, settled)),
        settlementState: guestSettlementState(effectiveNet, settled),
        currency: invoice.snapshot?.property?.currencyCode || folio.currency,
      } satisfies GuestInvoiceSettlementRow;
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
