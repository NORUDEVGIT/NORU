import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertPaidForReceipt,
  buildReceiptHeader,
  buildReceiptSnapshot,
  canOfferGuestReceipt,
  canSubmitReceiptEmail,
  choosePersistedSnapshot,
  isReprintCopy,
  nextReprintState,
  receiptEmailSubject,
  receiptProfileIncomplete,
  renderReceiptText,
  validateReceiptEmail,
  type RmReceiptSnapshot,
} from "./rm-receipts.ts";

const HOTEL_A = buildReceiptHeader({
  name: "Hotel A",
  address: "1 Harbour Walk",
  city: "Brighton",
  postcode: "BN1 1AA",
  phone: "01273 000000",
  email: "desk@hotela.example",
});

const HOTEL_B = buildReceiptHeader({
  name: "Hotel B",
  address: "9 Lake Road",
  city: "Keswick",
  phone: "017687 000000",
  email: "stay@hotelb.example",
});

function paidSnapshot(header = HOTEL_A, payable = 24): RmReceiptSnapshot {
  return buildReceiptSnapshot({
    header,
    orderNumber: 1042,
    paidAt: "2026-09-11T12:00:00Z",
    timezone: "Europe/London",
    currencyCode: "GBP",
    orderSource: "pos_counter",
    tableLabel: "Counter",
    billingMethod: "direct",
    lines: [{ name: "Flat white", quantity: 2, lineTotal: 8 }],
    merchandiseSubtotal: 20,
    discountAmount: 2,
    discountReason: "Staff courtesy",
    compAmount: 0,
    compReason: null,
    taxAmount: 3,
    taxInclusive: false,
    taxRate: 15,
    serviceAmount: 3,
    serviceEnabled: true,
    serviceRate: 10,
    payable,
    tenders: [{ method: "cash", amount: payable }],
    refunds: [],
  });
}

