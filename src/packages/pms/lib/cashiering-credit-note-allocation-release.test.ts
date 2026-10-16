import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const sql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0160_credit_note_release_allocation.sql",
    import.meta.url,
  ),
  "utf8",
);
const drizzle = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0160_credit_note_release_allocation.sql",
    import.meta.url,
  ),
  "utf8",
);
const debit = readFileSync(
  new URL("../../../../supabase/migrations/0147_cashiering_debit_notes.sql", import.meta.url),
  "utf8",
);

describe("credit note allocation release", () => {
  it("releases only the excess allocation and leaves the payment ledger untouched", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /release_excess_guest_invoice_allocation/);
    assert.match(sql, /release_excess_account_invoice_allocation/);
    assert.match(sql, /-take, alloc\.id/);
    assert.doesNotMatch(
      sql.slice(0, sql.indexOf("CREATE OR REPLACE FUNCTION public.issue_invoice_credit_note_draft")),
      /INSERT INTO public\.folio_transactions/,
    );
    const issue = sql.slice(sql.indexOf("FUNCTION public.issue_invoice_credit_note_draft"));
    assert.match(issue, /PERFORM public\.release_excess_guest_invoice_allocation/);
    assert.match(issue, /PERFORM public\.release_excess_account_invoice_allocation/);
    assert.doesNotMatch(issue, /RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INVOICE_NET/);
  });

  it("does not make debit notes release or block payment allocations", () => {
    const issue = debit.slice(debit.indexOf("FUNCTION public.issue_invoice_debit_note_draft"));
    assert.doesNotMatch(issue, /ALLOCATION_EXCEEDS_INVOICE_NET/);
    assert.doesNotMatch(issue, /release_excess_/);
    assert.match(issue, /debit_note_issued/);
  });
});
