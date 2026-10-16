import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildFinancialHistory,
  filterHistoryEvents,
  historyEventDetail,
  pageHistoryEvents,
  type HistoryBuildInput,
  type HistoryLedgerRow,
} from "./cashiering-transaction-history.ts";

function row(
  partial: Partial<HistoryLedgerRow> & Pick<HistoryLedgerRow, "id" | "type" | "amount">,
): HistoryLedgerRow {
  return {
    category: partial.type,
    description: partial.id,
    postedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-02T00:00:00.000Z",
    postedBy: "Ada",
    paymentMethod: null,
    originalTransactionId: null,
    referenceType: null,
    referenceId: null,
    transferId: null,
    quantity: null,
    unitAmount: null,
    chargeSource: null,
    departmentName: null,
    ...partial,
  };
}

function input(
  rows: HistoryLedgerRow[],
  extra: Partial<HistoryBuildInput> = {},
): HistoryBuildInput {
  return {
    rows,
    allocations: [],
    counterparts: {},
    coverage: { legacyInvoice: null, invoices: [], debitNotes: [], creditNotes: [] },
    access: { canManage: true, open: true },
    ...extra,
  };
}

const filterAll = { quick: "all" as const, from: "", to: "", method: "", actor: "", search: "" };

test("guest folio transaction history", async (t) => {
  await t.test("orders by posted time, then created time, and keeps the signed sum", () => {
    const events = buildFinancialHistory(
      input([
        row({
          id: "b",
          type: "charge",
          amount: 20,
          postedAt: "2026-01-02T00:00:00.000Z",
          createdAt: "2026-01-02T00:00:02.000Z",
        }),
        row({ id: "a", type: "charge", amount: 10, postedAt: "2026-01-01T00:00:00.000Z" }),
        row({
          id: "c",
          type: "payment",
          amount: -5,
          postedAt: "2026-01-02T00:00:00.000Z",
          createdAt: "2026-01-02T00:00:01.000Z",
          paymentMethod: "cash",
        }),
      ]),
    );
    assert.deepEqual(
      events.map((event) => event.id),
      ["a", "c", "b"],
    );
    assert.equal(events.at(-1)?.balanceAfter, 25);
    const newest = pageHistoryEvents(events, { page: 1, pageSize: 10, sort: "newest" });
    assert.equal(newest.rows[0]?.id, "b");
    assert.equal(newest.rows.find((event) => event.id === "a")?.balanceAfter, 10);
  });

  await t.test("groups a charge with tax and service and moves the balance by the gross", () => {
    const events = buildFinancialHistory(
      input([
        row({
          id: "room",
          type: "charge",
          category: "room",
          amount: 1000,
          description: "Earlier",
          postedAt: "2026-01-01T00:00:00.000Z",
        }),
        row({
          id: "parent",
          type: "charge",
          category: "room",
          amount: 500,
          description: "Laundry",
          postedAt: "2026-01-02T00:00:00.000Z",
        }),
        row({
          id: "tax",
          type: "charge",
          category: "tax",
          amount: 75,
          originalTransactionId: "parent",
          postedAt: "2026-01-02T00:00:00.000Z",
          createdAt: "2026-01-02T00:00:03.000Z",
        }),
        row({
          id: "service",
          type: "charge",
          category: "service_charge",
          amount: 25,
          originalTransactionId: "parent",
          postedAt: "2026-01-02T00:00:00.000Z",
          createdAt: "2026-01-02T00:00:01.000Z",
        }),
      ]),
    );
    assert.equal(events.length, 2);
    const laundry = events.find((event) => event.id === "parent");
    assert.equal(laundry?.amount, 600);
    assert.equal(laundry?.balanceAfter, 1600);
    assert.equal(
      events.some((event) => event.id === "tax" || event.id === "service"),
      false,
    );
  });

  await t.test("keeps the same balance after a newest-first page and a filter", () => {
    const events = buildFinancialHistory(
      input([
        row({ id: "c1", type: "charge", amount: 100, postedAt: "2026-01-01T00:00:00.000Z" }),
        row({
          id: "p1",
          type: "payment",
          amount: -40,
          postedAt: "2026-01-02T00:00:00.000Z",
          paymentMethod: "card",
        }),
        row({ id: "c2", type: "charge", amount: 10, postedAt: "2026-01-03T00:00:00.000Z" }),
      ]),
    );
    const page = pageHistoryEvents(events, { page: 2, pageSize: 1, sort: "newest" });
    assert.equal(page.rows[0]?.id, "p1");
    assert.equal(page.rows[0]?.balanceAfter, 60);
    const filtered = filterHistoryEvents(events, { ...filterAll, quick: "charges" });
    assert.equal(filtered.find((event) => event.id === "c2")?.balanceAfter, 70);
    assert.equal(
      filtered.some((event) => event.kind === "payment"),
      false,
    );
  });

  await t.test(
    "derives payment refund state and deposit allocation without a balance change",
    () => {
      const events = buildFinancialHistory(
        input(
          [
            row({
              id: "pay",
              type: "payment",
              amount: -100,
              paymentMethod: "cash",
              description: "Received from Ada",
            }),
            row({
              id: "back",
              type: "refund",
              amount: 40,
              originalTransactionId: "pay",
              paymentMethod: "cash",
            }),
            row({
              id: "dep",
              type: "deposit",
              amount: -200,
              paymentMethod: "card",
              postedAt: "2026-01-03T00:00:00.000Z",
            }),
            row({
              id: "room",
              type: "charge",
              category: "room",
              amount: 200,
              description: "Room",
              postedAt: "2026-01-04T00:00:00.000Z",
            }),
          ],
          {
            allocations: [{ depositTransactionId: "dep", chargeTransactionId: "room", amount: 50 }],
          },
        ),
      );
      assert.equal(events.find((event) => event.id === "pay")?.state, "Partially refunded");
      assert.equal(events.find((event) => event.id === "dep")?.state, "Partially applied");
      assert.equal(
        events.some((event) => event.description.toLowerCase().includes("allocat")),
        false,
      );
      assert.equal(events.at(-1)?.balanceAfter, -60);
      const deposit = historyEventDetail(
        events.find((event) => event.id === "dep")!,
        input(
          [
            row({ id: "pay", type: "payment", amount: -100 }),
            row({ id: "back", type: "refund", amount: 40, originalTransactionId: "pay" }),
            row({ id: "dep", type: "deposit", amount: -200 }),
            row({ id: "room", type: "charge", category: "room", amount: 200, description: "Room" }),
          ],
          {
            allocations: [{ depositTransactionId: "dep", chargeTransactionId: "room", amount: 50 }],
          },
        ),
      );
      assert.equal(deposit.kind, "deposit");
      if (deposit.kind === "deposit") assert.equal(deposit.allocations[0]?.description, "Room");
    },
  );

  await t.test("groups transfer shares and credit-note components, and labels a write-off", () => {
    const events = buildFinancialHistory(
      input(
        [
          row({
            id: "out1",
            type: "transfer_out",
            category: "transfer",
            amount: -400,
            transferId: "T1",
            description: "To company",
          }),
          row({
            id: "out2",
            type: "transfer_out",
            category: "transfer",
            amount: -60,
            transferId: "T1",
            originalTransactionId: "tax",
          }),
          row({
            id: "cn1",
            type: "adjustment",
            amount: -10,
            referenceType: "invoice_credit_note",
            referenceId: "note-1",
            description: "Credit note CN-1",
            postedAt: "2026-01-03T00:00:00.000Z",
          }),
          row({
            id: "cn2",
            type: "adjustment",
            amount: -5,
            referenceType: "invoice_credit_note",
            referenceId: "note-1",
            description: "Credit note CN-1",
            postedAt: "2026-01-03T00:00:00.000Z",
          }),
          row({
            id: "wo",
            type: "adjustment",
            amount: -7,
            referenceType: "settlement_write_off",
            description: "Settlement write-off: goodwill",
            postedAt: "2026-01-04T00:00:00.000Z",
          }),
        ],
        {
          counterparts: { T1: { label: "Acme", folioId: null, accountId: "acct-1" } },
          coverage: {
            legacyInvoice: null,
            invoices: [],
            debitNotes: [],
            creditNotes: [{ id: "note-1", number: "CN-1", invoiceNumber: "INV-9" }],
          },
        },
      ),
    );
    assert.equal(events.filter((event) => event.kind === "transfer_out").length, 1);
    assert.equal(events.find((event) => event.kind === "transfer_out")?.amount, -460);
    assert.equal(events.find((event) => event.kind === "transfer_out")?.context, "Acme");
    assert.equal(events.filter((event) => event.kind === "credit_note").length, 1);
    assert.equal(events.find((event) => event.kind === "credit_note")?.amount, -15);
    assert.equal(
      events.some((event) => event.id === "cn1"),
      false,
    );
    assert.equal(events.find((event) => event.kind === "write_off")?.label, "Write-off");
    assert.equal(events.at(-1)?.balanceAfter, -482);
  });

  await t.test("does not add a debit note or invoice money row", () => {
    const events = buildFinancialHistory(
      input(
        [
          row({
            id: "parent",
            type: "charge",
            category: "room",
            amount: 80,
            description: "Minibar",
          }),
        ],
        {
          coverage: {
            legacyInvoice: null,
            invoices: [],
            debitNotes: [{ id: "dn", number: "DN-4", parentIds: ["parent"] }],
            creditNotes: [],
          },
        },
      ),
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.debitNoteNumber, "DN-4");
    assert.equal(
      events.some((event) => event.kind === "credit_note"),
      false,
    );
    const detail = historyEventDetail(
      events[0]!,
      input(
        [
          row({
            id: "parent",
            type: "charge",
            category: "room",
            amount: 80,
            description: "Minibar",
          }),
        ],
        {
          coverage: {
            legacyInvoice: null,
            invoices: [],
            debitNotes: [{ id: "dn", number: "DN-4", parentIds: ["parent"] }],
            creditNotes: [],
          },
        },
      ),
    );
    assert.equal(
      detail.lines.some((line) => line.includes("Billed via DN-4")),
      true,
    );
  });

  await t.test(
    "blocks correction on a legacy invoice and hides manager actions from a cashier or a closed folio",
    () => {
      const covered = buildFinancialHistory(
        input([row({ id: "parent", type: "charge", category: "room", amount: 80 })], {
          coverage: {
            legacyInvoice: { id: "inv", number: "INV-L" },
            invoices: [],
            debitNotes: [],
            creditNotes: [],
          },
        }),
      );
      assert.equal(covered[0]?.state, "Invoiced");
      assert.equal(covered[0]?.actions.correct, false);
      assert.equal(covered[0]?.actions.transfer, false);
      assert.equal(
        historyEventDetail(
          covered[0]!,
          input([row({ id: "parent", type: "charge", category: "room", amount: 80 })], {
            coverage: {
              legacyInvoice: { id: "inv", number: "INV-L" },
              invoices: [],
              debitNotes: [],
              creditNotes: [],
            },
          }),
        ).lines.some((line) => line.includes("legacy invoice INV-L")),
        true,
      );

      const cashier = buildFinancialHistory(
        input([row({ id: "pay", type: "payment", amount: -20, paymentMethod: "cash" })], {
          access: { canManage: false, open: true },
        }),
      );
      assert.equal(cashier[0]?.actions.refund, false);

      const closed = buildFinancialHistory(
        input([row({ id: "pay", type: "payment", amount: -20, paymentMethod: "cash" })], {
          access: { canManage: true, open: false },
        }),
      );
      assert.equal(closed[0]?.actions.refund, false);
      assert.equal(closed[0]?.postedBy, "Ada");
      const unnamed = buildFinancialHistory(
        input([
          row({ id: "pay2", type: "payment", amount: -1, postedBy: null, paymentMethod: "cash" }),
        ]),
      );
      assert.equal(unnamed[0]?.postedBy, null);
    },
  );

  await t.test("payment detail does not invent allocation", () => {
    const events = buildFinancialHistory(
      input([row({ id: "pay", type: "payment", amount: -20, paymentMethod: "cash" })]),
    );
    const detail = historyEventDetail(
      events[0]!,
      input([row({ id: "pay", type: "payment", amount: -20, paymentMethod: "cash" })]),
    );
    assert.equal(detail.kind, "payment");
    assert.equal("allocations" in detail, false);
  });

  await t.test("loads a folio and an account on separate owner keys", () => {
    const source = readFileSync(
      new URL("./cashiering-transaction-history.functions.ts", import.meta.url),
      "utf8",
    );
    const guest = source.slice(
      source.indexOf("async function loadGuestActivity"),
      source.indexOf("async function loadAccountActivity"),
    );
    const account = source.slice(source.indexOf("async function loadAccountLedger"));
    assert.match(guest, /\.eq\("folio_id", ownerId\)/);
    assert.doesNotMatch(guest, /financial_account_id/);
    assert.match(account, /\.eq\("financial_account_id", ownerId\)/);
    assert.doesNotMatch(account, /\.eq\("folio_id", ownerId\)/);
  });
});