describe("unpaid block", () => {
  it("rejects a draft with no paid_at and no settlement method", () => {
    const decision = assertPaidForReceipt({
      paidAt: null,
      billingMethod: null,
      roomPosted: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "ORDER_UNPAID");
    assert.equal(canOfferGuestReceipt("unpaid"), false);
  });

  it("allows cash/card paid, room-posted and Complete (comped) sales", () => {
    assert.equal(
      assertPaidForReceipt({ paidAt: "2026-09-11T12:00:00Z", billingMethod: "direct", roomPosted: false }).ok,
      true,
    );
    assert.equal(
      assertPaidForReceipt({ paidAt: null, billingMethod: "room_charge", roomPosted: true }).ok,
      true,
    );
    assert.equal(
      assertPaidForReceipt({ paidAt: "2026-09-11T12:00:00Z", billingMethod: "comp", roomPosted: false }).ok,
      true,
    );
    assert.equal(canOfferGuestReceipt("paid"), true);
    assert.equal(canOfferGuestReceipt("refunded"), true);
  });
});

describe("snapshot immutability", () => {
  it("keeps the first snapshot when a second freeze is attempted", () => {
    const first = paidSnapshot(HOTEL_A, 24);
    const renamed = buildReceiptHeader({
      name: "Renamed after pay",
      address: "1 Harbour Walk",
      city: "Brighton",
      postcode: "BN1 1AA",
      phone: "01273 000000",
      email: "desk@hotela.example",
    });
    const mutated = paidSnapshot(renamed, 99);
    const choice = choosePersistedSnapshot(first, mutated);
    assert.equal(choice.wrote, false);
    assert.equal(choice.snapshot.totals.payable, 24);
    assert.equal(choice.snapshot.header.name, "Hotel A");
  });

  it("does not rebuild totals from a later live tax rate", () => {
    const stored = buildReceiptSnapshot({
      header: HOTEL_A,
      orderNumber: 7,
      paidAt: "2026-09-11T12:00:00Z",
      timezone: "Europe/London",
      currencyCode: "GBP",
      orderSource: "pos_counter",
      tableLabel: "Counter",
      billingMethod: "direct",
      lines: [{ name: "Soup", quantity: 1, lineTotal: 10 }],
      merchandiseSubtotal: 10,
      discountAmount: 0,
      discountReason: null,
      compAmount: 0,
      compReason: null,
      taxAmount: 1,
      taxInclusive: false,
      taxRate: 10,
      serviceAmount: 0,
      serviceEnabled: false,
      serviceRate: 0,
      payable: 11,
      tenders: [{ method: "card", amount: 11 }],
      refunds: [],
    });
    const liveTaxWouldHaveBeen = 20;
    assert.equal(stored.totals.taxRate, 10);
    assert.equal(stored.totals.taxAmount, 1);
    assert.equal(stored.totals.payable, 11);
    assert.notEqual(stored.totals.taxRate, liveTaxWouldHaveBeen);
  });

  it("writes only when nothing is stored yet", () => {
    const next = paidSnapshot();
    const choice = choosePersistedSnapshot(null, next);
    assert.equal(choice.wrote, true);
    assert.equal(choice.snapshot.sale.orderNumber, 1042);
  });
});

describe("reprint flag", () => {
  it("marks a later copy as reprint and bumps count/time", () => {
    assert.equal(isReprintCopy({ reprintCount: 0, mode: "original" }), false);
    assert.equal(isReprintCopy({ reprintCount: 0, mode: "reprint" }), true);
    assert.equal(isReprintCopy({ reprintCount: 2 }), true);
    const next = nextReprintState(0, "2026-09-11T13:00:00Z");
    assert.deepEqual(next, { reprintCount: 1, lastReprintedAt: "2026-09-11T13:00:00Z" });
    assert.match(renderReceiptText(paidSnapshot(), { reprint: true, reprintCount: 1 }), /REPRINT \/ DUPLICATE/);
  });
});

describe("email validation", () => {
  it("accepts a trimmed address and rejects blanks or junk", () => {
    assert.deepEqual(validateReceiptEmail("  guest@hotel.example  "), {
      ok: true,
      email: "guest@hotel.example",
    });
    const blank = validateReceiptEmail("   ");
    assert.equal(blank.ok, false);
    if (!blank.ok) assert.equal(blank.code, "INVALID_EMAIL");
    assert.equal(validateReceiptEmail("not-an-email").ok, false);
    assert.equal(canSubmitReceiptEmail({ email: "a@b.co", submitting: false }), true);
    assert.equal(canSubmitReceiptEmail({ email: "a@b.co", submitting: true }), false);
  });

  it("builds the guest subject from the frozen property name", () => {
    const snapshot = paidSnapshot(HOTEL_B);
    assert.equal(receiptEmailSubject(snapshot.header, snapshot.sale), "Hotel B · Sale #1042");
  });
});

describe("multi-tenant header isolation", () => {
  it("freezes Hotel A identity on Hotel A's sale and never Hotel B's", () => {
    const a = paidSnapshot(HOTEL_A);
    const b = paidSnapshot(HOTEL_B);
    assert.equal(a.header.name, "Hotel A");
    assert.equal(b.header.name, "Hotel B");
    assert.ok(a.header.addressLines.includes("1 Harbour Walk"));
    assert.ok(b.header.addressLines.includes("9 Lake Road"));
    assert.equal(a.header.email, "desk@hotela.example");
    assert.equal(b.header.email, "stay@hotelb.example");
    const leaked = choosePersistedSnapshot(a, b);
    assert.equal(leaked.snapshot.header.name, "Hotel A");
    assert.equal(leaked.snapshot.header.email, "desk@hotela.example");
  });

  it("omits missing profile fields instead of inventing them", () => {
    const sparse = buildReceiptHeader({ name: "Lake House" });
    assert.deepEqual(sparse.addressLines, []);
    assert.equal(sparse.phone, null);
    assert.equal(sparse.email, null);
    assert.equal(receiptProfileIncomplete(sparse), true);
    assert.equal(receiptProfileIncomplete(HOTEL_A), false);
  });
});
