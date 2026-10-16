import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  invoicePaymentAllocationKey,
  roundInvoicePayment,
  validateInvoicePaymentAmount,
} from "./cashiering-invoice-payment.ts";

const orchestration = readFileSync(
  new URL("./cashiering-invoice-payment.functions.ts", import.meta.url),
  "utf8",
);
const receiveDialog = readFileSync(
  new URL("../components/cashiering/invoice-receive-payment-dialog.tsx", import.meta.url),
  "utf8",
);
const guestModal = readFileSync(
  new URL("../components/cashiering/guest-invoice-modal.tsx", import.meta.url),
  "utf8",
);
const companyModal = readFileSync(
  new URL("../components/cashiering/account-invoice-modal.tsx", import.meta.url),
  "utf8",
);
const guestBuilder = readFileSync(
  new URL("../components/cashiering/guest-invoice-builder.tsx", import.meta.url),
  "utf8",
);
const companyBuilder = readFileSync(
  new URL("../components/cashiering/account-invoice-builder.tsx", import.meta.url),
  "utf8",
);

describe("invoice-specific payment settlement", () => {
  it("allows partial and exact payment but rejects overpayment", () => {
    assert.equal(validateInvoicePaymentAmount(400, 1_000), null);
    assert.equal(validateInvoicePaymentAmount(1_000, 1_000), null);
    assert.match(validateInvoicePaymentAmount(1_000.01, 1_000) ?? "", /cannot exceed/i);
    assert.match(validateInvoicePaymentAmount(0, 1_000) ?? "", /greater than zero/i);
    assert.equal(roundInvoicePayment(400.005), 400.01);
  });

  it("derives one stable allocation key from the payment idempotency key", () => {
    const paymentKey = "payment-key-123456";
    assert.equal(invoicePaymentAllocationKey(paymentKey), invoicePaymentAllocationKey(paymentKey));
    assert.match(invoicePaymentAllocationKey(paymentKey), /^invoice-allocation:/);
    assert.equal(invoicePaymentAllocationKey("x".repeat(100)).length, 80);
  });

  it("uses the official payment and allocation writers in order", () => {
    const guestPost = orchestration.indexOf("callPostFolioTransaction");
    const guestAllocate = orchestration.indexOf("apply_guest_payment_invoice_allocations");
    const companyPost = orchestration.indexOf("post_financial_account_transaction");
    const companyAllocate = orchestration.indexOf("apply_financial_account_payment_allocations");
    assert.ok(guestPost >= 0 && guestPost < guestAllocate);
    assert.ok(companyPost >= 0 && companyPost < companyAllocate);
    assert.match(orchestration, /stage: "allocation",\s*paymentId/);
    assert.match(orchestration, /requireCashierOperator/);
    assert.doesNotMatch(orchestration, /\.from\(["']folio_transactions["']\)\.insert/);
  });

  it("retains the payment key for an allocation-only retry", () => {
    assert.match(receiveDialog, /Retry Allocation/);
    assert.match(receiveDialog, /if \(unallocatedPaymentId\) return/);
    assert.match(receiveDialog, /paymentIdempotencyKey: idempotencyKey/);
    assert.match(receiveDialog, /receiveGuest\(\{ data: input \}\)/);
    assert.match(receiveDialog, /receiveCompany\(\{ data: input \}\)/);
    assert.match(receiveDialog, /Payment received\. It is not allocated yet\./);
  });

  it("keeps issue document-only and opens the issued invoice", () => {
    assert.match(guestBuilder, /setViewingInvoice\(result\.invoice\)/);
    assert.match(companyBuilder, /setViewingInvoice\(result\.invoice\)/);
    assert.doesNotMatch(guestBuilder, /receiveGuestInvoicePayment/);
    assert.doesNotMatch(companyBuilder, /receiveCompanyInvoicePayment/);
  });

  it("shows settlement actions while excluding deposits from eligible payments", () => {
    assert.match(guestModal, /row\.type === "payment"/);
    assert.doesNotMatch(guestModal, /row\.type === "deposit"/);
    assert.match(guestModal, /canAllocate=\{workspace\.canAllocateInvoices/);
    assert.match(companyModal, /canAllocate=\{canAllocate && accountOpen\}/);
    assert.match(companyModal, /withholding=\{settlement\?\.withholding \?\? 0\}/);
  });
});
