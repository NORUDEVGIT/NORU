import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0136_cashiering_phase11_invoices.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0136_cashiering_phase11_invoices.sql", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../components/cashiering/guest-folio-page.tsx", import.meta.url),
  "utf8",
);
const builder = readFileSync(
  new URL("../components/cashiering/guest-invoice-builder.tsx", import.meta.url),
  "utf8",
);
const invoiceFns = readFileSync(
  new URL("./cashiering-invoices.functions.ts", import.meta.url),
  "utf8",
);
const invoicePanel = readFileSync(
  new URL("../components/cashiering/folio-invoice-panel.tsx", import.meta.url),
  "utf8",
);

describe("Cashiering Phase 11 issued invoices", () => {
  it("creates counter, snapshot table, and issue/reprint writers", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /pms_issued_invoice_counters/);
    assert.match(sql, /guest_folio_invoices/);
    assert.match(sql, /issue_guest_folio_invoice/);
    assert.match(sql, /reprint_guest_folio_invoice/);
    assert.match(sql, /build_guest_folio_invoice_snapshot/);
    assert.match(sql, /INVOICE_ALREADY_ISSUED/);
    assert.match(sql, /invoice_issued/);
    assert.match(sql, /invoice_reprinted/);
    assert.match(sql, /starting_number - 1/);
    assert.doesNotMatch(sql, /guest_folios\.balance/);
  });

  it("ships issue and reprint actions separate from print statement", () => {
    assert.match(page, /Create Invoice/);
    assert.match(builder, /Issue invoice/);
    assert.match(page, /Reprint/);
    assert.match(page, /Print Statement/);
    assert.match(page, /not an issued invoice/);
    assert.match(page, /GuestInvoiceWorkspace/);
    assert.match(invoiceFns, /issueGuestFolioInvoiceDraft/);
    assert.match(invoiceFns, /reprint_guest_folio_invoice/);
    assert.match(invoicePanel, /issued-invoice-print/);
    assert.match(invoicePanel, /Immutable snapshot/);
    assert.match(invoicePanel, /invoiceTotal/);
  });
});
