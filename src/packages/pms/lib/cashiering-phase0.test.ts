import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { folioReportsSettled } from "./cashiering.server.ts";
import { resolveStoredTender, TENDER_NONE_ACTIVE, TENDER_NOT_ACTIVE } from "./pms-polish1-payment-admin.ts";

const sql = readFileSync(
  new URL("../../../../drizzle/migrations/0110_cashiering_phase0_ledger_safety.sql", import.meta.url),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL("../../../../supabase/migrations/0110_cashiering_phase0_ledger_safety.sql", import.meta.url),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const checkout = readFileSync(new URL("./fo-check-out.functions.ts", import.meta.url), "utf8");
const checkin = readFileSync(new URL("./fo-check-in.functions.ts", import.meta.url), "utf8");
const cancel = readFileSync(new URL("./fo-cancel-noshow.functions.ts", import.meta.url), "utf8");
const amend = readFileSync(new URL("./fo-amendments.functions.ts", import.meta.url), "utf8");

describe("Cashiering Phase 0 ledger safety", () => {
  it("resolves an active tender before a row can exist", () => {
    assert.deepEqual(resolveStoredTender("card", ["card", "cash"]), { ok: true, stored: "card" });
    assert.deepEqual(resolveStoredTender("Visa", ["visa"]), { ok: true, stored: "other" });
    assert.equal(resolveStoredTender("cheque", ["card"]).ok, false);
    assert.equal(resolveStoredTender("cheque", ["card"]).ok ? "" : (resolveStoredTender("cheque", ["card"]) as { message: string }).message, TENDER_NOT_ACTIVE);
    assert.equal(resolveStoredTender("cash", []).ok, false);
    assert.match(TENDER_NONE_ACTIVE, /No active payment methods/);
    assert.equal(resolveStoredTender("cash", null).ok, true);
  });

  it("does not report an open override as settled", () => {
    assert.equal(folioReportsSettled({ status: "open", balance: 40, unsettledCheckout: true }), false);
    assert.equal(folioReportsSettled({ status: "open", balance: 0, unsettledCheckout: false }), false);
    assert.equal(folioReportsSettled({ status: "closed", balance: 0, unsettledCheckout: true }), false);
    assert.equal(folioReportsSettled({ status: "closed", balance: 0, unsettledCheckout: false }), true);
    assert.equal(folioReportsSettled({ status: "closed", balance: 12, unsettledCheckout: false }), false);
  });

  it("keeps the migration dual-lane and free of a stored folio balance", () => {
    assert.equal(sql, supabaseSql);
    assert.match(sql, /folio_transactions_no_mutation/);
    assert.match(sql, /FOLIO_TRANSACTION_IMMUTABLE/);
    assert.match(sql, /BEFORE UPDATE OR DELETE/);
    assert.match(sql, /folio_transactions_idempotency_key/);
    assert.match(sql, /idempotency_key = clean_key/);
    assert.match(sql, /RETURN txn/);
    assert.match(sql, /payment_method, idempotency_key/);
    assert.match(sql, /REFUND_EXCEEDS_SETTLED/);
    assert.match(sql, /BALANCE_NOT_ZERO|close_guest_folio/ );
    assert.doesNotMatch(sql, /guest_folios\.balance/);
    assert.doesNotMatch(sql, /ADD COLUMN[^;]*\bbalance\b/);
    assert.match(sql, /service_role is not exempt/);
    assert.match(sql, /unsettled_checkout/);
  });

  it("validates tender before insert and does not update a posted line", () => {
    const entry = poster.slice(poster.indexOf("export const postFolioEntry"));
    assert.ok(entry.indexOf("folioTenderFromCatalogue") < entry.indexOf("callPostFolioTransaction"));
    assert.doesNotMatch(poster, /\.update\(\{[\s\S]*payment_method/);
    assert.doesNotMatch(checkout, /\.update\(\{[\s\S]*payment_method/);
    assert.doesNotMatch(checkin, /\.update\(\{[\s\S]*payment_method/);
    const pay = checkout.slice(checkout.indexOf("export const postCheckOutPayment"), checkout.indexOf("export const overrideCheckOutSettlement"));
    const deposit = checkin.slice(checkin.indexOf("export const postCheckInDeposit"), checkin.indexOf("export const waiveCheckInDeposit"));
    assert.ok(pay.indexOf("folioTenderFromCatalogue") < pay.indexOf("callPostFolioTransaction"));
    assert.ok(deposit.indexOf("folioTenderFromCatalogue") < deposit.indexOf("callPostFolioTransaction"));
  });

  it("uses the Cashiering manager gate for FO charges", () => {
    const fee = cancel.slice(cancel.indexOf("export const postCancelOrNoShowFee"));
    assert.match(fee, /requireCashierManager/);
    assert.doesNotMatch(fee, /requireCashierOperator/);
    const service = amend.slice(amend.indexOf("export const addStayService"));
    assert.match(service, /requireCashierManager/);
    assert.doesNotMatch(service, /requireCashierOperator/);
  });

  it("records checkout override as an unsettled folio marker", () => {
    const override = checkout.slice(
      checkout.indexOf("export const overrideCheckOutSettlement"),
      checkout.indexOf("Thin close used at check-out"),
    );
    assert.match(override, /settlement_exception: "unsettled_checkout"/);
    assert.match(override, /checkout_unsettled_exception/);
    assert.match(override, /folio_status: "open"/);
    assert.doesNotMatch(override, /close_guest_folio/);
    const complete = checkout.slice(checkout.indexOf("export const completeFoCheckOut"));
    assert.match(complete, /folioSettled: folioReportsSettled/);
  });
});
