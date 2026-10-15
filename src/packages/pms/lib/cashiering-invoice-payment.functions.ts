import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACCOUNT_TENDER_METHODS } from "./cashiering-account-payments";
import { loadFinancialAccountInvoiceSettlementForWrite } from "./cashiering-account-allocation.functions";
import { loadGuestInvoiceSettlementForWrite } from "./cashiering-guest-allocation.functions";
import {
  invoicePaymentAllocationKey,
  roundInvoicePayment,
  validateInvoicePaymentAmount,
} from "./cashiering-invoice-payment";
import {
  assertIdempotencyKey,
  callPostFolioTransaction,
  cashierError,
  requireCashierOperator,
} from "./cashiering.server";
import { folioTenderFromCatalogue } from "./pms-polish1-payment-admin";
import { loadPolish1Snapshot } from "./pms-polish1-payment-admin.functions";

const idSchema = z.string().uuid();
const moneySchema = z.number().finite().positive();

const inputSchema = z.object({
  restaurantId: idSchema,
  parentId: idSchema,
  invoiceId: idSchema,
  amount: moneySchema,
  method: z.string().trim().min(1).max(60),
  receivedFrom: z.string().trim().min(1).max(120),
  note: z.string().trim().max(120).optional(),
  paymentIdempotencyKey: z.string().min(8).max(80),
});

export type InvoiceReceivePaymentResult =
  | {
      ok: true;
      paymentId: string;
      allocatedAmount: number;
      replayed: boolean;
    }
  | {
      ok: false;
      stage: "payment";
      message: string;
    }
  | {
      ok: false;
      stage: "allocation";
      paymentId: string;
      message: string;
    };

function paymentDescription(
  receivedFrom: string,
  note: string | undefined,
  method: string,
): string {
  const payer = receivedFrom.trim();
  const detail = note?.trim();
  const body = detail ? `${detail} · Received from ${payer}` : `Received from ${payer}`;
  return `${body} (${method})`.slice(0, 200);
}

export const receiveGuestInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<InvoiceReceivePaymentResult> => {
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settlement = await loadGuestInvoiceSettlementForWrite(
      supabaseAdmin,
      data.restaurantId,
      data.parentId,
      data.invoiceId,
    );
    if (!settlement || settlement.outstanding == null) {
      return { ok: false, stage: "payment", message: "That issued invoice was not found." };
    }
    const invalid = validateInvoicePaymentAmount(data.amount, settlement.outstanding);
    if (invalid) return { ok: false, stage: "payment", message: invalid };

    const snapshot = await loadPolish1Snapshot(supabaseAdmin, data.restaurantId);
    const tender = folioTenderFromCatalogue(
      data.method,
      snapshot.paymentMethodsAvailable ? snapshot.paymentMethods : null,
    );
    if (!tender.ok) return { ok: false, stage: "payment", message: tender.message };

    const paymentKey = assertIdempotencyKey(data.paymentIdempotencyKey);
    let paymentId: string;
    try {
      const payment = await callPostFolioTransaction({
        restaurantId: data.restaurantId,
        folioId: data.parentId,
        type: "payment",
        category: "payment",
        description: paymentDescription(data.receivedFrom, data.note, data.method),
        amount: roundInvoicePayment(data.amount),
        membershipId: me.id,
        paymentMethod: tender.stored,
        idempotencyKey: paymentKey,
      });
      paymentId = payment.id;
    } catch (error) {
      return { ok: false, stage: "payment", message: (error as Error).message };
    }

    const { data: allocated, error } = await supabaseAdmin.rpc(
      "apply_guest_payment_invoice_allocations",
      {
        _restaurant_id: data.restaurantId,
        _folio_id: data.parentId,
        _payment_id: paymentId,
        _targets: [
          {
            invoiceId: data.invoiceId,
            amount: roundInvoicePayment(data.amount),
            expectedOutstanding: roundInvoicePayment(settlement.outstanding),
          },
        ],
        _expected_available: roundInvoicePayment(data.amount),
        _idempotency_key: invoicePaymentAllocationKey(paymentKey),
        _membership_id: me.id,
      },
    );
    if (error) {
      return {
        ok: false,
        stage: "allocation",
        paymentId,
        message: cashierError(error.message).message,
      };
    }
    return {
      ok: true,
      paymentId,
      allocatedAmount: roundInvoicePayment(data.amount),
      replayed: Boolean((allocated as { replayed?: unknown } | null)?.replayed),
    };
  });

export const receiveCompanyInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<InvoiceReceivePaymentResult> => {
    const me = await requireCashierOperator(context as never, data.restaurantId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settlement = await loadFinancialAccountInvoiceSettlementForWrite(
      supabaseAdmin,
      data.restaurantId,
      data.parentId,
      data.invoiceId,
    );
    if (!settlement) {
      return { ok: false, stage: "payment", message: "That issued invoice was not found." };
    }
    const invalid = validateInvoicePaymentAmount(data.amount, settlement.outstanding);
    if (invalid) return { ok: false, stage: "payment", message: invalid };
    if (!ACCOUNT_TENDER_METHODS.includes(data.method as (typeof ACCOUNT_TENDER_METHODS)[number])) {
      return { ok: false, stage: "payment", message: "Choose a payment method." };
    }

    const paymentKey = assertIdempotencyKey(data.paymentIdempotencyKey);
    const { data: payment, error: paymentError } = await supabaseAdmin.rpc(
      "post_financial_account_transaction",
      {
        _restaurant_id: data.restaurantId,
        _account_id: data.parentId,
        _type: "payment",
        _category: "payment",
        _description: paymentDescription(data.receivedFrom, data.note, data.method),
        _amount: roundInvoicePayment(data.amount),
        _membership_id: me.id,
        _payment_method: data.method,
        _idempotency_key: paymentKey,
        _original_transaction_id: undefined,
      },
    );
    if (paymentError) {
      return {
        ok: false,
        stage: "payment",
        message: cashierError(paymentError.message).message,
      };
    }
    const paymentId = String((payment as { id?: unknown } | null)?.id ?? "");
    if (!paymentId) {
      return { ok: false, stage: "payment", message: "The payment could not be posted." };
    }

    const { data: allocated, error } = await supabaseAdmin.rpc(
      "apply_financial_account_payment_allocations",
      {
        _restaurant_id: data.restaurantId,
        _account_id: data.parentId,
        _payment_id: paymentId,
        _targets: [
          {
            invoiceId: data.invoiceId,
            amount: roundInvoicePayment(data.amount),
            expectedOutstanding: roundInvoicePayment(settlement.outstanding),
          },
        ],
        _expected_available: roundInvoicePayment(data.amount),
        _idempotency_key: invoicePaymentAllocationKey(paymentKey),
        _membership_id: me.id,
      },
    );
    if (error) {
      return {
        ok: false,
        stage: "allocation",
        paymentId,
        message: cashierError(error.message).message,
      };
    }
    return {
      ok: true,
      paymentId,
      allocatedAmount: roundInvoicePayment(data.amount),
      replayed: Boolean((allocated as { replayed?: unknown } | null)?.replayed),
    };
  });
