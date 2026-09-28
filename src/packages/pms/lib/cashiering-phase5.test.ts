import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { remainingOnPaymentSource } from "./cashiering.server.ts";

const sql = readFileSync(
  new URL(
    "../../../../drizzle/migrations/0113_cashiering_phase5_refund_source_cap.sql",
    import.meta.url,
  ),
  "utf8",
);
const supabaseSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/0113_cashiering_phase5_refund_source_cap.sql",
    import.meta.url,
  ),
  "utf8",
);
const poster = readFileSync(new URL("./cashiering.functions.ts", import.meta.url), "utf8");
const dialogs = readFileSync(
  new URL("../components/cashiering/folio-dialogs.tsx", import.meta.url),
  "utf8",
);
const checkout = readFileSync(
  new URL("../components/frontoffice/fo-check-out-stepper.tsx", import.meta.url),
  "utf8",
);

describe("Cashiering Phase 5 refunds and authorization", () => {
  it("rejects a refund above the remainder of the source payment", () => {
    const payment = { id: "pay-1", type: "payment", amount: -100 };
    const lines = [{ type: "refund", amount: 40, originalTransactionId: "pay-1" }];
    assert.equal(remainingOnPaymentSource(payment, lines), 60);
    assert.equal(remainingOnPaymentSource(payment, []), 100);
    assert.equal(
      remainingOnPaymentSource(payment, [
        ...lines,
        { type: "refund", amount: 60, originalTransactionId: "pay-1" },
      ]),
      0,
    );

    assert.equal(sql, supabaseSql);
    assert.match(sql, /REFUND_EXCEEDS_SOURCE/);
    assert.match(sql, /-source\.amount - linked/);
    assert.match(sql, /SOURCE_REQUIRED/);
    assert.doesNotMatch(sql, /UPDATE public\.folio_transactions/);
    assert.doesNotMatch(sql, /pms_approval_requests/);
    assert.doesNotMatch(sql, /guest_folios\.balance/);
  });

  it("keeps the owner or manager gate and does not write an approval request", () => {
    const entry = poster.slice(
      poster.indexOf("export const postFolioEntry"),
      poster.indexOf("export const closeFolio"),
    );
    assert.match(entry, /requireCashierManager/);
    assert.match(entry, /data\.type === "payment" \|\| data\.type === "deposit"/);
    assert.match(entry, /remainingOnPaymentSource/);
    assert.match(entry, /membershipId: me\.id/);
    assert.doesNotMatch(entry, /\.update\(/);
    assert.doesNotMatch(poster, /pms_approval_requests/);
    assert.doesNotMatch(dialogs, /pending approval|approved by workflow/i);
    assert.match(dialogs, /Remaining on this payment/);
    assert.match(dialogs, /Only an owner or manager can post this correction/);
    assert.match(checkout, /cashieringRefundHref/);
    assert.doesNotMatch(checkout, /postFolioEntry/);
  });
});
