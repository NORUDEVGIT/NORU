import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  projectedFolioBalance,
  settlementCloseBlock,
  settlementPaymentDefault,
  summarizeFolioLedger,
  writeOffAmountAllowed,
} from "./cashiering-tender-state.ts";
import { folioTenderFromCatalogue, TENDER_NOT_FOLIO } from "./pms-polish1-payment-admin.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const caps = {
  hasInvoice: true,
  hasLines: true,
  invoiceSettingsAvailable: true,
  legacyFolioInvoice: false,
};

describe("guest folio settlement", () => {
  it("projects an exact, partial, and overpaid balance from the ledger", () => {
    assert.equal(settlementPaymentDefault(2000), 2000);
    assert.equal(settlementPaymentDefault(0), 0);
    assert.equal(settlementPaymentDefault(-40), 0);
    assert.equal(projectedFolioBalance(2000, 2000), 0);
    assert.equal(settlementCloseBlock(projectedFolioBalance(2000, 2000)), null);
    assert.equal(projectedFolioBalance(2000, 1500), 500);
    assert.equal(settlementCloseBlock(500), "Balance must be zero before closing.");
    assert.equal(projectedFolioBalance(2000, 2500), -500);
    assert.match(settlementCloseBlock(-500) ?? "", /Credit balance/);
  });

  it("keeps deposits, adjustments, tax, and service inside the posted balance", () => {
    const summary = summarizeFolioLedger([
      { type: "charge", category: "room", amount: 450 },
      { type: "charge", category: "tax", amount: 67.5 },
      { type: "charge", category: "service_charge", amount: 22.5 },
      { type: "deposit", category: "deposit", amount: -200 },
      { type: "adjustment", category: "adjustment", amount: -50 },
      { type: "payment", category: "payment", amount: -100 },
    ]);
    assert.equal(summary.tax, 67.5);
    assert.equal(summary.serviceCharge, 22.5);
    assert.equal(summary.adjustments, -50);
    assert.equal(summary.deposits, 200);
    assert.equal(summary.currentBalance, 190);
    assert.equal(summary.currentBalance, 450 + 67.5 + 22.5 - 200 - 50 - 100);
  });

  it("caps a write-off at the positive balance and does not treat it as a close", () => {
    assert.equal(writeOffAmountAllowed(2000, 2000), true);
    assert.equal(writeOffAmountAllowed(2000, 2000.02), false);
    assert.equal(writeOffAmountAllowed(0, 1), false);
    assert.equal(writeOffAmountAllowed(-20, 10), false);
    assert.equal(settlementCloseBlock(2000), "Balance must be zero before closing.");
    assert.equal(settlementCloseBlock(0), null);
  });

  it("lets a manager close a zero invoiced folio and keeps cashier off close and write-off", () => {
    const workspace = read("./folio-workspace.ts");
    const capsBody = workspace.slice(
      workspace.indexOf("export function folioCapabilities"),
      workspace.indexOf("export {", workspace.indexOf("export function folioCapabilities")),
    );
    assert.match(capsBody, /canClose: input\.canManage && input\.open && settled/);
    assert.match(
      capsBody,
      /canWriteOff: input\.canManage && input\.open && input\.balance > 0\.009/,
    );
    assert.match(capsBody, /canPostPayment: input\.canOperate && input\.open/);
    assert.doesNotMatch(capsBody, /canClose:.*hasInvoice/);
    assert.equal(caps.hasInvoice, true);
  });

  it("rejects city ledger as a guest settlement tender", () => {
    const city = folioTenderFromCatalogue("city", [
      { code: "city", typeClass: "city_ledger", active: true },
    ]);
    assert.equal(city.ok, false);
    if (!city.ok) assert.equal(city.message, TENDER_NOT_FOLIO);
  });

  it("keeps close, payment, and write-off on the existing writers", () => {
    const closeSql = read("../../../../supabase/migrations/20260908_noru_greenfield_schema.sql");
    const closeStart = closeSql.indexOf("FUNCTION public.close_guest_folio");
    const closeBody = closeSql.slice(
      closeStart,
      closeSql.indexOf("FUNCTION public.count_reserved_rooms", closeStart),
    );
    assert.match(closeBody, /abs\(balance\) >= 0\.01/);
    assert.match(closeBody, /BALANCE_NOT_ZERO/);
    assert.match(closeBody, /IF folio\.status = 'closed' THEN/);
    assert.doesNotMatch(closeBody, /pms_taxes|hotel_reservations|checked_out/);

    const postSql = read("../../../../supabase/migrations/0135_cashiering_phase4_tax_on_post.sql");
    const postStart = postSql.indexOf("FUNCTION public.post_folio_transaction");
    const postBody = postSql.slice(postStart, postStart + 12000);
    assert.match(postBody, /FOLIO_CLOSED/);
    assert.match(postBody, /clean_method = 'cash'/);
    assert.match(postBody, /hotel_cashier_shift_id/);
    assert.doesNotMatch(postBody, /RAISE EXCEPTION 'SHIFT_REQUIRED'/);

    const alloc = read(
      "../../../../supabase/migrations/0129_cashiering_phase9_deposit_allocations.sql",
    );
    const allocBody = alloc.slice(alloc.indexOf("FUNCTION public.allocate_folio_deposit"));
    assert.doesNotMatch(allocBody, /INSERT INTO public\.folio_transactions/);

    const panel = read("../components/cashiering/folio-workspace-panels.tsx");
    const settlement = panel.slice(panel.indexOf("export function SettlementTab"));
    assert.match(settlement, /postFolioEntry/);
    assert.match(settlement, /projectedFolioBalance/);
    assert.match(settlement, /Print statement/);
    assert.match(settlement, /onRefund/);
    assert.match(settlement, /onTransfer/);
    assert.doesNotMatch(settlement, /onGoTab/);
    assert.doesNotMatch(
      settlement,
      /settle_guest_folio|Guest Check-Out|Preview Receipt|Post pending charges|city_ledger|Split Payment/,
    );

    const writer = read("./cashiering.functions.ts");
    const payment = writer.slice(
      writer.indexOf("export const postFolioEntry"),
      writer.indexOf("export const closeFolio"),
    );
    assert.match(payment, /requireCashierOperator/);
    const close = writer.slice(
      writer.indexOf("export const closeFolio"),
      writer.indexOf("export const listCashierShifts"),
    );
    assert.match(close, /requireCashierManager/);
    assert.match(close, /close_guest_folio/);
    const phases = read("./cashiering-phases.functions.ts");
    const writeOff = phases.slice(phases.indexOf("export const postSettlementWriteOff"));
    assert.match(writeOff, /requireCashierManager/);
    assert.match(writeOff, /post_settlement_write_off/);
  });
});
