import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  mapAccountBillTo,
  mapAccountInvoiceSnapshot,
  ownedAccountGroup,
} from "./cashiering-account-invoices.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const sql = read("../../../../supabase/migrations/0145_cashiering_account_invoices.sql");
const drizzle = read("../../../../drizzle/migrations/0145_cashiering_account_invoices.sql");

describe("company and group account invoices", () => {
  it("keeps the account invoice migration dual-lane and off the guest tables", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /financial_account_invoice_drafts_one_per_account/);
    assert.match(sql, /financial_account_invoice_lines_component_unique/);
    assert.match(sql, /INVOICE_IMMUTABLE/);
    assert.match(sql, /reprint_count/);
    assert.doesNotMatch(sql, /UPDATE public\.guest_folio_invoices/);
    assert.doesNotMatch(sql, /INSERT INTO public\.folio_transactions/);
  });

  it("creates a draft without an invoice number and issues from the shared counter", () => {
    const createAt = sql.indexOf("FUNCTION public.create_financial_account_invoice_draft");
    const issueAt = sql.indexOf("FUNCTION public.issue_financial_account_invoice_draft");
    const createBody = sql.slice(createAt, issueAt);
    assert.doesNotMatch(createBody, /pms_issued_invoice_counters/);
    const issueBody = sql.slice(
      issueAt,
      sql.indexOf("FUNCTION public.reprint_financial_account_invoice"),
    );
    assert.match(issueBody, /pms_issued_invoice_counters/);
    assert.match(issueBody, /FOR UPDATE/);
    assert.match(issueBody, /guest_folio_invoices/);
    assert.match(issueBody, /ACCOUNT_INVOICE_DRAFT_EMPTY/);
    const guestSql = read(
      "../../../../supabase/migrations/0144_cashiering_guest_invoice_drafts.sql",
    );
    const guestIssue = guestSql.slice(
      guestSql.indexOf("FUNCTION public.issue_guest_folio_invoice_draft"),
      guestSql.indexOf("FUNCTION public.build_folio_charge_correction"),
    );
    assert.match(guestIssue, /financial_account_invoices/);
    assert.match(guestIssue, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(issueBody, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(issueBody, /'target', 'financial_account'/);
    assert.doesNotMatch(issueBody, /financial_account_balance/);
    assert.doesNotMatch(issueBody, /INSERT INTO public\.folio_transactions/);
  });

  it("groups transferred parent, tax, and service rows and rejects non-invoiceable types", () => {
    assert.match(sql, /transaction_type = 'transfer_in'/);
    assert.match(sql, /account_invoice_row_owned/);
    assert.match(sql, /orig_row.category IN \('tax', 'service_charge'\)/);
    assert.match(sql, /ACCOUNT_CHARGE_ALREADY_INVOICED/);
    assert.match(sql, /ACCOUNT_CHARGE_NO_LONGER_OWNED/);
    assert.match(sql, /ACCOUNT_KIND_NOT_INVOICEABLE/);
    assert.doesNotMatch(sql, /transaction_type IN \('payment', 'deposit', 'refund'\)/);
  });

  it("blocks transfer and correction of a covered account charge", () => {
    assert.match(sql, /PERFORM public.assert_account_charge_not_invoiced/);
    assert.match(sql, /'TRANSFER_INVOICED'/);
    assert.match(sql, /'CORRECTION_INVOICED'/);
  });

  it("freezes company identity and does not invent group tax fields", () => {
    assert.match(sql, /'taxId', master.tax_id/);
    assert.match(sql, /jsonb_strip_nulls\(jsonb_build_object/);
    const groupBill = mapAccountBillTo(
      { name: "Conference 2026", code: "GRP", taxId: "SHOULD-NOT-SHOW", paymentTerms: "30 days" },
      "group",
    );
    assert.equal(groupBill.taxId, null);
    assert.equal(groupBill.paymentTerms, null);
    assert.equal(groupBill.creditDays, null);
    const company = mapAccountBillTo(
      { name: "ABC Trading", taxId: "TIN-1", address: "Addis", creditDays: 30 },
      "company",
    );
    assert.equal(company.taxId, "TIN-1");
    assert.equal(company.address, "Addis");
    assert.equal(company.creditDays, 30);
  });

  it("invoices only the account-owned share of a partial transfer", () => {
    const owned = ownedAccountGroup([
      { kind: "parent", amount: 250, movedOut: 0, covered: false },
      { kind: "tax", amount: 37.5, movedOut: 0, covered: false },
      { kind: "service_charge", amount: 12.5, movedOut: 0, covered: false },
    ]);
    assert.deepEqual(owned, { subtotal: 250, tax: 37.5, serviceCharge: 12.5, total: 300 });
    const full = ownedAccountGroup([
      { kind: "parent", amount: 450, movedOut: 0, covered: false },
      { kind: "tax", amount: 67.5, movedOut: 0, covered: false },
      { kind: "service_charge", amount: 22.5, movedOut: 0, covered: false },
    ]);
    assert.equal(full.total, 540);
    const covered = ownedAccountGroup([
      { kind: "parent", amount: 450, movedOut: 0, covered: true },
      { kind: "tax", amount: 67.5, movedOut: 0, covered: false },
    ]);
    assert.equal(covered.subtotal, 0);
    assert.equal(covered.tax, 67.5);
  });

  it("keeps an issued snapshot frozen when the live company name changes", () => {
    const frozen = mapAccountInvoiceSnapshot({
      version: 1,
      target: "financial_account",
      issuedAt: "2026-10-10T00:00:00Z",
      document: { issuedNumber: "INV-000101", notes: "Conference", issuedByName: "Sara" },
      property: { legalEntityName: "NORU Hotel", currencyCode: "ETB" },
      account: { id: "a", accountNumber: "FA-000012", accountKind: "company", currency: "ETB" },
      billTo: { name: "ABC Trading PLC", taxId: "TIN-9" },
      lines: [
        {
          id: "1",
          kind: "parent",
          description: "Laundry",
          amount: 450,
          sourceGuest: "James",
          sourceFolioNumber: "FL-1",
        },
      ],
      totals: { subtotal: 450, tax: 67.5, serviceCharge: 22.5, invoiceTotal: 540 },
    });
    const liveName = "ABC Trading PLC Renamed";
    assert.equal(frozen.billTo.name, "ABC Trading PLC");
    assert.notEqual(frozen.billTo.name, liveName);
    assert.equal(frozen.totals.invoiceTotal, 540);
    assert.equal(frozen.document.notes, "Conference");
    assert.equal(frozen.lines[0]?.sourceGuest, "James");
  });

  it("reprints without rewriting the snapshot", () => {
    const reprintAt = sql.indexOf("FUNCTION public.reprint_financial_account_invoice");
    const reprintBody = sql.slice(reprintAt, sql.indexOf("DO $account_invoice_guards$"));
    assert.match(reprintBody, /reprint_count = reprint_count \+ 1/);
    assert.match(reprintBody, /last_reprinted_at = now\(\)/);
    assert.doesNotMatch(reprintBody, /snapshot =/);
    assert.match(sql, /NEW.snapshot IS DISTINCT FROM OLD.snapshot/);
  });
});
