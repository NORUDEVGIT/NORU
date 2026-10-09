import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  filterTenderRows,
  projectedFolioBalance,
  tenderDisplayState,
} from "./cashiering-tender-state.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("payments and deposits workspace", () => {
  const panel = read("../components/cashiering/folio-workspace-panels.tsx");
  const dialogs = read("../components/cashiering/folio-dialogs.tsx");
  const sql = read("../../../../supabase/migrations/0135_cashiering_phase4_tax_on_post.sql");
  const depositSql = read(
    "../../../../supabase/migrations/0129_cashiering_phase9_deposit_allocations.sql",
  );

  it("projects a payment against the current balance, including a credit", () => {
    assert.equal(projectedFolioBalance(500, 200), 300);
    assert.equal(projectedFolioBalance(500, 500), 0);
    assert.equal(projectedFolioBalance(500, 1000), -500);
    assert.equal(projectedFolioBalance(500, Number.NaN), 500);
  });

  it("derives payment and deposit states from refunds and allocations", () => {
    const payment = { id: "pay", type: "payment", amount: -100 };
    assert.equal(tenderDisplayState(payment, []), "Posted");
    assert.equal(
      tenderDisplayState(payment, [{ type: "refund", amount: 40, originalTransactionId: "pay" }]),
      "Partially refunded",
    );
    assert.equal(
      tenderDisplayState(payment, [{ type: "refund", amount: 100, originalTransactionId: "pay" }]),
      "Refunded",
    );

    const deposit = { id: "dep", type: "deposit", amount: -200 };
    const line = { received: 200, applied: 0, available: 200 };
    assert.equal(tenderDisplayState(deposit, [], line), "Unapplied");
    assert.equal(
      tenderDisplayState(deposit, [], { received: 200, applied: 80, available: 120 }),
      "Partially applied",
    );
    assert.equal(
      tenderDisplayState(deposit, [], { received: 200, applied: 200, available: 0 }),
      "Fully applied",
    );
    assert.equal(
      tenderDisplayState(deposit, [{ type: "refund", amount: 200, originalTransactionId: "dep" }], {
        received: 200,
        applied: 0,
        available: 0,
      }),
      "Refunded",
    );
  });

  it("filters the tender list by type, date, and notes", () => {
    const rows = [
      {
        type: "payment",
        description: "Front desk cash",
        paymentMethod: "cash",
        postedBy: "Ada",
        postedAt: "2026-10-01T10:00:00.000Z",
      },
      {
        type: "deposit",
        description: "Check-in deposit",
        paymentMethod: "card",
        postedBy: "Bea",
        postedAt: "2026-10-06T10:00:00.000Z",
      },
      {
        type: "refund",
        description: "Returned cash",
        paymentMethod: "cash",
        postedBy: "Ada",
        postedAt: "2026-10-08T10:00:00.000Z",
      },
      {
        type: "charge",
        description: "Room",
        paymentMethod: null,
        postedBy: "Ada",
        postedAt: "2026-10-06T10:00:00.000Z",
      },
    ];
    assert.equal(filterTenderRows(rows, { search: "", type: "all", from: "", to: "" }).length, 3);
    assert.equal(
      filterTenderRows(rows, { search: "check-in", type: "all", from: "", to: "" })[0]?.type,
      "deposit",
    );
    assert.deepEqual(
      filterTenderRows(rows, {
        search: "",
        type: "refund",
        from: "2026-10-07",
        to: "2026-10-09",
      }).map((row) => row.type),
      ["refund"],
    );
  });

  it("keeps refund remainder and rejects a city-ledger tender on a guest folio", () => {
    const server = read("./cashiering.server.ts");
    assert.match(server, /export function remainingOnPaymentSource/);
    assert.match(server, /paid - prior/);
    const tenders = read("./pms-polish1-payment-admin.ts");
    assert.match(tenders, /TENDER_NOT_FOLIO/);
    assert.match(tenders, /city_ledger/);
    assert.match(tenders, /TENDER_NOT_ACTIVE/);
  });

  it("shows the supported workspace and leaves posting rules on the existing writers", () => {
    assert.match(panel, /Receive Payment/);
    assert.match(panel, /Record Deposit/);
    assert.match(panel, /Unapplied deposits/);
    assert.match(panel, /Apply deposit/);
    assert.match(panel, /Refund Payment/);
    assert.match(panel, /Refund Deposit/);
    assert.match(panel, /Guarantee Method/);
    assert.doesNotMatch(
      panel,
      /Send receipt|Received From|Allow overpayment|Expiry date|Print receipt/,
    );
    assert.match(dialogs, /Posting now/);
    assert.match(dialogs, /Projected balance/);
    assert.match(dialogs, /depositPolicySummary/);
    assert.doesNotMatch(dialogs, /setAmount\(depositPolicy/);
    const poster = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.post_folio_transaction"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.open_folio_for_reservation"),
    );
    assert.doesNotMatch(poster, /posted_at/);
    assert.match(poster, /ELSE -_amount/);
    assert.match(depositSql, /deposit_allocated/);
    assert.doesNotMatch(
      depositSql.slice(
        depositSql.indexOf("CREATE OR REPLACE FUNCTION public.allocate_folio_deposit"),
      ),
      /INSERT INTO public\.folio_transactions/,
    );
  });
});
