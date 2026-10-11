import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { queryAccountPayments } from "./cashiering-account-payments.ts";
import type { AccountPaymentRow } from "./cashiering-account-payments.ts";
import {
  buildAccountHistory,
  buildAccountStatement,
  groupAccountLedger,
  queryAccountHistory,
  type AccountHistoryDocument,
  type AccountLedgerRow,
} from "./cashiering-account-history.ts";
import { propertyCalendarDate, propertyDayBounds } from "./cashiering-control.ts";
import { recentAccountActivity, type ActivityLine } from "./cashiering-account-workspace.ts";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const ACCOUNT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ZONE = "Africa/Addis_Ababa";

function row(
  partial: Partial<AccountLedgerRow> &
    Pick<AccountLedgerRow, "id" | "type" | "amount" | "postedAt">,
): AccountLedgerRow {
  return {
    category: partial.category ?? partial.type,
    description: partial.description ?? partial.type,
    postedByMembershipId: partial.postedByMembershipId ?? "mem-ada",
    paymentMethod: partial.paymentMethod ?? null,
    originalTransactionId: partial.originalTransactionId ?? null,
    referenceType: partial.referenceType ?? null,
    referenceId: partial.referenceId ?? null,
    transferId: partial.transferId ?? null,
    shiftId: partial.shiftId ?? null,
    currency: partial.currency ?? null,
    actorName: partial.actorName ?? null,
    ...partial,
  };
}

function baseAccount(extra?: {
  closedAt?: string | null;
  documents?: AccountHistoryDocument[];
  closes?: Array<{ id: string; occurredAt: string; actorMembershipId: string | null }>;
  rows?: AccountLedgerRow[];
}) {
  return buildAccountHistory({
    accountId: ACCOUNT,
    currency: "ETB",
    openedAt: "2026-10-01T06:00:00.000Z",
    closedAt: extra?.closedAt ?? null,
    createdByMembershipId: "mem-ada",
    rows: extra?.rows ?? [],
    documents: extra?.documents ?? [],
    closes: extra?.closes ?? [],
    actors: { "mem-ada": { name: "Ada Lovelace", role: "manager" } },
    folios: { "folio-1": { id: "folio-1", number: "GF-100", guestName: "Sam Guest" } },
    folioByTransfer: { "tr-1": "folio-1", "tr-2": "folio-1" },
  });
}

