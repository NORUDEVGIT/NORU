import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { allocateTransferShares } from "./cashiering-transfer-allocate.ts";
import {
  creditRemainder,
  invoiceCreditState,
  mapCreditSnapshot,
  projectedLedgerBalance,
} from "./cashiering-credit-notes.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const sql = read("../../../../supabase/migrations/0146_cashiering_credit_notes.sql");
const drizzle = read("../../../../drizzle/migrations/0146_cashiering_credit_notes.sql");

function slice(name: string, next: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  const end = sql.indexOf(`FUNCTION public.${next}`);
  assert.ok(start > 0 && end > start);
  return sql.slice(start, end);
}

describe("invoice credit notes", () => {
  it("keeps the credit note migration dual-lane and off the issued invoice rows", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /invoice_credit_notes_type_check CHECK \(note_type IN \('credit'\)\)/);
    assert.match(sql, /INVOICE_IMMUTABLE/);
    assert.match(sql, /CREDIT_EXCEEDS_REMAINDER/);
    assert.doesNotMatch(sql, /UPDATE public\.guest_folio_invoices/);
    assert.doesNotMatch(sql, /UPDATE public\.financial_account_invoices/);
    assert.doesNotMatch(sql, /UPDATE public\.folio_transactions/);
    assert.doesNotMatch(sql, /preview_folio_charge|pms_taxes|pms_service_charges/);
    assert.doesNotMatch(sql, /note_type = 'debit'/);
  });

  it("creates a draft without a number or a ledger post", () => {
    const createBody = slice(
      "create_invoice_credit_note_draft",
      "update_invoice_credit_note_draft",
    );
    assert.doesNotMatch(createBody, /pms_credit_note_counters/);
    assert.doesNotMatch(createBody, /INSERT INTO public\.folio_transactions/);
    assert.match(createBody, /credit_note_draft_created/);
    assert.match(sql, /credit_note_draft_updated/);
    assert.match(sql, /credit_note_draft_deleted/);
    assert.match(sql, /REASON_REQUIRED/);
  });

  it("issues one numbered note and one adjustment on the owning ledger", () => {
    const issueBody = slice("issue_invoice_credit_note_draft", "reprint_invoice_credit_note");
    assert.match(issueBody, /pms_credit_note_counters/);
    assert.match(issueBody, /FOR UPDATE/);
    assert.match(issueBody, /plan_invoice_credit/);
    assert.match(sql, /allocate_transfer_shares/);
    assert.match(issueBody, /'adjustment'/);
    assert.match(issueBody, /invoice_credit_note/);
    assert.match(issueBody, /-round\(\(line->>'credited'\)::numeric, 2\)/);
    assert.match(issueBody, /original_transaction_id/);
    assert.match(issueBody, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(issueBody, /credit_note_issued/);
    assert.match(issueBody, /guest_invoice_id/);
    assert.match(issueBody, /financial_account_id/);
    assert.match(sql, /sourceGuest/);
    assert.doesNotMatch(issueBody, /'refund'/);
    assert.doesNotMatch(issueBody, /credit_limit/);
    const counter = issueBody.indexOf("pms_credit_note_counters");
    const plan = issueBody.indexOf("plan_invoice_credit");
    assert.ok(plan > 0 && plan < counter);
  });

  it("allocates a 100 credit across frozen laundry components and caps the remainder", () => {
    const components = [
      { id: "parent", remaining: 450 },
      { id: "tax", remaining: 67.5 },
      { id: "service", remaining: 22.5 },
    ];
    const first = allocateTransferShares(components, 100);
    assert.deepEqual(
      first.map((share) => share.share),
      [83.33, 12.5, 4.17],
    );
    assert.equal(
      first.reduce((sum, share) => sum + share.share, 0),
      100,
    );
    const afterFirst = components.map((component, index) => ({
      id: component.id,
      remaining: creditRemainder(component.remaining, first[index].share),
    }));
    assert.equal(
      afterFirst.reduce((sum, component) => sum + component.remaining, 0),
      440,
    );
    const second = allocateTransferShares(afterFirst, 200);
    assert.equal(
      second.reduce((sum, share) => sum + share.share, 0),
      200,
    );
    const afterSecond = afterFirst.map((component, index) => ({
      id: component.id,
      remaining: creditRemainder(component.remaining, second[index].share),
    }));
    const left = afterSecond.reduce((sum, component) => sum + component.remaining, 0);
    assert.equal(left, 240);
    assert.throws(() => allocateTransferShares(afterSecond, 250), /TRANSFER_EXCEEDS_REMAINDER/);
    const full = allocateTransferShares(afterSecond, 240);
    assert.equal(
      full.reduce((sum, share) => sum + share.share, 0),
      240,
    );
    assert.equal(invoiceCreditState(540, 100), "Partially Credited");
    assert.equal(invoiceCreditState(540, 540), "Fully Credited");
    assert.equal(invoiceCreditState(540, 0), "None");
  });

  it("keeps the issued snapshot frozen and does not invent a group credit limit", () => {
    const frozen = mapCreditSnapshot({
      document: {
        noteNumber: "CN-000001",
        originalInvoiceNumber: "INV-000142",
        reason: "Duplicate service billed",
        issuedByName: "Sara",
        currency: "ETB",
      },
      billTo: { name: "ABC Trading PLC" },
      groups: [
        {
          description: "Laundry",
          sourceGuest: "James Miller",
          sourceFolioNumber: "FOL-00012",
          subtotal: 83.33,
          tax: 12.5,
          serviceCharge: 4.17,
          creditGross: 100,
          components: [{ kind: "tax", description: "VAT", credited: 12.5 }],
        },
      ],
      totals: {
        subtotal: 83.33,
        tax: 12.5,
        serviceCharge: 4.17,
        totalCredit: 100,
        originalInvoice: 540,
        previousCredits: 0,
        netInvoice: 440,
      },
    });
    const renamed = "ABC Trading PLC Renamed";
    assert.equal(frozen.billToName, "ABC Trading PLC");
    assert.notEqual(frozen.billToName, renamed);
    assert.equal(frozen.groups[0]?.sourceGuest, "James Miller");
    assert.equal(frozen.totals.netInvoice, 440);
    assert.equal(frozen.groups[0]?.components[0]?.description, "VAT");
    assert.doesNotMatch(sql, /credit_limit/);
  });

  it("allows a credit after payment without posting a refund", () => {
    assert.equal(projectedLedgerBalance(200, 400), -200);
    assert.equal(projectedLedgerBalance(1000, 400), 600);
    const issueBody = slice("issue_invoice_credit_note_draft", "reprint_invoice_credit_note");
    assert.doesNotMatch(issueBody, /transaction_type', 'refund'/);
    const reprintBody = sql.slice(sql.indexOf("FUNCTION public.reprint_invoice_credit_note"));
    assert.match(reprintBody, /reprint_count = reprint_count \+ 1/);
    assert.doesNotMatch(reprintBody, /snapshot =/);
  });
});
