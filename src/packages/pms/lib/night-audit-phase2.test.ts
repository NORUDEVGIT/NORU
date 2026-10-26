import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { activeWithholdingNet } from "./cashiering-account-allocation.ts";
import { classifyIssuedGuestInvoice } from "./cashiering-guest-allocation.ts";
import { planExceptionSync } from "./night-audit-exceptions.ts";
import {
  NIGHT_AUDIT_FISCAL_HANDLERS,
  OCCUPANCY_FEE_NOTE,
  financialAllowsClose,
  financialEmptyCopy,
  financialIssuesToExceptions,
  fiscalHandlerEnabled,
  matchesFinancialFilter,
  presentNightAuditFinancials,
  reconcileNightAuditFinancials,
  type NightAuditFinancialFacts,
} from "./night-audit-financial.ts";

const DATE = "2026-10-21";
const TZ = "Africa/Addis_Ababa";

function facts(patch: Partial<NightAuditFinancialFacts> = {}): NightAuditFinancialFacts {
  return {
    businessDate: DATE,
    timezone: TZ,
    checkedAt: "2026-10-21T20:00:00.000Z",
    folios: [],
    transactions: [],
    missingFolios: [],
    invoices: [],
    sources: [],
    allocations: [],
    accounts: [],
    transfers: [],
    drawers: [],
    integrationEnabled: false,
    fiscalDocuments: [],
    taxLines: [],
    ...patch,
  };
}

function folio(patch: Partial<NightAuditFinancialFacts["folios"][number]> = {}) {
  return {
    id: "folio-1",
    number: "F1",
    status: "open",
    closedAt: null,
    guestName: "Ada",
    reservationId: "res-1",
    confirmationNumber: "R1",
    room: "101",
    currency: "ETB",
    ...patch,
  };
}

function invoice(patch: Partial<NightAuditFinancialFacts["invoices"][number]> = {}) {
  return {
    id: "inv-1",
    folioId: "folio-1",
    number: "INV-1",
    issuedAt: "2026-10-21T08:00:00.000Z",
    guestName: "Ada",
    currency: "ETB",
    eligible: true,
    invoiceTotal: 100,
    noteDeltas: [] as number[],
    paymentAllocated: 0,
    depositApplied: 0,
    cashDebitCovered: 0,
    snapshotTax: null,
    snapshotServiceCharge: null,
    issuedOnAuditDate: true,
    ...patch,
  };
}

function source(patch: Partial<NightAuditFinancialFacts["sources"][number]> = {}) {
  return {
    id: "pay-1",
    kind: "payment" as const,
    reference: "payment · cash",
    guestName: "Ada",
    currency: "ETB",
    face: 100,
    refunded: 0,
    allocated: 100,
    targetInvoice: "INV-1",
    ...patch,
  };
}