describe("financial account history and statement", () => {
  it("uses Addis local midnight, not the UTC calendar date", () => {
    const bounds = propertyDayBounds("2026-10-10", ZONE);
    assert.equal(bounds.startIso, "2026-10-09T21:00:00.000Z");
    assert.equal(bounds.endIso, "2026-10-10T21:00:00.000Z");
    assert.equal(propertyCalendarDate("2026-10-09T21:30:00.000Z", ZONE), "2026-10-10");
  });

  it("shows account open, one grouped charge, and no tax duplicate", () => {
    const events = baseAccount({
      rows: [
        row({
          id: "room",
          type: "charge",
          category: "room",
          description: "Room",
          amount: 5000,
          postedAt: "2026-10-02T08:00:00.000Z",
        }),
        row({
          id: "tax",
          type: "charge",
          category: "tax",
          description: "VAT",
          amount: 750,
          postedAt: "2026-10-02T08:00:01.000Z",
          originalTransactionId: "room",
        }),
        row({
          id: "svc",
          type: "charge",
          category: "service_charge",
          description: "Service",
          amount: 250,
          postedAt: "2026-10-02T08:00:01.000Z",
          originalTransactionId: "room",
        }),
      ],
    });
    assert.equal(events.filter((event) => event.eventType === "account_opened").length, 1);
    assert.equal(
      events.find((event) => event.eventType === "account_opened")?.actor.name,
      "Ada Lovelace",
    );
    const charges = events.filter((event) => event.eventType === "charge");
    assert.equal(charges.length, 1);
    assert.equal(charges[0]?.amount, 6000);
    assert.deepEqual(
      charges[0]?.breakdown.map((part) => part.label),
      ["Base", "Tax", "Service"],
    );
  });

  it("shows one transfer in and one transfer out", () => {
    const events = baseAccount({
      rows: [
        row({
          id: "in-p",
          type: "transfer_in",
          amount: 10000,
          postedAt: "2026-10-02T09:00:00.000Z",
          transferId: "tr-1",
          description: "Room",
        }),
        row({
          id: "in-t",
          type: "transfer_in",
          category: "tax",
          amount: 0,
          postedAt: "2026-10-02T09:00:01.000Z",
          transferId: "tr-1",
          description: "Room",
        }),
        row({
          id: "out-p",
          type: "transfer_out",
          amount: -4000,
          postedAt: "2026-10-03T09:00:00.000Z",
          transferId: "tr-2",
          description: "Room",
        }),
        row({
          id: "out-t",
          type: "transfer_out",
          amount: -500,
          postedAt: "2026-10-03T09:00:01.000Z",
          transferId: "tr-2",
          description: "Room",
        }),
      ],
    });
    const inbound = events.filter((event) => event.eventType === "transfer_in");
    const outbound = events.filter((event) => event.eventType === "transfer_out");
    assert.equal(inbound.length, 1);
    assert.equal(inbound[0]?.title, "Charge transferred from Guest Folio");
    assert.equal(inbound[0]?.amount, 10000);
    assert.equal(inbound[0]?.folio?.number, "GF-100");
    assert.equal(inbound[0]?.folio?.guestName, "Sam Guest");
    assert.equal(outbound.length, 1);
    assert.equal(outbound[0]?.title, "Charge returned to Guest Folio");
    assert.equal(outbound[0]?.amount, -4500);
  });

  it("links a refund to its payment and labels write-off, discount, and correction", () => {
    const events = baseAccount({
      rows: [
        row({
          id: "pay",
          type: "payment",
          amount: -6000,
          postedAt: "2026-10-04T09:00:00.000Z",
          paymentMethod: "cash",
          shiftId: "shift-1",
          description: "Received from Acme",
        }),
        row({
          id: "ref",
          type: "refund",
          amount: 1000,
          postedAt: "2026-10-04T10:00:00.000Z",
          paymentMethod: "cash",
          originalTransactionId: "pay",
          description: "Partial refund",
        }),
        row({
          id: "wo",
          type: "adjustment",
          amount: -5000,
          postedAt: "2026-10-05T09:00:00.000Z",
          referenceType: "settlement_write_off",
          description: "Settlement write-off: Authorized",
        }),
        row({
          id: "disc",
          type: "discount",
          amount: -200,
          postedAt: "2026-10-05T10:00:00.000Z",
          referenceType: "charge_discount",
          referenceId: "corr-1",
          description: "Rate discount",
        }),
        row({
          id: "disc-tax",
          type: "adjustment",
          amount: -30,
          postedAt: "2026-10-05T10:00:01.000Z",
          referenceType: "charge_discount",
          referenceId: "corr-1",
          description: "Rate discount tax",
        }),
        row({
          id: "rev",
          type: "adjustment",
          amount: -100,
          postedAt: "2026-10-05T11:00:00.000Z",
          referenceType: "charge_reversal",
          referenceId: "corr-2",
          description: "Reverse rest",
        }),
      ],
    });
    const payment = events.find((event) => event.eventType === "payment");
    const refund = events.find((event) => event.eventType === "refund");
    assert.equal(payment?.title, "Payment received");
    assert.equal(payment?.payment?.cashierShiftId, "shift-1");
    assert.equal(refund?.payment?.originalEventId, "tx:pay");
    assert.equal(events.find((event) => event.eventType === "write_off")?.title, "Write-off");
    assert.equal(events.filter((event) => event.eventType === "discount").length, 1);
    assert.equal(events.find((event) => event.eventType === "discount")?.amount, -230);
    assert.equal(
      events.find((event) => event.eventType === "correction")?.title,
      "Reverse remaining charge",
    );
  });

  it("includes issued documents and one account-close event", () => {
    const documents: AccountHistoryDocument[] = [
      {
        id: "inv-1",
        documentType: "invoice",
        number: "AINV-1",
        amount: 10000,
        issuedAt: "2026-10-02T12:00:00.000Z",
        issuedByMembershipId: "mem-ada",
      },
      {
        id: "cn-1",
        documentType: "credit_note",
        number: "CN-1",
        amount: -150,
        issuedAt: "2026-10-06T12:00:00.000Z",
        issuedByMembershipId: "mem-ada",
      },
      {
        id: "dn-1",
        documentType: "debit_note",
        number: "DN-1",
        amount: 80,
        issuedAt: "2026-10-06T13:00:00.000Z",
        issuedByMembershipId: null,
      },
    ];
    const events = baseAccount({
      closedAt: "2026-10-07T12:00:00.000Z",
      documents,
      closes: [
        { id: "hist-1", occurredAt: "2026-10-07T12:00:00.000Z", actorMembershipId: "mem-ada" },
        { id: "hist-2", occurredAt: "2026-10-07T12:05:00.000Z", actorMembershipId: "mem-ada" },
      ],
      rows: [
        row({
          id: "cn-a",
          type: "adjustment",
          amount: -100,
          postedAt: "2026-10-06T12:00:00.000Z",
          referenceType: "invoice_credit_note",
          referenceId: "cn-1",
          description: "Credit note CN-1",
        }),
        row({
          id: "cn-b",
          type: "adjustment",
          amount: -50,
          postedAt: "2026-10-06T12:00:01.000Z",
          referenceType: "invoice_credit_note",
          referenceId: "cn-1",
          description: "Credit note CN-1",
        }),
      ],
    });
    assert.equal(events.filter((event) => event.eventType === "invoice_issued").length, 1);
    assert.equal(events.filter((event) => event.eventType === "credit_note_issued").length, 1);
    assert.equal(events.filter((event) => event.eventType === "credit_note").length, 0);
    assert.equal(events.filter((event) => event.eventType === "debit_note_issued").length, 1);
    assert.equal(
      events.find((event) => event.eventType === "debit_note_issued")?.actor.name,
      "System",
    );
    assert.equal(events.filter((event) => event.eventType === "account_closed").length, 1);
    assert.equal(
      events.find((event) => event.eventType === "account_closed")?.eventId,
      "account-close:hist-1",
    );
    const missing = buildAccountHistory({
      accountId: ACCOUNT,
      currency: "ETB",
      openedAt: "2026-10-01T06:00:00.000Z",
      closedAt: null,
      createdByMembershipId: "mem-gone",
      rows: [],
      documents: [],
      closes: [],
      actors: {},
    });
    assert.equal(missing[0]?.actor.name, "Unknown user");
  });

  it("filters, searches, and pages without overlap", () => {
    const rows = Array.from({ length: 12 }, (_, index) =>
      row({
        id: `pay-${index.toString().padStart(2, "0")}`,
        type: "payment",
        amount: -10,
        postedAt: `2026-10-02T${String(index).padStart(2, "0")}:00:00.000Z`,
        description: index === 3 ? "Folio GF-100 Sam Guest" : "Payment",
        paymentMethod: index === 1 ? "card" : "cash",
      }),
    );
    const events = baseAccount({ rows });
    const first = queryAccountHistory(events, {
      timezone: ZONE,
      page: 1,
      pageSize: 10,
      sort: "newest",
    });
    const second = queryAccountHistory(events, {
      timezone: ZONE,
      page: 2,
      pageSize: 10,
      sort: "newest",
    });
    assert.equal(first.rows.length, 10);
    assert.equal(second.rows.length, 3);
    const ids = new Set([...first.rows, ...second.rows].map((event) => event.eventId));
    assert.equal(ids.size, 13);
    const charges = queryAccountHistory(events, { timezone: ZONE, eventType: "payments" });
    assert.equal(charges.total, 12);
    const found = queryAccountHistory(events, { timezone: ZONE, search: "sam guest" });
    assert.equal(found.total, 1);
    const local = queryAccountHistory(events, {
      timezone: ZONE,
      from: "2026-10-10",
      to: "2026-10-10",
    });
    assert.equal(local.total, 0);
    const boundary = baseAccount({
      rows: [
        row({ id: "edge", type: "payment", amount: -5, postedAt: "2026-10-09T21:30:00.000Z" }),
      ],
    });
    assert.equal(
      queryAccountHistory(boundary, { timezone: ZONE, from: "2026-10-10", to: "2026-10-10" }).total,
      1,
    );
    assert.equal(
      queryAccountHistory(boundary, { timezone: "UTC", from: "2026-10-09", to: "2026-10-09" })
        .total,
      1,
    );
  });

  it("keeps a closed account readable and ignores profile history", () => {
    const events = baseAccount({ closedAt: "2026-10-08T00:00:00.000Z" });
    assert.equal(
      events.some((event) => event.eventType === "account_closed"),
      true,
    );
    const reader = read("./cashiering-account-history.functions.ts");
    assert.match(reader, /requireCashieringAccess/);
    assert.doesNotMatch(reader, /requireCashierManager/);
    assert.doesNotMatch(reader, /guest_profile_history|company phone|tin changed/i);
    assert.match(reader, /listFinancialAccountHistory/);
    assert.match(reader, /getFinancialAccountStatement/);
  });

  it("reconciles opening, movements, and closing to the ledger", () => {
    const rows = [
      row({
        id: "old",
        type: "charge",
        amount: 20000,
        postedAt: "2026-09-15T08:00:00.000Z",
        description: "Earlier",
      }),
      row({
        id: "room",
        type: "charge",
        amount: 5000,
        postedAt: "2026-10-10T08:00:00.000Z",
        description: "Room",
      }),
      row({
        id: "tax",
        type: "charge",
        category: "tax",
        amount: 1000,
        postedAt: "2026-10-10T08:00:01.000Z",
        originalTransactionId: "room",
      }),
      row({
        id: "in",
        type: "transfer_in",
        amount: 10000,
        postedAt: "2026-10-10T09:00:00.000Z",
        transferId: "tr-1",
      }),
      row({
        id: "out",
        type: "transfer_out",
        amount: -1000,
        postedAt: "2026-10-11T09:00:00.000Z",
        transferId: "tr-2",
      }),
      row({
        id: "pay",
        type: "payment",
        amount: -6000,
        postedAt: "2026-10-11T10:00:00.000Z",
        paymentMethod: "bank_transfer",
      }),
      row({
        id: "ref",
        type: "refund",
        amount: 1000,
        postedAt: "2026-10-11T11:00:00.000Z",
        originalTransactionId: "pay",
      }),
      row({
        id: "wo",
        type: "adjustment",
        amount: -500,
        postedAt: "2026-10-12T09:00:00.000Z",
        referenceType: "settlement_write_off",
        description: "Settlement write-off: reason",
      }),
      row({
        id: "disc",
        type: "discount",
        amount: -200,
        postedAt: "2026-10-12T10:00:00.000Z",
        description: "Discount",
      }),
      row({
        id: "up",
        type: "adjustment",
        amount: 40,
        postedAt: "2026-10-12T11:00:00.000Z",
        description: "Positive adjustment",
      }),
      row({
        id: "down",
        type: "adjustment",
        amount: -15,
        postedAt: "2026-10-12T12:00:00.000Z",
        description: "Negative adjustment",
      }),
      row({
        id: "edge",
        type: "charge",
        amount: 25,
        postedAt: "2026-10-09T21:30:00.000Z",
        description: "Local Oct 10",
      }),
    ];
    const statement = buildAccountStatement({
      currency: "ETB",
      timezone: ZONE,
      fromDate: "2026-10-10",
      toDate: "2026-10-12",
      rows,
      folios: { "folio-1": { id: "folio-1", number: "GF-100", guestName: "Sam Guest" } },
      folioByTransfer: { "tr-1": "folio-1", "tr-2": "folio-1" },
    });
    assert.equal(statement.openingBalance, 20000);
    assert.equal(
      statement.lines.find((line) => line.eventType === "charge" && line.description === "Room")
        ?.amount,
      6000,
    );
    assert.equal(statement.lines.filter((line) => line.description === "VAT").length, 0);
    assert.equal(statement.totals.transfersIn, 10000);
    assert.equal(statement.totals.transfersOut, -1000);
    assert.equal(statement.totals.payments, -6000);
    assert.equal(statement.totals.refunds, 1000);
    assert.equal(statement.totals.writeOffs, -500);
    assert.equal(statement.totals.discounts, -200);
    assert.equal(statement.reconciled, true);
    assert.equal(statement.lines.at(-1)?.runningBalance, statement.closingBalance);
    assert.equal(statement.closingBalance, statement.openingBalance + statement.netMovement);
    assert.equal(
      statement.lines.some((line) => line.eventType === ("invoice_issued" as never)),
      false,
    );
    const edge = statement.lines.find((line) => line.description === "Local Oct 10");
    assert.equal(edge?.amount, 25);
  });

  it("counts a credit note once and leaves a document-only debit note off the statement", () => {
    const rows = [
      row({ id: "room", type: "charge", amount: 1000, postedAt: "2026-10-10T08:00:00.000Z" }),
      row({
        id: "cn-a",
        type: "adjustment",
        amount: -100,
        postedAt: "2026-10-10T09:00:00.000Z",
        referenceType: "invoice_credit_note",
        referenceId: "cn-1",
      }),
      row({
        id: "cn-b",
        type: "adjustment",
        amount: -50,
        postedAt: "2026-10-10T09:00:01.000Z",
        referenceType: "invoice_credit_note",
        referenceId: "cn-1",
      }),
    ];
    const statement = buildAccountStatement({
      currency: "ETB",
      timezone: ZONE,
      fromDate: "2026-10-10",
      toDate: "2026-10-10",
      rows,
      documentNumbers: { "cn-1": "CN-1" },
    });
    const credits = statement.lines.filter((line) => line.eventType === "credit_note");
    assert.equal(credits.length, 1);
    assert.equal(credits[0]?.amount, -150);
    assert.equal(statement.netMovement, 850);
    assert.equal(statement.reconciled, true);
    const history = baseAccount({
      rows,
      documents: [
        {
          id: "inv-1",
          documentType: "invoice",
          number: "AINV-1",
          amount: 1000,
          issuedAt: "2026-10-10T08:30:00.000Z",
          issuedByMembershipId: "mem-ada",
        },
        {
          id: "cn-1",
          documentType: "credit_note",
          number: "CN-1",
          amount: -150,
          issuedAt: "2026-10-10T09:00:00.000Z",
          issuedByMembershipId: "mem-ada",
        },
        {
          id: "dn-1",
          documentType: "debit_note",
          number: "DN-1",
          amount: 80,
          issuedAt: "2026-10-10T10:00:00.000Z",
          issuedByMembershipId: "mem-ada",
        },
      ],
    });
    assert.equal(history.filter((event) => event.eventType === "invoice_issued").length, 1);
    assert.equal(history.filter((event) => event.eventType === "debit_note_issued").length, 1);
    assert.equal(
      statement.lines.some((line) => line.title === "Debit note issued"),
      false,
    );
    assert.equal(
      statement.lines.some((line) => line.title === "Invoice issued"),
      false,
    );
  });

  it("supports a credit balance, an empty period, and the full ledger as closing", () => {
    const rows = [
      row({ id: "pay", type: "payment", amount: -5000, postedAt: "2026-10-10T08:00:00.000Z" }),
    ];
    const credit = buildAccountStatement({
      currency: "ETB",
      timezone: ZONE,
      fromDate: "2026-10-10",
      toDate: "2026-10-10",
      rows,
    });
    assert.equal(credit.openingBalance, 0);
    assert.equal(credit.closingBalance, -5000);
    assert.equal(credit.reconciled, true);
    const empty = buildAccountStatement({
      currency: "ETB",
      timezone: ZONE,
      fromDate: "2026-10-11",
      toDate: "2026-10-11",
      rows,
    });
    assert.equal(empty.openingBalance, -5000);
    assert.equal(empty.closingBalance, -5000);
    assert.equal(empty.lines.length, 0);
    const lifetime = buildAccountStatement({
      currency: "ETB",
      timezone: ZONE,
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
      rows,
    });
    assert.equal(lifetime.closingBalance, -5000);
    const flagged = buildAccountStatement({
      currency: "ETB",
      timezone: ZONE,
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
      closedAt: "2026-10-09T00:00:00.000Z",
      rows,
    });
    assert.equal(flagged.activityAfterClose, true);
    assert.equal(flagged.lines.length, 1);
  });

  it("walks the sample account without letting the invoice change the balance", () => {
    const rows = [
      row({
        id: "in",
        type: "transfer_in",
        amount: 10000,
        postedAt: "2026-10-02T09:00:00.000Z",
        transferId: "tr-1",
      }),
      row({ id: "pay", type: "payment", amount: -6000, postedAt: "2026-10-03T09:00:00.000Z" }),
      row({
        id: "ref",
        type: "refund",
        amount: 1000,
        postedAt: "2026-10-04T09:00:00.000Z",
        originalTransactionId: "pay",
      }),
      row({
        id: "wo",
        type: "adjustment",
        amount: -5000,
        postedAt: "2026-10-05T09:00:00.000Z",
        referenceType: "settlement_write_off",
        description: "Settlement write-off: Authorized",
      }),
    ];
    const history = baseAccount({
      closedAt: "2026-10-06T09:00:00.000Z",
      rows,
      documents: [
        {
          id: "inv-1",
          documentType: "invoice",
          number: "AINV-10",
          amount: 10000,
          issuedAt: "2026-10-02T10:00:00.000Z",
          issuedByMembershipId: "mem-ada",
        },
      ],
      closes: [
        { id: "hist-1", occurredAt: "2026-10-06T09:00:00.000Z", actorMembershipId: "mem-ada" },
      ],
    });
    assert.deepEqual(
      history.map((event) => event.eventType),
      [
        "account_opened",
        "transfer_in",
        "invoice_issued",
        "payment",
        "refund",
        "write_off",
        "account_closed",
      ],
    );
    const statement = buildAccountStatement({
      currency: "ETB",
      timezone: ZONE,
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
      rows,
    });
    assert.equal(statement.openingBalance, 0);
    assert.deepEqual(
      statement.lines.map((line) => line.amount),
      [10000, -6000, 1000, -5000],
    );
    assert.equal(statement.closingBalance, 0);
    assert.equal(statement.reconciled, true);
  });

  it("flags a currency that is not the account currency and keeps corrections chronological", () => {
    const rows = [
      row({
        id: "room",
        type: "charge",
        amount: 6000,
        postedAt: "2026-10-10T08:00:00.000Z",
        currency: "USD",
      }),
      row({
        id: "corr",
        type: "adjustment",
        amount: -1000,
        postedAt: "2026-10-10T09:00:00.000Z",
        referenceType: "charge_adjustment",
        referenceId: "g1",
        description: "Charge correction",
      }),
    ];
    const statement = buildAccountStatement({
      currency: "ETB",
      timezone: ZONE,
      fromDate: "2026-10-10",
      toDate: "2026-10-10",
      rows,
    });
    assert.equal(statement.currencyMismatch, true);
    assert.deepEqual(
      statement.lines.map((line) => line.amount),
      [6000, -1000],
    );
    assert.equal(groupAccountLedger(rows, "ETB")[1]?.title, "Charge correction");
  });

  it("uses the same property-local date for payments and shares charge grouping with overview", () => {
    const payment = {
      id: "edge",
      transactionType: "payment",
      postedAt: "2026-10-09T21:30:00.000Z",
      description: "Cash",
      actorId: null,
      actorName: null,
      paymentMethod: "cash",
      displayAmount: 5,
      ledgerAmount: -5,
      state: "posted",
      refundedAmount: 0,
      refundableAmount: 5,
      sourcePaymentId: null,
      shiftId: null,
      canRefund: false,
    } as AccountPaymentRow;
    const local = queryAccountPayments([payment], {
      from: "2026-10-10",
      to: "2026-10-10",
      timezone: ZONE,
    });
    const utc = queryAccountPayments([payment], {
      from: "2026-10-09",
      to: "2026-10-09",
      timezone: "UTC",
    });
    assert.equal(local.total, 1);
    assert.equal(utc.total, 1);
    const overview = recentAccountActivity([
      line({
        id: "room",
        type: "charge",
        category: "room",
        amount: 5000,
        postedAt: "2026-10-10T08:00:00.000Z",
      }),
      line({
        id: "tax",
        type: "charge",
        category: "tax",
        amount: 750,
        postedAt: "2026-10-10T08:00:01.000Z",
        originalTransactionId: "room",
      }),
      line({
        id: "svc",
        type: "charge",
        category: "service_charge",
        amount: 250,
        postedAt: "2026-10-10T08:00:01.000Z",
        originalTransactionId: "room",
      }),
    ]);
    assert.equal(overview.length, 1);
    assert.equal(overview[0]?.amount, 6000);
  });

  it("keeps history and statement UI off A/R language", () => {
    const history = read("../components/cashiering/financial-account-history-panel.tsx");
    const statement = read("../components/cashiering/financial-account-statement-panel.tsx");
    const workspace = read("../components/cashiering/financial-account-workspace.tsx");
    const payments = read("./cashiering-account-payments.ts");
    for (const source of [history, statement]) {
      assert.doesNotMatch(
        source,
        /Partially Paid|Outstanding|Overdue|A\/R|Aging|Due Date|31–60|61–90|90\+/i,
      );
      assert.doesNotMatch(source, /\bPaid\b/);
      assert.doesNotMatch(source, /Receive Payment|Write Off|Reopen|Allocate/);
    }
    assert.match(workspace, /FinancialAccountHistory/);
    assert.match(workspace, /FinancialAccountStatement/);
    assert.doesNotMatch(workspace, /Coming in the next Cashiering implementation phase/);
    assert.match(statement, /window\.print/);
    assert.match(payments, /propertyCalendarDate/);
    assert.doesNotMatch(payments, /postedAt\.slice\(0, 10\)/);
    assert.match(read("./cashiering-control.ts"), /propertyDayBounds/);
  });
});

function line(
  partial: Partial<ActivityLine> & Pick<ActivityLine, "id" | "type" | "amount" | "postedAt">,
): ActivityLine {
  return {
    category: partial.category ?? partial.type,
    description: partial.description ?? partial.type,
    actorName: partial.actorName ?? null,
    transferId: partial.transferId ?? null,
    originalTransactionId: partial.originalTransactionId ?? null,
    referenceType: partial.referenceType ?? null,
    sourceFolioId: partial.sourceFolioId ?? null,
    sourceFolioNumber: partial.sourceFolioNumber ?? null,
    ...partial,
  };
}
