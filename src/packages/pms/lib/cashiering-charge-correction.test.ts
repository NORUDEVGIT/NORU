import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  allocateTransferShares,
  correctableGroupRemainder,
  type TransferLedgerRow,
} from "./cashiering-transfer-allocate.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const laundry: TransferLedgerRow[] = [
  { id: "parent", type: "charge", category: "manual", amount: 450 },
  { id: "tax", type: "charge", category: "tax", amount: 67.5, originalTransactionId: "parent" },
  {
    id: "service",
    type: "charge",
    category: "service_charge",
    amount: 22.5,
    originalTransactionId: "parent",
  },
];

describe("charge correction", () => {
  const sql = read("../../../../supabase/migrations/0142_cashiering_charge_correction.sql");
  const drizzle = read("../../../../drizzle/migrations/0142_cashiering_charge_correction.sql");
  const poster = read("./cashiering.functions.ts");
  const dialog = read("../components/cashiering/correct-charge-dialog.tsx");
  const sheet = read("../components/cashiering/charge-details-sheet.tsx");
  const page = read("../components/cashiering/guest-folio-page.tsx");
  const accountDialog = read("../components/cashiering/account-return-transfer-dialog.tsx");
  const phase4 = read("../../../../supabase/migrations/0135_cashiering_phase4_tax_on_post.sql");

  it("keeps the correction SQL dual-lane and append-only", () => {
    assert.equal(sql, drizzle);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.preview_folio_charge_correction/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.post_folio_charge_correction/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.correctable_charge_remainder/);
    assert.match(sql, /allocate_transfer_shares/);
    assert.match(sql, /original_transaction_id/);
    assert.match(sql, /CASE WHEN NOT keyed THEN clean_key ELSE NULL END/);
    assert.match(sql, /IDEMPOTENCY_KEY_REUSED/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.post_folio_charge_correction/);
    assert.match(sql, /TO service_role/);
    assert.doesNotMatch(sql, /UPDATE public\.folio_transactions/);
    assert.doesNotMatch(sql, /DELETE FROM public\.folio_transactions/);
    assert.doesNotMatch(sql, /void/);
    assert.doesNotMatch(sql, /pms_taxes|pms_service_charges|preview_folio_charge\(/);
    assert.doesNotMatch(sql, /credit_limit/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.post_folio_transfer/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.post_folio_transaction/);
  });

  it("blocks children, invoices, closed folios, and a changed remainder", () => {
    assert.match(sql, /CORRECTION_CHILD_NOT_ALLOWED/);
    assert.match(sql, /CORRECTION_INVOICED/);
    assert.match(sql, /guest_folio_invoices/);
    assert.match(sql, /FOLIO_CLOSED/);
    assert.match(sql, /CORRECTION_EXCEEDS_REMAINDER/);
    assert.match(sql, /CORRECTION_AMOUNT_CHANGED/);
    assert.match(sql, /QUANTITY_NOT_AVAILABLE/);
    assert.match(sql, /account_kind NOT IN \('company', 'group'\)/);
    assert.match(sql, /WHEN _mode = 'discount' THEN 'discount' ELSE 'adjustment'/);
    const replay = sql.indexOf("idempotency_key = clean_key");
    const rebuild = sql.indexOf("plan := public.build_folio_charge_correction");
    assert.ok(replay > 0 && rebuild > replay);
  });

  it("keeps refunds on post_folio_transaction and posts corrections through the new writer", () => {
    assert.match(phase4, /IF _type = 'refund'/);
    assert.match(phase4, /SOURCE_NOT_A_PAYMENT/);
    assert.match(poster, /export const postFolioEntry/);
    assert.match(poster, /export const previewFolioChargeCorrection/);
    assert.match(poster, /export const postFolioChargeCorrection/);
    assert.match(poster, /preview_folio_charge_correction/);
    assert.match(poster, /post_folio_charge_correction/);
    assert.match(poster, /requireCashierManager/);
    assert.match(poster, /description: z\.string\(\)\.min\(1\)\.max\(200\)/);
  });

  it("splits a 100 gross reduction and a full laundry reversal with the transfer allocator", () => {
    const components = [
      { id: "parent", remaining: 450 },
      { id: "tax", remaining: 67.5 },
      { id: "service", remaining: 22.5 },
    ];
    const partial = allocateTransferShares(components, 100);
    assert.deepEqual(
      partial.map((share) => share.share),
      [83.33, 12.5, 4.17],
    );
    assert.equal(
      partial.reduce((sum, share) => sum + share.share, 0),
      100,
    );
    const full = allocateTransferShares(components, 540);
    assert.deepEqual(
      full.map((share) => share.share),
      [450, 67.5, 22.5],
    );
  });

  it("derives a quantity change from the frozen net, then the frozen children", () => {
    const net = Math.round((3 - 2) * 150 * 100) / 100;
    const childGross = Math.round((((67.5 + 22.5) * net) / 450) * 100) / 100;
    const children = allocateTransferShares(
      [
        { id: "tax", remaining: 67.5 },
        { id: "service", remaining: 22.5 },
      ],
      childGross,
    );
    assert.equal(net, 150);
    assert.equal(childGross, 30);
    assert.deepEqual(
      children.map((share) => share.share),
      [22.5, 7.5],
    );
    assert.equal(net + childGross, 180);
    assert.match(sql, /\(parent\.quantity - new_qty\) \* parent\.unit_amount/);
    assert.match(dialog, /quantity != null && unitAmount != null && quantity > 1/);
  });

  it("caps a transferred laundry group at the unmoved remainder", () => {
    const moved: TransferLedgerRow[] = [
      ...laundry,
      {
        id: "out-parent",
        type: "transfer_out",
        category: "transfer",
        amount: -150,
        originalTransactionId: "parent",
      },
      {
        id: "out-tax",
        type: "transfer_out",
        category: "transfer",
        amount: -22.5,
        originalTransactionId: "tax",
      },
      {
        id: "out-service",
        type: "transfer_out",
        category: "transfer",
        amount: -7.5,
        originalTransactionId: "service",
      },
    ];
    assert.deepEqual(correctableGroupRemainder("parent", moved), {
      parentRemaining: 300,
      taxRemaining: 45,
      serviceRemaining: 15,
      grossRemaining: 360,
    });
    assert.deepEqual(correctableGroupRemainder("tax", moved), {
      parentRemaining: 0,
      taxRemaining: 0,
      serviceRemaining: 0,
      grossRemaining: 0,
    });
    const discounted: TransferLedgerRow[] = [
      ...laundry,
      {
        id: "disc-parent",
        type: "discount",
        category: "discount",
        amount: -83.33,
        originalTransactionId: "parent",
      },
      {
        id: "disc-tax",
        type: "discount",
        category: "discount",
        amount: -12.5,
        originalTransactionId: "tax",
      },
      {
        id: "disc-service",
        type: "discount",
        category: "discount",
        amount: -4.17,
        originalTransactionId: "service",
      },
    ];
    assert.equal(correctableGroupRemainder("parent", discounted).grossRemaining, 440);
  });

  it("opens Correct Charge from the folio and from an account charge", () => {
    assert.match(sheet, /Correct Charge/);
    assert.doesNotMatch(sheet, /<input|Void|Post Adjustment|Apply Discount/);
    assert.match(dialog, /Posting now/);
    assert.match(dialog, /Reason \*/);
    assert.match(dialog, /Reverse Charge/);
    assert.match(dialog, /Apply Discount/);
    assert.match(dialog, /Post Adjustment/);
    assert.match(dialog, /wrong service/);
    assert.match(page, /allowReplacement/);
    assert.match(page, /setEntryType\("charge"\)/);
    assert.match(accountDialog, /CorrectChargeDialog/);
    assert.match(accountDialog, /allowReplacement=\{false\}/);
    assert.doesNotMatch(dialog, /credit_limit|Approval|Post Date|Remarks/);
  });
});
