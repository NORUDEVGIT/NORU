import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  correctableGroupRemainder,
  type TransferLedgerRow,
} from "./cashiering-transfer-allocate.ts";
import { mapFolioInvoiceSnapshot } from "./cashiering-invoices.server.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const sql = read("../../../../supabase/migrations/0144_cashiering_guest_invoice_drafts.sql");
const drizzle = read("../../../../drizzle/migrations/0144_cashiering_guest_invoice_drafts.sql");

function group(parent: number, tax: number, service: number): TransferLedgerRow[] {
  return [
    { id: "parent", type: "charge", category: "manual", amount: parent },
    { id: "tax", type: "charge", category: "tax", amount: tax, originalTransactionId: "parent" },
    {
      id: "service",
      type: "charge",
      category: "service_charge",
      amount: service,
      originalTransactionId: "parent",
    },
  ];
}

describe("guest invoice drafts", () => {
  it("keeps the migration dual-lane and leaves legacy snapshots in place", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /coverage_scope = 'legacy_folio'/);
    assert.match(sql, /guest_folio_invoices_legacy_folio_unique/);
    assert.match(sql, /DROP CONSTRAINT IF EXISTS guest_folio_invoices_folio_unique/);
    assert.doesNotMatch(sql, /UPDATE public\.guest_folio_invoices\s+SET snapshot/);
    assert.match(sql, /INVOICE_IMMUTABLE/);
    assert.match(sql, /reprint_count/);
  });

  it("stores a draft without an invoice number and issues selected parents only", () => {
    const createAt = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.create_guest_folio_invoice_draft",
    );
    const issueAt = sql.indexOf(
      "CREATE OR REPLACE FUNCTION public.issue_guest_folio_invoice_draft",
    );
    const createBody = sql.slice(createAt, issueAt);
    assert.doesNotMatch(createBody, /pms_issued_invoice_counters/);
    assert.match(sql, /guest_folio_invoice_draft_items_unique/);
    assert.match(sql, /CHARGE_NOT_INVOICEABLE/);
    assert.match(sql, /CHARGE_ALREADY_INVOICED/);
    assert.match(sql, /CHARGE_TRANSFERRED/);
    assert.match(sql, /CHARGE_GROUP_INCOMPLETE/);
    assert.match(sql, /INVOICE_DRAFT_EMPTY/);
    assert.match(sql, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(sql, /starting_number - 1/);
    assert.match(sql, /correctable_charge_remainder/);
    assert.match(sql, /'version', 2/);
    assert.match(sql, /component_kind IN \('parent', 'tax', 'service_charge'\)/);
    assert.doesNotMatch(sql, /paymentMethod', t.payment_method/);
  });

  it("blocks correction and transfer only for covered groups and legacy folios", () => {
    assert.match(sql, /PERFORM public.assert_guest_charge_not_invoiced/);
    assert.match(sql, /CORRECTION_INVOICED/);
    assert.match(sql, /TRANSFER_INVOICED/);
    assert.match(sql, /coverage_scope = 'legacy_folio'/);
    const correction = sql.indexOf("FUNCTION public.build_folio_charge_correction");
    const correctionBody = sql.slice(
      correction,
      sql.indexOf("FUNCTION public.post_cross_ledger_transfer"),
    );
    assert.match(correctionBody, /assert_guest_charge_not_invoiced/);
    assert.doesNotMatch(
      correctionBody,
      /SELECT 1 FROM public\.guest_folio_invoices\s+WHERE restaurant_id = _restaurant_id AND folio_id = folio\.id/,
    );
  });

  it("totals a room charge and a laundry charge from frozen remainders", () => {
    const room = correctableGroupRemainder("parent", group(2500, 375, 0));
    assert.equal(room.grossRemaining, 2875);
    const laundry = correctableGroupRemainder(
      "parent",
      group(450, 67.5, 22.5).map((row) => ({
        ...row,
        id: row.id === "parent" ? "parent" : row.id,
      })),
    );
    assert.equal(laundry.parentRemaining, 450);
    assert.equal(laundry.taxRemaining, 67.5);
    assert.equal(laundry.serviceRemaining, 22.5);
    assert.equal(laundry.grossRemaining, 540);
    const both = {
      subtotal: room.parentRemaining + laundry.parentRemaining,
      tax: room.taxRemaining + laundry.taxRemaining,
      service: room.serviceRemaining + laundry.serviceRemaining,
    };
    assert.equal(both.subtotal, 2950);
    assert.equal(both.tax, 442.5);
    assert.equal(both.service, 22.5);
    assert.equal(Math.round((both.subtotal + both.tax + both.service) * 100) / 100, 3415);
  });

  it("uses the corrected remainder when a draft is refreshed before issue", () => {
    const rows: TransferLedgerRow[] = [
      { id: "parent", type: "charge", category: "manual", amount: 450 },
      { id: "tax", type: "charge", category: "tax", amount: 67.5, originalTransactionId: "parent" },
      {
        id: "service",
        type: "charge",
        category: "service_charge",
        amount: 22.5,
        originalTransactionId: "parent",
      },
      {
        id: "adj-parent",
        type: "adjustment",
        category: "adjustment",
        amount: -150,
        originalTransactionId: "parent",
      },
      {
        id: "adj-tax",
        type: "adjustment",
        category: "adjustment",
        amount: -22.5,
        originalTransactionId: "tax",
      },
      {
        id: "adj-service",
        type: "adjustment",
        category: "adjustment",
        amount: -7.5,
        originalTransactionId: "service",
      },
    ];
    const current = correctableGroupRemainder("parent", rows);
    assert.equal(current.grossRemaining, 360);
    assert.match(sql, /parent_remaining := public.correctable_charge_remainder/);
  });

  it("still loads a legacy version 1 snapshot", () => {
    const snapshot = mapFolioInvoiceSnapshot({
      version: 1,
      issuedAt: "2026-01-01T00:00:00Z",
      issuerMembershipId: "member",
      document: {
        issuedNumber: "INV-000001",
        sequenceNumber: 1,
        prefix: "INV-",
        numberPadding: 6,
        taxDisplay: "exclusive",
        invoiceFormat: "standard",
      },
      property: { currencyCode: "ETB", legalEntityName: "Noru", vatRegistered: false },
      folio: { id: "folio", folioNumber: "F-1", status: "open", currency: "ETB", guestName: "Ada" },
      lines: [
        {
          id: "line",
          transactionType: "payment",
          category: "payment",
          description: "Cash",
          amount: -20,
          postedAt: "2026-01-01T00:00:00Z",
        },
      ],
      totals: { charges: 100, credits: 20, balance: 80, tax: 15 },
    });
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.document.issuedNumber, "INV-000001");
    assert.equal(snapshot.totals.balance, 80);
    assert.equal(snapshot.totals.invoiceTotal, null);
    assert.equal(snapshot.document.notes, null);
    assert.equal(snapshot.lines[0].transactionType, "payment");
  });
});
