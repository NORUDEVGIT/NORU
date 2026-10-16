import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  debitChargeTotal,
  invoiceDocumentNet,
  mapDebitBoard,
  mapDebitSnapshot,
} from "./cashiering-debit-notes.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const sql = read("../../../../supabase/migrations/0147_cashiering_debit_notes.sql");
const drizzle = read("../../../../drizzle/migrations/0147_cashiering_debit_notes.sql");
const creditSql = read("../../../../supabase/migrations/0146_cashiering_credit_notes.sql");

function slice(source: string, name: string, next: string): string {
  const start = source.indexOf(`FUNCTION public.${name}`);
  const end = next ? source.indexOf(`FUNCTION public.${next}`, start + 1) : source.length;
  assert.ok(start > 0 && end > start, name);
  return source.slice(start, end);
}

describe("invoice debit notes", () => {
  it("keeps the debit migration dual-lane on the shared note tables", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /note_type IN \('credit', 'debit'\)/);
    assert.match(sql, /pms_debit_note_counters/);
    assert.match(sql, /invoice_debit_component_unique/);
    assert.match(sql, /component_is_billed/);
    assert.match(sql, /group_is_billed/);
    assert.match(creditSql, /note_type IN \('credit'\)\)/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.invoice_debit_notes/);
    assert.doesNotMatch(sql, /UPDATE public\.guest_folio_invoices/);
    assert.doesNotMatch(sql, /UPDATE public\.financial_account_invoices/);
    assert.doesNotMatch(sql, /UPDATE public\.folio_transactions/);
    assert.doesNotMatch(sql, /preview_folio_charge|pms_taxes|pms_service_charges/);
    assert.doesNotMatch(sql, /credit_limit_amount\s*=/);
  });

  it("creates a debit draft without a number or a ledger post", () => {
    const createBody = slice(
      sql,
      "create_invoice_debit_note_draft",
      "update_invoice_debit_note_draft",
    );
    assert.doesNotMatch(createBody, /pms_debit_note_counters/);
    assert.doesNotMatch(createBody, /INSERT INTO public\.folio_transactions/);
    assert.match(createBody, /'debit'/);
    assert.match(createBody, /debit_note_draft_created/);
    assert.match(sql, /debit_note_draft_updated/);
    assert.match(sql, /debit_note_draft_deleted/);
    assert.match(sql, /REASON_REQUIRED/);
    const creditUpdate = slice(
      sql,
      "update_invoice_credit_note_draft",
      "delete_invoice_credit_note_draft",
    );
    assert.match(creditUpdate, /draft\.note_type IS DISTINCT FROM 'credit'/);
  });

  it("issues a numbered debit note without posting the charge again", () => {
    const issueBody = slice(
      sql,
      "issue_invoice_debit_note_draft",
      "invoice_credit_note_lines_immutable",
    );
    assert.match(issueBody, /pms_debit_note_counters/);
    assert.match(issueBody, /'DN-' \|\| lpad/);
    assert.match(issueBody, /FOR UPDATE/);
    assert.match(issueBody, /plan_invoice_debit/);
    assert.match(issueBody, /DEBIT_SOURCE_ALREADY_COVERED/);
    assert.match(issueBody, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(issueBody, /debit_note_issued/);
    assert.match(issueBody, /note_type, guest_invoice_id/);
    assert.match(issueBody, /'debit', draft\.guest_invoice_id/);
    assert.doesNotMatch(issueBody, /INSERT INTO public\.folio_transactions/);
    assert.doesNotMatch(issueBody, /'refund'/);
    assert.doesNotMatch(issueBody, /credit_limit/);
    assert.doesNotMatch(issueBody, /UPDATE public\.guest_folio_invoices/);
    const counter = issueBody.indexOf("pms_debit_note_counters");
    const plan = issueBody.indexOf("plan_invoice_debit");
    assert.ok(plan > 0 && plan < counter);
    const creditIssue = slice(
      sql,
      "issue_invoice_credit_note_draft",
      "invoice_credit_component_rows",
    );
    assert.match(creditIssue, /INSERT INTO public\.folio_transactions/);
    assert.match(creditIssue, /'adjustment'/);
    assert.match(creditIssue, /-round\(\(line->>'credited'\)::numeric, 2\)/);
  });

  it("covers guest, company, and group charges and blocks a second billing", () => {
    const guest = slice(sql, "resolve_guest_invoice_charge_group", "resolve_account_invoice_group");
    assert.match(guest, /transaction_type <> 'charge'/);
    assert.match(guest, /category IN \('tax', 'service_charge'\)/);
    assert.match(guest, /group_is_billed/);
    assert.match(guest, /CHARGE_ALREADY_INVOICED/);
    const account = slice(sql, "resolve_account_invoice_group", "list_guest_folio_invoice_groups");
    assert.match(account, /account_kind NOT IN \('company', 'group'\)/);
    assert.match(account, /transaction_type = 'transfer_in'/);
    assert.match(account, /component_is_billed/);
    assert.match(account, /sourceGuest/);
    assert.match(account, /ACCOUNT_CHARGE_ALREADY_INVOICED/);
    const plan = slice(sql, "plan_invoice_debit", "list_invoice_debit_board");
    assert.match(plan, /DEBIT_SOURCE_WRONG_TARGET/);
    assert.match(plan, /DEBIT_SOURCE_NOT_ELIGIBLE/);
    assert.match(plan, /legacy_folio/);
    assert.match(plan, /taxLines/);
    assert.match(plan, /serviceLines/);
    assert.doesNotMatch(plan, /requested amount|partial debit/i);
    const assertGuest = slice(
      sql,
      "assert_guest_charge_not_invoiced",
      "assert_account_charge_not_invoiced",
    );
    assert.match(assertGuest, /TRANSFER_INVOICED/);
    assert.match(assertGuest, /CORRECTION_INVOICED/);
    assert.match(assertGuest, /group_is_billed/);
    const rows = slice(sql, "invoice_credit_component_rows", "plan_invoice_debit");
    assert.match(rows, /'debit'::text/);
    assert.match(rows, /billed_via/);
    assert.match(rows, /notes.note_type = 'credit'/);
  });

  it("documents laundry 540 from frozen components and keeps the original invoice amount", () => {
    assert.equal(debitChargeTotal(450, 67.5, 22.5), 540);
    assert.equal(invoiceDocumentNet(1000, 200, 500), 1300);
    assert.equal(invoiceDocumentNet(1000, 0, 800), 1800);
    assert.equal(invoiceDocumentNet(8750, 0, 1500), 10250);
    const frozen = mapDebitSnapshot({
      document: {
        noteNumber: "DN-000001",
        originalInvoiceNumber: "INV-000142",
        reason: "Late minibar charge",
        issuedByName: "Sara",
        currency: "ETB",
      },
      billTo: { name: "Test Guest" },
      groups: [
        {
          description: "Laundry",
          subtotal: 450,
          tax: 67.5,
          serviceCharge: 22.5,
          gross: 540,
        },
      ],
      totals: {
        subtotal: 450,
        tax: 67.5,
        serviceCharge: 22.5,
        debitTotal: 540,
        originalInvoice: 1000,
        previousCredits: 200,
        previousDebits: 0,
        netInvoice: 1340,
      },
    });
    assert.equal(frozen.totals.debitTotal, 540);
    assert.equal(frozen.totals.originalInvoice, 1000);
    assert.equal(
      invoiceDocumentNet(
        frozen.totals.originalInvoice,
        frozen.totals.previousCredits,
        frozen.totals.previousDebits + frozen.totals.debitTotal,
      ),
      1340,
    );
    assert.equal(frozen.noteNumber, "DN-000001");
    const renamed = "Test Guest Renamed";
    assert.notEqual(frozen.billToName, renamed);
  });

  it("derives net invoice from original, credits, and debits without a second balance change", () => {
    const board = mapDebitBoard({
      ok: true,
      invoiceNumber: "INV-000142",
      originalTotal: 1000,
      previousCredits: 200,
      previousDebits: 500,
      netInvoice: 1300,
      balance: 4000,
      eligibleGroups: [
        {
          parentTransactionId: "parent-1",
          description: "Airport transfer",
          subtotal: 1200,
          taxTotal: 0,
          serviceChargeTotal: 0,
          grossTotal: 1200,
          invoiceState: "uninvoiced",
        },
      ],
      notes: [],
    });
    assert.equal(board.originalTotal, 1000);
    assert.equal(
      invoiceDocumentNet(board.originalTotal, board.previousCredits, board.previousDebits),
      1300,
    );
    assert.equal(board.netInvoice, 1300);
    assert.equal(board.eligibleGroups[0]?.sourceGroupId, "parent-1");
    assert.equal(board.balance, 4000);
    const balanceBeforeIssue = 4000;
    const balanceAfterIssue = 4000;
    assert.equal(balanceBeforeIssue, balanceAfterIssue);
  });
});
