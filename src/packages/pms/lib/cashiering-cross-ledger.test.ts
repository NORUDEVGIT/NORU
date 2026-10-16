import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { BILLING_ROUTING_EXECUTABLE } from "./cashiering-transfer-model.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("cross-ledger transfer", () => {
  const sql = read("../../../../supabase/migrations/0141_cashiering_cross_ledger_transfer.sql");
  const drizzle = read("../../../../drizzle/migrations/0141_cashiering_cross_ledger_transfer.sql");
  const accountPoster = read(
    "../../../../supabase/migrations/0128_cashiering_phase8_financial_accounts.sql",
  );
  const functions = read("./cashiering-phases.functions.ts");
  const dialog = read("../components/cashiering/transfer-charge-dialog.tsx");
  const accountDialog = read("../components/cashiering/account-return-transfer-dialog.tsx");

  it("keeps the cross-ledger SQL dual-lane and append-only", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.post_cross_ledger_transfer/);
    assert.match(sql, /allocate_transfer_shares/);
    assert.match(sql, /transferable_charge_remainder/);
    assert.match(sql, /cross_ledger_transfer_out/);
    assert.match(sql, /cross_ledger_transfer_in/);
    assert.match(sql, /deposit_allocated/);
    assert.match(sql, /settlement_write_off/);
    assert.match(sql, /financial_account_closed/);
    assert.match(sql, /invoice_issued/);
    assert.match(sql, /'folio_transfer'/);
    assert.match(sql, /original_transaction_id/);
    assert.match(sql, /CASE WHEN NOT keyed THEN clean_key ELSE NULL END/);
    assert.match(sql, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.post_cross_ledger_transfer/);
    assert.match(sql, /TO service_role/);
    assert.doesNotMatch(sql, /UPDATE public\.folio_transactions/);
    assert.doesNotMatch(sql, /DELETE FROM public\.folio_transactions/);
    assert.doesNotMatch(sql, /financial_transfer_operations/);
    assert.doesNotMatch(sql, /charge_snapshot/);
  });

  it("rejects folio pairs, account pairs, master accounts, and unknown targets", () => {
    assert.match(sql, /TRANSFER_FOLIO_PAIR/);
    assert.match(sql, /TRANSFER_ACCOUNT_TO_ACCOUNT/);
    assert.match(sql, /INVALID_TRANSFER_TARGET/);
    assert.match(sql, /ACCOUNT_KIND_NOT_TRANSFERABLE/);
    assert.match(sql, /account_kind NOT IN \('company', 'group'\)/);
    assert.doesNotMatch(sql, /'outlet'/);
    assert.doesNotMatch(sql, /'department'/);
    assert.equal(BILLING_ROUTING_EXECUTABLE, false);
  });

  it("blocks an issued source folio, a currency mismatch, and a company credit overrun", () => {
    assert.match(sql, /guest_folio_invoices/);
    assert.match(sql, /TRANSFER_INVOICED/);
    assert.match(sql, /TRANSFER_CURRENCY_MISMATCH/);
    assert.match(sql, /source_folio\.status <> 'open'/);
    assert.match(sql, /dest_folio\.status <> 'open'/);
    assert.match(sql, /source_account\.status <> 'open'/);
    assert.match(sql, /dest_account\.status <> 'open'/);
    assert.match(sql, /CREDIT_LIMIT_EXCEEDED/);
    assert.match(sql, /dest_account\.account_kind = 'company'/);
    assert.match(sql, /financial_account_balance/);
    assert.match(sql, /credit_limit_amount/);
    assert.doesNotMatch(sql, /account_kind = 'group'[\s\S]{0,180}CREDIT_LIMIT_EXCEEDED/);
  });

  it("keeps guest-to-guest on its own writer and still rejects transfer types on account posting", () => {
    assert.match(functions, /export const postFolioTransfer/);
    assert.match(functions, /export const postCrossLedgerTransfer/);
    assert.match(functions, /requireCashierManager/);
    assert.match(functions, /post_cross_ledger_transfer/);
    assert.match(functions, /listFinancialAccountCharges/);
    assert.match(
      accountPoster,
      /IF _type NOT IN \('charge','payment','deposit','refund','adjustment','discount'\)/,
    );
    assert.match(accountPoster, /INVALID_TRANSACTION_TYPE/);
    assert.match(dialog, /postFolioTransfer/);
    assert.match(dialog, /sourceType: "guest_folio"/);
    assert.match(dialog, /destinationType: "financial_account"/);
    assert.match(dialog, /Linked to this stay/);
    assert.match(dialog, /\["guest_folio", "Guest Folio"\]/);
    assert.match(dialog, /\["company", "Company"\]/);
    assert.match(dialog, /\["group", "Group"\]/);
    assert.doesNotMatch(dialog, /\["outlet"/);
    assert.doesNotMatch(dialog, /\["department"/);
    assert.match(accountDialog, /sourceType: "financial_account"/);
    assert.match(accountDialog, /destinationType: "guest_folio"/);
  });
});