const financial = readFileSync(new URL("./night-audit-financial.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("./night-audit-financial.server.ts", import.meta.url), "utf8");
const functions = readFileSync(new URL("./nightaudit.functions.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/nightaudit/night-audit-financial-panel.tsx", import.meta.url), "utf8");
const desk = readFileSync(new URL("../components/nightaudit/night-audit-desk.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/workspaces/night-audit-workspace.tsx", import.meta.url), "utf8");

describe("guest folios", () => {
  it("warns on an open in-house balance", () => {
    const result = reconcileNightAuditFinancials(
      facts({
        folios: [folio()],
        transactions: [{ folioId: "folio-1", amount: 80, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null }],
      }),
    );
    assert.equal(result.guestFolios[0]?.status, "warning");
    assert.equal(result.issues.some((row) => row.code === "open_folio_balance"), true);
    assert.equal(result.status, "warning");
  });

  it("blocks a closed folio with a non-zero balance", () => {
    const result = reconcileNightAuditFinancials(
      facts({
        folios: [folio({ status: "closed", closedAt: "2026-10-21T18:00:00.000Z" })],
        transactions: [{ folioId: "folio-1", amount: 25, postedAt: "2026-10-21T12:00:00.000Z", referenceType: null, referenceId: null }],
      }),
    );
    assert.equal(result.issues.some((row) => row.code === "closed_folio_nonzero_balance" && row.severity === "blocking"), true);
    assert.equal(result.status, "blocked");
  });

  it("blocks posting after folio close", () => {
    const result = reconcileNightAuditFinancials(
      facts({
        folios: [folio({ status: "closed", closedAt: "2026-10-21T12:00:00.000Z" })],
        transactions: [{ folioId: "folio-1", amount: 10, postedAt: "2026-10-21T13:00:00.000Z", referenceType: null, referenceId: null }],
      }),
    );
    assert.equal(result.issues.some((row) => row.code === "closed_folio_post_activity"), true);
  });

  it("blocks a duplicate reservation room charge", () => {
    const result = reconcileNightAuditFinancials(
      facts({
        folios: [folio()],
        transactions: [
          { folioId: "folio-1", amount: 50, postedAt: "2026-10-21T10:00:00.000Z", referenceType: "reservation_room_charge", referenceId: "stay-1" },
          { folioId: "folio-1", amount: 50, postedAt: "2026-10-21T11:00:00.000Z", referenceType: "reservation_room_charge", referenceId: "stay-1" },
        ],
      }),
    );
    assert.equal(result.issues.some((row) => row.code === "duplicate_room_charge" && row.severity === "blocking"), true);
  });

  it("warns when a priced in-house stay has no folio", () => {
    const result = reconcileNightAuditFinancials(
      facts({
        missingFolios: [{ id: "res-9", confirmationNumber: "R9", status: "checked_in", guestName: "Bea", room: "102" }],
      }),
    );
    assert.equal(result.issues.some((row) => row.code === "missing_folio" && row.severity === "warning"), true);
    assert.equal(result.status, "warning");
  });

  it("passes a settled closed folio", () => {
    const result = reconcileNightAuditFinancials(
      facts({
        folios: [folio({ status: "closed", closedAt: "2026-10-21T18:00:00.000Z" })],
        transactions: [
          { folioId: "folio-1", amount: 100, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null },
          { folioId: "folio-1", amount: -100, postedAt: "2026-10-21T11:00:00.000Z", referenceType: null, referenceId: null },
        ],
        invoices: [invoice({ paymentAllocated: 100 })],
      }),
    );
    assert.equal(result.guestFolios[0]?.status, "pass");
    assert.equal(result.status, "ready");
  });
});

describe("invoice settlement", () => {
  it("uses payment-only settlement from Cashiering", () => {
    const result = reconcileNightAuditFinancials(facts({ folios: [folio()], invoices: [invoice({ paymentAllocated: 100 })], transactions: [{ folioId: "folio-1", amount: 100, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null }] }));
    assert.equal(result.invoiceSettlement[0]?.outstanding, 0);
    const direct = classifyIssuedGuestInvoice({ eligible: true, invoiceTotal: 100, noteDeltas: [], paymentAllocated: 100, depositApplied: 0, cashDebitCovered: 0 });
    assert.equal(result.invoiceSettlement[0]?.outstanding, direct.outstanding);
  });

  it("uses deposit-only settlement", () => {
    const result = reconcileNightAuditFinancials(facts({ folios: [folio()], invoices: [invoice({ depositApplied: 100 })], transactions: [{ folioId: "folio-1", amount: 100, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null }] }));
    assert.equal(result.invoiceSettlement[0]?.depositApplied, 100);
    assert.equal(result.invoiceSettlement[0]?.outstanding, 0);
  });

  it("uses mixed payment and deposit settlement", () => {
    const result = reconcileNightAuditFinancials(facts({ folios: [folio()], invoices: [invoice({ paymentAllocated: 60, depositApplied: 40 })], transactions: [{ folioId: "folio-1", amount: 100, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null }] }));
    assert.equal(result.invoiceSettlement[0]?.outstanding, 0);
  });

  it("keeps a credit-note delta visible", () => {
    const result = reconcileNightAuditFinancials(facts({ folios: [folio()], invoices: [invoice({ noteDeltas: [-20], paymentAllocated: 80 })], transactions: [{ folioId: "folio-1", amount: 80, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null }] }));
    assert.equal(result.invoiceSettlement[0]?.invoiceTotal, 100);
    assert.equal(result.invoiceSettlement[0]?.creditDebitAdjustment, -20);
    assert.equal(result.invoiceSettlement[0]?.outstanding, 0);
  });

  it("keeps a debit-note delta visible", () => {
    const result = reconcileNightAuditFinancials(facts({ folios: [folio()], invoices: [invoice({ noteDeltas: [15] })], transactions: [{ folioId: "folio-1", amount: 115, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null }] }));
    assert.equal(result.invoiceSettlement[0]?.creditDebitAdjustment, 15);
    assert.equal(result.invoiceSettlement[0]?.outstanding, 115);
  });

  it("includes registered cash-debit cover in outstanding", () => {
    const result = reconcileNightAuditFinancials(facts({ folios: [folio()], invoices: [invoice({ paymentAllocated: 70, cashDebitCovered: 30 })], transactions: [{ folioId: "folio-1", amount: 100, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null }] }));
    assert.equal(result.invoiceSettlement[0]?.cashDebitCovered, 30);
    assert.equal(result.invoiceSettlement[0]?.outstanding, 0);
  });

  it("shows a true outstanding invoice without a contradiction blocker", () => {
    const result = reconcileNightAuditFinancials(facts({ folios: [folio()], invoices: [invoice({ paymentAllocated: 60 })], transactions: [{ folioId: "folio-1", amount: 100, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null }] }));
    assert.equal(result.invoiceSettlement[0]?.outstanding, 40);
    assert.equal(result.invoiceSettlement[0]?.status, "pass");
    assert.equal(result.issues.some((row) => row.code === "folio_invoice_contradiction"), false);
  });

  it("blocks a folio and invoice contradiction", () => {
    const result = reconcileNightAuditFinancials(facts({ folios: [folio({ status: "closed", closedAt: "2026-10-21T18:00:00.000Z" })], invoices: [invoice()] }));
    assert.equal(result.issues.some((row) => row.code === "folio_invoice_contradiction" && row.severity === "blocking"), true);
    assert.equal(result.invoiceSettlement[0]?.status, "blocker");
  });

  it("does not keep a second settlement formula", () => {
    assert.match(financial, /classifyIssuedGuestInvoice/);
    assert.doesNotMatch(financial, /function guestInvoiceOutstanding|function classifyIssuedGuestInvoice/);
  });
});

describe("allocations", () => {
  it("passes a fully allocated payment", () => {
    const result = reconcileNightAuditFinancials(facts({ sources: [source()] }));
    assert.equal(result.allocations[0]?.status, "pass");
    assert.equal(result.issues.some((row) => row.severity === "blocking"), false);
  });

  it("passes a fully allocated deposit", () => {
    const result = reconcileNightAuditFinancials(facts({ sources: [source({ kind: "deposit", id: "dep-1" })] }));
    assert.equal(result.allocations[0]?.status, "pass");
  });

  it("blocks an orphan payment allocation", () => {
    const result = reconcileNightAuditFinancials(facts({ allocations: [{ id: "alloc-1", invoiceId: "missing", amount: 10, sourceId: "pay-1", kind: "payment" }] }));
    assert.equal(result.issues.some((row) => row.code === "orphan_allocation" && row.severity === "blocking"), true);
  });

  it("blocks an orphan deposit allocation", () => {
    const result = reconcileNightAuditFinancials(facts({ allocations: [{ id: "alloc-2", invoiceId: "missing", amount: 10, sourceId: "dep-1", kind: "deposit" }] }));
    assert.equal(result.issues.some((row) => row.code === "orphan_allocation"), true);
  });

  it("blocks payment over-allocation", () => {
    const result = reconcileNightAuditFinancials(facts({ sources: [source({ allocated: 150 })] }));
    assert.equal(result.issues.some((row) => row.code === "allocation_exceeds_source" && row.severity === "blocking"), true);
  });

  it("blocks deposit over-allocation", () => {
    const result = reconcileNightAuditFinancials(facts({ sources: [source({ kind: "deposit", allocated: 140 })] }));
    assert.equal(result.issues.some((row) => row.code === "allocation_exceeds_source"), true);
  });

  it("warns on a valid unallocated payment", () => {
    const result = reconcileNightAuditFinancials(facts({ sources: [source({ allocated: 20 })] }));
    assert.equal(result.issues.some((row) => row.code === "unallocated_guest_payment" && row.severity === "warning"), true);
    assert.equal(result.status, "warning");
  });

  it("warns on a valid unallocated deposit", () => {
    const result = reconcileNightAuditFinancials(facts({ sources: [source({ kind: "deposit", allocated: 0 })] }));
    assert.equal(result.issues.some((row) => row.code === "unallocated_guest_deposit" && row.severity === "warning"), true);
  });
});

describe("company and group accounts", () => {
  function account(kind: string, outstandingInvoice = true) {
    return {
      id: `${kind}-1`,
      name: `${kind}-A`,
      kind,
      currency: "ETB",
      invoices: outstandingInvoice
        ? [{ id: "ainv-1", number: "A-1", voided: false, issued: true, invoiceTotal: 500, noteDeltas: [], allocated: 0, withholdingNet: 0, snapshotWithholding: null, currency: "ETB" }]
        : [],
      payments: [],
      allocations: [],
    };
  }

  it("does not block valid company receivables", () => {
    const result = reconcileNightAuditFinancials(facts({ accounts: [account("company")] }));
    assert.equal(result.issues.some((row) => row.code === "valid_account_receivable" && row.severity === "info"), true);
    assert.equal(result.issues.some((row) => row.severity === "blocking"), false);
    assert.equal(result.status, "ready");
  });

  it("does not block valid group receivables", () => {
    const result = reconcileNightAuditFinancials(facts({ accounts: [account("group")] }));
    assert.equal(result.status, "ready");
    assert.equal(result.accounts[0]?.outstandingAr, 500);
  });

  it("blocks an account payment allocated above availability", () => {
    const result = reconcileNightAuditFinancials(facts({
      accounts: [{ ...account("company", false), payments: [{ id: "ap-1", face: 100, refunded: 0, allocated: 140, currency: "ETB" }] }],
    }));
    assert.equal(result.issues.some((row) => row.code === "allocation_exceeds_source" && row.severity === "blocking"), true);
  });

  it("blocks an allocation to a void invoice", () => {
    const result = reconcileNightAuditFinancials(facts({
      accounts: [{
        ...account("company", false),
        invoices: [{ id: "ainv-1", number: "A-1", voided: true, issued: false, invoiceTotal: 100, noteDeltas: [], allocated: 0, withholdingNet: 0, snapshotWithholding: null, currency: "ETB" }],
        allocations: [{ id: "aa-void", invoiceId: "ainv-1", paymentId: "ap-1", amount: 10 }],
      }],
    }));
    assert.equal(result.issues.some((row) => row.code === "allocation_invalid_document" && row.severity === "blocking"), true);
  });

  it("blocks an unbalanced cross-ledger transfer", () => {
    const result = reconcileNightAuditFinancials(facts({
      accounts: [account("company", false)],
      transfers: [{ id: "t-1", transferId: "11111111-1111-4111-8111-111111111111", direction: "out", amount: -40, accountId: "company-1" }],
    }));
    assert.equal(result.issues.some((row) => row.code === "transfer_unbalanced" && row.severity === "blocking"), true);
    assert.equal(result.accounts[0]?.status, "blocker");
  });

  it("accepts a guest folio and company transfer that cancel", () => {
    const transferId = "22222222-2222-4222-8222-222222222222";
    const result = reconcileNightAuditFinancials(facts({
      accounts: [account("company", false)],
      transfers: [
        { id: "in-charge", transferId, direction: "in", amount: 100, accountId: "company-1" },
        { id: "in-tax", transferId, direction: "in", amount: 15, accountId: "company-1" },
        { id: "out-charge", transferId, direction: "out", amount: -100, accountId: null },
        { id: "out-tax", transferId, direction: "out", amount: -15, accountId: null },
      ],
    }));
    assert.equal(result.issues.some((row) => row.code === "transfer_unbalanced"), false);
    assert.notEqual(result.accounts[0]?.status, "blocker");
  });

  it("blocks an allocation to a missing invoice", () => {
    const result = reconcileNightAuditFinancials(facts({
      accounts: [{ ...account("company", false), allocations: [{ id: "aa-1", invoiceId: "gone", paymentId: "ap-1", amount: 10 }] }],
    }));
    assert.equal(result.issues.some((row) => row.code === "allocation_missing_invoice"), true);
  });

  it("warns when account payment remains while an invoice is outstanding", () => {
    const result = reconcileNightAuditFinancials(facts({
      accounts: [{ ...account("company"), payments: [{ id: "ap-1", face: 40, refunded: 0, allocated: 0, currency: "ETB" }] }],
    }));
    assert.equal(result.issues.some((row) => row.code === "unallocated_account_payment" && row.severity === "warning"), true);
    assert.equal(result.status, "warning");
  });

  it("blocks a stored withholding mismatch", () => {
    const withholdingNet = activeWithholdingNet([{ id: "c1", amount: 0, reversesCertificateId: null }]);
    const result = reconcileNightAuditFinancials(facts({
      accounts: [{
        ...account("company", false),
        invoices: [{ id: "ainv-1", number: "A-1", voided: false, issued: true, invoiceTotal: 100, noteDeltas: [], allocated: 0, withholdingNet, snapshotWithholding: 25, currency: "ETB" }],
      }],
    }));
    assert.equal(result.issues.some((row) => row.code === "withholding_mismatch" && row.severity === "blocking"), true);
  });

  it("keeps a valid receivable as information", () => {
    const result = reconcileNightAuditFinancials(facts({ accounts: [account("master")] }));
    assert.equal(result.accounts[0]?.status, "info");
    assert.equal(result.issues.filter((row) => row.severity === "blocking").length, 0);
  });
});

describe("cashier drawers", () => {
  function drawer(patch: Partial<NightAuditFinancialFacts["drawers"][number]> = {}) {
    return {
      id: "shift-1",
      cashier: "Sam",
      shift: "shift-1",
      openedAt: "2026-10-21T06:00:00.000Z",
      expectedCash: 100,
      closingCount: 100,
      variance: 0,
      state: "closed" as const,
      scope: "hotel" as const,
      currency: "ETB",
      ...patch,
    };
  }

  it("blocks one open hotel drawer", () => {
    const result = reconcileNightAuditFinancials(facts({ drawers: [drawer({ state: "open", id: "shift-1" })] }));
    assert.equal(result.summary.openDrawerCount, 1);
    assert.equal(result.issues.some((row) => row.code === "open_cashier_shift"), true);
    assert.equal(result.status, "blocked");
  });

  it("blocks every open hotel drawer", () => {
    const result = reconcileNightAuditFinancials(facts({
      drawers: [drawer({ id: "a", state: "open" }), drawer({ id: "b", state: "open" })],
    }));
    assert.equal(result.summary.openDrawerCount, 2);
    assert.equal(result.issues.filter((row) => row.code === "open_cashier_shift").length, 2);
  });

  it("passes a closed drawer", () => {
    const result = reconcileNightAuditFinancials(facts({ drawers: [drawer()] }));
    assert.equal(result.drawers[0]?.status, "pass");
    assert.equal(result.drawerState, "clear");
  });

  it("warns on a closed drawer variance", () => {
    const result = reconcileNightAuditFinancials(facts({ drawers: [drawer({ variance: 12 })] }));
    assert.equal(result.issues.some((row) => row.code === "closed_shift_variance" && row.severity === "warning"), true);
    assert.equal(result.status, "warning");
  });

  it("ignores a restaurant outlet shift", () => {
    const result = reconcileNightAuditFinancials(facts({ drawers: [drawer({ scope: "restaurant", state: "open" })] }));
    assert.equal(result.drawerState, "na");
    assert.equal(result.issues.some((row) => row.code === "open_cashier_shift"), false);
  });

  it("reports zero hotel drawers as not applicable", () => {
    const result = reconcileNightAuditFinancials(facts());
    assert.equal(result.drawerState, "na");
    assert.equal(result.summary.openDrawerCount, 0);
    assert.equal(financialEmptyCopy("drawers"), "No hotel drawers.");
  });
});

describe("fiscal", () => {
  function document(patch: Partial<NightAuditFinancialFacts["fiscalDocuments"][number]> = {}) {
    return {
      id: "doc-1",
      number: "DOC-1",
      documentType: "INV",
      sourceType: "guest_invoice",
      issuedAt: "2026-10-21T08:00:00.000Z",
      status: "REGISTERED",
      externalReference: "IRN-1",
      mode: "CREDIT",
      ...patch,
    };
  }

  it("ignores NOT_REGISTERED when the handler is disabled", () => {
    const result = reconcileNightAuditFinancials(facts({ integrationEnabled: false, fiscalDocuments: [document({ status: "NOT_REGISTERED" })] }));
    assert.equal(result.fiscalConfigured, false);
    assert.equal(result.fiscal.length, 0);
    assert.equal(result.issues.some((row) => row.category === "fiscal"), false);
  });

  it("passes REGISTERED when the handler is enabled", () => {
    const result = reconcileNightAuditFinancials(facts({ integrationEnabled: true, fiscalDocuments: [document()] }));
    assert.equal(result.fiscal[0]?.status, "pass");
    assert.equal(result.issues.some((row) => row.code === "fiscal_registered"), false);
  });

  it("blocks FAILED", () => {
    const result = reconcileNightAuditFinancials(facts({ integrationEnabled: true, fiscalDocuments: [document({ status: "FAILED" })] }));
    assert.equal(result.issues.some((row) => row.code === "fiscal_failed" && row.severity === "blocking"), true);
  });

  it("blocks CANCEL_PENDING", () => {
    const result = reconcileNightAuditFinancials(facts({ integrationEnabled: true, fiscalDocuments: [document({ status: "CANCEL_PENDING" })] }));
    assert.equal(result.issues.some((row) => row.code === "fiscal_cancel_pending"), true);
  });

  it("blocks NOT_REGISTERED when required", () => {
    const result = reconcileNightAuditFinancials(facts({ integrationEnabled: true, fiscalDocuments: [document({ status: "NOT_REGISTERED" })] }));
    assert.equal(result.issues.some((row) => row.code === "fiscal_not_registered"), true);
  });

  it("blocks BLOCKED", () => {
    const result = reconcileNightAuditFinancials(facts({ integrationEnabled: true, fiscalDocuments: [document({ status: "BLOCKED" })] }));
    assert.equal(result.issues.some((row) => row.code === "fiscal_blocked"), true);
  });

  it("warns on PENDING", () => {
    const result = reconcileNightAuditFinancials(facts({ integrationEnabled: true, fiscalDocuments: [document({ status: "PENDING" })] }));
    assert.equal(result.issues.some((row) => row.code === "fiscal_pending" && row.severity === "warning"), true);
    assert.equal(result.status, "warning");
  });

  it("accepts CANCELLED as a terminal pass", () => {
    const result = reconcileNightAuditFinancials(facts({ integrationEnabled: true, fiscalDocuments: [document({ status: "CANCELLED" })] }));
    assert.equal(result.fiscal[0]?.status, "pass");
    assert.equal(result.summary.fiscalProblemCount, 0);
  });

  it("lists INV, CRE, DEB, sales receipts, and withholding separately", () => {
    const rows = [
      document({ id: "inv", documentType: "INV", sourceType: "guest_invoice" }),
      document({ id: "cre", documentType: "CRE", sourceType: "credit_note" }),
      document({ id: "deb", documentType: "DEB", sourceType: "debit_note" }),
      document({ id: "sr", documentType: "SALES_RECEIPT", sourceType: "guest_allocation" }),
      document({ id: "wh", documentType: "WITHHOLDING", sourceType: "withholding" }),
    ];
    const result = reconcileNightAuditFinancials(facts({ integrationEnabled: true, fiscalDocuments: rows }));
    assert.deepEqual(result.fiscal.map((row) => row.type), ["INV", "CRE", "DEB", "SALES_RECEIPT", "WITHHOLDING"]);
    assert.equal(result.invoiceSettlement.some((row) => row.invoice === "DOC-1"), false);
  });

  it("matches the implemented handler pairs and does not retry fiscal", () => {
    assert.equal(fiscalHandlerEnabled(false, "INV", "guest_invoice"), false);
    assert.equal(fiscalHandlerEnabled(true, "INV", "guest_invoice"), true);
    assert.equal(fiscalHandlerEnabled(true, "SALES_RECEIPT", "guest_allocation"), true);
    assert.equal(NIGHT_AUDIT_FISCAL_HANDLERS.length, 7);
    assert.doesNotMatch(financial, /processFiscalOutbox|retryFiscalRegistration/);
    assert.doesNotMatch(server, /processFiscalOutbox|retryFiscalRegistration/);
    assert.doesNotMatch(panel, /Retry Fiscal|processFiscalOutbox/);
  });
});

describe("tax", () => {
  it("sums frozen tax by currency", () => {
    const result = reconcileNightAuditFinancials(facts({ taxLines: [{ currency: "ETB", category: "tax", amount: 15 }, { currency: "ETB", category: "tax", amount: 5 }] }));
    assert.equal(result.taxSummary[0]?.tax, 20);
  });

  it("sums frozen service charge by currency", () => {
    const result = reconcileNightAuditFinancials(facts({ taxLines: [{ currency: "ETB", category: "service_charge", amount: 10 }] }));
    assert.equal(result.taxSummary[0]?.serviceCharge, 10);
  });

  it("warns when an invoice snapshot disagrees with frozen tax", () => {
    const result = reconcileNightAuditFinancials(facts({
      taxLines: [{ currency: "ETB", category: "tax", amount: 10 }],
      invoices: [invoice({ snapshotTax: 12 })],
      folios: [folio()],
      transactions: [{ folioId: "folio-1", amount: 100, postedAt: "2026-10-21T10:00:00.000Z", referenceType: null, referenceId: null }],
    }));
    assert.equal(result.issues.some((row) => row.code === "tax_snapshot_mismatch" && row.severity === "warning"), true);
  });

  it("does not recalculate tax from current settings", () => {
    assert.doesNotMatch(financial, /pms_taxes|rate plan|recalculate/i);
    assert.doesNotMatch(server, /pms_taxes/);
  });

  it("keeps occupancy fee inside tax", () => {
    const result = reconcileNightAuditFinancials(facts({ taxLines: [{ currency: "ETB", category: "tax", amount: 8 }] }));
    assert.equal(result.taxSummary[0]?.occupancyFee, null);
    assert.equal(result.occupancyFeeSeparated, false);
    assert.equal(result.occupancyFeeNote, OCCUPANCY_FEE_NOTE);
  });

  it("does not combine currencies", () => {
    const result = reconcileNightAuditFinancials(facts({
      taxLines: [
        { currency: "ETB", category: "tax", amount: 10 },
        { currency: "USD", category: "tax", amount: 2 },
      ],
    }));
    assert.deepEqual(result.taxSummary.map((row) => row.currency), ["ETB", "USD"]);
    assert.equal("combined" in result.summary, false);
  });
});

describe("workspace behavior", () => {
  it("has distinct loading, ready, warning, blocked, and unavailable states", () => {
    assert.match(financialEmptyCopy("loading"), /Checking financial/);
    assert.equal(reconcileNightAuditFinancials(facts()).status, "ready");
    assert.equal(financialAllowsClose("warning"), true);
    assert.equal(financialAllowsClose("blocked"), false);
    assert.equal(financialAllowsClose("unavailable"), false);
    assert.match(financialEmptyCopy("failed"), /unavailable/i);
  });

  it("filters severity, category, and search", () => {
    const row = { status: "warning" as const, category: "drawers" as const, text: "Sam open drawer", currency: "ETB" };
    assert.equal(matchesFinancialFilter(row, { severity: "warning" }), true);
    assert.equal(matchesFinancialFilter(row, { severity: "blocker" }), false);
    assert.equal(matchesFinancialFilter(row, { category: "fiscal" }), false);
    assert.equal(matchesFinancialFilter(row, { search: "sam" }), true);
    assert.equal(matchesFinancialFilter(row, { search: "missing" }), false);
  });

  it("exposes a detail route and refresh without a manual resolve", () => {
    const result = reconcileNightAuditFinancials(facts({ drawers: [{ id: "shift-1", cashier: "Sam", shift: "s", openedAt: "2026-10-21T06:00:00.000Z", expectedCash: 1, closingCount: null, variance: null, state: "open", scope: "hotel", currency: "ETB" }] }));
    const issue = result.issues[0];
    assert.equal(issue?.route, "/restaurant/pms/cashiering");
    assert.match(issue?.description ?? "", /open hotel drawer/i);
    assert.match(panel, /night-audit-financial-detail/);
    assert.match(panel, /Refresh \/ Recheck Financials/);
    assert.doesNotMatch(panel, /Mark resolved|mark resolved|updateException/i);
    assert.match(financialEmptyCopy("access"), /don't have access/i);
  });

  it("redacts amounts for a receptionist and keeps the same counts", () => {
    const full = reconcileNightAuditFinancials(facts({
      sources: [source({ allocated: 10 })],
      accounts: [{ id: "c1", name: "Co", kind: "company", currency: "ETB", invoices: [{ id: "i", number: "A", voided: false, issued: true, invoiceTotal: 20, noteDeltas: [], allocated: 0, withholdingNet: 0, snapshotWithholding: null, currency: "ETB" }], payments: [], allocations: [] }],
    }));
    const redacted = presentNightAuditFinancials(full, "receptionist");
    assert.equal(redacted.access, "summary");
    assert.equal(redacted.allocations[0]?.amount, null);
    assert.equal(redacted.accounts[0]?.outstandingAr, null);
    assert.equal(redacted.summary.blockerCount, full.summary.blockerCount);
    assert.equal(redacted.summary.warningCount, full.summary.warningCount);
    assert.equal(presentNightAuditFinancials(full, "cashier").access, "detail");
    assert.match(desk, /summary\.blockerCount|blockerCount/);
    assert.match(panel, /summary\.blockerCount/);
  });
});

describe("close gate and business date", () => {
  it("lets a warning through and holds blockers and unavailable reads", () => {
    assert.equal(financialAllowsClose("ready"), true);
    assert.equal(financialAllowsClose("warning"), true);
    assert.equal(financialAllowsClose("blocked"), false);
    assert.equal(financialAllowsClose("unavailable"), false);
  });

  it("resolves a financial exception when the condition is gone and reopens it when it returns", () => {
    const shiftId = "11111111-1111-4111-8111-111111111111";
    const blocked = reconcileNightAuditFinancials(facts({ drawers: [{ id: shiftId, cashier: "Sam", shift: "s", openedAt: "2026-10-21T06:00:00.000Z", expectedCash: 1, closingCount: null, variance: null, state: "open", scope: "hotel", currency: "ETB" }] }));
    const derived = financialIssuesToExceptions(blocked.issues);
    assert.equal(derived[0]?.referenceId, shiftId);
    const cleared = planExceptionSync(
      [{ id: "ex-1", exceptionType: "open_cashier_shift", severity: "blocking", referenceId: shiftId, message: "open", status: "open" }],
      [],
    );
    assert.deepEqual(cleared.resolveIds, ["ex-1"]);
    const returned = planExceptionSync(
      [{ id: "ex-1", exceptionType: "open_cashier_shift", severity: "blocking", referenceId: shiftId, message: "open", status: "resolved" }],
      derived,
    );
    assert.equal(returned.updates[0]?.reopen, true);
  });

  it("re-evaluates the same financial read before the close RPC", () => {
    const closeAt = functions.indexOf("export const closeBusinessDate");
    const closeBody = functions.slice(closeAt);
    const readAt = closeBody.indexOf("readFinancialReconciliation");
    const gateAt = closeBody.indexOf("financialAllowsClose");
    const rpcAt = closeBody.indexOf('rpc("close_business_date"');
    assert.ok(readAt > 0 && gateAt > readAt && rpcAt > gateAt);
    assert.match(closeBody, /FINANCIAL_UNAVAILABLE_MESSAGE/);
  });

  it("uses the property business date and day bounds", () => {
    assert.match(server, /propertyDayBounds\(businessDate, timezone\)/);
    assert.match(server, /belongsToBusinessDate/);
    assert.match(server, /bounds\.startIso/);
    assert.doesNotMatch(server, /dayBoundary|automaticRollover/);
    assert.doesNotMatch(server, /businessDate\s*=\s*new Date/);
    assert.doesNotMatch(financial, /dayBoundary|Date\.now|new Date\(/);
    const result = reconcileNightAuditFinancials(facts({ businessDate: DATE }));
    assert.equal(result.businessDate, DATE);
    assert.equal(result.timezone, TZ);
  });

  it("scopes reads to the property and does not write finance", () => {
    assert.match(server, /\.eq\("restaurant_id", restaurantId\)/);
    assert.doesNotMatch(server, /\.insert\(|\.update\(|\.rpc\("close_business_date"/);
    assert.match(workspace, /getNightAuditFinancials/);
    assert.doesNotMatch(panel, /postCharge|allocatePayment|close_guest_folio/);
  });
});
